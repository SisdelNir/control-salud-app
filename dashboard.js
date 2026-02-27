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
        loadSection('overview');
    }

    function updateUserDisplay() {
        const name = localStorage.getItem('user_real_name') || qslCode;
        qslDisplay.textContent = userRole === 'medico' ? `Dr. ${name}` : `Paciente: ${name}`;
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
    function getPatientData(qsl) {
        const data = localStorage.getItem(`patient_data_${qsl}`);
        return data ? JSON.parse(data) : { illness: '', meds: [] };
    }

    function savePatientData(qsl, data) {
        localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(data));
        // Registrar QSL en la lista global de pacientes del médico si no existe
        let list = JSON.parse(localStorage.getItem('doctor_patients_list') || '[]');
        if (!list.includes(qsl)) {
            list.push(qsl);
            localStorage.setItem('doctor_patients_list', JSON.stringify(list));
        }
    }

    // 3. Motor de Secciones
    function loadSection(sectionName) {
        sectionTitle.textContent = getSectionTitle(sectionName);
        contentArea.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
        setTimeout(() => renderSection(sectionName), 300);
    }

    function renderSection(name) {
        if (userRole === 'medico' && !selectedPatientQSL && name !== 'settings') {
            renderDoctorHome();
            return;
        }

        const data = getPatientData(selectedPatientQSL);

        switch (name) {
            case 'overview': renderOverview(data); break;
            case 'reminders': renderReminders(data); break;
            case 'settings': renderSettings(); break;
        }
    }

    // --- VISTAS DEL MÉDICO ---

    function renderDoctorHome() {
        const patients = JSON.parse(localStorage.getItem('doctor_patients_list') || '[]');

        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 950px; margin: 0 auto; padding: 50px 40px;">
                <h3 class="widget-title" style="color: var(--accent); border-bottom: 2px solid rgba(255,255,255,0.05); padding-bottom: 25px; font-size: 32px; display: flex; align-items: center;">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 15px; filter: drop-shadow(0 0 5px rgba(34, 211, 238, 0.5));">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    Aperturar Nuevo Expediente Clínico
                </h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 40px 0; padding: 40px; background: rgba(0,0,0,0.3); border-radius: 20px; box-shadow: inset 0 0 15px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.02);">
                    <div class="input-group">
                        <label>Nombre Completo del Paciente</label>
                        <input type="text" id="new-patient-name" placeholder="Ingrese nombre y apellido...">
                    </div>
                    <div class="input-group">
                        <label>Teléfono (Usado para crear QSL)</label>
                        <input type="text" id="new-patient-phone" placeholder="Ingrese su teléfono...">
                    </div>
                    <div class="input-group">
                        <label>Código de Acceso QSL</label>
                        <input type="text" id="new-patient-qsl" placeholder="Generado automáticamente al crear" disabled style="opacity: 0.5;">
                    </div>
                    <div class="input-group">
                        <label>Motivo Principal / Diagnóstico Inicial</label>
                        <input type="text" id="new-patient-illness" placeholder="Opcional. Ej: Diabetes Tipo 2, Hipertensión...">
                    </div>
                    <button id="btn-add-patient" class="btn-primary" style="grid-column: span 2; margin-top: 25px; padding: 24px; font-size: 20px; font-weight: 700; background: linear-gradient(135deg, var(--primary) 0%, #312e81 100%);">
                        <span>CREAR EXPEDIENTE Y ASIGNAR MEDICAMENTOS</span>
                    </button>
                </div>

                <h3 class="widget-title" style="font-size: 26px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-top: 40px; opacity: 0.9;">Expedientes Activos (${patients.length})</h3>
                <div class="patient-list">
                    ${patients.length > 0 ? patients.map(qsl => {
            const name = localStorage.getItem(`patient_name_${qsl}`) || 'Paciente sin nombre';
            const data = getPatientData(qsl);
            return `
                            <div class="med-item" style="cursor: pointer; transition: 0.3s; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 16px;" onclick="window.selectPatient('${qsl}')">
                                <div class="med-info">
                                    <h4 style="color: white; font-size: 24px; margin-bottom: 10px;">${name}</h4>
                                    <p style="color: var(--text-muted); font-size: 18px;">QSL: <b style="color:var(--accent); font-size: 20px;">${qsl}</b> | ${data.illness || 'Sin diagnóstico'}</p>
                                </div>
                                <div style="text-align: right; display: flex; flex-direction: column; gap: 12px;">
                                    <span class="status-badge" style="background: rgba(34, 211, 238, 0.1); padding: 12px 20px; font-size: 16px; font-weight: 700; display: inline-block; text-align: center;">Ver Detalle</span>
                                    <span class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); padding: 12px 20px; font-size: 16px; font-weight: 700; display: inline-block; text-align: center; cursor: pointer;" onclick="event.stopPropagation(); window.deletePatient('${qsl}')">Eliminar</span>
                                </div>
                            </div>
                        `;
        }).join('') : '<div style="text-align:center; padding: 40px; font-size: 18px; opacity: 0.5;">No hay expedientes registrados todavía.</div>'}
                </div>
            </div>
        `;

        document.getElementById('btn-add-patient').onclick = () => {
            const name = document.getElementById('new-patient-name').value.trim();
            const phone = document.getElementById('new-patient-phone').value.trim();
            const illness = document.getElementById('new-patient-illness').value.trim();

            if (name && phone.length >= 4) {
                // Generar QSL Automático (Primera letra + Letra aleatoria + Últimos 4 dígitos del teléfono)
                const firstLetter = name.charAt(0).toUpperCase() || 'A';
                const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const randomLetter = alphabet.charAt(Math.floor(Math.random() * alphabet.length));

                // Extraer solo dígitos del teléfono por seguridad y tomar los últimos 4
                const digitsOnly = phone.replace(/\D/g, '');
                const last4Phone = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : phone.slice(-4).padStart(4, '0').toUpperCase();

                let baseQsl = `${firstLetter}${randomLetter}${last4Phone}`;
                let qsl = baseQsl;

                const existingPatients = JSON.parse(localStorage.getItem('doctor_patients_list') || '[]');
                let counter = 1;
                while (existingPatients.includes(qsl)) {
                    qsl = `${baseQsl}-${counter}`;
                    counter++;
                }

                // Guardar Nombre y Diagnóstico inicial
                localStorage.setItem(`patient_name_${qsl}`, name);
                const data = getPatientData(qsl);
                data.illness = illness;
                data.phone = phone; // Guardarlo de una vez en el expediente
                savePatientData(qsl, data);

                selectedPatientQSL = qsl;
                loadSection('overview');
                window.showElegantAlert('¡Expediente Creado!', `Se ha registrado exitosamente a ${name}.`);
            } else {
                window.showElegantAlert('Atención', 'Por favor, ingrese el nombre del paciente y un teléfono de al menos 4 dígitos.', true);
            }
        };
    }

    window.selectPatient = (qsl) => {
        selectedPatientQSL = qsl;
        loadSection('overview');
    };

    window.deletePatient = (qsl) => {
        if (confirm(`¿Eliminar permanentemente el expediente del paciente ${qsl}? Esta acción borrará todas sus recetas y datos del sistema.`)) {
            localStorage.removeItem(`patient_name_${qsl}`);
            localStorage.removeItem(`patient_data_${qsl}`);
            localStorage.removeItem(`active_qsl_${qsl}`);
            let list = JSON.parse(localStorage.getItem('doctor_patients_list') || '[]');
            list = list.filter(id => id !== qsl);
            localStorage.setItem('doctor_patients_list', JSON.stringify(list));
            loadSection('overview');
        }
    };

    function renderOverview(data) {
        const patientName = localStorage.getItem(`patient_name_${selectedPatientQSL}`) || 'Paciente';
        contentArea.innerHTML = `
            <div class="dashboard-grid">
                <div class="widget-card animate-in" style="padding: 40px; margin-bottom: 30px;">
                    <h3 class="widget-title" style="font-size: 28px; color: var(--accent); border-bottom: 2px solid rgba(255,255,255,0.05); padding-bottom: 20px;">Expediente Clínico</h3>
                    <div style="margin: 25px 0;">
                        <p style="font-size: 22px; color: var(--text-main); font-weight: 600;">${patientName} <span style="color: var(--accent); font-weight: normal; font-size: 20px;">(${selectedPatientQSL})</span></p>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; padding: 30px; background: rgba(0,0,0,0.2); border-radius: 20px; box-shadow: inset 0 0 15px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.02);">
                        <div class="input-group" style="grid-column: span 2;">
                            <label>Enfermedad Principal / Diagnóstico</label>
                            <input type="text" id="patient-illness" value="${data.illness || ''}" placeholder="Ej: Hipertensión Arterial" ${userRole === 'paciente' ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Alergias Conocidas</label>
                            <input type="text" id="patient-allergies" value="${data.allergies || ''}" placeholder="Ej: Ninguna, Penicilina..." ${userRole === 'paciente' ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Tipo de Sangre</label>
                            <input type="text" id="patient-blood" value="${data.blood || ''}" placeholder="Ej: O+, A-..." ${userRole === 'paciente' ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Peso (kg) / Altura</label>
                            <input type="text" id="patient-weight" value="${data.weight || ''}" placeholder="Ej: 75kg / 1.75m" ${userRole === 'paciente' ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>Teléfono de Contacto</label>
                            <input type="text" id="patient-phone" value="${data.phone || ''}" placeholder="Ej: +502 1234 5678" ${userRole === 'paciente' ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <span>Nivel de Glucosa actual (Ayunas/Pos)</span>
                                ${userRole === 'medico' ? `
                                <span style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; color:var(--accent); text-transform:none; font-weight:normal;">
                                    Activar para Paciente
                                    <input type="checkbox" id="patient-glucose-enabled" onchange="window.toggleGlucoseFeature(this.checked)" ${data.glucoseEnabled ? 'checked' : ''} style="width: 16px; height: 16px; margin: 0; accent-color: var(--accent);">
                                </span>` : ''}
                            </label>
                            <div style="display: flex; gap: 10px; align-items: flex-start;">
                                <input type="text" id="patient-glucose" placeholder="Nuevo nivel (Ej: 98 mg/dL)" style="flex:1;" ${userRole === 'paciente' ? 'disabled' : ''}>
                                ${userRole === 'medico' ? `<button class="btn-primary" style="padding: 0 15px; height: 50px; font-size: 14px; margin-bottom: 12px; border-radius: 8px;" onclick="window.addGlucose()">Añadir</button>` : ''}
                            </div>
                            <div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-top: -5px; padding: 0 5px; line-height: 1.6; max-height: 80px; overflow-y: auto;">
                                <div style="font-size: 13px; color: var(--accent); margin-bottom: 5px; text-transform: uppercase;">Últimos Registros:</div>
                                ${(data.glucoseHistory || []).map(r => `<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:6px;"><span>${r.value}</span> <span style="font-size:12px; opacity:0.6;">${r.date}</span></div>`).join('') || '<span style="opacity:0.5; font-size:13px; font-style: italic;">Sin registros recientes.</span>'}
                            </div>
                        </div>
                    </div>
                    <div class="input-group" style="margin-bottom: 25px;">
                        <label>Notas / Observaciones Clínicas</label>
                        <textarea id="patient-notes" style="background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); border-radius: 12px; padding: 20px; color: white; font-family: inherit; font-size: 20px; resize: vertical; min-height: 120px;" placeholder="Detalles extra del expediente..." ${userRole === 'paciente' ? 'disabled' : ''}>${data.notes || ''}</textarea>
                    </div>
                    ${userRole === 'medico' ? `<button class="btn-primary" style="margin-top: 15px; font-size: 18px; width: 100%; box-sizing: border-box; padding: 24px; font-weight: 700; background: linear-gradient(135deg, var(--primary) 0%, #312e81 100%);" onclick="window.savePatientDataBtn()">GUARDAR DATOS DEL PACIENTE</button>` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 50px; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <h4 style="font-size: 20px; text-transform: uppercase; margin: 0; color: #fff;">Medicación Vigente / Recetas</h4>
                        ${userRole === 'medico' ? `<button id="add-btn" class="btn-primary" style="margin:0; padding: 12px 20px; font-size: 16px;">+ Nueva Receta</button>` : ''}
                    </div>

                    <div id="med-form" style="display: none; background: rgba(0,0,0,0.3); padding: 40px; border-radius: 20px; margin-bottom: 30px; border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 0 15px rgba(0,0,0,0.3);">
                        <h4 style="color: var(--accent); margin-top: 0; margin-bottom: 25px; font-size: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">Agregando receta obligatoria a: <span style="color: #fff;">${patientName}</span></h4>
                        <div class="dashboard-grid" style="gap: 30px;">
                            <div class="input-group">
                                <label>Nombre Medicamento</label>
                                <input type="text" id="m-name">
                            </div>
                            <div class="input-group">
                                <label>Dosis / Cantidad</label>
                                <input type="text" id="m-dose">
                            </div>
                            <div class="input-group">
                                <label>Frecuencia (Horas)</label>
                                <input type="number" id="m-freq" placeholder="Ej: 8">
                            </div>
                            <div class="input-group">
                                <label>Comenzar a las:</label>
                                <input type="time" id="m-start" value="08:00">
                            </div>
                            <div class="input-group">
                                <label>Periodo de Tratamiento (Días)</label>
                                <input type="number" id="m-days" placeholder="Ej: 7">
                            </div>
                        </div>
                        <div class="input-group" style="margin-top: 25px;">
                            <label>Indicaciones Extra</label>
                            <input type="text" id="m-notes">
                        </div>
                        <div style="display: flex; gap: 20px; margin-top: 35px;">
                            <button id="btn-med-save" class="btn-primary" style="flex: 2; padding: 24px; font-size: 18px;">GUARDAR RECETA AL EXPEDIENTE</button>
                            <button id="btn-med-cancel" class="btn-primary" style="flex: 1; background: transparent; border: 1px solid var(--card-border); padding: 24px; font-size: 18px; color: var(--text-muted);">CANCELAR</button>
                        </div>
                    </div>

                    <div class="med-list">
                        ${data.meds.length > 0 ? data.meds.map(m => `
                            <div class="widget-card" style="margin-bottom: 10px; background: rgba(255,255,255,0.02); padding: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div class="med-info">
                                        <h4 style="color: var(--accent); margin-bottom: 5px; font-size: 18px;">${m.name}</h4>
                                        <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin: 8px 0;">
                                            <p style="font-size: 16px;">Dosis: ${m.dose} | Cada ${m.frequency}h durante ${m.days} días</p>
                                            <p style="font-size: 16px; color: #10b981; margin-top: 5px;"><strong>Horarios:</strong> ${window.getDailySchedule ? window.getDailySchedule(m.startTime, m.frequency) : m.startTime}</p>
                                        </div>
                                        <p style="font-size: 14px; color: var(--text-muted); font-style: italic; margin-top: 5px;">"${m.notes || 'Sin notas'}"</p>
                                    </div>
                                    ${userRole === 'medico' ? `<button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error); border:none; cursor:pointer;" onclick="window.deleteMed(${m.id})">QUITAR</button>` : '<span class="status-badge">Activo</span>'}
                                </div>
                            </div>
                        `).join('') : '<p style="text-align: center; color: var(--text-muted);">Sin medicamentos/recetas asignados todavía.</p>'}
                    </div>
                </div>

                <div class="widget-card animate-in" style="animation-delay: 0.1s">
                    <h3 class="widget-title">Control de Conexión</h3>
                    <p style="font-size: 16px; color: var(--text-muted); margin-bottom: 20px;">
                        Active este código para que el paciente reciba las alertas en su dispositivo móvil.
                    </p>
                    <div style="text-align: center; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 15px;">
                        <h2 style="color: var(--accent); margin-bottom: 15px;">${selectedPatientQSL}</h2>
                        ${localStorage.getItem(`active_qsl_${selectedPatientQSL}`) === 'true' ? `
                            <p style="color: #10b981; font-size: 20px; margin-top: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; background: rgba(16, 185, 129, 0.1); padding: 15px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3);">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                ¡RECORDATORIOS ACTIVADOS!
                            </p>
                        ` : `
                            <button id="btn-activate-reminders" class="btn-primary" style="width: 100%; background: #10b981; padding: 20px; font-size: 16px;">
                                ACTIVAR OPCIÓN DE RECORDATORIOS
                            </button>
                        `}
                    </div>
                    ${userRole === 'medico' ? `
                        <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 25px;">
                            <button id="btn-new-patient" class="btn-primary" style="width: 100%; background: var(--primary); padding: 20px; font-size: 16px;">+ Registrar Nuevo Paciente</button>
                            <button id="btn-list-patients" class="btn-primary" style="width: 100%; background: rgba(255,255,255,0.05); padding: 20px; font-size: 16px;">Volver a Lista de Pacientes</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        if (userRole === 'medico') {
            const addBtn = document.getElementById('add-btn');
            if (addBtn) {
                addBtn.onclick = () => {
                    document.getElementById('med-form').style.display = 'block';
                    addBtn.style.display = 'none';
                };
            }

            const btnCancel = document.getElementById('btn-med-cancel');
            if (btnCancel) {
                btnCancel.onclick = () => {
                    document.getElementById('med-form').style.display = 'none';
                    if (addBtn) addBtn.style.display = 'block';
                };
            }

            const btnSave = document.getElementById('btn-med-save');
            if (btnSave) {
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
                        const patientData = getPatientData(selectedPatientQSL);
                        patientData.meds.push(med);
                        savePatientData(selectedPatientQSL, patientData);
                        loadSection('overview');
                        window.showElegantAlert('Receta Agregada', `Se ha agregado ${med.name} correctamente al expediente.`);
                    } else { window.showElegantAlert('Campos Incompletos', 'Complete los campos obligatorios para guardar la receta', true); }
                };
            }

            const btnActivate = document.getElementById('btn-activate-reminders');
            if (btnActivate) {
                btnActivate.onclick = () => window.activateCode(selectedPatientQSL);
            }

            const btnNewPatient = document.getElementById('btn-new-patient');
            if (btnNewPatient) {
                btnNewPatient.onclick = () => {
                    selectedPatientQSL = null;
                    loadSection('overview');
                };
            }

            const btnListPatients = document.getElementById('btn-list-patients');
            if (btnListPatients) {
                btnListPatients.onclick = () => {
                    selectedPatientQSL = null;
                    loadSection('overview');
                };
            }
        }

    }

    window.toggleGlucoseFeature = (enabled) => {
        const data = getPatientData(selectedPatientQSL);
        data.glucoseEnabled = enabled;
        savePatientData(selectedPatientQSL, data);
    };

    window.addGlucose = () => {
        const input = document.getElementById('patient-glucose');
        const val = input.value.trim();
        if (!val) return;
        const data = getPatientData(selectedPatientQSL);
        if (!data.glucoseHistory) data.glucoseHistory = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        data.glucoseHistory.unshift({ value: val, date: dateStr });
        if (data.glucoseHistory.length > 2) data.glucoseHistory = data.glucoseHistory.slice(0, 2);
        savePatientData(selectedPatientQSL, data);
        loadSection('overview'); // Refrescar para ver el listado actualizado
    };

    window.addQuickGlucose = () => {
        const input = document.getElementById('patient-glucose-quick');
        let val = input.value.trim();
        if (!val) return;

        // Formatear valor si sólo ponen el número
        if (!val.toLowerCase().includes('mg/dl')) val += ' mg/dL';

        const data = getPatientData(selectedPatientQSL);
        if (!data.glucoseHistory) data.glucoseHistory = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        data.glucoseHistory.unshift({ value: val, date: dateStr });
        if (data.glucoseHistory.length > 2) data.glucoseHistory = data.glucoseHistory.slice(0, 2);

        savePatientData(selectedPatientQSL, data);
        window.showElegantAlert('¡Guardado!', `Nivel de glucosa ${val} registrado en su expediente.`);
        loadSection('reminders'); // Recarga en la misma página del paciente
    };

    window.savePatientDataBtn = () => {
        const data = getPatientData(selectedPatientQSL);
        data.illness = document.getElementById('patient-illness').value.trim();
        data.allergies = document.getElementById('patient-allergies').value.trim();
        data.blood = document.getElementById('patient-blood').value.trim();
        data.weight = document.getElementById('patient-weight').value.trim();
        data.phone = document.getElementById('patient-phone').value.trim();

        const enabledCheckbox = document.getElementById('patient-glucose-enabled');
        if (enabledCheckbox) {
            data.glucoseEnabled = enabledCheckbox.checked;
        }

        // Si hay algo escrito en glucosa sin guardar, guardarlo también
        const glucoseInput = document.getElementById('patient-glucose').value.trim();
        if (glucoseInput) {
            if (!data.glucoseHistory) data.glucoseHistory = [];
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES') + ' a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            data.glucoseHistory.unshift({ value: glucoseInput, date: dateStr });
            if (data.glucoseHistory.length > 2) data.glucoseHistory = data.glucoseHistory.slice(0, 2);
        }

        data.notes = document.getElementById('patient-notes').value.trim();
        savePatientData(selectedPatientQSL, data);

        window.showElegantAlert('¡Guardado Exitoso!', 'Datos del paciente actualizados correctamente en el sistema.');
        loadSection('overview'); // Refresca para mostrar la glucosa si se auto-agregó
    };

    window.activateCode = (qsl) => {
        // En un sistema real, esto activaría un socket o notificación push.
        // Aquí simulamos que el QSL ahora es "rastreable".
        localStorage.setItem(`active_qsl_${qsl}`, 'true');
        loadSection('overview'); // Refresca la vista para mostrar el chequecito de Activado
        window.showElegantAlert('Servicio Activado', `¡El paciente con código ${qsl} ya recibirá sus alertas en su dispositivo!`);
    };

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



    window.deleteMed = (id) => {
        if (confirm('¿Eliminar medicamento del expediente?')) {
            const data = getPatientData(selectedPatientQSL);
            data.meds = data.meds.filter(m => m.id !== id);
            savePatientData(selectedPatientQSL, data);
            loadSection('overview');
        }
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
            if (isPaciente && !isActivated) return ''; // No renderizar si no está activado

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
                ${medsToDisplay.length === 0 || (isPaciente && !isActivated) ? `
                    <div style="text-align: center; padding: 40px 20px; background: rgba(0,0,0,0.15); border-radius: 16px; margin-top: 15px; border: 1px dashed rgba(255,255,255,0.08); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <h4 style="color: rgba(255,255,255,0.9); font-size: 16px; margin-bottom: 8px; font-weight: 600;">Sin medicamentos pendientes</h4>
                        <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 1.5; max-width: 250px;">${!isActivated && isPaciente ? 'Su médico aún no ha habilitado las alertas para su perfil.' : 'Ha completado sus tomas o no tiene recetas activas por ahora.'}</p>
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

    function renderSettings() {
        const isDoc = userRole === 'medico';
        contentArea.innerHTML = `
            <div class="widget-card animate-in" style="max-width: 500px; margin: 0 auto;">
                <h3 class="widget-title">Datos del Médico</h3>
                <div class="input-group" style="margin-bottom: 20px;">
                    <label>Nombre Maestro (Médico)</label>
                    <input type="text" id="new-doc-name" value="${isDoc ? (localStorage.getItem('doctor_master_name') || 'Médico') : ''}" ${!isDoc ? 'disabled' : ''}>
                </div>
                <div class="input-group" style="margin-bottom: 20px;">
                    <label>Nueva Clave de Acceso</label>
                    <input type="password" id="new-doc-pass" placeholder="Ingresar nueva clave..." ${!isDoc ? 'disabled' : ''}>
                </div>
                ${isDoc ? `
                    <button class="btn-primary" style="width: 100%; margin-bottom: 20px;" onclick="window.updateDocProfile()">GUARDAR CAMBIOS DE ACCESO</button>
                ` : '<p style="font-size: 16px; color: var(--text-muted); opacity: 0.7;">Los pacientes gestionan su perfil mediante su código QSL único.</p>'}
                <hr style="border:0; border-top: 1px solid var(--card-border); margin: 20px 0;">
                <button class="btn-primary" style="width: 100%; background: var(--error);" onclick="localStorage.removeItem('user_qsl_code'); window.location.href='index.html';">CERRAR SESIÓN</button>
            </div>
        `;
    }

    window.updateDocProfile = () => {
        const name = document.getElementById('new-doc-name').value.trim();
        const pass = document.getElementById('new-doc-pass').value.trim();
        if (name) {
            localStorage.setItem('doctor_master_name', name);
            localStorage.setItem('user_real_name', name);
            if (pass) {
                localStorage.setItem('doctor_master_pass', btoa(pass));
                window.showElegantAlert('Clave Actualizada', 'Nombre y Clave actualizados. Se aplicarán la próxima vez que ingrese.');
            } else {
                window.showElegantAlert('Perfil Actualizado', 'Nombre actualizado correctamente.');
            }
            updateUserDisplay();
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
        const titles = { overview: 'Expediente', reminders: 'Seguimiento', settings: 'Datos del Médico' };
        return titles[name] || 'H-Control';
    }

    function updateDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = new Date().toLocaleDateString('es-ES', options);
    }
});
