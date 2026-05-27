// DR-SISDEL — Presentación Comercial 2026
// Ejecutar: node make_presentation.js
// Requiere: pptxgenjs (npm install pptxgenjs)

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout  = 'LAYOUT_16x9';
pres.title   = 'DR-SISDEL — Presentación Comercial';
pres.author  = 'DR-SISDEL';
pres.subject = 'Sistema Integral de Gestión Médica';

// ── PALETA ───────────────────────────────────────────────────────────────────
const C = {
  bg:    '0B1E3A',   // fondo oscuro principal
  card:  '0F2740',   // card oscura
  card2: '163252',   // card media
  card3: '1E3D63',   // card clara
  cyan:  '00C8E8',   // acento primario
  green: '10B981',   // acento verde / salud
  blue:  '3B82F6',   // acento azul
  yel:   'F59E0B',   // acento amarillo / alerta
  red:   'EF4444',   // rojo
  white: 'FFFFFF',
  ltxt:  'CBD5E1',   // texto claro
  muted: '64748B',   // texto apagado
  phBg:  '0A1E35',   // placeholder background
  phBdr: '1E4976',   // placeholder border
};

const LOGO = '/Users/nir/Desktop/DR-SISDEL/dr_sisdel_logo.png';

// Fábrica de sombras (evita reutilizar objeto y corrupción)
const sh = () => ({ type: "outer", blur: 10, offset: 4, angle: 135, color: "000000", opacity: 0.22 });
const shSm = () => ({ type: "outer", blur: 5, offset: 2, angle: 135, color: "000000", opacity: 0.15 });

// ── HELPERS ──────────────────────────────────────────────────────────────────

function addLogo(slide, x = 9.3, y = 0.13) {
  slide.addImage({ path: LOGO, x, y, w: 0.42, h: 0.42 });
}

// Placa de módulo coloreada (badge superior izquierdo)
function addBadge(slide, text, x, y, w, color) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.38,
    fill: { color: C.card2 },
    line: { color, width: 1.2 }
  });
  slide.addText(text, {
    x, y, w, h: 0.38,
    fontSize: 10, fontFace: 'Calibri', bold: true,
    color, align: 'center', valign: 'middle', margin: 0
  });
}

// Placeholder de captura de pantalla (browser mockup)
function screenPlaceholder(slide, x, y, w, h, label) {
  // sombra exterior manual
  slide.addShape(pres.shapes.RECTANGLE, {
    x: x + 0.06, y: y + 0.06, w, h,
    fill: { color: '000000', transparency: 80 },
    line: { color: '000000', width: 0 }
  });
  // panel principal
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: C.phBg },
    line: { color: C.phBdr, width: 1.5 }
  });
  // barra del navegador
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.33,
    fill: { color: '061628' },
    line: { color: C.phBdr, width: 0 }
  });
  // puntos macOS
  const dots = [['FF5F56', 0.12], ['FFBD2E', 0.27], ['27C93F', 0.42]];
  dots.forEach(([col, dx]) => {
    slide.addShape(pres.shapes.OVAL, {
      x: x + dx, y: y + 0.115, w: 0.105, h: 0.105,
      fill: { color: col }, line: { color: col }
    });
  });
  // barra de URL
  const urlW = w - 1.3;
  slide.addShape(pres.shapes.RECTANGLE, {
    x: x + 0.62, y: y + 0.09, w: urlW, h: 0.155,
    fill: { color: '0E2647' },
    line: { color: '2A5280', width: 0.5 }
  });
  slide.addText('localhost:3000/dashboard', {
    x: x + 0.62, y: y + 0.09, w: urlW, h: 0.155,
    fontSize: 7, color: C.muted, align: 'center', valign: 'middle',
    fontFace: 'Calibri'
  });
  // contenido central del placeholder
  const midY = y + h * 0.42;
  slide.addText('📸', {   // 📸
    x, y: midY - 0.25, w, h: 0.45,
    fontSize: 26, align: 'center'
  });
  slide.addText(label, {
    x: x + 0.2, y: midY + 0.25, w: w - 0.4, h: 0.42,
    fontSize: 11.5, bold: true, color: '4A90D9', align: 'center',
    fontFace: 'Calibri'
  });
  slide.addText('Insertar captura de pantalla del módulo', {
    x: x + 0.2, y: midY + 0.68, w: w - 0.4, h: 0.28,
    fontSize: 8.5, color: '2D5A8E', italic: true, align: 'center',
    fontFace: 'Calibri'
  });
}

// Ítem de característica con punto acento
function featItem(slide, x, y, text, accent) {
  slide.addShape(pres.shapes.OVAL, {
    x, y: y + 0.08, w: 0.14, h: 0.14,
    fill: { color: accent }, line: { color: accent }
  });
  slide.addText(text, {
    x: x + 0.23, y, w: 3.9, h: 0.32,
    fontSize: 11, color: C.ltxt, fontFace: 'Calibri',
    valign: 'middle', margin: 0
  });
}

// Tarjeta simple con título e ítem list
function addCard(slide, x, y, w, h, title, items, accentColor) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: C.card },
    line: { color: accentColor, width: 1.2 },
    shadow: shSm()
  });
  // barra de acento izquierda
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 0.065, h,
    fill: { color: accentColor }, line: { color: accentColor }
  });
  slide.addText(title, {
    x: x + 0.15, y: y + 0.1, w: w - 0.25, h: 0.38,
    fontSize: 13, fontFace: 'Arial Black', bold: true, color: accentColor, margin: 0
  });
  items.forEach((item, i) => {
    slide.addShape(pres.shapes.OVAL, {
      x: x + 0.15, y: y + 0.6 + i * 0.38 + 0.09, w: 0.11, h: 0.11,
      fill: { color: accentColor }, line: { color: accentColor }
    });
    slide.addText(item, {
      x: x + 0.34, y: y + 0.6 + i * 0.38, w: w - 0.45, h: 0.34,
      fontSize: 10.5, color: C.ltxt, fontFace: 'Calibri', valign: 'middle', margin: 0
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — PORTADA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };

  // Formas decorativas derecha
  s.addShape(pres.shapes.OVAL, {
    x: 6.0, y: -1.2, w: 5.5, h: 5.5,
    fill: { color: '003A50' }, line: { color: '005F7A', width: 2 }
  });
  s.addShape(pres.shapes.OVAL, {
    x: 7.5, y: 3.2, w: 3.0, h: 3.0,
    fill: { color: '0A3028' }, line: { color: '00604A', width: 1.5 }
  });
  // Cruz médica decorativa
  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.35, y: 1.1, w: 0.1, h: 1.3,
    fill: { color: C.cyan }, line: { color: C.cyan }
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 7.7, y: 1.7, w: 1.4, h: 0.1,
    fill: { color: C.cyan }, line: { color: C.cyan }
  });
  // Puntos decorativos
  [[7.2,0.5],[9.5,2.8],[6.8,4.2],[9.0,0.9]].forEach(([px,py]) => {
    s.addShape(pres.shapes.OVAL, {
      x: px, y: py, w: 0.09, h: 0.09,
      fill: { color: C.cyan }, line: { color: C.cyan }
    });
  });

  // Logo
  s.addImage({ path: LOGO, x: 0.45, y: 0.28, w: 1.15, h: 1.15 });

  // Nombre del sistema
  s.addText('DR-SISDEL', {
    x: 1.75, y: 0.22, w: 5.5, h: 0.78,
    fontSize: 44, fontFace: 'Arial Black', bold: true, color: C.white, margin: 0
  });
  s.addText('Sistema Integral de Gestión Médica en la Nube', {
    x: 1.77, y: 0.95, w: 5.5, h: 0.37,
    fontSize: 12, fontFace: 'Calibri', color: C.cyan, margin: 0
  });

  // Línea separadora
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.45, y: 1.55, w: 4.0, h: 0.045,
    fill: { color: C.cyan }, line: { color: C.cyan }
  });

  // Pregunta principal
  s.addText('¿Tu clínica todavía depende\nde cuadernos y procesos manuales?', {
    x: 0.45, y: 1.72, w: 5.8, h: 1.0,
    fontSize: 21, fontFace: 'Arial Black', bold: true, color: C.white
  });

  // Descripción
  s.addText('La plataforma médica inteligente que automatiza toda tu operación clínica — gestiona citas, expedientes, recetas y recordatorios en un solo lugar, desde cualquier dispositivo.', {
    x: 0.45, y: 2.88, w: 5.3, h: 0.95,
    fontSize: 12.5, fontFace: 'Calibri', color: C.ltxt
  });

  // Chips de características
  const chips = [
    ['Agenda Virtual', C.blue],
    ['Expediente Digital', C.cyan],
    ['Recordatorios IA', C.green],
    ['22 Países', C.yel]
  ];
  chips.forEach(([text, col], i) => {
    const cx = 0.45 + i * 2.2;
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: 4.06, w: 2.05, h: 0.37,
      fill: { color: C.card2 }, line: { color: col, width: 1.2 }
    });
    s.addText(text, {
      x: cx, y: 4.06, w: 2.05, h: 0.37,
      fontSize: 10.5, fontFace: 'Calibri', bold: true,
      color: col, align: 'center', valign: 'middle', margin: 0
    });
  });

  // Slogan final
  s.addText('Para una Clínica Inteligente.', {
    x: 0.45, y: 4.65, w: 5.5, h: 0.4,
    fontSize: 14, fontFace: 'Calibri', color: C.muted, italic: true
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — EL PROBLEMA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  s.addText('EL PROBLEMA QUE ENFRENTAN LAS CLÍNICAS HOY', {
    x: 0.5, y: 0.22, w: 9.0, h: 0.6,
    fontSize: 20, fontFace: 'Arial Black', bold: true,
    color: C.white, align: 'center'
  });

  // 3 columnas de problemas
  const problems = [
    {
      emoji: '📋', title: 'Desorganización', color: C.red,
      items: ['Cuadernos y papeles sueltos', 'Citas perdidas o duplicadas', 'Expedientes incompletos', 'Información inaccesible']
    },
    {
      emoji: '⏰', title: 'Tiempo Perdido', color: C.yel,
      items: ['Llamadas manuales de recordatorio', 'Largas filas de espera', 'Pacientes que no llegan (no-shows)', 'Administración lenta y manual']
    },
    {
      emoji: '😔', title: 'Paciente Insatisfecho', color: C.blue,
      items: ['No sabe cuándo es su turno', 'Olvida sus medicamentos', 'Sin acceso a su expediente', 'Mala experiencia general']
    }
  ];

  problems.forEach((p, i) => {
    const x = 0.38 + i * 3.12;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.05, w: 2.95, h: 4.08,
      fill: { color: C.card },
      line: { color: p.color, width: 1.2 },
      shadow: sh()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.05, w: 2.95, h: 0.06,
      fill: { color: p.color }, line: { color: p.color }
    });
    s.addText(p.emoji, {
      x, y: 1.18, w: 2.95, h: 0.55,
      fontSize: 28, align: 'center'
    });
    s.addText(p.title, {
      x: x + 0.12, y: 1.78, w: 2.7, h: 0.45,
      fontSize: 15, fontFace: 'Arial Black', bold: true,
      color: p.color, align: 'center'
    });
    p.items.forEach((item, j) => {
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.18, y: 2.42 + j * 0.44 + 0.1, w: 0.1, h: 0.1,
        fill: { color: p.color }, line: { color: p.color }
      });
      s.addText(item, {
        x: x + 0.35, y: 2.42 + j * 0.44, w: 2.45, h: 0.38,
        fontSize: 10.5, color: C.ltxt, fontFace: 'Calibri', valign: 'middle', margin: 0
      });
    });
  });

  s.addText('✨  Con DR-SISDEL, todos estos problemas desaparecen — en una sola plataforma.', {
    x: 0.5, y: 5.2, w: 9.0, h: 0.3,
    fontSize: 11.5, fontFace: 'Calibri', bold: true,
    color: C.green, align: 'center'
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — QUÉ ES DR-SISDEL (visión general)
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  s.addText('¿QUÉ ES DR-SISDEL?', {
    x: 0.5, y: 0.18, w: 9.0, h: 0.6,
    fontSize: 22, fontFace: 'Arial Black', bold: true, color: C.white, align: 'center'
  });
  s.addText('Una plataforma médica all-in-one diseñada para clínicas, consultorios y centros médicos modernos.', {
    x: 1.0, y: 0.82, w: 8.0, h: 0.4,
    fontSize: 13, fontFace: 'Calibri', color: C.ltxt, align: 'center'
  });

  const pillars = [
    { icon: '🗓️', title: 'Agenda Inteligente', desc: 'Calendario digital con sincronización en la nube y recordatorios automáticos multi-nivel', color: C.blue },
    { icon: '📂', title: 'Expediente Clínico', desc: 'Historial médico completo, recetas digitales, laboratorios y monitoreo de vitales', color: C.cyan },
    { icon: '📱', title: 'Portal del Paciente', desc: 'El paciente accede a sus citas, medicamentos y alertas desde su celular sin instalar nada', color: C.green },
    { icon: '🌎', title: 'Multi-Centro & 22 Países', desc: 'Soporta múltiples clínicas, médicos y países con configuración fiscal y horaria local', color: C.yel }
  ];

  pillars.forEach((p, i) => {
    const col = i % 2 === 0 ? 0.4 : 5.2;
    const row = i < 2 ? 1.5 : 3.4;
    s.addShape(pres.shapes.RECTANGLE, {
      x: col, y: row, w: 4.3, h: 1.65,
      fill: { color: C.card },
      line: { color: p.color, width: 1.2 },
      shadow: shSm()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: col, y: row, w: 0.07, h: 1.65,
      fill: { color: p.color }, line: { color: p.color }
    });
    s.addText(p.icon + '  ' + p.title, {
      x: col + 0.18, y: row + 0.12, w: 4.0, h: 0.42,
      fontSize: 14, fontFace: 'Arial Black', bold: true, color: p.color, margin: 0
    });
    s.addText(p.desc, {
      x: col + 0.18, y: row + 0.58, w: 4.0, h: 0.88,
      fontSize: 11, fontFace: 'Calibri', color: C.ltxt, valign: 'top', margin: 0
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDES 4-9 — MÓDULOS (feature slides con placeholder)
// ════════════════════════════════════════════════════════════════════════════

const moduleSlides = [
  {
    badge: '🗓️  AGENDA VIRTUAL', badgeColor: C.blue,
    title: 'Agenda Virtual\nInteligente',
    desc: 'Gestiona todas tus citas médicas desde cualquier dispositivo, en tiempo real y sincronizado automáticamente con la nube.',
    items: [
      'Calendario mensual interactivo',
      'Agendamiento por hora y media hora',
      'Pacientes nuevos o existentes',
      'Sincronización automática en la nube',
      'Fuerza de sincronización manual disponible',
    ],
    accent: C.blue,
    label: 'Módulo: Agenda / Scheduler'
  },
  {
    badge: '📂  EXPEDIENTE CLÍNICO', badgeColor: C.cyan,
    title: 'Expediente Clínico\nCompleto',
    desc: 'Accede al historial médico completo del paciente en segundos: datos personales, diagnósticos, consultas previas y laboratorios.',
    items: [
      'Ficha del paciente con 15+ campos',
      'Historial de consultas ilimitado',
      'Resultados de laboratorio (imagen & PDF)',
      'Antecedentes, alergias y tipo de sangre',
      'Monitoreo de glucosa y presión arterial',
    ],
    accent: C.cyan,
    label: 'Módulo: Expediente del Paciente'
  },
  {
    badge: '🩺  CONSULTA MÉDICA', badgeColor: C.green,
    title: 'Consulta Médica\nDigital',
    desc: 'Registra cada consulta con todos los datos clínicos relevantes y genera la receta digital que llega al celular del paciente al instante.',
    items: [
      'Registro de motivo, diagnóstico y evolucón',
      'Control de peso, glucosa y presión',
      'Receta médica digital multi-medicamento',
      'Referencias y solicitudes de exámenes',
      'Sincronización instantánea con el paciente',
    ],
    accent: C.green,
    label: 'Módulo: Consulta Médica'
  },
  {
    badge: '📱  PORTAL DEL PACIENTE', badgeColor: '8B5CF6',
    title: 'Portal del Paciente\nPersonalizado',
    desc: 'El paciente accede desde su celular a toda su información clínica — sin descargar ninguna app, solo con su código QSL.',
    items: [
      'Bandeja de alertas y mensajes clínicos',
      'Recetas activas con horario de dosis',
      'Historial de citas y próxima consulta',
      'Reportar niveles de glucosa y presión',
      'Datos personales y contacto de emergencia',
    ],
    accent: '8B5CF6',
    label: 'Módulo: Portal del Paciente'
  },
  {
    badge: '💬  MENSAJERÍA MASIVA', badgeColor: C.yel,
    title: 'Mensajería Masiva\nen 1 Clic',
    desc: 'Comunica a todos tus pacientes al mismo tiempo con mensajes personalizados — por la plataforma o por WhatsApp.',
    items: [
      'Enviar a todos, a los de hoy o a una lista',
      'Personalización por nombre del paciente',
      'Canal: sistema interno o WhatsApp API',
      'Historial completo de mensajes enviados',
      'Alertas clínicas urgentes con pantalla completa',
    ],
    accent: C.yel,
    label: 'Módulo: Mensajería Masiva'
  },
  {
    badge: '🩸  MONITOREO DE VITALES', badgeColor: 'EC4899',
    title: 'Monitoreo de Signos\nVitales en Tiempo Real',
    desc: 'El paciente reporta sus niveles de glucosa y presión arterial periódicamente desde su celular. El médico monitorea el historial completo.',
    items: [
      'Glucosa: historial hasta 200 lecturas',
      'Presión arterial con registro continuo',
      'Activar/desactivar por paciente individual',
      'Filtro por rango de fechas',
      'Valores visibles en consulta e inmediato',
    ],
    accent: 'EC4899',
    label: 'Módulo: Monitoreo de Vitales'
  }
];

moduleSlides.forEach((mod) => {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  // Barra vertical de acento izquierda
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.06, h: 5.625,
    fill: { color: mod.accent }, line: { color: mod.accent }
  });

  // Badge de módulo
  addBadge(s, mod.badge, 0.2, 0.17, 2.8, mod.accent);

  // Título del módulo
  s.addText(mod.title, {
    x: 0.2, y: 0.65, w: 4.55, h: 0.9,
    fontSize: 21, fontFace: 'Arial Black', bold: true, color: C.white
  });

  // Descripción
  s.addText(mod.desc, {
    x: 0.2, y: 1.62, w: 4.55, h: 0.82,
    fontSize: 11.5, fontFace: 'Calibri', color: C.ltxt
  });

  // Línea separadora delgada
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.2, y: 2.5, w: 4.3, h: 0.035,
    fill: { color: C.card3 }, line: { color: C.card3 }
  });

  // Ítems de característica
  mod.items.forEach((item, i) => {
    featItem(s, 0.2, 2.6 + i * 0.42, item, mod.accent);
  });

  // Placeholder de captura de pantalla
  screenPlaceholder(s, 5.05, 0.45, 4.65, 4.85, mod.label);
});

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — RECORDATORIOS INTELIGENTES (slide especial - timeline)
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  s.addText('RECORDATORIOS INTELIGENTES DE CITA', {
    x: 0.5, y: 0.18, w: 9.0, h: 0.6,
    fontSize: 20, fontFace: 'Arial Black', bold: true, color: C.white, align: 'center'
  });
  s.addText('El sistema acompaña al paciente desde que amanece hasta que entra al consultorio — sin intervención manual.', {
    x: 1.0, y: 0.8, w: 8.0, h: 0.38,
    fontSize: 12, fontFace: 'Calibri', color: C.ltxt, align: 'center'
  });

  // Timeline horizontal de 5 puntos
  const steps = [
    { time: '6:00 AM',     emoji: '🌅', label: 'Buenos Días',    desc: '"Recuerde su cita\nmédica hoy"', color: C.blue },
    { time: '2 horas antes', emoji: '⏰',      label: 'Alerta Media',       desc: '"Esté preparado,\nfaltan 2 horas"', color: C.cyan },
    { time: '1 hora antes',  emoji: '🚨', label: 'Última Hora',   desc: '"Aproxímese\nal consultorio"', color: C.yel },
    { time: '15 minutos',    emoji: '🔴', label: 'Pantalla Roja',      desc: 'Alerta fullscreen\n+ vibración', color: C.red },
    { time: 'Su turno',      emoji: '⚡',       label: '¡Es su turno!', desc: '"Diríjase al\nconsultorio ahora"', color: C.green },
  ];

  // Línea horizontal del timeline
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 2.82, w: 8.8, h: 0.06,
    fill: { color: C.card3 }, line: { color: C.card3 }
  });

  steps.forEach((st, i) => {
    const x = 0.5 + i * 1.88;
    // Circulo del timeline
    s.addShape(pres.shapes.OVAL, {
      x: x + 0.55, y: 2.65, w: 0.36, h: 0.36,
      fill: { color: st.color }, line: { color: st.color }, shadow: shSm()
    });
    // Emoji encima del círculo
    s.addText(st.emoji, {
      x, y: 1.55, w: 1.5, h: 0.55,
      fontSize: 22, align: 'center'
    });
    // Hora
    s.addText(st.time, {
      x, y: 1.25, w: 1.5, h: 0.35,
      fontSize: 9.5, fontFace: 'Calibri', bold: true, color: st.color, align: 'center'
    });
    // Label
    s.addText(st.label, {
      x, y: 3.12, w: 1.5, h: 0.38,
      fontSize: 10.5, fontFace: 'Arial Black', bold: true, color: st.color, align: 'center'
    });
    // Descripción
    s.addText(st.desc, {
      x, y: 3.55, w: 1.5, h: 0.65,
      fontSize: 9.5, fontFace: 'Calibri', color: C.ltxt, align: 'center'
    });
  });

  // Nota de turno en cola
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.45, y: 4.38, w: 9.1, h: 0.78,
    fill: { color: C.card }, line: { color: C.green, width: 1 }
  });
  s.addText('🔔  Sistema de Turnos en Cola: "Faltan 6" → "Faltan 4" → "Faltan 2" → "¡Es su turno!" — el paciente sabe exactamente cuándo moverse.', {
    x: 0.62, y: 4.4, w: 8.8, h: 0.72,
    fontSize: 11.5, fontFace: 'Calibri', color: C.green, valign: 'middle'
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — NUBE + OFFLINE + SEGURIDAD
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  s.addText('TECNOLOGÍA QUE TRABAJA POR TI', {
    x: 0.5, y: 0.18, w: 9.0, h: 0.6,
    fontSize: 20, fontFace: 'Arial Black', bold: true, color: C.white, align: 'center'
  });

  // 3 grandes stats
  const stats = [
    { num: '100%', label: 'Cloud en tiempo real', icon: '☁️', color: C.cyan },
    { num: 'Offline', label: 'Funciona sin internet', icon: '📵', color: C.green },
    { num: '4 Roles', label: 'Control total de acceso', icon: '🔐', color: C.blue },
  ];
  stats.forEach((st, i) => {
    const x = 0.4 + i * 3.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 0.98, w: 2.95, h: 1.55,
      fill: { color: C.card }, line: { color: st.color, width: 1.2 }, shadow: sh()
    });
    s.addText(st.icon, {
      x, y: 1.05, w: 2.95, h: 0.48,
      fontSize: 24, align: 'center'
    });
    s.addText(st.num, {
      x, y: 1.56, w: 2.95, h: 0.52,
      fontSize: 20, fontFace: 'Arial Black', bold: true, color: st.color, align: 'center'
    });
    s.addText(st.label, {
      x: x + 0.1, y: 2.08, w: 2.75, h: 0.3,
      fontSize: 10, fontFace: 'Calibri', color: C.ltxt, align: 'center'
    });
  });

  // Características de infraestructura (2 columnas)
  const infra = [
    ['✅ Sincronización bidireccional Firebase/Firestore',  '✅ Algoritmo merge sin conflictos de datos'],
    ['✅ Backfill automático al reconectarse',            '✅ Backup completo exportable en JSON'],
    ['✅ 6 sincronizaciones paralelas al iniciar',             '✅ Badge visual de estado de sincronización'],
    ['✅ Exportación & restauración desde archivo JSON',   '✅ Contraseñas cifradas por médico'],
  ];
  infra.forEach((row, i) => {
    row.forEach((text, j) => {
      s.addText(text, {
        x: 0.4 + j * 4.9, y: 2.58 + i * 0.44, w: 4.65, h: 0.38,
        fontSize: 11, fontFace: 'Calibri', color: C.ltxt, valign: 'middle', margin: 0
      });
    });
  });

  // Barra inferior
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 4.35, w: 9.2, h: 0.88,
    fill: { color: C.card }, line: { color: C.cyan, width: 1 }
  });
  s.addText('🌐  Disponible desde cualquier navegador moderno — sin instalaciones, sin costos de hardware, sin mantenimiento de servidores locales.', {
    x: 0.6, y: 4.38, w: 8.8, h: 0.82,
    fontSize: 12, fontFace: 'Calibri', bold: true, color: C.cyan, valign: 'middle'
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — 22 PAÍSES
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  s.addText('🌎  DISPONIBLE EN 22 PAÍSES', {
    x: 0.5, y: 0.18, w: 9.0, h: 0.6,
    fontSize: 20, fontFace: 'Arial Black', bold: true, color: C.white, align: 'center'
  });
  s.addText('Cada país con su moneda, zona horaria, formato de fecha, identificación fiscal y prefijo telefónico preconfigurados.', {
    x: 0.8, y: 0.8, w: 8.4, h: 0.38,
    fontSize: 12, fontFace: 'Calibri', color: C.ltxt, align: 'center'
  });

  // Países en 2 bloques visuales
  const latam = [
    'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia',
    'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'Guatemala',
    'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay',
    'Perú', 'Puerto Rico', 'Rep. Dominicana', 'Uruguay', 'Venezuela'
  ];
  const others = ['Canadá', 'España', 'Estados Unidos'];

  // Panel LATAM
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 1.3, w: 6.1, h: 3.85,
    fill: { color: C.card }, line: { color: C.green, width: 1.2 }, shadow: sh()
  });
  s.addText('🌎 América Latina — 20 países', {
    x: 0.5, y: 1.38, w: 5.8, h: 0.4,
    fontSize: 12, fontFace: 'Arial Black', bold: true, color: C.green
  });
  // Grid de países (5 col x 4 rows)
  latam.forEach((pais, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5 + col * 1.47, y: 1.88 + row * 0.67, w: 1.4, h: 0.55,
      fill: { color: C.card2 }, line: { color: '1E4976', width: 0.5 }
    });
    s.addText(pais, {
      x: 0.5 + col * 1.47, y: 1.88 + row * 0.67, w: 1.4, h: 0.55,
      fontSize: 9.5, fontFace: 'Calibri', color: C.ltxt, align: 'center', valign: 'middle'
    });
  });

  // Panel Otros
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.6, y: 1.3, w: 3.05, h: 3.85,
    fill: { color: C.card }, line: { color: C.cyan, width: 1.2 }, shadow: sh()
  });
  s.addText('🇺🇸🇨🇦🇪🇸  Otros mercados', {
    x: 6.72, y: 1.38, w: 2.8, h: 0.42,
    fontSize: 11, fontFace: 'Arial Black', bold: true, color: C.cyan
  });
  others.forEach((pais, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.72, y: 1.92 + i * 0.65, w: 2.8, h: 0.55,
      fill: { color: C.card2 }, line: { color: '1E4976', width: 0.5 }
    });
    s.addText(pais, {
      x: 6.72, y: 1.92 + i * 0.65, w: 2.8, h: 0.55,
      fontSize: 11, fontFace: 'Calibri', color: C.ltxt, align: 'center', valign: 'middle'
    });
  });

  // Configuraciones por país
  const configs = ['💰 Moneda local', '🕒 Zona horaria', '🗓 Formato de fecha', '🆔 ID Fiscal (NIT/RUC/RUT...)', '📞 Prefijo teléfonico'];
  s.addText(configs.join('   •   '), {
    x: 0.35, y: 5.2, w: 9.3, h: 0.32,
    fontSize: 10, fontFace: 'Calibri', color: C.muted, align: 'center'
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — ¿POR QUÉ DR-SISDEL? (6 diferenciadores)
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addLogo(s);

  s.addText('¿POR QUÉ DR-SISDEL?', {
    x: 0.5, y: 0.18, w: 9.0, h: 0.6,
    fontSize: 22, fontFace: 'Arial Black', bold: true, color: C.white, align: 'center'
  });

  const diffs = [
    { icon: '🧠', title: 'Recordatorios Únicos', desc: '5 niveles de alerta desde el amanecer — eliminamos los no-shows', color: C.cyan },
    { icon: '☁️', title: 'Cloud + Offline', desc: 'Funciona sin internet y se sincroniza al reconectarse automáticamente', color: C.green },
    { icon: '🌎', title: '22 Países Listos', desc: 'Moneda, horario e impuestos preconfigurados — desplegable hoy', color: C.yel },
    { icon: '🎨', title: 'Marca Blanca', desc: '6 temas visuales por clínica sincronizados en la nube — vende tu propio sistema', color: '8B5CF6' },
    { icon: '💻', title: 'Sin Instalación', desc: 'Corre en cualquier navegador — celular, tablet o computadora sin apps', color: C.blue },
    { icon: '📊', title: 'Matriz de Privilegios', desc: '11 permisos granulares en 5 categorías — control total por médico', color: 'EC4899' },
  ];

  diffs.forEach((d, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.38 + col * 3.15;
    const y = 1.05 + row * 2.12;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 2.98, h: 1.88,
      fill: { color: C.card }, line: { color: d.color, width: 1.2 }, shadow: shSm()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 2.98, h: 0.065,
      fill: { color: d.color }, line: { color: d.color }
    });
    s.addText(d.icon + '  ' + d.title, {
      x: x + 0.12, y: y + 0.12, w: 2.7, h: 0.45,
      fontSize: 13, fontFace: 'Arial Black', bold: true, color: d.color, margin: 0
    });
    s.addText(d.desc, {
      x: x + 0.12, y: y + 0.62, w: 2.75, h: 1.1,
      fontSize: 10.5, fontFace: 'Calibri', color: C.ltxt, valign: 'top', margin: 0
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 14 — CTA / CIERRE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };

  // Formas decorativas (mismo estilo que portada)
  s.addShape(pres.shapes.OVAL, {
    x: -0.5, y: 3.5, w: 4.5, h: 4.5,
    fill: { color: '003A50' }, line: { color: '005F7A', width: 1.5 }
  });
  s.addShape(pres.shapes.OVAL, {
    x: 7.8, y: -1.0, w: 4.0, h: 4.0,
    fill: { color: '0A3028' }, line: { color: '006B50', width: 1.5 }
  });

  // Logo centrado grande
  s.addImage({ path: LOGO, x: 4.3, y: 0.55, w: 1.4, h: 1.4 });

  // Título
  s.addText('DR-SISDEL', {
    x: 1.0, y: 2.05, w: 8.0, h: 0.88,
    fontSize: 42, fontFace: 'Arial Black', bold: true,
    color: C.white, align: 'center', margin: 0
  });

  // Slogan
  s.addText('Para una Clínica Inteligente.', {
    x: 1.0, y: 2.95, w: 8.0, h: 0.5,
    fontSize: 18, fontFace: 'Calibri', color: C.cyan,
    align: 'center', italic: true
  });

  // Línea
  s.addShape(pres.shapes.RECTANGLE, {
    x: 3.5, y: 3.6, w: 3.0, h: 0.045,
    fill: { color: C.cyan }, line: { color: C.cyan }
  });

  // Llamado a acción
  s.addText('Solicita tu demostración gratuita hoy', {
    x: 1.0, y: 3.75, w: 8.0, h: 0.45,
    fontSize: 15, fontFace: 'Calibri', bold: true,
    color: C.ltxt, align: 'center'
  });

  // Chips finales
  const finalChips = [
    ['💻 Sin instalación', C.blue],
    ['🌎 22 países', C.green],
    ['🔒 Datos seguros', C.cyan],
    ['⚡ Acceso inmediato', C.yel]
  ];
  finalChips.forEach(([text, col], i) => {
    const cx = 1.0 + i * 2.05;
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: 4.35, w: 1.95, h: 0.38,
      fill: { color: C.card2 }, line: { color: col, width: 1.2 }
    });
    s.addText(text, {
      x: cx, y: 4.35, w: 1.95, h: 0.38,
      fontSize: 10, fontFace: 'Calibri', bold: true,
      color: col, align: 'center', valign: 'middle', margin: 0
    });
  });

  s.addText('dr-sisdel.com  |  ✉️ info@dr-sisdel.com  |  📞 +000 000-0000', {
    x: 1.0, y: 4.95, w: 8.0, h: 0.38,
    fontSize: 10.5, fontFace: 'Calibri', color: C.muted, align: 'center'
  });
}

// ── GENERAR ARCHIVO ───────────────────────────────────────────────────────────
const OUTPUT = '/Users/nir/Desktop/DR-SISDEL/DR-SISDEL-Presentacion-Comercial.pptx';
pres.writeFile({ fileName: OUTPUT })
  .then(() => console.log('✅  Presentacion generada:\n   ' + OUTPUT))
  .catch(err => { console.error('❌  Error:', err); process.exit(1); });
