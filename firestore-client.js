// ============================================================
//  CLIENTE FIRESTORE — reemplaza todos los endpoints REST de server.js
// ============================================================
// Cada función expone una API tipo "fetch().json()" para minimizar el
// trabajo de migración: en vez de cambiar la lógica de llamadas, sólo
// re-mapeamos `fetch('/api/...')` → `firestoreClient.<endpoint>(...)`.
//
// Para usar este cliente, el HTML debe cargar previamente:
//   - https://www.gstatic.com/firebasejs/X.Y.Z/firebase-app-compat.js
//   - https://www.gstatic.com/firebasejs/X.Y.Z/firebase-firestore-compat.js
//   - firebase-config.js (inicializa firebase.firestore() en window.firebaseDb)
//
// Después de cargado, dispone de window.firestoreClient con métodos.
// ============================================================
(function() {
    const COLLECTIONS = {
        pacientes: 'pacientes',
        centros_medicos: 'centros_medicos',
        medicos: 'medicos',
        citas: 'citas',
        alertas_sistema: 'alertas_sistema',
        historial_mensajes: 'historial_mensajes',
        settings: 'settings',
        finanzas_transacciones: 'finanzas_transacciones'
    };

    function db() {
        const d = window.firebaseDb;
        if (!d) throw new Error('Firestore no inicializado. Verifica que firebase-config.js se haya cargado.');
        return d;
    }
    function fv() { return window.firebaseFieldValue; }
    function serverTimestamp() { return fv().serverTimestamp(); }

    // ----- PACIENTES -----
    async function verifyPatient(qsl) {
        const doc = await db().collection(COLLECTIONS.pacientes).doc(qsl).get();
        if (!doc.exists) return { success: false };
        const data = (doc.data().data) || {};
        return { success: true, name: data.nombre_completo || qsl };
    }

    async function getPatient(qsl) {
        const doc = await db().collection(COLLECTIONS.pacientes).doc(qsl).get();
        if (!doc.exists) return { success: false, data: { illness: '', meds: [] } };
        const docData = doc.data();
        return { success: true, data: docData.data || {}, alerts_enabled: docData.alerts_enabled || false };
    }

    async function savePatient(qsl, payload) {
        const { data, doctor_id } = payload;
        const update = { data, updated_at: serverTimestamp() };
        if (doctor_id) update.doctor_id = doctor_id;
        if (data && data.nombre_completo) update.nombre = data.nombre_completo;
        const ref = db().collection(COLLECTIONS.pacientes).doc(qsl);
        const existing = await ref.get();
        if (!existing.exists) update.created_at = serverTimestamp();
        await ref.set(update, { merge: true });
        return { success: true };
    }

    async function listPatients({ doctor_id, since } = {}) {
        let q = db().collection(COLLECTIONS.pacientes);
        if (doctor_id && doctor_id !== 'MED-MASTER') q = q.where('doctor_id', '==', doctor_id);
        const snap = await q.get();
        const sinceMs = since ? Number(since) : 0;
        const patients = snap.docs
            .filter(d => !d.data().deleted)
            .map(d => {
                const dd = d.data();
                return {
                    qsl: d.id,
                    doctor_id: dd.doctor_id || null,
                    nombre: dd.nombre || (dd.data && dd.data.nombre_completo) || null,
                    data: dd.data || {},
                    alerts_enabled: !!dd.alerts_enabled,
                    updated_at: dd.updated_at?.toMillis?.() || dd.created_at?.toMillis?.() || 0
                };
            })
            .filter(p => p.updated_at >= sinceMs);
        return { success: true, patients, server_time: Date.now() };
    }

    async function togglePatientAlerts(qsl, enabled) {
        await db().collection(COLLECTIONS.pacientes).doc(qsl).set({ alerts_enabled: !!enabled }, { merge: true });
        return { success: true };
    }

    // ----- LOGIN -----
    async function login(pass) {
        // Master password
        if (pass === '1122') {
            return { success: true, role: 'medico', id: 'MED-MASTER', name: 'Administrador Principal' };
        }
        // Admin general (admin_code de un centro)
        const centroSnap = await db().collection(COLLECTIONS.centros_medicos)
            .where('admin_code', '==', pass).limit(1).get();
        if (!centroSnap.empty) {
            const centro = centroSnap.docs[0].data();
            return {
                success: true,
                role: 'admin_general',
                id_centro: centro.id_centro,
                name: 'Administrador Central',
                nombre_centro: centro.nombre,
                max_medicos: centro.max_medicos
            };
        }
        // Médico
        const passHash = btoa(pass);
        const medSnap = await db().collection(COLLECTIONS.medicos).get();
        let medico = null;
        medSnap.forEach(docSnap => {
            if (medico) return;
            const d = docSnap.data().data || {};
            if (
                (d.usuario && d.usuario.toUpperCase() === pass.toUpperCase()) ||
                d.password_hash === passHash
            ) {
                medico = { id_medico: docSnap.id, data: d };
            }
        });
        if (medico) {
            return { success: true, role: 'medico', id: medico.id_medico, name: medico.data.nombre_completo, data: medico.data };
        }
        return { success: false };
    }

    // ----- MÉDICOS -----
    async function listMedicos() {
        const snap = await db().collection(COLLECTIONS.medicos).get();
        const medicos = snap.docs
            .filter(d => !d.data().deleted)
            .map(d => ({ id_medico: d.id, ...(d.data().data || {}), privileges: d.data().privileges || {} }));
        return { success: true, medicos };
    }

    async function saveMedico(id, data) {
        await db().collection(COLLECTIONS.medicos).doc(id).set(
            { data, created_at: serverTimestamp() },
            { merge: true }
        );
        return { success: true };
    }

    async function deleteMedico(id) {
        await db().collection(COLLECTIONS.medicos).doc(id).set(
            { deleted: true, deleted_at: serverTimestamp() },
            { merge: true }
        );
        return { success: true };
    }

    async function updateMedicoPrivileges(id, privileges) {
        await db().collection(COLLECTIONS.medicos).doc(id).set({ privileges: privileges || {} }, { merge: true });
        return { success: true };
    }

    // ----- CENTROS -----
    async function listCentros() {
        const snap = await db().collection(COLLECTIONS.centros_medicos).get();
        const centros = snap.docs.filter(d => !d.data().deleted).map(d => d.data());
        return { success: true, centros };
    }

    async function saveCentro(id, body) {
        const { nombre, admin_code, max_medicos, admin_nombre, admin_id, admin_telefono, admin_correo, pais, nit, moneda, timezone, dateLocale } = body;
        await db().collection(COLLECTIONS.centros_medicos).doc(id).set({
            id_centro: id, nombre, admin_code, max_medicos, admin_nombre, admin_id, admin_telefono, admin_correo,
            pais, nit, moneda, timezone, date_locale: dateLocale,
            created_at: serverTimestamp()
        }, { merge: true });
        return { success: true };
    }

    async function deleteCentro(id) {
        await db().collection(COLLECTIONS.centros_medicos).doc(id).set(
            { deleted: true, deleted_at: serverTimestamp() },
            { merge: true }
        );
        return { success: true };
    }

    // ----- LISTA DE PACIENTES (Hoy + Mañana) — fuente única de verdad -----
    // Reglas decididas con el usuario:
    //   - Scoping: cada médico ve SOLO sus propias citas (doctor_id estricto).
    //   - Rotación: una cita expira 24h después de su hora (no a medianoche).
    //   - Horizonte: desde "ahora - 24h grace" hasta "fin de mañana 23:59 MX".
    // Timezone fija: America/Mexico_City (UTC-6 sin DST desde 2022).
    const MX_OFFSET_MS = 6 * 3600 * 1000;
    function nowInMx() {
        const nowUtc = Date.now();
        const d = new Date(nowUtc - MX_OFFSET_MS);
        return { nowUtc, y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
    }
    function citaToUtcMs(fecha, hora) {
        if (!fecha) return NaN;
        const parts = String(fecha).slice(0, 10).split('-');
        if (parts.length !== 3) return NaN;
        const [y, m, d] = parts.map(Number);
        const [hh, mm] = String(hora || '00:00').split(':').map(Number);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
        return Date.UTC(y, m - 1, d, (hh || 0) + 6, mm || 0, 0);
    }
    async function enrichCita(cita, todayMxMidnightUtcMs) {
        const qsl = cita.qsl_code;
        let pData = {};
        try {
            const pSnap = await db().collection(COLLECTIONS.pacientes).doc(qsl).get();
            if (pSnap.exists) pData = (pSnap.data().data || {});
        } catch (_) { /* paciente sin doc → datos vacíos */ }
        const consults = pData.consultations || [];
        const lastConsult = consults[consults.length - 1];
        let lastRx = 'Sin recetas previas';
        if (pData.meds && pData.meds.length > 0) {
            lastRx = '🏥 Ver Receta Asignada';
        } else if (lastConsult) {
            const rxText = String(lastConsult.referencias || lastConsult.observaciones || lastConsult.notas || '').trim();
            if (rxText && rxText !== '=' && rxText !== '-') {
                lastRx = '📝 ' + (rxText.length > 40 ? rxText.slice(0, 40) + '…' : rxText);
            }
        }
        const fparts = String(cita.fecha).slice(0, 10).split('-').map(Number);
        const citaMidnight = Date.UTC(fparts[0], fparts[1] - 1, fparts[2]);
        const dayDiff = Math.round((citaMidnight - todayMxMidnightUtcMs) / 86400000);
        const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        const nextAppt = `${String(fparts[2]).padStart(2,'0')} ${MESES[fparts[1]-1]} ${cita.hora}`;
        return {
            qsl,
            name: pData.nombre_completo || cita.paciente_nombre || qsl,
            telefono: pData.telefono || '—',
            glucosa: !!pData.glucoseEnabled,
            presion: !!pData.pressureEnabled,
            nextAppt,
            nextApptDays: dayDiff,
            lastRx,
            fecha: cita.fecha,
            hora: cita.hora,
            motivo: cita.motivo || ''
        };
    }

    async function listaPacientesHorizonte(doctor_id) {
        if (!doctor_id) return { success: false, error: 'doctor_id requerido' };
        const now = nowInMx();
        const todayMxMidnightUtcMs = Date.UTC(now.y, now.m, now.d);
        const endOfTomorrowUtcMs = Date.UTC(now.y, now.m, now.d + 2, 6, 0, 0) - 1;

        const snap = await db().collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .get();

        const totalCitas = snap.size;
        const inWindow = [];
        let expired = 0;
        let future = 0;
        snap.docs.forEach(docSnap => {
            const c = docSnap.data();
            if (c.deleted) return;
            const tsMs = citaToUtcMs(c.fecha, c.hora);
            if (!Number.isFinite(tsMs)) return;
            const tsPlus24 = tsMs + 24 * 3600 * 1000;
            if (tsPlus24 <= now.nowUtc) { expired++; return; }
            if (tsMs > endOfTomorrowUtcMs) { future++; return; }
            inWindow.push({ id: docSnap.id, data: c, ts: tsMs });
        });
        inWindow.sort((a, b) => a.ts - b.ts);
        const byQsl = new Map();
        for (const item of inWindow) {
            if (!item.data.qsl_code) continue;
            if (!byQsl.has(item.data.qsl_code)) byQsl.set(item.data.qsl_code, item);
        }
        const pacientes = await Promise.all(
            Array.from(byQsl.values()).map(item => enrichCita(item.data, todayMxMidnightUtcMs))
        );
        const hoyCount = pacientes.filter(p => p.nextApptDays === 0).length;
        const mananaCount = pacientes.filter(p => p.nextApptDays === 1).length;
        return {
            success: true,
            ahora_mx: `${now.y}-${String(now.m+1).padStart(2,'0')}-${String(now.d).padStart(2,'0')} ${String(now.hh).padStart(2,'0')}:${String(now.mm).padStart(2,'0')}`,
            stats: {
                total_citas_doctor: totalCitas,
                en_ventana: byQsl.size,
                expiradas: expired,
                futuras_fuera_ventana: future,
                hoy: hoyCount,
                manana: mananaCount
            },
            pacientes
        };
    }

    async function listaPacientesHistorial(doctor_id, dias) {
        if (!doctor_id) return { success: false, error: 'doctor_id requerido' };
        const N = Math.min(parseInt(dias || '30', 10), 365);
        const now = nowInMx();
        const todayMxMidnightUtcMs = Date.UTC(now.y, now.m, now.d);
        const desdeUtcMs = todayMxMidnightUtcMs - N * 24 * 3600 * 1000;
        const snap = await db().collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .get();
        const expiradas = [];
        snap.docs.forEach(docSnap => {
            const c = docSnap.data();
            if (c.deleted) return;
            const tsMs = citaToUtcMs(c.fecha, c.hora);
            if (!Number.isFinite(tsMs)) return;
            const tsPlus24 = tsMs + 24 * 3600 * 1000;
            if (tsPlus24 > now.nowUtc) return;
            if (tsMs < desdeUtcMs) return;
            expiradas.push({ data: c, ts: tsMs });
        });
        expiradas.sort((a, b) => b.ts - a.ts);
        const pacientes = await Promise.all(
            expiradas.map(item => enrichCita(item.data, todayMxMidnightUtcMs))
        );
        return {
            success: true,
            ahora_mx: `${now.y}-${String(now.m+1).padStart(2,'0')}-${String(now.d).padStart(2,'0')}`,
            stats: { total: pacientes.length, dias_consultados: N },
            pacientes
        };
    }

    // ----- CITAS -----
    async function listAppointments(doctor_id) {
        const snap = await db().collection(COLLECTIONS.citas).where('doctor_id', '==', doctor_id).get();
        const all = snap.docs
            .filter(d => !d.data().deleted)
            .map(d => ({ id: d.id, ...d.data() }));
        // De-duplicación: si hay múltiples docs con el mismo qsl+fecha+hora, conservar uno solo.
        const seen = new Map();
        for (const a of all) {
            const k = `${a.qsl_code}|${a.fecha}|${a.hora}`;
            if (!seen.has(k)) seen.set(k, a);
        }
        const appointments = Array.from(seen.values())
            .sort((a, b) => {
                if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
                return a.hora < b.hora ? -1 : 1;
            });
        return { success: true, appointments };
    }

    async function createAppointment(payload) {
        const { doctor_id, qsl_code, paciente_nombre, fecha, hora, motivo } = payload;
        // ID determinístico evita duplicados: crear la misma cita 2 veces sobrescribe en vez de añadir.
        const sanitize = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const docId = `${sanitize(doctor_id)}__${sanitize(qsl_code)}__${sanitize(fecha)}__${sanitize(hora)}`;
        await db().collection(COLLECTIONS.citas).doc(docId).set({
            doctor_id, qsl_code, paciente_nombre, fecha, hora, motivo,
            created_at: serverTimestamp()
        }, { merge: true });
        return { success: true };
    }

    async function deleteAppointment(payload) {
        const { doctor_id, qsl_code, fecha, hora } = payload;
        const snap = await db().collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .where('qsl_code', '==', qsl_code)
            .where('fecha', '==', fecha)
            .where('hora', '==', hora)
            .get();
        const batch = db().batch();
        snap.docs.forEach(d => batch.update(d.ref, { deleted: true, deleted_at: serverTimestamp() }));
        await batch.commit();
        return { success: true };
    }

    // ----- ALERTAS SISTEMA -----
    async function listPatientAlerts(qsl) {
        const snap = await db().collection(COLLECTIONS.alertas_sistema).where('qsl_code', '==', qsl).get();
        const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
        return { success: true, alerts };
    }

    async function savePatientAlert(qsl, payload) {
        const { id, mensaje, leido } = payload;
        await db().collection(COLLECTIONS.alertas_sistema).doc(id).set({
            qsl_code: qsl, mensaje, leido,
            created_at: serverTimestamp()
        }, { merge: true });
        return { success: true };
    }

    // ----- HISTORIAL MENSAJES -----
    async function listMessageHistory(doctor_id) {
        const snap = await db().collection(COLLECTIONS.historial_mensajes).where('doctor_id', '==', doctor_id).get();
        const history = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
        return { success: true, history };
    }

    async function saveMessageHistory(payload) {
        const { id, doctor_id, mensaje, canal, grupo_objetivo, cantidad_destinatarios, nombres_destinatarios } = payload;
        await db().collection(COLLECTIONS.historial_mensajes).doc(id).set({
            doctor_id, mensaje, canal, grupo_objetivo, cantidad_destinatarios, nombres_destinatarios,
            created_at: serverTimestamp()
        }, { merge: true });
        return { success: true };
    }

    // ----- SETTINGS / APARIENCIA -----
    async function getAppearance(id_centro) {
        const key = id_centro || 'global';
        const doc = await db().collection(COLLECTIONS.settings).doc(key).get();
        if (!doc.exists) return { success: true, appearance: {} };
        return { success: true, appearance: doc.data().appearance || {} };
    }

    async function saveAppearance(payload) {
        const { id_centro, appearance } = payload;
        const key = id_centro || 'global';
        await db().collection(COLLECTIONS.settings).doc(key).set(
            { appearance, updated_at: serverTimestamp() },
            { merge: true }
        );
        return { success: true };
    }

    // ----- FINANZAS (Gestión Financiera) -----
    // Tipos: income (cobro a paciente), expense (egreso), charge (deuda)
    // Filtrado por doctor_id; cada médico solo ve sus propias transacciones.
    async function listFinanzas({ doctor_id, tipo, desde, hasta, qsl_code, estado } = {}) {
        let q = db().collection(COLLECTIONS.finanzas_transacciones)
            .where('doctor_id', '==', doctor_id || 'MED-MASTER');
        if (tipo) q = q.where('tipo', '==', tipo);
        const snap = await q.get();
        let txs = snap.docs
            .filter(d => !d.data().deleted)
            .map(d => ({ id: d.id, ...d.data() }));
        if (qsl_code) txs = txs.filter(t => t.qsl_code === qsl_code);
        if (estado)   txs = txs.filter(t => t.estado === estado);
        if (desde)    txs = txs.filter(t => (t.fecha || '') >= desde);
        if (hasta)    txs = txs.filter(t => (t.fecha || '') <= hasta);
        // Ordenar por fecha+hora ascendente (más antigua primero); el cliente
        // puede invertir según necesite cada vista.
        txs.sort((a, b) => {
            const ka = (a.fecha || '') + 'T' + (a.hora || '00:00');
            const kb = (b.fecha || '') + 'T' + (b.hora || '00:00');
            return ka < kb ? -1 : (ka > kb ? 1 : 0);
        });
        return { success: true, transacciones: txs };
    }

    async function saveFinanza(id, payload) {
        const data = { ...payload, updated_at: serverTimestamp() };
        // Normalización defensiva
        if (typeof data.monto === 'string') data.monto = parseFloat(data.monto) || 0;
        if (!data.moneda) data.moneda = 'GTQ';
        const ref = id
            ? db().collection(COLLECTIONS.finanzas_transacciones).doc(id)
            : db().collection(COLLECTIONS.finanzas_transacciones).doc();
        const exists = id ? (await ref.get()).exists : false;
        if (!exists) data.created_at = serverTimestamp();
        await ref.set(data, { merge: true });

        // Liquidación FIFO: si este es un ingreso con qsl_code, marcar
        // cargos pendientes del mismo paciente como pagados (orden cronológico).
        if (data.tipo === 'income' && data.qsl_code && data.monto > 0) {
            try {
                await liquidarCargosFIFO(data.doctor_id, data.qsl_code, data.monto, ref.id);
            } catch (e) { console.warn('FIFO liquidación falló:', e?.message || e); }
        }
        return { success: true, id: ref.id };
    }

    async function deleteFinanza(id) {
        await db().collection(COLLECTIONS.finanzas_transacciones).doc(id).set(
            { deleted: true, deleted_at: serverTimestamp() },
            { merge: true }
        );
        return { success: true };
    }

    async function liquidarCargosFIFO(doctor_id, qsl_code, montoIngreso, ingresoRefId) {
        if (!qsl_code || !montoIngreso) return;
        const snap = await db().collection(COLLECTIONS.finanzas_transacciones)
            .where('doctor_id', '==', doctor_id)
            .where('qsl_code', '==', qsl_code)
            .where('tipo', '==', 'charge')
            .get();
        const pendings = snap.docs
            .filter(d => !d.data().deleted && d.data().estado === 'pending')
            .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
            .sort((a, b) => {
                const ka = (a.fecha || '') + 'T' + (a.hora || '00:00');
                const kb = (b.fecha || '') + 'T' + (b.hora || '00:00');
                return ka < kb ? -1 : 1;
            });
        let remaining = parseFloat(montoIngreso);
        const batch = db().batch();
        for (const ch of pendings) {
            if (remaining <= 0) break;
            const monto = parseFloat(ch.monto) || 0;
            if (remaining >= monto) {
                batch.set(ch.ref, {
                    estado: 'paid',
                    paid_at: serverTimestamp(),
                    paid_by_income: ingresoRefId || null
                }, { merge: true });
                remaining -= monto;
            } else {
                // Cubre parcialmente: bajar el monto pendiente y dejar resto.
                batch.set(ch.ref, {
                    monto: monto - remaining,
                    monto_original: ch.monto_original || monto,
                    partial_payments: [...(ch.partial_payments || []), {
                        amount: remaining,
                        income_id: ingresoRefId || null
                    }]
                }, { merge: true });
                remaining = 0;
            }
        }
        await batch.commit();
    }

    // ----- AGENDA REMOTA (booking público de pacientes) -----
    // La config se guarda en el mismo doc settings/{doctor_id} como campo
    // 'remote_booking'. Hereda merge — no toca appearance/reminders.

    function _normalizeBookingConfig(cfg) {
        const def = {
            enabled: false,
            session_duration: 30,
            months_ahead: 1,
            weekly_schedule: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
        };
        const out = Object.assign({}, def, cfg || {});
        if (!out.weekly_schedule) out.weekly_schedule = def.weekly_schedule;
        ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => {
            if (!Array.isArray(out.weekly_schedule[k])) out.weekly_schedule[k] = [];
        });
        return out;
    }

    async function getBookingConfig(doctor_id) {
        const did = doctor_id || 'MED-MASTER';
        const doc = await db().collection(COLLECTIONS.settings).doc(did).get();
        if (!doc.exists) return { success: true, config: _normalizeBookingConfig() };
        const data = doc.data() || {};
        return { success: true, config: _normalizeBookingConfig(data.remote_booking) };
    }

    async function saveBookingConfig(doctor_id, config) {
        const did = doctor_id || 'MED-MASTER';
        const cleaned = _normalizeBookingConfig(config);
        await db().collection(COLLECTIONS.settings).doc(did).set(
            { remote_booking: cleaned, updated_at: serverTimestamp() },
            { merge: true }
        );
        return { success: true };
    }

    // Devuelve nombre del médico para mostrar en la página pública.
    async function getDoctorPublicInfo(doctor_id) {
        try {
            const doc = await db().collection(COLLECTIONS.medicos).doc(doctor_id).get();
            if (!doc.exists) return { success: false };
            const d = doc.data();
            if (d.deleted) return { success: false };
            const data = d.data || {};
            return {
                success: true,
                doctor: {
                    id: doctor_id,
                    nombre: data.nombre_completo || 'Médico',
                    especialidad: data.especialidad || '',
                    telefono: data.telefono || ''
                }
            };
        } catch (e) { return { success: false }; }
    }

    // Devuelve los slots disponibles para una fecha dada (YYYY-MM-DD).
    // Calcula slots desde weekly_schedule + session_duration y resta los ocupados.
    async function listAvailableSlots({ doctor_id, date }) {
        if (!doctor_id || !date) return { success: false, slots: [] };
        const cfg = (await getBookingConfig(doctor_id)).config;
        if (!cfg.enabled) return { success: true, slots: [], disabled: true };

        // Día de la semana
        const dt = new Date(date + 'T12:00:00');
        const weekdayIdx = dt.getDay(); // 0=Sun
        const keys = ['sun','mon','tue','wed','thu','fri','sat'];
        const ranges = cfg.weekly_schedule[keys[weekdayIdx]] || [];

        // Generar todos los slots del día según rangos
        const dur = parseInt(cfg.session_duration) || 30;
        const slots = [];
        ranges.forEach(r => {
            const [sh, sm] = (r.start || '00:00').split(':').map(n => parseInt(n));
            const [eh, em] = (r.end || '00:00').split(':').map(n => parseInt(n));
            let mins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            while (mins + dur <= endMins) {
                const hh = String(Math.floor(mins / 60)).padStart(2, '0');
                const mm = String(mins % 60).padStart(2, '0');
                slots.push(`${hh}:${mm}`);
                mins += dur;
            }
        });

        // Citas ocupadas ese día (excluyendo soft-deleted).
        // Convertir cada ocupado a un INTERVALO en minutos [start, start+dur)
        // para detectar solapamiento (no solo igualdad exacta).
        const apptSnap = await db().collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .where('fecha', '==', date)
            .get();
        const occupiedIntervals = apptSnap.docs
            .filter(d => !d.data().deleted)
            .map(d => {
                const h = d.data().hora || '';
                const parts = h.split(':').map(n => parseInt(n));
                if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
                const start = parts[0] * 60 + parts[1];
                // Si la cita guardó su propia duración, usarla; si no, usar la configurada
                const apptDur = parseInt(d.data().duration_minutes) || dur;
                return { start, end: start + apptDur };
            })
            .filter(Boolean);

        // Restar slots pasados (si la fecha es hoy)
        const now = new Date();
        const isToday = (date === now.getFullYear() + '-' +
            String(now.getMonth()+1).padStart(2,'0') + '-' +
            String(now.getDate()).padStart(2,'0'));
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        function _overlaps(slotStart, slotEnd) {
            // Un slot solapa si su intervalo se cruza con CUALQUIER ocupado.
            for (const o of occupiedIntervals) {
                if (slotStart < o.end && slotEnd > o.start) return true;
            }
            return false;
        }

        const available = slots.filter(s => {
            const [h, m] = s.split(':').map(n => parseInt(n));
            const slotStart = h * 60 + m;
            const slotEnd = slotStart + dur;
            // Excluir slots pasados (solo aplica si la fecha es hoy)
            if (isToday && slotStart <= nowMinutes) return false;
            // Excluir slots que solapen con citas ya reservadas
            if (_overlaps(slotStart, slotEnd)) return false;
            return true;
        });
        return {
            success: true,
            slots: available,
            session_duration: dur,
            total_generated: slots.length,
            occupied_count: occupiedIntervals.length
        };
    }

    // Crea paciente nuevo + cita en un solo flujo desde la página pública.
    // Verifica disponibilidad del slot antes de crear para evitar doble-booking.
    async function createPublicAppointment(payload) {
        const { doctor_id, fecha, hora, paciente_nombre, paciente_telefono, motivo } = payload;
        if (!doctor_id || !fecha || !hora || !paciente_nombre || !paciente_telefono) {
            return { success: false, error: 'Faltan campos obligatorios.' };
        }
        // 1) Verificar que el slot sigue libre (chequeo previo)
        const slots = await listAvailableSlots({ doctor_id, date: fecha });
        if (!slots.success || slots.disabled) {
            return { success: false, error: 'La agenda remota no está disponible.' };
        }
        if (!slots.slots.includes(hora)) {
            return { success: false, error: 'Ese horario ya fue tomado. Por favor elige otro.' };
        }

        // 2) Generar QSL único (patrón compatible con dashboard.js)
        const first = (paciente_nombre.split(' ')[0] || 'A').charAt(0).toUpperCase();
        const second = (paciente_nombre.split(' ')[1] || 'X').charAt(0).toUpperCase();
        const last4 = String(paciente_telefono).replace(/\D/g, '').slice(-4) || '0000';
        let qsl = `${first}${second}${last4}`;
        // Si ya existe, añadir sufijo random
        const exist = await db().collection(COLLECTIONS.pacientes).doc(qsl).get();
        if (exist.exists) qsl = qsl + Math.floor(Math.random() * 90);

        // 3) Guardar paciente
        const patientData = {
            nombre_completo: paciente_nombre,
            telefono: paciente_telefono,
            illness: motivo || 'Cita agendada remotamente',
            meds: [],
            source: 'public_booking'
        };
        await db().collection(COLLECTIONS.pacientes).doc(qsl).set({
            data: patientData,
            doctor_id,
            nombre: paciente_nombre,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            source: 'public_booking'
        }, { merge: true });

        // 4) Crear cita con ID determinístico (evita duplicados)
        const sanitize = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const apptId = `${sanitize(doctor_id)}__${sanitize(qsl)}__${sanitize(fecha)}__${sanitize(hora)}`;
        // Obtener duración configurada del médico para guardarla en la cita
        // (permite detección de solapamiento correcta si más adelante el médico cambia el slot size)
        const bkCfg = (await getBookingConfig(doctor_id)).config;
        const sessionDur = parseInt(bkCfg.session_duration) || 30;
        await db().collection(COLLECTIONS.citas).doc(apptId).set({
            doctor_id,
            qsl_code: qsl,
            paciente_nombre,
            paciente_telefono,
            fecha,
            hora,
            motivo: motivo || '',
            duration_minutes: sessionDur,
            source: 'public_booking',
            created_at: serverTimestamp()
        }, { merge: true });

        return { success: true, qsl, fecha, hora };
    }

    window.firestoreClient = {
        verifyPatient, getPatient, savePatient, listPatients, togglePatientAlerts,
        login,
        listMedicos, saveMedico, deleteMedico, updateMedicoPrivileges,
        listCentros, saveCentro, deleteCentro,
        listAppointments, createAppointment, deleteAppointment,
        listaPacientesHorizonte, listaPacientesHistorial,
        listPatientAlerts, savePatientAlert,
        listMessageHistory, saveMessageHistory,
        getAppearance, saveAppearance,
        listFinanzas, saveFinanza, deleteFinanza, liquidarCargosFIFO,
        getBookingConfig, saveBookingConfig, listAvailableSlots,
        createPublicAppointment, getDoctorPublicInfo
    };

    // ============================================================
    // INTERCEPTOR DE FETCH — captura llamadas /api/* y las redirige
    // al cliente Firestore sin que el código existente tenga que cambiar.
    // ============================================================
    const _origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (!url || !url.startsWith('/api/')) return _origFetch(input, init);

        const method = (init?.method || 'GET').toUpperCase();
        const body = init?.body ? safeJSON(init.body) : null;
        const parsedUrl = new URL(url, window.location.origin);
        const path = parsedUrl.pathname;
        const params = Object.fromEntries(parsedUrl.searchParams.entries());

        try {
            const result = await route(path, method, body, params);
            return jsonResponse(result);
        } catch (e) {
            console.error('[firestoreClient] Error en', method, path, e);
            return jsonResponse({ success: false, error: e?.message || String(e) }, 500);
        }
    };

    function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

    function jsonResponse(obj, status = 200) {
        return new Response(JSON.stringify(obj), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function route(path, method, body, params) {
        // /api/patient/:qsl/verify
        let m;
        if ((m = path.match(/^\/api\/patient\/([^/]+)\/verify$/)) && method === 'GET') {
            return await verifyPatient(m[1]);
        }
        // /api/patient/:qsl/alerts (POST)
        if ((m = path.match(/^\/api\/patient\/([^/]+)\/alerts$/)) && method === 'POST') {
            return await togglePatientAlerts(m[1], !!body?.enabled);
        }
        // /api/patient/:qsl/alerts/messages
        if ((m = path.match(/^\/api\/patient\/([^/]+)\/alerts\/messages$/))) {
            if (method === 'GET') return await listPatientAlerts(m[1]);
            if (method === 'POST') return await savePatientAlert(m[1], body || {});
        }
        // /api/patient/:qsl
        if ((m = path.match(/^\/api\/patient\/([^/]+)$/))) {
            if (method === 'GET')  return await getPatient(m[1]);
            if (method === 'POST') return await savePatient(m[1], body || {});
        }
        // /api/patients/list
        if (path === '/api/patients/list' && method === 'GET') {
            return await listPatients(params);
        }
        // /api/login
        if (path === '/api/login' && method === 'POST') {
            return await login(body?.pass);
        }
        // /api/medicos
        if (path === '/api/medicos' && method === 'GET') return await listMedicos();
        // /api/medico/:id (POST | DELETE | PATCH privileges)
        if ((m = path.match(/^\/api\/medico\/([^/]+)\/privileges$/)) && method === 'PATCH') {
            return await updateMedicoPrivileges(m[1], body?.privileges || {});
        }
        if ((m = path.match(/^\/api\/medico\/([^/]+)$/))) {
            if (method === 'POST')   return await saveMedico(m[1], body || {});
            if (method === 'DELETE') return await deleteMedico(m[1]);
        }
        // /api/centros
        if (path === '/api/centros' && method === 'GET') return await listCentros();
        if ((m = path.match(/^\/api\/centro\/([^/]+)$/))) {
            if (method === 'POST')   return await saveCentro(m[1], body || {});
            if (method === 'DELETE') return await deleteCentro(m[1]);
        }
        // /api/appointments
        if (path === '/api/appointments') {
            if (method === 'GET')    return await listAppointments(params.doctor_id);
            if (method === 'POST')   return await createAppointment(body || {});
            if (method === 'DELETE') return await deleteAppointment(body || {});
        }
        // /api/lista-pacientes/horizonte → fuente única de verdad para Lista (hoy+mañana)
        if (path === '/api/lista-pacientes/horizonte' && method === 'GET') {
            return await listaPacientesHorizonte(params.doctor_id);
        }
        // /api/lista-pacientes/historial → citas expiradas (+24h después de la hora)
        if (path === '/api/lista-pacientes/historial' && method === 'GET') {
            return await listaPacientesHistorial(params.doctor_id, params.dias);
        }
        // /api/messages/history
        if (path === '/api/messages/history') {
            if (method === 'GET')  return await listMessageHistory(params.doctor_id);
            if (method === 'POST') return await saveMessageHistory(body || {});
        }
        // /api/settings/appearance
        if (path === '/api/settings/appearance') {
            if (method === 'GET')  return await getAppearance(params.id_centro);
            if (method === 'POST') return await saveAppearance(body || {});
        }
        // /api/finanzas (lista + creación)
        if (path === '/api/finanzas') {
            if (method === 'GET')  return await listFinanzas(params);
            if (method === 'POST') return await saveFinanza(null, body || {});
        }
        // /api/finanzas/:id (actualizar | borrar)
        let mf;
        if ((mf = path.match(/^\/api\/finanzas\/([^/]+)$/))) {
            if (method === 'PUT' || method === 'POST') return await saveFinanza(mf[1], body || {});
            if (method === 'DELETE')                  return await deleteFinanza(mf[1]);
        }

        // ===== AGENDA REMOTA (booking público) =====
        let mb;
        if ((mb = path.match(/^\/api\/booking\/([^/]+)\/config$/))) {
            if (method === 'GET')  return await getBookingConfig(mb[1]);
            if (method === 'POST') return await saveBookingConfig(mb[1], body || {});
        }
        if ((mb = path.match(/^\/api\/booking\/([^/]+)\/info$/))) {
            if (method === 'GET') return await getDoctorPublicInfo(mb[1]);
        }
        if ((mb = path.match(/^\/api\/booking\/([^/]+)\/slots$/))) {
            if (method === 'GET') return await listAvailableSlots({ doctor_id: mb[1], date: params.date });
        }
        if ((mb = path.match(/^\/api\/booking\/([^/]+)\/appointment$/))) {
            if (method === 'POST') return await createPublicAppointment(Object.assign({}, body || {}, { doctor_id: mb[1] }));
        }

        throw new Error(`Ruta no implementada: ${method} ${path}`);
    }
})();
