// Captura adicional: pantallas clínicas usando un médico regular (no MED-MASTER)
const puppeteer = require('puppeteer');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'screenshots');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // ─── Datos demo: ahora como médico regular MED-002 ────────────────────
    const seedScript = () => {
        localStorage.setItem('user_real_name', 'Dra. María López');
        localStorage.setItem('user_role', 'medico');
        localStorage.setItem('user_qsl_code', 'MED-002');
        localStorage.setItem('current_doctor_id', 'MED-002');
        localStorage.setItem('id_centro', 'CTRL-001');
        localStorage.setItem('max_medicos', '10');
        localStorage.setItem('nombre_centro', 'Clínica Dr-Sisdel Demo');
        localStorage.setItem('sisdel_tema', 'tema-oscuro');

        localStorage.setItem('tabla_medicos', JSON.stringify([
            { id_medico: 'MED-MASTER', nombre_completo: 'Dr. Roberto Gómez', especialidad: 'Medicina General', id_centro: 'CTRL-001', password_hash: btoa('1122') },
            { id_medico: 'MED-002', nombre_completo: 'Dra. María López', especialidad: 'Medicina Interna', id_centro: 'CTRL-001', password_hash: btoa('2222'), telefono: '+502 5555-5678', correo: 'maria@dr-sisdel.com', pais: 'GT', moneda: 'GTQ' }
        ]));

        const pacientes = ['QSL-001', 'QSL-002', 'QSL-003', 'QSL-004', 'QSL-005', 'QSL-006'];
        localStorage.setItem('doctor_patients_list_MED-002', JSON.stringify(pacientes));
        localStorage.setItem('doctor_patients_list', JSON.stringify(pacientes));

        const pacientesData = {
            'QSL-001': {
                nombre: 'Juan Carlos Ramírez', telefono: '+502 5555-1111', edad: 45, genero: 'Masculino',
                dpi: '1234567890123', tipoSangre: 'O+', alergias: 'Penicilina',
                motivo: 'Control de Diabetes Tipo 2', email: 'juan@correo.com',
                glucoseEnabled: true, pressureEnabled: true,
                antPersonales: 'Diabetes Mellitus tipo 2 diagnosticada en 2018. Hipertensión arterial.',
                medicamentos: 'Metformina 850mg c/12h, Losartán 50mg c/24h',
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
                    { date: '20/05/2026', motivo: 'Control mensual', notas: 'Paciente estable. Glucosa controlada con tratamiento actual.', glucosa: '110 mg/dL', presion: '130/80', peso: '78 kg', referencias: 'Continuar tratamiento. BHC y QS en próxima cita. Control en 30 días.', historia: 'Paciente refiere adherencia al tratamiento. Sin episodios de hipoglucemia.' },
                    { date: '20/04/2026', motivo: 'Control trimestral', notas: 'HbA1c 7.2% - mejoría respecto al trimestre anterior.', glucosa: '118 mg/dL', presion: '128/82' }
                ]
            },
            'QSL-002': {
                nombre: 'María Fernanda Solís', telefono: '+502 5555-2222', edad: 32, genero: 'Femenino',
                dpi: '2345678901234', tipoSangre: 'A+', alergias: 'Ninguna conocida',
                motivo: 'Control prenatal - Embarazo 28 semanas', email: 'maria.s@correo.com',
                glucoseEnabled: false, pressureEnabled: true,
                meds: [{ name: 'Ácido Fólico 5mg', dose: '1 tableta', frequency: 24, days: 90, startTime: '08:00' }]
            },
            'QSL-003': {
                nombre: 'Pedro Alejandro Méndez', telefono: '+502 5555-3333', edad: 58, genero: 'Masculino',
                motivo: 'Hipertensión arterial', glucoseEnabled: false, pressureEnabled: true
            },
            'QSL-004': {
                nombre: 'Ana Sofía Gutiérrez', telefono: '+502 5555-4444', edad: 27, genero: 'Femenino',
                motivo: 'Consulta general', glucoseEnabled: false, pressureEnabled: false
            },
            'QSL-005': {
                nombre: 'Luis Eduardo Castillo', telefono: '+502 5555-5555', edad: 62, genero: 'Masculino',
                motivo: 'Diabetes y control cardiovascular', glucoseEnabled: true, pressureEnabled: true
            },
            'QSL-006': {
                nombre: 'Carmen Rosa Estrada', telefono: '+502 5555-6666', edad: 41, genero: 'Femenino',
                motivo: 'Migraña crónica', glucoseEnabled: false, pressureEnabled: false
            }
        };

        for (const [qsl, data] of Object.entries(pacientesData)) {
            localStorage.setItem(`patient_data_${qsl}`, JSON.stringify(data));
            localStorage.setItem(`patient_name_${qsl}`, data.nombre);
            localStorage.setItem(`active_qsl_${qsl}`, 'true');
        }

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
        localStorage.setItem('appointments_data_MED-002', JSON.stringify(citas));
        localStorage.setItem('appointments_data', JSON.stringify(citas));
    };

    // ─── Login como médico regular ────────────────────────────────────────
    await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle2' });
    await page.evaluate(seedScript);
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // SCREENSHOT: Expediente / Datos del paciente (con paciente seleccionado)
    console.log('📸 Capturando: Expediente del Paciente → 01_expediente.png');
    await page.evaluate(() => {
        if (window.selectPatientAndGoToConsultation) {
            window.selectPatientAndGoToConsultation('QSL-001');
        }
    });
    await new Promise(r => setTimeout(r, 2000));
    // Click en Datos del Paciente (overview)
    await page.evaluate(() => {
        const link = document.querySelector('li[data-section="overview"]');
        if (link) link.click();
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(OUT_DIR, '01_expediente.png') });

    // SCREENSHOT: Consulta Médica
    console.log('📸 Capturando: Consulta Médica → 03_consulta.png');
    await page.evaluate(() => {
        const link = document.querySelector('li[data-section="consultation"]');
        if (link) link.click();
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(OUT_DIR, '03_consulta.png') });

    // SCREENSHOT: Recordatorios / Seguimiento
    console.log('📸 Capturando: Recordatorios → 04_recordatorios.png');
    await page.evaluate(() => {
        const link = document.querySelector('li[data-section="reminders"]');
        if (link) link.click();
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(OUT_DIR, '04_recordatorios.png') });

    // SCREENSHOT EXTRA: Lista de Pacientes (modal/overlay)
    console.log('📸 Capturando: Lista de Pacientes → 09_lista_pacientes.png');
    await page.evaluate(() => {
        const link = document.querySelector('li[data-section="scheduler"]');
        if (link) link.click();
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => {
        if (window.showPatientList) window.showPatientList();
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(OUT_DIR, '09_lista_pacientes.png') });

    await browser.close();
    console.log('\n✅ Capturas clínicas completadas');
})();
