const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const { db, admin, COLLECTIONS, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Initialize DB
initDB();

// --- API Endpoints ---

// Verify patient and get name
app.get('/api/patient/:qsl/verify', async (req, res) => {
    try {
        const { qsl } = req.params;
        const doc = await db.collection(COLLECTIONS.pacientes).doc(qsl).get();
        if (!doc.exists) {
            return res.json({ success: false });
        }
        const data = doc.data().data || {};
        const name = data.nombre_completo || qsl;
        res.json({ success: true, name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Get full patient data payload
app.get('/api/patient/:qsl', async (req, res) => {
    try {
        const { qsl } = req.params;
        const doc = await db.collection(COLLECTIONS.pacientes).doc(qsl).get();
        if (!doc.exists) {
            return res.json({ success: false, data: { illness: '', meds: [] } });
        }
        const docData = doc.data();
        res.json({ success: true, data: docData.data || {}, alerts_enabled: docData.alerts_enabled || false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Save patient data (ensures name is searchable)
app.post('/api/patient/:qsl', async (req, res) => {
    try {
        const { qsl } = req.params;
        const { data, doctor_id } = req.body;
        const update = {
            data,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };
        if (doctor_id) update.doctor_id = doctor_id;
        if (data && data.nombre_completo) update.nombre = data.nombre_completo;
        const docRef = db.collection(COLLECTIONS.pacientes).doc(qsl);
        const existing = await docRef.get();
        if (!existing.exists) update.created_at = admin.firestore.FieldValue.serverTimestamp();
        await docRef.set(update, { merge: true });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// List all patients (optionally filtered by doctor_id) for cross-device sync
app.get('/api/patients/list', async (req, res) => {
    try {
        const { doctor_id, since } = req.query;
        let query = db.collection(COLLECTIONS.pacientes);
        if (doctor_id && doctor_id !== 'MED-MASTER') {
            query = query.where('doctor_id', '==', doctor_id);
        }
        const snap = await query.get();
        const sinceMs = since ? Number(since) : 0;
        const patients = snap.docs
            .filter(d => !d.data().deleted)
            .map(d => {
                const docData = d.data();
                return {
                    qsl: d.id,
                    doctor_id: docData.doctor_id || null,
                    nombre: docData.nombre || (docData.data && docData.data.nombre_completo) || null,
                    data: docData.data || {},
                    alerts_enabled: !!docData.alerts_enabled,
                    updated_at: docData.updated_at?.toMillis?.() || docData.created_at?.toMillis?.() || 0
                };
            })
            .filter(p => p.updated_at >= sinceMs);
        res.json({ success: true, patients, server_time: Date.now() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Doctor login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { pass } = req.body;
        if (pass === '1122') {
            return res.json({ success: true, role: 'medico', id: 'MED-MASTER', name: 'Administrador Principal' });
        }

        // Check if it's an Admin General
        const centroSnap = await db.collection(COLLECTIONS.centros_medicos)
            .where('admin_code', '==', pass)
            .limit(1)
            .get();
        if (!centroSnap.empty) {
            const centro = centroSnap.docs[0].data();
            return res.json({
                success: true,
                role: 'admin_general',
                id_centro: centro.id_centro,
                name: 'Administrador Central',
                nombre_centro: centro.nombre,
                max_medicos: centro.max_medicos
            });
        }

        const passHash = Buffer.from(pass).toString('base64');
        const medicosSnap = await db.collection(COLLECTIONS.medicos).get();
        let medico = null;
        medicosSnap.forEach(docSnap => {
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
            return res.json({ success: true, role: 'medico', id: medico.id_medico, name: medico.data.nombre_completo, data: medico.data });
        }

        res.json({ success: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Toggle patient alerts
app.post('/api/patient/:qsl/alerts', async (req, res) => {
    try {
        const { qsl } = req.params;
        const { enabled } = req.body;
        await db.collection(COLLECTIONS.pacientes).doc(qsl).set(
            { alerts_enabled: enabled },
            { merge: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Get/Update medicos
app.get('/api/medicos', async (req, res) => {
    try {
        const snap = await db.collection(COLLECTIONS.medicos).get();
        const medicos = snap.docs
            .filter(d => !d.data().deleted)  // excluir soft-deleted
            .map(d => ({ id_medico: d.id, ...(d.data().data || {}) }));
        res.json({ success: true, medicos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/medico/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        await db.collection(COLLECTIONS.medicos).doc(id).set(
            { data, created_at: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/medico/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete: marcar como eliminado, NO borrar el documento
        await db.collection(COLLECTIONS.medicos).doc(id).set(
            { deleted: true, deleted_at: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Centros Medicos routes
app.get('/api/centros', async (req, res) => {
    try {
        const snap = await db.collection(COLLECTIONS.centros_medicos).get();
        const centros = snap.docs
            .filter(d => !d.data().deleted)  // excluir soft-deleted
            .map(d => d.data());
        res.json({ success: true, centros });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/centro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, admin_code, max_medicos, admin_nombre, admin_id, admin_telefono, admin_correo, pais, nit, moneda, timezone, dateLocale } = req.body;
        await db.collection(COLLECTIONS.centros_medicos).doc(id).set({
            id_centro: id,
            nombre,
            admin_code,
            max_medicos,
            admin_nombre,
            admin_id,
            admin_telefono,
            admin_correo,
            pais,
            nit,
            moneda,
            timezone,
            date_locale: dateLocale,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/centro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete: marcar como eliminado, NO borrar el documento
        await db.collection(COLLECTIONS.centros_medicos).doc(id).set(
            { deleted: true, deleted_at: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === NUBE: Citas / Agenda ===
app.get('/api/appointments', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        const snap = await db.collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .get();
        // Defensa: deduplicar por clave (qsl_code|fecha|hora) por si existen
        // documentos duplicados antiguos (anteriores al fix de idempotencia).
        // Para cada grupo nos quedamos con el más reciente.
        const byKey = new Map();
        snap.docs
            .filter(d => !d.data().deleted)
            .forEach(d => {
                const data = d.data();
                const key = `${data.qsl_code}|${data.fecha}|${data.hora}`;
                const prev = byKey.get(key);
                const tsNew = data.updated_at?.toMillis?.() || data.created_at?.toMillis?.() || 0;
                if (!prev) {
                    byKey.set(key, { doc: d, ts: tsNew });
                } else if (tsNew > prev.ts) {
                    byKey.set(key, { doc: d, ts: tsNew });
                }
            });
        const appointments = Array.from(byKey.values())
            .map(({ doc }) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
                return a.hora < b.hora ? -1 : 1;
            });
        res.json({ success: true, appointments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Crea o actualiza una cita usando un ID DETERMINÍSTICO basado en
// doctor_id + qsl_code + fecha + hora. Esto hace al endpoint IDEMPOTENTE:
// si el cliente reintenta la misma cita N veces (por errores de red,
// doble click, etc.), siempre se escribe sobre el MISMO documento y no
// se generan duplicados en Firestore. Reemplaza la versión anterior que
// usaba .add() y producía un doc nuevo en cada reintento.
function makeCitaId(doctor_id, qsl_code, fecha, hora) {
    const safe = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safe(doctor_id)}__${safe(qsl_code)}__${safe(fecha)}__${safe(hora)}`;
}

app.post('/api/appointments', async (req, res) => {
    try {
        const { doctor_id, qsl_code, paciente_nombre, fecha, hora, motivo } = req.body;
        if (!doctor_id || !qsl_code || !fecha || !hora) {
            return res.status(400).json({ success: false, error: 'doctor_id, qsl_code, fecha y hora son requeridos' });
        }
        const id = makeCitaId(doctor_id, qsl_code, fecha, hora);
        const ref = db.collection(COLLECTIONS.citas).doc(id);
        const existing = await ref.get();
        const payload = {
            doctor_id,
            qsl_code,
            paciente_nombre,
            fecha,
            hora,
            motivo: motivo || '',
            // Resucitar si estaba soft-deleted (el cliente la está reagendando)
            deleted: false,
            deleted_at: admin.firestore.FieldValue.delete(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };
        if (!existing.exists) {
            payload.created_at = admin.firestore.FieldValue.serverTimestamp();
        }
        await ref.set(payload, { merge: true });
        res.json({ success: true, id, created: !existing.exists });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/appointments', async (req, res) => {
    try {
        const { doctor_id, qsl_code, fecha, hora } = req.body;
        const snap = await db.collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .where('qsl_code', '==', qsl_code)
            .where('fecha', '==', fecha)
            .where('hora', '==', hora)
            .get();
        // Soft delete: marcar como eliminadas, NO borrar los documentos
        const batch = db.batch();
        snap.docs.forEach(d => batch.update(d.ref, {
            deleted: true,
            deleted_at: admin.firestore.FieldValue.serverTimestamp()
        }));
        await batch.commit();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === NUBE: Alertas del Sistema para el Paciente ===
app.get('/api/patient/:qsl/alerts/messages', async (req, res) => {
    try {
        const { qsl } = req.params;
        const snap = await db.collection(COLLECTIONS.alertas_sistema)
            .where('qsl_code', '==', qsl)
            .get();
        const alerts = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const ta = a.created_at?.toMillis?.() || 0;
                const tb = b.created_at?.toMillis?.() || 0;
                return tb - ta;
            });
        res.json({ success: true, alerts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/patient/:qsl/alerts/messages', async (req, res) => {
    try {
        const { qsl } = req.params;
        const { id, mensaje, leido } = req.body;
        await db.collection(COLLECTIONS.alertas_sistema).doc(id).set({
            qsl_code: qsl,
            mensaje,
            leido,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === NUBE: Historial de Mensajes del Médico ===
app.get('/api/messages/history', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        const snap = await db.collection(COLLECTIONS.historial_mensajes)
            .where('doctor_id', '==', doctor_id)
            .get();
        const history = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const ta = a.created_at?.toMillis?.() || 0;
                const tb = b.created_at?.toMillis?.() || 0;
                return tb - ta;
            });
        res.json({ success: true, history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/messages/history', async (req, res) => {
    try {
        const { id, doctor_id, mensaje, canal, grupo_objetivo, cantidad_destinatarios, nombres_destinatarios } = req.body;
        await db.collection(COLLECTIONS.historial_mensajes).doc(id).set({
            doctor_id,
            mensaje,
            canal,
            grupo_objetivo,
            cantidad_destinatarios,
            nombres_destinatarios,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === PRIVILEGIOS DE MÉDICO ===
app.patch('/api/medico/:id/privileges', async (req, res) => {
    try {
        const { id } = req.params;
        const { privileges } = req.body;
        await db.collection(COLLECTIONS.medicos).doc(id).set(
            { privileges: privileges || {} },
            { merge: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// === APARIENCIA DEL SISTEMA ===
app.get('/api/settings/appearance', async (req, res) => {
    try {
        const { id_centro } = req.query;
        const key = id_centro || 'global';
        const doc = await db.collection('settings').doc(key).get();
        if (!doc.exists) return res.json({ success: true, appearance: {} });
        res.json({ success: true, appearance: doc.data().appearance || {} });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/settings/appearance', async (req, res) => {
    try {
        const { id_centro, appearance } = req.body;
        const key = id_centro || 'global';
        await db.collection('settings').doc(key).set(
            { appearance, updated_at: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// =========================================================
// LISTA DE PACIENTES — endpoints autoritativos
// =========================================================
// Resuelven el bug recurrente del módulo "Lista de Pacientes" (hoy + mañana)
// devolviendo 0 aunque existan citas. El servidor es ÚNICA FUENTE DE VERDAD:
// el cliente solo pinta lo que aquí devolvemos, sin depender de localStorage
// ni de syncs que puedan fallar.
//
// Reglas de filtro (decisión del usuario):
//   - HORIZONTE: cita aparece SI (cita_datetime + 24h > ahora) AND (cita_datetime <= fin_de_mañana)
//     Cumple los dos requisitos a la vez: "hoy + mañana" Y "expira 24h después de la hora".
//   - HISTORIAL: cita aparece SI (cita_datetime + 24h <= ahora) — la inversa.
//
// Timezone fija: America/Mexico_City (UTC-6, sin DST desde 2022).
// =========================================================
const MX_OFFSET_MS = 6 * 3600 * 1000; // México = UTC-6 todo el año

// Devuelve los componentes Y/M/D de "ahora" según hora local de México.
function nowInMx() {
    const nowUtc = Date.now();
    const d = new Date(nowUtc - MX_OFFSET_MS);
    return {
        nowUtc,
        y: d.getUTCFullYear(),
        m: d.getUTCMonth(),         // 0-indexed
        d: d.getUTCDate(),
        hh: d.getUTCHours(),
        mm: d.getUTCMinutes()
    };
}

// Convierte "YYYY-MM-DD" + "HH:MM" (interpretado como hora LOCAL de México)
// a un timestamp UTC en ms. Permite comparar consistentemente con Date.now().
function citaToUtcMs(fecha, hora) {
    if (!fecha) return NaN;
    const parts = String(fecha).slice(0, 10).split('-');
    if (parts.length !== 3) return NaN;
    const [y, m, d] = parts.map(Number);
    const [hh, mm] = String(hora || '00:00').split(':').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
    // MX local YYYY-MM-DD HH:MM == UTC YYYY-MM-DD (HH+6):MM
    return Date.UTC(y, m - 1, d, (hh || 0) + 6, mm || 0, 0);
}

// Enriquece una cita con los datos del paciente (nombre, teléfono, flags, última receta).
async function enrichCita(cita, todayMxMidnightUtcMs) {
    const qsl = cita.qsl_code;
    const pSnap = await db.collection(COLLECTIONS.pacientes).doc(qsl).get();
    const pData = pSnap.exists ? (pSnap.data().data || {}) : {};
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
    // Días respecto a hoy MX
    const fparts = String(cita.fecha).slice(0, 10).split('-').map(Number);
    const citaMidnight = Date.UTC(fparts[0], fparts[1] - 1, fparts[2]);
    const dayDiff = Math.round((citaMidnight - todayMxMidnightUtcMs) / 86400000);
    // Formato corto "DD mmm HH:MM"
    const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const nextApptShort = `${String(fparts[2]).padStart(2,'0')} ${MESES[fparts[1]-1]} ${cita.hora}`;
    return {
        qsl,
        name: pData.nombre_completo || cita.paciente_nombre || qsl,
        telefono: pData.telefono || '—',
        glucosa: !!pData.glucoseEnabled,
        presion: !!pData.pressureEnabled,
        nextAppt: nextApptShort,
        nextApptDays: dayDiff,
        lastRx,
        fecha: cita.fecha,
        hora: cita.hora,
        motivo: cita.motivo || ''
    };
}

// ----------------------------------------------------------
// GET /api/lista-pacientes/horizonte?doctor_id=X
// Devuelve los pacientes con cita en la ventana HOY + MAÑANA
// (más 24h de gracia para citas pasadas hoy).
// ----------------------------------------------------------
app.get('/api/lista-pacientes/horizonte', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        if (!doctor_id) {
            return res.status(400).json({ success: false, error: 'doctor_id requerido' });
        }
        const now = nowInMx();
        // Medianoche de hoy en MX (para nextApptDays)
        const todayMxMidnightUtcMs = Date.UTC(now.y, now.m, now.d);
        // Fin de mañana en MX = (día + 2) a las 00:00 MX = (día + 2) a las 06:00 UTC menos 1ms
        const endOfTomorrowUtcMs = Date.UTC(now.y, now.m, now.d + 2, 6, 0, 0) - 1;

        const snap = await db.collection(COLLECTIONS.citas)
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

        // Una sola fila por paciente: nos quedamos con su cita MÁS PRÓXIMA
        inWindow.sort((a, b) => a.ts - b.ts);
        const byQsl = new Map();
        for (const item of inWindow) {
            if (!item.data.qsl_code) continue;
            if (!byQsl.has(item.data.qsl_code)) byQsl.set(item.data.qsl_code, item);
        }

        // Enriquecer con datos de cada paciente (en paralelo)
        const pacientes = await Promise.all(
            Array.from(byQsl.values()).map(item => enrichCita(item.data, todayMxMidnightUtcMs))
        );

        // Conteos: hoy (dayDiff===0) y mañana (dayDiff===1) basados en la fecha de la cita
        const hoyCount = pacientes.filter(p => p.nextApptDays === 0).length;
        const mananaCount = pacientes.filter(p => p.nextApptDays === 1).length;

        res.json({
            success: true,
            ahora_mx: `${now.y}-${String(now.m + 1).padStart(2, '0')}-${String(now.d).padStart(2, '0')} ${String(now.hh).padStart(2, '0')}:${String(now.mm).padStart(2, '0')}`,
            stats: {
                total_citas_doctor: totalCitas,
                en_ventana: byQsl.size,
                expiradas: expired,
                futuras_fuera_ventana: future,
                hoy: hoyCount,
                manana: mananaCount
            },
            pacientes
        });
    } catch (err) {
        console.error('/api/lista-pacientes/horizonte:', err);
        res.status(500).json({ success: false, error: err.message || 'Database error' });
    }
});

// ----------------------------------------------------------
// GET /api/lista-pacientes/historial?doctor_id=X&dias=30
// Devuelve citas EXPIRADAS (cita + 24h <= ahora) de los últimos N días.
// ----------------------------------------------------------
app.get('/api/lista-pacientes/historial', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        const dias = Math.min(parseInt(req.query.dias || '30', 10), 365);
        if (!doctor_id) {
            return res.status(400).json({ success: false, error: 'doctor_id requerido' });
        }
        const now = nowInMx();
        const todayMxMidnightUtcMs = Date.UTC(now.y, now.m, now.d);
        const desdeUtcMs = todayMxMidnightUtcMs - dias * 24 * 3600 * 1000;

        const snap = await db.collection(COLLECTIONS.citas)
            .where('doctor_id', '==', doctor_id)
            .get();

        const expiradas = [];
        snap.docs.forEach(docSnap => {
            const c = docSnap.data();
            if (c.deleted) return;
            const tsMs = citaToUtcMs(c.fecha, c.hora);
            if (!Number.isFinite(tsMs)) return;
            const tsPlus24 = tsMs + 24 * 3600 * 1000;
            if (tsPlus24 > now.nowUtc) return;        // todavía está en Lista
            if (tsMs < desdeUtcMs) return;            // demasiado antigua
            expiradas.push({ data: c, ts: tsMs });
        });

        expiradas.sort((a, b) => b.ts - a.ts); // más reciente primero

        const pacientes = await Promise.all(
            expiradas.map(item => enrichCita(item.data, todayMxMidnightUtcMs))
        );

        res.json({
            success: true,
            ahora_mx: `${now.y}-${String(now.m + 1).padStart(2, '0')}-${String(now.d).padStart(2, '0')}`,
            stats: { total: pacientes.length, dias_consultados: dias },
            pacientes
        });
    } catch (err) {
        console.error('/api/lista-pacientes/historial:', err);
        res.status(500).json({ success: false, error: err.message || 'Database error' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
