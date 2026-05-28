// =============================================================
//  DR-SISDEL — Página pública de agendamiento remoto
// =============================================================
// Flujo:
//   1. Lee ?d=<doctor_id> del query string
//   2. Carga info pública del médico + config de booking
//   3. Si está habilitado, muestra calendario limitado a `months_ahead`
//   4. Al elegir día → muestra slots disponibles (calculados en backend Firestore)
//   5. Al elegir slot → modal con formulario (nombre, teléfono, motivo)
//   6. Submit → crea paciente + cita → pantalla de confirmación
// =============================================================
(function() {
    'use strict';

    const app = document.getElementById('app');
    const params = new URLSearchParams(window.location.search);
    const doctorId = params.get('d') || params.get('doctor') || '';

    if (!doctorId) {
        renderError('Falta el parámetro del médico en el link. Pide al médico que te comparta el link correcto.');
        return;
    }

    let doctorInfo = null;
    let bookingCfg = null;
    let viewMonth = new Date(); // mes que se muestra en el calendario
    viewMonth.setDate(1);
    let selectedDate = null;
    let selectedTime = null;
    let availableSlots = [];

    function fmtISO(d) {
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    function todayISO() { return fmtISO(new Date()); }

    function renderError(msg) {
        app.innerHTML = `
            <div class="card">
                <h1>⚠️ No disponible</h1>
                <p>${msg}</p>
            </div>`;
    }

    async function bootstrap() {
        try {
            // 1) info del médico
            const infoR = await fetch(`/api/booking/${encodeURIComponent(doctorId)}/info`);
            const infoJ = await infoR.json();
            if (!infoJ.success) {
                renderError('No se encontró el médico solicitado. Verifica el link.');
                return;
            }
            doctorInfo = infoJ.doctor;

            // 2) config de booking
            const cfgR = await fetch(`/api/booking/${encodeURIComponent(doctorId)}/config`);
            const cfgJ = await cfgR.json();
            if (!cfgJ.success) {
                renderError('Error al cargar la configuración de agenda.');
                return;
            }
            bookingCfg = cfgJ.config;
            if (!bookingCfg.enabled) {
                renderError('La agenda remota de este médico no está activa en este momento. Contáctalo directamente para programar tu cita.');
                return;
            }
            renderHomeView();
        } catch (e) {
            console.error(e);
            renderError('No se pudo conectar con el servidor. Revisa tu conexión a internet.');
        }
    }

    function renderHomeView() {
        const dur = bookingCfg.session_duration;
        const meses = bookingCfg.months_ahead;
        app.innerHTML = `
            <div class="card">
                <h1>📅 Agendar Cita</h1>
                <h2 style="color:white;font-size:20px;margin-top:6px;">${doctorInfo.nombre}</h2>
                ${doctorInfo.especialidad ? `<p style="color:rgba(255,255,255,0.55);margin-top:3px;">${doctorInfo.especialidad}</p>` : ''}
                <p style="margin-top:14px;">Cada cita dura <b style="color:#22d3ee;">${dur} minutos</b>. Puedes agendar hasta <b style="color:#22d3ee;">${meses} mes${meses>1?'es':''}</b> adelante.</p>
            </div>
            <div class="card">
                <h3>1. Selecciona un día</h3>
                <div id="cal-container"></div>
            </div>
            <div class="card" id="slots-card" style="display:none;">
                <h3 id="slots-title">2. Selecciona una hora</h3>
                <div id="slots-container"></div>
            </div>`;
        renderCalendar();
    }

    function renderCalendar() {
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const dayHeaders = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();
        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const todayDate = today.getDate(), todayMonth = today.getMonth(), todayYear = today.getFullYear();

        // Rango permitido: hoy → hoy + months_ahead
        const maxDate = new Date(today);
        maxDate.setMonth(maxDate.getMonth() + bookingCfg.months_ahead);

        // ¿Puedo ir al mes anterior? Solo si NO estoy en el mes actual (no se puede agendar en el pasado)
        const canPrev = (year > todayYear) || (year === todayYear && month > todayMonth);
        const canNext = (year < maxDate.getFullYear()) || (year === maxDate.getFullYear() && month < maxDate.getMonth());

        // Mapeo día → tiene_horario
        const weekKeys = ['sun','mon','tue','wed','thu','fri','sat'];

        let cellsHtml = '';
        // Cells vacías antes del día 1
        for (let i = 0; i < firstDayOfWeek; i++) cellsHtml += '<div class="cal-cell empty"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const cellDate = new Date(year, month, d);
            const cellIso = fmtISO(cellDate);
            const weekday = weekKeys[cellDate.getDay()];
            const hasSchedule = (bookingCfg.weekly_schedule[weekday] || []).length > 0;
            const isPast = cellDate < new Date(todayYear, todayMonth, todayDate);
            const isToday = (d === todayDate && month === todayMonth && year === todayYear);
            const isAfterMax = cellDate > maxDate;
            const disabled = isPast || isAfterMax || !hasSchedule;
            const classes = ['cal-cell'];
            if (disabled) classes.push('disabled');
            else classes.push('available');
            if (isToday) classes.push('today');
            if (selectedDate === cellIso) classes.push('selected');
            cellsHtml += `<div class="${classes.join(' ')}" ${!disabled ? `onclick="window._selectDay('${cellIso}')"` : ''}>${d}</div>`;
        }

        document.getElementById('cal-container').innerHTML = `
            <div class="cal-nav">
                <button onclick="window._navMonth(-1)" ${!canPrev?'disabled':''}>‹</button>
                <h3 style="margin:0;color:#22d3ee;">${monthNames[month]} ${year}</h3>
                <button onclick="window._navMonth(1)" ${!canNext?'disabled':''}>›</button>
            </div>
            <div class="cal-grid">
                ${dayHeaders.map(d => `<div class="cal-head">${d}</div>`).join('')}
                ${cellsHtml}
            </div>`;
    }

    window._navMonth = function(delta) {
        viewMonth.setMonth(viewMonth.getMonth() + delta);
        renderCalendar();
    };

    // Carga slots disponibles para una fecha. Se reutiliza tanto al elegir
    // un día como tras una reserva (para refrescar y mostrar lo que queda).
    async function loadSlotsForDay(iso, opts) {
        opts = opts || {};
        const card = document.getElementById('slots-card');
        const cont = document.getElementById('slots-container');
        const title = document.getElementById('slots-title');
        if (card) card.style.display = 'block';
        if (title) {
            const d = new Date(iso + 'T12:00:00');
            title.textContent = `2. Selecciona una hora — ${d.toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'long' })}`;
        }
        if (cont && !opts.silent) cont.innerHTML = '<div class="loading"><div class="spinner"></div><p>Buscando horarios disponibles...</p></div>';

        try {
            // cache: 'no-store' evita que el navegador devuelva slots viejos
            const r = await fetch(`/api/booking/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(iso)}`, { cache: 'no-store' });
            const j = await r.json();
            availableSlots = j.success ? (j.slots || []) : [];
            const totalGen = j.total_generated || 0;
            const occCount = j.occupied_count || 0;

            if (availableSlots.length === 0) {
                let msg;
                if (totalGen === 0) {
                    msg = 'El médico no tiene horarios configurados para este día. Elige otro día.';
                } else if (occCount >= totalGen) {
                    msg = `Todos los horarios de este día (${totalGen}) ya están ocupados. Elige otro día.`;
                } else {
                    msg = 'No hay horarios disponibles para este día. Elige otro día.';
                }
                cont.innerHTML = `<p style="text-align:center;padding:24px;color:rgba(255,255,255,0.55);">${msg}</p>`;
                return;
            }
            const statusLine = (occCount > 0)
                ? `<p style="font-size:12px;color:rgba(255,255,255,0.45);margin:0 0 10px;">✓ Mostrando ${availableSlots.length} de ${totalGen} horarios · ${occCount} ya reservado${occCount===1?'':'s'} (no se muestran)</p>`
                : `<p style="font-size:12px;color:rgba(255,255,255,0.45);margin:0 0 10px;">✓ ${availableSlots.length} horarios disponibles</p>`;
            cont.innerHTML = statusLine + `<div class="slots-grid">${availableSlots.map(s => `<button class="slot-btn" onclick="window._selectSlot('${s}')">${s}</button>`).join('')}</div>`;
        } catch (e) {
            console.error(e);
            cont.innerHTML = `<p style="color:#f87171;padding:14px;">Error al cargar horarios. Intenta de nuevo.</p>`;
        }
    }

    window._selectDay = async function(iso) {
        selectedDate = iso;
        selectedTime = null;
        renderCalendar();
        await loadSlotsForDay(iso);
    };
    window._reloadCurrentDaySlots = async function() {
        if (selectedDate) await loadSlotsForDay(selectedDate, { silent: true });
    };

    window._selectSlot = function(time) {
        selectedTime = time;
        openBookingModal();
    };

    function openBookingModal() {
        const d = new Date(selectedDate + 'T12:00:00');
        const fechaLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'booking-modal';
        overlay.innerHTML = `
            <div class="modal-box">
                <h2 style="color:#22d3ee;">Confirmar Cita</h2>
                <p style="margin-bottom:16px;">${fechaLabel} <br><b style="color:white;font-size:18px;">${selectedTime}</b></p>
                <div class="field">
                    <label>Nombre completo *</label>
                    <input type="text" id="bk-nombre" placeholder="Ej. Juan Pérez García" autocomplete="name" autofocus>
                </div>
                <div class="field">
                    <label>Teléfono de contacto *</label>
                    <input type="tel" id="bk-telefono" placeholder="Ej. +502 5555-1234" autocomplete="tel" inputmode="tel">
                </div>
                <div class="field">
                    <label>Motivo de la consulta (opcional)</label>
                    <textarea id="bk-motivo" placeholder="Ej. Consulta general, dolor de cabeza, control..."></textarea>
                </div>
                <div style="display:flex; gap:10px; margin-top:18px;">
                    <button class="btn-secondary" style="flex:1;" onclick="window._closeBookingModal()">Cancelar</button>
                    <button class="btn-primary" style="flex:2;" onclick="window._submitBooking()">✓ Confirmar Cita</button>
                </div>
                <p id="bk-error" style="color:#f87171; font-size:12px; margin-top:10px; display:none;"></p>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) window._closeBookingModal(); });
    }

    window._closeBookingModal = function() {
        const m = document.getElementById('booking-modal');
        if (m) m.remove();
    };

    window._submitBooking = async function() {
        const nombre = document.getElementById('bk-nombre')?.value.trim();
        const telefono = document.getElementById('bk-telefono')?.value.trim();
        const motivo = document.getElementById('bk-motivo')?.value.trim() || '';
        const errEl = document.getElementById('bk-error');
        const setErr = (msg) => { if (errEl) { errEl.style.display = 'block'; errEl.textContent = msg; } };

        if (!nombre || nombre.length < 3) return setErr('⚠️ Ingresa tu nombre completo.');
        if (!telefono || telefono.replace(/\D/g, '').length < 6) return setErr('⚠️ Ingresa un teléfono válido.');

        const btns = document.querySelectorAll('#booking-modal button');
        btns.forEach(b => b.disabled = true);
        if (errEl) errEl.style.display = 'none';
        const primary = document.querySelector('#booking-modal .btn-primary');
        if (primary) primary.textContent = 'Reservando...';

        try {
            const r = await fetch(`/api/booking/${encodeURIComponent(doctorId)}/appointment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fecha: selectedDate,
                    hora: selectedTime,
                    paciente_nombre: nombre,
                    paciente_telefono: telefono,
                    motivo
                })
            });
            const j = await r.json();
            if (!j.success) {
                const msg = j.error || 'No se pudo reservar. Intenta de nuevo.';
                setErr(msg);
                // Si el slot fue tomado entre selección y confirmación,
                // cerrar el modal y refrescar los slots disponibles para
                // que el paciente vea inmediatamente lo que queda.
                if (/ya fue tomado|no está disponible/i.test(msg)) {
                    setTimeout(() => {
                        window._closeBookingModal();
                        window._reloadCurrentDaySlots();
                    }, 1800);
                } else {
                    btns.forEach(b => b.disabled = false);
                    if (primary) primary.textContent = '✓ Confirmar Cita';
                }
                return;
            }
            window._closeBookingModal();
            renderSuccess(nombre);
        } catch (e) {
            console.error(e);
            setErr('Error de conexión. Intenta de nuevo.');
            btns.forEach(b => b.disabled = false);
            if (primary) primary.textContent = '✓ Confirmar Cita';
        }
    };

    function renderSuccess(nombre) {
        const d = new Date(selectedDate + 'T12:00:00');
        const fechaLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        app.innerHTML = `
            <div class="card success-box">
                <div class="success-icon">✅</div>
                <h1 style="color:#10b981;">¡Cita Reservada!</h1>
                <p style="margin-top:12px;color:white;font-size:16px;">
                    Gracias, <b>${nombre}</b>.<br>
                    Tu cita con <b>${doctorInfo.nombre}</b> quedó confirmada para:
                </p>
                <p style="margin-top:16px;padding:14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;font-size:18px;font-weight:700;color:#10b981;">
                    📅 ${fechaLabel}<br>
                    ⏰ ${selectedTime}
                </p>
                <p style="margin-top:18px;color:rgba(255,255,255,0.55);font-size:13px;">
                    Te enviaremos un recordatorio por SMS / WhatsApp antes de tu cita.
                </p>
                <button class="btn-secondary" style="margin-top:20px;" onclick="location.reload()">
                    Agendar otra cita
                </button>
            </div>`;
    }

    // Esperar a que firebaseDb esté disponible
    if (window.firebaseDb) {
        bootstrap();
    } else {
        const check = setInterval(() => {
            if (window.firebaseDb) {
                clearInterval(check);
                bootstrap();
            }
        }, 100);
    }
})();
