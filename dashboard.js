document.addEventListener('DOMContentLoaded', () => {
    // 1. Estado y Sesión
    const qslCode = localStorage.getItem('user_qsl_code');
    const userRole = localStorage.getItem('user_role');
    const userRealName = localStorage.getItem('user_real_name');

    if (!qslCode || !userRole) {
        window.location.href = 'index.html';
        return;
    }

    // Referencias UI
    const qslDisplay = document.getElementById('display-qsl');
    const logoutBtn = document.getElementById('logout-btn');
    const contentArea = document.getElementById('content-area');
    const sectionTitle = document.getElementById('section-title');
    const navItems = document.querySelectorAll('.nav-links li[data-section]');
    const dateDisplay = document.getElementById('current-date');

    let selectedPatientQSL = userRole === 'paciente' ? qslCode : null;

    // Inicialización
    updateUserDisplay();
    updateDate();
    if (userRole !== 'paciente' && window.syncAppointmentsFromCloud) {
        window.syncAppointmentsFromCloud();
    }
    if (userRole === 'paciente') {
        document.querySelector('.sidebar').style.display = 'none';
        document.querySelector('.top-bar').style.display = 'none';
        const mainContent = document.querySelector('.main-content');
        mainContent.style.justifyContent = 'flex-start'; // Permitir scroll sin cortar parte de arriba
        mainContent.style.alignItems = 'center';
        mainContent.style.padding = '20px';
        contentArea.style.width = '100%';
        contentArea.style.maxWidth = '650px';

        navItems.forEach(n => n.classList.remove('active'));
        loadSection('patient_portal');

        // Iniciar detector de alertas automático
        setInterval(checkAndShowAlerts, 10000);
        setTimeout(checkAndShowAlerts, 2000);
        
        // Iniciar detector de cola de turnos
        setInterval(() => { if(window.pollQueueNotifications) window.pollQueueNotifications(); }, 5000);
        setTimeout(() => { if(window.pollQueueNotifications) window.pollQueueNotifications(); }, 1000);
    } else {
        if (qslCode === 'MED-MASTER') {
            // Caso Programador: Solo ve el módulo de administración
            const progNav = document.getElementById('nav-programmer');
            if (progNav) progNav.style.display = 'block';
            
            // Ocultar secciones clínicas para el programador
            navItems.forEach(n => {
                const section = n.getAttribute('data-section');
                if (section === 'overview' || section === 'reminders' || section === 'consultation' || section === 'scheduler') {
                    n.style.display = 'none';
                }
            });
            
            navItems.forEach(n => n.classList.remove('active'));
            if (progNav) progNav.classList.add('active');
            loadSection('programmer');
        } else if (userRole === 'admin_general') {
            const adminNav = document.getElementById('nav-admin-general');
            if (adminNav) adminNav.style.display = 'block';
            
            // Ocultar secciones clínicas
            navItems.forEach(n => {
                const section = n.getAttribute('data-section');
                if (section === 'overview' || section === 'reminders' || section === 'consultation' || section === 'scheduler') {
                    n.style.display = 'none';
                }
            });
            
            navItems.forEach(n => n.classList.remove('active'));
            if (adminNav) adminNav.classList.add('active');
            loadSection('admin_general');
        } else {
            // Caso Médico regular: Ve secciones clínicas, no el módulo programador
            loadSection('consultation');
        }
    }

    function updateUserDisplay() {
        const name = localStorage.getItem('user_real_name') || qslCode;
        const activeCompany = JSON.parse(localStorage.getItem('active_company') || 'null');
        const companyBranding = activeCompany ? ` | ${activeCompany.nombre}` : '';
        
        qslDisplay.textContent = userRole === 'medico' ? (qslCode === 'MED-MASTER' ? `Admin: ${name}` : `Dr. ${name}${companyBranding}`) : `Paciente: ${name}`;
        
        // Actualizar etiquetas de la sidebar según el rol
        const sidebarLogoText = document.querySelector('.logo span');
        if (sidebarLogoText && activeCompany) {
            sidebarLogoText.textContent = activeCompany.nombre;
        }

        const settingsLabel = document.querySelector('li[data-section="settings"] span');
        if (settingsLabel) {
            settingsLabel.textContent = qslCode === 'MED-MASTER' ? 'Ajustes del Sistema' : 'Datos del Médico';
        }
    }

    // Navegación
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            if (userRole === 'medico' && (section === 'overview' || section === 'consultation')) {
                selectedPatientQSL = null;
            }
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            loadSection(section);
        });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('user_qsl_code');
        localStorage.removeItem('user_role');
        window.location.href = 'index.html';
    });

    // 2. Gestión de Datos Médico
    function getDocPatientsKey() {
        const id = localStorage.getItem('current_doctor_id');
        // Si entra como MASTER (fallback/admin genérico sin pacientes propios), usa global, sino su propio namespace
        return id === 'MED-MASTER' ? 'doctor_patients_list' : (id ? `doctor_patients_list_${id}` : 'doctor_patients_list');
    }
    async function syncPatientDataWithServer(qsl) {
        try {
            const resp = await fetch(`/api/patient/${qsl}`);
            const result = await resp.json();
            if (result.success) {
                localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(result.data));
                localStorage.setItem(`active_qsl_${qsl}`, result.alerts_enabled ? 'true' : 'false');
            }
        } catch (e) {
            console.error('Fetch error during sync:', e);
        }
    }

    // === SINCRONIZACIÓN EN TIEMPO REAL (cada 3s) ===
    // Trae la lista completa de pacientes desde Firestore y la fusiona en
    // localStorage. Si la "Lista de Pacientes" está abierta, la re-renderiza.
    let _syncInFlight = false;
    let _lastSyncTs = 0;
    async function syncPatientsFromCloud({ force = false } = {}) {
        if (_syncInFlight) return;
        _syncInFlight = true;
        try {
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            const since = force ? 0 : _lastSyncTs;
            const url = `/api/patients/list?doctor_id=${encodeURIComponent(doctor_id)}${since ? `&since=${since}` : ''}`;
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success) return;

            const key = getDocPatientsKey();
            const localList = JSON.parse(localStorage.getItem(key) || '[]');
            const localSet = new Set(localList);
            let registryChanged = false;
            let anyPatientChanged = false;

            for (const p of (result.patients || [])) {
                const qsl = p.qsl;
                if (!qsl) continue;
                // Datos completos
                const prevRaw = localStorage.getItem(`patient_data_${qsl}`);
                const nextRaw = JSON.stringify(p.data || {});
                if (prevRaw !== nextRaw) {
                    localStorage.setItem(`patient_data_${qsl}`, nextRaw);
                    anyPatientChanged = true;
                }
                if (p.nombre) {
                    const prevName = localStorage.getItem(`patient_name_${qsl}`);
                    if (prevName !== p.nombre) {
                        localStorage.setItem(`patient_name_${qsl}`, p.nombre);
                        anyPatientChanged = true;
                    }
                }
                localStorage.setItem(`active_qsl_${qsl}`, p.alerts_enabled ? 'true' : 'false');
                if (!localSet.has(qsl)) {
                    localList.push(qsl);
                    localSet.add(qsl);
                    registryChanged = true;
                }
            }

            if (registryChanged) {
                localStorage.setItem(key, JSON.stringify(localList));
            }

            if (typeof result.server_time === 'number') _lastSyncTs = result.server_time;

            // Si la lista de pacientes está abierta, refrescar UI
            if ((registryChanged || anyPatientChanged) && document.getElementById('patient-list-overlay')) {
                if (typeof window.showPatientList === 'function') {
                    const searchVal = document.getElementById('pl-search')?.value || '';
                    document.getElementById('patient-list-overlay').remove();
                    window.showPatientList();
                    const newSearch = document.getElementById('pl-search');
                    if (newSearch && searchVal) {
                        newSearch.value = searchVal;
                        if (typeof window._plFilter === 'function') window._plFilter(searchVal.toLowerCase());
                    }
                }
            }
        } catch (e) {
            console.warn('syncPatientsFromCloud:', e?.message || e);
        } finally {
            _syncInFlight = false;
        }
    }

    // Empuja al cloud todos los pacientes locales que aún no estén etiquetados
    // con doctor_id (migración de datos creados antes de la sync bidireccional).
    async function backfillLocalPatientsToCloud() {
        try {
            const key = getDocPatientsKey();
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            for (const qsl of list) {
                const raw = localStorage.getItem(`patient_data_${qsl}`);
                if (!raw) continue;
                let data;
                try { data = JSON.parse(raw); } catch { continue; }
                fetch(`/api/patient/${qsl}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data, doctor_id })
                }).catch(() => {});
            }
        } catch (e) { console.warn('backfill error:', e?.message || e); }
    }

    // Empuja al cloud todas las citas locales (recupera citas creadas
    // antes del fix de sync, o cuando un POST falló silenciosamente).
    async function backfillLocalAppointmentsToCloud() {
        try {
            const key = window.getAppointmentsKey ? window.getAppointmentsKey() : 'appointments_data';
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            if (!local.length) return;
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            // Obtenemos lo que ya está en cloud para no duplicar
            let cloudKeys = new Set();
            try {
                const r = await fetch(`/api/appointments?doctor_id=${encodeURIComponent(doctor_id)}`, { cache: 'no-store' });
                if (r.ok) {
                    const j = await r.json();
                    (j.appointments || []).forEach(a => {
                        const d = a.fecha ? String(a.fecha).slice(0, 10) : '';
                        cloudKeys.add(`${a.qsl_code}|${d}|${a.hora}`);
                    });
                }
            } catch (e) {}

            let pushed = 0;
            for (const a of local) {
                const k = `${a.qsl}|${a.date}|${a.time}`;
                if (cloudKeys.has(k)) continue;
                try {
                    await fetch('/api/appointments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            doctor_id,
                            qsl_code: a.qsl,
                            paciente_nombre: a.name,
                            fecha: a.date,
                            hora: a.time,
                            motivo: a.motivo || ''
                        })
                    });
                    pushed++;
                } catch (e) {}
            }
            if (pushed > 0) console.log(`[DR-SISDEL] Backfill citas: ${pushed} subidas al cloud`);
        } catch (e) { console.warn('backfill citas:', e?.message || e); }
    }

    // Helper: NO recargar automáticamente el Módulo Programador / Admin Central.
    // El sync sigue actualizando localStorage en background; los datos quedan
    // frescos para la próxima vez que el usuario navegue a esas secciones.
    // Esto evita reinicios molestos cada pocos segundos y pérdida de datos
    // si el usuario está editando un formulario.
    function _refreshAdminViewIfActive() {
        // No-op intencional. Si en el futuro se desea refresco automático,
        // habría que: (1) preservar el tab activo, (2) preservar valores
        // de inputs, (3) preservar scroll, (4) comparar contenido real.
        return;
    }

    // Crea una "firma" estable de un array de objetos ignorando timestamps
    // y campos volátiles que serializan diferente entre Admin SDK y Web SDK.
    function _stableFingerprint(arr) {
        try {
            return JSON.stringify((arr || []).map(o => {
                const clean = {};
                for (const k of Object.keys(o || {})) {
                    if (['created_at','updated_at','deleted_at','last_login','timestamp'].includes(k)) continue;
                    const v = o[k];
                    // Saltar objetos de Timestamp (tienen .seconds/.nanoseconds o .toMillis)
                    if (v && typeof v === 'object' && (typeof v.toMillis === 'function' || ('seconds' in v && 'nanoseconds' in v))) continue;
                    clean[k] = v;
                }
                return clean;
            }));
        } catch (e) {
            return JSON.stringify(arr || []);
        }
    }

    // === SINCRONIZACIÓN DE MÉDICOS ===
    async function syncMedicosFromCloud() {
        try {
            const resp = await fetch('/api/medicos', { cache: 'no-store' });
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success) return;
            const nextRaw = result.medicos || [];
            const next = JSON.stringify(nextRaw);
            const prev = localStorage.getItem('tabla_medicos');
            // Siempre guardamos la versión más reciente (para coherencia con
            // otras vistas), pero solo re-renderizamos cuando el contenido
            // significativo cambió (no por simples timestamps refrescados).
            if (prev !== next) {
                localStorage.setItem('tabla_medicos', next);
                const prevArr = (() => { try { return JSON.parse(prev || '[]'); } catch (e) { return []; } })();
                if (_stableFingerprint(prevArr) !== _stableFingerprint(nextRaw)) {
                    _refreshAdminViewIfActive();
                }
            }
        } catch (e) { console.warn('syncMedicos:', e?.message || e); }
    }

    // === SINCRONIZACIÓN DE CENTROS MÉDICOS ===
    async function syncCentrosFromCloud() {
        try {
            const resp = await fetch('/api/centros', { cache: 'no-store' });
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success) return;
            const nextRaw = result.centros || [];
            const next = JSON.stringify(nextRaw);
            const prev = localStorage.getItem('tabla_centros');
            if (prev !== next) {
                localStorage.setItem('tabla_centros', next);
                const prevArr = (() => { try { return JSON.parse(prev || '[]'); } catch (e) { return []; } })();
                if (_stableFingerprint(prevArr) !== _stableFingerprint(nextRaw)) {
                    _refreshAdminViewIfActive();
                }
            }
        } catch (e) { console.warn('syncCentros:', e?.message || e); }
    }

    // === SINCRONIZACIÓN DE CITAS / AGENDA ===
    async function syncAppointmentsFromCloud() {
        try {
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            const resp = await fetch(`/api/appointments?doctor_id=${encodeURIComponent(doctor_id)}`, { cache: 'no-store' });
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success) return;
            const cloud = (result.appointments || []).map(a => ({
                qsl: a.qsl_code,
                name: a.paciente_nombre,
                date: a.fecha ? String(a.fecha).slice(0, 10) : '',
                time: a.hora,
                motivo: a.motivo || ''
            }));
            const key = window.getAppointmentsKey ? window.getAppointmentsKey() : 'appointments_data';

            // Merge inteligente: mantener citas locales que aún no llegaron al cloud
            // (evita perder una cita recién creada localmente si el polling llega antes del POST)
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            const keyOf = a => `${a.qsl}|${a.date}|${a.time}`;
            // Dedup garantizado por Map (clave qsl|date|time): si llegan 2 con
            // misma clave, solo se conserva una (cloud tiene prioridad).
            const dedupMap = new Map();
            cloud.forEach(a => dedupMap.set(keyOf(a), a));
            local.forEach(a => { if (!dedupMap.has(keyOf(a))) dedupMap.set(keyOf(a), a); });
            const merged = Array.from(dedupMap.values())
                .sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));

            const prev = JSON.stringify(local);
            const next = JSON.stringify(merged);
            if (prev !== next) {
                localStorage.setItem(key, next);
                // Re-renderizar la sección Agenda/Recordatorios si está activa
                const remindersActive = document.querySelector('.nav-item[data-section="reminders"].active, li[data-section="reminders"].active');
                if (remindersActive && typeof window._reloadSection === 'function') {
                    try { window._reloadSection('reminders'); } catch (e) {}
                }
            }
        } catch (e) { console.warn('syncAppointments:', e?.message || e); }
    }

    // === SINCRONIZACIÓN DE APARIENCIA / TEMA ===
    async function syncAppearanceFromCloud() {
        try {
            const id_centro = localStorage.getItem('id_centro') || 'global';
            const resp = await fetch(`/api/settings/appearance?id_centro=${encodeURIComponent(id_centro)}`, { cache: 'no-store' });
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success) return;
            const tema = result.appearance && result.appearance.tema;
            if (tema && localStorage.getItem('sisdel_tema') !== tema) {
                localStorage.setItem('sisdel_tema', tema);
                document.body.className = document.body.className.replace(/tema-\S+/g, '') + ' ' + tema;
            }
        } catch (e) { console.warn('syncAppearance:', e?.message || e); }
    }

    // === SINCRONIZACIÓN DE HISTORIAL DE MENSAJES ===
    async function syncMessageHistoryFromCloud() {
        try {
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            const resp = await fetch(`/api/messages/history?doctor_id=${encodeURIComponent(doctor_id)}`, { cache: 'no-store' });
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success) return;
            const next = JSON.stringify(result.history || []);
            const prev = localStorage.getItem('dr_sisdel_msg_history');
            if (prev !== next) {
                localStorage.setItem('dr_sisdel_msg_history', next);
            }
        } catch (e) { console.warn('syncMessageHistory:', e?.message || e); }
    }

    // === SINCRONIZACIÓN UNIFICADA ===
    async function syncEverythingFromCloud({ force = false } = {}) {
        const start = Date.now();
        // Todos en paralelo para minimizar latencia (~ tiempo del más lento, no la suma)
        const results = await Promise.allSettled([
            syncPatientsFromCloud({ force }),
            syncMedicosFromCloud(),
            syncCentrosFromCloud(),
            syncAppointmentsFromCloud(),
            syncAppearanceFromCloud(),
            syncMessageHistoryFromCloud()
        ]);
        try {
            window._lastFullSync = Date.now();
            window._lastSyncDuration = window._lastFullSync - start;
            window._lastSyncOk = results.every(r => r.status === 'fulfilled');
            _updateSyncBadge();
        } catch (e) {}
    }

    // === INDICADOR VISIBLE DE SINCRONIZACIÓN (badge flotante) ===
    function _ensureSyncBadge() {
        if (document.getElementById('cloud-sync-badge')) return;
        const badge = document.createElement('div');
        badge.id = 'cloud-sync-badge';
        badge.title = 'Estado de sincronización con la nube — clic para forzar sync';
        badge.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99999;background:rgba(0,0,0,0.75);border:1px solid rgba(16,185,129,0.45);color:#34d399;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;gap:6px;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(0,0,0,0.3);letter-spacing:0.3px;';
        badge.innerHTML = '<span class="sync-dot" style="width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;animation:syncPulse 2s ease-in-out infinite;"></span><span class="sync-text">Sincronizando...</span>';
        badge.onclick = () => {
            if (window._syncEverythingFromCloud) window._syncEverythingFromCloud({ force: true });
        };
        document.body.appendChild(badge);
        // Animación CSS para el pulse
        if (!document.getElementById('cloud-sync-style')) {
            const style = document.createElement('style');
            style.id = 'cloud-sync-style';
            style.textContent = '@keyframes syncPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(0.7);} }';
            document.head.appendChild(style);
        }
    }
    function _updateSyncBadge() {
        _ensureSyncBadge();
        const badge = document.getElementById('cloud-sync-badge');
        if (!badge) return;
        const dot = badge.querySelector('.sync-dot');
        const txt = badge.querySelector('.sync-text');
        const ok = window._lastSyncOk !== false;
        const ms = window._lastSyncDuration || 0;
        const ageSec = window._lastFullSync ? Math.floor((Date.now() - window._lastFullSync) / 1000) : null;
        if (ok) {
            badge.style.borderColor = 'rgba(16,185,129,0.45)';
            badge.style.color = '#34d399';
            if (dot) dot.style.background = '#34d399';
            const ageTxt = ageSec === null ? 'recién' : (ageSec < 5 ? 'ahora' : `hace ${ageSec}s`);
            if (txt) txt.textContent = `🟢 Nube OK · ${ageTxt} · ${ms}ms`;
        } else {
            badge.style.borderColor = 'rgba(239,68,68,0.5)';
            badge.style.color = '#f87171';
            if (dot) dot.style.background = '#f87171';
            if (txt) txt.textContent = '🔴 Error de sync — clic para reintentar';
        }
    }
    // Refresca el contador "hace Xs" cada segundo aunque no haya nuevo sync
    if (!window._cloudSyncBadgeTimer) {
        window._cloudSyncBadgeTimer = setInterval(_updateSyncBadge, 1000);
    }

    // Arrancar polling cada 3 segundos
    window._syncPatientsFromCloud = syncPatientsFromCloud;
    window._syncEverythingFromCloud = syncEverythingFromCloud;
    if (!window._cloudSyncInterval) {
        // Backfill + sincronización inicial completa
        Promise.allSettled([
            backfillLocalPatientsToCloud(),
            backfillLocalAppointmentsToCloud()
        ]).finally(() => syncEverythingFromCloud({ force: true }));
        let tickCount = 0;
        // Polling cada 15 segundos (antes 3s). Conservador con la cuota de
        // Firestore: 6 reads × 4 polls/min = 24 reads/min ≈ 35k reads/día
        // dentro del límite gratuito (50k/día). El usuario puede pulsar el
        // botón "Sincronizar" en la agenda para forzar un sync inmediato.
        window._cloudSyncInterval = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            tickCount++;
            // Cada ~5 min un full-sync (detecta eliminados); el resto incremental
            const force = (tickCount % 20) === 0;
            syncEverythingFromCloud({ force });
        }, 15000);
        // Forzar sync completo al regresar a la pestaña
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') syncEverythingFromCloud({ force: true });
        });
    }

    async function fetchPatientDataAsync(qsl) {
        await syncPatientDataWithServer(qsl);
        const data = localStorage.getItem(`patient_data_${qsl}`);
        return data ? JSON.parse(data) : { illness: '', meds: [] };
    }

    function getPatientData(qsl) {
        const data = localStorage.getItem(`patient_data_${qsl}`);
        return data ? JSON.parse(data) : { illness: '', meds: [] };
    }

    async function savePatientData(qsl, data) {
        localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(data));
        const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
        try {
            await fetch(`/api/patient/${qsl}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, doctor_id })
            });
        } catch (e) { console.error(e); }

        const key = getDocPatientsKey();
        let list = JSON.parse(localStorage.getItem(key) || '[]');
        if (!list.includes(qsl)) {
            list.push(qsl);
            localStorage.setItem(key, JSON.stringify(list));
        }
    }

    // 3. Motor de Secciones
    // Expone loadSection para que el motor de sync pueda re-renderizar
    // la sección activa al detectar cambios desde la nube.
    window._reloadSection = (s) => loadSection(s);
    async function loadSection(sectionName) {
        if (qslCode === 'MED-MASTER' && (sectionName === 'overview' || sectionName === 'reminders' || sectionName === 'consultation')) {
            sectionName = 'programmer';
        }
        
        // Prevent closing consultation if a recipe was added but consultation isn't saved yet
        if (window.unsavedConsultation === true) {
            window.showElegantAlert('Atención: Consulta en Proceso', 'Ha guardado una receta nueva pero no ha completado el formulario clínico. Por favor, **ingrese el Motivo de la Visita** y pulse **Guardar Consulta Médica** antes de poder salir o recargar esta pantalla.', true);
            const motivoEl = document.getElementById('c-motivo');
            if (motivoEl && motivoEl.value.trim() === '') motivoEl.focus();
            return;
        }

        
        sectionTitle.textContent = getSectionTitle(sectionName);
        contentArea.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
        
        Array.from(navItems).forEach(i => i.classList.remove('active'));
        const activeNav = Array.from(navItems).find(i => i.getAttribute('data-section') === sectionName);
        if (activeNav) activeNav.classList.add('active');

        let data = null;
        if (selectedPatientQSL && (sectionName === 'overview' || sectionName === 'reminders' || sectionName === 'consultation' || sectionName === 'patient_portal')) {
            // Wait for remote sync only when loading sections to ensure patient has up to date initial data
            data = await fetchPatientDataAsync(selectedPatientQSL);
        }
        
        setTimeout(() => renderSection(sectionName, data), 300);
    }

    
    // --- MÓDULO AGENDAR CONSULTAS ---
    let currentCalDate = new Date(); // To track current month/year being viewed
    
    window.getAppointmentsKey = function() {
        const id = localStorage.getItem('current_doctor_id');
        return id === 'MED-MASTER' ? 'appointments_data' : (id ? `appointments_data_${id}` : 'appointments_data');
    };

    window.getAppointments = function() {
        const data = localStorage.getItem(window.getAppointmentsKey());
        const list = data ? JSON.parse(data) : [];
        // Dedupe defensivo: eliminar registros duplicados (mismo qsl + fecha + hora)
        // Si alguna sincronización vieja dejó duplicados en localStorage, los limpiamos
        // automáticamente cada vez que se leen las citas.
        const seen = new Set();
        const clean = [];
        let dupsFound = false;
        for (const a of list) {
            if (!a || !a.qsl) continue;
            const key = `${a.qsl}|${a.date}|${a.time}`;
            if (seen.has(key)) { dupsFound = true; continue; }
            seen.add(key);
            clean.push(a);
        }
        if (dupsFound) {
            try {
                localStorage.setItem(window.getAppointmentsKey(), JSON.stringify(clean));
                console.log(`[DR-SISDEL] Citas duplicadas removidas: ${list.length - clean.length}`);
            } catch (e) { /* noop */ }
        }
        return clean;
    };


    // Devuelve true si la fecha+hora ya pasó respecto al reloj actual.
    window.isPastSlot = function(dateStr, timeStr) {
        if (!dateStr || !timeStr) return false;
        const slot = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(slot.getTime())) return false;
        return slot.getTime() <= Date.now();
    };

    window.saveAppointment = function(appt) {
        // Validación: no permitir agendar en el pasado
        if (window.isPastSlot(appt.date, appt.time)) {
            const msg = `No es posible agendar una cita para el ${appt.date} a las ${appt.time} porque esa hora ya pasó. Seleccione una fecha y hora futura.`;
            if (typeof window.showElegantAlert === 'function') {
                window.showElegantAlert('Hora no válida', msg);
            } else {
                alert(msg);
            }
            return false;
        }

        // Dedupe local: si ya existe la misma cita (mismo qsl+fecha+hora) NO la dupliques
        const appointments = window.getAppointments();
        const dupIdx = appointments.findIndex(a => a.qsl === appt.qsl && a.date === appt.date && a.time === appt.time);
        if (dupIdx >= 0) {
            // Reemplaza la existente (por si cambió nombre/motivo) en vez de duplicar
            appointments[dupIdx] = { ...appointments[dupIdx], ...appt };
        } else {
            appointments.push(appt);
        }
        // Sort chronologically
        appointments.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
        localStorage.setItem(window.getAppointmentsKey(), JSON.stringify(appointments));

        // --- Nube Sync ---
        // El endpoint POST /api/appointments es IDEMPOTENTE (usa ID determinístico
        // doctor+qsl+fecha+hora). Reintentos sobre el mismo doc NO crean duplicados.
        const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
        const payload = { doctor_id, qsl_code: appt.qsl, paciente_nombre: appt.name, fecha: appt.date, hora: appt.time, motivo: appt.motivo };
        const doPost = () => fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        doPost()
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            console.log(`[DR-SISDEL] Cita subida al cloud: ${appt.name} · ${appt.date} ${appt.time}`);
        })
        .catch(e => {
            console.warn('Cita guardada localmente; reintento simple en 10s. Error:', e?.message);
            // Un único reintento diferido (idempotente, no crea duplicado)
            setTimeout(() => { doPost().catch(() => {}); }, 10000);
        });
        return true;
    };

    window.deleteAppointment = function(qsl, dateStr, timeStr) {
        if(confirm(`¿Estás seguro de que deseas cancelar la cita programada para el ${dateStr} a las ${timeStr}?`)) {
            let appointments = window.getAppointments();
            appointments = appointments.filter(a => !(a.qsl === qsl && a.date === dateStr && a.time === timeStr));
            localStorage.setItem(window.getAppointmentsKey(), JSON.stringify(appointments));
            
            // --- Nube Sync ---
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            fetch('/api/appointments', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doctor_id, qsl_code: qsl, fecha: dateStr, hora: timeStr })
            }).catch(e => console.error('Cloud sync err', e));

            window.renderDayDetail(dateStr); // re-render
        }
    };
    
    // Sync seguro de citas: hace MERGE cloud + local (no pierde citas locales
    // que aún no se hayan subido) y actualiza localStorage. Devuelve número
    // de citas tras el merge para mostrar feedback.
    window.syncAppointmentsFromCloud = async function() {
        const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
        const key = window.getAppointmentsKey ? window.getAppointmentsKey() : 'appointments_data';
        try {
            const res = await fetch(`/api/appointments?doctor_id=${encodeURIComponent(doctor_id)}`, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.success) return null;
            // Deduplicar la lista de la nube ANTES de procesar (puede contener
            // registros repetidos por re-uploads previos antes del fix).
            const seenCloud = new Set();
            const cloud = [];
            for (const a of (data.appointments || [])) {
                const date = a.fecha ? String(a.fecha).slice(0, 10) : '';
                const k = `${a.qsl_code}|${date}|${a.hora}`;
                if (seenCloud.has(k)) continue;
                seenCloud.add(k);
                cloud.push({
                    qsl: a.qsl_code,
                    name: a.paciente_nombre,
                    date,
                    time: a.hora,
                    motivo: a.motivo || ''
                });
            }
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            const keyOf = a => `${a.qsl}|${a.date}|${a.time}`;
            const cloudKeys = new Set(cloud.map(keyOf));
            const merged = [...cloud];
            // Solo agregar locales si NO existen en la nube ni en lo ya añadido
            const mergedKeys = new Set(cloudKeys);
            local.forEach(a => {
                const k = keyOf(a);
                if (mergedKeys.has(k)) return;
                mergedKeys.add(k);
                merged.push(a);
            });
            merged.sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));
            localStorage.setItem(key, JSON.stringify(merged));
            return merged.length;
        } catch (e) { console.error('syncAppointmentsFromCloud:', e); return null; }
    };

    // Forzar sync completo: backfill local→cloud + pull cloud→local.
    // Garantiza que la agenda muestra todo lo programado sin importar
    // dónde se haya creado originalmente.
    window.forceFullAppointmentSync = async function() {
        try {
            // Subir locales pendientes
            const key = window.getAppointmentsKey ? window.getAppointmentsKey() : 'appointments_data';
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
            // Trae lo que está en cloud para no duplicar
            let cloudKeys = new Set();
            try {
                const r = await fetch(`/api/appointments?doctor_id=${encodeURIComponent(doctor_id)}`, { cache: 'no-store' });
                if (r.ok) {
                    const j = await r.json();
                    (j.appointments || []).forEach(a => {
                        const d = a.fecha ? String(a.fecha).slice(0, 10) : '';
                        cloudKeys.add(`${a.qsl_code}|${d}|${a.hora}`);
                    });
                }
            } catch (e) {}
            for (const a of local) {
                if (cloudKeys.has(`${a.qsl}|${a.date}|${a.time}`)) continue;
                try {
                    await fetch('/api/appointments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            doctor_id,
                            qsl_code: a.qsl,
                            paciente_nombre: a.name,
                            fecha: a.date,
                            hora: a.time,
                            motivo: a.motivo || ''
                        })
                    });
                } catch (e) {}
            }
            // Pull final con merge
            return await window.syncAppointmentsFromCloud();
        } catch (e) { console.error('forceFullAppointmentSync:', e); return null; }
    };

    // Called when clicking "Agendar Consultas"
    window.renderScheduler = async function() {
        // Cloud-first: sube locales pendientes y baja del cloud antes de pintar
        if (window.forceFullAppointmentSync) {
            try { await window.forceFullAppointmentSync(); } catch (e) {}
        }
        const appointments = window.getAppointments();

        let year = currentCalDate.getFullYear();
        let month = currentCalDate.getMonth();
        
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        
        // Days logic
        const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Generate Calendar Grid
        let cells = '';
        const dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => `<div class="calendar-day-header">${d}</div>`).join('');
        
        // Offset for previous month days
        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = firstDay - 1; i >= 0; i--) {
            cells += `<div class="calendar-cell other-month"><span class="day-number">${prevMonthDays - i}</span></div>`;
        }
        
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const isToday = i === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const cellDateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            
            const cellAppts = appointments.filter(a => a.date === cellDateStr);
            const countBadge = cellAppts.length > 0 ? `<div class="appoint-count">${cellAppts.length} citas</div>` : '';
            
            cells += `
                <div class="calendar-cell ${isToday ? 'current-day' : ''}" onclick="window.renderDayDetail('${cellDateStr}')">
                    <span class="day-number">${i}</span>
                    ${countBadge}
                </div>
            `;
        }
        // Filler for end of month
        const remaining = 42 - (firstDay + daysInMonth); // standard 6 rows grid
        for (let i = 1; i <= remaining; i++) {
            cells += `<div class="calendar-cell other-month"><span class="day-number">${i}</span></div>`;
        }

        // Generate upcoming list (Top 10)
        const todayStr = new Date().toISOString().slice(0,10);
        // Deduplicar por paciente: un paciente = un turno en la lista (su cita más próxima)
        const _upcomingRaw = appointments
            .filter(a => a.date >= todayStr)
            .sort((a,b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
        const _seenQsl = new Set();
        const upcoming = _upcomingRaw.filter(a => {
            if (_seenQsl.has(a.qsl)) return false;
            _seenQsl.add(a.qsl);
            return true;
        }).slice(0, 10);
        let upcomingHtml = '';
        if(upcoming.length === 0) {
            upcomingHtml = '<div style="text-align:center; opacity:0.5; margin-top:20px;">No hay citas agendadas próximas.</div>';
        } else {
            upcomingHtml = upcoming.map(u => `
                <div class="upcoming-item" onclick="window.selectPatientAndGoToConsultation('${u.qsl}')">
                    <div class="upcoming-date">${u.date} a las ${u.time}</div>
                    <div class="upcoming-name">${u.name}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:5px;">ID: ${u.qsl}</div>
                </div>
            `).join('');
        }

        contentArea.innerHTML = `
            <div class="scheduler-container animate-in">
                <!-- COLUMNA IZQUIERDA: CALENDARIO -->
                <div class="calendar-widget" id="scheduler-main-panel">
                    <div class="calendar-header">
                        <div style="display:flex; align-items:center; gap: 15px;">
                            <button class="calendar-nav-btn" onclick="window.changeCalendarMonth(-1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <button class="calendar-nav-btn" onclick="window.changeCalendarMonth(1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <h3 style="margin:0; text-transform: uppercase;">${monthNames[month]} <span style="color:white; font-weight:300;">${year}</span></h3>
                        </div>
                        
                    </div>
                        <div style="display:flex;gap:10px;align-items:center;">
                            <button class="calendar-nav-btn" title="Hoy" onclick="window.currentCalDate = new Date(); window.renderScheduler();" style="width: auto; padding: 0 15px; font-weight:bold; font-size:14px;">HOY</button>
                            <button id="btn-force-sync" title="Sube las citas locales pendientes a la nube y trae las que falten" onclick="window.handleForceSyncClick()" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#34d399;padding:0 15px;height:38px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;">🔄 Sincronizar</button>
                            <button onclick="window.showPatientList()" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.35);color:#60a5fa;padding:0 15px;height:38px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;">👥 Lista de Pacientes</button>
                        </div>
                    <div class="calendar-grid" style="margin-bottom: 10px;">
                        ${dayHeaders}
                    </div>
                    <div class="calendar-grid">
                        ${cells}
                    </div>
                </div>
            </div>
        `;
    };

    window.pollQueueNotifications = async function() {
        if (localStorage.getItem('user_role') !== 'paciente') return;
        const myQsl = localStorage.getItem('user_qsl_code');
        if (!myQsl) return;

        // 1. Recepción de Alertas Oficiales DR-SISDEL (Mensajería Masiva/Individual) desde Supabase/Nube
        try {
            const res = await fetch(`/api/patient/${myQsl}/alerts/messages`);
            const data = await res.json();
            if (data.success && data.alerts) {
                const unreadSysAlerts = data.alerts.filter(a => !a.leido);
                
                if (unreadSysAlerts.length > 0) {
                    // ── Guardar en bandeja persistente antes de marcar como leído ──
                    const inboxKey = `patient_inbox_${myQsl}`;
                    const inbox = JSON.parse(localStorage.getItem(inboxKey) || '[]');
                    
                    unreadSysAlerts.forEach(a => {
                        // Agregar a bandeja local si no existe ya
                        if (!inbox.find(m => m.id === String(a.id))) {
                            inbox.unshift({
                                id: String(a.id),
                                mensaje: a.mensaje,
                                fecha: a.created_at ? new Date(a.created_at).toLocaleString('es-ES') : new Date().toLocaleString('es-ES'),
                                leido: false,
                                tipo: 'clinica'
                            });
                        }
                        
                        // Mark as read in DB instantaneously
                        fetch(`/api/patient/${myQsl}/alerts/messages`, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ id: a.id, mensaje: a.mensaje, leido: true })
                        }).catch(e => console.error(e));
                        
                        // Intento de reproducir tono nativo o sonido base
                        try {
                            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                            audio.play().catch(e => console.log('Audio autoplay blocked', e));
                        } catch(e) {}
                        
                        // Vibración
                        if (navigator.vibrate) {
                            navigator.vibrate([200, 100, 200, 100, 300]);
                        }
                        
                        const fsAlert = document.createElement('div');
                        fsAlert.style.position = 'fixed';
                        fsAlert.style.top = '0';
                        fsAlert.style.left = '0';
                        fsAlert.style.width = '100vw';
                        fsAlert.style.height = '100vh';
                        fsAlert.style.backgroundColor = 'rgba(15, 23, 42, 0.98)'; 
                        fsAlert.style.backdropFilter = 'blur(10px)';
                        fsAlert.style.color = '#ffffff';
                        fsAlert.style.zIndex = '99999999';
                        fsAlert.style.display = 'flex';
                        fsAlert.style.flexDirection = 'column';
                        fsAlert.style.justifyContent = 'center';
                        fsAlert.style.alignItems = 'center';
                        fsAlert.style.textAlign = 'center';
                        fsAlert.style.padding = '30px';
                        fsAlert.style.boxSizing = 'border-box';
                        
                        const formatTime = a.created_at ? new Date(a.created_at).toLocaleString('es-ES') : 'Recién recibido';

                        fsAlert.innerHTML = `
                            <div style="font-size: 70px; margin-bottom:20px; animation: pulse 1.5s infinite; color:#3b82f6;">💬</div>
                            <h2 style="font-size: 24px; color:#60a5fa; margin:0 0 20px 0; font-weight:700; text-transform:uppercase; letter-spacing:2px;">Mensaje de Clínica Médica</h2>
                            <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(59,130,246,0.3); border-left:4px solid #3b82f6; border-radius:16px; padding:30px; font-size: 22px; font-weight: normal; line-height: 1.5; text-align:left; max-width:600px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                                ${a.mensaje ? a.mensaje.replace(/\n/g, '<br>') : '[Mensaje Vacío]'}
                            </div>
                            <p style="font-size:14px; color:rgba(255,255,255,0.3); margin-top:20px;">Recibido: ${formatTime}</p>
                            <button id="btn-close-sysalert-${a.id}" style="margin-top: 40px; background:linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; padding: 20px 60px; font-size: 18px; border-radius: 12px; cursor: pointer; font-weight:bold; box-shadow:0 6px 20px rgba(59,130,246,0.4); text-transform:uppercase; letter-spacing:1px; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='none'">ENTENDIDO</button>
                        `;
                        document.body.appendChild(fsAlert);
                        
                        document.getElementById(`btn-close-sysalert-${a.id}`).onclick = () => fsAlert.remove();
                    });
                    
                    // Guardar inbox actualizado (máx 30 mensajes)
                    localStorage.setItem(inboxKey, JSON.stringify(inbox.slice(0, 30)));
                    
                    // Actualizar badge del portal si está visible
                    const badge = document.getElementById('portal-inbox-badge');
                    if (badge) {
                        const unreadCount = inbox.filter(m => !m.leido).length;
                        badge.textContent = unreadCount;
                        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
                    }
                }
            }
        } catch(e) { console.error('Cloud Sync Error', e); }

        // 2. Mostrar mensajes de turnos (Ej: Faltan 4 pacientes) y guardar en bandeja
        const notifKey = `patient_notifications_${myQsl}`;
        const queueObj = JSON.parse(localStorage.getItem(notifKey) || '[]');
        const unread = queueObj.filter(q => !q.read);
        if (unread.length > 0) {
            const inboxKey2 = `patient_inbox_${myQsl}`;
            const inbox2 = JSON.parse(localStorage.getItem(inboxKey2) || '[]');
            unread.forEach(u => {
                u.read = true;
                window.showElegantAlert('🏥 Sala de Espera', u.msg);
                if(navigator.vibrate) navigator.vibrate(300);
                // Guardar aviso de turno en bandeja
                const qId = `queue_${u.time}`;
                if (!inbox2.find(m => m.id === qId)) {
                    inbox2.unshift({ id: qId, mensaje: u.msg, fecha: new Date(u.time || Date.now()).toLocaleString('es-ES'), leido: false, tipo: 'turno' });
                }
            });
            localStorage.setItem(notifKey, JSON.stringify(queueObj));
            localStorage.setItem(inboxKey2, JSON.stringify(inbox2.slice(0, 30)));
        }

        // 3. Sistema Inteligente de Recordatorios de Cita
        const appointments = window.getAppointments ? window.getAppointments() : [];
        const todayStr = new Date().toISOString().slice(0, 10);
        const myAppt = appointments.find(a => a.qsl === myQsl && a.date === todayStr);

        if (myAppt) {
            const now = new Date();
            const [apptH, apptM] = myAppt.time.split(':').map(Number);
            const apptDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), apptH, apptM, 0);
            const diffMs = apptDateTime - now;
            const diffMins = Math.floor(diffMs / 60000);

            // ── Helper: guardar mensaje en bandeja del paciente ───────────
            function _saveApptMsgToInbox(msg) {
                const key = `patient_inbox_${myQsl}`;
                const inbox = JSON.parse(localStorage.getItem(key) || '[]');
                const msgId = `appt_${myQsl}_${Date.now()}`;
                if (!inbox.find(m => m.mensaje === msg)) {
                    inbox.unshift({ id: msgId, mensaje: msg, fecha: now.toLocaleString('es-ES'), leido: false, tipo: 'cita' });
                    localStorage.setItem(key, JSON.stringify(inbox.slice(0, 30)));
                    // Actualizar badge del portal
                    const badge = document.getElementById('portal-inbox-badge');
                    if (badge) { const uc = inbox.filter(m=>!m.leido).length; badge.textContent=uc; badge.style.display=uc>0?'flex':'none'; }
                }
            }

            // ── Contar pacientes con cita ANTES que la mía hoy ────────────
            const patientsBefore = appointments.filter(a => a.date === todayStr && a.time < myAppt.time).length;

            // ════════════════════════════════════════════════════
            // MODO A: Paciente único/primero — Recordatorio por hora
            // ════════════════════════════════════════════════════
            if (patientsBefore === 0 && diffMs > 0) {
                const currentH = now.getHours();
                const currentMin = now.getMinutes();

                // Solo entre las 6 AM y la hora de la cita, en los primeros 2 min de cada hora
                if (currentH >= 6 && currentH < apptH && currentMin < 3) {
                    const hourKey = `appt_hour_${myQsl}_${todayStr}_${currentH}`;
                    if (!localStorage.getItem(hourKey)) {
                        localStorage.setItem(hourKey, '1');

                        const hoursLeft = apptH - currentH;
                        let emoji, msg;
                        if (currentH === 6) {
                            emoji = '🌅';
                            msg = `${emoji} Buenos días. Recuerde que hoy tiene una cita médica a las ${myAppt.time} hrs. Faltan ${hoursLeft} horas.`;
                        } else if (hoursLeft === 1) {
                            emoji = '🚨';
                            msg = `${emoji} ¡Última hora! Su cita médica es en 1 hora (${myAppt.time} hrs). Por favor aproxímese al área de consulta.`;
                        } else if (hoursLeft <= 2) {
                            emoji = '⏰';
                            msg = `${emoji} Atención: su cita médica es hoy a las ${myAppt.time} hrs. Faltan ${hoursLeft} horas. Esté preparado.`;
                        } else {
                            emoji = '📅';
                            msg = `${emoji} Recordatorio: tiene una cita médica hoy a las ${myAppt.time} hrs. Faltan ${hoursLeft} horas.`;
                        }

                        _saveApptMsgToInbox(msg);
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);

                        // Mostrar alerta visual suave (no fullscreen, no bloquea)
                        const toast = document.createElement('div');
                        toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,41,59,0.97));border:1px solid rgba(34,211,238,0.4);border-radius:16px;padding:18px 24px;color:white;font-family:inherit;z-index:99999;max-width:380px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.5);backdrop-filter:blur(10px);animation:slideUp 0.4s ease;text-align:center;`;
                        toast.innerHTML = `
                            <div style="font-size:32px;margin-bottom:8px;">${emoji}</div>
                            <p style="font-size:15px;line-height:1.5;margin:0 0 14px 0;color:#f8fafc;">${msg}</p>
                            <button onclick="this.parentElement.remove()" style="background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.3);color:var(--accent,#22d3ee);padding:8px 20px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">ENTENDIDO</button>
                        `;
                        document.body.appendChild(toast);
                        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
                    }
                }
            }

            // ════════════════════════════════════════════════════
            // MODO B: Paciente en cola — Aviso de respaldo 4 horas antes
            // ════════════════════════════════════════════════════
            if (patientsBefore > 0 && diffMs > 0) {
                const diffHours = diffMs / 3600000;

                // Aviso de "4 horas antes" — una sola vez
                if (diffHours <= 4 && diffHours > 3) {
                    const key4h = `appt_4h_${myQsl}_${todayStr}`;
                    if (!localStorage.getItem(key4h)) {
                        localStorage.setItem(key4h, '1');
                        const msg = `🏥 Aviso: Su médico comenzará las consultas en breve. Su cita es a las ${myAppt.time} hrs con ${patientsBefore} paciente(s) antes. Esté atento a los avisos de turno.`;
                        _saveApptMsgToInbox(msg);
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);

                        const toast = document.createElement('div');
                        toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,41,59,0.97));border:1px solid rgba(16,185,129,0.4);border-radius:16px;padding:18px 24px;color:white;font-family:inherit;z-index:99999;max-width:380px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.5);backdrop-filter:blur(10px);animation:slideUp 0.4s ease;text-align:center;`;
                        toast.innerHTML = `
                            <div style="font-size:32px;margin-bottom:8px;">🏥</div>
                            <p style="font-size:15px;line-height:1.5;margin:0 0 14px 0;color:#f8fafc;">${msg}</p>
                            <button onclick="this.parentElement.remove()" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;padding:8px 20px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">ENTENDIDO</button>
                        `;
                        document.body.appendChild(toast);
                        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
                    }
                }

                // Aviso "2 horas antes" — segunda llamada de atención
                if (diffHours <= 2 && diffHours > 1.75) {
                    const key2h = `appt_2h_${myQsl}_${todayStr}`;
                    if (!localStorage.getItem(key2h)) {
                        localStorage.setItem(key2h, '1');
                        const msg = `⏰ Recuerdo: su cita médica es en aproximadamente 2 horas (${myAppt.time} hrs). Esté listo para los avisos de turno.`;
                        _saveApptMsgToInbox(msg);
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    }
                }
            }

            // ════════════════════════════════════════════════════
            // AMBOS MODOS: Alerta fullscreen 15 minutos antes
            // ════════════════════════════════════════════════════
            if (diffMins >= 14 && diffMins <= 16) {
                const alertedKey = `alerted_15min_today_${myQsl}`;
                if (localStorage.getItem(alertedKey) !== todayStr) {
                    localStorage.setItem(alertedKey, todayStr);

                    const msg15 = `⏰ Su turno será en aproximadamente 15 minutos (${myAppt.time} hrs). Aproxímese al área de consulta.`;
                    _saveApptMsgToInbox(msg15);

                    const fsAlert = document.createElement('div');
                    fsAlert.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#dc2626;color:#fff;z-index:9999999;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:40px;box-sizing:border-box;';
                    fsAlert.innerHTML = `
                        <div style="font-size:100px;margin-bottom:20px;animation:pulse 1s infinite;">⏰</div>
                        <h1 style="font-size:44px;font-weight:900;line-height:1.2;text-transform:uppercase;">SU TURNO SERÁ EN 15 MINUTOS</h1>
                        <p style="font-size:22px;font-weight:normal;margin-top:25px;opacity:0.9;">Aproxímese al área de consulta.</p>
                        <button id="btn-close-15min" style="margin-top:50px;background:rgba(0,0,0,0.3);color:white;border:2px solid rgba(255,255,255,0.5);padding:20px 40px;font-size:22px;border-radius:16px;cursor:pointer;font-weight:bold;">ENTENDIDO</button>
                    `;
                    document.body.appendChild(fsAlert);
                    document.getElementById('btn-close-15min').onclick = () => fsAlert.remove();
                    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000, 500, 1000]);
                }
            }
        }
    };

    window.processQueueNotifications = function() {
        const pref = localStorage.getItem('notification_preference') || 'sisdel';
        const appointments = window.getAppointments ? window.getAppointments() : [];
        const todayStr = new Date().toISOString().slice(0, 10);
        const nowTimeStr = new Date().toTimeString().slice(0, 5);
        
        const remainingAppts = appointments
            .filter(a => a.date === todayStr && a.time >= nowTimeStr)
            .sort((a,b) => (a.time > b.time ? 1 : -1));
            
        remainingAppts.forEach((appt, index) => {
            const turnosFaltantes = index + 1; // index 0 (the immediate next) is "faltan 1 paciente"
            if (turnosFaltantes <= 6) {
                const msjs = {
                    1: '⚡ ¡Es su turno! Diríjase al consultorio ahora.',
                    2: '🏃 Faltan 2 pacientes. Por favor preséntese en recepción.',
                    3: '⏳ Faltan 3 pacientes para su turno. Vaya preparándose.',
                    4: '🔔 Faltan 4 pacientes para su turno. Esté atento.',
                    5: '📋 Faltan 5 pacientes para su turno.',
                    6: '📢 Aviso temprano: faltan 6 turnos. Comience a desplazarse para llegar puntual a su cita.'
                };
                const customMsg = msjs[turnosFaltantes] || `Faltan ${turnosFaltantes} turnos para su consulta.`;

                if (pref === 'whatsapp') {
                    console.log(`[API Meta WhatsApp] Simulando envío a ${appt.name} (QSL: ${appt.qsl}): ${customMsg}`);
                } else {
                    const notifKey = `patient_notifications_${appt.qsl}`;
                    let queue = JSON.parse(localStorage.getItem(notifKey) || '[]');
                    // Prevent duplicate consecutive messages
                    if (queue.length === 0 || queue[queue.length - 1].msg !== customMsg) {
                        queue.push({
                            time: Date.now(),
                            msg: customMsg,
                            read: false
                        });
                        localStorage.setItem(notifKey, JSON.stringify(queue));
                    }
                }
            }
        });
    };

    window.changeCalendarMonth = function(delta) {
        currentCalDate.setMonth(currentCalDate.getMonth() + delta);
        window.renderScheduler();
    };

    window.selectPatientAndGoToConsultation = function(qsl) {
        selectedPatientQSL = qsl;
        Array.from(navItems).forEach(n => n.classList.remove('active'));
        const consultTab = Array.from(navItems).find(item => item.getAttribute('data-section') === 'consultation');
        if (consultTab) consultTab.classList.add('active');
        
        loadSection('consultation');
        
        // Notify the waiting patients in the queue!
        window.processQueueNotifications();
    };

    // Handler del botón "🔄 Sincronizar" — fuerza upload+download y re-renderiza
    window.handleForceSyncClick = async function() {
        const btn = document.getElementById('btn-force-sync');
        const original = btn ? btn.innerHTML : null;
        if (btn) {
            btn.innerHTML = '⏳ Sincronizando...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
        }
        try {
            const count = await window.forceFullAppointmentSync();
            // Re-render con datos frescos
            if (typeof window.renderScheduler === 'function') {
                await window.renderScheduler();
            }
            const msg = (count === null || count === undefined)
                ? 'No se pudo conectar a la nube. Reintentar.'
                : `Sincronización completa. ${count} cita${count === 1 ? '' : 's'} en la agenda.`;
            if (typeof window.showElegantAlert === 'function') {
                window.showElegantAlert('Sincronización', msg);
            } else {
                console.log('[DR-SISDEL]', msg);
            }
        } catch (e) {
            console.error('handleForceSyncClick:', e);
        } finally {
            // El botón se recrea con renderScheduler — no es necesario restaurar
            const after = document.getElementById('btn-force-sync');
            if (after && original) { after.innerHTML = original; after.disabled = false; after.style.opacity = ''; }
        }
    };

    window.renderDayDetail = async function(dateStr) {
        // Cloud-first: garantiza que las citas del día están al día con la nube
        if (window.forceFullAppointmentSync) {
            try { await window.forceFullAppointmentSync(); } catch (e) {}
        }
        const appointments = window.getAppointments();
        const dayAppts = appointments.filter(a => a.date === dateStr);
        
        let timeslotsHtml = '';
        for(let i = 0; i <= 23; i++) {
            for(let j of ['00', '30']) {
                const timeStr = `${String(i).padStart(2, '0')}:${j}`;
                const apptBlock = dayAppts.find(a => a.time === timeStr);
                
                if(apptBlock) {
                    const _name   = apptBlock.name   || 'Paciente';
                    const _qsl    = apptBlock.qsl    || '';
                    const _motivo = apptBlock.motivo ? ' · ' + apptBlock.motivo : '';
                    timeslotsHtml += `
                        <div class="time-slot">
                            <div class="time-label" style="color:#22d3ee;font-weight:700;">${timeStr}</div>
                            <div class="time-content booked" style="display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,rgba(16,185,129,0.18),rgba(16,185,129,0.08));border:1px solid rgba(16,185,129,0.4);border-left:4px solid #10b981;border-radius:10px;padding:10px 14px;">
                                <div onclick="window.showAppointmentPreview('${_qsl}','${dateStr}','${timeStr}')" style="cursor:pointer;flex:1;display:flex;align-items:center;gap:12px;">
                                    <div style="background:rgba(16,185,129,0.2);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">👤</div>
                                    <div>
                                        <div style="color:white;font-weight:700;font-size:14px;">${_name}</div>
                                        <div style="color:rgba(52,211,153,0.8);font-size:11px;margin-top:2px;">📅 ${dateStr} · ⏰ ${timeStr}${_motivo}</div>
                                    </div>
                                </div>
                                <button onclick="window.deleteAppointment('${_qsl}','${dateStr}','${timeStr}')" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.35);border-radius:8px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:700;" onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
                                    ANULAR
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    const isPast = window.isPastSlot ? window.isPastSlot(dateStr, timeStr) : false;
                    if (isPast) {
                        timeslotsHtml += `
                            <div class="time-slot" style="opacity:0.35; cursor:not-allowed;" title="Esta hora ya pasó">
                                <div class="time-label" style="color:rgba(255,255,255,0.4);">${timeStr}</div>
                                <div class="time-content" style="color:rgba(255,255,255,0.4); text-decoration:line-through;">
                                    Hora pasada
                                </div>
                            </div>
                        `;
                    } else {
                        timeslotsHtml += `
                            <div class="time-slot" onclick="window.promptSchedulePatient('${dateStr}', '${timeStr}')">
                                <div class="time-label">${timeStr}</div>
                                <div class="time-content">
                                    Disponible + (Clic para agendar cita)
                                </div>
                            </div>
                        `;
                    }
                }
            }
        }

        const panel = document.getElementById('scheduler-main-panel');
        if(!panel) return;
        
        panel.innerHTML = `
            <div class="calendar-header">
                <div style="display:flex; align-items:center; gap: 15px;">
                    <button class="calendar-nav-btn" onclick="window.renderScheduler()" style="width: auto; padding: 0 15px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;"><polyline points="15 18 9 12 15 6"></polyline></svg> Volver
                    </button>
                    <h3 style="margin:0; font-size:20px; color:white;">Programación para el <span style="color:var(--accent);">${dateStr}</span></h3>
                </div>
            </div>
            <div class="day-detail-view">
                ${timeslotsHtml}
            </div>
        `;
    };

    window.promptSchedulePatient = function(dateStr, timeStr) {
        // Bloqueo defensivo: no permitir agendar en una hora que ya pasó
        if (window.isPastSlot && window.isPastSlot(dateStr, timeStr)) {
            const msg = `No es posible agendar una cita para el ${dateStr} a las ${timeStr} porque esa hora ya pasó. Seleccione una fecha y hora futura.`;
            if (typeof window.showElegantAlert === 'function') {
                window.showElegantAlert('Hora no válida', msg);
            } else {
                alert(msg);
            }
            return;
        }

        // First choice: New or Existing?
        const mainOverlay = document.createElement('div');
        mainOverlay.id = 'scheduler-modal';
        mainOverlay.style.position = 'fixed';
        mainOverlay.style.top = '0';
        mainOverlay.style.left = '0';
        mainOverlay.style.width = '100%';
        mainOverlay.style.height = '100%';
        mainOverlay.style.background = 'rgba(0,0,0,0.85)';
        mainOverlay.style.display = 'flex';
        mainOverlay.style.alignItems = 'center';
        mainOverlay.style.justifyContent = 'center';
        mainOverlay.style.zIndex = '99999';
        mainOverlay.style.backdropFilter = 'blur(5px)';

        mainOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: #0f172a; padding: 40px; border-radius: 24px; border: 2px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 450px; width:100%;">
                <h3 style="color: white; font-size: 24px; margin-bottom: 15px;">Agendar Cita a las ${timeStr}</h3>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 30px; font-size: 16px;">Elija una opción para vincular la cita del ${dateStr}.</p>
                
                <button onclick="window.scheduleNewPatient('${dateStr}', '${timeStr}')" style="width: 100%; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 15px; background: rgba(59, 130, 246, 0.15); border: 2px solid #3b82f6; color: #60a5fa; transition: all 0.2s;">
                    Registrar Paciente Nuevo
                </button>
                
                <button onclick="window.scheduleSearchPatient('${dateStr}', '${timeStr}')" style="width: 100%; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 25px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; color: #34d399; transition: all 0.2s;">
                    Paciente Existente (Buscar)
                </button>
                
                <button onclick="document.body.removeChild(document.getElementById('scheduler-modal'))" style="background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cancelar</button>
            </div>
        `;
        document.body.appendChild(mainOverlay);
    };

    window.scheduleSearchPatient = function(dateStr, timeStr) {
        document.body.removeChild(document.getElementById('scheduler-modal'));
        
        const key = getDocPatientsKey();
        const patients = JSON.parse(localStorage.getItem(key) || '[]');
        
        let selectHtml = '<div style="max-height:300px; overflow-y:auto;text-align:left;">';
        if(patients.length === 0) {
            selectHtml += '<p style="color:white;">No hay pacientes registrados.</p>';
        } else {
            patients.forEach(qsl => {
                const name = localStorage.getItem(`patient_name_${qsl}`) || 'Paciente';
                const data = getPatientData(qsl);
                selectHtml += `
                    <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.1); cursor:pointer; transition:background 0.2s;" 
                         onmouseenter="this.style.background='rgba(34, 211, 238, 0.1)'" 
                         onmouseleave="this.style.background='transparent'"
                         onclick="window.commitSchedule('${qsl}', '${name}', '${dateStr}', '${timeStr}')">
                        <strong style="color:white; font-size:16px;">${name}</strong><br>
                        <span style="color:var(--text-muted); font-size:12px;">DPI: ${data.id_identificacion || 'N/A'} | Tel: ${data.telefono || 'N/A'}</span>
                    </div>
                `;
            });
        }
        selectHtml += '</div>';

        const mainOverlay = document.createElement('div');
        mainOverlay.id = 'scheduler-search-modal';
        mainOverlay.style.position = 'fixed';
        mainOverlay.style.top = '0';
        mainOverlay.style.left = '0';
        mainOverlay.style.width = '100%';
        mainOverlay.style.height = '100%';
        mainOverlay.style.background = 'rgba(0,0,0,0.85)';
        mainOverlay.style.display = 'flex';
        mainOverlay.style.alignItems = 'center';
        mainOverlay.style.justifyContent = 'center';
        mainOverlay.style.zIndex = '99999';

        mainOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: #0f172a; padding: 40px; border-radius: 24px; border: 2px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 500px; width:100%;">
                <h3 style="color: white; font-size: 24px; margin-bottom: 20px;">Seleccione al Paciente</h3>
                ${selectHtml}
                <button onclick="document.body.removeChild(document.getElementById('scheduler-search-modal'))" style="margin-top:20px; background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cancelar</button>
            </div>
        `;
        document.body.appendChild(mainOverlay);
    };

    window.scheduleNewPatient = function(dateStr, timeStr) {
        document.body.removeChild(document.getElementById('scheduler-modal'));
        
        localStorage.setItem('pending_appt_date', dateStr);
        localStorage.setItem('pending_appt_time', timeStr);
        
        selectedPatientQSL = null; // Clear to allow new patient flow
        
        // Transition to register flow
        loadSection('overview');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        window.showElegantAlert('Agendar Cita', 'Llene los datos del paciente nuevo. La cita quedará agendada al terminar automáticamente.');
    };

    window.commitSchedule = function(qsl, name, dateStr, timeStr) {
        const modal = document.getElementById('scheduler-search-modal');
        if(modal) document.body.removeChild(modal);
        
        window.saveAppointment({ qsl: qsl, name: name, date: dateStr, time: timeStr });
        window.showElegantAlert('Cita Programada', `Cita guardada para ${name} el día ${dateStr} a las ${timeStr}`);
        
        // Refresh the detail or scheduler (if we were in day detail, re-render it)
        window.renderDayDetail(dateStr);
        // Refresh overall right sidebar indirectly by just letting it render on view switch, but renderDayDetail doesn't reload the whole UI.
        // For simplicity, just renderScheduler and then optionally open renderDayDetail or just go to month view.
        window.renderScheduler();
        setTimeout(() => window.renderDayDetail(dateStr), 200);
    };

    /* End of Scheduler logic */

function renderSection(name, data) {
        if (userRole === 'medico' && !selectedPatientQSL && name !== 'settings' && name !== 'programmer' && name !== 'scheduler' && name !== 'configuration') {
            if (name === 'consultation') {
                window.renderDoctorHome('search');
                return;
            }
            window.renderDoctorHome('register');
            return;
        }

        const patientData = data || (selectedPatientQSL ? getPatientDataFallback(selectedPatientQSL) : null);

        switch (name) {
            case 'patient_portal':
                renderPatientPortal(patientData);
                break;
            case 'overview':
                renderOverview(patientData);
                break;
            case 'reminders':
                renderReminders(patientData);
                break;
            case 'consultation':
                renderConsultation(patientData);
                break;
            case 'settings':
                renderSettings();
                break;
            case 'configuration':
                renderConfiguration();
                break;
            case 'programmer':
                renderProgrammer();
                break;
            case 'admin_general':
                renderAdminGeneral();
                break;
            case 'scheduler':
                renderScheduler();
                break;
            default:
                renderOverview(patientData);
        }
    }

    function getPatientDataFallback(qsl) {
        const data = localStorage.getItem(`patient_data_${qsl}`);
        return data ? JSON.parse(data) : { illness: '', meds: [] };
    }

    // --- LISTA DE PACIENTES ---
    window.showPatientList = function() {
        const key = getDocPatientsKey();

        // Construye SIEMPRE el array de pacientes desde el localStorage actual,
        // así cada re-render usa los datos más frescos (citas, recetas, etc.).
        //
        // REGLA DE FILTRO (Lista = HOY + MAÑANA):
        //   Un paciente aparece en Lista si:
        //   (a) tiene cita programada para HOY (24h, atendida o no), o
        //   (b) tiene cita programada para MAÑANA (día inmediato siguiente), o
        //   (c) fue atendido HOY (consulta registrada con fecha de hoy).
        //   Otros casos (cita en 2+ días, citas pasadas, sin cita) → Historial.
        //   La lista se ordena cronológicamente por fecha+hora ascendente.
        function buildPatientsArray() {
            const registry = JSON.parse(localStorage.getItem(key) || '[]');
            const allAppts = window.getAppointments ? window.getAppointments() : [];
            const now = new Date();
            const fmtISO = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            const todayISO = fmtISO(now);
            const todayES = now.toLocaleDateString('es-ES');
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowISO = fmtISO(tomorrow);
            const archived = []; // pacientes movidos al historial (info para el header)

            const active = registry.slice(-200).reverse().map(qsl => {
                qsl = typeof qsl === 'string' ? qsl : (qsl.qsl || qsl.codigo || qsl.id || String(qsl));
                const data = JSON.parse(localStorage.getItem(`patient_data_${qsl}`) || '{}');
                const name = data.nombre_completo || localStorage.getItem(`patient_name_${qsl}`) || qsl;

                // Citas para HOY o MAÑANA
                const relevantAppts = allAppts.filter(a =>
                    (a.qsl === qsl || a.name === name) &&
                    (a.date === todayISO || a.date === tomorrowISO)
                );
                // Atendido HOY (cualquier consulta con date de hoy)
                const attendedToday = (data.consultations || []).some(c =>
                    typeof c.date === 'string' &&
                    (c.date.includes(todayES) || c.date.startsWith(todayISO))
                );

                // Sin cita hoy/mañana NI atendido hoy → archivar
                if (relevantAppts.length === 0 && !attendedToday) {
                    archived.push({ qsl, name });
                    return null;
                }

                // Próxima cita mostrada = la más cercana cronológicamente
                const upcoming = relevantAppts
                    .sort((a,b) => new Date(a.date+'T'+(a.time||'00:00')) - new Date(b.date+'T'+(b.time||'00:00')))[0];

                let nextAppt = '—';
                let nextApptDays = null;
                if (upcoming) {
                    const apptDate = new Date(upcoming.date + 'T12:00:00');
                    const diffDays = Math.ceil((apptDate - now) / 86400000);
                    const label = new Date(upcoming.date+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'});
                    nextAppt = `${label} ${upcoming.time}`;
                    nextApptDays = diffDays;
                }

                const consults = data.consultations || [];
                const lastConsult = consults[consults.length - 1];
                let lastRxShort = '—';
                if (data.meds && data.meds.length > 0) {
                    lastRxShort = `🏥 Ver Receta Asignada`;
                } else {
                    const lastRx = (lastConsult?.referencias || lastConsult?.observaciones || lastConsult?.notas || '').trim();
                    if (lastRx && lastRx !== '=' && lastRx !== '-') {
                        lastRxShort = lastRx.length > 40 ? lastRx.slice(0, 40) + '…' : lastRx;
                        lastRxShort = '📝 ' + lastRxShort;
                    } else {
                        lastRxShort = 'Sin recetas previas';
                    }
                }
                return {
                    qsl, name,
                    telefono: data.telefono || '—',
                    glucosa:  !!data.glucoseEnabled,
                    presion:  !!data.pressureEnabled,
                    nextAppt, nextApptDays,
                    lastRx: lastRxShort
                };
            }).filter(Boolean);

            // Orden cronológico ASC por próxima cita (hoy primero, luego mañana, por hora).
            active.sort((a, b) => {
                const ka = a.nextAppt && a.nextApptDays !== null ? a.nextApptDays * 10000 : 999999;
                const kb = b.nextAppt && b.nextApptDays !== null ? b.nextApptDays * 10000 : 999999;
                // Si igual día, comparar hora HH:MM
                if (ka === kb) {
                    const ta = (a.nextAppt || '').split(' ').pop() || '99:99';
                    const tb = (b.nextAppt || '').split(' ').pop() || '99:99';
                    return ta < tb ? -1 : (ta > tb ? 1 : 0);
                }
                return ka - kb;
            });

            // Expone el conteo de archivados para que renderList lo muestre
            active._archived = archived;
            return active;
        }

        // Trae citas del cloud al abrir (refuerza el polling) y re-renderiza
        const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
        fetch(`/api/appointments?doctor_id=${encodeURIComponent(doctor_id)}`)
            .then(r => r.json())
            .then(result => {
                if (result.appointments && result.appointments.length > 0) {
                    const cloud = result.appointments.map(a => ({
                        qsl: a.qsl_code, name: a.paciente_nombre,
                        date: a.fecha ? a.fecha.slice(0,10) : '', time: a.hora, motivo: a.motivo
                    }));
                    const key2 = window.getAppointmentsKey ? window.getAppointmentsKey() : 'appointments_data';
                    const local = JSON.parse(localStorage.getItem(key2) || '[]');
                    const merged = [...local];
                    cloud.forEach(c => {
                        if (!merged.find(m => m.qsl === c.qsl && m.date === c.date && m.time === c.time)) merged.push(c);
                    });
                    localStorage.setItem(key2, JSON.stringify(merged));
                    if (document.getElementById('patient-list-overlay')) renderList(document.getElementById('pl-search')?.value?.toLowerCase() || '');
                }
            }).catch(() => {});

        // Mientras el overlay esté abierto, refrescamos cada 15s (no toca red,
        // solo re-lee localStorage que es alimentado por el polling global).
        if (window._patientListInterval) clearInterval(window._patientListInterval);
        window._patientListInterval = setInterval(() => {
            const overlay = document.getElementById('patient-list-overlay');
            if (!overlay) { clearInterval(window._patientListInterval); window._patientListInterval = null; return; }
            renderList(document.getElementById('pl-search')?.value?.toLowerCase() || '');
        }, 15000);

        const overlay = document.createElement('div');
        overlay.id = 'patient-list-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:12px;box-sizing:border-box;';

        const renderList = (q) => {
            // Reconstruimos el array desde localStorage cada vez, así
            // los datos (citas, recetas) reflejan el sync más reciente.
            const patients = buildPatientsArray();
            const filtered = patients.filter(p =>
                !q ||
                p.name.toLowerCase().includes(q) ||
                p.telefono.includes(q) ||
                p.qsl.toLowerCase().includes(q)
            );

            const rows = filtered.length > 0
                ? filtered.map(p => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s;" onmouseover="this.style.background='rgba(59,130,246,0.08)'" onmouseout="this.style.background='transparent'">
                        <td onclick="window.selectPatientAndGoToConsultation('${p.qsl}')" style="padding:11px 14px; color:white; font-weight:600; font-size:13px; cursor:pointer;">${p.name}</td>
                        <td onclick="window.selectPatientAndGoToConsultation('${p.qsl}')" style="padding:11px 14px; color:rgba(255,255,255,0.6); font-size:13px; cursor:pointer;">${p.telefono}</td>
                        <td onclick="window.selectPatientAndGoToConsultation('${p.qsl}')" style="padding:11px 14px; cursor:pointer;"><span style="background:rgba(34,211,238,0.1);color:#22d3ee;border:1px solid rgba(34,211,238,0.25);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">${p.qsl}</span></td>
                        <td onclick="window.selectPatientAndGoToConsultation('${p.qsl}')" style="padding:11px 14px; text-align:center; font-size:15px; cursor:pointer;">${p.glucosa ? '🟢' : '⚫'}</td>
                        <td onclick="window.selectPatientAndGoToConsultation('${p.qsl}')" style="padding:11px 14px; text-align:center; font-size:15px; cursor:pointer;">${p.presion ? '🟢' : '⚫'}</td>
                        <td onclick="window.selectPatientAndGoToConsultation('${p.qsl}')" style="padding:11px 14px; cursor:pointer;">
                            ${p.nextApptDays !== null
                                ? `<span style="display:inline-flex;align-items:center;gap:6px;background:${p.nextApptDays <= 1 ? 'rgba(239,68,68,0.15)' : p.nextApptDays <= 7 ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.1)'};border:1px solid ${p.nextApptDays <= 1 ? 'rgba(239,68,68,0.4)' : p.nextApptDays <= 7 ? 'rgba(251,191,36,0.4)' : 'rgba(16,185,129,0.3)'};color:${p.nextApptDays <= 1 ? '#f87171' : p.nextApptDays <= 7 ? '#fbbf24' : '#34d399'};border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;">📅 ${p.nextAppt} <span style="opacity:0.7;font-weight:400;">(${p.nextApptDays === 0 ? 'Hoy' : p.nextApptDays === 1 ? 'Mañana' : 'en ' + p.nextApptDays + 'd'})</span></span>`
                                : '<span style="color:rgba(255,255,255,0.25);font-size:12px;">—</span>'}
                        </td>
                        <td onclick="window.showPatientLastRx('${p.qsl}')" title="Ver receta en detalle" style="padding:11px 14px; color:#60a5fa; font-size:12px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; text-decoration:underline;">${p.lastRx}</td>
                    </tr>`).join('')
                : `<tr><td colspan="7" style="padding:30px; text-align:center; color:rgba(255,255,255,0.3); font-size:14px;">No se encontraron pacientes.</td></tr>`;

            overlay.innerHTML = `
                <div style="background:linear-gradient(145deg,#0f172a,#1a2540);border:1px solid rgba(59,130,246,0.3);border-radius:20px;padding:28px;width:98vw;height:96vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.6);box-sizing:border-box;">

                    <!-- Header -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-shrink:0;">
                        <div>
                            <h3 style="color:#60a5fa;margin:0;font-size:20px;display:flex;align-items:center;gap:8px;">👥 Lista de Pacientes</h3>
                            <p style="color:rgba(255,255,255,0.35);margin:4px 0 0;font-size:12px;">
                                <b style="color:#60a5fa;">${patients.length}</b> hoy + mañana ${(()=>{const d=new Date();const t=new Date(d);t.setDate(t.getDate()+1);const f={weekday:'short',day:'2-digit',month:'short'};return `(${d.toLocaleDateString('es-ES',f)} → ${t.toLocaleDateString('es-ES',f)})`;})()}${patients._archived && patients._archived.length ? ` &nbsp;·&nbsp; <span style="color:#c4b5fd;">${patients._archived.length} en Historial</span>` : ''}
                            </p>
                        </div>
                        <div style="display:flex; gap:12px;">
                            <button onclick="window.showMessagingCenter()" style="background:linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.4);border-radius:10px;padding:8px 16px;color:#34d399;font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px;cursor:pointer;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='none'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                Enviar Mensajes
                            </button>
                            <button onclick="document.getElementById('patient-list-overlay').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:white;padding:8px 16px;border-radius:10px;cursor:pointer;font-size:14px;">✕ Cerrar</button>
                        </div>
                    </div>

                    <!-- Search -->
                    <div style="margin-bottom:16px;flex-shrink:0;">
                        <input type="text" id="pl-search" placeholder="🔍  Buscar por nombre, teléfono o código QSL..."
                            oninput="window._plFilter(this.value.toLowerCase())"
                            value="${q}"
                            style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);color:white;padding:11px 16px;border-radius:10px;font-size:14px;box-sizing:border-box;">
                    </div>

                    <!-- Legend -->
                    <div style="display:flex;gap:20px;margin-bottom:12px;flex-shrink:0;font-size:12px;color:rgba(255,255,255,0.4);align-items:center;">
                        <span>🟢 Reportando activo &nbsp;&nbsp; ⚫ No activo</span>
                        <span style="margin-left:auto;color:rgba(255,255,255,0.25);">Clic en fila para abrir consulta</span>
                    </div>

                    <!-- Table -->
                    <div style="overflow-y:auto;flex:1;border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead style="position:sticky;top:0;background:#0f172a;z-index:1;">
                                <tr>
                                    <th colspan="3" style="padding:0;"></th>
                                    <th colspan="2" style="padding:5px 14px 2px;text-align:center;border-bottom:none;">
                                        <span style="font-size:15px;color:rgba(34,211,238,0.65);font-weight:600;letter-spacing:0.5px;">📡 Estará enviando datos</span>
                                    </th>
                                    <th style="padding:0;"></th>
                                    <th style="padding:5px 14px 2px;text-align:right;border-bottom:none;">
                                        <button onclick="window.showAppointmentHistory()" title="Historial completo de citas atendidas y no atendidas" style="background:linear-gradient(135deg,rgba(168,85,247,0.2),rgba(168,85,247,0.05));border:1px solid rgba(168,85,247,0.5);color:#c4b5fd;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;letter-spacing:0.5px;">
                                            📋 HISTORIAL
                                        </button>
                                    </th>
                                </tr>
                                <tr>
                                    <th style="padding:10px 14px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">Nombre</th>
                                    <th style="padding:10px 14px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">Teléfono</th>
                                    <th style="padding:10px 14px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">Código</th>
                                    <th style="padding:10px 14px;color:rgba(34,211,238,0.7);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">Glucosa</th>
                                    <th style="padding:10px 14px;color:rgba(248,113,113,0.7);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">Presión</th>
                                    <th style="padding:10px 14px;color:rgba(251,191,36,0.7);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">Próxima Cita</th>
                                    <th style="padding:10px 14px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">Última Receta/Nota</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;

            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
            // Re-focus search
            requestAnimationFrame(() => {
                const inp = document.getElementById('pl-search');
                if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
            });
        };

        window._plFilter = (q) => renderList(q);

        renderList('');
        document.body.appendChild(overlay);
    };

    // === Navegar a "Datos del Paciente" (tab overview) con paciente seleccionado ===
    window.selectPatientAndShowData = function(qsl) {
        selectedPatientQSL = qsl;
        Array.from(navItems).forEach(n => n.classList.remove('active'));
        const overviewTab = Array.from(navItems).find(item => item.getAttribute('data-section') === 'overview');
        if (overviewTab) overviewTab.classList.add('active');
        // Cerrar overlays abiertos
        ['appointment-history-overlay', 'patient-list-overlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        loadSection('overview');
    };

    // === HISTORIAL DE CITAS (tabla tipo Excel) ===
    window.showAppointmentHistory = function() {
        const key = getDocPatientsKey();
        const registry = JSON.parse(localStorage.getItem(key) || '[]');
        const allAppts = window.getAppointments ? window.getAppointments() : [];

        // Mapa rápido qsl → {name, telefono, consultations}
        const patientMap = {};
        registry.forEach(qsl => {
            qsl = typeof qsl === 'string' ? qsl : (qsl.qsl || qsl.codigo || qsl.id || String(qsl));
            const pd = JSON.parse(localStorage.getItem(`patient_data_${qsl}`) || '{}');
            patientMap[qsl] = {
                name: pd.nombre_completo || localStorage.getItem(`patient_name_${qsl}`) || qsl,
                telefono: pd.telefono || '—',
                consultations: pd.consultations || []
            };
        });

        // Determina si una cita fue atendida buscando consulta con la misma fecha
        function statusOf(appt) {
            const slot = new Date(appt.date + 'T' + (appt.time || '00:00'));
            const now = new Date();
            if (slot > now) return 'pending';
            const p = patientMap[appt.qsl];
            if (!p) return 'unknown';
            const apptDateES = new Date(appt.date + 'T12:00:00').toLocaleDateString('es-ES');
            const apptDateESLong = new Date(appt.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const attended = p.consultations.some(c =>
                typeof c.date === 'string' &&
                (c.date.includes(apptDateES) || c.date.includes(apptDateESLong) || c.date.startsWith(appt.date))
            );
            return attended ? 'attended' : 'missed';
        }

        // Trae observaciones de la consulta correspondiente (si existió)
        function observationsOf(appt) {
            const p = patientMap[appt.qsl];
            if (!p) return '';
            const apptDateES = new Date(appt.date + 'T12:00:00').toLocaleDateString('es-ES');
            const consult = p.consultations.find(c =>
                typeof c.date === 'string' &&
                (c.date.includes(apptDateES) || c.date.startsWith(appt.date))
            );
            if (!consult) return '';
            return (consult.observaciones || consult.referencias || consult.notas || '').toString().trim();
        }

        // REGLA HISTORIAL: solo citas cuya fecha+hora ya pasó hace MÁS DE 24 HORAS.
        // Las citas de hoy/mañana (o pasadas <24h) están en la Lista Principal;
        // aquí solo aparece lo "cerrado" después del periodo de gracia de 24h.
        const now = new Date();
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // hace 24h

        const records = allAppts
            .map(a => {
                const p = patientMap[a.qsl] || { name: a.name || '(Paciente eliminado)', telefono: '—' };
                return {
                    qsl: a.qsl,
                    name: p.name,
                    telefono: p.telefono,
                    date: a.date,
                    time: a.time,
                    motivo: a.motivo || '',
                    observaciones: observationsOf(a),
                    status: statusOf(a),
                    _ts: new Date((a.date || '') + 'T' + (a.time || '00:00')).getTime()
                };
            })
            // Solo si la cita ya pasó hace más de 24h
            .filter(r => Number.isFinite(r._ts) && r._ts < cutoff.getTime())
            // Más recientes primero
            .sort((a, b) => b._ts - a._ts);

        const overlay = document.createElement('div');
        overlay.id = 'appointment-history-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.94);z-index:9999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);padding:12px;box-sizing:border-box;';

        const statusBadge = (s) => {
            if (s === 'attended')    return '<span title="Atendida" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.5);color:#34d399;font-size:18px;font-weight:bold;">✓</span>';
            if (s === 'missed')      return '<span title="No atendida" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.5);color:#f87171;font-size:18px;font-weight:bold;">✕</span>';
            if (s === 'pending')     return '<span title="Pendiente" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(251,191,36,0.18);border:1px solid rgba(251,191,36,0.5);color:#fbbf24;font-size:16px;">⏳</span>';
            if (s === 'unscheduled') return '<span title="Sin cita agendada" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(148,163,184,0.15);border:1px solid rgba(148,163,184,0.4);color:#cbd5e1;font-size:14px;">📋</span>';
            return '<span title="Sin datos" style="opacity:0.4;">—</span>';
        };

        const renderHistList = (q) => {
            const qLow = (q || '').toLowerCase();
            const filtered = records.filter(r =>
                !qLow ||
                r.name.toLowerCase().includes(qLow) ||
                r.telefono.toLowerCase().includes(qLow) ||
                (r.date || '').includes(qLow) ||
                (r.motivo || '').toLowerCase().includes(qLow) ||
                (r.observaciones || '').toLowerCase().includes(qLow)
            );

            const stats = {
                total: records.length,
                attended: records.filter(r => r.status === 'attended').length,
                missed: records.filter(r => r.status === 'missed').length,
                pending: records.filter(r => r.status === 'pending').length,
                unscheduled: records.filter(r => r.status === 'unscheduled').length
            };

            const rows = filtered.length > 0
                ? filtered.map(r => {
                    const fechaLabel = r.date
                        ? new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + (r.time || '')
                        : (r.status === 'unscheduled' ? '<span style="color:rgba(203,213,225,0.6);">Sin agendar</span>' : '—');
                    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background 0.15s;"
                                onmouseover="this.style.background='rgba(168,85,247,0.08)'"
                                onmouseout="this.style.background='transparent'"
                                onclick="window.selectPatientAndShowData('${r.qsl}')">
                        <td style="padding:11px 14px;color:white;font-weight:600;font-size:13px;">${r.name}</td>
                        <td style="padding:11px 14px;color:rgba(255,255,255,0.65);font-size:13px;">${r.telefono}</td>
                        <td style="padding:11px 14px;color:rgba(255,255,255,0.75);font-size:13px;white-space:nowrap;">${fechaLabel}</td>
                        <td style="padding:11px 14px;color:rgba(255,255,255,0.6);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.motivo}">${r.motivo || '—'}</td>
                        <td style="padding:11px 14px;color:rgba(255,255,255,0.6);font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.observaciones}">${r.observaciones || '—'}</td>
                        <td style="padding:11px 14px;text-align:center;">${statusBadge(r.status)}</td>
                    </tr>`;
                }).join('')
                : `<tr><td colspan="6" style="padding:40px;text-align:center;color:rgba(255,255,255,0.35);font-size:14px;">No se encontraron registros en el historial.</td></tr>`;

            overlay.innerHTML = `
                <div style="background:linear-gradient(145deg,#0f172a,#1a1530);border:1px solid rgba(168,85,247,0.35);border-radius:20px;padding:28px;width:98vw;height:96vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.7);box-sizing:border-box;">
                    <!-- Header -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-shrink:0;">
                        <div>
                            <h3 style="color:#c4b5fd;margin:0;font-size:20px;display:flex;align-items:center;gap:10px;">📋 Historial de Citas</h3>
                            <p style="color:rgba(255,255,255,0.4);margin:4px 0 0;font-size:12px;">
                                <span style="color:rgba(255,255,255,0.6);">Citas con más de 24h de pasadas — </span>
                                Total: <b style="color:white;">${stats.total}</b> &nbsp;·&nbsp;
                                <span style="color:#34d399;">✓ Atendidas: <b>${stats.attended}</b></span> &nbsp;·&nbsp;
                                <span style="color:#f87171;">✕ No atendidas: <b>${stats.missed}</b></span>
                            </p>
                        </div>
                        <button onclick="document.getElementById('appointment-history-overlay').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:white;padding:8px 16px;border-radius:10px;cursor:pointer;font-size:14px;">✕ Cerrar</button>
                    </div>

                    <!-- Search -->
                    <div style="margin-bottom:14px;flex-shrink:0;">
                        <input type="text" id="hist-search" placeholder="🔍  Buscar por nombre, teléfono, fecha, motivo u observación..."
                            oninput="window._histFilter(this.value)"
                            value="${q || ''}"
                            style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);color:white;padding:11px 16px;border-radius:10px;font-size:14px;box-sizing:border-box;">
                    </div>

                    <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:8px;">
                        Clic en una fila para abrir <b style="color:#c4b5fd;">Datos del Paciente</b>
                    </div>

                    <!-- Table -->
                    <div style="overflow:auto;flex:1;border-radius:12px;border:1px solid rgba(255,255,255,0.07);">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead style="position:sticky;top:0;background:#1a1530;z-index:1;">
                                <tr>
                                    <th style="padding:11px 14px;color:rgba(196,181,253,0.85);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(168,85,247,0.25);">Nombre Paciente</th>
                                    <th style="padding:11px 14px;color:rgba(196,181,253,0.85);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(168,85,247,0.25);">Teléfono</th>
                                    <th style="padding:11px 14px;color:rgba(196,181,253,0.85);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(168,85,247,0.25);">Fecha de Cita</th>
                                    <th style="padding:11px 14px;color:rgba(196,181,253,0.85);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(168,85,247,0.25);">Motivo Consulta</th>
                                    <th style="padding:11px 14px;color:rgba(196,181,253,0.85);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;border-bottom:1px solid rgba(168,85,247,0.25);">Observaciones</th>
                                    <th style="padding:11px 14px;color:rgba(196,181,253,0.85);font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:center;border-bottom:1px solid rgba(168,85,247,0.25);">Estado</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;

            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
            requestAnimationFrame(() => {
                const inp = document.getElementById('hist-search');
                if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
            });
        };

        window._histFilter = (q) => renderHistList(q);
        renderHistList('');
        document.body.appendChild(overlay);
    };

    window.showMessagingCenter = () => {
        const overlay = document.createElement('div');
        overlay.id = 'messaging-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:20px;box-sizing:border-box;';

        const patients = [];
        const key = getDocPatientsKey();
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        list.forEach(qsl => {
            const pd = JSON.parse(localStorage.getItem(`patient_data_${qsl}`) || '{}');
            const nm = localStorage.getItem(`patient_name_${qsl}`) || 'Sin Nombre';
            patients.push({ qsl, name: nm, telefono: pd.telefono || '', dpi: pd.dpi || '' });
        });
        
        overlay.innerHTML = `
            <div class="widget-card animate-in" style="background: linear-gradient(145deg, #0f172a, #1e1b4b); border: 2px solid rgba(139, 92, 246, 0.4); border-radius: 20px; padding: 35px; width: 100%; max-width: 800px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); display:flex; flex-direction:column; max-height: 90vh;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom:15px;">
                    <h3 style="color:#a78bfa; font-size:24px; margin:0; display:flex; align-items:center; gap:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        Centro de Mensajería
                    </h3>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button onclick="window.showMsgHistory()" style="background:rgba(139,92,246,0.15); border:1px solid rgba(139,92,246,0.3); color:#c4b5fd; height:35px; padding:0 14px; font-size:13px; border-radius:10px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='rgba(139,92,246,0.25)'" onmouseout="this.style.background='rgba(139,92,246,0.15)'">📜 Historial</button>
                        <button onclick="document.getElementById('messaging-overlay').remove()" style="background:rgba(255,255,255,0.1); border:none; color:white; width:35px; height:35px; font-size:18px; border-radius:10px; cursor:pointer;">✕</button>
                    </div>
                </div>
                
                <div style="display:flex; gap:20px; margin-bottom: 20px;">
                    <div style="flex:1; background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
                        <label style="color:#a78bfa; font-size:14px; font-weight:700; margin-bottom:15px; display:block;">PÚBLICO OBJETIVO</label>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <label style="display:flex; align-items:center; gap:12px; cursor:pointer; color:white;">
                                <input type="radio" name="msg-target" value="all" checked style="accent-color:#8b5cf6; transform:scale(1.75); margin-left:5px;">
                                Todos los Pacientes
                            </label>
                            <label style="display:flex; align-items:center; gap:12px; cursor:pointer; color:white;">
                                <input type="radio" name="msg-target" value="days" style="accent-color:#8b5cf6; transform:scale(1.75); margin-left:5px;">
                                Con Cita Próxima en: <input type="number" id="msg-days" value="7" style="width:50px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px; padding:2px 6px; text-align:center;"> días
                            </label>
                            <label style="display:flex; align-items:center; gap:12px; cursor:pointer; color:white;">
                                <input type="radio" name="msg-target" value="individual" style="accent-color:#8b5cf6; transform:scale(1.75); margin-left:5px;">
                                Individual (Búsqueda)
                            </label>
                            <div style="position:relative;">
                                <input type="text" id="msg-ind-search" placeholder="Escriba nombre, teléfono, DPI o QSL..." style="display:none; width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:white; padding:8px 12px; border-radius:6px; margin-top:4px; box-sizing:border-box;" autocomplete="off">
                                <div id="msg-autocomplete-results" style="display:none; position:absolute; top:100%; left:0; width:100%; background:#1e293b; border:1px solid rgba(139,92,246,0.5); border-radius:6px; max-height:200px; overflow-y:auto; z-index:10000; box-shadow: 0 10px 25px rgba(0,0,0,0.5);"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <label style="color:#a78bfa; font-size:14px; font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-end;">REDACTAR MENSAJE <span style="font-size:11px; font-weight:normal; color:rgba(255,255,255,0.5);">Use [NOMBRE] para personalizar</span></label>
                    <textarea id="msg-text" style="width:100%; height:110px; background:rgba(0,0,0,0.3); border:1px solid rgba(139,92,246,0.5); color:white; padding:15px; border-radius:12px; border-left:4px solid #8b5cf6; resize:none; font-family:inherit; box-sizing:border-box; font-size:15px;" placeholder="Estimado/a [NOMBRE], le escribimos de Clínica Médica para recordarle..."></textarea>
                </div>

                <div id="action-buttons-container" style="margin-bottom:15px;">
                    <button id="btn-prep-msg" style="width:100%; background:linear-gradient(135deg, #8b5cf6, #6d28d9); color:white; border:none; padding:15px; border-radius:12px; font-weight:700; cursor:pointer; font-size:15px; box-shadow:0 4px 15px rgba(139,92,246,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'">🔍 GENERAR LISTA DE ENVÍO</button>
                </div>
                
                <div id="msg-results" style="flex:1; overflow-y:auto; padding-right:10px;"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const targets = overlay.querySelectorAll('input[name="msg-target"]');
        const indSearch = document.getElementById('msg-ind-search');
        
        targets.forEach(t => t.addEventListener('change', () => {
            indSearch.style.display = document.querySelector('input[name="msg-target"]:checked').value === 'individual' ? 'block' : 'none';
            const autoList = document.getElementById('msg-autocomplete-results');
            if (autoList) autoList.style.display = 'none';
        }));

        indSearch.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const autoList = document.getElementById('msg-autocomplete-results');
            if (!q) {
                autoList.style.display = 'none';
                return;
            }
            const matched = patients.filter(p => 
                p.name.toLowerCase().includes(q) || 
                p.qsl.toLowerCase().includes(q) ||
                p.telefono.toLowerCase().includes(q) ||
                p.dpi.toLowerCase().includes(q)
            ).slice(0, 15);
            
            if (matched.length === 0) {
                autoList.innerHTML = '<div style="padding:10px; color:rgba(255,255,255,0.4); font-size:12px;">Sin resultados para "' + q + '"</div>';
                autoList.style.display = 'block';
                return;
            }

            autoList.innerHTML = matched.map(p => `
                <div style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:transparent; transition:background 0.2s;" onmouseover="this.style.background='rgba(139,92,246,0.15)'" onmouseout="this.style.background='transparent'" onclick="document.getElementById('msg-ind-search').value = '${p.name}'; document.getElementById('msg-autocomplete-results').style.display='none'; document.getElementById('btn-prep-msg').click();">
                    <span style="color:white; font-size:13px; font-weight:600;">${p.name}</span>
                    <span style="color:rgba(255,255,255,0.4); font-size:11px;">${p.telefono} • ${p.qsl}</span>
                </div>
            `).join('');
            autoList.style.display = 'block';
        });

        overlay.addEventListener('click', (e) => {
            if (e.target.id !== 'msg-ind-search') {
                const autoList = document.getElementById('msg-autocomplete-results');
                if(autoList) autoList.style.display = 'none';
            }
        });

        window.prepMsgHandler = () => {
            const targetType = overlay.querySelector('input[name="msg-target"]:checked').value;
            const msgTemplate = document.getElementById('msg-text').value.trim();
            const resultsDiv = document.getElementById('msg-results');

            let filtered = [];

            if (targetType === 'all') {
                filtered = patients;
            } else if (targetType === 'days') {
                const daysLimit = parseInt(document.getElementById('msg-days').value) || 0;
                const now = new Date();
                const limitDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysLimit, 23, 59, 59);
                
                const appts = window.getAppointments ? window.getAppointments() : [];
                const patientHasAppt = new Set();
                
                appts.forEach(a => {
                    const [y, m, d] = a.date.split('-');
                    const aDate = new Date(y, m - 1, d);
                    if (aDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && aDate <= limitDate) {
                        patientHasAppt.add(a.qsl);
                    }
                });
                
                filtered = patients.filter(p => patientHasAppt.has(p.qsl));
            } else if (targetType === 'individual') {
                const q = indSearch.value.toLowerCase().trim();
                if (!q) {
                    window.showElegantAlert('Error', 'Ingrese nombre, teléfono, DPI o QSL para la búsqueda.', false);
                    return;
                }
                filtered = patients.filter(p => 
                    p.name.toLowerCase().includes(q) || 
                    p.qsl.toLowerCase().includes(q) ||
                    p.telefono.toLowerCase().includes(q) ||
                    p.dpi.toLowerCase().includes(q)
                );
            }

            if (filtered.length === 0) {
                resultsDiv.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4); background:rgba(0,0,0,0.2); border-radius:12px;">No se encontraron pacientes que coincidan con los criterios.</div>';
                return;
            }

            window.pendingMsgPatients = filtered;

            window.renderMsgListRows = () => {
                const actionContainer = document.getElementById('action-buttons-container');
                const resultsDiv = document.getElementById('msg-results');

                if (!window.pendingMsgPatients || window.pendingMsgPatients.length === 0) {
                    actionContainer.innerHTML = `<button id="btn-prep-msg" style="width:100%; background:linear-gradient(135deg, #8b5cf6, #6d28d9); color:white; border:none; padding:15px; border-radius:12px; font-weight:700; cursor:pointer; font-size:15px; box-shadow:0 4px 15px rgba(139,92,246,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'">🔍 GENERAR LISTA DE ENVÍO</button>`;
                    document.getElementById('btn-prep-msg').onclick = window.prepMsgHandler;

                    resultsDiv.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4); background:rgba(0,0,0,0.2); border-radius:12px;">La lista ha quedado vacía. Modifique los criterios y presione "Generar Lista" de nuevo.</div>';
                    return;
                }

                actionContainer.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button onclick="window.processMassWhatsApp()" style="width:100%; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; padding:16px; border-radius:12px; font-weight:800; cursor:pointer; font-size:15px; box-shadow:0 6px 20px rgba(16,185,129,0.3); text-transform:uppercase; letter-spacing:1px; transition:transform 0.2s; display:flex; align-items:center; justify-content:center; gap:8px;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            Enviar por WhatsApp (${window.pendingMsgPatients.length})
                        </button>
                        <div style="display:flex; gap:10px;">
                            <button onclick="window.processMassDrSisdel()" style="flex:1; background:linear-gradient(135deg, #3b82f6, #1d4ed8); color:white; border:none; padding:16px; border-radius:12px; font-weight:800; cursor:pointer; font-size:15px; box-shadow:0 6px 20px rgba(59,130,246,0.3); text-transform:uppercase; letter-spacing:1px; transition:transform 0.2s; display:flex; align-items:center; justify-content:center; gap:8px;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                Enviar por Plataforma (${window.pendingMsgPatients.length})
                            </button>
                            <button onclick="window.pendingMsgPatients=[]; window.renderMsgListRows();" style="width:60px; background:rgba(255,255,255,0.1); border:none; color:white; border-radius:12px; cursor:pointer; font-size:22px; transition:transform 0.2s; font-weight:bold;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='none'" title="Limpiar y Volver">⟲</button>
                        </div>
                    </div>`;

                resultsDiv.innerHTML = `<div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); color:#a7f3d0; padding:12px 18px; border-radius:10px; margin-bottom:15px; font-size:14px; text-align:center;">Se han seleccionado <strong>${window.pendingMsgPatients.length}</strong> pacientes aptos. Revise la lista y elimine los que no deban recibir el mensaje antes de presionar Enviar.</div>` + 
                    window.pendingMsgPatients.map((p, idx) => {
                        return `
                        <div style="background:rgba(255,255,255,0.05); padding:10px 18px; border-radius:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border: 1px solid rgba(255,255,255,0.03);">
                            <div>
                                <div style="font-size:15px; color:white; font-weight:600;">${p.name}</div>
                                <div style="font-size:13px; color:rgba(255,255,255,0.4); font-family:monospace;">${p.telefono || 'Sin Número'}</div>
                            </div>
                            <button onclick="window.pendingMsgPatients.splice(${idx}, 1); window.renderMsgListRows();" style="background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; transition:all 0.2s; font-weight:600;" onmouseover="this.style.background='rgba(239,68,68,0.2)'; this.style.color='#fff';" onmouseout="this.style.background='rgba(239,68,68,0.1)'; this.style.color='#fca5a5';">
                                ✕ Quitar
                            </button>
                        </div>`;
                    }).join('');
            };

            window.processMassWhatsApp = () => {
                if(!window.pendingMsgPatients || window.pendingMsgPatients.length === 0) return;
                
                const msgTemplate = document.getElementById('msg-text').value.trim();
                if (!msgTemplate) {
                    window.showElegantAlert('Error', '⚠️ El campo de mensaje está vacío. Escriba el mensaje que desea enviar antes de disparar el envío a toda la lista.', false);
                    return;
                }

                const targetType = overlay.querySelector('input[name="msg-target"]:checked').value;
                const count = window.pendingMsgPatients.length;
                const names = window.pendingMsgPatients.map(p => p.name);

                // Log to history
                window._logSentMessage(msgTemplate, 'WhatsApp', targetType, count, names);

                const resultsDiv = document.getElementById('msg-results');
                const actionContainer = document.getElementById('action-buttons-container');
                actionContainer.innerHTML = `<button id="btn-prep-msg" style="width:100%; background:linear-gradient(135deg, #8b5cf6, #6d28d9); color:white; border:none; padding:15px; border-radius:12px; font-weight:700; cursor:pointer; font-size:15px; box-shadow:0 4px 15px rgba(139,92,246,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'">🔍 GENERAR LISTA DE ENVÍO</button>`;
                document.getElementById('btn-prep-msg').onclick = window.prepMsgHandler;

                resultsDiv.innerHTML = `
                    <div style="text-align:center; padding:40px; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.3); border-radius:16px;">
                        <div style="font-size:60px; margin-bottom:15px;">✅</div>
                        <h3 style="color:#34d399; margin:0 0 10px 0; font-size:22px;">Mensaje Enviado Exitosamente</h3>
                        <p style="color:rgba(255,255,255,0.6); margin:0 0 5px 0; font-size:15px;">Se enviaron <strong style="color:white;">${count}</strong> mensajes por <strong style="color:#10b981;">WhatsApp</strong></p>
                        <p style="color:rgba(255,255,255,0.3); font-size:13px; margin:0;">${new Date().toLocaleString('es-ES')}</p>
                    </div>`;

                window.pendingMsgPatients = [];
            };

            window.processMassDrSisdel = () => {
                if(!window.pendingMsgPatients || window.pendingMsgPatients.length === 0) return;

                const msgTemplate = document.getElementById('msg-text').value.trim();
                if (!msgTemplate) {
                    window.showElegantAlert('Error', '⚠️ El campo de mensaje está vacío. Escriba el aviso que desea emitir.', false);
                    return;
                }

                const targetType = overlay.querySelector('input[name="msg-target"]:checked').value;
                const count = window.pendingMsgPatients.length;
                const names = window.pendingMsgPatients.map(p => p.name);

                window.pendingMsgPatients.forEach(p => {
                    const finalMsg = msgTemplate.replace(/\\[NOMBRE\\]/g, p.name);
                    const sysAlertsKey = `dr_sisdel_alerts_${p.qsl}`;
                    const alerts = JSON.parse(localStorage.getItem(sysAlertsKey) || '[]');
                    
                    const msgObj = {
                        id: 'msg_' + Date.now() + Math.floor(Math.random() * 1000),
                        timestamp: new Date().toISOString(),
                        text: finalMsg,
                        read: false
                    };
                    alerts.unshift(msgObj);
                    localStorage.setItem(sysAlertsKey, JSON.stringify(alerts));

                    // --- Nube Sync ---
                    fetch(`/api/patient/${p.qsl}/alerts/messages`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ id: msgObj.id, mensaje: msgObj.text, leido: false })
                    }).catch(e => console.error(e));
                });

                // Log to history
                window._logSentMessage(msgTemplate, 'DR-SISDEL', targetType, count, names);

                const resultsDiv = document.getElementById('msg-results');
                const actionContainer = document.getElementById('action-buttons-container');
                actionContainer.innerHTML = `<button id="btn-prep-msg" style="width:100%; background:linear-gradient(135deg, #8b5cf6, #6d28d9); color:white; border:none; padding:15px; border-radius:12px; font-weight:700; cursor:pointer; font-size:15px; box-shadow:0 4px 15px rgba(139,92,246,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='none'">🔍 GENERAR LISTA DE ENVÍO</button>`;
                document.getElementById('btn-prep-msg').onclick = window.prepMsgHandler;

                resultsDiv.innerHTML = `
                    <div style="text-align:center; padding:40px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.3); border-radius:16px;">
                        <div style="font-size:60px; margin-bottom:15px;">🔔</div>
                        <h3 style="color:#60a5fa; margin:0 0 10px 0; font-size:22px;">Mensaje Enviado Exitosamente</h3>
                        <p style="color:rgba(255,255,255,0.6); margin:0 0 5px 0; font-size:15px;">Se enviaron <strong style="color:white;">${count}</strong> avisos por <strong style="color:#3b82f6;">Plataforma DR-SISDEL</strong></p>
                        <p style="color:rgba(255,255,255,0.3); font-size:13px; margin:0;">${new Date().toLocaleString('es-ES')}</p>
                    </div>`;

                window.pendingMsgPatients = [];
            };

            // === Utility: log sent message ===
            window._logSentMessage = (text, channel, targetType, count, recipientNames) => {
                const targetLabels = { all: 'Todos los Pacientes', days: 'Citas Próximas', individual: 'Individual' };
                const log = JSON.parse(localStorage.getItem('dr_sisdel_msg_history') || '[]');
                const histId = 'log_' + Date.now();
                log.unshift({
                    id: histId,
                    text: text,
                    channel: channel,
                    targetGroup: targetLabels[targetType] || targetType,
                    recipientCount: count,
                    recipients: recipientNames.slice(0, 10),
                    date: new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }),
                    time: new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }),
                    timestamp: new Date().toISOString()
                });
                localStorage.setItem('dr_sisdel_msg_history', JSON.stringify(log));

                // --- Nube Sync ---
                const docId = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
                fetch('/api/messages/history', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        id: histId, doctor_id: docId, mensaje: text, canal: channel, 
                        grupo_objetivo: targetLabels[targetType] || targetType, 
                        cantidad_destinatarios: count, nombres_destinatarios: recipientNames
                    })
                }).catch(e => console.error(e));
            };

            // === Show history viewer ===
            window.showMsgHistory = () => {
                const log = JSON.parse(localStorage.getItem('dr_sisdel_msg_history') || '[]');
                const histDiv = document.getElementById('msg-results');
                if (!histDiv) return;

                if (log.length === 0) {
                    histDiv.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,0.4); background:rgba(0,0,0,0.2); border-radius:12px;">No hay mensajes enviados aún.</div>';
                    return;
                }

                histDiv.innerHTML = `
                    <div style="background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.3); color:#c4b5fd; padding:12px 18px; border-radius:10px; margin-bottom:15px; font-size:14px; text-align:center; font-weight:600;">📜 Historial de Mensajes Enviados (${log.length})</div>
                    ${log.map(entry => `
                        <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-left:3px solid ${entry.channel === 'WhatsApp' ? '#10b981' : '#3b82f6'}; border-radius:12px; padding:16px; margin-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <span style="background:${entry.channel === 'WhatsApp' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)'}; color:${entry.channel === 'WhatsApp' ? '#34d399' : '#60a5fa'}; border:1px solid ${entry.channel === 'WhatsApp' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}; padding:3px 10px; border-radius:8px; font-size:11px; font-weight:700;">${entry.channel === 'WhatsApp' ? '💬' : '📧'} ${entry.channel}</span>
                                    <span style="background:rgba(139,92,246,0.12); color:#a78bfa; border:1px solid rgba(139,92,246,0.25); padding:3px 10px; border-radius:8px; font-size:11px; font-weight:600;">${entry.targetGroup}</span>
                                    <span style="color:rgba(255,255,255,0.4); font-size:12px;">${entry.recipientCount} destinatario${entry.recipientCount > 1 ? 's' : ''}</span>
                                </div>
                                <span style="color:rgba(255,255,255,0.35); font-size:12px; white-space:nowrap;">📅 ${entry.date} • ⏰ ${entry.time}</span>
                            </div>
                            <p style="margin:0; color:rgba(255,255,255,0.8); font-size:14px; line-height:1.5; background:rgba(0,0,0,0.15); padding:10px 14px; border-radius:8px; white-space:pre-wrap;">${entry.text}</p>
                            ${entry.recipients && entry.recipients.length > 0 ? `<div style="margin-top:8px; font-size:11px; color:rgba(255,255,255,0.3);">Destinatarios: ${entry.recipients.join(', ')}${entry.recipientCount > 10 ? '...' : ''}</div>` : ''}
                        </div>
                    `).join('')}
                `;
            };

            window.renderMsgListRows();
        };

        // Bind the handler to the initial statically rendered button
        document.getElementById('btn-prep-msg').onclick = window.prepMsgHandler;
    };

    window.showPatientLastRx = (qsl) => {
        const data = getPatientData(qsl);
        const meds = data.meds || [];
        const consults = data.consultations || [];
        const lastCons = consults.length > 0 ? consults[consults.length - 1] : null;

        if (meds.length === 0 && !lastCons) {
            window.showElegantAlert('Expediente Vacío', 'Este paciente no tiene consultas ni recetas previas registradas.', false);
            return;
        }

        const rxOverlay = document.createElement('div');
        rxOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:20px;box-sizing:border-box;';

        const medsHtml = meds.map(m => `
            <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px; margin-bottom:14px;">
                <h4 style="color:#34d399; margin:0 0 8px 0; font-size:19px;">💊 ${m.name}</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8);"><strong>Dosis:</strong> ${m.dose}</p>
                    <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8);"><strong>Frecuencia:</strong> Cada ${m.frequency}h</p>
                    <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8);"><strong>Duración:</strong> ${m.days} días</p>
                    <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8);"><strong>Inicio:</strong> <span style="color:#10b981;">${m.startTime}</span></p>
                </div>
                ${m.notes ? `<p style="margin:10px 0 0; font-size:14px; color:rgba(255,255,255,0.6); border-top:1px dashed rgba(255,255,255,0.1); padding-top:10px;"><em>Indicaciones: ${m.notes}</em></p>` : ''}
            </div>
        `).join('');

        let consultHtml = '';
        if (lastCons) {
            consultHtml = `
                <div style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                        <h4 style="color:#22d3ee; margin:0; font-size:16px; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Detalles de la Última Consulta
                        </h4>
                        <span style="font-size:13px; color:rgba(255,255,255,0.5); background:rgba(255,255,255,0.1); padding:4px 10px; border-radius:12px;">${lastCons.date}</span>
                    </div>

                    ${(lastCons.glucosa || lastCons.presion || lastCons.peso || lastCons.estatura) ? `
                        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:15px;">
                            ${lastCons.peso ? `<span style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.25); padding:4px 10px; border-radius:12px; font-size:12px;">⚖️ ${lastCons.peso}</span>` : ''}
                            ${lastCons.estatura ? `<span style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.25); padding:4px 10px; border-radius:12px; font-size:12px;">📏 ${lastCons.estatura}</span>` : ''}
                            ${lastCons.glucosa ? `<span style="background:rgba(34,211,238,0.15); color:#22d3ee; border:1px solid rgba(34,211,238,0.25); padding:4px 10px; border-radius:12px; font-size:12px;">🩸 Glucosa: ${lastCons.glucosa}</span>` : ''}
                            ${lastCons.presion ? `<span style="background:rgba(248,113,113,0.15); color:#f87171; border:1px solid rgba(248,113,113,0.25); padding:4px 10px; border-radius:12px; font-size:12px;">❤️ Presión: ${lastCons.presion}</span>` : ''}
                        </div>
                    ` : ''}

                    <div style="margin-bottom:12px;">
                        <span style="display:block; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; margin-bottom:4px;">Motivo:</span>
                        <p style="margin:0; font-size:15px; color:white;">${lastCons.motivo || 'N/A'}</p>
                    </div>
                    ${lastCons.historia ? `
                        <div style="margin-bottom:12px;">
                            <span style="display:block; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; margin-bottom:4px;">Historia:</span>
                            <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8); white-space:pre-wrap;">${lastCons.historia}</p>
                        </div>
                    ` : ''}
                    ${lastCons.notas ? `
                        <div style="margin-bottom:12px;">
                            <span style="display:block; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; margin-bottom:4px;">Diagnóstico / Notas:</span>
                            <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8); white-space:pre-wrap;">${lastCons.notas}</p>
                        </div>
                    ` : ''}
                    ${lastCons.referencias ? `
                        <div style="margin-bottom:4px;">
                            <span style="display:block; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; margin-bottom:4px;">Referencias:</span>
                            <p style="margin:0; font-size:14px; color:rgba(255,255,255,0.8); white-space:pre-wrap;">${lastCons.referencias}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        rxOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: linear-gradient(145deg, #1e293b, #0f172a); border: 2px solid rgba(16, 185, 129, 0.4); border-radius: 20px; padding: 50px; width: 100%; max-width: 1270px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); position: relative; max-height:92vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom:15px; flex-shrink:0;">
                    <h3 style="color:#10b981; font-size:26px; margin:0; display:flex; align-items:center; gap:10px;">📋 Expediente / Última Receta</h3>
                    <button id="close-rx-btn" style="background:rgba(255,255,255,0.1); border:none; color:white; width:38px; height:38px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.2s; font-size:18px;" onmouseenter="this.style.background='rgba(255,255,255,0.2)'" onmouseleave="this.style.background='rgba(255,255,255,0.1)'">✕</button>
                </div>
                <p style="color:rgba(255,255,255,0.6); margin-top:0; margin-bottom:15px; font-size:22px;">Paciente: <strong style="color:white; font-size:26px;">${data.nombre_completo || qsl}</strong></p>
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:22px;">
                    <div style="background:${data.glucoseEnabled ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${data.glucoseEnabled ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)'}; padding:10px 18px; border-radius:14px; display:flex; align-items:center; gap:10px; ${data.glucoseEnabled ? 'border-left:4px solid #10b981;' : ''}">
                        <span style="font-size:22px;">${data.glucoseEnabled ? '🟢' : '⚪'}</span>
                        <div>
                            <div style="font-size:14px; font-weight:700; color:${data.glucoseEnabled ? '#34d399' : 'rgba(255,255,255,0.3)'};">Monitoreo de Glucosa</div>
                            <div style="font-size:12px; color:${data.glucoseEnabled ? '#a7f3d0' : 'rgba(255,255,255,0.2)'};">${data.glucoseEnabled ? 'Activado — Paciente reporta niveles periódicamente' : 'No activado en este paciente'}</div>
                        </div>
                    </div>
                    <div style="background:${data.pressureEnabled ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${data.pressureEnabled ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}; padding:10px 18px; border-radius:14px; display:flex; align-items:center; gap:10px; ${data.pressureEnabled ? 'border-left:4px solid #ef4444;' : ''}">
                        <span style="font-size:22px;">${data.pressureEnabled ? '🔴' : '⚪'}</span>
                        <div>
                            <div style="font-size:14px; font-weight:700; color:${data.pressureEnabled ? '#f87171' : 'rgba(255,255,255,0.3)'};">Monitoreo de Presión Arterial</div>
                            <div style="font-size:12px; color:${data.pressureEnabled ? '#fca5a5' : 'rgba(255,255,255,0.2)'};">${data.pressureEnabled ? 'Activado — Paciente reporta lecturas periódicamente' : 'No activado en este paciente'}</div>
                        </div>
                    </div>
                </div>
                <div style="overflow-y:auto; padding-right:10px;">
                    ${consultHtml}
                    ${meds.length > 0 ? `
                        <h4 style="color:#10b981; font-size:16px; margin:0 0 15px 0; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.5 20.5l-6-6a4.5 4.5 0 0 1 6.5-6.5l6 6a4.5 4.5 0 0 1-6.5 6.5z"/><path d="M14 6l4 4"/></svg>
                            Receta Asignada (${meds.length})
                        </h4>
                        ${medsHtml}
                    ` : `
                        <div style="padding:20px; text-align:center; background:rgba(255,255,255,0.02); border-radius:12px; border:1px dashed rgba(255,255,255,0.1); color:rgba(255,255,255,0.4); font-size:14px;">
                            No hay medicamentos activos en la fórmula actual.
                        </div>
                    `}
                </div>
            </div>
        `;
        
        rxOverlay.onclick = (e) => { if(e.target === rxOverlay) rxOverlay.remove(); };
        document.body.appendChild(rxOverlay);
        document.getElementById('close-rx-btn').onclick = () => rxOverlay.remove();
    };

    // --- VISTAS DEL MÉDICO ---

    window.renderDoctorHome = function(mode = 'register') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const key = getDocPatientsKey();
        const patients = JSON.parse(localStorage.getItem(key) || '[]');

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 1000px; margin: 0 auto; padding: 40px; border: 3px solid rgba(34, 211, 238, 0.45); border-radius: 24px;">

            <div id="view-registration" style="${mode === 'register' ? 'display: block;' : 'display: none;'}">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 20px;">
                    <h3 class="widget-title" style="color: #10b981; font-size: 28px; display: flex; align-items: center; border:none; padding:0; margin:0;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 15px;">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                        </svg>
                        Datos del Paciente
                    </h3>
                    <div style="display:flex; gap:10px;">
                        <button id="btn-reg-back" class="status-badge" style="background: rgba(255,255,255,0.1); padding: 10px 15px; cursor: pointer; border: none; color: white;" onclick="window.renderDoctorHome('search')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;"><polyline points="15 18 9 12 15 6"></polyline></svg> <span id="btn-reg-back-text">Volver a Búsqueda</span>
                        </button>
                        <button class="status-badge" style="background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.3); padding: 10px 15px; cursor: pointer; color: #22d3ee;" onclick="loadSection('overview')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> Menú Principal
                        </button>
                    </div>
                </div>
                
                <!-- Formulario por pestañas -->
                <div id="patient-form" style="margin: 30px 0;">

                    <!-- Barra de pestañas -->
                    <div style="display:flex; border-radius:16px 16px 0 0; overflow:hidden; border:1px solid rgba(255,255,255,0.08); border-bottom:none;">
                        <button class="pf-tab-btn" id="pftab-btn-esenciales" onclick="window.switchPfTab('esenciales',this)"
                            style="flex:1; padding:15px 8px; background:rgba(16,185,129,0.18); border:none; color:#10b981; font-size:12px; font-weight:700; cursor:pointer; border-right:1px solid rgba(255,255,255,0.07); letter-spacing:0.5px; text-transform:uppercase; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Datos Esenciales
                        </button>
                        <button class="pf-tab-btn" id="pftab-btn-personal" onclick="window.switchPfTab('personal',this)"
                            style="flex:1; padding:15px 8px; background:rgba(0,0,0,0.25); border:none; color:rgba(255,255,255,0.4); font-size:12px; font-weight:700; cursor:pointer; border-right:1px solid rgba(255,255,255,0.07); letter-spacing:0.5px; text-transform:uppercase; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Ficha Personal
                        </button>
                        <button class="pf-tab-btn" id="pftab-btn-clinico" onclick="window.switchPfTab('clinico',this)"
                            style="flex:1; padding:15px 8px; background:rgba(0,0,0,0.25); border:none; color:rgba(255,255,255,0.4); font-size:12px; font-weight:700; cursor:pointer; letter-spacing:0.5px; text-transform:uppercase; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Historia Clínica
                        </button>
                    </div>

                    <div style="background:rgba(0,0,0,0.2); border-radius:0 0 15px 15px; border:1px solid rgba(255,255,255,0.05); padding:26px 28px 28px;">

                        <!-- ===== TAB 1: DATOS ESENCIALES ===== -->
                        <div id="pf-tab-esenciales">
                            <p style="font-size:11px; color:rgba(255,255,255,0.3); margin:0 0 20px; text-transform:uppercase; letter-spacing:1px;">Campos prioritarios — requeridos para crear el expediente</p>

                            <div style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:18px; margin-bottom:20px;">
                                <div class="input-group">
                                    <label>Nombre Completo *</label>
                                    <input type="text" id="p-nombre" placeholder="Nombres y Apellidos">
                                </div>
                                <div class="input-group">
                                    <label>Fecha Nacimiento</label>
                                    <input type="date" id="p-fecha-nac">
                                </div>
                                <div class="input-group">
                                    <label>Edad</label>
                                    <input type="number" id="p-edad" placeholder="Años">
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; margin-bottom:20px;">
                                <div class="input-group">
                                    <label>Género</label>
                                    <select id="p-genero" style="width:100%; background:rgba(0,0,0,0.3); color:white; border:1px solid var(--card-border); padding:12px; border-radius:12px;">
                                        <option value="Masculino">Masculino</option>
                                        <option value="Femenino">Femenino</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label>Teléfono de Contacto *</label>
                                    <input type="text" id="p-telefono" placeholder="Ej: +502 ...">
                                </div>
                                <div class="input-group">
                                    <label>ID (DPI, Pasaporte, etc.)</label>
                                    <input type="text" id="p-id" placeholder="No. Identificación">
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:20px;">
                                <div class="input-group">
                                    <label>Tipo de Sangre</label>
                                    <select id="p-sangre" style="width:100%; background:rgba(0,0,0,0.3); color:white; border:1px solid var(--card-border); padding:12px; border-radius:12px;">
                                        <option value="">— Seleccionar —</option>
                                        <option value="A+">A+</option><option value="A-">A-</option>
                                        <option value="B+">B+</option><option value="B-">B-</option>
                                        <option value="AB+">AB+</option><option value="AB-">AB-</option>
                                        <option value="O+">O+</option><option value="O-">O-</option>
                                        <option value="Desconocido">Desconocido</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label>Alergias (Med, Alimentos, etc.)</label>
                                    <input type="text" id="p-alergias" placeholder="Detallar alergias conocidas">
                                </div>
                            </div>

                            <div class="input-group" style="margin-bottom:20px;">
                                <label>Motivo Principal / Diagnóstico Inicial *</label>
                                <input type="text" id="p-motivo" placeholder="Ej. Control de diabetes, Dolor agudo, Revisión general...">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; flex-wrap:wrap; gap:10px;">
                                <button id="btn-add-patient-t1" class="btn-primary" style="padding:14px 28px; font-size:15px; font-weight:700; background:linear-gradient(135deg,#10b981,#059669); flex:1; min-width:200px;" onclick="document.getElementById('btn-add-patient').click()">
                                    GUARDAR FICHA MÉDICA
                                </button>
                                <button type="button" onclick="window.switchPfTab('personal', document.getElementById('pftab-btn-personal'))"
                                    style="padding:14px 22px; background:rgba(34,211,238,0.1); border:1px solid rgba(34,211,238,0.3); color:#22d3ee; border-radius:12px; cursor:pointer; font-size:13px; font-weight:700; display:flex; align-items:center; gap:7px; white-space:nowrap;" onmouseover="this.style.background='rgba(34,211,238,0.2)'" onmouseout="this.style.background='rgba(34,211,238,0.1)'">
                                    Ficha Personal <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- ===== TAB 2: FICHA PERSONAL ===== -->
                        <div id="pf-tab-personal" style="display:none;">
                            <p style="font-size:11px; color:rgba(255,255,255,0.3); margin:0 0 20px; text-transform:uppercase; letter-spacing:1px;">Datos administrativos y de contacto del paciente</p>

                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; margin-bottom:20px;">
                                <div class="input-group">
                                    <label>Estado Civil</label>
                                    <select id="p-civil" style="width:100%; background:rgba(0,0,0,0.3); color:white; border:1px solid var(--card-border); padding:12px; border-radius:12px;">
                                        <option value="Soltero">Soltero</option>
                                        <option value="Soltera">Soltera</option>
                                        <option value="Casado">Casado</option>
                                        <option value="Casada">Casada</option>
                                        <option value="Viudo">Viudo</option>
                                        <option value="Viuda">Viuda</option>
                                        <option value="Divorciado">Divorciado</option>
                                        <option value="Divorciada">Divorciada</option>
                                        <option value="Unión Libre">Unión Libre</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label>Ocupación</label>
                                    <input type="text" id="p-ocupacion" placeholder="Profesión u oficio">
                                </div>
                                <div class="input-group">
                                    <label>Correo Electrónico</label>
                                    <input type="email" id="p-email" placeholder="paciente@ejemplo.com">
                                </div>
                            </div>

                            <div class="input-group" style="margin-bottom:20px;">
                                <label>Dirección de Domicilio</label>
                                <input type="text" id="p-direccion" placeholder="Dirección completa">
                            </div>

                            <h4 style="color:#f59e0b; margin:22px 0 16px; font-size:12px; text-transform:uppercase; letter-spacing:1px; border-top:1px solid rgba(255,255,255,0.06); padding-top:20px; display:flex; align-items:center; gap:7px;">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 9.81a19.79 19.79 0 0 1-3.07-8.72A2 2 0 0 1 2 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                Contacto de Emergencia
                            </h4>
                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; margin-bottom:20px;">
                                <div class="input-group">
                                    <label>Nombre</label>
                                    <input type="text" id="p-emerg-nombre" placeholder="Nombre completo">
                                </div>
                                <div class="input-group">
                                    <label>Relación</label>
                                    <input type="text" id="p-emerg-rel" placeholder="Ej: Madre, Esposo">
                                </div>
                                <div class="input-group">
                                    <label>Teléfono</label>
                                    <input type="text" id="p-emerg-tel" placeholder="Número contacto">
                                </div>
                            </div>

                            <div class="input-group" style="margin-bottom:20px;">
                                <label>Seguro Médico / Cobertura</label>
                                <input type="text" id="p-seguro" placeholder="Aseguradora y No. Póliza">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; flex-wrap:wrap; gap:10px;">
                                <button type="button" onclick="window.switchPfTab('esenciales', document.getElementById('pftab-btn-esenciales'))"
                                    style="padding:14px 22px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.55); border-radius:12px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:7px;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Anterior
                                </button>
                                <button id="btn-add-patient-t2" class="btn-primary" style="padding:14px 28px; font-size:15px; font-weight:700; background:linear-gradient(135deg,#10b981,#059669); flex:1; min-width:160px; margin:0 10px;" onclick="document.getElementById('btn-add-patient').click()">
                                    GUARDAR FICHA MÉDICA
                                </button>
                                <button type="button" onclick="window.switchPfTab('clinico', document.getElementById('pftab-btn-clinico'))"
                                    style="padding:14px 22px; background:rgba(34,211,238,0.1); border:1px solid rgba(34,211,238,0.3); color:#22d3ee; border-radius:12px; cursor:pointer; font-size:13px; font-weight:700; display:flex; align-items:center; gap:7px; white-space:nowrap;" onmouseover="this.style.background='rgba(34,211,238,0.2)'" onmouseout="this.style.background='rgba(34,211,238,0.1)'">
                                    Historia Clínica <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- ===== TAB 3: HISTORIA CLÍNICA ===== -->
                        <div id="pf-tab-clinico" style="display:none;">
                            <p style="font-size:11px; color:rgba(255,255,255,0.3); margin:0 0 20px; text-transform:uppercase; letter-spacing:1px;">Antecedentes médicos y hábitos del paciente</p>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:20px;">
                                <div class="input-group">
                                    <label>Glucosa Basal (mg/dL)</label>
                                    <input type="number" id="p-glucosa" placeholder="Ej: 98">
                                </div>
                                <div class="input-group">
                                    <label>Hábitos (Tabaco, Alcohol, Ejercicio, etc.)</label>
                                    <input type="text" id="p-habitos" placeholder="Estilo de vida">
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:18px;">
                                <div class="input-group">
                                    <label>Antecedentes Personales</label>
                                    <textarea id="p-ant-pers" style="height:88px; width:100%; resize:vertical;" placeholder="Enfermedades crónicas, etc."></textarea>
                                </div>
                                <div class="input-group">
                                    <label>Antecedentes Quirúrgicos</label>
                                    <textarea id="p-ant-quir" style="height:88px; width:100%; resize:vertical;" placeholder="Operaciones previas"></textarea>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:18px;">
                                <div class="input-group">
                                    <label>Antecedentes Familiares</label>
                                    <textarea id="p-ant-fam" style="height:88px; width:100%; resize:vertical;" placeholder="Diabetes, corazón, cáncer, etc."></textarea>
                                </div>
                                <div class="input-group">
                                    <label>Medicamentos Actuales</label>
                                    <textarea id="p-meds-act" style="height:88px; width:100%; resize:vertical;" placeholder="Tratamientos en curso"></textarea>
                                </div>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.07); gap:12px; flex-wrap:wrap;">
                                <button type="button" onclick="window.switchPfTab('personal', document.getElementById('pftab-btn-personal'))"
                                    style="padding:14px 22px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.55); border-radius:12px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:7px; white-space:nowrap;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Anterior
                                </button>
                                <button id="btn-add-patient" class="btn-primary" style="flex:1; padding:20px; font-size:17px; font-weight:700; min-width:200px;">
                                    GUARDAR FICHA MÉDICA Y CREAR EXPEDIENTE
                                </button>
                            </div>
                        </div>

                    </div><!-- /panel interior -->
                </div><!-- /patient-form -->

            </div> <!-- Close view-registration -->
            
            <div id="view-search" style="${mode === 'search' ? 'display: block;' : 'display: none;'} margin-top: -20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 20px; margin-bottom: 30px;">
                    <h3 class="widget-title" style="color: var(--accent); font-size: 28px; display: flex; align-items: center; border:none; padding:0; margin:0;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 15px;">
                            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        Buscador de Pacientes (<span id="patient-count">${patients.length}</span>)
                    </h3>
                    <div style="display:none; gap:10px;">
                        <button id="btn-goto-register" class="btn-primary" style="padding: 12px 24px; font-weight: bold; border-radius: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%);" onclick="window.renderDoctorHome('register')">
                            + Datos del Paciente
                        </button>
                        <button onclick="window.showPatientList()" style="padding: 12px 20px; font-weight: bold; border-radius: 12px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.35); color: #60a5fa; cursor:pointer; font-size:14px; display:inline-flex; align-items:center; gap:8px;">
                            👥 Lista de Pacientes
                        </button>
                        <button class="status-badge" style="background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.3); padding: 10px 18px; cursor: pointer; color: #22d3ee; font-size:14px;" onclick="loadSection('overview')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> Menú Principal
                        </button>
                    </div>
                </div>
                
                <div class="input-group" style="margin-bottom: 20px;">
                    <input type="text" id="patient-search" placeholder="Escriba nombre, DPI o teléfono..." onkeyup="window.filterPatients()" style="width: 100%; padding: 18px; font-size: 18px; border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); color: white;">
                </div>

                <div id="default-appointments-view">
                ${(() => {
                    const now = new Date();
                    const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
                    const todayStrES = now.toLocaleDateString('es-ES');
                    
                    const appts = window.getAppointments ? window.getAppointments() : [];
                    
                    const upcomingRaw = appts.filter(a => {
                        if (a.date !== today) return false;
                        const pData = getPatientDataFallback(a.qsl);
                        const hasConsultedToday = (pData.consultations || []).some(c => typeof c.date === 'string' && (c.date.includes(todayStrES) || c.date.startsWith(todayStrES)));
                        const hasMedsToday = (pData.meds || []).some(m => m.id && new Date(parseInt(m.id)).toLocaleDateString('es-ES') === todayStrES);
                        return !(hasConsultedToday || hasMedsToday);
                    })
                    .sort((a,b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

                    // Deduplicar por paciente (qsl): un paciente = un turno en la lista,
                    // mostrando solo su cita más temprana del día.
                    const seenQsl = new Set();
                    const upcoming = upcomingRaw.filter(a => {
                        if (seenQsl.has(a.qsl)) return false;
                        seenQsl.add(a.qsl);
                        return true;
                    }).slice(0, 10);

                    // Render que SIEMPRE muestra ambas secciones (si aplica):
                    //   1. Próximas Citas para Hoy
                    //   2. Pacientes Registrados (acceso rápido) — excluyendo los del paso 1
                    let html = '';
                    const qslsEnCitaHoy = new Set(upcoming.map(u => u.qsl));

                    if (upcoming.length > 0) {
                        const items = upcoming.map(u => `
                            <div class="med-item" style="cursor:pointer; padding:18px 24px; background:linear-gradient(145deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02)); border-left: 5px solid #10b981; border-radius: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-right: 1px solid rgba(16,185,129,0.1); border-top: 1px solid rgba(16,185,129,0.1); border-bottom: 1px solid rgba(16,185,129,0.1);" onclick="window.selectPatientAndGoToConsultation('${u.qsl}')">
                                <div class="med-info">
                                    <h4 style="color:white; font-size:20px; font-weight: 600; margin-bottom: 6px;">${u.name}</h4>
                                    <p style="color:rgba(255,255,255,0.6); font-size:14px; margin: 0;">ID: <b style="color:#10b981">${u.qsl}</b></p>
                                </div>
                                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                                    <div style="color: #10b981; font-size: 24px; font-weight: 700; background: rgba(16,185,129,0.1); padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(16,185,129,0.2); display: inline-block;">
                                        ⏰ ${u.time}
                                    </div>
                                    <div>
                                        <span class="status-badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-size: 12px; padding: 4px 10px;">Cita de Hoy</span>
                                    </div>
                                </div>
                            </div>`).join('');
                        html += `<div style="margin-bottom:25px;">
                            <h4 style="color:#10b981; font-size:15px; text-transform:uppercase; letter-spacing:1px; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                Próximas Citas para Hoy (${upcoming.length})
                            </h4>
                            <div>${items}</div>
                        </div>`;
                    }

                    // SIEMPRE mostrar pacientes registrados (excluyendo los ya listados arriba)
                    const recent = patients.filter(qsl => !qslsEnCitaHoy.has(qsl)).slice(-20).reverse();
                    if (recent.length > 0) {
                        const recentItems = recent.map(qsl => {
                            const pd = JSON.parse(localStorage.getItem(`patient_data_${qsl}`) || '{}');
                            const nm = pd.nombre_completo || localStorage.getItem(`patient_name_${qsl}`) || qsl;
                            const tel = pd.telefono || '—';
                            return `<div class="med-item" style="cursor:pointer; padding:14px 20px; background:linear-gradient(145deg, rgba(59,130,246,0.06), rgba(59,130,246,0.02)); border-left: 4px solid #3b82f6; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;" onclick="window.selectPatientAndGoToConsultation('${qsl}')">
                                <div class="med-info">
                                    <h4 style="color:white; font-size:17px; font-weight: 600; margin-bottom: 4px;">${nm}</h4>
                                    <p style="color:rgba(255,255,255,0.55); font-size:13px; margin: 0;">📞 ${tel} &nbsp;·&nbsp; ID: <b style="color:#60a5fa">${qsl}</b></p>
                                </div>
                                <span class="status-badge" style="background:rgba(59,130,246,0.12); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); font-size: 12px; padding: 6px 12px;">Abrir Consulta</span>
                            </div>`;
                        }).join('');
                        html += `<div style="margin-bottom:25px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                                <h4 style="color:#60a5fa; font-size:15px; text-transform:uppercase; letter-spacing:1px; margin:0; display:flex; align-items:center; gap:8px;">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                    Pacientes Registrados (acceso rápido)
                                </h4>
                                <span style="color:rgba(255,255,255,0.35); font-size:12px;">Mostrando ${recent.length} pacientes${upcoming.length ? ' (sin contar los de cita de hoy)' : ''}</span>
                            </div>
                            <div>${recentItems}</div>
                        </div>`;
                    }

                    if (!html) {
                        html = `<div style="text-align:center; padding: 40px; opacity: 0.5; font-size: 18px;">Aún no hay pacientes registrados. Utilice el botón "Datos del Paciente" para registrar uno.</div>`;
                    }
                    return html;
                })()}
                </div>

                <div id="search-results-view" style="display: none;"></div>

                <div id="all-patients-data" style="display: none;">
                    ${patients.map(qsl => {
                        const name = localStorage.getItem(`patient_name_${qsl}`) || 'Paciente';
                        const data = getPatientData(qsl);
                        const phone = data.telefono || '';
                        const id = data.id_identificacion || '';
                        const searchStr = `${name} ${qsl} ${phone} ${id}`.toLowerCase().replace(/['"]/g, '');
                        return `<div class="patient-row-data" data-search="${searchStr}" data-qsl="${qsl}" data-name="${name.replace(/['"]/g, '&quot;')}" data-illness="${(data.illness || 'Sin diagnóstico').replace(/['"]/g, '&quot;')}"></div>`;
                    }).join('')}
                </div>

            </div> <!-- Close view-search -->
            </div> <!-- Close widget-card -->
        `;

        // Controlador de pestañas del formulario de paciente
        window.switchPfTab = function(tab, btn) {
            ['esenciales','personal','clinico'].forEach(t => {
                const el = document.getElementById('pf-tab-' + t);
                if (el) el.style.display = 'none';
                const b = document.getElementById('pftab-btn-' + t);
                if (b) {
                    b.style.background = 'rgba(0,0,0,0.25)';
                    b.style.color = 'rgba(255,255,255,0.4)';
                }
            });
            const active = document.getElementById('pf-tab-' + tab);
            if (active) active.style.display = 'block';
            if (btn) {
                btn.style.background = 'rgba(16,185,129,0.18)';
                btn.style.color = '#10b981';
            }
        };

        const fechaNacInput = document.getElementById('p-fecha-nac');
        const edadInput = document.getElementById('p-edad');
        if (fechaNacInput && edadInput) {
            fechaNacInput.addEventListener('change', () => {
                const birthDate = new Date(fechaNacInput.value);
                if (!isNaN(birthDate)) {
                    const today = new Date();
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                    edadInput.value = age >= 0 ? age : '';
                } else {
                    edadInput.value = '';
                }
            });
        }

        document.getElementById('btn-add-patient').onclick = () => {
            const nombre = document.getElementById('p-nombre').value.trim();
            const telefono = document.getElementById('p-telefono').value.trim();
            const motivo = document.getElementById('p-motivo').value.trim();

            if (!nombre || !telefono) {
                window.showElegantAlert('Error', 'Nombre y Teléfono son obligatorios.', true);
                return;
            }

            // Generar QSL Automático
            const parts = nombre.split(/\s+/);
            const first = (parts[0] || 'A').charAt(0).toUpperCase();
            const second = (parts.length > 1 ? parts[1].charAt(0) : 'X').toUpperCase();
            const digitsOnly = telefono.replace(/\D/g, '');
            const last4Phone = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : telefono.slice(-4).padStart(4, '0').toUpperCase();
            
            let baseQsl = `${first}${second}${last4Phone}`;
            let qsl = baseQsl;

            const patientData = {
                nombre_completo: nombre,
                fecha_nacimiento: document.getElementById('p-fecha-nac').value,
                edad: document.getElementById('p-edad').value,
                genero: document.getElementById('p-genero').value,
                id_identificacion: document.getElementById('p-id').value,
                estado_civil: document.getElementById('p-civil').value,
                ocupacion: document.getElementById('p-ocupacion').value,
                direccion: document.getElementById('p-direccion').value,
                telefono: telefono,
                email: document.getElementById('p-email').value,
                contacto_emergencia_nombre: document.getElementById('p-emerg-nombre').value,
                contacto_emergencia_relacion: document.getElementById('p-emerg-rel').value,
                contacto_emergencia_tel: document.getElementById('p-emerg-tel').value,
                seguro_medico: document.getElementById('p-seguro').value,
                tipo_sangre: document.getElementById('p-sangre').value,
                glucosa: document.getElementById('p-glucosa')?.value || '',
                alergias: document.getElementById('p-alergias').value,
                antecedentes_personales: document.getElementById('p-ant-pers').value,
                antecedentes_quirurgicos: document.getElementById('p-ant-quir').value,
                antecedentes_familiares: document.getElementById('p-ant-fam').value,
                medicamentos_actuales: document.getElementById('p-meds-act').value,
                habitos: document.getElementById('p-habitos').value,
                illness: motivo,
                meds: []
            };

            // Guardar
            const key = getDocPatientsKey();
            const existingPatients = JSON.parse(localStorage.getItem(key) || '[]');
            if (existingPatients.includes(qsl)) {
                qsl = baseQsl + Math.floor(Math.random() * 90);
            }

            localStorage.setItem(`patient_name_${qsl}`, nombre);
            localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(patientData));

            if (!existingPatients.includes(qsl)) {
                existingPatients.push(qsl);
                localStorage.setItem(key, JSON.stringify(existingPatients));
            }

            // Push inmediato a la nube para sincronización entre máquinas
            try {
                const doctor_id = localStorage.getItem('current_doctor_id') || 'MED-MASTER';
                fetch(`/api/patient/${qsl}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: patientData, doctor_id })
                }).catch(e => console.error('Cloud push error:', e));
            } catch (e) { console.error(e); }

            const pendingDate = localStorage.getItem('pending_appt_date');
            const pendingTime = localStorage.getItem('pending_appt_time');
            if(pendingDate && pendingTime) {
                try {
                    window.saveAppointment({ qsl: qsl, name: nombre, date: pendingDate, time: pendingTime });
                    localStorage.removeItem('pending_appt_date');
                    localStorage.removeItem('pending_appt_time');
                    window.showElegantAlert('Expediente y Cita Creados', `Se registró a ${nombre} y se agendó para el ${pendingDate} a las ${pendingTime}.`);
                    window.selectPatientAndGoToConsultation(qsl);
                } catch(e) {
                    window.showElegantAlert('Expediente Creado', `Se ha registrado exitosamente a ${nombre}. Código de acceso: ${qsl}`);
                    window.selectPatient(qsl);
                }
            } else {
                window.showElegantAlert('Expediente Creado', `Se ha registrado exitosamente a ${nombre}. Código de acceso: ${qsl}`);
                window.selectPatient(qsl);
            }
        };
    }

    window.filterPatients = () => {
        const searchInput = document.getElementById('patient-search');
        if (!searchInput) return;
        const query = searchInput.value.toLowerCase().trim();
        const defaultView = document.getElementById('default-appointments-view');
        const resultsView = document.getElementById('search-results-view');
        const key = getDocPatientsKey();
        const totalPatients = JSON.parse(localStorage.getItem(key) || '[]').length;
        const countSpan = document.getElementById('patient-count');
        
        if (query.length === 0) {
            if (defaultView) defaultView.style.display = 'block';
            if (resultsView) resultsView.style.display = 'none';
            if (countSpan) countSpan.textContent = totalPatients;
            return;
        }

        if (defaultView) defaultView.style.display = 'none';
        if (resultsView) {
            resultsView.style.display = 'block';
            const rows = document.querySelectorAll('#all-patients-data .patient-row-data');
            let visibleCount = 0;
            let html = '<h4 style="color:#60a5fa; font-size:15px; text-transform:uppercase; letter-spacing:1px; margin-bottom:16px;">🔍 Resultados de Búsqueda</h4>';
            
            rows.forEach(row => {
                const searchData = row.getAttribute('data-search') || '';
                if (searchData.includes(query)) {
                    visibleCount++;
                    const qsl = row.getAttribute('data-qsl');
                    const name = row.getAttribute('data-name');
                    const illness = row.getAttribute('data-illness');
                    html += `
                        <div class="med-item" style="cursor: pointer; padding: 20px; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 15px;" onclick="window.selectPatientAndGoToConsultation('${qsl}')" onmouseover="this.style.background='rgba(59,130,246,0.05)'; this.style.borderColor='rgba(59,130,246,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.02)'; this.style.borderColor='rgba(255,255,255,0.05)';">
                            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <div class="med-info">
                                    <h4 style="color: white; font-size: 20px; margin-bottom: 4px;">${name}</h4>
                                    <p style="color: var(--text-muted); font-size: 14px; margin: 0;">Código: <b style="color:var(--accent);">${qsl}</b> | ${illness}</p>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <span class="status-badge" style="background: rgba(59,130,246,0.1); color: #60a5fa; border: 1px solid rgba(59,130,246,0.2);">Ver Expediente</span>
                                    <button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: 1px solid rgba(239, 68, 68, 0.2);" onclick="event.stopPropagation(); window.deletePatient('${qsl}')">Eliminar</button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });

            if (visibleCount === 0) {
                html += `<div style="text-align:center; padding: 40px; opacity: 0.5; font-size: 16px;">No se encontraron pacientes para "${query}".</div>`;
            }
            resultsView.innerHTML = html;
            if (countSpan) countSpan.textContent = visibleCount;
        }
    };

    window.selectPatient = (qsl) => {
        selectedPatientQSL = qsl;
        loadSection('overview');
    };

    window.deletePatient = (qsl) => {
        if (confirm(`¿Eliminar permanentemente el expediente del paciente ${qsl}? Esta acción borrará todas sus recetas y datos del sistema.`)) {
            localStorage.removeItem(`patient_name_${qsl}`);
            localStorage.removeItem(`patient_data_${qsl}`);
            localStorage.removeItem(`active_qsl_${qsl}`);
            localStorage.setItem(key, JSON.stringify(list));
            loadSection('overview');
        }
    };

    function renderOverview(data) {
        const patientName = localStorage.getItem(`patient_name_${selectedPatientQSL}`) || 'Paciente';
        const isMed = userRole === 'medico';

        contentArea.innerHTML = `
            <div class="dashboard-grid">
                <!-- Seccion 1: FICHA CLINICA -->
                <div class="widget-card animate-in" style="grid-column: span 2; padding: 40px; border: 3px solid rgba(34, 211, 238, 0.4); border-radius: 24px;">
                    <h3 class="widget-title" style="font-size: 26px; color: var(--accent); border-bottom: 2px solid rgba(34, 211, 238, 0.1); padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between;">
                        <span>Ficha Clínica Permanente</span>
                        <span style="font-size: 16px; opacity: 0.7;">QSL: ${selectedPatientQSL}</span>
                    </h3>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                        <div class="input-group">
                            <label>Nombre Completo</label>
                            <input type="text" id="view-nombre" value="${data.nombre_completo || patientName}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Fecha Nacimiento</label>
                            <input type="text" id="view-fecha-nac" value="${data.fecha_nacimiento || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Edad</label>
                            <input type="text" id="view-edad" value="${data.edad || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                        <div class="input-group">
                            <label>Género</label>
                            <input type="text" id="view-genero" value="${data.genero || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>DPI / Identificación</label>
                            <input type="text" id="view-id" value="${data.id_identificacion || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Estado Civil</label>
                            <input type="text" id="view-civil" value="${data.estado_civil || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 30px;">
                        <div class="input-group">
                            <label>Ocupación</label>
                            <input type="text" id="view-ocupacion" value="${data.ocupacion || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Dirección</label>
                            <input type="text" id="view-direccion" value="${data.direccion || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Teléfono</label>
                            <input type="text" id="view-telefono" value="${data.telefono || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                        <div class="input-group">
                            <label>Correo Electrónico</label>
                            <input type="email" id="view-email" value="${data.email || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Seguro Médico / Póliza</label>
                            <input type="text" id="view-seguro" value="${data.seguro_medico || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                    </div>

                    <h4 style="color: var(--accent); font-size: 14px; text-transform: uppercase; margin: 30px 0 20px;">Contacto de Emergencia</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 30px;">
                        <div class="input-group">
                            <label>Nombre Aviso</label>
                            <input type="text" id="view-emerg-nombre" value="${data.contacto_emergencia_nombre || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Relación</label>
                            <input type="text" id="view-emerg-rel" value="${data.contacto_emergencia_relacion || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Teléfono Aviso</label>
                            <input type="text" id="view-emerg-tel" value="${data.contacto_emergencia_tel || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                    </div>

                    <h4 style="color: var(--accent); font-size: 14px; text-transform: uppercase; margin: 30px 0 20px;">Antecedentes y Estilo de Vida</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Alergias</label>
                            <textarea id="view-alergias" style="height: 60px; width: 100%;" ${!isMed ? 'disabled' : ''}>${data.alergias || ''}</textarea>
                        </div>
                        <div class="input-group">
                            <label>Tipo de Sangre</label>
                            <input type="text" id="view-sangre" value="${data.tipo_sangre || ''}" ${!isMed ? 'disabled' : ''}>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Ant. Personales / Quirúrgicos</label>
                            <textarea id="view-ant-pers" style="height: 80px; width: 100%;" ${!isMed ? 'disabled' : ''}>${data.antecedentes_personales || ''}</textarea>
                        </div>
                        <div class="input-group">
                            <label>Ant. Familiares</label>
                            <textarea id="view-ant-fam" style="height: 80px; width: 100%;" ${!isMed ? 'disabled' : ''}>${data.antecedentes_familiares || ''}</textarea>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Medicamentos Actuales</label>
                            <textarea id="view-meds-act" style="height: 60px; width: 100%;" ${!isMed ? 'disabled' : ''}>${data.medicamentos_actuales || ''}</textarea>
                        </div>
                        <div class="input-group">
                            <label>Hábitos (Tabaco, Alcohol, Actividad)</label>
                            <textarea id="view-habitos" style="height: 60px; width: 100%;" ${!isMed ? 'disabled' : ''}>${data.habitos || ''}</textarea>
                        </div>
                    </div>

                    <div class="input-group" style="margin-top: 30px; border-top: 2px solid var(--accent); padding-top: 25px;">
                        <label style="font-size: 18px; color: var(--accent); margin-bottom: 10px;">Motivo de Consulta Actual / Evolución</label>
                        <textarea id="view-motivo" style="height: 100px; width: 100%; background: rgba(34, 211, 238, 0.05); font-size: 18px;" ${!isMed ? 'disabled' : ''}>${data.illness || ''}</textarea>
                    </div>

                    ${isMed ? `<button class="btn-primary" style="width: 100%; margin-top: 30px; padding: 20px;" onclick="window.savePatientChanges()">ACTUALIZAR DATOS DEL EXPEDIENTE</button>` : ''}
                </div>

                <!-- Seccion 2: RECETAS -->
                <div class="widget-card animate-in" style="grid-column: span 2; margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
                        <h3 class="widget-title" style="margin: 0;">Medicación y Recetas</h3>
                        ${isMed ? `<button id="add-btn" class="status-badge" style="background: var(--accent); color: #000; cursor: pointer; border: none; font-weight: 700; padding: 8px 15px;">+ NUEVA RECETA</button>` : ''}
                    </div>
                    
                    <div id="med-form" style="display: none; background: rgba(0,0,0,0.2); padding: 25px; border-radius: 15px; margin-bottom: 25px; border: 1px dashed var(--accent);">
                        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="input-group"><label>Medicamento</label><input type="text" id="m-name"></div>
                            <div class="input-group"><label>Dosis</label><input type="text" id="m-dose"></div>
                            <div class="input-group"><label>Frecuencia(h)</label><input type="number" id="m-freq"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                            <div class="input-group"><label>Inicio</label><input type="time" id="m-start" value="08:00"></div>
                            <div class="input-group"><label>Días</label><input type="number" id="m-days"></div>
                            <div class="input-group"><label>Indicaciones</label><input type="text" id="m-notes"></div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button id="btn-med-save" class="btn-primary" style="flex: 1; padding: 15px;">Guardar Receta</button>
                            <button id="btn-med-cancel" class="btn-secondary" style="flex: 1; padding: 15px;">Cancelar</button>
                        </div>
                    </div>

                    <div class="med-list">
                        ${(data.meds || []).length > 0 ? data.meds.map(m => `
                            <div style="padding: 15px; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: var(--accent); font-size: 18px;">${m.name}</strong>
                                    <p style="font-size: 14px; opacity: 0.8; margin-top: 4px;">${m.dose} | Cada ${m.frequency}h | ${m.days} días | <span style="color: #10b981;">Inicia: ${m.startTime}</span></p>
                                    <p style="font-size: 13px; font-style: italic; opacity: 0.6;">"${m.notes || 'Sin observaciones'}"</p>
                                </div>
                                ${isMed ? `<button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: none;" onclick="window.deleteMed(${m.id})">Borrar</button>` : ''}
                            </div>
                        `).join('') : '<p style="text-align: center; opacity: 0.5; padding: 20px;">No hay medicación asignada.</p>'}
                    </div>
                </div>

                <!-- Seccion 3: OTROS DATOS -->
                <div class="widget-card animate-in" style="grid-column: span 2; margin-top: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h4 style="color: var(--accent); font-size: 14px; text-transform: uppercase;">Acompañante / Emergencia</h4>
                            <p style="margin-top: 10px;"><strong>Nombre:</strong> ${data.contacto_emergencia_nombre || 'No registrado'}</p>
                            <p><strong>Relación:</strong> ${data.contacto_emergencia_relacion || '-'}</p>
                            <p><strong>Tel:</strong> ${data.contacto_emergencia_tel || '-'}</p>
                        </div>
                        <div>
                            <h4 style="color: var(--accent); font-size: 14px; text-transform: uppercase;">Configuración de Conexión</h4>
                            <div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 15px; text-align: center; margin-top: 10px; border: 1px solid rgba(255,255,255,0.05);">
                                <h3 style="color: var(--accent); margin-bottom: 10px; font-size: 24px;">${selectedPatientQSL}</h3>
                                <p style="font-size: 13px; opacity: 0.6; margin-bottom: 20px;">Código para acceso desde app móvil</p>
                                
                                ${isMed ? `
                                    <div id="status-container-${selectedPatientQSL}">
                                        ${localStorage.getItem(`active_qsl_${selectedPatientQSL}`) === 'true' ? `
                                            <div style="color: #10b981; font-weight: 700; background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 10px; border: 1px solid rgba(16, 185, 129, 0.3); margin-bottom: 15px;">
                                                ✓ SERVICIO ACTIVADO
                                            </div>
                                            <button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: none; cursor: pointer; width: 100%;" onclick="window.toggleAlerts('${selectedPatientQSL}', false)">DESACTIVAR ALERTAS</button>
                                        ` : `
                                            <button class="btn-primary" style="width: 100%; background: #10b981; padding: 15px;" onclick="window.toggleAlerts('${selectedPatientQSL}', true)">
                                                ACTIVAR ALERTAS MÓVILES
                                            </button>
                                        `}
                                    </div>
                                ` : `
                                     <div style="color: ${localStorage.getItem(`active_qsl_${selectedPatientQSL}`) === 'true' ? '#10b981' : 'var(--error)'}; font-weight: 600;">
                                        STATUS: ${localStorage.getItem(`active_qsl_${selectedPatientQSL}`) === 'true' ? 'ACTIVADO' : 'PENDIENTE'}
                                     </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (isMed) {
            setupMedFormActions();
        }
    }

    window.savePatientChanges = () => {
        const data = getPatientData(selectedPatientQSL);
        data.nombre_completo = document.getElementById('view-nombre').value;
        data.fecha_nacimiento = document.getElementById('view-fecha-nac').value;
        data.edad = document.getElementById('view-edad').value;
        data.genero = document.getElementById('view-genero').value;
        data.id_identificacion = document.getElementById('view-id').value;
        data.estado_civil = document.getElementById('view-civil').value;
        data.ocupacion = document.getElementById('view-ocupacion').value;
        data.direccion = document.getElementById('view-direccion').value;
        data.telefono = document.getElementById('view-telefono').value;
        data.email = document.getElementById('view-email').value;
        data.seguro_medico = document.getElementById('view-seguro').value;
        data.contacto_emergencia_nombre = document.getElementById('view-emerg-nombre').value;
        data.contacto_emergencia_relacion = document.getElementById('view-emerg-rel').value;
        data.contacto_emergencia_tel = document.getElementById('view-emerg-tel').value;
        data.alergias = document.getElementById('view-alergias').value;
        data.tipo_sangre = document.getElementById('view-sangre').value;
        data.antecedentes_personales = document.getElementById('view-ant-pers').value;
        data.antecedentes_familiares = document.getElementById('view-ant-fam').value;
        data.medicamentos_actuales = document.getElementById('view-meds-act').value;
        data.habitos = document.getElementById('view-habitos').value;
        data.illness = document.getElementById('view-motivo').value;

        savePatientData(selectedPatientQSL, data);
        localStorage.setItem(`patient_name_${selectedPatientQSL}`, data.nombre_completo);
        window.showElegantAlert('Cambios Guardados', 'El expediente ha sido actualizado exitosamente.');
        renderOverview(data);
    };

    function setupMedFormActions() {
        const addBtn = document.getElementById('add-btn');
        const medForm = document.getElementById('med-form');
        const btnSave = document.getElementById('btn-med-save');
        const btnCancel = document.getElementById('btn-med-cancel');

        if (addBtn && medForm) {
            addBtn.onclick = () => { medForm.style.display = 'block'; addBtn.style.display = 'none'; };
            btnCancel.onclick = () => { medForm.style.display = 'none'; addBtn.style.display = 'inline-block'; };
            btnSave.onclick = () => {
                const med = {
                    id: Date.now(),
                    name: document.getElementById('m-name').value,
                    dose: document.getElementById('m-dose').value,
                    frequency: document.getElementById('m-freq').value,
                    startTime: document.getElementById('m-start').value,
                    days: document.getElementById('m-days').value,
                    notes: document.getElementById('m-notes').value
                };
                if (med.name && med.dose && med.frequency) {
                    const data = getPatientData(selectedPatientQSL);
                    data.meds.push(med);
                    savePatientData(selectedPatientQSL, data);
                    renderOverview(data);
                    window.showElegantAlert('Receta Guardada', 'Medicamento añadido al historial.');
                }
            };
        }
    }

    window.renderNewPrescription = () => {
        const overlay = document.createElement('div');
        overlay.id = 'prescription-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:20px;box-sizing:border-box;';

        const patientName = localStorage.getItem('patient_name_' + selectedPatientQSL) || 'Paciente';
        const data = getPatientData(selectedPatientQSL) || {};

        overlay.innerHTML = `
            <div class="widget-card animate-in" style="background: linear-gradient(145deg, #1e293b, #0f172a); border: 2px solid rgba(16, 185, 129, 0.4); border-radius: 24px; padding: 45px; width: 100%; max-width: 840px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); position: relative;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom:20px;">
                    <h3 style="color:#10b981; font-size:28px; margin:0; display:flex; align-items:center; gap:12px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                        Nueva Receta - <span style="color:white; font-size:24px; opacity: 0.9;">${patientName}</span>
                    </h3>
                    <button onclick="document.getElementById('prescription-overlay').remove()" style="background:rgba(255,255,255,0.1); border:none; color:white; width:40px; height:40px; font-size:20px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">✕</button>
                </div>
                
                <p style="color:rgba(255,255,255,0.7); font-size:16px; margin-bottom:30px;">Agregue los medicamentos para su fórmula. Se sincronizará automáticamente con su celular.</p>

                <div style="background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.2); border-radius: 14px; padding: 24px; margin-bottom: 30px;">
                    <div style="font-size:14px; color:#34d399; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:16px;">PACIENTE DEBERÁ INGRESAR:</div>
                    <div style="display:flex; gap:40px;">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;" title="Al activar, el paciente verá un formulario para ingresar su nivel de Glucosa con fecha y hora">
                            <input type="checkbox" id="np-glucose-enable" style="width:22px; height:22px; accent-color:#10b981; cursor:pointer;">
                            <span style="font-size:17px; color:white; font-weight:500;">🩸 Glucosa</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;" title="Al activar, el paciente verá un formulario para ingresar su Presión Arterial con fecha y hora">
                            <input type="checkbox" id="np-pressure-enable" style="width:22px; height:22px; accent-color:#f87171; cursor:pointer;">
                            <span style="font-size:17px; color:white; font-weight:500;">❤️ Presión Arterial</span>
                        </label>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 24px;">
                    <div class="input-group" style="margin-bottom:0;">
                        <label style="font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:10px; display:block; font-weight:600; letter-spacing:0.5px;">💊 MEDICAMENTO</label>
                        <input type="text" id="np-name" placeholder="Ej: Amoxicilina 500mg" style="width:100%; border:1px solid rgba(16,185,129,0.4); background:rgba(0,0,0,0.3); color:white; padding:18px; font-size:18px; border-radius:12px; transition:border 0.2s;" onfocus="this.style.borderColor='#34d399'" onblur="this.style.borderColor='rgba(16,185,129,0.4)'">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                    <div class="input-group" style="margin-bottom:0;">
                        <label style="font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:10px; display:block; font-weight:600; letter-spacing:0.5px;">📊 DOSIS</label>
                        <input type="text" id="np-dose" placeholder="Ej: 1 tableta" style="width:100%; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.3); color:white; padding:18px; font-size:18px; border-radius:12px;">
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label style="font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:10px; display:block; font-weight:600; letter-spacing:0.5px;">⏱️ FRECUENCIA (H)</label>
                        <input type="number" id="np-freq" placeholder="Ej: 8" style="width:100%; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.3); color:white; padding:18px; font-size:18px; border-radius:12px;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                    <div class="input-group" style="margin-bottom:0;">
                        <label style="font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:10px; display:block; font-weight:600; letter-spacing:0.5px;">⏰ HORA DE INICIO</label>
                        <div style="display:flex; gap:10px;">
                            <select id="np-start-hour" style="flex:1; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.4); color:white; padding:18px; font-size:18px; border-radius:12px; cursor:pointer;-webkit-appearance: none;">
                                ${Array.from({length:12}, (_,i) => i+1).map(h => `<option value="${String(h).padStart(2,'0')}" ${h===8?'selected':''}>${String(h).padStart(2,'0')}</option>`).join('')}
                            </select>
                            <span style="display:flex; align-items:center; color:white; font-size:24px; font-weight:bold;">:</span>
                            <select id="np-start-min" style="flex:1; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.4); color:white; padding:18px; font-size:18px; border-radius:12px; cursor:pointer;-webkit-appearance: none;">
                                ${['00','15','30','45'].map(m => `<option value="${m}">${m}</option>`).join('')}
                            </select>
                            <select id="np-start-ampm" style="flex:1; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.4); color:white; padding:18px; font-size:18px; border-radius:12px; cursor:pointer;-webkit-appearance: none;">
                                <option value="AM" selected>AM</option>
                                <option value="PM">PM</option>
                            </select>
                        </div>
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label style="font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:10px; display:block; font-weight:600; letter-spacing:0.5px;">📅 DÍAS TRATAMIENTO</label>
                        <input type="number" id="np-days" placeholder="Ej: 7" style="width:100%; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.3); color:white; padding:18px; font-size:18px; border-radius:12px;">
                    </div>
                </div>

                <div class="input-group" style="margin-bottom:30px;">
                    <label style="font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:10px; display:block; font-weight:600; letter-spacing:0.5px;">📝 INDICACIONES</label>
                    <input type="text" id="np-notes" placeholder="Ej: Tomar con alimentos" style="width:100%; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.3); color:white; padding:18px; font-size:18px; border-radius:12px;">
                </div>

                <div id="np-meds-list" style="margin-bottom: 24px; max-height: 180px; overflow-y: auto; padding-right:10px;"></div>

                <div id="np-feedback" style="color:#10b981; font-weight:600; font-size:15px; margin-bottom:15px; text-align:center; min-height:22px;"></div>

                <div style="display:flex; gap:16px;">
                    <button id="btn-np-add-another" style="flex:2; padding: 22px; font-size:18px; font-weight:700; border-radius:14px; background: rgba(16,185,129,0.1); border: 2px dashed rgba(16,185,129,0.5); color: #34d399; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(16,185,129,0.2)'" onmouseout="this.style.background='rgba(16,185,129,0.1)'">
                        ➕ Agregar otra fila de Medicamento
                    </button>
                    <button id="btn-np-save" class="btn-primary" style="flex:1; padding: 22px; font-size:18px; font-weight:700; border-radius:14px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                        💾 Finalizar y Guardar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        setTimeout(() => document.getElementById('np-name')?.focus(), 100);

        const getMedData = () => {
            return {
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: overlay.querySelector('#np-name').value.trim(),
                dose: overlay.querySelector('#np-dose').value.trim(),
                frequency: overlay.querySelector('#np-freq').value,
                startTime: `${overlay.querySelector('#np-start-hour').value}:${overlay.querySelector('#np-start-min').value} ${overlay.querySelector('#np-start-ampm').value}`,
                days: overlay.querySelector('#np-days').value,
                notes: overlay.querySelector('#np-notes').value.trim()
            };
        };

        const clearMedData = () => {
            overlay.querySelector('#np-name').value = '';
            overlay.querySelector('#np-dose').value = '';
            overlay.querySelector('#np-freq').value = '';
            overlay.querySelector('#np-days').value = '';
            overlay.querySelector('#np-notes').value = '';
            setTimeout(() => overlay.querySelector('#np-name')?.focus(), 100);
        };

        const renderPreviewMeds = () => {
            const currentData = getPatientData(selectedPatientQSL);
            const currentMeds = currentData.meds || [];
            const listContainer = overlay.querySelector('#np-meds-list');
            if (currentMeds.length === 0) {
                listContainer.innerHTML = '';
                return;
            }
            listContainer.innerHTML = `
                <div style="font-size:14px; color:#34d399; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">MEDICAMENTOS EN ESTA RECETA (${currentMeds.length}):</div>
                ${currentMeds.map(m => `
                    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:white; font-size:16px;">${m.name}</strong> - <span style="color:rgba(255,255,255,0.7); font-size:14px;">${m.dose} c/${m.frequency}h por ${m.days} días</span>
                        </div>
                        <button onclick="window.npDeleteMed(${m.id})" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; border-radius:6px; cursor:pointer; padding:4px 10px; font-size:12px; font-weight:bold; transition: background 0.2s;" onmouseenter="this.style.background='rgba(239,68,68,0.3)'" onmouseleave="this.style.background='rgba(239,68,68,0.2)'">Quitar</button>
                    </div>
                `).join('')}
            `;
        };
        
        window.npDeleteMed = (id) => {
            const cData = getPatientData(selectedPatientQSL);
            if(cData.meds) {
                cData.meds = cData.meds.filter(x => x.id !== id);
                savePatientData(selectedPatientQSL, cData);
                renderPreviewMeds();
            }
        };

        renderPreviewMeds();

        let addedCount = 0;

        overlay.querySelector('#btn-np-add-another').onclick = () => {
            const med = getMedData();
            if (!(med.name && med.dose && med.frequency)) {
                window.showElegantAlert('Faltan Datos', 'Complete al menos Medicamento, Dosis y Frecuencia para agregarlo a la lista de indicaciones.', true);
                return;
            }

            const data = getPatientData(selectedPatientQSL);
            if(!data.meds) data.meds = [];
            data.meds.push(med);
            savePatientData(selectedPatientQSL, data);

            addedCount++;
            overlay.querySelector('#np-feedback').innerHTML = `✅ Se agregó <b>${med.name}</b>. Puede redactar el siguiente medicamento.`;
            clearMedData();
            renderPreviewMeds();
        };

        overlay.querySelector('#btn-np-save').onclick = () => {
            const med = getMedData();
            const hasMedData = med.name || med.dose || med.frequency;

            if (hasMedData && !(med.name && med.dose && med.frequency)) {
                window.showElegantAlert('Faltan Datos', 'El medicamento en curso está incompleto. Complételo o borre el texto para poder finalizar la receta.', true);
                return;
            }

            const data = getPatientData(selectedPatientQSL);
            data.glucoseEnabled = overlay.querySelector('#np-glucose-enable').checked;
            data.pressureEnabled = overlay.querySelector('#np-pressure-enable').checked;

            let msg = addedCount > 0 
                ? `Se registraron ${addedCount} medicamentos y se actualizó la configuración con éxito en el celular del paciente.`
                : 'La configuración fue sincronizada exitosamente con el celular del paciente.';

            if (hasMedData) {
                if(!data.meds) data.meds = [];
                data.meds.push(med);
                addedCount++;
                msg = `Se registraron ${addedCount} medicamentos en total y la configuración fue actualizada correctamente.`;
            }

            if (hasMedData || addedCount > 0) {
                window.unsavedConsultation = true;
            }

            savePatientData(selectedPatientQSL, data);
            
            overlay.remove();
            window.showElegantAlert('Receta Finalizada', msg);
            
            // Reload whatever section the doctor is currently viewing to show the newly added medications
            const activeNav = Array.from(document.querySelectorAll('.nav-links li.active'));
            if (activeNav.length > 0) {
                let section = activeNav[0].getAttribute('data-section');
                if (section) loadSection(section);
            } else {
                loadSection('consultation');
            }
        };

        overlay.onclick = (e) => {
            if(e.target === overlay) overlay.remove();
        };
    };    window.deleteMed = (id) => {
        if (confirm('¿Eliminar este medicamento de la receta actual?')) {
            const data = getPatientData(selectedPatientQSL);
            data.meds = data.meds.filter(m => m.id !== id);
            savePatientData(selectedPatientQSL, data);
            renderOverview(data);
        }
    };

    window.toggleGlucoseFeature = (enabled) => {
        const data = getPatientData(selectedPatientQSL);
        data.glucoseEnabled = enabled;
        savePatientData(selectedPatientQSL, data);
    };

    window.addGlucose = () => {
        const input = document.getElementById('patient-glucose');
        if (!input) return;
        const val = input.value.trim();
        if (!val) return;
        const data = getPatientData(selectedPatientQSL);
        if (!data.glucoseHistory) data.glucoseHistory = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        data.glucoseHistory.unshift({ value: val, date: dateStr });
        if (data.glucoseHistory.length > 5) data.glucoseHistory = data.glucoseHistory.slice(0, 5);
        savePatientData(selectedPatientQSL, data);
        renderOverview(data);
    };

    window.addQuickGlucose = async () => {
        const input = document.getElementById('patient-glucose-quick');
        if (!input) return;
        let val = input.value.trim();
        if (!val) return;
        if (!val.toLowerCase().includes('mg/dl')) val += ' mg/dL';
        const data = await fetchPatientDataAsync(selectedPatientQSL);
        if (!data.glucoseHistory) data.glucoseHistory = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        data.glucoseHistory.unshift({ value: val, date: dateStr, ts: now.getTime() });
        if (data.glucoseHistory.length > 200) data.glucoseHistory = data.glucoseHistory.slice(0, 200);
        await savePatientData(selectedPatientQSL, data);
        input.value = '';
        window.showElegantAlert('¡Guardado!', `Glucosa ${val} registrada.`);
        loadSection('reminders');
    };

    window.addQuickPressure = async () => {
        const input = document.getElementById('patient-pressure-quick');
        if (!input) return;
        let val = input.value.trim();
        if (!val) return;
        const data = await fetchPatientDataAsync(selectedPatientQSL);
        if (!data.pressureHistory) data.pressureHistory = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        data.pressureHistory.unshift({ value: val, date: dateStr, ts: now.getTime() });
        if (data.pressureHistory.length > 200) data.pressureHistory = data.pressureHistory.slice(0, 200);
        await savePatientData(selectedPatientQSL, data);
        input.value = '';
        window.showElegantAlert('¡Guardado!', `Presión ${val} mmHg registrada.`);
        loadSection('reminders');
    };

    window.showVitalsReport = async (qsl) => {
        const data = await fetchPatientDataAsync(qsl) || {};
        const name = localStorage.getItem(`patient_name_${qsl}`) || qsl;
        const glucoseHistory = data.glucoseHistory || [];
        const pressureHistory = data.pressureHistory || [];

        // Calcular "el período" por defecto (desde la última consulta/cita hasta hoy)
        let defaultFrom = '';
        if (data.consultations && data.consultations.length > 0) {
            const lastCons = data.consultations[data.consultations.length - 1];
            if (lastCons.date) {
                // lastCons.date viene en formato de locale string (usualmente dd/mm/yyyy o mm/dd/yyyy)
                const parts = lastCons.date.split('/');
                if (parts.length === 3) {
                    // Para HTML input type="date" necesitamos YYYY-MM-DD
                    const py = parts[2].length === 4 ? parts[2] : parts[0];
                    const pd = parts[2].length === 4 ? parts[0] : parts[1]; // asumiendo dd/mm/yyyy o mm/dd/yyyy
                    const pm = parts[1]; 
                    // Una forma más segura usando Date:
                }
            }
        }
        
        // Simplemente usemos la fecha de la última consulta via TS si existe, o parsando
        if (data.consultations && data.consultations.length > 0) {
            const lastCons = data.consultations[data.consultations.length - 1];
            if (lastCons.ts) {
                const d = new Date(lastCons.ts);
                defaultFrom = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            } else if (lastCons.date) {
                 // Fallback si no hay TS
                 const parts = lastCons.date.split('/');
                 if (parts.length === 3 && parts[2].length === 4) {
                     defaultFrom = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                 }
            }
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);overflow-y:auto;padding:20px;box-sizing:border-box;';

        const render = (dateFrom, dateTo) => {
            const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
            const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;

            const filterByDate = (history) => history.filter(h => {
                if (!h.ts) return true;
                const d = new Date(h.ts);
                if (from && d < from) return false;
                if (to && d > to) return false;
                return true;
            });

            const glcFiltered = filterByDate(glucoseHistory);
            const prsFiltered = filterByDate(pressureHistory);

            const glcRows = glcFiltered.length > 0
                ? glcFiltered.map(h => `<tr style="border-bottom:1px solid rgba(34,211,238,0.1);">
                        <td style="padding:14px 20px; color:#22d3ee; font-weight:600; font-size:18px;">${h.value}</td>
                        <td style="padding:14px 20px; color:rgba(255,255,255,0.6); font-size:18px;">${h.date}</td>
                    </tr>`).join('')
                : `<tr><td colspan="2" style="padding:20px; color:rgba(255,255,255,0.4); text-align:center; font-size:18px;">Sin registros en este período</td></tr>`;

            const prsRows = prsFiltered.length > 0
                ? prsFiltered.map(h => `<tr style="border-bottom:1px solid rgba(239,68,68,0.1);">
                        <td style="padding:14px 20px; color:#f87171; font-weight:600; font-size:18px;">${h.value}</td>
                        <td style="padding:14px 20px; color:rgba(255,255,255,0.6); font-size:18px;">${h.date}</td>
                    </tr>`).join('')
                : `<tr><td colspan="2" style="padding:20px; color:rgba(255,255,255,0.4); text-align:center; font-size:18px;">Sin registros en este período</td></tr>`;

            overlay.innerHTML = `
                <div style="background:linear-gradient(145deg,#0f172a,#1e293b); border:1px solid ${data.glucoseEnabled || data.pressureEnabled ? '#10b981' : 'rgba(251,191,36,0.3)'}; border-radius:30px; padding:45px; max-width:1150px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                        <div>
                            <h3 style="color:#fbbf24; margin:0; font-size:28px;">📊 Reporte de Signos Vitales</h3>
                            <p style="color:rgba(255,255,255,0.5); margin:6px 0 0; font-size:20px;">Paciente: <strong>${name}</strong></p>
                            ${(data.glucoseEnabled || data.pressureEnabled) ? `<div style="margin-top:10px; display:inline-block; background:rgba(16,185,129,0.15); padding:6px 14px; border-radius:20px; border:1px solid rgba(16,185,129,0.3); font-size:16px; color:#34d399; font-weight:bold;">🟢 Monitoreo Activo</div>` : ''}
                        </div>
                        <button onclick="this.closest('[style*=fixed]').remove()" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:white; padding:12px 24px; border-radius:12px; cursor:pointer; font-size:20px;">✕ Cerrar</button>
                    </div>

                    <!-- Filtro de Período -->
                    <div style="display:flex; gap:18px; align-items:center; margin-bottom:35px; background:rgba(255,255,255,0.04); padding:20px; border-radius:16px; flex-wrap:wrap;">
                        <label style="color:rgba(255,255,255,0.7); font-size:20px;">Desde:</label>
                        <input type="date" id="rpt-from" value="${dateFrom || ''}" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:white; padding:12px 18px; border-radius:10px; font-size:20px;">
                        <label style="color:rgba(255,255,255,0.7); font-size:20px;">Hasta:</label>
                        <input type="date" id="rpt-to" value="${dateTo || ''}" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15); color:white; padding:12px 18px; border-radius:10px; font-size:20px;">
                        <button onclick="window._vitalsRptFilter()" style="background:linear-gradient(135deg,#f59e0b,#d97706); color:black; border:none; padding:12px 24px; border-radius:10px; font-weight:700; cursor:pointer; font-size:20px;">Filtrar</button>
                        <button onclick="window._vitalsRptFilter('','');" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); padding:12px 24px; border-radius:10px; cursor:pointer; font-size:20px;">Ver Todo</button>
                    </div>

                    <!-- Tablas en 2 columnas -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:25px;">
                        <!-- Glucosa -->
                        <div>
                            <h4 style="color:#22d3ee; margin:0 0 15px; font-size:22px; display:flex; align-items:center; gap:8px;">🩸 Glucosa (mg/dL) <span style="background:rgba(34,211,238,0.15); border-radius:24px; padding:4px 14px; font-size:16px;">${glcFiltered.length} lecturas</span></h4>
                            <table style="width:100%; border-collapse:collapse; background:rgba(0,0,0,0.2); border-radius:12px; overflow:hidden;">
                                <thead><tr style="background:rgba(34,211,238,0.08);">
                                    <th style="padding:14px 20px; color:rgba(255,255,255,0.6); font-size:16px; text-align:left; text-transform:uppercase;">Valor</th>
                                    <th style="padding:14px 20px; color:rgba(255,255,255,0.6); font-size:16px; text-align:left; text-transform:uppercase;">Fecha y Hora</th>
                                </tr></thead>
                                <tbody>${glcRows}</tbody>
                            </table>
                        </div>
                        <!-- Presión -->
                        <div>
                            <h4 style="color:#f87171; margin:0 0 15px; font-size:22px; display:flex; align-items:center; gap:8px;">❤️ Presión (mmHg) <span style="background:rgba(239,68,68,0.15); border-radius:24px; padding:4px 14px; font-size:16px;">${prsFiltered.length} lecturas</span></h4>
                            <table style="width:100%; border-collapse:collapse; background:rgba(0,0,0,0.2); border-radius:12px; overflow:hidden;">
                                <thead><tr style="background:rgba(239,68,68,0.08);">
                                    <th style="padding:14px 20px; color:rgba(255,255,255,0.6); font-size:16px; text-align:left; text-transform:uppercase;">Valor</th>
                                    <th style="padding:14px 20px; color:rgba(255,255,255,0.6); font-size:16px; text-align:left; text-transform:uppercase;">Fecha y Hora</th>
                                </tr></thead>
                                <tbody>${prsRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        };

        window._vitalsRptFilter = (from, to) => {
            const f = from !== undefined ? from : document.getElementById('rpt-from')?.value || '';
            const t = to !== undefined ? to : document.getElementById('rpt-to')?.value || '';
            render(f, t);
        };

        render(defaultFrom, '');
        document.body.appendChild(overlay);
    };


    window.bookAppointmentForPatient = function(qsl) {
        const patientName = localStorage.getItem(`patient_name_${qsl}`) || qsl;
        const todayReal = new Date();
        const todayStr  = todayReal.toISOString().split('T')[0];

        // State
        let selectedDate = todayStr;
        let selectedTime = '';
        let calYear  = todayReal.getFullYear();
        let calMonth = todayReal.getMonth(); // 0-based

        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const dayNames   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

        // Time slots 07:00–19:00 every 30 min
        const slots = [];
        for (let h = 7; h <= 19; h++) {
            slots.push(`${String(h).padStart(2,'0')}:00`);
            if (h < 19) slots.push(`${String(h).padStart(2,'0')}:30`);
        }

        const overlay = document.createElement('div');
        overlay.id = 'book-appt-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:20px;box-sizing:border-box;overflow-y:auto;';

        const renderModal = () => {
            const allAppts   = window.getAppointments ? window.getAppointments() : [];
            const dayAppts   = allAppts.filter(a => a.date === selectedDate);
            const takenTimes = new Set(dayAppts.map(a => a.time));

            // ---- Mini Calendar ----
            const firstDay    = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
            const prevDays    = new Date(calYear, calMonth, 0).getDate();

            let calCells = '';
            // day headers
            calCells += dayNames.map(d => `<div style="text-align:center;color:rgba(255,255,255,0.4);font-size:11px;font-weight:700;padding:4px 0;">${d}</div>`).join('');
            // prev month fillers
            for (let i = firstDay - 1; i >= 0; i--) {
                calCells += `<div style="text-align:center;padding:6px 4px;color:rgba(255,255,255,0.15);font-size:13px;">${prevDays - i}</div>`;
            }
            // current month days
            for (let d = 1; d <= daysInMonth; d++) {
                const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isToday   = ds === todayStr;
                const isSel     = ds === selectedDate;
                const isPast    = ds < todayStr;
                const hasCita   = allAppts.some(a => a.date === ds);
                let bg = 'transparent', color = isPast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)', border = 'none', cursor = isPast ? 'default' : 'pointer', fw = '400';
                if (isSel)    { bg = '#10b981'; color = 'white'; fw = '700'; border = 'none'; }
                else if (isToday && !isSel) { border = '1px solid #10b981'; color = '#34d399'; }
                calCells += `<div onclick="${isPast ? '' : `window._bookPickDay('${ds}')`}"
                    style="position:relative;text-align:center;padding:7px 3px;border-radius:8px;background:${bg};color:${color};font-size:13px;font-weight:${fw};border:${border};cursor:${cursor};transition:all 0.15s;"
                    ${!isPast && !isSel ? 'onmouseover="this.style.background=\'rgba(16,185,129,0.15)\'" onmouseout="this.style.background=\'transparent\'"' : ''}>
                    ${d}
                    ${hasCita && !isSel ? '<div style="width:5px;height:5px;background:#f59e0b;border-radius:50%;position:absolute;bottom:2px;left:50%;transform:translateX(-50%);"></div>' : ''}
                </div>`;
            }
            // trailing fillers
            const total = firstDay + daysInMonth;
            const rem   = total % 7 === 0 ? 0 : 7 - (total % 7);
            for (let i = 1; i <= rem; i++) {
                calCells += `<div style="text-align:center;padding:6px 4px;color:rgba(255,255,255,0.15);font-size:13px;">${i}</div>`;
            }

            // ---- Time slots ----
            const slotBtns = slots.map(t => {
                const taken = takenTimes.has(t);
                const sel   = t === selectedTime;
                let bg, border, color, cursor;
                if (taken)    { bg='rgba(239,68,68,0.15)'; border='rgba(239,68,68,0.3)'; color='#f87171'; cursor='not-allowed'; }
                else if (sel) { bg='rgba(16,185,129,0.35)'; border='#10b981'; color='#a7f3d0'; cursor='pointer'; }
                else          { bg='rgba(255,255,255,0.04)'; border='rgba(255,255,255,0.1)'; color='rgba(255,255,255,0.7)'; cursor='pointer'; }
                return `<button onclick="${taken ? '' : `window._bookSelectTime('${t}')`}"
                    style="background:${bg};border:1px solid ${border};color:${color};border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;cursor:${cursor};transition:all 0.15s;min-width:68px;">
                    ${t}${taken ? '<br><span style="font-size:9px;opacity:0.7;">Ocupado</span>' : ''}
                </button>`;
            }).join('');

            const selLabel = selectedDate
                ? new Date(selectedDate+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
                : '';

            const motivoVal = document.getElementById('book-appt-motivo')?.value || '';

            overlay.innerHTML = `
                <div style="background:linear-gradient(145deg,#0f172a,#1a2540);border:1px solid rgba(16,185,129,0.35);border-radius:22px;padding:28px;max-width:620px;width:100%;max-height:94vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,0.6);">

                    <!-- Header -->
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                        <div>
                            <h3 style="color:#10b981;margin:0;font-size:20px;">📅 Nueva Cita</h3>
                            <p style="color:rgba(255,255,255,0.4);margin:4px 0 0;font-size:12px;">Agendando para el expediente activo</p>
                        </div>
                        <button onclick="document.getElementById('book-appt-overlay').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:white;padding:8px 16px;border-radius:10px;cursor:pointer;font-size:14px;">✕</button>
                    </div>

                    <!-- Paciente -->
                    <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <div>
                            <div style="color:#34d399;font-weight:700;font-size:14px;">${patientName}</div>
                            <div style="color:rgba(255,255,255,0.35);font-size:11px;">QSL: ${qsl}</div>
                        </div>
                    </div>

                    <!-- Mini Calendar -->
                    <div style="margin-bottom:20px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                            <button onclick="window._bookPrevMonth()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">‹</button>
                            <span style="color:white;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${monthNames[calMonth]} ${calYear}</span>
                            <button onclick="window._bookNextMonth()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">›</button>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">
                            ${calCells}
                        </div>
                        ${selLabel ? `<div style="margin-top:10px;color:#34d399;font-size:12px;font-weight:600;text-align:center;">📆 ${selLabel}</div>` : ''}
                    </div>

                    <!-- Horarios -->
                    <div style="margin-bottom:20px;">
                        <label style="color:rgba(255,255,255,0.6);font-size:12px;font-weight:700;display:block;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">🕐 Hora — seleccione un horario</label>
                        <div style="display:flex;flex-wrap:wrap;gap:7px;">
                            ${slotBtns}
                        </div>
                        ${selectedTime
                            ? `<div style="margin-top:10px;color:#34d399;font-size:13px;font-weight:700;">✅ ${selectedTime}</div>`
                            : '<div style="margin-top:8px;color:rgba(255,255,255,0.3);font-size:12px;">Toque un horario verde para seleccionarlo</div>'}
                    </div>

                    <!-- Motivo -->
                    <div style="margin-bottom:22px;">
                        <label style="color:rgba(255,255,255,0.6);font-size:12px;font-weight:700;display:block;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">📝 Motivo / Nota (opcional)</label>
                        <textarea id="book-appt-motivo" placeholder="Control mensual, seguimiento, primera consulta..." style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);color:white;padding:10px 14px;border-radius:10px;font-size:14px;height:65px;resize:none;box-sizing:border-box;">${motivoVal}</textarea>
                    </div>

                    <!-- Confirm -->
                    <button onclick="window._bookConfirm('${qsl}')"
                        style="width:100%;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;padding:15px;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;letter-spacing:0.5px;box-shadow:0 4px 20px rgba(16,185,129,0.3);">
                        ✅ Confirmar Cita
                    </button>
                    <p style="text-align:center;color:rgba(255,255,255,0.25);font-size:11px;margin-top:10px;">La cita quedará registrada en la Agenda del sistema</p>
                </div>`;

            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        };

        window._bookPrevMonth  = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderModal(); };
        window._bookNextMonth  = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderModal(); };
        window._bookPickDay    = (d) => { selectedDate = d; selectedTime = ''; renderModal(); };
        window._bookSelectTime = (t) => { selectedTime = t; renderModal(); };
        window._bookConfirm    = (q) => {
            if (!selectedDate || !selectedTime) {
                window.showElegantAlert('Atención', 'Por favor seleccione fecha y hora para la cita.', true);
                return;
            }
            const motivo = document.getElementById('book-appt-motivo')?.value.trim() || '';
            const name   = localStorage.getItem(`patient_name_${q}`) || q;
            if (window.saveAppointment) {
                window.saveAppointment({ qsl: q, name, date: selectedDate, time: selectedTime, motivo });
            }
            overlay.remove();
            window.showElegantAlert('¡Cita Agendada!',
                `${name} — ${new Date(selectedDate+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'long'})} a las ${selectedTime}.`);
        };

        renderModal();
        document.body.appendChild(overlay);
    };


    window.toggleAlerts = async (qsl, enabled) => {
        try {
            const resp = await fetch(`/api/patient/${qsl}/alerts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            const result = await resp.json();
            if (result.success) {
                localStorage.setItem(`active_qsl_${qsl}`, enabled ? 'true' : 'false');
                const data = await fetchPatientDataAsync(qsl);
                renderOverview(data);
                if (enabled) {
                    window.showElegantAlert('Servicio Activado', `¡El paciente con código ${qsl} ya recibirá sus alertas en su dispositivo!`);
                } else {
                    window.showElegantAlert('Servicio Desactivado', `Se han pausado las alertas para el paciente ${qsl}.`);
                }
            }
        } catch (e) {
            console.error(e);
            window.showElegantAlert('Error', 'No se pudo sincronizar con el servidor.', true);
        }
    };

    window.activateCode = (qsl) => window.toggleAlerts(qsl, true);

    window.showElegantAlert = (title, message, isError = false) => {
        const modal = document.getElementById('custom-alert-modal');
        if (!modal) { alert(message); return; }
        document.getElementById('alert-title').textContent = title;
        document.getElementById('alert-message').textContent = message;
        const icon = document.getElementById('alert-icon');
        if (isError) {
            icon.textContent = '⚠';
            icon.style.filter = 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.4))';
        } else {
            icon.textContent = '✅';
            icon.style.filter = 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.4))';
        }
        modal.style.display = 'flex';
    };

    // ═══════════════════════════════════════════════════════════
    //  PORTAL DEL PACIENTE — Vista unificada con 3 tabs
    // ═══════════════════════════════════════════════════════════
    function renderPatientPortal(data) {
        data = data || {};
        data.meds = data.meds || [];
        const pQsl  = selectedPatientQSL;
        const pName = localStorage.getItem(`patient_name_${pQsl}`) || localStorage.getItem('user_real_name') || pQsl;
        const isActivated = localStorage.getItem(`active_qsl_${pQsl}`) === 'true';

        // ── Próxima cita ──────────────────────────────────────
        const allAppts = window.getAppointments ? window.getAppointments() : [];
        const now = new Date();
        const nextAppt = allAppts
            .filter(a => a.qsl === pQsl && new Date(a.date + 'T' + (a.time || '00:00')) >= now)
            .sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')))[0];

        const todayStr = now.toISOString().slice(0, 10);
        const isToday = nextAppt && nextAppt.date === todayStr;

        let apptCard = '';
        if (nextAppt) {
            const apptDate = new Date(nextAppt.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
            const diffMs = new Date(nextAppt.date + 'T' + nextAppt.time) - now;
            const diffH  = Math.floor(diffMs / 3600000);
            const diffM  = Math.floor((diffMs % 3600000) / 60000);
            const countdown = diffMs > 0 ? (diffH > 0 ? `En ${diffH}h ${diffM}min` : `En ${diffM} minutos`) : 'Ahora';
            apptCard = `
                <div style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.08)); border:1px solid rgba(16,185,129,0.4); border-radius:20px; padding:20px; margin-bottom:18px; position:relative; overflow:hidden;">
                    <div style="position:absolute;top:0;right:0;width:80px;height:80px;background:radial-gradient(circle,rgba(16,185,129,0.2),transparent);border-radius:50%;transform:translate(20px,-20px);"></div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                        <div>
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                <span style="color:#10b981;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Próxima Cita${isToday ? ' • HOY' : ''}</span>
                            </div>
                            <p style="color:#fff;font-size:17px;font-weight:600;margin:0 0 4px 0;text-transform:capitalize;">${apptDate}</p>
                            <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0;">⏰ ${nextAppt.time} hrs</p>
                        </div>
                        <div style="text-align:center;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);border-radius:14px;padding:10px 14px;flex-shrink:0;">
                            <div style="color:#10b981;font-size:13px;font-weight:700;">${countdown}</div>
                        </div>
                    </div>
                </div>`;
        } else {
            apptCard = `<div style="text-align:center;padding:20px;background:rgba(0,0,0,0.15);border-radius:16px;margin-bottom:18px;border:1px dashed rgba(255,255,255,0.08);">
                <p style="color:rgba(255,255,255,0.4);font-size:14px;">No hay citas agendadas próximamente.</p>
            </div>`;
        }

        // ── Bandeja de mensajes ───────────────────────────────
        const inbox = JSON.parse(localStorage.getItem(`patient_inbox_${pQsl}`) || '[]');
        const unreadCount = inbox.filter(m => !m.leido).length;

        let inboxHtml = '';
        if (inbox.length === 0) {
            inboxHtml = `<div style="text-align:center;padding:30px 20px;opacity:0.5;">
                <div style="font-size:40px;margin-bottom:12px;">📭</div>
                <p style="font-size:14px;">No hay mensajes en su bandeja.</p>
            </div>`;
        } else {
            inboxHtml = inbox.map((msg, idx) => {
                const icon = msg.tipo === 'turno' ? '🏥' : '💬';
                const color = msg.leido ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.1)';
                const border = msg.leido ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.35)';
                return `<div style="background:${color};border:1px solid ${border};border-radius:14px;padding:15px;margin-bottom:10px;transition:all 0.2s;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
                        <span style="font-size:13px;font-weight:700;color:${msg.leido ? 'rgba(255,255,255,0.5)' : '#60a5fa'};">${icon} ${msg.tipo === 'turno' ? 'Aviso de Turno' : 'Mensaje Clínica'}</span>
                        <span style="font-size:11px;color:rgba(255,255,255,0.35);white-space:nowrap;">${msg.fecha}</span>
                    </div>
                    <p style="color:${msg.leido ? 'rgba(255,255,255,0.5)' : '#f8fafc'};font-size:14px;line-height:1.5;margin:0 0 10px 0;">${msg.mensaje}</p>
                    ${!msg.leido ? `<button onclick="window.markInboxRead('${pQsl}',${idx})" style="background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);font-size:11px;padding:4px 10px;border-radius:8px;cursor:pointer;">Marcar leído</button>` : ''}
                </div>`;
            }).join('');
        }

        // ── Medicamentos pendientes (resumen) ─────────────────
        const dueMeds = data.meds.filter(m => isDoseDue(m.id, m.startTime, m.frequency));
        let medsAlert = '';
        if (dueMeds.length > 0) {
            medsAlert = `<div style="background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.4);border-radius:16px;padding:16px;margin-bottom:18px;animation:pulse 2s infinite;">
                <p style="color:var(--accent);font-weight:700;font-size:15px;margin-bottom:8px;">🔔 ¡Hay ${dueMeds.length} medicamento(s) que tomar ahora!</p>
                <p style="color:rgba(255,255,255,0.7);font-size:13px;">${dueMeds.map(m => m.name).join(', ')}</p>
                <button onclick="window.switchPortalTab('recetas')" style="margin-top:10px;background:var(--accent);color:#000;border:none;padding:8px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Ver Recetas →</button>
            </div>`;
        }

        // ── Datos del paciente (read-only) ───────────────────
        const fields = [
            ['Nombre completo', data.nombre_completo || pName],
            ['Fecha de nacimiento', data.fecha_nacimiento || '—'],
            ['Edad', data.edad ? data.edad + ' años' : '—'],
            ['Género', data.genero || '—'],
            ['DPI / Identificación', data.id_identificacion || '—'],
            ['Estado civil', data.estado_civil || '—'],
            ['Teléfono', data.telefono || '—'],
            ['Correo electrónico', data.email || '—'],
            ['Dirección', data.direccion || '—'],
            ['Tipo de sangre', data.tipo_sangre || '—'],
            ['Alergias', data.alergias || '—'],
            ['Seguro médico', data.seguro_medico || '—'],
        ];
        const datosHtml = `
            <div style="margin-bottom:20px;background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.2);border-radius:16px;padding:16px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <p style="color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Código de Acceso</p>
                    <p id="qsl-display-portal" style="color:var(--accent);font-size:22px;font-weight:700;letter-spacing:2px;">${pQsl}</p>
                </div>
                <button onclick="navigator.clipboard.writeText('${pQsl}').then(()=>window.showElegantAlert('Copiado','Su código ${pQsl} ha sido copiado.'))" style="background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);color:var(--accent);padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">Copiar</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                ${fields.map(([label, val]) => `
                    <div style="background:rgba(0,0,0,0.2);border-radius:12px;padding:12px 14px;">
                        <p style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${label}</p>
                        <p style="color:#f8fafc;font-size:14px;font-weight:600;word-break:break-word;">${val}</p>
                    </div>`).join('')}
            </div>
            ${data.illness ? `<div style="margin-top:14px;background:rgba(34,211,238,0.05);border:1px solid rgba(34,211,238,0.15);border-radius:12px;padding:14px;">
                <p style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Motivo de Consulta / Evolución</p>
                <p style="color:#f8fafc;font-size:14px;line-height:1.5;">${data.illness}</p>
            </div>` : ''}`;

        // ── HTML Principal ────────────────────────────────────
        contentArea.innerHTML = `
        <div style="width:100%;max-width:520px;margin:0 auto;box-sizing:border-box;padding-bottom:30px;">

            <!-- HEADER DEL PACIENTE -->
            <div style="text-align:center;margin-bottom:24px;">
                <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg,rgba(79,70,229,0.3),rgba(34,211,238,0.3));border:2px solid rgba(34,211,238,0.4);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:28px;">
                    ${pName ? pName.charAt(0).toUpperCase() : '👤'}
                </div>
                <h2 style="color:#f8fafc;font-size:22px;font-weight:700;margin-bottom:6px;">${pName}</h2>
                <div style="display:inline-flex;align-items:center;gap:6px;background:${isActivated ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)'};padding:5px 14px;border-radius:100px;border:1px solid ${isActivated ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'};">
                    <div style="width:7px;height:7px;border-radius:50%;background:${isActivated ? '#10b981' : '#ef4444'};box-shadow:0 0 6px ${isActivated ? '#10b981' : '#ef4444'};"></div>
                    <span style="color:${isActivated ? '#10b981' : '#ef4444'};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${isActivated ? 'Alertas Activas' : 'Alertas Pausadas'}</span>
                </div>
            </div>

            <!-- TABS DE NAVEGACIÓN -->
            <div style="display:flex;gap:8px;margin-bottom:22px;background:rgba(0,0,0,0.3);padding:6px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">
                <button id="tab-btn-alertas" onclick="window.switchPortalTab('alertas')" style="flex:1;padding:10px 6px;border-radius:12px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;background:rgba(34,211,238,0.15);color:var(--accent);display:flex;align-items:center;justify-content:center;gap:5px;position:relative;">
                    🔔 Alertas
                    <span id="portal-inbox-badge" style="display:${unreadCount > 0 ? 'flex' : 'none'};align-items:center;justify-content:center;background:#ef4444;color:#fff;font-size:10px;font-weight:900;width:18px;height:18px;border-radius:50%;position:absolute;top:-5px;right:-3px;">${unreadCount}</span>
                </button>
                <button id="tab-btn-datos" onclick="window.switchPortalTab('datos')" style="flex:1;padding:10px 6px;border-radius:12px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;background:transparent;color:rgba(255,255,255,0.5);">
                    📋 Mis Datos
                </button>
                <button id="tab-btn-recetas" onclick="window.switchPortalTab('recetas')" style="flex:1;padding:10px 6px;border-radius:12px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;background:transparent;color:rgba(255,255,255,0.5);">
                    💊 Recetas
                </button>
            </div>

            <!-- TAB 1: ALERTAS -->
            <div id="portal-tab-alertas" style="display:block;">
                ${medsAlert}
                ${apptCard}
                <div style="border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:14px;padding-bottom:4px;display:flex;align-items:center;gap:8px;">
                    <span style="color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Bandeja de Mensajes</span>
                    ${unreadCount > 0 ? `<span style="background:rgba(59,130,246,0.2);color:#60a5fa;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">${unreadCount} sin leer</span>` : ''}
                </div>
                ${inboxHtml}
            </div>

            <!-- TAB 2: DATOS -->
            <div id="portal-tab-datos" style="display:none;">
                ${datosHtml}
            </div>

            <!-- TAB 3: RECETAS -->
            <div id="portal-tab-recetas" style="display:none;" id="portal-recetas-container">
            </div>

            <!-- CERRAR SESIÓN -->
            <button onclick="localStorage.removeItem('user_qsl_code');localStorage.removeItem('user_role');window.location.href='index.html';"
                style="width:100%;margin-top:28px;padding:15px;background:rgba(15,23,42,0.4);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:14px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.3s;"
                onmouseover="this.style.background='rgba(239,68,68,0.1)';this.style.color='#ef4444';this.style.borderColor='rgba(239,68,68,0.3)';"
                onmouseout="this.style.background='rgba(15,23,42,0.4)';this.style.color='rgba(255,255,255,0.4)';this.style.borderColor='rgba(255,255,255,0.06)';">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Cerrar Sesión Segura
            </button>
        </div>`;

        // Renderizar recetas dentro del tab
        window._portalMedsData = data;
        window._renderPortalRecetas(data);
    }

    window._renderPortalRecetas = function(data) {
        data = data || window._portalMedsData || {};
        data.meds = data.meds || [];
        const pQsl = selectedPatientQSL;
        const container = document.getElementById('portal-tab-recetas');
        if (!container) return;

        if (data.meds.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px 20px;background:rgba(0,0,0,0.15);border-radius:16px;border:1px dashed rgba(255,255,255,0.08);">
                <div style="font-size:40px;margin-bottom:12px;">💊</div>
                <h4 style="color:rgba(255,255,255,0.8);font-size:15px;margin-bottom:8px;">Sin recetas activas</h4>
                <p style="color:rgba(255,255,255,0.4);font-size:13px;">Su médico aún no ha asignado medicamentos.</p>
            </div>`;
            return;
        }

        // Glucosa y presión si habilitado
        let vitalsHtml = '';
        if (data.glucoseEnabled) {
            vitalsHtml += `<div style="background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:16px;padding:14px;margin-bottom:12px;">
                <p style="color:var(--accent);font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">📊 Glucosa (mg/dL)</p>
                <div style="display:flex;gap:8px;">
                    <input type="number" id="portal-glucose" placeholder="Ej: 98" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;color:white;font-size:15px;">
                    <button onclick="window.addQuickGlucose()" style="background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.3);color:var(--accent);padding:0 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Registrar</button>
                </div>
            </div>`;
        }
        if (data.pressureEnabled) {
            vitalsHtml += `<div style="background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:16px;padding:14px;margin-bottom:12px;">
                <p style="color:#f87171;font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">❤️ Presión Arterial</p>
                <div style="display:flex;gap:8px;">
                    <input type="text" id="portal-pressure" placeholder="Ej: 120/80" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;color:white;font-size:15px;">
                    <button onclick="window.addQuickPressure()" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:0 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Registrar</button>
                </div>
            </div>`;
        }

        const medsHtml = data.meds.map(m => {
            const isDue = isDoseDue(m.id, m.startTime, m.frequency);
            const nextDose = calculateNextDose(m.startTime, m.frequency);
            const schedule = window.getDailySchedule ? window.getDailySchedule(m.startTime, m.frequency) : m.startTime;
            return `<div style="background:${isDue ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isDue ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'};border-radius:16px;padding:16px;margin-bottom:12px;${isDue ? 'animation:pulse 2s infinite;box-shadow:0 4px 20px rgba(34,211,238,0.15);' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;">
                    <h4 style="color:#fff;font-size:16px;font-weight:700;margin:0;text-transform:uppercase;">${m.name}</h4>
                    <span style="background:${isDue ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};color:${isDue ? '#000' : '#fff'};padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;">${nextDose}</span>
                </div>
                <p style="color:rgba(255,255,255,0.65);font-size:13px;margin:0 0 8px 0;">Dosis: ${m.dose}</p>
                <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0 0 ${isDue ? '12px' : '0'} 0;">🕐 ${schedule}</p>
                ${isDue ? `<button onclick="window.markTaken(${m.id})" style="width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:12px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;">✓ CONFIRMAR TOMA</button>` : ''}
            </div>`;
        }).join('');

        container.innerHTML = vitalsHtml + medsHtml;
    };

    window.switchPortalTab = function(tab) {
        ['alertas','datos','recetas'].forEach(t => {
            const panel = document.getElementById(`portal-tab-${t}`);
            const btn   = document.getElementById(`tab-btn-${t}`);
            if (!panel || !btn) return;
            const active = t === tab;
            panel.style.display = active ? 'block' : 'none';
            btn.style.background  = active ? 'rgba(34,211,238,0.15)' : 'transparent';
            btn.style.color       = active ? 'var(--accent)' : 'rgba(255,255,255,0.5)';
        });
    };

    window.markInboxRead = function(qsl, idx) {
        const key = `patient_inbox_${qsl}`;
        const inbox = JSON.parse(localStorage.getItem(key) || '[]');
        if (inbox[idx]) { inbox[idx].leido = true; localStorage.setItem(key, JSON.stringify(inbox)); }
        // Recargar portal
        loadSection('patient_portal');
    };

    function renderReminders(data) {
        data = data || {};
        data.meds = data.meds || [];
        
        const isPaciente = userRole === 'paciente';
        const pName = localStorage.getItem(`patient_name_${selectedPatientQSL}`) || localStorage.getItem('user_real_name') || selectedPatientQSL;
        const isActivated = localStorage.getItem(`active_qsl_${selectedPatientQSL}`) === 'true';

        let html = '';
        if (isPaciente) {
            html += `
                <div class="glass-card animate-in" style="padding: 30px 20px; text-align: center; margin: 0 auto; width: 100%; max-width: 500px; box-sizing: border-box; background: rgba(15, 23, 42, 0.7); border: 4px solid rgba(34, 211, 238, 0.65); border-radius: 32px; box-shadow: 0 0 30px rgba(34, 211, 238, 0.2), inset 0 0 15px rgba(34, 211, 238, 0.1); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); user-select: none; -webkit-user-select: none;">
                    
                    <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 25px;">
                        <div class="logo-container" style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(79,70,229,0.15), rgba(34,211,238,0.15)); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: var(--accent); box-shadow: inset 0 0 20px rgba(34,211,238,0.05);">
                            <svg class="heart-icon" style="width: 32px; height: 32px; filter: drop-shadow(0 0 10px rgba(34,211,238,0.6));" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" />
                            </svg>
                        </div>
                        <h1 style="font-size: 28px; font-weight: 700; color: #f8fafc; margin-bottom: 12px; letter-spacing: -0.5px;">${pName}</h1>
                        
                        ${isActivated ? `
                            <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.15); padding: 8px 16px; border-radius: 100px; border: 1px solid rgba(16, 185, 129, 0.3);">
                                <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981;"></div>
                                <span style="color: #10b981; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Alertas Activas</span>
                            </div>
                        ` : `
                            <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(239, 68, 68, 0.1); padding: 8px 16px; border-radius: 100px; border: 1px solid rgba(239, 68, 68, 0.2);">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                <span style="color: var(--error); font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;">Alertas Pausadas</span>
                            </div>
                        `}
                    </div>
                    
                    ${isPaciente && data.glucoseEnabled ? `
                        <div style="background: rgba(0, 0, 0, 0.2); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 15px; margin-bottom: 25px; display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label style="font-size: 13px; color: rgba(255,255,255,0.7); text-transform: uppercase; font-weight: 600; letter-spacing: 1px; display: flex; align-items: center; gap: 6px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                    Nivel Glucosa
                                </label>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <input type="number" id="patient-glucose-quick" placeholder="Ej: 98" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px 15px; color: white; font-size: 16px;">
                                <button class="btn-primary" style="padding: 0 20px; border-radius: 12px; font-size: 14px; background: rgba(34, 211, 238, 0.15); color: var(--accent); border: 1px solid rgba(34, 211, 238, 0.3);" onclick="window.addQuickGlucose()">Registrar</button>
                            </div>
                            <div style="font-size: 12px; color: rgba(255,255,255,0.5); text-align: left; max-height: 80px; overflow-y: auto;">
                                ${(data.glucoseHistory && data.glucoseHistory.length > 0) ?
                        data.glucoseHistory.map((hist, i) => `<div style="padding-bottom: 4px; ${i === 0 ? 'border-bottom: 1px dotted rgba(255,255,255,0.1); margin-bottom: 4px;' : ''}">${i === 0 ? 'Último' : 'Anterior'}: <strong style="color:var(--accent); font-size: 13px;">${hist.value}</strong> <span style="font-size:10px; opacity:0.8;">(${hist.date})</span></div>`).join('')
                        : 'Sin registros de glucosa'}
                            </div>
                        </div>
                    ` : ''}

                    ${isPaciente && data.pressureEnabled ? `
                        <div style="background: rgba(0, 0, 0, 0.2); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 15px; margin-bottom: 25px; display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label style="font-size: 13px; color: rgba(255,255,255,0.7); text-transform: uppercase; font-weight: 600; letter-spacing: 1px; display: flex; align-items: center; gap: 6px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                                    Presión Arterial
                                </label>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="patient-pressure-quick" placeholder="Ej: 120/80" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px 15px; color: white; font-size: 16px;">
                                <button class="btn-primary" style="padding: 0 20px; border-radius: 12px; font-size: 14px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);" onclick="window.addQuickPressure()">Registrar</button>
                            </div>
                            <div style="font-size: 12px; color: rgba(255,255,255,0.5); text-align: left; max-height: 80px; overflow-y: auto;">
                                ${(data.pressureHistory && data.pressureHistory.length > 0) ?
                        data.pressureHistory.map((hist, i) => `<div style="padding-bottom: 4px; ${i === 0 ? 'border-bottom: 1px dotted rgba(255,255,255,0.1); margin-bottom: 4px;' : ''}">${i === 0 ? 'Último' : 'Anterior'}: <strong style="color:#f87171; font-size: 13px;">${hist.value}</strong> <span style="font-size:10px; opacity:0.8;">(${hist.date})</span></div>`).join('')
                        : 'Sin registros de presión'}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 24px; padding: 25px 20px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 25px;">
                            <div style="height: 1px; flex: 1; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1));"></div>
                            <h3 style="color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 8px; margin: 0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"></path></svg>
                                RECETARIO
                            </h3>
                            <div style="height: 1px; flex: 1; background: linear-gradient(-90deg, transparent, rgba(255,255,255,0.1));"></div>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 0;">
            `;
        } else {
            html += `
                <div class="widget-card animate-in text-center">
                    <h3 class="widget-title">Alertas Activas</h3>
                    <p style="color: var(--text-muted); margin-bottom: 20px;">Monitoreo de notificaciones para el paciente actual.</p>
                    <div class="dashboard-grid">
            `;
        }

        function _calculateNextDoseMs(startTime, freq) {
            if (!startTime || !freq) return Infinity;
            try {
                const now = new Date();
                const [h, m] = startTime.split(':');
                let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
                const freqMs = parseInt(freq) * 3600000;
                while (next <= now) { next = new Date(next.getTime() + freqMs); }
                return next.getTime();
            } catch (e) { return Infinity; }
        }

        let medsToDisplay = data.meds.slice();
        if (isPaciente) {
            medsToDisplay.sort((a, b) => {
                const aDue = isDoseDue(a.id, a.startTime, a.frequency);
                const bDue = isDoseDue(b.id, b.startTime, b.frequency);
                if (aDue && !bDue) return -1;
                if (!aDue && bDue) return 1;
                return _calculateNextDoseMs(a.startTime, a.frequency) - _calculateNextDoseMs(b.startTime, b.frequency);
            });
            // Show all medications (no limit)
        }

        html += `
                    ${medsToDisplay.map(m => {

            const nextDose = calculateNextDose(m.startTime, m.frequency);
            const isDue = isDoseDue(m.id, m.startTime, m.frequency);
            const schedule = window.getDailySchedule ? window.getDailySchedule(m.startTime, m.frequency) : m.startTime;

            if (isPaciente) {
                return `
                    <div style="background: ${isDue ? 'rgba(34, 211, 238, 0.1)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${isDue ? 'rgba(34, 211, 238, 0.4)' : 'rgba(255,255,255,0.15)'}; border-radius: 16px; padding: 16px; margin-bottom: 12px; text-align: left; overflow: hidden; width: 100%; min-width: 0; box-sizing: border-box; ${isDue ? 'box-shadow: 0 4px 20px rgba(34, 211, 238, 0.2); animation: pulse 2s infinite;' : ''}" id="med-card-${m.id}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 8px;">
                            <h4 style="color: #fff; font-size: 16px; font-weight: 700; margin: 0; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: normal; line-height: 1.3;">${m.name}</h4>
                            <div style="background: ${isDue ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}; color: ${isDue ? '#000' : '#fff'}; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">
                                ${nextDose}
                            </div>
                        </div>
                        <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 0 0 8px 0; word-break: break-word;">Dosis: ${m.dose}</p>
                        <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; width: 100%; box-sizing: border-box;">
                            <p style="color: var(--text-muted); font-size: 12px; margin: 0; line-height: 1.5; word-break: break-all; overflow-wrap: break-word; white-space: normal;">
                                🕐 ${schedule}
                            </p>
                        </div>
                        ${isDue ? `
                            <div style="border-top: 1px dashed rgba(255,255,255,0.15); padding-top: 12px; margin-top: 12px; text-align: center;">
                                <p style="color: var(--accent); font-size: 14px; margin-bottom: 10px; font-weight: 600;">🔔 ¡Hora de tomar su dosis!</p>
                                <button class="btn-primary" style="width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border:none; padding: 14px; border-radius: 12px; font-weight: 700; font-size: 15px; display: flex; justify-content: center; align-items: center; gap: 8px;" onclick="window.markTaken(${m.id})">
                                    ✓ CONFIRMAR TOMA
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                return `
                    <div class="widget-card" style="background: rgba(0,0,0,0.2); text-align: left; ${isDue ? 'border: 2px solid var(--accent); box-shadow: 0 0 15px rgba(34, 211, 238, 0.5); animation: pulse 2s infinite;' : ''}" id="med-card-${m.id}">
                        <h4 style="color: var(--accent); font-size: 24px; margin-bottom: 10px;">${m.name}</h4>
                        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">
                            <p style="font-size: 18px; margin-bottom: 8px;"><strong>Dosis de la receta:</strong> ${m.dose}</p>
                            <p style="font-size: 18px; color: #10b981;"><strong>Horarios del día:</strong> ${schedule}</p>
                        </div>
                        <p style="font-size: 18px; margin-bottom: 20px;"><strong>Próximo aviso en:</strong> ${nextDose}</p>
                        ${isDue ? `
                            <div style="background: rgba(34, 211, 238, 0.1); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                                <p style="color: var(--accent); font-weight: bold; font-size: 20px; text-align: center; margin-bottom: 15px;">¡Es hora de tomar su medicina!</p>
                                <button class="btn-primary" style="width: 100%; background: #10b981;" onclick="window.markTaken(${m.id})">YA LO TOMÉ</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        }).join('')}
                </div>
                ${medsToDisplay.length === 0 ? `
                    <div style="text-align: center; padding: 40px 20px; background: rgba(0,0,0,0.15); border-radius: 16px; margin-top: 15px; border: 1px dashed rgba(255,255,255,0.08); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <h4 style="color: rgba(255,255,255,0.9); font-size: 16px; margin-bottom: 8px; font-weight: 600;">Sin medicamentos pendientes</h4>
                        <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 1.5; max-width: 250px;">${!isActivated && isPaciente ? 'Su médico aún no ha habilitado las alertas para su perfil.' : 'Ha completado sus tomas o no tiene recetas activas por ahora.'}</p>
                    </div>
                ` : ''}
                
                ${isPaciente ? `
                        </div> <!-- Cierra flex de items de medicamentos -->
                    </div> <!-- Cierra RECETARIO -->
                </div> <!-- Cierra la tarjeta glass-card principal -->
                
                <div style="margin: 30px auto 0; width: 100%; max-width: 500px; padding: 0 10px; box-sizing: border-box;">
                    <button class="btn-primary" style="width: 100%; padding: 16px 24px; font-size: 14px; font-weight: 700; text-transform: uppercase; background: rgba(15, 23, 42, 0.4); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);" onclick="localStorage.removeItem('user_qsl_code'); window.location.href='index.html';" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.color='var(--error)'; this.style.borderColor='rgba(239, 68, 68, 0.3)';" onmouseout="this.style.background='rgba(15, 23, 42, 0.4)'; this.style.color='var(--text-muted)'; this.style.borderColor='rgba(255,255,255,0.05)';">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Cerrar Sesión Segura
                    </button>
                </div>
                ` : ''}
                ${!isPaciente ? `</div></div>` : ''} <!-- Cierra dashboard-grid y widget-card -->
            <div id="applause-container" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9999; align-items:center; justify-content:center; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);">
                <div style="font-size: 120px; animation: bounce 1s infinite; filter: drop-shadow(0 0 20px rgba(255,255,255,0.5));">👏🎉👏</div>
            </div>
        `;
        contentArea.innerHTML = html;
    }

    function checkAndShowAlerts() {
        if (userRole !== 'paciente' || !selectedPatientQSL) return;

        const isActivated = localStorage.getItem(`active_qsl_${selectedPatientQSL}`) === 'true';
        if (!isActivated) return; // Si no está activa la opción de recordatorios, cancelar alertas

        const data = getPatientData(selectedPatientQSL);
        const dueMeds = data.meds.filter(m => isDoseDue(m.id, m.startTime, m.frequency));

        let alertBox = document.getElementById('fullscreen-alert-modal');
        if (dueMeds.length === 0) {
            if (alertBox) alertBox.style.display = 'none';
            return;
        }

        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'fullscreen-alert-modal';
            alertBox.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.95); backdrop-filter:blur(10px); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center; animation: slideUp 0.4s ease-out;';
            document.body.appendChild(alertBox);
        }

        let html = `
            <div style="background: var(--card-bg); border: 2px solid var(--accent); border-radius: 20px; padding: 40px 30px; width: 100%; max-width: 450px; box-shadow: 0 0 50px rgba(34,211,238,0.3);">
                <div style="font-size: 60px; animation: pulse 2s infinite; margin-bottom: 20px;">🔔</div>
                <h1 style="color: white; font-size: 32px; margin-bottom: 10px; font-weight: 700;">¡Hora de tu medicina!</h1>
                <p style="color: var(--text-muted); margin-bottom: 30px; font-size: 20px;">Debes tomar lo siguiente en este momento:</p>
                <div style="display:flex; flex-direction:column; gap:15px; margin-bottom: 30px; text-align: left; max-height: 40vh; overflow-y: auto;">
        `;

        dueMeds.forEach(m => {
            html += `
                <div style="background: rgba(34, 211, 238, 0.1); padding: 25px; border-radius: 12px; border-left: 4px solid var(--accent);">
                    <h3 style="color: var(--accent); margin-bottom: 8px; font-size: 24px;">${m.name}</h3>
                    <p style="color: #fff; font-size: 20px;">Dosis: <strong>${m.dose}</strong></p>
                </div>
            `;
        });

        const dueMedIds = dueMeds.map(m => m.id).join(',');

        html += `
                </div>
                <div style="display: flex; gap: 20px; flex-direction: column;">
                    <button onclick="window.markTakenGroup('${dueMedIds}')" style="width: 100%; background: #10b981; color: white; border: none; padding: 24px; border-radius: 14px; font-size: 20px; font-weight: bold; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">
                        👏 YA LO TOMÉ 👏
                    </button>
                    <button onclick="document.getElementById('fullscreen-alert-modal').style.display='none';" style="width: 100%; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 20px; border-radius: 14px; font-size: 18px; cursor: pointer; transition: 0.3s;">
                        RECORDAR MÁS TARDE
                    </button>
                </div>
            </div>
        `;

        alertBox.innerHTML = html;
        alertBox.style.display = 'flex';
    }

    window.markTakenGroup = (idsStr) => {
        const ids = idsStr.split(',').map(id => parseInt(id));
        ids.forEach(id => {
            const now = new Date();
            localStorage.setItem(`taken_${selectedPatientQSL}_${id}`, now.getTime().toString());
        });

        const alertBox = document.getElementById('fullscreen-alert-modal');
        if (alertBox) alertBox.style.display = 'none';

        // Show applause animation
        const applause = document.getElementById('applause-container');
        if (applause) {
            applause.style.display = 'flex';
            setTimeout(() => {
                applause.style.display = 'none';
                loadSection('reminders');
            }, 3000);
        }
    };

    window.markTaken = (id) => {
        const now = new Date();
        localStorage.setItem(`taken_${selectedPatientQSL}_${id}`, now.getTime().toString());

        // Show applause animation
        const applause = document.getElementById('applause-container');
        if (applause) {
            applause.style.display = 'flex';
            setTimeout(() => {
                applause.style.display = 'none';
                // In a real app we'd update the last taken time here
                // For now just reload to recalculate
                const data = getPatientData(selectedPatientQSL);
                loadSection('reminders');
                window.showElegantAlert('¡Excelente trabajo!', 'Su registro médico ha sido guardado exitosamente. Siga así.');
            }, 3000);
        }
    };

    function isDoseDue(medId, startTime, freq) {
        if (!startTime || !freq) return false;
        try {
            const now = new Date();
            let [hStr, rest] = startTime.split(':');
            let h = parseInt(hStr);
            let m = 0;
            if (rest) {
                const mStr = rest.replace(/[^0-9]/g, '');
                m = parseInt(mStr) || 0;
                if (rest.toUpperCase().includes('PM') && h !== 12) h += 12;
                if (rest.toUpperCase().includes('AM') && h === 12) h = 0;
            }
            let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
            const freqMs = parseInt(freq) * 3600000;

            // If the start time is in the future today, it's not due yet
            if (next > now && next.getTime() - now.getTime() > freqMs) {
                return false;
            }

            while (next <= now) { next = new Date(next.getTime() + freqMs); }

            // The exact next dose time
            const theoreticalDose = new Date(next.getTime() - freqMs);

            // Check if it's within 30 minutes of the dose time
            const timeDiff = Math.abs(theoreticalDose.getTime() - now.getTime());
            if (timeDiff <= 1800000) { // 30 mins
                // Verify it hasn't been taken in this window
                const lastTakenStr = localStorage.getItem(`taken_${selectedPatientQSL}_${medId}`);
                if (lastTakenStr) {
                    const lastTakenTime = parseInt(lastTakenStr);
                    // If taken within 2 hours of the theoretical dose, it's accounted for
                    if (Math.abs(lastTakenTime - theoreticalDose.getTime()) < 7200000) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    async function renderSettings() {
        const isDoc = userRole === 'medico';
        const isProgrammer = qslCode === 'MED-MASTER';
        const docId = localStorage.getItem('current_doctor_id');
        let docName = '';
        if (isDoc) {
            try {
                const resp = await fetch('/api/medicos');
                const result = await resp.json();
                const medicos = result.medicos || [];
                const doc = medicos.find(m => m.id_medico === docId);
                docName = doc ? doc.usuario : (localStorage.getItem('doctor_master_name') || 'Admin');
            } catch (e) {
                const medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
                const doc = medicos.find(m => m.id_medico === docId);
                docName = doc ? doc.usuario : (localStorage.getItem('doctor_master_name') || 'Admin');
            }
        }

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 500px; margin: 0 auto; border: 3px solid #fbbf24; box-shadow: 0 0 20px rgba(251, 191, 36, 0.1); border-radius: 24px; padding: 40px;">
                <h3 class="widget-title" style="color: #fbbf24;">${isProgrammer ? 'Perfil de Programador' : 'Datos del Médico'}</h3>
                <div class="input-group" style="margin-bottom: 20px;">
                    <label>${isProgrammer ? 'Nombre de Administrador' : 'Nombre Maestro (Médico)'}</label>
                    <input type="text" id="new-doc-name" value="${docName}" disabled style="opacity: 0.7; cursor: not-allowed;">
                </div>
                <div class="input-group" style="margin-bottom: 20px;">
                    <label>Clave Maestra Actual *</label>
                    <input type="text" id="current-doc-pass" placeholder="Ingresar clave actual para autorizar..."
                        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                        data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"
                        style="-webkit-text-security: disc; text-security: disc;"
                        ${!isDoc ? 'disabled' : ''}>
                </div>
                <div class="input-group" style="margin-bottom: 20px;">
                    <label>Nueva Clave de Acceso</label>
                    <input type="text" id="new-doc-pass" placeholder="Ingresar nueva clave..."
                        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                        data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"
                        style="-webkit-text-security: disc; text-security: disc;"
                        ${!isDoc ? 'disabled' : ''}>
                </div>
                ${isDoc ? `
                    <button class="btn-primary" style="width: 100%; margin-bottom: 20px; background: #fbbf24; color: #000; font-weight: 800;" onclick="window.updateDocProfile()">ACTUALIZAR CREDENCIALES</button>
                    
                    <hr style="border:0; border-top: 1px solid var(--card-border); margin: 20px 0;">
                    
                    <h4 style="color:#10b981; margin-bottom:15px; font-size:18px;">Notificaciones de Cola Automatizadas</h4>
                    <p style="color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:15px;line-height:1.4;">El sistema alertará a los pacientes automáticamente sobre cuántos turnos les faltan (desde "Faltan 6 turnos..." hasta "¡Es su turno!"). Elija por dónde recibirán estas alertas.</p>
                    <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px; background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="localStorage.setItem('notification_preference','whatsapp')">
                            <input type="radio" name="notif_pref" value="whatsapp" ${localStorage.getItem('notification_preference') === 'whatsapp' ? 'checked' : ''} style="width:18px;height:18px;accent-color:#10b981;">
                            <span style="font-size:16px; color:white;">WhatsApp (API Meta)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="localStorage.setItem('notification_preference','sisdel')">
                            <input type="radio" name="notif_pref" value="sisdel" ${(!localStorage.getItem('notification_preference') || localStorage.getItem('notification_preference') === 'sisdel') ? 'checked' : ''} style="width:18px;height:18px;accent-color:#10b981;">
                            <span style="font-size:16px; color:white;">App DR-SISDEL</span>
                        </label>
                    </div>
                ` : ''}
                <hr style="border:0; border-top: 1px solid var(--card-border); margin: 20px 0;">
                <button class="btn-primary" style="width: 100%; background: var(--error);" onclick="localStorage.removeItem('user_qsl_code'); window.location.href='index.html';">CERRAR SESIÓN</button>
            </div>
        `;
    }

    window.updateDocProfile = async () => {
        const name = document.getElementById('new-doc-name').value.trim();
        const currentPass = document.getElementById('current-doc-pass').value.trim();
        const newPass = document.getElementById('new-doc-pass').value.trim();

        const docId = localStorage.getItem('current_doctor_id');
        let medicos = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos = result.medicos || [];
        } catch (e) {
            medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        }

        const docIndex = medicos.findIndex(m => m.id_medico === docId);
        if (docIndex === -1) return;

        if (!currentPass || btoa(currentPass) !== medicos[docIndex].password_hash) {
            window.showElegantAlert('Error de Autorización', 'La clave actual ingresada es incorrecta. No se pueden guardar cambios.', true);
            return;
        }

        if (name) {
            medicos[docIndex].usuario = name;
            medicos[docIndex].nombre_completo = name;
            localStorage.setItem('user_real_name', name);

            if (docId === 'MED-MASTER') {
                localStorage.setItem('doctor_master_name', name);
            }

            if (newPass) {
                const passHash = btoa(newPass);
                medicos[docIndex].password_hash = passHash;
                if (docId === 'MED-MASTER') localStorage.setItem('doctor_master_pass', passHash);
                window.showElegantAlert('Clave Actualizada', 'Nombre y Clave actualizados con éxito.');
            } else {
                window.showElegantAlert('Perfil Actualizado', 'Nombre actualizado correctamente.');
            }

            try {
                await fetch(`/api/medico/${docId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(medicos[docIndex])
                });
                localStorage.setItem('tabla_medicos', JSON.stringify(medicos));
            } catch (e) { console.error('Save medico error:', e); }

            updateUserDisplay();
            document.getElementById('current-doc-pass').value = '';
            document.getElementById('new-doc-pass').value = '';
        }
    };

    function renderConsultation(data) {
        if (!data.consultations) data.consultations = [];
        const isMed = userRole === 'medico';

        const appointments = window.getAppointments ? window.getAppointments() : [];
        const localD = new Date();
        const todayStr = localD.getFullYear() + '-' + String(localD.getMonth() + 1).padStart(2, '0') + '-' + String(localD.getDate()).padStart(2, '0');
        const todayStrES = localD.toLocaleDateString('es-ES');
        const nowTimeStr = localD.toTimeString().slice(0, 5);
        
        const nextAppt = appointments
            .filter(a => {
                if (a.date !== todayStr || a.time <= nowTimeStr || a.qsl === selectedPatientQSL) return false;
                const pData = getPatientDataFallback(a.qsl);
                const hasConsultedToday = (pData.consultations || []).some(c => typeof c.date === 'string' && (c.date.includes(todayStrES) || c.date.startsWith(todayStrES)));
                const hasMedsToday = (pData.meds || []).some(m => m.id && new Date(parseInt(m.id)).toLocaleDateString('es-ES') === todayStrES);
                return !(hasConsultedToday || hasMedsToday);
            })
            .sort((a,b) => (a.time > b.time ? 1 : -1))[0];

        let countdownHtml = '';
        if (nextAppt) {
            countdownHtml = `
                <span id="next-appt-timer-container" style="font-size: 13px; font-weight: 700; background: linear-gradient(135deg, #f59e0b, #d97706); border: 1px solid rgba(245,158,11,0.5); color: #0f172a; border-radius: 6px; padding: 4px 10px; margin-left:4px; display:inline-flex; align-items:center; gap:6px; box-shadow: 0 4px 12px rgba(245,158,11,0.3); animation: pulse 2s infinite;">
                    ⏱️ Siguiente paciente en <span id="next-appt-mins">--</span> min
                </span>
            `;
            
            // Iniciar el cronómetro en el background una vez renderizado
            setTimeout(() => {
                const updateTimer = () => {
                    const timerEl = document.getElementById('next-appt-mins');
                    if (!timerEl) return;
                    
                    const now = new Date();
                    const [apptH, apptM] = nextAppt.time.split(':').map(Number);
                    const apptDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), apptH, apptM, 0);
                    
                    const diffMs = apptDate - now;
                    if (diffMs <= 0) {
                        const container = document.getElementById('next-appt-timer-container');
                        if(container) {
                            container.innerHTML = '🚨 ¡Es hora del siguiente paciente!';
                            container.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                            container.style.color = 'white';
                            container.style.animation = 'none';
                        }
                        return;
                    }
                    
                    const diffMins = Math.ceil(diffMs / 60000);
                    timerEl.textContent = diffMins;
                    
                    setTimeout(updateTimer, 10000); 
                };
                updateTimer();
            }, 100);
        }

        let html = `
            <div class="dashboard-grid">
                <div class="widget-card animate-in" style="grid-column: span 2; padding: 40px; border: 3px solid rgba(16, 185, 129, 0.4); border-radius: 24px;">
                    <div style="border-bottom: 2px solid rgba(16, 185, 129, 0.1); padding-bottom: 15px; margin-bottom: 25px;">
                        <h3 class="widget-title" style="font-size: 26px; color: #10b981; display: flex; justify-content: space-between; align-items: center; border: none; padding: 0; margin-bottom: 15px;">
                            <span style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                ${localStorage.getItem('patient_name_' + selectedPatientQSL) || 'Paciente'}
                                <span style="font-size: 14px; opacity: 0.6; font-weight: normal; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 2px 8px;">QSL: ${selectedPatientQSL}</span>
                                <button onclick="window.bookAppointmentForPatient('${selectedPatientQSL}')" style="font-size: 13px; font-weight: 600; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #34d399; border-radius: 6px; padding: 5px 12px; cursor:pointer; transition: all 0.2s; display:inline-flex; align-items:center; gap:6px;" onmouseover="this.style.background='rgba(16,185,129,0.28)'" onmouseout="this.style.background='rgba(16,185,129,0.15)'">
                                    📅 ${new Date().toLocaleDateString('es-ES', {weekday:'short', day:'2-digit', month:'short', year:'numeric'})} &nbsp;➕ Agendar Cita
                                </button>
                                ${countdownHtml}
                            </span>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <button onclick="window.renderDoctorHome('search')" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 13px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;"><polyline points="15 18 9 12 15 6"></polyline></svg> Búsqueda
                                </button>
                                <button onclick="loadSection('overview')" style="background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.3); color: #22d3ee; padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 13px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> Menú Principal
                                </button>
                            </div>
                        </h3>
                        <div style="display:flex; gap: 10px;">
                            <button onclick="window.renderNewPrescription ? window.renderNewPrescription() : loadSection('overview')" style="flex:1; background: rgba(16,185,129,0.2); border: 1px solid rgba(16,185,129,0.4); color: #a7f3d0; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg> Nueva Receta
                            </button>
                            <button onclick="window.showPatientGeneralData('${selectedPatientQSL}')" style="flex:1; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Datos Generales
                            </button>
                            <button onclick="document.getElementById('historial-scroll-target').scrollIntoView({behavior: 'smooth'})" style="flex:1; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #34d399; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Consultas Anteriores
                            </button>
                            <button onclick="window.renderLaboratories()" style="flex:1; background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31"></path><path d="M14 9.3V1.99"></path><path d="M8.5 2h7"></path><path d="M14 9.3a6.5 6.5 0 1 1-4 0"></path><line x1="5.52" y1="16h12.96"></line></svg> Laboratorios
                            </button>
                            <button onclick="window.showVitalsReport('${selectedPatientQSL}')" style="flex:1; background: ${data.glucoseEnabled || data.pressureEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.12)'}; border: 1px solid ${data.glucoseEnabled || data.pressureEnabled ? 'rgba(16,185,129,0.4)' : 'rgba(251,191,36,0.3)'}; color: ${data.glucoseEnabled || data.pressureEnabled ? '#34d399' : '#fbbf24'}; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                                📊 Reporte M. Perfil ${data.glucoseEnabled || data.pressureEnabled ? '🟢' : ''}
                            </button>
                        </div>
                        <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                            <span style="background:${data.glucoseEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)'}; color:${data.glucoseEnabled ? '#34d399' : 'rgba(255,255,255,0.3)'}; border:1px solid ${data.glucoseEnabled ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}; padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;">
                                ${data.glucoseEnabled ? '🟢' : '⚪'} Control Glucosa: ${data.glucoseEnabled ? 'ACTIVO' : 'Inactivo'}
                            </span>
                            <span style="background:${data.pressureEnabled ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)'}; color:${data.pressureEnabled ? '#f87171' : 'rgba(255,255,255,0.3)'}; border:1px solid ${data.pressureEnabled ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}; padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;">
                                ${data.pressureEnabled ? '🔴' : '⚪'} Control Presión: ${data.pressureEnabled ? 'ACTIVO' : 'Inactivo'}
                            </span>
                        </div>
                    </div>
                    
                    ${isMed ? (() => {
                        const isFirstVisit = data.consultations.length === 0;
                        const patientData = getPatientData(selectedPatientQSL) || {};
                        const pData = patientData;
                        const prefillAnt = v => v ? ` value="${v.replace(/"/g, '&quot;')}"` : '';

                        
                        const antSection = `
                        <!-- ANTECEDENTES: Solo en primera visita -->
                        <div id="ant-section" style="background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.2); border-left: 4px solid #3b82f6; border-radius: 14px; padding: 22px; margin-bottom: 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="background:#3b82f6; color:white; font-size:11px; font-weight:800; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;">2</span>
                                    <h5 style="color:#60a5fa; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0; font-weight:700;">Antecedentes del Paciente</h5>
                                </div>
                                <span style="background:rgba(59,130,246,0.12); color:#60a5fa; font-size:11px; padding:3px 10px; border-radius:20px; border:1px solid rgba(59,130,246,0.25);">Se guardarán en el perfil</span>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:14px;">
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>Antecedentes Personales Patológicos</label>
                                    <textarea id="c-ant-personales" style="height:75px; width:100%;" placeholder="Diabetes, HTA, cardiopatía...">${pData.antPersonales || ''}</textarea>
                                </div>
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>Antecedentes Quirúrgicos</label>
                                    <textarea id="c-ant-quirurgicos" style="height:75px; width:100%;" placeholder="Apendicectomía 2015, cesárea...">${pData.antQuirurgicos || ''}</textarea>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:14px;">
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>Antecedentes Familiares</label>
                                    <textarea id="c-ant-familiares" style="height:75px; width:100%;" placeholder="Padre: DM2, Madre: HTA...">${pData.antFamiliares || ''}</textarea>
                                </div>
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>⚠️ Alergias</label>
                                    <input type="text" id="c-alergias" placeholder="Penicilina, mariscos, NKDA..."${prefillAnt(pData.alergias)}>
                                </div>
                            </div>
                            <div class="input-group" style="margin-bottom:0;">
                                <label>💊 Medicamentos Actuales</label>
                                <input type="text" id="c-medicamentos" placeholder="Metformina 850mg c/12h..."${prefillAnt(pData.medicamentos)}>
                            </div>
                        </div>`;
                        
                        return `
                    <div style="background: linear-gradient(135deg, rgba(16,185,129,0.03) 0%, rgba(0,0,0,0.25) 100%); padding: 30px; border-radius: 20px; margin-bottom: 30px; border: 1px solid rgba(16,185,129,0.2); box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px; padding-bottom:18px; border-bottom: 1px solid rgba(255,255,255,0.07);">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#10b981,#059669); display:flex; align-items:center; justify-content:center; font-size:20px;">🩺</div>
                                <div>
                                    <h4 style="color: #10b981; font-size: 19px; font-weight:700; margin:0; letter-spacing:0.5px;">${isFirstVisit ? 'Primera Consulta' : 'Consulta de Seguimiento'}</h4>
                                    <p style="color:rgba(255,255,255,0.4); font-size:12px; margin:2px 0 0;">${isFirstVisit ? 'Ingrese los datos completos del paciente' : 'Registre la evolución de la visita actual'}</p>
                                </div>
                            </div>
                            ${isFirstVisit ? '' : `<span style="background:rgba(16,185,129,0.12); color:#34d399; font-size:13px; font-weight:600; padding:6px 14px; border-radius:20px; border:1px solid rgba(16,185,129,0.25);">Consulta #${data.consultations.length + 1}</span>`}
                        </div>

                        <!-- MOTIVO Y EVOLUCIÓN (siempre visible) -->
                        <div style="background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2); border-left: 4px solid #10b981; border-radius: 14px; padding: 22px; margin-bottom: 16px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                                <span style="background:#10b981; color:black; font-size:11px; font-weight:800; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;">1</span>
                                <h5 style="color:#34d399; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0; font-weight:700;">Motivo de la Visita</h5>
                            </div>
                            <div class="input-group" style="margin-bottom: 14px;">
                                <label>Motivo de Consulta (¿Qué lo trae hoy?)</label>
                                <input type="text" id="c-motivo" placeholder="Ej: Dolor de cabeza, control de diabetes, fiebre de 3 días...">
                            </div>
                            <div class="input-group" style="margin-bottom:0;">
                                <label>Historia de la Enfermedad Actual (Inicio, duración, evolución)</label>
                                <textarea id="c-historia" style="height: 90px; width: 100%;" placeholder="Ej: Paciente refiere inicio hace 5 días con fiebre de 38°C..."></textarea>
                            </div>
                        </div>

                        ${isFirstVisit ? antSection : `
                        <!-- ANTECEDENTES RESUMEN (solo lectura para seguimiento) -->
                        ${(pData.antPersonales || pData.alergias || pData.medicamentos) ? `
                        <div style="background: rgba(59,130,246,0.04); border: 1px solid rgba(59,130,246,0.12); border-radius: 12px; padding: 15px; margin-bottom: 18px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <h5 style="color:#60a5fa; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0;">📋 Antecedentes del Paciente</h5>
                                <button onclick="window.showPatientGeneralData('${selectedPatientQSL}')" style="background:none; border:1px solid rgba(59,130,246,0.3); color:#60a5fa; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:11px;">Editar</button>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:12px;">
                                ${pData.alergias ? `<span style="background:rgba(239,68,68,0.1); color:#f87171; padding:4px 10px; border-radius:6px;">⚠️ Alergias: ${pData.alergias}</span>` : ''}
                                ${pData.medicamentos ? `<span style="background:rgba(251,191,36,0.1); color:#fbbf24; padding:4px 10px; border-radius:6px;">💊 ${pData.medicamentos}</span>` : ''}
                                ${pData.antPersonales ? `<span style="background:rgba(59,130,246,0.1); color:#60a5fa; padding:4px 10px; border-radius:6px;">${pData.antPersonales}</span>` : ''}
                            </div>
                        </div>` : `<div style="margin-bottom:18px; padding:12px; background:rgba(255,255,255,0.02); border-radius:10px; font-size:12px; color:rgba(255,255,255,0.4); text-align:center;">Sin antecedentes registrados. <button onclick="window.showPatientGeneralData('${selectedPatientQSL}')" style="background:none; border:none; color:#60a5fa; cursor:pointer; text-decoration:underline; font-size:12px;">Agregar desde Datos Generales</button></div>`}
                        `}

                        <!-- SIGNOS VITALES (siempre visible) -->
                        <div style="background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.2); border-left: 4px solid #f59e0b; border-radius: 14px; padding: 22px; margin-bottom: 16px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                                <span style="background:#f59e0b; color:black; font-size:11px; font-weight:800; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${isFirstVisit ? '3' : '2'}</span>
                                <h5 style="color:#fbbf24; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0; font-weight:700;">Signos Vitales</h5>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:14px;">
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>🩸 Glucosa (mg/dL)</label>
                                    <input type="number" id="c-glucosa" placeholder="Ej: 98">
                                </div>
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>❤️ Presión Arterial (mmHg)</label>
                                    <input type="text" id="c-presion" placeholder="Ej: 120/80">
                                </div>
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>⚖️ Peso (lbs)</label>
                                    <input type="number" id="c-peso" placeholder="Ej: 160">
                                </div>
                                <div class="input-group" style="margin-bottom:0;">
                                    <label>📏 Estatura (cm)</label>
                                    <input type="number" id="c-estatura" placeholder="Ej: 165">
                                </div>
                            </div>
                        </div>

                        <!-- TOGGLES DE REPORTE PACIENTE -->
                        <div style="margin-top:12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px 18px; display:flex; gap:30px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:rgba(255,255,255,0.7);">
                                <span>🩸 Paciente reportará glucosa:</span>
                                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" id="glc-yes" name="glc-report" value="yes" ${patientData.glucoseEnabled ? 'checked' : ''}> <span style="color:#22d3ee">Sí</span></label>
                                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" id="glc-no" name="glc-report" value="no" ${!patientData.glucoseEnabled ? 'checked' : ''}> <span style="color:rgba(255,255,255,0.5)">No</span></label>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:rgba(255,255,255,0.7);">
                                <span>❤️ Paciente reportará presión:</span>
                                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" id="prs-yes" name="prs-report" value="yes" ${patientData.pressureEnabled ? 'checked' : ''}> <span style="color:#f87171">Sí</span></label>
                                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" id="prs-no" name="prs-report" value="no" ${!patientData.pressureEnabled ? 'checked' : ''}> <span style="color:rgba(255,255,255,0.5)">No</span></label>
                            </div>
                        </div>


                        <div style="background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.2); border-left: 4px solid #a855f7; border-radius: 14px; padding: 22px; margin-bottom: 16px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                                <span style="background:#a855f7; color:white; font-size:11px; font-weight:800; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${isFirstVisit ? '4' : '3'}</span>
                                <h5 style="color:#c084fc; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0; font-weight:700;">Examen Físico y Notas Clínicas</h5>
                            </div>
                            <div class="input-group" style="margin-bottom:0;">
                                <label>Hallazgos, Diagnóstico, Plan de Tratamiento</label>
                                <textarea id="c-notas" style="height: 200px; width: 100%;" placeholder="Examen físico: Paciente consciente, orientado. PA 120/80. Abdomen blando, depresible...&#10;Diagnóstico: Gastritis crónica.&#10;Tratamiento: Omeprazol 20mg c/12h x 4 semanas. Dieta blanda..."></textarea>
                            </div>
                        </div>

                        <!-- REFERENCIAS (siempre visible) -->
                        <div style="background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15); border-left: 4px solid #ef4444; border-radius: 14px; padding: 22px; margin-bottom: 20px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                                <span style="background:#ef4444; color:white; font-size:11px; font-weight:800; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${isFirstVisit ? '5' : '4'}</span>
                                <h5 style="color:#f87171; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0; font-weight:700;">Referencias y Observaciones</h5>
                            </div>
                            <div class="input-group" style="margin-bottom:0;">
                                <label>Laboratorios solicitados, referencias a especialistas, observaciones</label>
                                <textarea id="c-referencias" style="height: 90px; width: 100%;" placeholder="Solicitar BHC, QS, EGO. Referencia a cardiología. Control en 4 semanas..."></textarea>
                            </div>
                        </div>

                        <button class="btn-primary" style="width: 100%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 18px; font-size:16px; font-weight:700; border-radius:14px; letter-spacing:0.5px; box-shadow: 0 4px 15px rgba(16,185,129,0.3);" onclick="window.saveConsultation()">
                            ✔ GUARDAR CONSULTA MÉDICA
                        </button>
                    </div>`;
                    })() : '<div style="text-align: center; color: var(--text-muted); margin-bottom: 30px; font-style: italic;">Solo su médico tratante puede editar las consultas.</div>'}

                    <h3 id="historial-scroll-target" class="widget-title" style="font-size: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 20px; padding-top: 30px;">
                        Historial de Consultas (${data.consultations.length})
                    </h3>
                    <div class="consultation-list">

                        ${data.consultations.length > 0 ? data.consultations.slice().sort((a,b)=>b.id-a.id).map(c => `
                            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 22px; border-radius: 15px; margin-bottom: 20px; position:relative;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items:flex-start;">
                                    <strong style="color: #10b981; font-size: 18px;">📅 Consulta: ${c.date}</strong>
                                    ${isMed ? `<button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: none;" onclick="window.deleteConsultation(${c.id})">Borrar</button>` : ''}
                                </div>
                                <p style="margin-bottom: 8px; font-size:16px;"><strong style="color:#34d399;">Motivo:</strong> ${c.motivo}</p>
                                ${c.historia ? `<p style="margin-bottom: 8px; color: rgba(255,255,255,0.85); font-size:14px;"><strong>Historia:</strong> ${c.historia}</p>` : ''}
                                ${c.antPersonales || c.antQuirurgicos || c.antFamiliares ? `
                                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin:10px 0; padding:12px; background:rgba(59,130,246,0.05); border-radius:8px;">
                                    ${c.antPersonales ? `<div><strong style="color:#60a5fa; font-size:12px;">Antec. Personales</strong><p style="font-size:13px; margin-top:3px;">${c.antPersonales}</p></div>` : ''}
                                    ${c.antQuirurgicos ? `<div><strong style="color:#60a5fa; font-size:12px;">Cirugías</strong><p style="font-size:13px; margin-top:3px;">${c.antQuirurgicos}</p></div>` : ''}
                                    ${c.antFamiliares ? `<div><strong style="color:#60a5fa; font-size:12px;">Familiares</strong><p style="font-size:13px; margin-top:3px;">${c.antFamiliares}</p></div>` : ''}
                                </div>` : ''}
                                ${c.alergias ? `<p style="margin-bottom:6px; font-size:13px;"><strong style="color:#f87171;">⚠️ Alergias:</strong> ${c.alergias}</p>` : ''}
                                ${c.medicamentos ? `<p style="margin-bottom:8px; font-size:13px;"><strong style="color:#fbbf24;">💊 Medicamentos:</strong> ${c.medicamentos}</p>` : ''}
                                ${(c.glucosa || c.presion || c.peso) ? `
                                <div style="display:flex; gap:15px; margin:10px 0; padding:10px; background:rgba(251,191,36,0.05); border-radius:8px;">
                                    ${c.glucosa ? `<span style="background:rgba(251,191,36,0.1); padding:6px 12px; border-radius:8px; color:#fbbf24; font-size:13px;">Glucosa: <strong>${c.glucosa} mg/dL</strong></span>` : ''}
                                    ${c.presion ? `<span style="background:rgba(239,68,68,0.1); padding:6px 12px; border-radius:8px; color:#f87171; font-size:13px;">PA: <strong>${c.presion} mmHg</strong></span>` : ''}
                                    ${c.peso ? `<span style="background:rgba(16,185,129,0.1); padding:6px 12px; border-radius:8px; color:#34d399; font-size:13px;">Peso: <strong>${c.peso} kg</strong></span>` : ''}
                                </div>` : ''}
                                ${c.notas ? `<p style="margin-bottom: 8px; color: rgba(255,255,255,0.9); font-size:14px; line-height:1.5; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.08);"><strong>Notas Clínicas:</strong><br/>${c.notas.replace(/\n/g, '<br>')}</p>` : ''}
                                ${c.referencias ? `<p style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); color: #fbbf24; font-size:13px;"><strong>Referencias/Estudios:</strong><br/>${c.referencias.replace(/\n/g, '<br>')}</p>` : ''}
                            </div>
                        `).join('') : '<p style="text-align:center; opacity:0.5; padding: 20px;">No hay consultas registradas todavía.</p>'}
                    </div>

                    <div style="margin-top: 30px; text-align: center;">
                        <button class="btn-secondary" style="border: 2px solid var(--accent); color: white;" onclick="loadSection('overview')">Ver Expediente y Recetas</button>
                    </div>
                </div>
            </div>
        `;
        contentArea.innerHTML = html;
    }

    window.saveConsultation = () => {
        const motivo = document.getElementById('c-motivo')?.value.trim() || '';
        const historia = document.getElementById('c-historia')?.value.trim() || '';
        const notas = document.getElementById('c-notas')?.value.trim() || '';
        const referencias = document.getElementById('c-referencias')?.value.trim() || '';
        const glucosa = document.getElementById('c-glucosa')?.value.trim() || '';
        const presion = document.getElementById('c-presion')?.value.trim() || '';
        const peso = document.getElementById('c-peso')?.value.trim() || '';
        const estatura = document.getElementById('c-estatura')?.value.trim() || '';

        // These only exist on first visit (antecedentes section present)
        const antPersonalesEl = document.getElementById('c-ant-personales');
        const antQuirurgicosEl = document.getElementById('c-ant-quirurgicos');
        const antFamiliaresEl = document.getElementById('c-ant-familiares');
        const alergiasEl = document.getElementById('c-alergias');
        const medicamentosEl = document.getElementById('c-medicamentos');

        if (!motivo) {
            window.showElegantAlert('Faltan Datos', 'El motivo de consulta es obligatorio.', true);
            return;
        }

        window.unsavedConsultation = false;
        const data = getPatientData(selectedPatientQSL);
        if(!data.consultations) data.consultations = [];
        const now = new Date();

        // Persist antecedentes to patient profile if captured (first visit form)
        if(antPersonalesEl) data.antecedentes_personales = antPersonalesEl.value.trim();
        if(antQuirurgicosEl) data.antecedentes_quirurgicos = antQuirurgicosEl.value.trim();
        if(antFamiliaresEl) data.antecedentes_familiares = antFamiliaresEl.value.trim();
        if(alergiasEl) data.alergias = alergiasEl.value.trim();
        if(medicamentosEl) data.medicamentos_actuales = medicamentosEl.value.trim();

        // Persist vitals reporting toggles
        const glcYes = document.getElementById('glc-yes');
        const prsYes = document.getElementById('prs-yes');
        if(glcYes) data.glucoseEnabled = glcYes.checked;
        if(prsYes) data.pressureEnabled = prsYes.checked;

        data.consultations.push({
            id: now.getTime(),
            date: now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            motivo,
            historia,
            notas,
            referencias,
            glucosa,
            presion,
            peso,
            estatura
        });
        
        savePatientData(selectedPatientQSL, data);
        window.showElegantAlert('Consulta Guardada', 'La consulta médica ha sido registrada en el historial del paciente.');
        renderConsultation(data);
    };


    window.deleteConsultation = (id) => {
        if (confirm('¿Eliminar esta consulta del historial? Esta acción no se puede deshacer.')) {
            const data = getPatientData(selectedPatientQSL);
            if(data.consultations) {
                data.consultations = data.consultations.filter(c => c.id !== id);
                savePatientData(selectedPatientQSL, data);
                renderConsultation(data);
            }
        }
    };

    // --- UTILIDADES ---
    window.getDailySchedule = function (startTime, freq) {
        if (!startTime || !freq) return '';
        const times = [];
        try {
            let [h, m] = startTime.split(':');
            let currentH = parseInt(h);
            const f = parseInt(freq);
            if (f <= 0) return startTime;

            let maxDoses = Math.floor(24 / f);
            if (maxDoses > 12) maxDoses = 12; // cap
            if (maxDoses === 0) maxDoses = 1;

            for (let i = 0; i < maxDoses; i++) {
                let nextH = (currentH + (i * f)) % 24;
                let ampm = nextH >= 12 ? 'PM' : 'AM';
                let displayH = nextH % 12;
                displayH = displayH ? displayH : 12; // 0 debe ser 12
                times.push(`${displayH.toString().padStart(2, '0')}:${m} ${ampm}`);
            }
            return times.join(' - ');
        } catch (e) { return startTime; }
    };

    function calculateNextDose(startTime, freq) {
        if (!startTime || !freq) return '--:--';
        try {
            const now = new Date();
            const [h, m] = startTime.split(':');
            let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
            const freqMs = parseInt(freq) * 3600000;
            while (next <= now) { next = new Date(next.getTime() + freqMs); }
            return next.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (e) { return '--:--'; }
    }

    function getSectionTitle(name) {
        const titles = { 
            overview: 'Expediente', 
            reminders: 'Seguimiento', 
            consultation: 'Consulta Médica',
            settings: 'Datos del Médico',
            programmer: 'Módulo Programador (Super Admin)'
        };
        return titles[name] || 'DR-SISDEL';
    }

    function updateDate() {
        const activeCompany = JSON.parse(localStorage.getItem('active_company') || 'null');
        const locale = activeCompany ? activeCompany.dateLocale : 'es-ES';
        const tz = activeCompany ? activeCompany.timezone : undefined;
        
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZone: tz
        };
        
        try {
            const now = new Date();
            const dateStr = now.toLocaleDateString(locale, options);
            const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz });
            dateDisplay.textContent = `${dateStr} | ${timeStr}`;
        } catch (e) {
            dateDisplay.textContent = new Date().toLocaleDateString('es-ES', options);
        }
    }
    
    // Actualizar reloj cada segundo
    setInterval(updateDate, 1000);

    // --- MÓDULO PROGRAMADOR ---
    async function renderProgrammer() {
        let centros = [];
        let fromCloud = false;
        try {
            const resp = await fetch('/api/centros');
            const result = await resp.json();
            const cloudCentros = result.centros || [];
            const localCentros = JSON.parse(localStorage.getItem('tabla_centros') || '[]');

            if (cloudCentros.length > 0) {
                // Merge: combinar nube + local, sin duplicados por id_centro
                const merged = [...cloudCentros];
                localCentros.forEach(lc => {
                    if (!merged.find(c => c.id_centro === lc.id_centro)) merged.push(lc);
                });
                centros = merged;
                fromCloud = true;
            } else if (localCentros.length > 0) {
                // API vacía pero localStorage tiene datos — CONSERVAR y re-sincronizar
                centros = localCentros;
                console.warn('[SISDEL] API devolvió lista vacía pero localStorage tiene datos. Re-sincronizando...');
                // Re-push each local centro to the API silently
                localCentros.forEach(async (c) => {
                    try {
                        await fetch(`/api/centro/${c.id_centro}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(c)
                        });
                    } catch(e2) {}
                });
            } else {
                centros = [];
            }
        } catch (e) {
            // Red caída — usar localStorage sin tocar nada
            centros = JSON.parse(localStorage.getItem('tabla_centros') || '[]');
        }
        // Siempre persistir la lista final en localStorage (protección)
        if (centros.length > 0) {
            localStorage.setItem('tabla_centros', JSON.stringify(centros));
        }
        
        contentArea.innerHTML = `
            <div class="programmer-dashboard animate-in">

                <!-- HEADER CON STATS Y ESTADO DE DATOS -->
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:28px;">
                    <div style="background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.04)); border:1px solid rgba(251,191,36,0.3); border-radius:16px; padding:20px; text-align:center;">
                        <div style="font-size:32px; font-weight:800; color:#fbbf24;">${centros.length}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:4px; text-transform:uppercase; letter-spacing:1px;">Centros Activos</div>
                    </div>
                    <div style="background:linear-gradient(135deg,rgba(96,165,250,0.12),rgba(96,165,250,0.04)); border:1px solid rgba(96,165,250,0.3); border-radius:16px; padding:20px; text-align:center;">
                        <div style="font-size:32px; font-weight:800; color:#60a5fa;">${centros.reduce((a,c)=>a+(parseInt(c.max_medicos)||0),0)}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:4px; text-transform:uppercase; letter-spacing:1px;">Licencias Totales</div>
                    </div>
                    <div style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.04)); border:1px solid rgba(16,185,129,0.3); border-radius:16px; padding:20px; text-align:center;">
                        <div style="font-size:22px; font-weight:800; color:${fromCloud ? '#10b981' : '#f59e0b'};">${fromCloud ? '☁️ NUBE' : '💾 LOCAL'}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:4px; text-transform:uppercase; letter-spacing:1px;">Fuente de Datos</div>
                    </div>
                    <div style="background:linear-gradient(135deg,rgba(168,85,247,0.12),rgba(168,85,247,0.04)); border:1px solid rgba(168,85,247,0.3); border-radius:16px; padding:20px; text-align:center;">
                        <div style="font-size:14px; font-weight:700; color:#c084fc;">${localStorage.getItem('centros_last_backup') ? new Date(localStorage.getItem('centros_last_backup')).toLocaleDateString('es-ES') : 'Sin backup'}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:4px; text-transform:uppercase; letter-spacing:1px;">Último Backup</div>
                    </div>
                </div>

                <!-- BARRA DE ACCIONES DE SEGURIDAD -->
                <div style="background:rgba(251,191,36,0.06); border:1px solid rgba(251,191,36,0.2); border-radius:14px; padding:16px 20px; margin-bottom:24px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                    <span style="color:#fbbf24; font-size:13px; font-weight:700; flex:1;">🔐 Seguridad de Datos — Realiza backups frecuentes para proteger tu información</span>
                    <button onclick="window.exportarDatosSisdel()" style="background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#000; border:none; padding:10px 20px; border-radius:10px; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px;">
                        ⬇️ Exportar Backup JSON
                    </button>
                    <button onclick="window.importarDatosSisdel()" style="background:rgba(96,165,250,0.15); color:#60a5fa; border:1px solid rgba(96,165,250,0.3); padding:10px 20px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
                        ⬆️ Importar / Restaurar
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 420px; gap: 30px;">
                    <!-- LISTA DE CENTROS -->
                    <div class="widget-card" style="border: 2px solid rgba(251,191,36,0.3); box-shadow: 0 0 30px rgba(251, 191, 36, 0.06);">
                        <h3 class="widget-title" style="color: #fbbf24; border-bottom: 1px solid rgba(251, 191, 36, 0.15); padding-bottom: 16px; font-size:18px;">
                            🏥 Centros Médicos Registrados (${centros.length})
                        </h3>
                        <div style="margin-top: 20px; display: grid; gap: 16px;">
                            ${centros.length > 0 ? centros.map(centro => `
                                <div style="background: linear-gradient(135deg,rgba(251,191,36,0.06),rgba(255,255,255,0.02)); border: 1px solid rgba(251,191,36,0.15); padding: 20px; border-radius: 16px; position:relative; overflow:hidden;">
                                    <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:linear-gradient(to bottom,#fbbf24,#f59e0b); border-radius:4px 0 0 4px;"></div>
                                    <div style="padding-left:12px;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom:12px;">
                                            <div>
                                                <h4 style="font-size: 18px; color: white; margin-bottom: 4px; font-weight:700;">${centro.nombre}</h4>
                                                <p style="color: rgba(255,255,255,0.5); font-size: 12px;">${centro.pais || ''} ${centro.nit ? '· NIT: ' + centro.nit : ''}</p>
                                            </div>
                                            <div style="background: rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); padding: 8px 14px; border-radius: 10px; font-weight: 800; font-size: 16px; color:#fbbf24; letter-spacing: 2px; font-family: monospace; white-space:nowrap;">
                                                ${centro.admin_code}
                                            </div>
                                        </div>
                                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:14px;">
                                            <div style="color:rgba(255,255,255,0.6);">👤 Admin: <span style="color:white;">${centro.admin_nombre || 'N/D'}</span></div>
                                            <div style="color:rgba(255,255,255,0.6);">👨‍⚕️ Límite: <span style="color:#60a5fa; font-weight:700;">${centro.max_medicos} médicos</span></div>
                                            ${centro.admin_telefono ? `<div style="color:rgba(255,255,255,0.6);">📞 <span style="color:white;">${centro.admin_telefono}</span></div>` : ''}
                                            ${centro.admin_correo ? `<div style="color:rgba(255,255,255,0.6);">✉️ <span style="color:white;">${centro.admin_correo}</span></div>` : ''}
                                        </div>
                                        <div style="display:flex; gap:10px;">
                                            <span style="background:rgba(16,185,129,0.1); color:#34d399; font-size:11px; padding:4px 10px; border-radius:20px; border:1px solid rgba(16,185,129,0.2);">✓ Activo</span>
                                            <button style="background:rgba(239,68,68,0.1); color:#f87171; border:1px solid rgba(239,68,68,0.2); font-size:11px; padding:4px 10px; border-radius:20px; cursor:pointer; font-weight:600;" onclick="window.deleteCentro('${centro.id_centro}')">🗑 Eliminar</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('') : `
                                <div style="text-align:center; padding: 60px 20px; border: 2px dashed rgba(255,255,255,0.06); border-radius: 20px;">
                                    <div style="font-size:40px; margin-bottom:12px;">🏥</div>
                                    <p style="color:var(--text-muted); font-size:14px;">No hay centros médicos registrados.</p>
                                    <p style="color:rgba(255,255,255,0.3); font-size:12px; margin-top:6px;">Usa el formulario para crear el primero.</p>
                                </div>`}
                        </div>
                    </div>

                    <!-- FORMULARIO NUEVO CENTRO -->
                    <div class="widget-card" style="border: 1px solid rgba(251,191,36,0.15); background: rgba(0,0,0,0.3);">
                        <h3 class="widget-title" style="font-size: 18px; color: #fbbf24; margin-bottom:20px;">➕ Registrar Nuevo Centro Médico</h3>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Nombre del Centro Médico</label>
                            <input type="text" id="centro-new-nombre" placeholder="Ej. Clínicas Alfa">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 12px;">
                            <div class="input-group">
                                <label>Límite de Médicos</label>
                                <input type="number" id="centro-new-limite" placeholder="Ej. 5">
                            </div>
                            <div class="input-group">
                                <label>País</label>
                                <select id="centro-new-country" onchange="window.centroUpdateDefaults()" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); padding: 12px; border-radius: 12px; color: white;">
                                    ${Object.keys(countryData).map(code => `<option value="${code}">${countryData[code].name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label id="centro-nit-label">NIT / Id Fiscal</label>
                            <input type="text" id="centro-new-nit" placeholder="Identificador">
                        </div>
                        <div style="border-top:1px solid rgba(255,255,255,0.08); margin:16px 0; padding-top:14px;">
                            <h4 style="font-size: 14px; color: #fbbf24; margin-bottom:14px; font-weight:700;">👤 Datos del Administrador General</h4>
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Nombre Completo</label>
                            <input type="text" id="centro-admin-nombre" placeholder="Ej. Juan Pérez">
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Número de Identificación (Llave Primaria)</label>
                            <input type="text" id="centro-admin-id" placeholder="Clave Primaria">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 12px;">
                            <div class="input-group">
                                <label>Teléfono</label>
                                <input type="text" id="centro-admin-telefono" placeholder="+502 ...">
                            </div>
                            <div class="input-group">
                                <label>Correo</label>
                                <input type="email" id="centro-admin-correo" placeholder="admin@ejemplo.com">
                            </div>
                        </div>
                        
                        <button class="btn-primary" style="width: 100%; background: linear-gradient(135deg,#fbbf24,#f59e0b); color: #000; font-weight: 800; padding: 18px; font-size: 16px; margin-top: 16px; border-radius:14px; letter-spacing:0.5px;" onclick="window.saveNewCentro()">
                            🏥 CREAR CENTRO MÉDICO
                        </button>

                        <!-- CONTACTO SISDEL EN EL PANEL PROGRAMADOR -->
                        <div style="margin-top:24px; background:linear-gradient(135deg,rgba(34,211,238,0.06),rgba(34,211,238,0.02)); border:1px solid rgba(34,211,238,0.2); border-radius:14px; padding:18px;">
                            <p style="font-size:11px; color:#22d3ee; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">📞 Soporte SISDEL Internacional</p>
                            <a href="https://wa.me/50243093379" target="_blank" style="display:flex; align-items:center; gap:10px; text-decoration:none; background:rgba(37,211,102,0.1); border:1px solid rgba(37,211,102,0.2); border-radius:10px; padding:10px 14px; color:#4ade80; font-weight:700; font-size:13px; margin-bottom:8px; transition:all 0.2s;" onmouseover="this.style.background='rgba(37,211,102,0.2)'" onmouseout="this.style.background='rgba(37,211,102,0.1)'">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#4ade80"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                WhatsApp: (502) 4309-3379
                            </a>
                            <a href="tel:+50224584164" style="display:flex; align-items:center; gap:10px; text-decoration:none; background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.2); border-radius:10px; padding:10px 14px; color:#60a5fa; font-weight:700; font-size:13px; margin-bottom:8px; transition:all 0.2s;" onmouseover="this.style.background='rgba(96,165,250,0.2)'" onmouseout="this.style.background='rgba(96,165,250,0.1)'">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 .93h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                                Llamar: (502) 2458-4164
                            </a>
                            <a href="mailto:sisdelsoluciones@gmail.com" style="display:flex; align-items:center; gap:10px; text-decoration:none; background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.2); border-radius:10px; padding:10px 14px; color:#fbbf24; font-weight:700; font-size:13px; transition:all 0.2s;" onmouseover="this.style.background='rgba(251,191,36,0.18)'" onmouseout="this.style.background='rgba(251,191,36,0.08)'">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                sisdelsoluciones@gmail.com
                            </a>
                            <p style="font-size:11px; color:rgba(255,255,255,0.35); margin-top:10px; text-align:center;">www.sisdel.net</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => {
            if (window.centroUpdateDefaults) window.centroUpdateDefaults();
        }, 50);
    }

    const countryData = {
        "AR": { name: "Argentina", currency: "ARS", timezone: "America/Argentina/Buenos_Aires", dateLocale: "es-AR", taxIdName: "CUIT", phonePrefix: "+54" },
        "BO": { name: "Bolivia", currency: "BOB", timezone: "America/La_Paz", dateLocale: "es-BO", taxIdName: "NIT", phonePrefix: "+591" },
        "BR": { name: "Brasil", currency: "BRL", timezone: "America/Sao_Paulo", dateLocale: "pt-BR", taxIdName: "CNPJ/CPF", phonePrefix: "+55" },
        "CA": { name: "Canadá", currency: "CAD", timezone: "America/Toronto", dateLocale: "en-CA", taxIdName: "SIN/BN", phonePrefix: "+1" },
        "CL": { name: "Chile", currency: "CLP", timezone: "America/Santiago", dateLocale: "es-CL", taxIdName: "RUT", phonePrefix: "+56" },
        "CO": { name: "Colombia", currency: "COP", timezone: "America/Bogota", dateLocale: "es-CO", taxIdName: "NIT", phonePrefix: "+57" },
        "CR": { name: "Costa Rica", currency: "CRC", timezone: "America/Costa_Rica", dateLocale: "es-CR", taxIdName: "Cédula", phonePrefix: "+506" },
        "CU": { name: "Cuba", currency: "CUP", timezone: "America/Havana", dateLocale: "es-CU", taxIdName: "NIT", phonePrefix: "+53" },
        "DO": { name: "República Dominicana", currency: "DOP", timezone: "America/Santo_Domingo", dateLocale: "es-DO", taxIdName: "RNC", phonePrefix: "+1-809" },
        "EC": { name: "Ecuador", currency: "USD", timezone: "America/Guayaquil", dateLocale: "es-EC", taxIdName: "RUC", phonePrefix: "+593" },
        "US": { name: "Estados Unidos", currency: "USD", timezone: "America/New_York", dateLocale: "en-US", taxIdName: "Tax ID", phonePrefix: "+1" },
        "SV": { name: "El Salvador", currency: "USD", timezone: "America/El_Salvador", dateLocale: "es-SV", taxIdName: "NIT", phonePrefix: "+503" },
        "ES": { name: "España", currency: "EUR", timezone: "Europe/Madrid", dateLocale: "es-ES", taxIdName: "NIF/CIF", phonePrefix: "+34" },
        "GT": { name: "Guatemala", currency: "GTQ", timezone: "America/Guatemala", dateLocale: "es-GT", taxIdName: "NIT", phonePrefix: "+502" },
        "HN": { name: "Honduras", currency: "HNL", timezone: "America/Tegucigalpa", dateLocale: "es-HN", taxIdName: "RTN", phonePrefix: "+504" },
        "MX": { name: "México", currency: "MXN", timezone: "America/Mexico_City", dateLocale: "es-MX", taxIdName: "RFC", phonePrefix: "+52" },
        "NI": { name: "Nicaragua", currency: "NIO", timezone: "America/Managua", dateLocale: "es-NI", taxIdName: "RUC", phonePrefix: "+505" },
        "PA": { name: "Panamá", currency: "PAB", timezone: "America/Panama", dateLocale: "es-PA", taxIdName: "RUC", phonePrefix: "+507" },
        "PY": { name: "Paraguay", currency: "PYG", timezone: "America/Asuncion", dateLocale: "es-PY", taxIdName: "RUC", phonePrefix: "+595" },
        "PE": { name: "Perú", currency: "PEN", timezone: "America/Lima", dateLocale: "es-PE", taxIdName: "RUC", phonePrefix: "+51" },
        "PR": { name: "Puerto Rico", currency: "USD", timezone: "America/Puerto_Rico", dateLocale: "es-PR", taxIdName: "SSN", phonePrefix: "+1-787" },
        "UY": { name: "Uruguay", currency: "UYU", timezone: "America/Montevideo", dateLocale: "es-UY", taxIdName: "RUT", phonePrefix: "+598" },
        "VE": { name: "Venezuela", currency: "VES", timezone: "America/Caracas", dateLocale: "es-VE", taxIdName: "RIF", phonePrefix: "+58" }
    };

    window.centroUpdateDefaults = () => {
        const ccode = document.getElementById('centro-new-country');
        if (!ccode) return;
        const cdata = countryData[ccode.value];
        if (cdata) {
            const nitLabel = document.getElementById('centro-nit-label');
            if (nitLabel) nitLabel.textContent = cdata.taxIdName + ' del Centro Médico';
            
            const phoneInput = document.getElementById('centro-admin-telefono');
            if (phoneInput && !phoneInput.value.includes('+')) {
                phoneInput.value = cdata.phonePrefix + ' ';
            }
        }
    };

    window.saveNewCentro = async () => {
        const nombre = document.getElementById('centro-new-nombre').value.trim();
        const max_medicos = parseInt(document.getElementById('centro-new-limite').value.trim() || '0');
        
        const adminNombre = document.getElementById('centro-admin-nombre').value.trim();
        const adminId = document.getElementById('centro-admin-id').value.trim();
        const adminTelefono = document.getElementById('centro-admin-telefono').value.trim();
        const adminCorreo = document.getElementById('centro-admin-correo').value.trim();
        const pais = document.getElementById('centro-new-country').value;
        const nitCentro = document.getElementById('centro-new-nit').value.trim();
        
        if (!nombre || max_medicos <= 0 || !adminNombre || !adminId) {
            window.showElegantAlert('Datos Incompletos', 'Se requiere el Nombre del Centro, Límite de médicos, Nombre del Administrador y su ID.', true);
            return;
        }

        const dataPais = countryData[pais];
        const admin_code = Math.floor(100000 + Math.random() * 900000).toString();
        const id_centro = 'CEN-' + Date.now();
        const nuevoCentro = { 
            id_centro, nombre, admin_code, max_medicos, 
            admin_nombre: adminNombre, admin_id: adminId, 
            admin_telefono: adminTelefono, admin_correo: adminCorreo,
            pais: pais, nit: nitCentro,
            moneda: dataPais.currency, timezone: dataPais.timezone, dateLocale: dataPais.dateLocale
        };
        
        try {
            const resp = await fetch(`/api/centro/${id_centro}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoCentro)
            });
            await resp.json();
        } catch (e) {
            console.log('Using offline failover for saving centro');
        }

        let centrosLocales = JSON.parse(localStorage.getItem('tabla_centros') || '[]');
        centrosLocales.push(nuevoCentro);
        localStorage.setItem('tabla_centros', JSON.stringify(centrosLocales));

        // ✅ AUTO-BACKUP: snapshot con timestamp para recuperación ante pérdida
        const backupKey = 'centros_backup_' + new Date().toISOString().slice(0, 10);
        localStorage.setItem(backupKey, JSON.stringify(centrosLocales));
        localStorage.setItem('centros_last_backup', new Date().toISOString());

        window.showElegantAlert('Centro Registrado', `Se ha generado el Centro ${nombre} para el administrador ${adminNombre}. El código de acceso del sistema es: ${admin_code}`);
        renderProgrammer();
    };

    // ✅ EXPORTAR DATOS: descarga JSON completo de centros y médicos
    window.exportarDatosSisdel = () => {
        const centros = JSON.parse(localStorage.getItem('tabla_centros') || '[]');
        const medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const payload = {
            exportado_en: new Date().toLocaleString('es-ES'),
            version: 'DR-SISDEL-v1',
            centros,
            medicos
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sisdel_backup_${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        window.showElegantAlert('Backup Exportado', 'El archivo JSON con todos los datos fue descargado. Guárdalo en un lugar seguro.');
    };

    // ✅ IMPORTAR DATOS: restaurar desde archivo JSON exportado
    window.importarDatosSisdel = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.centros) {
                        const local = JSON.parse(localStorage.getItem('tabla_centros') || '[]');
                        const merged = [...local];
                        data.centros.forEach(c => {
                            if (!merged.find(m => m.id_centro === c.id_centro)) merged.push(c);
                        });
                        localStorage.setItem('tabla_centros', JSON.stringify(merged));
                    }
                    if (data.medicos) {
                        const localM = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
                        const mergedM = [...localM];
                        data.medicos.forEach(m => {
                            if (!mergedM.find(x => x.id_medico === m.id_medico)) mergedM.push(m);
                        });
                        localStorage.setItem('tabla_medicos', JSON.stringify(mergedM));
                    }
                    window.showElegantAlert('Importación Exitosa', `Se restauraron ${data.centros?.length || 0} centros y ${data.medicos?.length || 0} médicos.`);
                    renderProgrammer();
                } catch(err) {
                    window.showElegantAlert('Error', 'El archivo no es válido o está corrupto.', true);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    window.deleteCentro = async (id) => {
        if (confirm('¿Seguro que desea eliminar este centro médico? Se perderá acceso.')) {
            try {
                await fetch(`/api/centro/${id}`, { method: 'DELETE' });
            } catch (e) {}

            let centrosLocales = JSON.parse(localStorage.getItem('tabla_centros') || '[]');
            centrosLocales = centrosLocales.filter(c => c.id_centro !== id);
            localStorage.setItem('tabla_centros', JSON.stringify(centrosLocales));
            renderProgrammer();
            window.showElegantAlert('Eliminado', 'El centro médico ha sido removido localmente.');
        }
    };

    // --- MÓDULO ADMINISTRADOR GENERAL ---
    async function renderAdminGeneral() {
        const id_centro = localStorage.getItem('id_centro');
        const nombre_centro = localStorage.getItem('nombre_centro');
        const max_medicos = parseInt(localStorage.getItem('max_medicos') || '0');

        let medicos = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos = (result.medicos || []).filter(m => m.id_centro === id_centro);
        } catch (e) {
            const allMedicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
            medicos = allMedicos.filter(m => m.id_centro === id_centro);
        }
        
        contentArea.innerHTML = `
            <div class="programmer-dashboard animate-in">
                <div style="display: grid; grid-template-columns: 1fr 400px; gap: 30px;">
                    <div class="widget-card" style="border: 3px solid #60a5fa; box-shadow: 0 0 20px rgba(96, 165, 250, 0.1);">
                        <h3 class="widget-title" style="color: #60a5fa; border-bottom: 2px solid rgba(96, 165, 250, 0.2); padding-bottom: 20px;">
                            Médicos de ${nombre_centro} (${medicos.length}/${max_medicos})
                        </h3>
                        <div class="doctor-list" style="margin-top: 30px; display: grid; gap: 20px;">
                            ${medicos.length > 0 ? medicos.map(doc => `
                                <div class="med-item" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); padding: 20px; border-radius: 16px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <h4 style="font-size: 20px; color: white; margin-bottom: 5px;">${doc.nombre_completo}</h4>
                                            <p style="color: var(--accent); font-weight: 600; font-size: 14px;">DPI/ID: ${doc.id_medico} | NIT: ${doc.nit || 'N/A'}</p>
                                            <p style="color: var(--text-muted); font-size: 13px; margin-top: 5px;">
                                                País: ${doc.pais_nombre || doc.pais} | Moneda: ${doc.moneda}
                                                <br>Contacto: ${doc.telefono || 'Sin tel.'} | ${doc.correo || 'Sin correo'}
                                            </p>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="background: #60a5fa; color: #000; padding: 10px 15px; border-radius: 10px; font-weight: 800; font-size: 18px; margin-bottom: 10px; display: inline-block; letter-spacing: 2px; font-family: monospace;">
                                                 Acceso: ${doc.password_hash ? atob(doc.password_hash) : '---'}
                                            </div>
                                            <br>
                                            <button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer;" onclick="window.deleteDoctorByAdmin('${doc.id_medico}')">ELIMINAR</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div style="text-align:center; padding: 40px; border: 2px dashed rgba(255,255,255,0.05); border-radius: 20px; color: var(--text-muted);">No hay médicos registrados todavía.</div>'}
                        </div>
                    </div>

                    <div class="widget-card" style="border: 2px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2);">
                        <h3 class="widget-title" style="font-size: 22px; color: #60a5fa;">Registrar Nuevo Médico</h3>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Nombre Completo</label>
                            <input type="text" id="doc-new-name" placeholder="Ej. Dr. Roberto Gómez">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="input-group" style="margin-bottom: 12px;">
                                <label>DPI / ID (Clave Primaria)</label>
                                <input type="text" id="doc-new-dpi" placeholder="ID Único">
                            </div>
                            <div class="input-group" style="margin-bottom: 12px;">
                                <label>NIT / Tax ID</label>
                                <input type="text" id="doc-new-nit" placeholder="Nit">
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 15px;">
                            <div class="input-group" style="margin-bottom: 12px;">
                                <label>Edad</label>
                                <input type="number" id="doc-new-age" placeholder="Años">
                            </div>
                            <div class="input-group" style="margin-bottom: 12px;">
                                <label>País</label>
                                <select id="doc-new-country" onchange="window.adminUpdateDocNewDefaults()" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); padding: 12px; border-radius: 12px; color: white;">
                                    ${Object.keys(countryData).map(code => `<option value="${code}">${countryData[code].name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Teléfono</label>
                            <input type="text" id="doc-new-phone" placeholder="+502 ...">
                        </div>
                        <div class="input-group" style="margin-bottom: 12px;">
                            <label>Correo Electrónico</label>
                            <input type="email" id="doc-new-email" placeholder="medico@ejemplo.com">
                        </div>
                        <div class="input-group" style="margin-bottom: 25px;">
                            <label>Moneda Configurada</label>
                            <input type="text" id="doc-new-currency" readonly style="opacity: 0.6; background: rgba(255,255,255,0.05);">
                        </div>
                        
                        <button class="btn-primary" style="width: 100%; background: #60a5fa; color: #000; font-weight: 800; padding: 22px; font-size: 18px;" onclick="window.saveNewDoctorByAdmin()">
                            GENERAR ACCESO Y REGISTRAR
                        </button>
                    </div>
                </div>
            </div>
        `;
        window.adminUpdateDocNewDefaults();
    }

    window.adminUpdateDocNewDefaults = () => {
        const countryCode = document.getElementById('doc-new-country').value;
        const data = countryData[countryCode];
        if (data && document.getElementById('doc-new-currency')) {
            document.getElementById('doc-new-currency').value = data.currency;
        }
    };

    window.saveNewDoctorByAdmin = async () => {
        const id_centro = localStorage.getItem('id_centro');
        const nombre_centro = localStorage.getItem('nombre_centro');
        const max_medicos = parseInt(localStorage.getItem('max_medicos') || '0');

        let medicos_actuales = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos_actuales = (result.medicos || []).filter(m => m.id_centro === id_centro);
        } catch (e) {
            const allMedicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
            medicos_actuales = allMedicos.filter(m => m.id_centro === id_centro);
        }

        if (medicos_actuales.length >= max_medicos) {
            window.showElegantAlert('Límite Alcanzado', 'USTED YA ACTIVO LA CANTIDAD DE MEDICOS QUE USARAN ESTE SISTEMA, SI DESEA AMPLIAR FAVOR COMUNQUESE CON SISDEL INTERNACIONAL: WWW.SISDEL.NET, WHATSAPP: (502)4309-3379', true);
            return;
        }

        const nombre = document.getElementById('doc-new-name').value.trim();
        const dpi = document.getElementById('doc-new-dpi').value.trim();
        const nit = document.getElementById('doc-new-nit').value.trim();
        const age = document.getElementById('doc-new-age').value.trim();
        const pais = document.getElementById('doc-new-country').value;
        const phone = document.getElementById('doc-new-phone').value.trim();
        const email = document.getElementById('doc-new-email').value.trim();
        
        if (!nombre || !dpi) {
            window.showElegantAlert('Datos Incompletos', 'Se requiere al menos el Nombre y el número de Identificación (DPI/ID).', true);
            return;
        }

        const data = countryData[pais];
        
        const firstLetter = nombre_centro.charAt(0).toUpperCase();
        const randomLetters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const randomNumbers = Math.floor(100 + Math.random() * 900).toString();
        const accessCode = firstLetter + randomLetters + randomNumbers;

        const newDoc = {
            id_medico: dpi,
            id_centro: id_centro,
            nombre_completo: nombre,
            especialidad: 'Medicina General',
            usuario: nombre.replace(/\s+/g, '').toUpperCase(),
            password_hash: btoa(accessCode),
            nit, edad: age, pais,
            pais_nombre: data.name,
            telefono: phone, correo: email,
            moneda: data.currency,
            timezone: data.timezone,
            dateLocale: data.dateLocale
        };

        try {
            const resp = await fetch(`/api/medico/${dpi}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDoc)
            });
            await resp.json();
        } catch (e) {
            console.log('Fallover offline para medico admin general');
        }

        let medicosList = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        medicosList.push(newDoc);
        localStorage.setItem('tabla_medicos', JSON.stringify(medicosList));
        
        if (medicosList.length === 1) {
            localStorage.setItem('active_company', JSON.stringify(newDoc));
        }

        window.showElegantAlert('Médico Registrado', `Se ha generado el acceso para ${nombre}. El código de entrada es: ${accessCode}`);
        renderAdminGeneral();
    };

    window.deleteDoctorByAdmin = async (id) => {
        if (confirm('¿Seguro que desea eliminar este médico? Perderá acceso al sistema.')) {
            try {
                await fetch(`/api/medico/${id}`, { method: 'DELETE' });
            } catch (e) {}

            let medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
            medicos = medicos.filter(m => m.id_medico !== id);
            localStorage.setItem('tabla_medicos', JSON.stringify(medicos));
            renderAdminGeneral();
            window.showElegantAlert('Eliminado', 'El médico ha sido removido del sistema localmente.');
        }
    };

    // --- INICIALIZACIÓN ---

    // --- INICIALIZACIÓN ---

    // --- INICIALIZACIÓN ---
    updateUserDisplay();
    updateDate();

    window.showPatientChoiceModal = () => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.8)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '99999';
        overlay.style.backdropFilter = 'blur(5px)';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';

        const card = document.createElement('div');
        card.className = 'widget-card animate-in';
        card.style.background = '#0f172a';
        card.style.padding = '40px';
        card.style.borderRadius = '24px';
        card.style.border = '2px solid rgba(16, 185, 129, 0.4)';
        card.style.textAlign = 'center';
        card.style.maxWidth = '450px';
        card.style.transform = 'scale(0.9)';
        card.style.transition = 'transform 0.3s ease';

        card.innerHTML = `
            <div style="width: 60px; height: 60px; background: rgba(59, 130, 246, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
            </div>
            <h3 style="color: white; font-size: 24px; margin-bottom: 15px;">Selección de Paciente</h3>
            <p style="color: rgba(255,255,255,0.7); margin-bottom: 30px; font-size: 16px; line-height: 1.5;">Para iniciar una consulta médica, seleccione qué tipo de paciente va a atender.</p>
            
            <button id="btn-nuevo" style="width: 100%; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 15px; background: rgba(59, 130, 246, 0.15); border: 2px solid #3b82f6; color: #60a5fa; transition: all 0.2s;">
                Es un Paciente Nuevo
                <div style="font-size: 12px; font-weight: normal; opacity: 0.8; margin-top: 5px;">Llenar Formulario Inicial</div>
            </button>
            
            <button id="btn-buscar" style="width: 100%; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 25px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; color: #34d399; transition: all 0.2s;">
                Ya es Segunda Visita (Existente)
                <div style="font-size: 12px; font-weight: normal; opacity: 0.8; margin-top: 5px;">Buscar por Nombre o Identificación</div>
            </button>
            
            <button id="btn-cancel" style="background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cancelar / Volver</button>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = '1';
            card.style.transform = 'scale(1)';
        }, 10);

        const close = () => {
            overlay.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => document.body.removeChild(overlay), 300);
        };

        const addHover = (id, hoverBg) => {
            const el = document.getElementById(id);
            const origBg = el.style.background;
            el.onmouseenter = () => el.style.background = hoverBg;
            el.onmouseleave = () => el.style.background = origBg;
        };
        addHover('btn-nuevo', 'rgba(59, 130, 246, 0.3)');
        addHover('btn-buscar', 'rgba(16, 185, 129, 0.3)');
        document.getElementById('btn-cancel').onmouseenter = (e) => e.target.style.color = 'white';
        document.getElementById('btn-cancel').onmouseleave = (e) => e.target.style.color = 'rgba(255,255,255,0.5)';

        document.getElementById('btn-nuevo').onclick = () => {
            close();
            window.renderDoctorHome('register');
        };
        
        document.getElementById('btn-buscar').onclick = () => {
            close();
            window.renderDoctorHome('search');
            setTimeout(() => {
                const searchBox = document.getElementById('patient-search');
                if(searchBox) searchBox.focus();
            }, 300);
        };

        document.getElementById('btn-cancel').onclick = close;
    };

    window.showPatientGeneralData = function(qsl) {
        window.renderDoctorHome('register');
        const data = localStorage.getItem('patient_data_' + qsl);
        if(data) {
            const p = JSON.parse(data);
            const name = localStorage.getItem('patient_name_' + qsl) || '';
            document.getElementById('p-nombre').value = name;
            
            const mapIfExist = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };

            // Datos de filiación
            mapIfExist('p-fecha-nac', p.fecha_nacimiento);
            mapIfExist('p-edad', p.edad);
            mapIfExist('p-gender', p.genero);
            mapIfExist('p-id', p.id_identificacion);
            mapIfExist('p-civil', p.estado_civil);
            mapIfExist('p-ocupacion', p.ocupacion);
            mapIfExist('p-direccion', p.direccion);
            mapIfExist('p-telefono', p.telefono);
            mapIfExist('p-email', p.email);
            mapIfExist('p-emerg-nombre', p.contacto_emergencia || p.contacto_emergencia_nombre);
            mapIfExist('p-emerg-rel', p.relacion_emergencia || p.contacto_emergencia_relacion);
            mapIfExist('p-emerg-tel', p.telefono_emergencia || p.contacto_emergencia_tel);
            mapIfExist('p-seguro', p.seguro_medico);
            mapIfExist('p-motivo', p.illness);

            // Historia clínica — soporta ambas nomenclaturas (registro y consulta)
            mapIfExist('p-sangre', p.tipo_sangre);
            mapIfExist('p-glucosa', p.glucosa);
            mapIfExist('p-alergias', p.alergias);
            mapIfExist('p-ant-pers', p.antecedentes_personales || p.antPersonales);
            mapIfExist('p-ant-quir', p.antecedentes_quirurgicos || p.antQuirurgicos);
            mapIfExist('p-ant-fam', p.antecedentes_familiares || p.antFamiliares);
            mapIfExist('p-meds-act', p.medicamentos_actuales || p.medicamentos);
            mapIfExist('p-habitos', p.habitos);

            const btn = document.getElementById('btn-add-patient');
            if(btn) {
                btn.textContent = 'ACTUALIZAR EXPEDIENTE';
                btn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
                btn.onclick = () => window.selectPatientAndGoToConsultation(qsl);
            }
            
            const title = document.querySelector('#view-registration h3.widget-title');
            if(title) {
                title.innerHTML = '<span style="color:#60a5fa;">📋 Datos Generales: ' + name + '</span>';
            }
            
            const backBtnText = document.getElementById('btn-reg-back-text');
            if(backBtnText) backBtnText.textContent = 'Volver a Consulta';
            
            const backBtn = document.getElementById('btn-reg-back');
            if(backBtn) backBtn.onclick = () => window.selectPatientAndGoToConsultation(qsl);
        }
    };


    
    window.renderGlobalLabUploader = function() {
        const patients = window.patients || [];
        // Generate options
        const opts = patients.map(qsl => {
            const name = localStorage.getItem('patient_name_' + qsl) || 'Desconocido';
            return `<option value="${qsl}">${name} (${qsl})</option>`;
        }).join('');

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 600px; margin: 0 auto; padding: 40px; border: 3px solid rgba(168,85,247, 0.4); border-radius: 24px;">
                <h3 class="widget-title" style="color: #c084fc; font-size: 26px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(168,85,247,0.1); padding-bottom: 20px; margin-bottom: 30px;">
                    <span>🧪 Subida Rápida de Laboratorios</span>
                    <button class="status-badge" style="background: rgba(255,255,255,0.1); padding: 10px 15px; cursor: pointer; border: none; color: white;" onclick="window.renderScheduler()">
                        Cancelar
                    </button>
                </h3>
                
                <div style="background: rgba(168,85,247,0.05); padding: 25px; border-radius: 15px; border: 1px dashed rgba(168,85,247,0.3);">
                    <div style="margin-bottom:15px;">
                        <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Seleccionar Paciente *</label>
                        <select id="glob-lab-qsl" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                            <option value="">-- Elija un Paciente --</option>
                            ${opts}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:15px; margin-bottom:15px;">
                        <div>
                            <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Fecha *</label>
                            <input type="date" id="glob-lab-date" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                        </div>
                        <div>
                            <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Tipo de Examen *</label>
                            <input type="text" id="glob-lab-title" placeholder="Ej: Hematología Completa" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Cargar Imagen (Opcional)</label>
                        <input type="file" id="glob-lab-file" accept="image/*" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                    </div>
                    <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Observaciones</label>
                    <textarea id="glob-lab-notes" rows="2" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; margin-bottom:15px;"></textarea>
                    
                    <button onclick="window.saveGlobalLaboratory()" style="width:100%; padding:12px; background:#c084fc; color:black; font-weight:bold; border-radius:10px; border:none; cursor:pointer;">GUARDAR Y ASIGNAR A PACIENTE</button>
                </div>
            </div>
        `;
    };

    window.saveGlobalLaboratory = function() {
        const qsl = document.getElementById('glob-lab-qsl').value;
        const date = document.getElementById('glob-lab-date').value;
        const title = document.getElementById('glob-lab-title').value.trim();
        const notes = document.getElementById('glob-lab-notes').value.trim();
        const fileInput = document.getElementById('glob-lab-file');

        if(!qsl || !date || !title) {
            window.showElegantAlert('Error', 'Debe seleccionar paciente, ingresar fecha y tipo de examen.');
            return;
        }

        const proceedSave = (base64) => {
            const key = 'patient_labs_' + qsl;
            const labs = JSON.parse(localStorage.getItem(key) || '[]');
            labs.push({ id: Date.now().toString(), date: date, title: title, notes: notes, imageBase64: base64 || null });
            localStorage.setItem(key, JSON.stringify(labs));
            
            window.showElegantAlert('Asignación Completada', 'El laboratorio se subió a la ficha del paciente correctamente.');
            window.renderScheduler();
        };

        if(fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                proceedSave(e.target.result);
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            proceedSave(null);
        }
    };

    window.renderLaboratories = function() {
        if(!selectedPatientQSL) return;
        const key = 'patient_labs_' + selectedPatientQSL;
        const labs = JSON.parse(localStorage.getItem(key) || '[]');
        
        let labsHtml = '';
        if(labs.length === 0) {
            labsHtml = '<div style="text-align:center; opacity:0.5; margin-top:20px;">No hay laboratorios registrados.</div>';
        } else {
            labs.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(l => {
                const imgHtml = l.imageBase64 ? `<div style="margin-top:15px; border-radius:8px; overflow:hidden;"><img src="${l.imageBase64}" style="max-width:100%; display:block; border:1px solid rgba(255,255,255,0.1); border-radius:8px;"/></div>` : '';
                labsHtml += `
                    <div style="background: rgba(0,0,0,0.3); border-left: 4px solid #c084fc; padding: 20px; border-radius: 12px; margin-bottom: 15px; position:relative;">
                        <strong style="color:#c084fc; font-size:18px;">${l.date} - ${l.title}</strong>
                        <button onclick="window.deleteLaboratory('${l.id}')" style="position:absolute; top:15px; right:15px; background:rgba(239, 68, 68, 0.1); color: #ef4444; border:none; padding:5px 10px; border-radius:8px; cursor:pointer;">Borrar</button>
                        <p style="color:rgba(255,255,255,0.8); margin-top:10px; font-size:14px;">${l.notes}</p>
                        ${imgHtml}
                    </div>
                `;
            });
        }

        const name = localStorage.getItem('patient_name_' + selectedPatientQSL) || '';

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 800px; margin: 0 auto; padding: 40px; border: 3px solid rgba(168,85,247, 0.4); border-radius: 24px;">
                <h3 class="widget-title" style="color: #c084fc; font-size: 28px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(168,85,247,0.1); padding-bottom: 20px; margin-bottom: 30px;">
                    <span>🧪 Control de Laboratorios</span>
                    <button class="status-badge" style="background: rgba(255,255,255,0.1); padding: 10px 15px; cursor: pointer; border: none; color: white;" onclick="window.selectPatientAndGoToConsultation('${selectedPatientQSL}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;"><polyline points="15 18 9 12 15 6"></polyline></svg> Volver a Consulta
                    </button>
                </h3>
                
                <h4 style="color:white; margin-bottom:20px;">Paciente: <span style="color:#c084fc;">${name}</span></h4>

                <div style="background: rgba(168,85,247,0.05); padding: 25px; border-radius: 15px; margin-bottom: 30px; border: 1px dashed rgba(168,85,247,0.3);">
                    <h4 style="color: #c084fc; margin-bottom: 15px;">Adjuntar Nuevo Laboratorio</h4>
                    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:15px; margin-bottom:15px;">
                        <div>
                            <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Fecha del Examen</label>
                            <input type="date" id="lab-date" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                        </div>
                        <div>
                            <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Tipo de Examen</label>
                            <input type="text" id="lab-title" placeholder="Ej: Hematología Completa" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Subir Archivo / Foto del Laboratorio (Opcional)</label>
                        <input type="file" id="lab-file" accept="image/*" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                    </div>

                    <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Resultados / Observaciones</label>
                    <textarea id="lab-notes" rows="2" placeholder="Valores destacables..." style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; margin-bottom:15px;"></textarea>
                    
                    <button onclick="window.saveLaboratory()" style="width:100%; padding:12px; background:#c084fc; color:black; font-weight:bold; border-radius:10px; border:none; cursor:pointer;">GUARDAR LABORATORIO Y FOTO</button>
                </div>

                <h4 style="color:white; margin-bottom:15px;">Tus Laboratorios Subidos</h4>
                <div id="lab-list">
                    ${labsHtml}
                </div>
            </div>
        `;
    };

    window.saveLaboratory = function() {
        const date = document.getElementById('lab-date').value;
        const title = document.getElementById('lab-title').value.trim();
        const notes = document.getElementById('lab-notes').value.trim();
        const fileInput = document.getElementById('lab-file');

        if(!date || !title) {
            window.showElegantAlert('Error', 'Debe ingresar al menos la fecha y el tipo de examen.');
            return;
        }

        const proceedSave = (base64) => {
            const key = 'patient_labs_' + selectedPatientQSL;
            const labs = JSON.parse(localStorage.getItem(key) || '[]');
            labs.push({ id: Date.now().toString(), date: date, title: title, notes: notes, imageBase64: base64 || null });
            localStorage.setItem(key, JSON.stringify(labs));
            
            window.showElegantAlert('Laboratorio Guardado', 'El examen y su imagen se asociaron al paciente exitosamente.');
            window.renderLaboratories();
        };

        if(fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                proceedSave(e.target.result);
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            proceedSave(null);
        }
    };


    window.showAppointmentPreview = function(qsl, dateStr, timeStr) {
        const name = localStorage.getItem('patient_name_' + qsl) || 'Desconocido';
        const data = getPatientData(qsl) || {};
        const tel = data.telefono || 'No registrado';

        const mainOverlay = document.createElement('div');
        mainOverlay.id = 'appointment-preview-modal';
        mainOverlay.style.position = 'fixed';
        mainOverlay.style.top = '0';
        mainOverlay.style.left = '0';
        mainOverlay.style.width = '100%';
        mainOverlay.style.height = '100%';
        mainOverlay.style.background = 'rgba(0,0,0,0.85)';
        mainOverlay.style.display = 'flex';
        mainOverlay.style.alignItems = 'center';
        mainOverlay.style.justifyContent = 'center';
        mainOverlay.style.zIndex = '99999';
        mainOverlay.style.backdropFilter = 'blur(5px)';

        mainOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: #0f172a; padding: 40px; border-radius: 24px; border: 2px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 450px; width:100%; position:relative;">
                <div style="width: 60px; height: 60px; border-radius: 30px; background: rgba(16, 185, 129, 0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: #10b981;">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                
                <h3 style="color: white; font-size: 24px; margin-bottom: 5px;">${name}</h3>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 25px; font-size: 16px;">📞 Tel: ${tel}</p>
                
                <div style="margin-bottom: 30px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px; font-size: 14px;">
                    <strong style="color:#10b981;">Cita Reservada:</strong><br>
                    ${dateStr} a las ${timeStr}
                </div>
                
                <button onclick="document.body.removeChild(document.getElementById('appointment-preview-modal')); window.openContextualLabUploader('${qsl}')" style="width: 100%; border-radius: 12px; padding: 16px; font-size: 15px; font-weight: bold; cursor: pointer; margin-bottom: 15px; background: rgba(168, 85, 247, 0.15); border: 2px solid #a855f7; color: #c084fc; transition: all 0.2s;">
                    🧪 Subir Laboratorios
                </button>
                
                <button onclick="document.body.removeChild(document.getElementById('appointment-preview-modal'))" style="margin-top:10px; background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cerrar</button>
            </div>
        `;
        document.body.appendChild(mainOverlay);
    };

    


    window.openContextualLabUploader = function(qsl) {
        const name = localStorage.getItem('patient_name_' + qsl) || '';
        const today = new Date().toISOString().split('T')[0];
        
        const key = 'patient_labs_' + qsl;
        const labs = JSON.parse(localStorage.getItem(key) || '[]');

        let labsHtml = '';
        if(labs.length === 0) {
            labsHtml = '<div style="text-align:center; opacity:0.5; padding:20px;">No hay laboratorios subidos aún.</div>';
        } else {
            labs.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(l => {
                let fileHtml = '';
                if(l.imageBase64) {
                    if(l.isPdf || l.imageBase64.includes('application/pdf')) {
                        fileHtml = `<div style="margin-top:12px;"><embed src="${l.imageBase64}" width="100%" height="400px" type="application/pdf"></div>`;
                    } else {
                        fileHtml = `<div style="margin-top:12px;"><img src="${l.imageBase64}" style="max-width:100%; border-radius:8px; border:1px solid rgba(255,255,255,0.1);"/></div>`;
                    }
                }
                labsHtml += `
                    <div style="background:rgba(0,0,0,0.3); border-left:4px solid #c084fc; padding:18px; border-radius:12px; margin-bottom:18px; position:relative;">
                        <strong style="color:#c084fc; font-size:16px;">${l.date}${l.title ? ' — ' + l.title : ''}</strong>
                        <button onclick="window.deleteContextualLab('${qsl}','${l.id}')" style="position:absolute; top:12px; right:12px; background:rgba(239,68,68,0.1); color:#ef4444; border:none; padding:4px 10px; border-radius:8px; cursor:pointer; font-size:12px;">Borrar</button>
                        ${l.notes ? `<p style="color:rgba(255,255,255,0.7); margin-top:8px; font-size:13px;">${l.notes}</p>` : ''}
                        ${fileHtml}
                    </div>`;
            });
        }

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 700px; margin: 0 auto; padding: 40px; border: 3px solid rgba(168,85,247, 0.4); border-radius: 24px;">
                <h3 class="widget-title" style="color: #c084fc; font-size: 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(168,85,247,0.1); padding-bottom: 20px; margin-bottom: 30px;">
                    <span>🧪 Laboratorios: ${name}</span>
                    <button class="status-badge" style="background: rgba(255,255,255,0.1); padding: 10px 15px; cursor: pointer; border: none; color: white;" onclick="window.renderScheduler()">
                        Volver al Calendario
                    </button>
                </h3>
                
                <div style="background: rgba(168,85,247,0.05); padding: 25px; border-radius: 15px; border: 1px dashed rgba(168,85,247,0.3); margin-bottom: 30px;">
                    <h4 style="color:#c084fc; margin-bottom:15px;">Subir Nuevo Resultado</h4>
                    <input type="date" id="quick-lab-date" value="${today}" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; margin-bottom: 15px;">
                    <input type="file" id="quick-lab-file" accept="image/*,application/pdf" style="width:100%; padding:15px; background:rgba(0,0,0,0.5); border:2px dashed #c084fc; color:white; border-radius:12px; margin-bottom:20px; cursor:pointer;">
                    <button onclick="window.saveQuickContextualLab('${qsl}')" style="width:100%; padding:14px; background:#c084fc; color:black; font-weight:bold; font-size: 15px; border-radius:12px; border:none; cursor:pointer;">
                        GUARDAR RESULTADO
                    </button>
                </div>

                <h4 style="color:white; margin-bottom:15px; font-size:16px;">Resultados Previos (más recientes primero)</h4>
                <div id="ctx-lab-list">
                    ${labsHtml}
                </div>
            </div>
        `;
    };

    window.saveQuickContextualLab = function(qsl) {
        const date = document.getElementById('quick-lab-date').value;
        const fileInput = document.getElementById('quick-lab-file');
        
        if(!fileInput.files || !fileInput.files[0]) {
            window.showElegantAlert('Error', 'Debe adjuntar al menos una imagen o PDF.');
            return;
        }

        const file = fileInput.files[0];
        const isPdf = file.type === 'application/pdf';

        const reader = new FileReader();
        reader.onload = function(e) {
            const key = 'patient_labs_' + qsl;
            const labs = JSON.parse(localStorage.getItem(key) || '[]');
            
            labs.push({ 
                id: Date.now().toString(), 
                date: date, 
                title: 'Resultado de Laboratorio', 
                notes: '', 
                imageBase64: e.target.result,
                isPdf: isPdf
            });
            
            localStorage.setItem(key, JSON.stringify(labs));
            // Refresh the same view to show the new lab
            window.openContextualLabUploader(qsl);
        };
        reader.readAsDataURL(file);
    };

    window.deleteContextualLab = function(qsl, id) {
        const key = 'patient_labs_' + qsl;
        let labs = JSON.parse(localStorage.getItem(key) || '[]');
        labs = labs.filter(l => l.id !== id);
        localStorage.setItem(key, JSON.stringify(labs));
        window.openContextualLabUploader(qsl);
    };

    // Override renderLaboratories to correctly display PDFs and sort by date descending (already sorting properly)
    // We must rebuild renderLaboratories just to ensure the PDF rendering block is included when a file is isPdf.
    const originalRenderLaboratories = window.renderLaboratories;
    window.renderLaboratories = function() {
        if(!selectedPatientQSL) return;
        const key = 'patient_labs_' + selectedPatientQSL;
        const labs = JSON.parse(localStorage.getItem(key) || '[]');
        
        let labsHtml = '';
        if(labs.length === 0) {
            labsHtml = '<div style="text-align:center; opacity:0.5; margin-top:20px;">No hay laboratorios registrados.</div>';
        } else {
            labs.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(l => {
                let fileRenderHtml = '';
                if(l.imageBase64) {
                    if(l.isPdf || l.imageBase64.includes('application/pdf')) {
                        fileRenderHtml = `
                            <div style="margin-top:15px; border-radius:8px; overflow:hidden;">
                                <embed src="${l.imageBase64}" width="100%" height="500px" type="application/pdf">
                            </div>
                        `;
                    } else {
                        fileRenderHtml = `
                            <div style="margin-top:15px; border-radius:8px; overflow:hidden;">
                                <img src="${l.imageBase64}" style="max-width:100%; display:block; border:1px solid rgba(255,255,255,0.1); border-radius:8px;"/>
                            </div>
                        `;
                    }
                }
                
                const notesHtml = l.notes ? `<p style="color:rgba(255,255,255,0.8); margin-top:10px; font-size:14px;">${l.notes}</p>` : '';

                labsHtml += `
                    <div style="background: rgba(0,0,0,0.3); border-left: 4px solid #c084fc; padding: 20px; border-radius: 12px; margin-bottom: 25px; position:relative;">
                        <strong style="color:#c084fc; font-size:18px;">${l.date} ${l.title ? '- ' + l.title : ''}</strong>
                        <button onclick="window.deleteLaboratory('${l.id}')" style="position:absolute; top:15px; right:15px; background:rgba(239, 68, 68, 0.1); color: #ef4444; border:none; padding:5px 10px; border-radius:8px; cursor:pointer;">Borrar</button>
                        ${notesHtml}
                        ${fileRenderHtml}
                    </div>
                `;
            });
        }

        const name = localStorage.getItem('patient_name_' + selectedPatientQSL) || '';

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 800px; margin: 0 auto; padding: 40px; border: 3px solid rgba(168,85,247, 0.4); border-radius: 24px;">
                <h3 class="widget-title" style="color: #c084fc; font-size: 28px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(168,85,247,0.1); padding-bottom: 20px; margin-bottom: 30px;">
                    <span>🧪 Control de Laboratorios</span>
                    <button class="status-badge" style="background: rgba(255,255,255,0.1); padding: 10px 15px; cursor: pointer; border: none; color: white;" onclick="window.selectPatientAndGoToConsultation('${selectedPatientQSL}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;"><polyline points="15 18 9 12 15 6"></polyline></svg> Volver a Consulta
                    </button>
                </h3>
                
                <h4 style="color:white; margin-bottom:20px;">Paciente: <span style="color:#c084fc;">${name}</span></h4>

                <div style="background: rgba(168,85,247,0.05); padding: 25px; border-radius: 15px; margin-bottom: 30px; border: 1px dashed rgba(168,85,247,0.3);">
                    <h4 style="color: #c084fc; margin-bottom: 15px;">Adjuntar Nuevo Laboratorio</h4>
                    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:15px; margin-bottom:15px;">
                        <div>
                            <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Fecha del Examen</label>
                            <input type="date" id="lab-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                        </div>
                        <div>
                            <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Tipo de Examen (Opcional)</label>
                            <input type="text" id="lab-title" placeholder="Ej: Hematología Completa" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Subir Archivo / Foto del Laboratorio (Obligatorio/Opcional)</label>
                        <input type="file" id="lab-file" accept="image/*,application/pdf" style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px;">
                    </div>

                    <label style="color:rgba(255,255,255,0.7); font-size:12px; margin-bottom:5px; display:block;">Resultados / Observaciones</label>
                    <textarea id="lab-notes" rows="2" placeholder="Notas breves..." style="width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; margin-bottom:15px;"></textarea>
                    
                    <button onclick="window.saveLaboratory()" style="width:100%; padding:12px; background:#c084fc; color:black; font-weight:bold; border-radius:10px; border:none; cursor:pointer;">GUARDAR LABORATORIO Y ARCHIVO</button>
                </div>

                <h4 style="color:white; margin-bottom:15px;">Laboratorios Subidos</h4>
                <div id="lab-list">
                    ${labsHtml}
                </div>
            </div>
        `;
    };

    // Override saveLaboratory for the full view to support PDF
    const oldSaveLab = window.saveLaboratory;
    window.saveLaboratory = function() {
        const date = document.getElementById('lab-date').value;
        const title = document.getElementById('lab-title').value.trim() || 'Laboratorio Adjunto';
        const notes = document.getElementById('lab-notes').value.trim();
        const fileInput = document.getElementById('lab-file');

        if(!date) {
            window.showElegantAlert('Error', 'Debe ingresar al menos la fecha del examen.');
            return;
        }

        const proceedSave = (base64, isPdf) => {
            const key = 'patient_labs_' + selectedPatientQSL;
            const labs = JSON.parse(localStorage.getItem(key) || '[]');
            labs.push({ 
                id: Date.now().toString(), 
                date: date, 
                title: title, 
                notes: notes, 
                imageBase64: base64 || null,
                isPdf: isPdf || false
            });
            localStorage.setItem(key, JSON.stringify(labs));
            
            window.showElegantAlert('Laboratorio Guardado', 'El examen y su imagen se asociaron al paciente exitosamente.');
            window.renderLaboratories();
        };

        if(fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const isPdf = file.type === 'application/pdf';
            const reader = new FileReader();
            reader.onload = function(e) {
                proceedSave(e.target.result, isPdf);
            };
            reader.readAsDataURL(file);
        } else {
            proceedSave(null, false);
        }
    };

    // ============================================================
    // MÓDULO DE CONFIGURACIÓN: PRIVILEGIOS Y APARIENCIA
    // Inspirado en MULTISYS — adaptado para DR-SISDEL
    // ============================================================

    // Catálogo de privilegios de DR-SISDEL
    const SISDEL_PRIVILEGES = {
        pacientes: {
            label: '👤 Pacientes', color: '#22d3ee',
            items: [
                { id: 'ver_pacientes', label: 'Ver pacientes', desc: 'Buscar y acceder a expedientes de pacientes' },
                { id: 'editar_pacientes', label: 'Editar pacientes', desc: 'Modificar datos clínicos del expediente', sensitive: true },
                { id: 'eliminar_registros', label: 'Eliminar registros', desc: 'Borrar datos del historial médico', sensitive: true },
            ]
        },
        consultas: {
            label: '🩺 Consultas Médicas', color: '#34d399',
            items: [
                { id: 'realizar_consulta', label: 'Registrar consulta', desc: 'Crear nuevas consultas y evoluciones' },
                { id: 'ver_historial', label: 'Ver historial', desc: 'Acceder al historial completo de consultas' },
                { id: 'gestionar_recetas', label: 'Gestionar recetas', desc: 'Crear y administrar recetas médicas' },
                { id: 'gestionar_laboratorios', label: 'Laboratorios', desc: 'Adjuntar y ver resultados de laboratorio' },
            ]
        },
        agenda: {
            label: '📅 Agenda y Citas', color: '#60a5fa',
            items: [
                { id: 'gestionar_citas', label: 'Gestionar citas', desc: 'Crear, editar y cancelar citas' },
                { id: 'ver_agenda', label: 'Ver agenda', desc: 'Ver el calendario de citas del médico' },
            ]
        },
        mensajeria: {
            label: '📨 Mensajería', color: '#f59e0b',
            items: [
                { id: 'enviar_alertas', label: 'Enviar alertas', desc: 'Enviar notificaciones individuales a pacientes' },
                { id: 'mensajeria_masiva', label: 'Mensajería masiva', desc: 'Enviar mensajes a grupos de pacientes', sensitive: true },
            ]
        },
        sistema: {
            label: '⚙️ Sistema', color: '#c084fc',
            items: [
                { id: 'gestionar_medicos', label: 'Gestionar médicos', desc: 'Agregar y eliminar cuentas de médicos', sensitive: true },
                { id: 'ver_estadisticas', label: 'Ver estadísticas', desc: 'Ver reportes y estadísticas del centro' },
            ]
        }
    };

    // Catálogo de temas visuales
    const SISDEL_THEMES = [
        { id: 'tema-oscuro', name: 'Oscuro', desc: 'Tema predeterminado', primary: '#4f46e5', accent: '#22d3ee', bg: '#0f172a' },
        { id: 'tema-claro', name: 'Claro', desc: 'Interfaz clara y limpia', primary: '#4f46e5', accent: '#0ea5e9', bg: '#f1f5f9' },
        { id: 'tema-premium', name: 'Premium', desc: 'Estilo oscuro y elegante', primary: '#7c3aed', accent: '#f59e0b', bg: '#0f0a1a' },
        { id: 'tema-medico-azul', name: 'Médico Azul', desc: 'Ambiente clínico azul', primary: '#1d4ed8', accent: '#38bdf8', bg: '#0c1a2e' },
        { id: 'tema-medico-verde', name: 'Médico Verde', desc: 'Ambiente clínico verde', primary: '#059669', accent: '#34d399', bg: '#071a0e' },
        { id: 'tema-suave', name: 'Suave', desc: 'Tonos suaves y calmados', primary: '#6366f1', accent: '#a78bfa', bg: '#1e1b2e' },
    ];

    // Aplicar tema al documento
    function aplicarTema(temaId) {
        SISDEL_THEMES.forEach(t => document.body.classList.remove(t.id));
        if (temaId) document.body.classList.add(temaId);
        localStorage.setItem('sisdel_tema', temaId || 'tema-oscuro');
    }

    // Aplicar tema guardado al cargar
    (function() {
        const temaGuardado = localStorage.getItem('sisdel_tema') || 'tema-oscuro';
        aplicarTema(temaGuardado);
    })();

    // Cargar apariencia desde Firestore al inicio
    (async function cargarAparienciaFirestore() {
        try {
            const id_centro = localStorage.getItem('id_centro') || 'global';
            const resp = await fetch(`/api/settings/appearance?id_centro=${id_centro}`);
            const result = await resp.json();
            if (result.success && result.appearance.tema) {
                aplicarTema(result.appearance.tema);
            }
        } catch(e) { /* sin conexión, usar localStorage */ }
    })();

    // ---- RENDER TABS MÓDULO PROGRAMADOR (con Configuración) ----
    const _originalRenderProgrammer = renderProgrammer;
    renderProgrammer = async function() {
        // Llamar al original para cargar datos de centros
        await _originalRenderProgrammer();
        // Agregar tabs encima del contenido existente
        injectConfigTabs('programmer');
    };

    function injectConfigTabs(role) {
        const existing = contentArea.innerHTML;
        const tabsHtml = `
        <div class="config-tabs" id="config-tabs-bar" style="margin-bottom:24px;">
            <button class="config-tab-btn active" onclick="window.switchConfigTab('centros', this)">${role === 'admin_general' ? '👨‍⚕️ Médicos' : '🏥 Centros'}</button>
            ${role === 'programmer' ? `<button class="config-tab-btn" onclick="window.switchConfigTab('medicos', this)">👨‍⚕️ Médicos</button>` : ''}
            <button class="config-tab-btn" onclick="window.switchConfigTab('privilegios', this)">🔐 Privilegios</button>
            <button class="config-tab-btn" onclick="window.switchConfigTab('apariencia', this)">🎨 Apariencia</button>
        </div>
        <div id="config-tab-content">
            ${existing}
        </div>`;
        contentArea.innerHTML = tabsHtml;
    }

    window.switchConfigTab = async function(tab, btn) {
        document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const tabContent = document.getElementById('config-tab-content');
        if (!tabContent) return;
        tabContent.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>`;

        if (tab === 'centros') {
            // Recargar el módulo completo del rol actual
            if (qslCode === 'MED-MASTER') await _originalRenderProgrammer();
            else await _originalRenderAdminGeneral();
            const existing = contentArea.innerHTML;
            // Volver a inyectar tabs
            injectConfigTabs(qslCode === 'MED-MASTER' ? 'programmer' : 'admin_general');
            // Marcar el tab activo correcto
            document.querySelectorAll('.config-tab-btn').forEach(b => {
                if (b.textContent.includes('Centros') || b.textContent.includes('Médicos')) b.classList.add('active');
            });
        } else if (tab === 'medicos') {
            tabContent.innerHTML = await buildMedicosTab();
        } else if (tab === 'privilegios') {
            tabContent.innerHTML = await buildPrivilegiosTab();
        } else if (tab === 'apariencia') {
            tabContent.innerHTML = buildAparienciaTab();
            setupAparienciaListeners();
        }
    };

    // ---- TAB: MÉDICOS (crear / gestionar) ----
    // Genera un código de acceso de 6 caracteres alfanuméricos.
    // Excluye caracteres ambiguos (0/O, 1/I/L) para evitar confusiones al dictarlo.
    function generarCodigoAcceso() {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Genera un código único (que no esté ya en uso por otro usuario)
    async function generarCodigoUnico(medicosExistentes) {
        const usados = new Set((medicosExistentes || []).map(m => (m.usuario || '').toUpperCase()));
        let code;
        let intentos = 0;
        do {
            code = generarCodigoAcceso();
            intentos++;
        } while (usados.has(code) && intentos < 20);
        return code;
    }

    async function buildMedicosTab() {
        let medicos = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos = result.medicos || [];
        } catch(e) {
            medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        }

        const medicosHtml = medicos.length > 0 ? medicos.map(m => {
            const codigo = m.usuario || '——————';
            const telefono = m.telefono || '—';
            const docId = m.id_identificacion || m.dpi || '—';
            return `
            <div style="background:linear-gradient(135deg,rgba(96,165,250,0.08),rgba(96,165,250,0.02)); border:1px solid rgba(96,165,250,0.2); border-radius:16px; padding:18px; position:relative; display:flex; align-items:center; gap:16px;">
                <div style="width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg,#1d4ed8,#60a5fa); display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:white; flex-shrink:0;">${(m.nombre_completo||'?').charAt(0).toUpperCase()}</div>
                <div style="flex:1; min-width:0;">
                    <h4 style="color:white; font-size:16px; font-weight:700; margin-bottom:4px;">${m.nombre_completo || m.id_medico}</h4>
                    <p style="color:rgba(255,255,255,0.55); font-size:12px; margin:0 0 6px;">📞 ${telefono} &nbsp;·&nbsp; 🪪 ID: ${docId}</p>
                    <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(34,211,238,0.08); border:1px solid rgba(34,211,238,0.3); padding:4px 10px; border-radius:8px;">
                        <span style="font-size:10px; color:#67e8f9; text-transform:uppercase; letter-spacing:0.5px;">Código</span>
                        <span style="font-family:'Courier New',monospace; font-size:14px; font-weight:800; color:#22d3ee; letter-spacing:2px;">${codigo}</span>
                        <button onclick="navigator.clipboard.writeText('${codigo}'); this.textContent='✓'; setTimeout(()=>this.textContent='📋',1500);" style="background:transparent; border:none; color:#22d3ee; cursor:pointer; font-size:13px; padding:0 2px;" title="Copiar código">📋</button>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="window.deleteMedicoConfig('${m.id_medico}')" style="background:rgba(239,68,68,0.1); color:#f87171; border:1px solid rgba(239,68,68,0.2); padding:8px 14px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600;" title="Eliminar usuario">🗑</button>
                </div>
            </div>`;
        }).join('') : `<div style="text-align:center; padding:60px; border:2px dashed rgba(255,255,255,0.06); border-radius:20px;"><div style="font-size:48px; margin-bottom:12px;">👨‍⚕️</div><p style="color:var(--text-muted);">No hay usuarios registrados.</p></div>`;

        const codigoInicial = await generarCodigoUnico(medicos);
        // Guarda el código generado para que crearNuevoMedico lo use
        window._codigoGenerado = codigoInicial;

        return `
        <div style="display:grid; grid-template-columns:1fr 380px; gap:24px; align-items:start;">
            <div>
                <h3 style="color:#60a5fa; font-size:18px; font-weight:700; margin-bottom:20px;">👨‍⚕️ Usuarios Registrados (${medicos.length})</h3>
                <div style="display:grid; gap:14px;">${medicosHtml}</div>
            </div>
            <div class="widget-card" style="border:1px solid rgba(96,165,250,0.2); background:rgba(0,0,0,0.3); position:sticky; top:0;" id="medico-form-card">
                <h3 class="widget-title" style="color:#60a5fa; font-size:16px; margin-bottom:20px;">➕ Nuevo Usuario</h3>
                <div style="display:grid; gap:14px;">
                    <div class="input-group">
                        <label>Nombre Completo *</label>
                        <input type="text" id="nm-nombre" placeholder="Dr. Juan Pérez" autocomplete="off">
                    </div>
                    <div class="input-group">
                        <label>Número de Identificación *</label>
                        <input type="text" id="nm-dpi" placeholder="DPI / Pasaporte" autocomplete="off">
                    </div>
                    <div class="input-group">
                        <label>Número de Teléfono *</label>
                        <input type="text" id="nm-telefono" placeholder="Ej: +502 5555-1234" autocomplete="off">
                    </div>

                    <!-- Código de acceso generado automáticamente -->
                    <div style="background:linear-gradient(135deg,rgba(34,211,238,0.08),rgba(34,211,238,0.02)); border:1px solid rgba(34,211,238,0.3); border-radius:12px; padding:14px 16px; margin-top:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-size:11px; color:#67e8f9; text-transform:uppercase; letter-spacing:1px; font-weight:700;">🔑 Código de Acceso (auto-generado)</span>
                            <button type="button" onclick="window.regenerarCodigo()" style="background:rgba(34,211,238,0.1); border:1px solid rgba(34,211,238,0.3); color:#22d3ee; padding:3px 10px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600;" title="Generar otro código">🔄 Regenerar</button>
                        </div>
                        <div id="nm-codigo-display" style="font-family:'Courier New',monospace; font-size:28px; font-weight:800; color:#22d3ee; letter-spacing:6px; text-align:center; padding:8px 0;">${codigoInicial}</div>
                        <p style="font-size:11px; color:rgba(255,255,255,0.45); margin:0; text-align:center;">El usuario inicia sesión escribiendo este código</p>
                    </div>

                    <button onclick="window.crearNuevoMedico()" style="width:100%; padding:14px; background:linear-gradient(135deg,#1d4ed8,#60a5fa); color:white; font-weight:800; border-radius:12px; border:none; cursor:pointer; font-size:15px; margin-top:6px;">CREAR USUARIO</button>
                </div>
            </div>
        </div>`;
    }

    window.regenerarCodigo = async function() {
        let medicos = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos = result.medicos || [];
        } catch(e) {
            medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        }
        const nuevo = await generarCodigoUnico(medicos);
        window._codigoGenerado = nuevo;
        const display = document.getElementById('nm-codigo-display');
        if (display) display.textContent = nuevo;
    };

    window.crearNuevoMedico = async function() {
        const nombre = document.getElementById('nm-nombre')?.value.trim();
        const dpi = document.getElementById('nm-dpi')?.value.trim();
        const telefono = document.getElementById('nm-telefono')?.value.trim();
        const codigo = window._codigoGenerado;

        if (!nombre || !dpi || !telefono) {
            window.showElegantAlert('⚠️ Campos requeridos', 'Nombre, número de identificación y teléfono son obligatorios.', '⚠️');
            return;
        }
        if (!codigo || codigo.length !== 6) {
            window.showElegantAlert('⚠️ Código inválido', 'No se pudo generar el código de acceso. Intenta nuevamente.', '⚠️');
            return;
        }

        const id_medico = 'MED-' + Date.now();
        // El usuario inicia sesión escribiendo el código de 6 caracteres.
        // Lo guardamos como `usuario` (campo que la función login() ya consulta).
        const medData = {
            nombre_completo: nombre,
            id_identificacion: dpi,
            telefono: telefono,
            usuario: codigo,
            password_hash: btoa(codigo),
            created_at: new Date().toISOString()
        };

        try {
            await fetch(`/api/medico/${id_medico}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(medData) });
            // También guardar en localStorage como caché
            const local = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
            local.push({ id_medico, ...medData });
            localStorage.setItem('tabla_medicos', JSON.stringify(local));

            // Mostrar el código generado con opción de copiar — el admin debe entregarlo al usuario
            window.showElegantAlert(
                '✅ Usuario Creado',
                `Se registró exitosamente a <b>${nombre}</b>.<br><br>` +
                `<div style="background:rgba(34,211,238,0.1); border:1px solid rgba(34,211,238,0.3); border-radius:12px; padding:18px; margin:10px 0; text-align:center;">` +
                `<div style="font-size:11px; color:#67e8f9; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">🔑 Código de Acceso</div>` +
                `<div style="font-family:'Courier New',monospace; font-size:32px; font-weight:800; color:#22d3ee; letter-spacing:8px;">${codigo}</div>` +
                `</div>` +
                `<p style="font-size:13px; color:rgba(255,255,255,0.65);">Entregue este código al usuario. Lo necesitará para iniciar sesión.</p>`
            );
            window.switchConfigurationTab('usuarios', document.querySelector('#config-tabs-bar .config-tab-btn'));
        } catch(e) {
            window.showElegantAlert('❌ Error', 'No se pudo guardar el usuario. Revisa la conexión.');
        }
    };

    window.deleteMedicoConfig = async function(id) {
        if (!confirm('¿Eliminar este usuario del sistema?')) return;
        try {
            await fetch(`/api/medico/${id}`, { method: 'DELETE' });
            const local = JSON.parse(localStorage.getItem('tabla_medicos') || '[]').filter(m => m.id_medico !== id);
            localStorage.setItem('tabla_medicos', JSON.stringify(local));
            // Re-render del tab Usuarios (módulo Configuración usa switchConfigurationTab)
            const tabContent = document.getElementById('config-tab-content');
            if (tabContent) {
                tabContent.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
                tabContent.innerHTML = await buildMedicosTab();
            } else if (typeof window.switchConfigTab === 'function') {
                window.switchConfigTab('medicos', null);
            }
        } catch(e) { window.showElegantAlert('❌ Error', 'No se pudo eliminar.'); }
    };

    // ---- TAB: PRIVILEGIOS (visual estilo MULTISYS) ----
    async function buildPrivilegiosTab() {
        let medicos = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos = result.medicos || [];
        } catch(e) {
            medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        }

        if (medicos.length === 0) {
            return `<div style="text-align:center; padding:80px; border:2px dashed rgba(255,255,255,0.06); border-radius:20px;"><div style="font-size:48px; margin-bottom:16px;">🔐</div><p style="color:var(--text-muted); font-size:16px;">No hay médicos registrados. Crea un acceso primero.</p></div>`;
        }

        const firstMed = medicos[0];
        const userListHtml = medicos.map((m, i) => {
            const privCount = Object.values(m.privileges || {}).filter(Boolean).length;
            return `
            <div class="privilege-user-item ${i === 0 ? 'selected' : ''}" onclick="window.selectPrivilegeUser('${m.id_medico}', this)" id="puser-${m.id_medico}">
                <div class="privilege-user-avatar">${(m.nombre_completo||m.usuario||'?').charAt(0).toUpperCase()}</div>
                <div class="privilege-user-info">
                    <h4>${m.nombre_completo || m.usuario || m.id_medico}</h4>
                    <p>${m.especialidad || 'Médico'}</p>
                </div>
                <span class="privilege-badge">${privCount}</span>
            </div>`;
        }).join('');

        return `
        <div class="privilege-layout">
            <div>
                <div style="padding:14px 18px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,0.06);">
                    👥 ${medicos.length} USUARIOS
                </div>
                <div class="privilege-user-list">${userListHtml}</div>
            </div>
            <div>
                <div id="privilege-matrix-container">
                    ${buildPrivilegeMatrix(firstMed)}
                </div>
            </div>
        </div>`;
    }

    function buildPrivilegeMatrix(medico) {
        const privs = medico.privileges || {};
        const totalPrivs = Object.keys(SISDEL_PRIVILEGES).reduce((a, c) => a + SISDEL_PRIVILEGES[c].items.length, 0);
        const activePrivs = Object.values(privs).filter(Boolean).length;

        const categoriesHtml = Object.entries(SISDEL_PRIVILEGES).map(([catKey, cat]) => {
            const catActiveCount = cat.items.filter(item => privs[item.id]).length;
            const itemsHtml = cat.items.map(item => `
                <div class="privilege-item">
                    <div class="privilege-item-info">
                        <strong>
                            ${item.label}
                            ${item.sensitive ? '<span class="sensitive-tag">⚠️ Sensible</span>' : ''}
                        </strong>
                        <p>${item.desc}</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${privs[item.id] ? 'checked' : ''}
                            onchange="window.togglePrivilege('${medico.id_medico}', '${item.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `).join('');

            return `
            <div class="privilege-category-card">
                <div class="privilege-category-header" style="color:${cat.color}; background: rgba(0,0,0,0.15);">
                    ${cat.label}
                    <span style="margin-left:auto; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:8px; font-size:11px; color:rgba(255,255,255,0.5);">${catActiveCount}/${cat.items.length}</span>
                </div>
                ${itemsHtml}
            </div>`;
        }).join('');

        return `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
            <div>
                <h3 style="color:white; font-size:18px; font-weight:700;">${medico.nombre_completo || medico.usuario || medico.id_medico}</h3>
                <p style="color:var(--text-muted); font-size:13px;">${medico.id_medico} · ${medico.especialidad || 'Médico'} · <span style="color:#60a5fa;">${activePrivs}/${totalPrivs} privilegios activos</span></p>
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="window.marcarTodosPrivilegios('${medico.id_medico}', true)" style="background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.3); padding:8px 16px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600;">✅ Marcar todos</button>
                <button onclick="window.marcarTodosPrivilegios('${medico.id_medico}', false)" style="background:rgba(239,68,68,0.08); color:#f87171; border:1px solid rgba(239,68,68,0.2); padding:8px 16px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600;">🚫 Limpiar</button>
            </div>
        </div>
        <div class="privilege-matrix">${categoriesHtml}</div>`;
    }

    window.selectPrivilegeUser = async function(medicoId, el) {
        document.querySelectorAll('.privilege-user-item').forEach(i => i.classList.remove('selected'));
        if (el) el.classList.add('selected');

        const container = document.getElementById('privilege-matrix-container');
        if (!container) return;
        container.innerHTML = `<div class="loading-state" style="height:200px;"><div class="spinner"></div></div>`;

        try {
            const resp = await fetch(`/api/medico/${medicoId}`);
            // medico data is stored as data field in Firestore
            const resp2 = await fetch('/api/medicos');
            const result = await resp2.json();
            const medico = (result.medicos || []).find(m => m.id_medico === medicoId);
            if (medico) container.innerHTML = buildPrivilegeMatrix(medico);
        } catch(e) {
            const local = JSON.parse(localStorage.getItem('tabla_medicos') || '[]').find(m => m.id_medico === medicoId);
            if (local) container.innerHTML = buildPrivilegeMatrix(local);
        }
    };

    window.togglePrivilege = async function(medicoId, privilegeId, value) {
        // Obtener privilegios actuales del médico
        let privs = {};
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            const med = (result.medicos || []).find(m => m.id_medico === medicoId);
            privs = med?.privileges || {};
        } catch(e) {
            const local = JSON.parse(localStorage.getItem('tabla_medicos') || '[]').find(m => m.id_medico === medicoId);
            privs = local?.privileges || {};
        }
        privs[privilegeId] = value;

        try {
            await fetch(`/api/medico/${medicoId}/privileges`, {
                method: 'PATCH', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ privileges: privs })
            });
            // Actualizar localStorage
            const local = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
            const idx = local.findIndex(m => m.id_medico === medicoId);
            if (idx >= 0) { local[idx].privileges = privs; localStorage.setItem('tabla_medicos', JSON.stringify(local)); }
            // Actualizar badge del usuario
            const badge = document.querySelector(`#puser-${medicoId} .privilege-badge`);
            if (badge) badge.textContent = Object.values(privs).filter(Boolean).length;
        } catch(e) { console.error('Error guardando privilegio:', e); }
    };

    window.marcarTodosPrivilegios = async function(medicoId, valor) {
        const allPrivs = {};
        Object.values(SISDEL_PRIVILEGES).forEach(cat => cat.items.forEach(item => { allPrivs[item.id] = valor; }));
        try {
            await fetch(`/api/medico/${medicoId}/privileges`, {
                method: 'PATCH', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ privileges: allPrivs })
            });
            const local = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
            const idx = local.findIndex(m => m.id_medico === medicoId);
            if (idx >= 0) { local[idx].privileges = allPrivs; localStorage.setItem('tabla_medicos', JSON.stringify(local)); }
            // Refrescar la vista
            const selected = document.querySelector('.privilege-user-item.selected');
            window.selectPrivilegeUser(medicoId, selected);
        } catch(e) { window.showElegantAlert('❌ Error', 'No se pudieron actualizar los privilegios.'); }
    };

    // ---- TAB: APARIENCIA ----
    function buildAparienciaTab() {
        const temaActual = localStorage.getItem('sisdel_tema') || 'tema-oscuro';
        const swatchesHtml = SISDEL_THEMES.map(t => `
            <div class="theme-swatch ${temaActual === t.id ? 'active' : ''}"
                 style="background: linear-gradient(135deg, ${t.bg} 0%, ${t.primary}22 100%); border-color: ${temaActual === t.id ? t.accent : 'transparent'};"
                 onclick="window.seleccionarTema('${t.id}')">
                <div class="theme-active-check" style="color:${t.primary};">✓</div>
                <div class="swatch-preview">
                    <div class="swatch-circle" style="background:${t.bg}; border:2px solid rgba(255,255,255,0.2);"></div>
                    <div class="swatch-circle" style="background:${t.primary};"></div>
                    <div class="swatch-circle" style="background:${t.accent};"></div>
                </div>
                <h4>${t.name}</h4>
                <p>${t.desc}</p>
            </div>
        `).join('');

        return `
        <div style="max-width:860px;">
            <h3 style="color:white; font-size:20px; font-weight:700; margin-bottom:8px;">🎨 Apariencia del Sistema</h3>
            <p style="color:var(--text-muted); font-size:14px; margin-bottom:28px;">Elige el tema visual para toda la interfaz. El cambio se aplica de inmediato y se guarda en la nube.</p>

            <h4 style="color:var(--text-muted); font-size:12px; text-transform:uppercase; letter-spacing:1px; margin-bottom:16px;">Temas disponibles</h4>
            <div class="theme-grid" id="theme-grid">${swatchesHtml}</div>

            <div style="margin-top:36px; padding:24px; background:rgba(0,0,0,0.2); border-radius:16px; border:1px solid rgba(255,255,255,0.06);">
                <h4 style="color:white; font-size:15px; font-weight:700; margin-bottom:6px;">📌 Tema activo</h4>
                <p id="tema-activo-nombre" style="color:var(--accent); font-size:18px; font-weight:800;">${SISDEL_THEMES.find(t => t.id === temaActual)?.name || 'Oscuro'}</p>
                <p style="color:var(--text-muted); font-size:12px; margin-top:4px;">Este tema se aplica a todos los usuarios del sistema en este dispositivo.</p>
            </div>
        </div>`;
    }

    function setupAparienciaListeners() { /* listeners ya están en el HTML con onclick */ }

    window.seleccionarTema = async function(temaId) {
        aplicarTema(temaId);
        // Actualizar UI de swatches
        document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
        const tema = SISDEL_THEMES.find(t => t.id === temaId);
        if (tema) {
            document.querySelectorAll('.theme-swatch').forEach(s => {
                if (s.getAttribute('onclick')?.includes(temaId)) {
                    s.classList.add('active');
                    s.style.borderColor = tema.accent;
                }
            });
            const nombreEl = document.getElementById('tema-activo-nombre');
            if (nombreEl) { nombreEl.textContent = tema.name; nombreEl.style.color = tema.accent; }
        }
        // Guardar en Firestore
        try {
            const id_centro = localStorage.getItem('id_centro') || 'global';
            await fetch('/api/settings/appearance', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ id_centro, appearance: { tema: temaId } })
            });
        } catch(e) { /* guardar solo localmente si no hay conexión */ }
    };

    // ---- Guardar referencia al original de renderAdminGeneral ----
    const _originalRenderAdminGeneral = renderAdminGeneral;

    // Sobreescribir renderAdminGeneral para inyectar tabs
    renderAdminGeneral = async function() {
        await _originalRenderAdminGeneral();
        injectConfigTabs('admin_general');
    };

    // Actualizar título de sección en configuración
    const _origGetSectionTitle = getSectionTitle;
    getSectionTitle = function(name) {
        if (name === 'programmer') return 'Módulo Programador (Super Admin)';
        if (name === 'admin_general') return 'Administración Central';
        if (name === 'configuration') return 'Configuración del Sistema';
        return _origGetSectionTitle(name);
    };

    // ============================================================
    // ===  MÓDULO CONFIGURACIÓN  (acceso para todos los médicos) ===
    // ============================================================
    // Defaults para recordatorios — se mezclan con lo guardado en cloud/local
    const SISDEL_REMINDER_DEFAULTS = {
        enabled: true,
        leadHours: [12, 2, 1],        // tiempos de aviso antes de la cita (horas)
        channel: 'sisdel',            // 'sisdel' | 'whatsapp' | 'ambos'
        followUpUnattended: true,     // notificar al doctor si la cita pasó sin atender
        sound: true,                  // sonido al recibir alerta en el navegador
        weekend: true,                // permitir envío sábado/domingo
        templateBefore: 'Recordatorio de su cita con DR-SISDEL para el {fecha} a las {hora}. Motivo: {motivo}',
        templateMissed: 'No se ha registrado su asistencia a la cita del {fecha}. Por favor reagende cuanto antes.'
    };

    function _getReminderConfig() {
        try {
            const raw = localStorage.getItem('sisdel_reminder_config');
            const stored = raw ? JSON.parse(raw) : {};
            return Object.assign({}, SISDEL_REMINDER_DEFAULTS, stored);
        } catch (e) { return Object.assign({}, SISDEL_REMINDER_DEFAULTS); }
    }

    async function _saveReminderConfig(cfg) {
        localStorage.setItem('sisdel_reminder_config', JSON.stringify(cfg));
        // Persistir también en cloud bajo settings/appearance (mismo doc, key 'reminders')
        try {
            const id_centro = localStorage.getItem('id_centro') || 'global';
            // Fetch existing appearance to no sobrescribir tema
            let appearance = {};
            try {
                const r = await fetch(`/api/settings/appearance?id_centro=${encodeURIComponent(id_centro)}`);
                const j = await r.json();
                if (j.success) appearance = j.appearance || {};
            } catch (e) {}
            appearance.reminders = cfg;
            await fetch('/api/settings/appearance', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ id_centro, appearance })
            });
        } catch (e) { console.warn('Cloud save reminders:', e); }
    }

    async function renderConfiguration() {
        contentArea.innerHTML = `
            <div class="config-tabs" id="config-tabs-bar" style="margin-bottom:24px;">
                <button class="config-tab-btn active" onclick="window.switchConfigurationTab('usuarios', this)">👨‍⚕️ Usuarios del Sistema</button>
                <button class="config-tab-btn" onclick="window.switchConfigurationTab('privilegios', this)">🔐 Privilegios</button>
                <button class="config-tab-btn" onclick="window.switchConfigurationTab('recordatorios', this)">🔔 Recordatorios</button>
                <button class="config-tab-btn" onclick="window.switchConfigurationTab('apariencia', this)">🎨 Apariencia</button>
            </div>
            <div id="config-tab-content">
                <div class="loading-state"><div class="spinner"></div><p>Cargando usuarios...</p></div>
            </div>
        `;
        // Cargar el primer tab (Usuarios)
        const tabContent = document.getElementById('config-tab-content');
        try {
            tabContent.innerHTML = await buildMedicosTab();
        } catch (e) {
            tabContent.innerHTML = '<p style="color:#f87171;padding:30px;">Error al cargar usuarios.</p>';
        }
    }

    window.switchConfigurationTab = async function(tab, btn) {
        document.querySelectorAll('#config-tabs-bar .config-tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const tabContent = document.getElementById('config-tab-content');
        if (!tabContent) return;
        tabContent.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;

        if (tab === 'usuarios') {
            tabContent.innerHTML = await buildMedicosTab();
        } else if (tab === 'privilegios') {
            tabContent.innerHTML = await buildPrivilegiosTab();
        } else if (tab === 'apariencia') {
            tabContent.innerHTML = buildAparienciaTab();
            if (typeof setupAparienciaListeners === 'function') setupAparienciaListeners();
        } else if (tab === 'recordatorios') {
            tabContent.innerHTML = buildRecordatoriosTab();
            setupRecordatoriosListeners();
        }
    };

    // ---- TAB: RECORDATORIOS DE CITAS ----
    function buildRecordatoriosTab() {
        const cfg = _getReminderConfig();
        const checked = (b) => b ? 'checked' : '';
        const leadOptions = [
            { h: 12, label: '12 horas antes' },
            { h: 8,  label: '8 horas antes' },
            { h: 6,  label: '6 horas antes' },
            { h: 3,  label: '3 horas antes' },
            { h: 2,  label: '2 horas antes' },
            { h: 1,  label: '1 hora antes' }
        ];
        const leadHtml = leadOptions.map(o => `
            <label class="reminder-chip" style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;cursor:pointer;font-size:13px;color:white;">
                <input type="checkbox" data-lead="${o.h}" ${cfg.leadHours.includes(o.h) ? 'checked' : ''} style="width:18px;height:18px;accent-color:#a78bfa;">
                <span>${o.label}</span>
            </label>
        `).join('');

        return `
        <div style="display:grid;grid-template-columns:1fr;gap:18px;">

            <!-- Habilitar / Deshabilitar -->
            <div style="background:linear-gradient(135deg,rgba(167,139,250,0.08),rgba(167,139,250,0.02));border:1px solid rgba(167,139,250,0.25);border-radius:16px;padding:22px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h3 style="color:white;font-size:17px;font-weight:700;margin:0 0 4px;">🔔 Recordatorios automáticos</h3>
                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">Enviar recordatorio al paciente antes de su cita</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="rem-enabled" ${checked(cfg.enabled)}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>

            <!-- Tiempos de aviso -->
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:22px;">
                <h3 style="color:white;font-size:15px;font-weight:700;margin:0 0 6px;">⏰ Tiempos de aviso antes de la cita</h3>
                <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 16px;">Selecciona uno o varios. Se enviará un mensaje en cada uno de los tiempos marcados.</p>
                <div id="rem-lead-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:10px;">
                    ${leadHtml}
                </div>
            </div>

            <!-- Canal de envío -->
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:22px;">
                <h3 style="color:white;font-size:15px;font-weight:700;margin:0 0 14px;">📨 Canal de envío</h3>
                <div style="display:flex;flex-wrap:wrap;gap:14px;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;color:white;font-size:14px;">
                        <input type="radio" name="rem-channel" value="sisdel" ${cfg.channel === 'sisdel' ? 'checked' : ''} style="width:18px;height:18px;accent-color:#a78bfa;">
                        Notificación SISDEL (in-app)
                    </label>
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;color:white;font-size:14px;">
                        <input type="radio" name="rem-channel" value="whatsapp" ${cfg.channel === 'whatsapp' ? 'checked' : ''} style="width:18px;height:18px;accent-color:#a78bfa;">
                        WhatsApp
                    </label>
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;color:white;font-size:14px;">
                        <input type="radio" name="rem-channel" value="ambos" ${cfg.channel === 'ambos' ? 'checked' : ''} style="width:18px;height:18px;accent-color:#a78bfa;">
                        Ambos
                    </label>
                </div>
            </div>

            <!-- Opciones extra -->
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                <div style="display:flex;align-items:center;gap:14px;justify-content:space-between;">
                    <div>
                        <h4 style="color:white;font-size:14px;margin:0 0 3px;">Notificar cita no atendida</h4>
                        <p style="color:rgba(255,255,255,0.45);font-size:12px;margin:0;">Avisar al médico cuando una cita pase sin atender</p>
                    </div>
                    <label class="toggle-switch"><input type="checkbox" id="rem-followup" ${checked(cfg.followUpUnattended)}><span class="toggle-slider"></span></label>
                </div>
                <div style="display:flex;align-items:center;gap:14px;justify-content:space-between;">
                    <div>
                        <h4 style="color:white;font-size:14px;margin:0 0 3px;">Sonido al recibir alerta</h4>
                        <p style="color:rgba(255,255,255,0.45);font-size:12px;margin:0;">Reproducir un beep cuando entra una notificación</p>
                    </div>
                    <label class="toggle-switch"><input type="checkbox" id="rem-sound" ${checked(cfg.sound)}><span class="toggle-slider"></span></label>
                </div>
                <div style="display:flex;align-items:center;gap:14px;justify-content:space-between;grid-column:1/-1;">
                    <div>
                        <h4 style="color:white;font-size:14px;margin:0 0 3px;">Permitir envíos en fin de semana</h4>
                        <p style="color:rgba(255,255,255,0.45);font-size:12px;margin:0;">Si se desactiva, no enviará recordatorios sábados ni domingos</p>
                    </div>
                    <label class="toggle-switch"><input type="checkbox" id="rem-weekend" ${checked(cfg.weekend)}><span class="toggle-slider"></span></label>
                </div>
            </div>

            <!-- Plantillas -->
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:22px;">
                <h3 style="color:white;font-size:15px;font-weight:700;margin:0 0 6px;">📝 Plantillas de mensaje</h3>
                <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 14px;">Usa <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;color:#a78bfa;">{fecha}</code>, <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;color:#a78bfa;">{hora}</code>, <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;color:#a78bfa;">{motivo}</code>, <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;color:#a78bfa;">{paciente}</code> para personalizar.</p>
                <label style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Recordatorio antes de cita</label>
                <textarea id="rem-template-before" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);color:white;border-radius:10px;padding:12px;font-size:13px;font-family:inherit;resize:vertical;min-height:70px;box-sizing:border-box;margin-bottom:14px;">${cfg.templateBefore}</textarea>
                <label style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Aviso de cita no atendida</label>
                <textarea id="rem-template-missed" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);color:white;border-radius:10px;padding:12px;font-size:13px;font-family:inherit;resize:vertical;min-height:70px;box-sizing:border-box;">${cfg.templateMissed}</textarea>
            </div>

            <!-- Botón guardar -->
            <div style="display:flex;justify-content:flex-end;gap:12px;">
                <button onclick="window.resetReminderConfig()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:white;padding:10px 22px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">↺ Restaurar valores por defecto</button>
                <button onclick="window.saveReminderConfig()" style="background:linear-gradient(135deg,#a78bfa,#7c3aed);color:white;border:none;padding:10px 28px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:800;letter-spacing:0.3px;box-shadow:0 8px 20px rgba(124,58,237,0.4);">💾 GUARDAR</button>
            </div>
        </div>`;
    }

    function setupRecordatoriosListeners() {
        // Listeners no son estrictamente necesarios — el guardar lee todo al pulsar GUARDAR
    }

    window.saveReminderConfig = async function() {
        try {
            const leadHours = Array.from(document.querySelectorAll('#rem-lead-grid input[type=checkbox]:checked'))
                .map(el => parseFloat(el.getAttribute('data-lead')));
            const channelEl = document.querySelector('input[name=rem-channel]:checked');
            const cfg = {
                enabled: !!document.getElementById('rem-enabled')?.checked,
                leadHours: leadHours.length ? leadHours : [12, 2, 1],
                channel: channelEl ? channelEl.value : 'sisdel',
                followUpUnattended: !!document.getElementById('rem-followup')?.checked,
                sound: !!document.getElementById('rem-sound')?.checked,
                weekend: !!document.getElementById('rem-weekend')?.checked,
                templateBefore: document.getElementById('rem-template-before')?.value || SISDEL_REMINDER_DEFAULTS.templateBefore,
                templateMissed: document.getElementById('rem-template-missed')?.value || SISDEL_REMINDER_DEFAULTS.templateMissed
            };
            await _saveReminderConfig(cfg);
            // Sincronizar también notification_preference para compatibilidad
            if (cfg.channel === 'whatsapp' || cfg.channel === 'sisdel') {
                localStorage.setItem('notification_preference', cfg.channel);
            }
            if (typeof window.showElegantAlert === 'function') {
                window.showElegantAlert('Configuración Guardada', 'Las preferencias de recordatorios se han guardado y sincronizado con la nube.');
            }
        } catch (e) {
            console.error(e);
            alert('Error al guardar la configuración.');
        }
    };

    window.resetReminderConfig = async function() {
        if (!confirm('¿Restaurar todas las configuraciones de recordatorios a sus valores predeterminados?')) return;
        await _saveReminderConfig(Object.assign({}, SISDEL_REMINDER_DEFAULTS));
        const tabContent = document.getElementById('config-tab-content');
        if (tabContent) {
            tabContent.innerHTML = buildRecordatoriosTab();
            setupRecordatoriosListeners();
        }
    };

    // Aplicar configuración al cargar (sincroniza desde cloud si está disponible)
    (async function _bootstrapReminders() {
        try {
            const id_centro = localStorage.getItem('id_centro') || 'global';
            const r = await fetch(`/api/settings/appearance?id_centro=${encodeURIComponent(id_centro)}`);
            const j = await r.json();
            if (j.success && j.appearance && j.appearance.reminders) {
                localStorage.setItem('sisdel_reminder_config', JSON.stringify(j.appearance.reminders));
            }
        } catch (e) {}
    })();

});