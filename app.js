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
        const name = docNameInput.value.trim();
        const pass = docPassInput.value.trim();

        if (!name || !pass) {
            showToast('Complete nombre y clave', 'error');
            return;
        }

        const storedName = localStorage.getItem('doctor_master_name') || 'Médico';
        let storedPass = 'S2026GUATE';
        try {
            if (localStorage.getItem('doctor_master_pass')) {
                storedPass = atob(localStorage.getItem('doctor_master_pass'));
            }
        } catch (e) {
            // Ignorar error de descifrado y usar default
        }

        if (
            (name.toUpperCase() === storedName.toUpperCase() && pass === storedPass) ||
            (name.toUpperCase() === 'MEDICO' && pass === 'S2026GUATE') // Fallback maestro
        ) {
            loginSuccess(storedName, 'medico', 'MASTER');
        } else {
            showToast('Nombre o clave incorrectos', 'error');
        }
    }

    function handlePatientLogin() {
        const code = qslInput.value.trim().toUpperCase();
        const name = nameInput.value.trim();

        if (code.length < 3 || !name) {
            showToast('Complete código y nombre', 'error');
            return;
        }

        // Guardar relación QSL-Nombre para que el médico la vea
        localStorage.setItem(`patient_name_${code}`, name);

        loginSuccess(name, 'paciente', code);
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
