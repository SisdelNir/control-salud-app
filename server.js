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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
