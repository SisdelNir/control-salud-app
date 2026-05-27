// Captura automatizada de todos los módulos de DR-SISDEL usando Puppeteer
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // ─── Datos demo realistas para que el sistema luzca poblado ───────────
    const seedScript = () => {
        // Credenciales / sesión
        localStorage.setItem('user_real_name', 'Dr. Roberto Gómez');
        localStorage.setItem('user_role', 'medico');
        localStorage.setItem('user_qsl_code', 'MED-MASTER');
        localStorage.setItem('current_doctor_id', 'MED-MASTER');
        localStorage.setItem('id_centro', 'CTRL-001');
        localStorage.setItem('max_medicos', '10');
        localStorage.setItem('nombre_centro', 'Clínica Dr-Sisdel Demo');
        localStorage.setItem('sisdel_tema', 'tema-oscuro');

        // Tabla de médicos
        localStorage.setItem('tabla_medicos', JSON.stringify([
            { id_medico: 'MED-MASTER', nombre_completo: 'Dr. Roberto Gómez', especialidad: 'Medicina General', id_centro: 'CTRL-001', password_hash: btoa('1122'), telefono: '+502 5555-1234', correo: 'roberto@dr-sisdel.com', pais: 'GT', moneda: 'GTQ' },
            { id_medico: 'MED-002', nombre_completo: 'Dra. María López', especialidad: 'Pediatría', id_centro: 'CTRL-001', password_hash: btoa('2222'), telefono: '+502 5555-5678', correo: 'maria@dr-sisdel.com', pais: 'GT', moneda: 'GTQ' },
            { id_medico: 'MED-003', nombre_completo: 'Dr. Carlos Mendoza', especialidad: 'Cardiología', id_centro: 'CTRL-001', password_hash: btoa('3333'), telefono: '+502 5555-9012', correo: 'carlos@dr-sisdel.com', pais: 'GT', moneda: 'GTQ' }
        ]));

        // Tabla de centros
        localStorage.setItem('tabla_centros', JSON.stringify([
            { id_centro: 'CTRL-001', nombre: 'Clínica Dr-Sisdel Demo', admin_nombre: 'Lic. Ana Pérez', admin_code: 'ADMIN-DEMO', max_medicos: 10, pais: 'Guatemala', nit: '12345678-9' },
            { id_centro: 'CTRL-002', nombre: 'Centro Médico Guatemala', admin_nombre: 'Dr. Luis Hernández', admin_code: 'CMG-GT', max_medicos: 15, pais: 'Guatemala', nit: '98765432-1' }
        ]));

        // Lista de pacientes del médico
        const pacientes = ['QSL-001', 'QSL-002', 'QSL-003', 'QSL-004', 'QSL-005', 'QSL-006'];
        localStorage.setItem('doctor_patients_list', JSON.stringify(pacientes));

        // Datos de cada paciente
        const pacientesData = {
            'QSL-001': {
                nombre: 'Juan Carlos Ramírez', telefono: '+502 5555-1111', edad: 45, genero: 'Masculino',
                dpi: '1234567890123', tipoSangre: 'O+', alergias: 'Penicilina',
                motivo: 'Control de Diabetes Tipo 2', email: 'juan@correo.com',
                glucoseEnabled: true, pressureEnabled: true,
                glucoseHistory: [
                    { value: 110, date: '27/05/2026', ts: Date.now() - 3600000 },
                    { value: 125, date: '26/05/2026', ts: Date.now() - 86400000 },
                    { value: 105, date: '25/05/2026', ts: Date.now() - 172800000 },
                    { value: 130, date: '24/05/2026', ts: Date.now() - 259200000 },
                    { value: 118, date: '23/05/2026', ts: Date.now() - 345600000 }
                ],
                meds: [
                    { name: 'Metformina 850mg', dose: '1 tableta', frequency: 12, days: 30, startTime: '08:00' },
                    { name: 'Losartán 50mg', dose: '1 tableta', frequency: 24, days: 30, startTime: '07:00' },
                    { name: 'Atorvastatina 20mg', dose: '1 tableta', frequency: 24, days: 30, startTime: '21:00' }
                ],
                consultations: [
                    { date: '20/05/2026', motivo: 'Control mensual', notas: 'Paciente estable. Glucosa controlada.', glucosa: '110 mg/dL', presion: '130/80', peso: '78 kg', referencias: 'Continuar tratamiento. Control en 30 días.' }
                ]
            },
            'QSL-002': {
                nombre: 'María Fernanda Solís', telefono: '+502 5555-2222', edad: 32, genero: 'Femenino',
                dpi: '2345678901234', tipoSangre: 'A+', alergias: 'Ninguna conocida',
                motivo: 'Control prenatal - Embarazo 28 semanas', email: 'maria.s@correo.com',
                glucoseEnabled: false, pressureEnabled: true,
                meds: [{ name: 'Ácido Fólico 5mg', dose: '1 tableta', frequency: 24, days: 90, startTime: '08:00' }],
                consultations: [{ date: '15/05/2026', motivo: 'Control prenatal', notas: 'Evolución favorable.', presion: '110/70', peso: '65 kg' }]
            },
            'QSL-003': {
                nombre: 'Pedro Alejandro Méndez', telefono: '+502 5555-3333', edad: 58, genero: 'Masculino',
                dpi: '3456789012345', tipoSangre: 'B+', alergias: 'Aspirina',
                motivo: 'Hipertensión arterial', email: 'pedro@correo.com',
                glucoseEnabled: false, pressureEnabled: true,
                meds: [{ name: 'Enalapril 10mg', dose: '1 tableta', frequency: 12, days: 30, startTime: '07:00' }]
            },
            'QSL-004': {
                nombre: 'Ana Sofía Gutiérrez', telefono: '+502 5555-4444', edad: 27, genero: 'Femenino',
                dpi: '4567890123456', tipoSangre: 'O-', alergias: 'Mariscos',
                motivo: 'Consulta general', email: 'ana@correo.com',
                glucoseEnabled: false, pressureEnabled: false
            },
            'QSL-005': {
                nombre: 'Luis Eduardo Castillo', telefono: '+502 5555-5555', edad: 62, genero: 'Masculino',
                dpi: '5678901234567', tipoSangre: 'AB+', alergias: 'Ninguna',
                motivo: 'Diabetes y control cardiovascular', email: 'luis@correo.com',
                glucoseEnabled: true, pressureEnabled: true,
                glucoseHistory: [
                    { value: 145, date: '27/05/2026', ts: Date.now() - 1800000 },
                    { value: 138, date: '26/05/2026', ts: Date.now() - 86400000 }
                ]
            },
            'QSL-006': {
                nombre: 'Carmen Rosa Estrada', telefono: '+502 5555-6666', edad: 41, genero: 'Femenino',
                dpi: '6789012345678', tipoSangre: 'A-', alergias: 'Polen',
                motivo: 'Migraña crónica', email: 'carmen@correo.com',
                glucoseEnabled: false, pressureEnabled: false
            }
        };

        for (const [qsl, data] of Object.entries(pacientesData)) {
            localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(data));
            localStorage.setItem(`patient_name_${qsl}`, data.nombre);
            localStorage.setItem(`active_qsl_${qsl}`, 'true');
        }

        // Citas próximas (hoy y siguientes días)
        const hoy = new Date().toISOString().slice(0, 10);
        const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const pasadoManana = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

        const citas = [
            { qsl: 'QSL-001', name: 'Juan Carlos Ramírez', date: hoy, time: '09:00', motivo: 'Control mensual diabetes' },
            { qsl: 'QSL-002', name: 'María Fernanda Solís', date: hoy, time: '10:30', motivo: 'Control prenatal' },
            { qsl: 'QSL-003', name: 'Pedro Alejandro Méndez', date: hoy, time: '14:00', motivo: 'Seguimiento HTA' },
            { qsl: 'QSL-004', name: 'Ana Sofía Gutiérrez', date: hoy, time: '15:30', motivo: 'Consulta general' },
            { qsl: 'QSL-005', name: 'Luis Eduardo Castillo', date: manana, time: '08:00', motivo: 'Análisis de laboratorio' },
            { qsl: 'QSL-006', name: 'Carmen Rosa Estrada', date: manana, time: '11:00', motivo: 'Migraña - seguimiento' },
            { qsl: 'QSL-001', name: 'Juan Carlos Ramírez', date: pasadoManana, time: '09:30', motivo: 'Control programado' }
        ];
        localStorage.setItem('appointments_data', JSON.stringify(citas));

        // Apariencia: tema oscuro
        localStorage.setItem('sisdel_tema', 'tema-oscuro');
    };

    // ─── 1. Login (set localStorage) ──────────────────────────────────────
    await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle2' });
    await page.evaluate(seedScript);

    // ─── 2. Dashboard ─────────────────────────────────────────────────────
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2500));

    // Helper para capturar
    async function captureSection(sectionName, fileName, extraDelay = 1500) {
        console.log(`📸 Capturando: ${sectionName} → ${fileName}`);
        await page.evaluate((s) => {
            const link = document.querySelector(`li[data-section="${s}"]`);
            if (link) link.click();
        }, sectionName);
        await new Promise(r => setTimeout(r, extraDelay));
        await page.screenshot({
            path: path.join(OUT_DIR, fileName),
            fullPage: false
        });
    }

    // SCREENSHOT 1: Expediente / Overview (lista de pacientes en tabla)
    await captureSection('overview', '01_expediente.png', 2500);

    // SCREENSHOT 2: Agendar Consultas (calendario)
    await captureSection('scheduler', '02_agenda.png', 2500);

    // SCREENSHOT 3: Consulta Médica
    // Primero selecciono un paciente
    await page.evaluate(() => {
        if (window.selectPatientAndGoToConsultation) {
            window.selectPatientAndGoToConsultation('QSL-001');
        }
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(OUT_DIR, '03_consulta.png') });
    console.log('📸 Capturando: consultation → 03_consulta.png');

    // SCREENSHOT 4: Recordatorios / Seguimiento
    await captureSection('reminders', '04_recordatorios.png', 2500);

    // SCREENSHOT 5: Configuración (Datos del médico)
    await captureSection('settings', '05_configuracion.png', 2500);

    // SCREENSHOT 6: Módulo Programador / Admin
    await captureSection('programmer', '06_programador.png', 2500);

    // SCREENSHOT 7: Portal del Paciente (login como paciente)
    console.log('📸 Capturando: Portal del Paciente → 07_portal_paciente.png');
    await page.evaluate(() => {
        localStorage.setItem('user_real_name', 'Juan Carlos Ramírez');
        localStorage.setItem('user_role', 'paciente');
        localStorage.setItem('user_qsl_code', 'QSL-001');
    });
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(OUT_DIR, '07_portal_paciente.png') });

    // SCREENSHOT 8: Pantalla de Login
    console.log('📸 Capturando: Login → 08_login.png');
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(OUT_DIR, '08_login.png') });

    await browser.close();
    console.log('\n✅ TODAS las capturas guardadas en:', OUT_DIR);
})();
