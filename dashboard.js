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
        const targetNav = Array.from(navItems).find(n => n.getAttribute('data-section') === 'reminders');
        if (targetNav) targetNav.classList.add('active');
        loadSection('reminders');

        // Iniciar detector de alertas automático
        setInterval(checkAndShowAlerts, 10000);
        setTimeout(checkAndShowAlerts, 2000);
    } else {
        if (qslCode === 'MED-MASTER') {
            // Caso Programador: Solo ve el módulo de administración
            const progNav = document.getElementById('nav-programmer');
            if (progNav) progNav.style.display = 'block';
            
            // Ocultar secciones clínicas para el programador
            navItems.forEach(n => {
                const section = n.getAttribute('data-section');
                if (section === 'overview' || section === 'reminders' || section === 'consultation') {
                    n.style.display = 'none';
                }
            });
            
            navItems.forEach(n => n.classList.remove('active'));
            if (progNav) progNav.classList.add('active');
            loadSection('programmer');
        } else {
            // Caso Médico regular: Ve secciones clínicas, no el módulo programador
            loadSection('overview');
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
            if (userRole === 'medico' && section === 'overview') {
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

    async function getPatientData(qsl) {
        try {
            const resp = await fetch(`/api/patient/${qsl}`);
            const result = await resp.json();
            if (result.success) {
                localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(result.data));
                localStorage.setItem(`active_qsl_${qsl}`, result.alerts_enabled ? 'true' : 'false');
                return result.data;
            }
        } catch (e) { console.error('Fetch error:', e); }
        const data = localStorage.getItem(`patient_data_${qsl}`);
        return data ? JSON.parse(data) : { illness: '', meds: [] };
    }

    async function savePatientData(qsl, data) {
        localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(data));
        try {
            await fetch(`/api/patient/${qsl}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data })
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
    async function loadSection(sectionName) {
        if (qslCode === 'MED-MASTER' && (sectionName === 'overview' || sectionName === 'reminders' || sectionName === 'consultation')) {
            sectionName = 'programmer';
        }
        
        sectionTitle.textContent = getSectionTitle(sectionName);
        contentArea.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
        
        let data = null;
        if (selectedPatientQSL && (sectionName === 'overview' || sectionName === 'reminders' || sectionName === 'consultation')) {
            data = await getPatientData(selectedPatientQSL);
        }
        
        setTimeout(() => renderSection(sectionName, data), 300);
    }

    function renderSection(name, data) {
        if (userRole === 'medico' && !selectedPatientQSL && name !== 'settings' && name !== 'programmer') {
            renderDoctorHome();
            return;
        }

        const patientData = data || (selectedPatientQSL ? getPatientDataFallback(selectedPatientQSL) : null);

        switch (name) {
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
            case 'programmer':
                renderProgrammer();
                break;
            default:
                renderOverview(patientData);
        }
    }

    function getPatientDataFallback(qsl) {
        const data = localStorage.getItem(`patient_data_${qsl}`);
        return data ? JSON.parse(data) : { illness: '', meds: [] };
    }

    // --- VISTAS DEL MÉDICO ---

    function renderDoctorHome() {
        const key = getDocPatientsKey();
        const patients = JSON.parse(localStorage.getItem(key) || '[]');

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 1000px; margin: 0 auto; padding: 40px; border: 3px solid rgba(34, 211, 238, 0.45); border-radius: 24px;">
                <h3 class="widget-title" style="color: var(--accent); border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 20px; font-size: 28px; display: flex; align-items: center;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 15px;">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    Nuevo Expediente Clínico (Ficha Médica)
                </h3>
                
                <div id="patient-form" style="margin: 30px 0; background: rgba(0,0,0,0.2); border-radius: 15px; border: 1px solid rgba(255,255,255,0.05); padding: 30px;">
                    <!-- Sección 1: Datos Personales -->
                    <h4 style="color: #22d3ee; margin-bottom: 20px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px;">1. Datos de Filiación</h4>
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 20px; margin-bottom: 25px;">
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
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Género</label>
                            <select id="p-genero" style="width: 100%; background: rgba(0,0,0,0.3); color: white; border: 1px solid var(--card-border); padding: 12px; border-radius: 12px;">
                                <option value="Masculino">Masculino</option>
                                <option value="Femenino">Femenino</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>ID (DPI, Pasaporte, etc.)</label>
                            <input type="text" id="p-id" placeholder="No. Identificación">
                        </div>
                        <div class="input-group">
                            <label>Estado Civil</label>
                            <input type="text" id="p-civil" placeholder="Soltero, Casado, etc.">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Ocupación</label>
                            <input type="text" id="p-ocupacion" placeholder="Profesión u oficio">
                        </div>
                        <div class="input-group">
                            <label>Dirección de Domicilio</label>
                            <input type="text" id="p-direccion" placeholder="Dirección completa">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Teléfono de Contacto *</label>
                            <input type="text" id="p-telefono" placeholder="Ej: +502 ...">
                        </div>
                        <div class="input-group">
                            <label>Correo Electrónico</label>
                            <input type="email" id="p-email" placeholder="paciente@ejemplo.com">
                        </div>
                    </div>

                    <!-- Sección 2: Emergencia y Seguro -->
                    <h4 style="color: #22d3ee; margin-bottom: 20px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px; margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">2. Contacto y Cobertura</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Contacto Emergencia (Nombre)</label>
                            <input type="text" id="p-emerg-nombre" placeholder="Nombre completo">
                        </div>
                        <div class="input-group">
                            <label>Relación</label>
                            <input type="text" id="p-emerg-rel" placeholder="Ej: Madre, Esposo">
                        </div>
                        <div class="input-group">
                            <label>Teléfono Emergencia</label>
                            <input type="text" id="p-emerg-tel" placeholder="Número contacto">
                        </div>
                    </div>
                    <div class="input-group" style="margin-bottom: 25px;">
                        <label>Seguro Médico / Cobertura</label>
                        <input type="text" id="p-seguro" placeholder="Aseguradora y No. Póliza">
                    </div>

                    <!-- Sección 3: Antecedentes Médicos -->
                    <h4 style="color: #22d3ee; margin-bottom: 20px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px; margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">3. Historia Clínica</h4>
                    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px; margin-bottom: 25px;">
                        <div class="input-group">
                            <label>Tipo de Sangre</label>
                            <input type="text" id="p-sangre" placeholder="Ej: O+">
                        </div>
                        <div class="input-group">
                            <label>Alergias (Med, Alimentos, etc.)</label>
                            <input type="text" id="p-alergias" placeholder="Detallar alergias">
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div class="input-group">
                            <label>Antecedentes Personales</label>
                            <textarea id="p-ant-pers" style="height: 80px; width: 100%;" placeholder="Enfermedades crónicas, etc."></textarea>
                        </div>
                        <div class="input-group">
                            <label>Antecedentes Quirúrgicos</label>
                            <textarea id="p-ant-quir" style="height: 80px; width: 100%;" placeholder="Operaciones previas"></textarea>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div class="input-group">
                            <label>Antecedentes Familiares</label>
                            <textarea id="p-ant-fam" style="height: 80px; width: 100%;" placeholder="Diabetes, corazón, etc."></textarea>
                        </div>
                        <div class="input-group">
                            <label>Medicamentos Actuales</label>
                            <textarea id="p-meds-act" style="height: 80px; width: 100%;" placeholder="Tratamientos en curso"></textarea>
                        </div>
                    </div>
                    <div class="input-group" style="margin-bottom: 25px;">
                        <label>Hábitos (Tabaco, Alcohol, Ejercicio, etc.)</label>
                        <input type="text" id="p-habitos" placeholder="Estilo de vida">
                    </div>

                    <!-- Sección 4: Motivo -->
                    <h4 style="color: #22d3ee; margin-bottom: 20px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px; margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">4. Motivo de Consulta</h4>
                    <div class="input-group" style="margin-bottom: 30px;">
                        <label>Motivo Principal / Diagnóstico Inicial *</label>
                        <input type="text" id="p-motivo" placeholder="Ej. Control de diabetes, Dolor agudo...">
                    </div>

                    <button id="btn-add-patient" class="btn-primary" style="width: 100%; padding: 22px; font-size: 18px; font-weight: 700;">
                        GUARDAR FICHA MÉDICA Y CREAR EXPEDIENTE
                    </button>
                </div>

                <h3 class="widget-title" style="font-size: 24px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-top: 50px;">
                    Expedientes Activos (<span id="patient-count">${patients.length}</span>)
                </h3>
                <div class="patient-list" style="margin-top: 20px;">
                    ${patients.length > 0 ? patients.map(qsl => {
            const name = localStorage.getItem(`patient_name_${qsl}`) || 'Paciente';
            const data = getPatientData(qsl);
            return `
                            <div class="med-item patient-row" style="cursor: pointer; padding: 20px;" onclick="window.selectPatient('${qsl}')">
                                <div class="med-info">
                                    <h4 style="color: white; font-size: 20px;">${name}</h4>
                                    <p style="color: var(--text-muted);">Código: <b style="color:var(--accent);">${qsl}</b> | ${data.illness || 'Sin diagnóstico'}</p>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <span class="status-badge">Ver Detalle</span>
                                    <button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error);" onclick="event.stopPropagation(); window.deletePatient('${qsl}')">Eliminar</button>
                                </div>
                            </div>
                        `;
        }).join('') : '<div style="text-align:center; padding: 40px; opacity: 0.5;">No hay expedientes todavía.</div>'}
                </div>
            </div>
        `;

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

            window.showElegantAlert('Expediente Creado', `Se ha registrado exitosamente a ${nombre}. Código de acceso: ${qsl}`);
            renderDoctorHome();
        };
    }

    window.filterPatients = () => {
        const query = document.getElementById('patient-search').value.toLowerCase();
        const rows = document.querySelectorAll('.patient-row');
        let visibleCount = 0;

        rows.forEach(row => {
            const searchData = row.getAttribute('data-search');
            if (searchData.includes(query)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const countSpan = document.getElementById('patient-count');
        if (countSpan) countSpan.textContent = visibleCount;
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



    window.deleteMed = (id) => {
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

    window.addQuickGlucose = () => {
        const input = document.getElementById('patient-glucose-quick');
        if (!input) return;
        let val = input.value.trim();
        if (!val) return;
        if (!val.toLowerCase().includes('mg/dl')) val += ' mg/dL';
        const data = getPatientData(selectedPatientQSL);
        if (!data.glucoseHistory) data.glucoseHistory = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        data.glucoseHistory.unshift({ value: val, date: dateStr });
        if (data.glucoseHistory.length > 5) data.glucoseHistory = data.glucoseHistory.slice(0, 5);
        savePatientData(selectedPatientQSL, data);
        window.showElegantAlert('¡Guardado!', `Nivel de glucosa ${val} registrado.`);
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
                const data = await getPatientData(qsl);
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

    function renderReminders(data) {
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
                    
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 24px; padding: 25px 20px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 25px;">
                            <div style="height: 1px; flex: 1; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1));"></div>
                            <h3 style="color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 8px; margin: 0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"></path></svg>
                                RECETARIO
                            </h3>
                            <div style="height: 1px; flex: 1; background: linear-gradient(-90deg, transparent, rgba(255,255,255,0.1));"></div>
                        </div>
                        
                        <div class="dashboard-grid" style="display: block;">
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
            medsToDisplay = medsToDisplay.slice(0, 2);
        }

        html += `
                    ${medsToDisplay.map(m => {

            const nextDose = calculateNextDose(m.startTime, m.frequency);
            const isDue = isDoseDue(m.id, m.startTime, m.frequency);
            const schedule = window.getDailySchedule ? window.getDailySchedule(m.startTime, m.frequency) : m.startTime;

            if (isPaciente) {
                return `
                    <div style="background: ${isDue ? 'rgba(34, 211, 238, 0.1)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${isDue ? 'rgba(34, 211, 238, 0.4)' : 'rgba(255,255,255,0.15)'}; border-radius: 20px; padding: 20px; margin-bottom: 15px; text-align: left; transition: all 0.3s ease; ${isDue ? 'box-shadow: 0 4px 25px rgba(34, 211, 238, 0.2); animation: pulse 2s infinite;' : 'box-shadow: 0 4px 15px rgba(0,0,0,0.1);'}" id="med-card-${m.id}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: ${isDue ? '15px' : '0'}; gap: 10px;">
                            <div style="flex: 1; min-width: 0;">
                                <h4 style="color: #fff; font-size: 20px; font-weight: 700; margin-bottom: 6px; letter-spacing: 0.5px; word-break: break-word; text-transform: uppercase;">${m.name}</h4>
                                <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin-bottom: 8px; font-weight: 500;">Dosis: <span style="font-weight: 400;">${m.dose}</span></p>
                                <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 10px; margin-top: 5px; border: 1px solid rgba(255,255,255,0.05);">
                                    <p style="color: var(--text-muted); font-size: 14px; display: flex; align-items: flex-start; gap: 6px; line-height: 1.5; margin: 0;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="opacity:0.9; flex-shrink: 0; margin-top: 3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                        <span style="flex: 1; word-wrap: break-word;">${schedule}</span>
                                    </p>
                                </div>
                            </div>
                            <div style="text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                                <span style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Siguiente</span>
                                <div style="background: ${isDue ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}; color: ${isDue ? '#000' : '#fff'}; padding: 8px 14px; border-radius: 12px; font-size: 16px; font-weight: 700; display: inline-block; white-space: nowrap; border: 1px solid ${isDue ? 'var(--accent)' : 'rgba(255,255,255,0.2)'};">
                                    ${nextDose}
                                </div>
                            </div>
                        </div>
                        ${isDue ? `
                            <div style="border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 15px; margin-top: 15px;">
                                <p style="color: var(--accent); font-size: 16px; text-align: center; margin-bottom: 12px; font-weight: 600;">🔔 ¡Hora de tomar su dosis!</p>
                                <button class="btn-primary" style="width: 100%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border:none; padding:16px; border-radius:14px; font-weight:700; font-size:16px; display:flex; justify-content:center; align-items:center; gap:8px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);" onclick="window.markTaken(${m.id})">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    CONFIRMAR TOMA
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
                        <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 1.5; max-width: 250px;">Ha completado sus tomas o no tiene recetas activas por ahora.</p>
                    </div>
                ` : ''}
                
                ${isPaciente ? `
                    </div> <!-- Cierra el cuadro interior -->
                </div> <!-- Cierra la tarjeta glass-card principal -->
                
                <div style="margin: 30px auto 0; width: 100%; max-width: 500px; padding: 0 10px; box-sizing: border-box;">
                    <button class="btn-primary" style="width: 100%; padding: 16px 24px; font-size: 14px; font-weight: 700; text-transform: uppercase; background: rgba(15, 23, 42, 0.4); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);" onclick="localStorage.removeItem('user_qsl_code'); window.location.href='index.html';" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'; this.style.color='var(--error)'; this.style.borderColor='rgba(239, 68, 68, 0.3)';" onmouseout="this.style.background='rgba(15, 23, 42, 0.4)'; this.style.color='var(--text-muted)'; this.style.borderColor='rgba(255,255,255,0.05)';">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Cerrar Sesión Segura
                    </button>
                </div>
                ` : ''}
                ${!isPaciente ? `</div>` : ''} <!-- Cierra la tarjeta glass-card si NO paciente (alerta activas layout) -->
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
            const [h, m] = startTime.split(':');
            let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
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
                    <input type="password" id="current-doc-pass" placeholder="Ingresar clave actual para autorizar..." ${!isDoc ? 'disabled' : ''}>
                </div>
                <div class="input-group" style="margin-bottom: 20px;">
                    <label>Nueva Clave de Acceso</label>
                    <input type="password" id="new-doc-pass" placeholder="Ingresar nueva clave..." ${!isDoc ? 'disabled' : ''}>
                </div>
                ${isDoc ? `
                    <button class="btn-primary" style="width: 100%; margin-bottom: 20px; background: #fbbf24; color: #000; font-weight: 800;" onclick="window.updateDocProfile()">ACTUALIZAR CREDENCIALES</button>
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

        let html = `
            <div class="dashboard-grid">
                <div class="widget-card animate-in" style="grid-column: span 2; padding: 40px; border: 3px solid rgba(16, 185, 129, 0.4); border-radius: 24px;">
                    <h3 class="widget-title" style="font-size: 26px; color: #10b981; border-bottom: 2px solid rgba(16, 185, 129, 0.1); padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between;">
                        <span>Gestión de Consultas Médicas</span>
                        <span style="font-size: 16px; opacity: 0.7;">QSL: ${selectedPatientQSL}</span>
                    </h3>
                    
                    ${isMed ? `
                    <div style="background: rgba(0,0,0,0.2); padding: 25px; border-radius: 15px; margin-bottom: 30px; border: 1px solid rgba(255,255,255,0.05);">
                        <h4 style="color: #10b981; margin-bottom: 20px; font-size: 18px;">Nueva Consulta</h4>
                        <div class="input-group" style="margin-bottom: 20px;">
                            <label>Motivo de Consulta / Síntomas</label>
                            <input type="text" id="c-moivo" placeholder="Describa el motivo principal...">
                        </div>
                        <div class="input-group" style="margin-bottom: 20px;">
                            <label>Notas Clínicas / Evolución</label>
                            <textarea id="c-notas" style="height: 100px; width: 100%;" placeholder="Examen físico, hallazgos, diagnóstico..."></textarea>
                        </div>
                        <div class="input-group" style="margin-bottom: 20px;">
                            <label>Referencias / Anexos / Exámenes Extras</label>
                            <textarea id="c-referencias" style="height: 70px; width: 100%;" placeholder="Laboratorios solicitados, referencias a especialistas..."></textarea>
                        </div>
                        <button class="btn-primary" style="width: 100%; background: #10b981; padding: 15px;" onclick="window.saveConsultation()">
                            GUARDAR CONSULTA
                        </button>
                    </div>
                    ` : '<div style="text-align: center; color: var(--text-muted); margin-bottom: 30px; font-style: italic;">Solo su médico tratante puede editar las consultas.</div>'}

                    <h3 class="widget-title" style="font-size: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 20px;">
                        Historial de Consultas (${data.consultations.length})
                    </h3>
                    <div class="consultation-list">
                        ${data.consultations.length > 0 ? data.consultations.slice().sort((a,b)=>b.id-a.id).map(c => `
                            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 15px; margin-bottom: 15px; position:relative;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; align-items:flex-start;">
                                    <strong style="color: #10b981; font-size: 18px;">Consulta: ${c.date}</strong>
                                    ${isMed ? `<button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: none;" onclick="window.deleteConsultation(${c.id})">Borrar</button>` : ''}
                                </div>
                                <p style="margin-bottom: 8px; font-size:16px;"><strong>Motivo:</strong> ${c.motivo}</p>
                                <p style="margin-bottom: 8px; color: rgba(255,255,255,0.85); font-size:15px; line-height:1.4;"><strong>Notas:</strong><br/>${c.notas.replace(/\n/g, '<br>')}</p>
                                ${c.referencias ? `<p style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); color: #fbbf24; font-size:14px;"><strong>Referencias/Estudios:</strong><br/>${c.referencias.replace(/\n/g, '<br>')}</p>` : ''}
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
        const motivo = document.getElementById('c-moivo').value.trim();
        const notas = document.getElementById('c-notas').value.trim();
        const referencias = document.getElementById('c-referencias').value.trim();
        if (!motivo || !notas) {
            window.showElegantAlert('Faltan Datos', 'El motivo y las notas clínicas son obligatorios.', true);
            return;
        }

        const data = getPatientData(selectedPatientQSL);
        if(!data.consultations) data.consultations = [];
        const now = new Date();
        data.consultations.push({
            id: now.getTime(),
            date: now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            motivo,
            notas,
            referencias
        });
        
        savePatientData(selectedPatientQSL, data);
        window.showElegantAlert('Consulta Guardada', 'La consulta y la evolución han sido registradas en el historial.');
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
        return titles[name] || 'H-Control';
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
    const countryData = {
        "GT": { name: "Guatemala", currency: "GTQ", timezone: "America/Guatemala", dateLocale: "es-GT", taxIdName: "NIT" },
        "ES": { name: "España", currency: "EUR", timezone: "Europe/Madrid", dateLocale: "es-ES", taxIdName: "NIF/CIF" },
        "US": { name: "Estados Unidos", currency: "USD", timezone: "America/New_York", dateLocale: "en-US", taxIdName: "Tax ID" },
        "MX": { name: "México", currency: "MXN", timezone: "America/Mexico_City", dateLocale: "es-MX", taxIdName: "RFC" },
        "CO": { name: "Colombia", currency: "COP", timezone: "America/Bogota", dateLocale: "es-CO", taxIdName: "NIT" },
        "AR": { name: "Argentina", currency: "ARS", timezone: "America/Argentina/Buenos_Aires", dateLocale: "es-AR", taxIdName: "CUIT" },
        "CL": { name: "Chile", currency: "CLP", timezone: "America/Santiago", dateLocale: "es-CL", taxIdName: "RUT" }
    };

    async function renderProgrammer() {
        let medicos = [];
        try {
            const resp = await fetch('/api/medicos');
            const result = await resp.json();
            medicos = result.medicos || [];
        } catch (e) {
            medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        }
        
        contentArea.innerHTML = `
            <div class="programmer-dashboard animate-in">
                <div style="display: grid; grid-template-columns: 1fr 400px; gap: 30px;">
                    <div class="widget-card" style="border: 3px solid #fbbf24; box-shadow: 0 0 20px rgba(251, 191, 36, 0.1);">
                        <h3 class="widget-title" style="color: #fbbf24; border-bottom: 2px solid rgba(251, 191, 36, 0.2); padding-bottom: 20px;">
                            Lista de Médicos Registrados
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
                                            <div style="background: #fbbf24; color: #000; padding: 10px 15px; border-radius: 10px; font-weight: 800; font-size: 18px; margin-bottom: 10px; display: inline-block; letter-spacing: 2px; font-family: monospace;">
                                                 ${doc.password_hash ? atob(doc.password_hash) : '---'}
                                            </div>
                                            <br>
                                            <button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer;" onclick="window.deleteDoctor('${doc.id_medico}')">ELIMINAR</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div style="text-align:center; padding: 40px; border: 2px dashed rgba(255,255,255,0.05); border-radius: 20px; color: var(--text-muted);">No hay médicos registrados todavía.</div>'}
                        </div>
                    </div>

                    <div class="widget-card" style="border: 2px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2);">
                        <h3 class="widget-title" style="font-size: 22px; color: #fbbf24;">Registrar Nuevo Médico</h3>
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
                                <select id="doc-new-country" onchange="window.updateDocNewDefaults()" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); padding: 12px; border-radius: 12px; color: white;">
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
                        
                        <button class="btn-primary" style="width: 100%; background: #fbbf24; color: #000; font-weight: 800; padding: 22px; font-size: 18px;" onclick="window.saveNewDoctor()">
                            GENERAR ACCESO Y REGISTRAR
                        </button>
                    </div>
                </div>
            </div>
        `;
        window.updateDocNewDefaults();
    }

    window.updateDocNewDefaults = () => {
        const countryCode = document.getElementById('doc-new-country').value;
        const data = countryData[countryCode];
        if (data) {
            document.getElementById('doc-new-currency').value = data.currency;
        }
    };

    window.saveNewDoctor = async () => {
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
        const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const newDoc = {
            id_medico: dpi,
            nombre_completo: nombre,
            especialidad: 'Medicina General',
            usuario: nombre.replace(/\s+/g, '').toUpperCase(),
            password_hash: btoa(randomCode),
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
            const result = await resp.json();
            if (result.success) {
                let medicosList = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
                medicosList.push(newDoc);
                localStorage.setItem('tabla_medicos', JSON.stringify(medicosList));
                
                if (medicosList.length === 1) {
                    localStorage.setItem('active_company', JSON.stringify(newDoc));
                }

                window.showElegantAlert('Médico Registrado', `Se ha generado el acceso para ${nombre}. El código de entrada es: ${randomCode}`);
                renderProgrammer();
            }
        } catch (e) {
            window.showElegantAlert('Error', 'No se pudo guardar el médico en el servidor.', true);
        }
    };

    window.deleteDoctor = async (id) => {
        if (id === 'MED-MASTER') {
            window.showElegantAlert('Acción denegada', 'No se puede eliminar la cuenta maestra.', true);
            return;
        }
        if (confirm('¿Seguro que desea eliminar este médico? Perderá acceso al sistema.')) {
            try {
                const resp = await fetch(`/api/medico/${id}`, { method: 'DELETE' });
                const result = await resp.json();
                if (result.success) {
                    let medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
                    medicos = medicos.filter(m => m.id_medico !== id);
                    localStorage.setItem('tabla_medicos', JSON.stringify(medicos));
                    renderProgrammer();
                    window.showElegantAlert('Eliminado', 'El médico ha sido removido del sistema.');
                }
            } catch (e) {
                window.showElegantAlert('Error', 'No se pudo eliminar el médico del servidor.', true);
            }
        }
    };


    // --- INICIALIZACIÓN ---
    updateUserDisplay();
    updateDate();
});
