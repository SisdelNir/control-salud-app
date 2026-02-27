document.addEventListener('DOMContentLoaded', () => {
    const qslForm = document.getElementById('qsl-form');
    // Select the new unified inputs
    const loginNameInput = document.getElementById('login-name');
    const loginCodeInput = document.getElementById('login-code');
    const submitBtn = document.getElementById('submit-btn');
    const toastContainer = document.getElementById('toast-container');

    // 1. Inicializar tabla Medicos si no existe (Migración) para tenerlos en memoria listos
    let medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
    if (medicos.length === 0) {
        const legacyName = localStorage.getItem('doctor_master_name') || 'Médico Maestro';
        const legacyPass = localStorage.getItem('doctor_master_pass') || btoa('S2026GUATE'); // defaults
        const newDocId = 'MED-' + Date.now();

        const oldList = localStorage.getItem('doctor_patients_list');
        if (oldList) {
            localStorage.setItem(`doctor_patients_list_${newDocId}`, oldList);
        }

        medicos.push({
            id_medico: newDocId,
            nombre_completo: legacyName,
            especialidad: 'Medicina General',
            cedula_profesional: '000000',
            usuario: legacyName,
            password_hash: legacyPass
        });
        medicos.push({
            id_medico: 'MED-MASTER',
            nombre_completo: 'Administrador Principal',
            especialidad: 'Admin',
            cedula_profesional: '000000',
            usuario: 'MEDICO',
            password_hash: btoa('S2026GUATE')
        });
        localStorage.setItem('tabla_medicos', JSON.stringify(medicos));
    }

    if (!medicos.find(m => m.usuario.toUpperCase() === 'ROMULO DIAZ')) {
        medicos.push({
            id_medico: 'MED-' + Date.now() + '-ROMULO',
            nombre_completo: 'Romulo Diaz',
            especialidad: 'Medicina',
            cedula_profesional: '000001',
            usuario: 'ROMULO DIAZ',
            password_hash: btoa('1111')
        });
        localStorage.setItem('tabla_medicos', JSON.stringify(medicos));
    }

    if (qslForm) {
        qslForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const user = loginNameInput.value.trim();
            const pass = loginCodeInput.value.trim();

            if (!user || !pass) {
                showToast('Complete usuario y clave', 'error');
                return;
            }

            // --- 1. INTENTAR LOGIN COMO MÉDICO ---
            const passHash = btoa(pass);
            const medicoEncontrado = medicos.find(m =>
                m.usuario.toUpperCase() === user.toUpperCase() &&
                m.password_hash === passHash
            );

            if (medicoEncontrado) {
                localStorage.setItem('current_doctor_id', medicoEncontrado.id_medico);
                loginSuccess(medicoEncontrado.nombre_completo, 'medico', medicoEncontrado.id_medico);
                return; // Detener aquí porque entró exitosamente
            }

            // --- 2. INTENTAR LOGIN COMO PACIENTE ---
            const code = pass.toUpperCase();
            const inputName = user.toLowerCase();

            const storedName = (localStorage.getItem(`patient_name_${code}`) || '').trim();

            if (!storedName) {
                // Logica amigable: buscar si el nombre existe con otro QSL
                let foundCode = null;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('patient_name_')) {
                        const name = (localStorage.getItem(key) || '').toLowerCase().trim();
                        if (name === inputName || name.includes(inputName) || inputName.includes(name)) {
                            foundCode = key.replace('patient_name_', '');
                            break;
                        }
                    }
                }

                if (foundCode) {
                    showToast(`El código correcto es: ${foundCode}`, 'error');
                } else {
                    showToast('Datos incorrectos. Intente de nuevo.', 'error');
                }
                return;
            }

            const storedNameLower = storedName.toLowerCase();
            const storedParts = storedNameLower.split(/\s+/);

            if (inputName !== storedNameLower && inputName !== storedParts[0] && !storedNameLower.includes(inputName) && !inputName.includes(storedNameLower)) {
                showToast('El nombre no coincide con el código', 'error');
                return;
            }

            loginSuccess(storedName, 'paciente', code);
        });
    }

    function loginSuccess(name, role, codeOrId) {
        localStorage.setItem('user_real_name', name);
        localStorage.setItem('user_role', role);
        localStorage.setItem('user_qsl_code', codeOrId);

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verificando...</span>';

        setTimeout(() => {
            showToast(`Bienvenido ${name}`, 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        }, 800);
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 500);
        }, 3000);

    }

    // Modal de Registro Médico SISDEL
    const openRegBtn = document.getElementById('open-register-modal');
    const closeRegBtn = document.getElementById('close-register-modal');
    const regModal = document.getElementById('register-modal');
    const regForm = document.getElementById('register-form');

    if (openRegBtn && regModal) {
        openRegBtn.addEventListener('click', (e) => {
            e.preventDefault();
            regModal.style.display = 'flex';
        });

        closeRegBtn.addEventListener('click', () => {
            regModal.style.display = 'none';
        });

        regForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('reg-name').value.trim();
            const license = document.getElementById('reg-license').value.trim();
            const spec = document.getElementById('reg-specialty').value.trim();
            const contact = document.getElementById('reg-contact').value.trim();

            if (!name || !license) {
                showToast('Revisa los campos requeridos', 'error');
                return;
            }

            let requests = JSON.parse(localStorage.getItem('sisdel_requests') || '[]');
            requests.push({
                id: 'REQ-' + Date.now(),
                name,
                license,
                spec,
                contact,
                date: new Date().toLocaleDateString('es-ES')
            });
            localStorage.setItem('sisdel_requests', JSON.stringify(requests));

            regForm.reset();
            regModal.style.display = 'none';

            // Mostrar mensaje de éxito nativo para mejor visibilidad
            alert('Su solicitud ha sido enviada exitosamente a SISDEL. Su número de licencia está bajo revisión. Nos comunicaremos con usted al ' + contact + ' para entregarle su Usuario y Clave de Acceso temporal.');
        });
    }
});
