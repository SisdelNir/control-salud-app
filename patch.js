const fs = require('fs');

let code = fs.readFileSync('dashboard.js', 'utf8');

// 1. Reemplace renderDoctorHome with renderPatientSearch in renderSection
code = code.replace(/renderDoctorHome\(\);/g, 'window.renderPatientSearch();');

// 2. Replace the showPatientChoiceModal click handlers
code = code.replace(
`        document.getElementById('btn-nuevo').onclick = () => {
            close();
            const pNombre = document.getElementById('p-nombre');
            if(pNombre) {
                pNombre.scrollIntoView({behavior: 'smooth', block: 'center'});
                setTimeout(() => pNombre.focus(), 500);
            }
        };

        document.getElementById('btn-buscar').onclick = () => {
            close();
            const searchBox = document.getElementById('patient-search');
            if(searchBox) {
                searchBox.scrollIntoView({behavior: 'smooth', block: 'center'});
                setTimeout(() => searchBox.focus(), 500);
            }
        };`,
`        document.getElementById('btn-nuevo').onclick = () => {
            close();
            window.renderPatientRegistration();
            setTimeout(() => {
                const pNombre = document.getElementById('p-nombre');
                if(pNombre) pNombre.focus();
            }, 100);
        };

        document.getElementById('btn-buscar').onclick = () => {
            close();
            window.renderPatientSearch();
            setTimeout(() => {
                const searchBox = document.getElementById('patient-search');
                if(searchBox) searchBox.focus();
            }, 100);
        };`
);

// 3. Extract renderDoctorHome into renderPatientSearch and renderPatientRegistration
// Find the start of renderDoctorHome
const startIdx = code.indexOf('function renderDoctorHome() {');
const endIdx = code.indexOf('window.filterPatients = () => {');

const doctorHomeCode = code.substring(startIdx, endIdx);

// We need to keep the exact HTML of the form but put it into renderPatientRegistration
const formStart = doctorHomeCode.indexOf('<div id="patient-form"');
const formEnd = doctorHomeCode.indexOf('<!-- SECTION END LIST -->') || doctorHomeCode.indexOf('<h3 class="widget-title"');

const newCode = `
    window.renderPatientSearch = function() {
        const key = getDocPatientsKey();
        const patients = JSON.parse(localStorage.getItem(key) || '[]');

        contentArea.innerHTML = \`
            <div class="widget-card animate-in" style="max-width: 1000px; margin: 0 auto; padding: 40px; border: 3px solid rgba(34, 211, 238, 0.45); border-radius: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 20px; margin-bottom: 30px;">
                    <h3 class="widget-title" style="color: var(--accent); font-size: 28px; display: flex; align-items: center; border:none; padding:0; margin:0;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 15px;">
                            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        Buscador de Pacientes (<span id="patient-count">\${patients.length}</span>)
                    </h3>
                    <button id="btn-goto-register" class="btn-primary" style="padding: 12px 24px; font-weight: bold; border-radius: 12px;">
                        + Nuevo Expediente
                    </button>
                </div>
                
                <div class="input-group" style="margin-bottom: 30px;">
                    <input type="text" id="patient-search" placeholder="Escriba nombre, DPI o teléfono para buscar..." onkeyup="window.filterPatients()" style="width: 100%; padding: 18px; font-size: 18px; border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); color: white;">
                </div>

                <div class="patient-list">
                    \${patients.length > 0 ? patients.map(qsl => {
            const name = localStorage.getItem(\\\`patient_name_\${qsl}\\\`) || 'Paciente';
            const data = getPatientData(qsl);
            // We search by appending multiple fields
            const searchStr = \\\`\${name} \${qsl} \${data.id_identificacion || ''} \${data.telefono || ''}\\\`.toLowerCase();
            return \\\`
                            <div class="med-item patient-row" data-search="\${searchStr}" style="cursor: pointer; padding: 20px;" onclick="window.selectPatient('\${qsl}')">
                                <div class="med-info">
                                    <h4 style="color: white; font-size: 22px; margin-bottom: 5px;">\${name}</h4>
                                    <p style="color: var(--text-muted); font-size: 15px;">
                                        Código: <b style="color:var(--accent);">\${qsl}</b> | 
                                        DPI: \${data.id_identificacion || 'N/A'} | 
                                        Tel: \${data.telefono || 'N/A'}
                                    </p>
                                </div>
                                <div style="display: flex; gap: 10px; flex-direction: column; align-items: flex-end;">
                                    <span class="status-badge" style="background: rgba(34, 211, 238, 0.1); color: #22d3ee; padding: 10px 15px; font-weight: bold;">Ver Ficha Completa</span>
                                    <button class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--error);" onclick="event.stopPropagation(); window.deletePatient('\${qsl}')">Eliminar</button>
                                </div>
                            </div>
                        \\\`;
        }).join('') : '<div style="text-align:center; padding: 40px; opacity: 0.5; font-size: 18px;">No hay expedientes todavía. Utilice el botón superior para crear uno.</div>'}
                </div>
            </div>
        \`;

        const btnRegister = document.getElementById('btn-goto-register');
        if (btnRegister) {
            btnRegister.onclick = () => {
                window.renderPatientRegistration();
            };
        }
    };

    window.renderPatientRegistration = function() {
        const key = getDocPatientsKey();
        const patients = JSON.parse(localStorage.getItem(key) || '[]');

        contentArea.innerHTML = \`
            <div class="widget-card animate-in" style="max-width: 1000px; margin: 0 auto; padding: 40px; border: 3px solid rgba(16, 185, 129, 0.45); border-radius: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 20px;">
                    <h3 class="widget-title" style="color: #10b981; font-size: 28px; display: flex; align-items: center; border:none; padding:0; margin:0;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 15px;">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                        </svg>
                        Nuevo Expediente Clínico
                    </h3>
                    <button class="status-badge" style="background: rgba(255,255,255,0.1); padding: 10px 15px; cursor: pointer; border: none; color: white;" onclick="window.renderPatientSearch()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;"><polyline points="15 18 9 12 15 6"></polyline></svg> Cancelar / Volver
                    </button>
                </div>
                
\`;
        
        const formHtml = \`${doctorHomeCode.substring(formStart, formEnd).replace(/\`/g, '\\\`').replace(/\$/g, '\\$')}\`;
        
        let cleanedForm = formHtml;
        // The original form has '</div>' at the end of patient list logic, let's just be careful
        
        contentArea.innerHTML += cleanedForm + '\\n</div>'; // Close widget-card
        
        setTimeout(() => {
            // Auto-calcular edad
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

            const btnAdd = document.getElementById('btn-add-patient');
            if(btnAdd){
                btnAdd.onclick = () => {
                    const nombre = document.getElementById('p-nombre').value.trim();
                    const telefono = document.getElementById('p-telefono').value.trim();
                    const motivo = document.getElementById('p-motivo').value.trim();

                    if (!nombre || !telefono) {
                        window.showElegantAlert('Error', 'Nombre y Teléfono son obligatorios.', true);
                        return;
                    }

                    const parts = nombre.split(/\\s+/);
                    const first = (parts[0] || 'A').charAt(0).toUpperCase();
                    const second = (parts.length > 1 ? parts[1].charAt(0) : 'X').toUpperCase();
                    const digitsOnly = telefono.replace(/\\D/g, '');
                    const last4Phone = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : telefono.slice(-4).padStart(4, '0').toUpperCase();
                    
                    let baseQsl = \\\`\${first}\${second}\${last4Phone}\\\`;
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

                    const key = getDocPatientsKey();
                    const existingPatients = JSON.parse(localStorage.getItem(key) || '[]');
                    if (existingPatients.includes(qsl)) {
                        qsl = baseQsl + Math.floor(Math.random() * 90);
                    }

                    localStorage.setItem(\\\`patient_name_\${qsl}\\\`, nombre);
                    localStorage.setItem(\\\`patient_data_\${qsl}\\\`, JSON.stringify(patientData));
                    
                    if (!existingPatients.includes(qsl)) {
                        existingPatients.push(qsl);
                        localStorage.setItem(key, JSON.stringify(existingPatients));
                    }

                    window.showElegantAlert('Expediente Creado', \\\`Se ha registrado exitosamente a \${nombre}. Código de acceso: \${qsl}\\\`);
                    window.selectPatient(qsl);
                };
            }
        }, 100);
    }
`;

code = code.substring(0, startIdx) + newCode + "\\n    " + code.substring(endIdx);

fs.writeFileSync('dashboard.js', code);
console.log("Success");
