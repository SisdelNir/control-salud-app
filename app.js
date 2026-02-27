document.addEventListener('DOMContentLoaded', () => {
    const qslForm = document.getElementById('qsl-form');
    const qslInput = document.getElementById('qsl-code');
    const nameInput = document.getElementById('user-name');
    const docNameInput = document.getElementById('doc-name');
    const docPassInput = document.getElementById('doc-pass');

    const patientFields = document.getElementById('patient-fields');
    const doctorFields = document.getElementById('doctor-fields');

    const submitBtn = document.getElementById('submit-btn');
    const toastContainer = document.getElementById('toast-container');
    const roleBtns = document.querySelectorAll('.role-btn');

    let currentRole = 'paciente';

    // Manejo de Roles
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRole = btn.dataset.role;

            if (currentRole === 'medico') {
                patientFields.style.display = 'none';
                doctorFields.style.display = 'block';
            } else {
                patientFields.style.display = 'block';
                doctorFields.style.display = 'none';
            }
        });
    });

    qslForm.addEventListener('submit', (e) => {
        e.preventDefault();

        if (currentRole === 'medico') {
            handleDoctorLogin();
        } else {
            handlePatientLogin();
        }
    });

    function handleDoctorLogin() {
        const user = docNameInput.value.trim();
        const pass = docPassInput.value.trim();

        if (!user || !pass) {
            showToast('Complete usuario y clave', 'error');
            return;
        }

        // 1. Inicializar tabla Medicos si no existe (Migración)
        let medicos = JSON.parse(localStorage.getItem('tabla_medicos') || '[]');
        if (medicos.length === 0) {
            const legacyName = localStorage.getItem('doctor_master_name') || 'Médico Maestro';
            const legacyPass = localStorage.getItem('doctor_master_pass') || btoa('S2026GUATE'); // defaults
            const newDocId = 'MED-' + Date.now();

            // Migrar lista de pacientes
            const oldList = localStorage.getItem('doctor_patients_list');
            if (oldList) {
                localStorage.setItem(`doctor_patients_list_${newDocId}`, oldList);
                // No lo borramos de momento por seguridad, pero ya está copiado.
            }

            medicos.push({
                id_medico: newDocId,
                nombre_completo: legacyName,
                especialidad: 'Medicina General',
                cedula_profesional: '000000',
                usuario: legacyName,    // en modo antiguo el usuario era el nombre
                password_hash: legacyPass
            });
            // También agregar el usuario fallback
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

        // 2. Buscar en tabla Medicos
        const passHash = btoa(pass); // Encriptación básica simulada
        const medicoEncontrado = medicos.find(m =>
            m.usuario.toUpperCase() === user.toUpperCase() &&
            m.password_hash === passHash
        );

        if (medicoEncontrado) {
            // Guardamos todo en sesión
            localStorage.setItem('current_doctor_id', medicoEncontrado.id_medico);
            loginSuccess(medicoEncontrado.nombre_completo, 'medico', medicoEncontrado.id_medico);
        } else {
            showToast('Usuario o clave incorrectos', 'error');
        }
    }

    function handlePatientLogin() {
        const code = qslInput.value.trim().toUpperCase();
        const inputName = nameInput.value.trim().toLowerCase();

        if (code.length < 3 || !inputName) {
            showToast('Complete código y nombre', 'error');
            return;
        }

        const patientsList = JSON.parse(localStorage.getItem('doctor_patients_list') || '[]');
        if (!patientsList.includes(code)) {
            showToast('Datos incorrectos', 'error');
            return;
        }

        const storedName = (localStorage.getItem(`patient_name_${code}`) || '').trim();
        const storedNameLower = storedName.toLowerCase();
        const storedParts = storedNameLower.split(/\s+/);

        if (inputName !== storedNameLower && inputName !== storedParts[0]) {
            showToast('Datos incorrectos', 'error');
            return;
        }

        loginSuccess(storedName, 'paciente', code);
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
});
