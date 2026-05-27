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
        settings: 'settings'
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

    window.firestoreClient = {
        verifyPatient, getPatient, savePatient, listPatients, togglePatientAlerts,
        login,
        listMedicos, saveMedico, deleteMedico, updateMedicoPrivileges,
        listCentros, saveCentro, deleteCentro,
        listAppointments, createAppointment, deleteAppointment,
        listPatientAlerts, savePatientAlert,
        listMessageHistory, saveMessageHistory,
        getAppearance, saveAppearance
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

        throw new Error(`Ruta no implementada: ${method} ${path}`);
    }
})();
