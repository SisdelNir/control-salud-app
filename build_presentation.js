// Construye la presentación comercial DR-SISDEL con capturas reales
const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const SS = path.join(__dirname, 'screenshots');
const LOGO = path.join(__dirname, 'dr_sisdel_logo.png');
const LOGO_TEXT = path.join(__dirname, 'dr_sisdel_logo_text_only.png');

// Paleta cromática profesional médica
const COLORS = {
    bgDark: '0A1628',        // Azul marino casi negro
    bgMedium: '0F1F3A',      // Azul marino
    primary: '00A8E8',       // Cyan brillante (de DR-SISDEL)
    accent: '00D4FF',        // Cyan más claro
    success: '10B981',       // Verde médico
    warning: 'F59E0B',       // Ámbar
    danger: 'EF4444',        // Rojo alerta
    white: 'FFFFFF',
    grayLight: 'CBD5E1',
    grayMid: '64748B',
    grayDark: '334155',
    purple: 'A855F7'
};

const FONTS = { head: 'Calibri', body: 'Calibri' };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';  // 13.3" x 7.5"
pres.author = 'DR-SISDEL';
pres.title = 'DR-SISDEL — Presentación Comercial';

const W = 13.33, H = 7.5;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function addBackground(slide, color = COLORS.bgDark) {
    slide.background = { color };
}

function addFooter(slide, pageNumber = '') {
    slide.addShape(pres.shapes.RECTANGLE, {
        x: 0, y: H - 0.35, w: W, h: 0.35,
        fill: { color: COLORS.bgMedium }, line: { color: COLORS.bgMedium }
    });
    slide.addText('DR-SISDEL ·  Clinical Management Software', {
        x: 0.5, y: H - 0.32, w: 6, h: 0.3,
        fontSize: 10, color: COLORS.grayLight, fontFace: FONTS.body, valign: 'middle'
    });
    if (pageNumber) {
        slide.addText(pageNumber, {
            x: W - 1.5, y: H - 0.32, w: 1, h: 0.3,
            fontSize: 10, color: COLORS.accent, fontFace: FONTS.body, valign: 'middle', align: 'right', bold: true
        });
    }
}

function addAccentBar(slide, x, y, color = COLORS.primary) {
    slide.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 0.08, h: 0.45,
        fill: { color }, line: { color }
    });
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 1 — PORTADA
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    // Logo grande centrado
    s.addImage({ path: LOGO, x: (W - 4) / 2, y: 1.5, w: 4, h: 1.5 });

    // Tagline arriba pequeño
    s.addText('CLINICAL MANAGEMENT SOFTWARE', {
        x: 0, y: 3.15, w: W, h: 0.3,
        fontSize: 14, color: COLORS.accent, fontFace: FONTS.body,
        align: 'center', bold: true, charSpacing: 8
    });

    // Línea decorativa horizontal
    s.addShape(pres.shapes.RECTANGLE, {
        x: (W - 2) / 2, y: 3.6, w: 2, h: 0.04,
        fill: { color: COLORS.primary }, line: { color: COLORS.primary }
    });

    // Título principal grande
    s.addText('La Clínica Inteligente', {
        x: 0.5, y: 3.9, w: W - 1, h: 0.9,
        fontSize: 54, color: COLORS.white, fontFace: FONTS.head,
        align: 'center', bold: true
    });

    s.addText('del Futuro, disponible hoy', {
        x: 0.5, y: 4.75, w: W - 1, h: 0.7,
        fontSize: 32, color: COLORS.accent, fontFace: FONTS.head,
        align: 'center', italic: true
    });

    // Subtítulo descripción
    s.addText('Plataforma médica inteligente para clínicas, consultorios y centros médicos\nque buscan más control, productividad y mejores resultados.', {
        x: 1, y: 5.7, w: W - 2, h: 0.8,
        fontSize: 16, color: COLORS.grayLight, fontFace: FONTS.body,
        align: 'center'
    });

    // Badge: 22 países
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: (W - 3.2) / 2, y: 6.6, w: 3.2, h: 0.5,
        fill: { color: COLORS.primary }, line: { color: COLORS.primary }, rectRadius: 0.25
    });
    s.addText('🌎  Disponible en 22 países', {
        x: (W - 3.2) / 2, y: 6.6, w: 3.2, h: 0.5,
        fontSize: 14, color: COLORS.white, fontFace: FONTS.body,
        align: 'center', valign: 'middle', bold: true
    });

    s.addText('Presentación Comercial — 2026', {
        x: 0.5, y: 7.15, w: W - 1, h: 0.25,
        fontSize: 10, color: COLORS.grayMid, fontFace: FONTS.body,
        align: 'center', charSpacing: 4
    });
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 2 — EL PROBLEMA
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.white);

    // Banda lateral izquierda
    s.addShape(pres.shapes.RECTANGLE, {
        x: 0, y: 0, w: 0.5, h: H,
        fill: { color: COLORS.danger }, line: { color: COLORS.danger }
    });

    // Título
    s.addText('🚨  El problema', {
        x: 1, y: 0.6, w: 11, h: 0.55,
        fontSize: 18, color: COLORS.danger, fontFace: FONTS.head,
        bold: true, charSpacing: 4
    });
    s.addText('¿Tu clínica todavía depende de\ncuadernos, llamadas y procesos manuales?', {
        x: 1, y: 1.2, w: 11.5, h: 1.6,
        fontSize: 38, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });

    s.addText('Mientras muchas clínicas pierden tiempo y dan mala atención por desorganización, otras ya están\nautomatizando toda su operación con sistemas modernos que incluyen inteligencia artificial.', {
        x: 1, y: 3, w: 11.5, h: 1,
        fontSize: 16, color: COLORS.grayDark, fontFace: FONTS.body, italic: true
    });

    // 4 cards de dolor
    const pains = [
        { icon: '⏱️', title: 'Tiempo perdido', desc: 'Citas duplicadas, expedientes incompletos y registros en papel.' },
        { icon: '📞', title: 'No-shows constantes', desc: 'Pacientes que no llegan porque nadie les recordó la cita.' },
        { icon: '📂', title: 'Información dispersa', desc: 'Historial clínico fragmentado entre cuadernos y archivos.' },
        { icon: '😞', title: 'Mala experiencia', desc: 'Largas esperas, errores de medicación, baja fidelización.' }
    ];

    const cardW = 2.7, cardH = 2.5, cardY = 4.4, gap = 0.15;
    const totalW = pains.length * cardW + (pains.length - 1) * gap;
    const startX = (W - totalW) / 2;

    pains.forEach((p, i) => {
        const x = startX + i * (cardW + gap);
        s.addShape(pres.shapes.RECTANGLE, {
            x, y: cardY, w: cardW, h: cardH,
            fill: { color: 'FEF2F2' }, line: { color: 'FECACA', width: 1 }
        });
        s.addShape(pres.shapes.RECTANGLE, {
            x, y: cardY, w: cardW, h: 0.08,
            fill: { color: COLORS.danger }, line: { color: COLORS.danger }
        });
        s.addText(p.icon, {
            x, y: cardY + 0.2, w: cardW, h: 0.6,
            fontSize: 34, align: 'center'
        });
        s.addText(p.title, {
            x: x + 0.1, y: cardY + 0.85, w: cardW - 0.2, h: 0.4,
            fontSize: 15, color: COLORS.bgDark, fontFace: FONTS.head, bold: true, align: 'center'
        });
        s.addText(p.desc, {
            x: x + 0.15, y: cardY + 1.3, w: cardW - 0.3, h: 1.1,
            fontSize: 11, color: COLORS.grayDark, fontFace: FONTS.body, align: 'center'
        });
    });

    addFooter(s, '02');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 3 — LA SOLUCIÓN (intro DR-SISDEL)
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    s.addText('🏥  La solución', {
        x: 0.6, y: 0.5, w: 8, h: 0.4,
        fontSize: 14, color: COLORS.accent, fontFace: FONTS.body,
        bold: true, charSpacing: 4
    });

    s.addText('DR-SISDEL llegó para cambiar\nla forma de administrar la salud.', {
        x: 0.6, y: 1, w: 12, h: 1.8,
        fontSize: 40, color: COLORS.white, fontFace: FONTS.head, bold: true
    });

    s.addText('Una plataforma médica inteligente diseñada para clínicas, consultorios y centros médicos que buscan:', {
        x: 0.6, y: 3, w: 12, h: 0.5,
        fontSize: 16, color: COLORS.grayLight, fontFace: FONTS.body, italic: true
    });

    // 4 pilares
    const pillars = [
        { title: 'Más control', desc: 'Visibilidad total de operaciones', color: COLORS.primary },
        { title: 'Más productividad', desc: 'Menos administración, más medicina', color: COLORS.success },
        { title: 'Mejor experiencia', desc: 'Pacientes satisfechos y leales', color: COLORS.purple },
        { title: 'Menos errores', desc: 'Procesos digitales sin papel', color: COLORS.warning }
    ];

    const pW = 2.85, pH = 2.4, pY = 3.7, pGap = 0.2;
    const pTotalW = pillars.length * pW + (pillars.length - 1) * pGap;
    const pStartX = (W - pTotalW) / 2;

    pillars.forEach((p, i) => {
        const x = pStartX + i * (pW + pGap);
        s.addShape(pres.shapes.RECTANGLE, {
            x, y: pY, w: pW, h: pH,
            fill: { color: COLORS.bgMedium }, line: { color: COLORS.grayDark, width: 1 }
        });
        s.addShape(pres.shapes.RECTANGLE, {
            x, y: pY, w: 0.1, h: pH,
            fill: { color: p.color }, line: { color: p.color }
        });
        s.addText(`0${i + 1}`, {
            x: x + 0.3, y: pY + 0.3, w: pW - 0.5, h: 0.7,
            fontSize: 36, color: p.color, fontFace: FONTS.head, bold: true
        });
        s.addText(p.title, {
            x: x + 0.3, y: pY + 1.1, w: pW - 0.5, h: 0.5,
            fontSize: 18, color: COLORS.white, fontFace: FONTS.head, bold: true
        });
        s.addText(p.desc, {
            x: x + 0.3, y: pY + 1.65, w: pW - 0.5, h: 0.7,
            fontSize: 13, color: COLORS.grayLight, fontFace: FONTS.body
        });
    });

    // Cita al pie
    s.addText('"Una sola plataforma. Todos los procesos. Cero papel."', {
        x: 0.6, y: 6.55, w: 12, h: 0.5,
        fontSize: 16, color: COLORS.accent, fontFace: FONTS.head, italic: true, align: 'center'
    });

    addFooter(s, '03');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 4 — ACCESO SEGURO (Login)
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.white);

    addAccentBar(s, 0.6, 0.6, COLORS.primary);
    s.addText('Acceso Seguro y Personalizado', {
        x: 0.8, y: 0.55, w: 9, h: 0.55,
        fontSize: 28, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });
    s.addText('CÓDIGO ÚNICO POR USUARIO  ·  4 ROLES DIFERENCIADOS', {
        x: 0.8, y: 1.05, w: 9, h: 0.3,
        fontSize: 12, color: COLORS.primary, fontFace: FONTS.body, bold: true, charSpacing: 4
    });

    // Captura del login
    s.addImage({
        path: path.join(SS, '08_login.png'),
        x: 0.6, y: 1.7, w: 6.5, h: 4.5,
        sizing: { type: 'contain', w: 6.5, h: 4.5 }
    });

    // Beneficios al lado derecho
    const benefits = [
        { icon: '🔐', t: 'Cifrado por usuario', d: 'Cada médico, admin y paciente recibe un código QSL único y privado.' },
        { icon: '👥', t: '4 roles diferenciados', d: 'Super Admin, Admin de Centro, Médico y Paciente — cada uno ve solo lo suyo.' },
        { icon: '☁️', t: 'Acceso desde cualquier dispositivo', d: 'Sin instalación. Funciona en computadora, tablet o celular.' },
        { icon: '⚡', t: 'Sesión instantánea', d: 'Login en menos de 3 segundos con verificación en la nube.' }
    ];

    const bX = 7.5, bW = 5.3;
    benefits.forEach((b, i) => {
        const y = 1.7 + i * 1.1;
        s.addText(b.icon, {
            x: bX, y, w: 0.6, h: 0.5, fontSize: 26, align: 'center'
        });
        s.addText(b.t, {
            x: bX + 0.65, y, w: bW - 0.65, h: 0.4,
            fontSize: 15, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
        });
        s.addText(b.d, {
            x: bX + 0.65, y: y + 0.4, w: bW - 0.65, h: 0.65,
            fontSize: 11.5, color: COLORS.grayDark, fontFace: FONTS.body
        });
    });

    addFooter(s, '04');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 5 — EXPEDIENTE CLÍNICO DIGITAL
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    s.addText('EXPEDIENTE CLÍNICO DIGITAL', {
        x: 0.6, y: 0.5, w: 10, h: 0.35,
        fontSize: 12, color: COLORS.accent, fontFace: FONTS.body, bold: true, charSpacing: 6
    });
    s.addText('Toda la historia clínica del paciente, en un solo lugar', {
        x: 0.6, y: 0.85, w: 12, h: 0.7,
        fontSize: 26, color: COLORS.white, fontFace: FONTS.head, bold: true
    });

    // Imagen grande a la izquierda
    s.addImage({
        path: path.join(SS, '01_expediente.png'),
        x: 0.5, y: 1.85, w: 7.5, h: 4.7
    });

    // Lista de features a la derecha
    s.addText('Información disponible:', {
        x: 8.3, y: 1.85, w: 4.7, h: 0.4,
        fontSize: 15, color: COLORS.accent, fontFace: FONTS.body, bold: true
    });

    const features = [
        '✓ Datos personales completos',
        '✓ Antecedentes médicos y alergias',
        '✓ Tipo de sangre',
        '✓ Historia clínica detallada',
        '✓ Medicación activa',
        '✓ Resultados de laboratorio',
        '✓ Imágenes médicas (PDF / fotos)',
        '✓ Signos vitales en tiempo real',
        '✓ Contacto y emergencia'
    ];

    features.forEach((f, i) => {
        s.addText(f, {
            x: 8.3, y: 2.4 + i * 0.4, w: 4.7, h: 0.35,
            fontSize: 13, color: COLORS.grayLight, fontFace: FONTS.body
        });
    });

    addFooter(s, '05');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 6 — AGENDA INTELIGENTE
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.white);

    addAccentBar(s, 0.6, 0.6, COLORS.success);
    s.addText('Agenda Virtual Inteligente', {
        x: 0.8, y: 0.55, w: 10, h: 0.55,
        fontSize: 28, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });
    s.addText('CALENDARIO EN LA NUBE  ·  CITAS ONLINE  ·  SINCRONIZACIÓN AUTOMÁTICA', {
        x: 0.8, y: 1.05, w: 11, h: 0.3,
        fontSize: 11, color: COLORS.success, fontFace: FONTS.body, bold: true, charSpacing: 3
    });

    // Imagen del calendario
    s.addImage({
        path: path.join(SS, '02_agenda.png'),
        x: 0.6, y: 1.6, w: 8, h: 5
    });

    // 4 mini-cards de funcionalidad al lado derecho
    const features = [
        { n: '📅', t: 'Vista mensual', d: 'Panorama completo de la semana, mes o día con un solo clic.' },
        { n: '🔄', t: 'Sincronización en la nube', d: 'Tus citas siempre actualizadas, en cualquier dispositivo.' },
        { n: '⚡', t: 'Agendamiento rápido', d: 'Reserva una cita en segundos: paciente nuevo o existente.' },
        { n: '🛡️', t: 'Sin colisiones', d: 'Validación automática de disponibilidad por médico y sala.' }
    ];

    features.forEach((f, i) => {
        const y = 1.6 + i * 1.25;
        s.addShape(pres.shapes.RECTANGLE, {
            x: 8.8, y, w: 4.2, h: 1.1,
            fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1 }
        });
        s.addShape(pres.shapes.RECTANGLE, {
            x: 8.8, y, w: 0.08, h: 1.1,
            fill: { color: COLORS.success }, line: { color: COLORS.success }
        });
        s.addText(f.n, {
            x: 8.95, y: y + 0.1, w: 0.5, h: 0.5, fontSize: 20
        });
        s.addText(f.t, {
            x: 9.5, y: y + 0.1, w: 3.5, h: 0.35,
            fontSize: 14, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
        });
        s.addText(f.d, {
            x: 9.5, y: y + 0.5, w: 3.5, h: 0.55,
            fontSize: 11, color: COLORS.grayDark, fontFace: FONTS.body
        });
    });

    addFooter(s, '06');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 7 — CONSULTA MÉDICA EN VIVO
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    s.addText('CONSULTA MÉDICA EN VIVO', {
        x: 0.6, y: 0.5, w: 10, h: 0.35,
        fontSize: 12, color: COLORS.accent, fontFace: FONTS.body, bold: true, charSpacing: 6
    });
    s.addText('Atiende a tus pacientes con toda la información a la mano', {
        x: 0.6, y: 0.85, w: 12, h: 0.7,
        fontSize: 26, color: COLORS.white, fontFace: FONTS.head, bold: true
    });

    // Imagen grande
    s.addImage({
        path: path.join(SS, '03_consulta.png'),
        x: 0.5, y: 1.85, w: 7.5, h: 4.7
    });

    // Beneficios a la derecha
    s.addText('Funcionalidades clave:', {
        x: 8.3, y: 1.85, w: 4.7, h: 0.4,
        fontSize: 15, color: COLORS.accent, fontFace: FONTS.body, bold: true
    });

    const features = [
        { i: '🔍', t: 'Buscador inteligente', d: 'Por nombre, DPI o teléfono' },
        { i: '⏰', t: 'Citas del día', d: 'Lista priorizada con hora exacta' },
        { i: '📝', t: 'Consulta digital', d: 'Diagnóstico, recetas y referencias' },
        { i: '💊', t: 'Recetas integradas', d: 'Envío automático al paciente' },
        { i: '📊', t: 'Datos vitales en vivo', d: 'Glucosa, presión y peso' },
        { i: '📜', t: 'Historial completo', d: 'Todas las consultas previas' }
    ];

    features.forEach((f, i) => {
        const y = 2.4 + i * 0.7;
        s.addText(f.i, {
            x: 8.3, y, w: 0.5, h: 0.4, fontSize: 18
        });
        s.addText(f.t, {
            x: 8.8, y, w: 4.2, h: 0.35,
            fontSize: 13.5, color: COLORS.white, fontFace: FONTS.head, bold: true
        });
        s.addText(f.d, {
            x: 8.8, y: y + 0.32, w: 4.2, h: 0.3,
            fontSize: 11, color: COLORS.grayLight, fontFace: FONTS.body
        });
    });

    addFooter(s, '07');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 8 — RECORDATORIOS INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.white);

    addAccentBar(s, 0.6, 0.6, COLORS.warning);
    s.addText('Recordatorios Automáticos Inteligentes', {
        x: 0.8, y: 0.55, w: 11, h: 0.55,
        fontSize: 28, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });
    s.addText('5 NIVELES DE ALERTA  ·  WHATSAPP + APP  ·  CERO PACIENTES PERDIDOS', {
        x: 0.8, y: 1.05, w: 11, h: 0.3,
        fontSize: 11, color: COLORS.warning, fontFace: FONTS.body, bold: true, charSpacing: 3
    });

    // Imagen
    s.addImage({
        path: path.join(SS, '04_recordatorios.png'),
        x: 0.6, y: 1.6, w: 7.5, h: 4.8
    });

    // Línea de tiempo de recordatorios
    s.addText('🕐 Cronología de avisos al paciente:', {
        x: 8.4, y: 1.6, w: 4.6, h: 0.4,
        fontSize: 14, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });

    const timeline = [
        { time: '6:00 AM', color: COLORS.warning, msg: '🌅 "Buenos días. Hoy tiene cita."' },
        { time: '4 hrs antes', color: COLORS.success, msg: '🏥 "Su médico inicia consultas."' },
        { time: '2 hrs antes', color: COLORS.primary, msg: '⏰ "Esté preparado."' },
        { time: '1 hr antes', color: 'F97316', msg: '🚨 "¡Última hora!"' },
        { time: '15 min antes', color: COLORS.danger, msg: '⏰ Alerta fullscreen + vibración' },
        { time: 'Su turno', color: COLORS.purple, msg: '⚡ "¡Es su turno ahora!"' }
    ];

    timeline.forEach((t, i) => {
        const y = 2.15 + i * 0.72;
        // Punto de color
        s.addShape(pres.shapes.OVAL, {
            x: 8.45, y: y + 0.05, w: 0.3, h: 0.3,
            fill: { color: t.color }, line: { color: t.color }
        });
        // Hora
        s.addText(t.time, {
            x: 8.85, y, w: 1.4, h: 0.35,
            fontSize: 12, color: t.color, fontFace: FONTS.head, bold: true
        });
        // Mensaje
        s.addText(t.msg, {
            x: 8.85, y: y + 0.32, w: 4.2, h: 0.4,
            fontSize: 10.5, color: COLORS.grayDark, fontFace: FONTS.body
        });
    });

    addFooter(s, '08');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 9 — PORTAL DEL PACIENTE
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    s.addText('PORTAL DEL PACIENTE', {
        x: 0.6, y: 0.5, w: 10, h: 0.35,
        fontSize: 12, color: COLORS.accent, fontFace: FONTS.body, bold: true, charSpacing: 6
    });
    s.addText('Tus pacientes en contacto contigo desde su celular', {
        x: 0.6, y: 0.85, w: 12, h: 0.7,
        fontSize: 26, color: COLORS.white, fontFace: FONTS.head, bold: true
    });

    // Imagen centrada
    s.addImage({
        path: path.join(SS, '07_portal_paciente.png'),
        x: 4, y: 1.7, w: 5.5, h: 4.5
    });

    // 3 features arriba izquierda
    const featLeft = [
        { i: '📅', t: 'Próxima cita visible', d: 'Cuenta regresiva en tiempo real.' },
        { i: '📨', t: 'Bandeja de mensajes', d: 'Avisos directos de la clínica.' }
    ];
    featLeft.forEach((f, i) => {
        const y = 2 + i * 1.4;
        s.addShape(pres.shapes.RECTANGLE, {
            x: 0.5, y, w: 3.3, h: 1.2,
            fill: { color: COLORS.bgMedium }, line: { color: COLORS.grayDark, width: 1 }
        });
        s.addText(f.i, {
            x: 0.6, y: y + 0.15, w: 0.6, h: 0.5, fontSize: 24
        });
        s.addText(f.t, {
            x: 1.2, y: y + 0.15, w: 2.5, h: 0.4,
            fontSize: 13, color: COLORS.accent, fontFace: FONTS.head, bold: true
        });
        s.addText(f.d, {
            x: 1.2, y: y + 0.55, w: 2.5, h: 0.6,
            fontSize: 11, color: COLORS.grayLight, fontFace: FONTS.body
        });
    });

    // 3 features arriba derecha
    const featRight = [
        { i: '💊', t: 'Recetas actuales', d: 'Acceso 24/7 al tratamiento.' },
        { i: '🔔', t: 'Alertas de dosis', d: 'Hora exacta de cada medicamento.' }
    ];
    featRight.forEach((f, i) => {
        const y = 2 + i * 1.4;
        s.addShape(pres.shapes.RECTANGLE, {
            x: 9.7, y, w: 3.2, h: 1.2,
            fill: { color: COLORS.bgMedium }, line: { color: COLORS.grayDark, width: 1 }
        });
        s.addText(f.i, {
            x: 9.8, y: y + 0.15, w: 0.6, h: 0.5, fontSize: 24
        });
        s.addText(f.t, {
            x: 10.4, y: y + 0.15, w: 2.4, h: 0.4,
            fontSize: 13, color: COLORS.accent, fontFace: FONTS.head, bold: true
        });
        s.addText(f.d, {
            x: 10.4, y: y + 0.55, w: 2.4, h: 0.6,
            fontSize: 11, color: COLORS.grayLight, fontFace: FONTS.body
        });
    });

    addFooter(s, '09');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 10 — ADMINISTRACIÓN MULTI-CENTRO
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.white);

    addAccentBar(s, 0.6, 0.6, COLORS.purple);
    s.addText('Administración Multi-Centro', {
        x: 0.8, y: 0.55, w: 11, h: 0.55,
        fontSize: 28, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });
    s.addText('CADENAS DE CLÍNICAS  ·  CONTROL CENTRALIZADO  ·  GESTIÓN DE LICENCIAS', {
        x: 0.8, y: 1.05, w: 11, h: 0.3,
        fontSize: 11, color: COLORS.purple, fontFace: FONTS.body, bold: true, charSpacing: 3
    });

    // Imagen del Módulo Programador
    s.addImage({
        path: path.join(SS, '06_programador.png'),
        x: 0.6, y: 1.6, w: 8, h: 4.8
    });

    // Beneficios para grupos médicos
    s.addText('Diseñado para:', {
        x: 8.85, y: 1.6, w: 4.2, h: 0.4,
        fontSize: 14, color: COLORS.purple, fontFace: FONTS.head, bold: true
    });

    const items = [
        { t: 'Cadenas de clínicas', d: 'Múltiples sedes bajo un único panel' },
        { t: 'Grupos médicos', d: 'Hasta N médicos por centro' },
        { t: 'Franquicias', d: 'Cada centro con su propio admin' },
        { t: 'Marca blanca', d: '6 temas visuales personalizables' },
        { t: '11 privilegios', d: 'Control granular por médico' },
        { t: 'Backups automáticos', d: 'Exportación JSON con un clic' }
    ];

    items.forEach((it, i) => {
        const y = 2.15 + i * 0.72;
        s.addShape(pres.shapes.RECTANGLE, {
            x: 8.85, y, w: 0.08, h: 0.6,
            fill: { color: COLORS.purple }, line: { color: COLORS.purple }
        });
        s.addText(it.t, {
            x: 9.05, y, w: 3.9, h: 0.3,
            fontSize: 13, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
        });
        s.addText(it.d, {
            x: 9.05, y: y + 0.3, w: 3.9, h: 0.3,
            fontSize: 11, color: COLORS.grayDark, fontFace: FONTS.body
        });
    });

    addFooter(s, '10');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 11 — CONFIGURACIÓN PERSONALIZADA
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    s.addText('CONFIGURACIÓN PERSONALIZADA', {
        x: 0.6, y: 0.5, w: 10, h: 0.35,
        fontSize: 12, color: COLORS.accent, fontFace: FONTS.body, bold: true, charSpacing: 6
    });
    s.addText('Tu clínica, tu marca, tus reglas', {
        x: 0.6, y: 0.85, w: 12, h: 0.7,
        fontSize: 26, color: COLORS.white, fontFace: FONTS.head, bold: true
    });

    // Imagen Configuración
    s.addImage({
        path: path.join(SS, '05_configuracion.png'),
        x: 0.5, y: 1.85, w: 7.5, h: 4.7
    });

    // Lista de personalización
    s.addText('Lo que puedes configurar:', {
        x: 8.3, y: 1.85, w: 4.7, h: 0.4,
        fontSize: 15, color: COLORS.accent, fontFace: FONTS.body, bold: true
    });

    const cfg = [
        { i: '🎨', t: 'Temas visuales', d: '6 paletas profesionales' },
        { i: '🔐', t: 'Claves de acceso', d: 'Cambio seguro por médico' },
        { i: '📢', t: 'Canal de notificaciones', d: 'WhatsApp API o app interna' },
        { i: '⏰', t: 'Cola de turnos', d: 'Aviso desde 6 turnos antes' },
        { i: '🌍', t: 'País y zona horaria', d: '22 países preconfigurados' },
        { i: '💰', t: 'Moneda local', d: 'GTQ, MXN, USD, EUR y más' }
    ];

    cfg.forEach((f, i) => {
        const y = 2.4 + i * 0.7;
        s.addText(f.i, {
            x: 8.3, y, w: 0.5, h: 0.4, fontSize: 18
        });
        s.addText(f.t, {
            x: 8.8, y, w: 4.2, h: 0.35,
            fontSize: 13.5, color: COLORS.white, fontFace: FONTS.head, bold: true
        });
        s.addText(f.d, {
            x: 8.8, y: y + 0.32, w: 4.2, h: 0.3,
            fontSize: 11, color: COLORS.grayLight, fontFace: FONTS.body
        });
    });

    addFooter(s, '11');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 12 — RESUMEN DE BENEFICIOS (todo lo que puedes hacer)
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.white);

    addAccentBar(s, 0.6, 0.6, COLORS.primary);
    s.addText('Todo lo que DR-SISDEL hace por ti', {
        x: 0.8, y: 0.55, w: 11, h: 0.55,
        fontSize: 28, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
    });
    s.addText('FUNCIONALIDADES INCLUIDAS  ·  SIN COSTOS OCULTOS  ·  SIN COMPLICACIONES', {
        x: 0.8, y: 1.05, w: 11, h: 0.3,
        fontSize: 11, color: COLORS.primary, fontFace: FONTS.body, bold: true, charSpacing: 3
    });

    // Grid 3x3 de funcionalidades
    const grid = [
        { i: '📅', t: 'Agenda Virtual', d: 'Calendario en la nube con sincronización automática.' },
        { i: '📂', t: 'Expediente Clínico', d: 'Historial completo del paciente en tiempo real.' },
        { i: '💊', t: 'Recetas Digitales', d: 'Envío directo al celular del paciente.' },
        { i: '🩸', t: 'Monitoreo de Vitales', d: 'Glucosa, presión y pacientes crónicos.' },
        { i: '🔔', t: 'Recordatorios Auto', d: 'Notificaciones inteligentes 24/7.' },
        { i: '⚡', t: 'Turnos Inteligentes', d: 'Sin filas, sin tiempos de espera.' },
        { i: '💬', t: 'WhatsApp Masivo', d: 'Comunica a todos con un solo clic.' },
        { i: '☁️', t: 'Sin Internet', d: 'Funciona 100% offline cuando no hay red.' },
        { i: '🌎', t: '22 Países', d: 'Moneda, NIT, zona horaria locales.' }
    ];

    const gW = 4.1, gH = 1.55, gGap = 0.15;
    const gStartX = 0.6, gStartY = 1.7;
    const cols = 3;

    grid.forEach((g, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gStartX + col * (gW + gGap);
        const y = gStartY + row * (gH + gGap);

        s.addShape(pres.shapes.RECTANGLE, {
            x, y, w: gW, h: gH,
            fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1 }
        });
        // Círculo del icono
        s.addShape(pres.shapes.OVAL, {
            x: x + 0.2, y: y + 0.25, w: 0.85, h: 0.85,
            fill: { color: COLORS.primary }, line: { color: COLORS.primary }
        });
        s.addText(g.i, {
            x: x + 0.2, y: y + 0.25, w: 0.85, h: 0.85,
            fontSize: 26, align: 'center', valign: 'middle'
        });
        s.addText(g.t, {
            x: x + 1.15, y: y + 0.25, w: gW - 1.3, h: 0.45,
            fontSize: 15, color: COLORS.bgDark, fontFace: FONTS.head, bold: true
        });
        s.addText(g.d, {
            x: x + 1.15, y: y + 0.7, w: gW - 1.3, h: 0.8,
            fontSize: 11, color: COLORS.grayDark, fontFace: FONTS.body
        });
    });

    addFooter(s, '12');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 13 — RESULTADOS / KPIs
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    s.addText('RESULTADOS QUE TRANSFORMAN TU CLÍNICA', {
        x: 0.6, y: 0.7, w: 12, h: 0.4,
        fontSize: 14, color: COLORS.accent, fontFace: FONTS.body, bold: true, charSpacing: 6, align: 'center'
    });
    s.addText('Lo que tu clínica gana con DR-SISDEL', {
        x: 0.6, y: 1.15, w: 12, h: 0.7,
        fontSize: 32, color: COLORS.white, fontFace: FONTS.head, bold: true, align: 'center'
    });

    // 4 mega-estadísticas
    const stats = [
        { n: '⏱️ −60%', t: 'Tiempo en\nadministración', color: COLORS.primary },
        { n: '📊 +90%', t: 'Pacientes que\nllegan a su cita', color: COLORS.success },
        { n: '😊 +85%', t: 'Satisfacción\ndel paciente', color: COLORS.purple },
        { n: '💰 +40%', t: 'Productividad\nde la clínica', color: COLORS.warning }
    ];

    const sW = 2.9, sH = 3.2, sGap = 0.2, sY = 2.3;
    const sTotalW = stats.length * sW + (stats.length - 1) * sGap;
    const sStartX = (W - sTotalW) / 2;

    stats.forEach((st, i) => {
        const x = sStartX + i * (sW + sGap);
        s.addShape(pres.shapes.RECTANGLE, {
            x, y: sY, w: sW, h: sH,
            fill: { color: COLORS.bgMedium }, line: { color: st.color, width: 2 }
        });
        s.addText(st.n, {
            x: x + 0.1, y: sY + 0.5, w: sW - 0.2, h: 1.4,
            fontSize: 48, color: st.color, fontFace: FONTS.head, bold: true, align: 'center'
        });
        s.addText(st.t, {
            x: x + 0.2, y: sY + 2.05, w: sW - 0.4, h: 1,
            fontSize: 16, color: COLORS.grayLight, fontFace: FONTS.body, align: 'center'
        });
    });

    s.addText('* Estimaciones basadas en clínicas piloto comparadas con métodos tradicionales en papel.', {
        x: 0.6, y: 5.85, w: 12, h: 0.35,
        fontSize: 10, color: COLORS.grayMid, fontFace: FONTS.body, italic: true, align: 'center'
    });

    s.addText('"DR-SISDEL transforma la experiencia desde que el paciente agenda hasta\nel seguimiento posterior a la consulta."', {
        x: 1, y: 6.3, w: 11.3, h: 0.7,
        fontSize: 14, color: COLORS.accent, fontFace: FONTS.head, italic: true, align: 'center'
    });

    addFooter(s, '13');
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 14 — CONTACTO / CIERRE
// ═══════════════════════════════════════════════════════════════════════
{
    const s = pres.addSlide();
    addBackground(s, COLORS.bgDark);

    // Logo arriba
    s.addImage({ path: LOGO, x: (W - 3) / 2, y: 0.8, w: 3, h: 1.1 });

    // Tagline
    s.addText('Para una Clínica Inteligente.', {
        x: 0.5, y: 2.1, w: W - 1, h: 0.7,
        fontSize: 36, color: COLORS.white, fontFace: FONTS.head, bold: true, align: 'center'
    });

    // Línea separadora
    s.addShape(pres.shapes.RECTANGLE, {
        x: (W - 2) / 2, y: 3, w: 2, h: 0.04,
        fill: { color: COLORS.primary }, line: { color: COLORS.primary }
    });

    // CTA
    s.addText('¿Listo para transformar tu clínica?', {
        x: 0.5, y: 3.3, w: W - 1, h: 0.55,
        fontSize: 22, color: COLORS.accent, fontFace: FONTS.body, align: 'center', italic: true
    });

    // 3 cards de contacto
    const contacts = [
        { i: '📱', t: 'WhatsApp', d: '(502) 4509-3379\n(502) 2458-4164' },
        { i: '✉️', t: 'Correo', d: 'sisdelsoluciones@gmail.com' },
        { i: '🌐', t: 'Demostración', d: 'Agenda una demo\ngratuita hoy' }
    ];

    const cW = 3.4, cH = 1.9, cGap = 0.3, cY = 4.4;
    const cTotalW = contacts.length * cW + (contacts.length - 1) * cGap;
    const cStartX = (W - cTotalW) / 2;

    contacts.forEach((c, i) => {
        const x = cStartX + i * (cW + cGap);
        s.addShape(pres.shapes.RECTANGLE, {
            x, y: cY, w: cW, h: cH,
            fill: { color: COLORS.bgMedium }, line: { color: COLORS.primary, width: 1.5 }
        });
        s.addText(c.i, {
            x, y: cY + 0.15, w: cW, h: 0.6,
            fontSize: 32, align: 'center'
        });
        s.addText(c.t, {
            x: x + 0.1, y: cY + 0.85, w: cW - 0.2, h: 0.35,
            fontSize: 16, color: COLORS.accent, fontFace: FONTS.head, bold: true, align: 'center'
        });
        s.addText(c.d, {
            x: x + 0.2, y: cY + 1.2, w: cW - 0.4, h: 0.65,
            fontSize: 12, color: COLORS.white, fontFace: FONTS.body, align: 'center'
        });
    });

    s.addText('© 2026 DR-SISDEL — Todos los derechos reservados.', {
        x: 0.5, y: 6.7, w: W - 1, h: 0.3,
        fontSize: 10, color: COLORS.grayMid, fontFace: FONTS.body, align: 'center', charSpacing: 4
    });
    s.addText('Clinical Management Software · Disponible en 22 países 🌎', {
        x: 0.5, y: 7, w: W - 1, h: 0.3,
        fontSize: 10, color: COLORS.grayMid, fontFace: FONTS.body, align: 'center'
    });
}

// ═══════════════════════════════════════════════════════════════════════
// GUARDAR
// ═══════════════════════════════════════════════════════════════════════
const outPath = path.join('/Users/nir/Desktop', 'DR-SISDEL-Presentacion-Comercial.pptx');
pres.writeFile({ fileName: outPath })
    .then(() => console.log(`✅ Presentación generada: ${outPath}`));
