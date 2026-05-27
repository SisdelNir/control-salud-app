// =========================================================
// DR-SISDEL · Sistema de Backups por Empresa (Centro Médico)
// =========================================================
// Backup automático y manual de los DATOS de cada empresa (centro médico)
// registrada en el sistema. NO incluye código fuente (propiedad del programador).
//
// Características:
//   - Un archivo JSON por empresa: backup_<id_centro>_<timestamp>.json
//   - Sube cada archivo a Firebase Storage (bucket por defecto del proyecto)
//   - Si Storage no está disponible, hace fallback a guardar el JSON
//     completo dentro de la colección Firestore `backups_registro` (campo "payload")
//   - Registra metadatos de cada backup en `backups_registro`
//   - Aplica retención (default 90 días) borrando backups antiguos
//
// Uso:
//   node backup-firestore.js                  → backup automático de TODAS las empresas
//   node backup-firestore.js <id_centro>      → backup de UNA sola empresa
//   require('./backup-firestore').runBackup() → desde código (servidor / cron)
//
// =========================================================

const { db, admin, bucket, COLLECTIONS, initDB } = require('./db');

const DEFAULT_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '90', 10);

/**
 * Limpia Timestamps de Firestore para que serialicen bien en JSON.
 */
function cleanForJson(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object') {
            if (value._seconds !== undefined && value._nanoseconds !== undefined) {
                return new Date(value._seconds * 1000).toISOString();
            }
            if (typeof value.toDate === 'function') {
                try { return value.toDate().toISOString(); } catch (_) { /* noop */ }
            }
        }
        return value;
    }));
}

/**
 * Construye el snapshot de datos de UNA empresa (centro_medico).
 * Incluye: centro + médicos del centro + pacientes/citas/historial de esos médicos
 * + alertas de esos pacientes.
 */
async function buildCentroSnapshot(centroDoc) {
    const centro = centroDoc.data();
    const id_centro = centro.id_centro || centroDoc.id;

    // 1. Médicos del centro
    const medicosSnap = await db.collection(COLLECTIONS.medicos).get();
    const medicos = medicosSnap.docs
        .filter(d => {
            const data = d.data();
            const inner = data.data || {};
            return inner.id_centro === id_centro;
        })
        .map(d => ({ _id: d.id, ...cleanForJson(d.data()) }));

    const medicoIds = medicos.map(m => m._id);

    // 2. Pacientes asignados a estos médicos
    let pacientes = [];
    if (medicoIds.length > 0) {
        const pacSnap = await db.collection(COLLECTIONS.pacientes).get();
        pacientes = pacSnap.docs
            .filter(d => medicoIds.includes(d.data().doctor_id))
            .map(d => ({ _id: d.id, ...cleanForJson(d.data()) }));
    }
    const qslCodes = pacientes.map(p => p._id);

    // 3. Citas de estos médicos
    let citas = [];
    if (medicoIds.length > 0) {
        const citasSnap = await db.collection(COLLECTIONS.citas).get();
        citas = citasSnap.docs
            .filter(d => medicoIds.includes(d.data().doctor_id))
            .map(d => ({ _id: d.id, ...cleanForJson(d.data()) }));
    }

    // 4. Alertas de estos pacientes
    let alertas = [];
    if (qslCodes.length > 0) {
        const aSnap = await db.collection(COLLECTIONS.alertas_sistema).get();
        alertas = aSnap.docs
            .filter(d => qslCodes.includes(d.data().qsl_code))
            .map(d => ({ _id: d.id, ...cleanForJson(d.data()) }));
    }

    // 5. Historial de mensajes de estos médicos
    let historial = [];
    if (medicoIds.length > 0) {
        const hSnap = await db.collection(COLLECTIONS.historial_mensajes).get();
        historial = hSnap.docs
            .filter(d => medicoIds.includes(d.data().doctor_id))
            .map(d => ({ _id: d.id, ...cleanForJson(d.data()) }));
    }

    return {
        version: 1,
        proyecto: 'DR-SISDEL',
        fecha: new Date().toISOString(),
        id_centro,
        nombre_centro: centro.nombre || '(sin nombre)',
        centro: { _id: centroDoc.id, ...cleanForJson(centro) },
        medicos,
        pacientes,
        citas,
        alertas,
        historial_mensajes: historial,
        stats: {
            medicos: medicos.length,
            pacientes: pacientes.length,
            citas: citas.length,
            alertas: alertas.length,
            historial_mensajes: historial.length
        }
    };
}

/**
 * Guarda el JSON en Storage (preferido) y registra metadatos en Firestore.
 * Si Storage no está disponible, guarda el payload dentro del propio documento de Firestore.
 */
async function persistBackup(snapshot, { tipo = 'auto', etiqueta = null } = {}) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${snapshot.id_centro}_${ts}.json`;
    const json = JSON.stringify(snapshot, null, 2);
    const sizeBytes = Buffer.byteLength(json, 'utf8');

    let storageUrl = null;
    let storagePath = null;
    let inlinePayload = null;

    if (bucket) {
        try {
            storagePath = `backups/${snapshot.id_centro}/${filename}`;
            const file = bucket.file(storagePath);
            await file.save(json, {
                contentType: 'application/json',
                metadata: { metadata: { id_centro: snapshot.id_centro, tipo } }
            });
            // URL firmada de larga duración para descarga directa
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 1000 * 60 * 60 * 24 * 7  // 7 días
            });
            storageUrl = signedUrl;
        } catch (e) {
            console.warn(`⚠️  No se pudo subir a Storage (${e.message}). Guardando inline en Firestore.`);
            inlinePayload = json;
            storagePath = null;
            storageUrl = null;
        }
    } else {
        inlinePayload = json;
    }

    const meta = {
        id_centro: snapshot.id_centro,
        nombre_centro: snapshot.nombre_centro,
        filename,
        tipo,            // 'auto' | 'manual'
        etiqueta,        // texto libre opcional (ej. "Antes de migración v2")
        size_bytes: sizeBytes,
        stats: snapshot.stats,
        storage_path: storagePath,
        storage_url: storageUrl,
        url_expires_at: storageUrl ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString() : null,
        payload_inline: inlinePayload,  // solo si Storage no estuvo disponible
        created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection(COLLECTIONS.backups_registro).add(meta);
    return { id: ref.id, ...meta };
}

/**
 * Aplica retención: borra backups (Firestore + Storage) más antiguos que retentionDays.
 * No borra los que tengan campo `etiqueta` (backups marcados manualmente).
 */
async function applyRetention(retentionDays = DEFAULT_RETENTION_DAYS) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const snap = await db.collection(COLLECTIONS.backups_registro).get();
    let deleted = 0;

    for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (d.etiqueta) continue;  // los etiquetados son "permanentes"
        const created = d.created_at?.toMillis?.() || 0;
        if (created && created < cutoff) {
            if (d.storage_path && bucket) {
                try { await bucket.file(d.storage_path).delete({ ignoreNotFound: true }); }
                catch (e) { console.warn('No se pudo borrar de Storage:', d.storage_path, e.message); }
            }
            await docSnap.ref.delete();
            deleted++;
        }
    }
    return deleted;
}

/**
 * Backup de UNA empresa (centro_medico).
 */
async function backupCentro(id_centro, opts = {}) {
    const centroSnap = await db.collection(COLLECTIONS.centros_medicos)
        .where('id_centro', '==', id_centro)
        .limit(1)
        .get();
    if (centroSnap.empty) throw new Error(`Centro no encontrado: ${id_centro}`);
    const snapshot = await buildCentroSnapshot(centroSnap.docs[0]);
    return await persistBackup(snapshot, opts);
}

/**
 * Backup de TODAS las empresas. Devuelve un array de metadatos.
 */
async function runBackup(opts = {}) {
    const { tipo = 'auto', retentionDays = DEFAULT_RETENTION_DAYS } = opts;
    console.log(`🔌 Iniciando backup (${tipo}) — ${new Date().toISOString()}`);

    const centrosSnap = await db.collection(COLLECTIONS.centros_medicos).get();
    const centros = centrosSnap.docs.filter(d => !d.data().deleted);
    console.log(`📋 ${centros.length} empresas encontradas.`);

    const results = [];
    for (const centroDoc of centros) {
        const centroData = centroDoc.data();
        const id_centro = centroData.id_centro || centroDoc.id;
        const nombre = centroData.nombre || id_centro;
        process.stdout.write(`📦 ${nombre} (${id_centro})... `);
        try {
            const snapshot = await buildCentroSnapshot(centroDoc);
            const meta = await persistBackup(snapshot, { tipo });
            results.push({ ok: true, id_centro, nombre, meta });
            console.log(`✅ ${snapshot.stats.pacientes} pacs · ${snapshot.stats.medicos} méds · ${(meta.size_bytes / 1024).toFixed(1)} KB`);
        } catch (e) {
            results.push({ ok: false, id_centro, nombre, error: e.message });
            console.log(`❌ ${e.message}`);
        }
    }

    // Retención
    try {
        const deleted = await applyRetention(retentionDays);
        if (deleted > 0) console.log(`🧹 Retención (${retentionDays}d): ${deleted} backup(s) antiguos eliminados.`);
    } catch (e) {
        console.warn('⚠️  Error aplicando retención:', e.message);
    }

    const ok = results.filter(r => r.ok).length;
    console.log(`\n✅ Backup terminado: ${ok}/${results.length} empresas OK.`);
    return results;
}

// =========================================================
// MODO STANDALONE: node backup-firestore.js [id_centro]
// =========================================================
if (require.main === module) {
    (async () => {
        try {
            await initDB();
            const arg = process.argv[2];
            if (arg) {
                const meta = await backupCentro(arg, { tipo: 'manual' });
                console.log('✅ Backup OK:', meta.filename);
            } else {
                await runBackup({ tipo: 'auto' });
            }
            process.exit(0);
        } catch (err) {
            console.error('❌ Error en backup:', err.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    runBackup,
    backupCentro,
    buildCentroSnapshot,
    persistBackup,
    applyRetention,
    DEFAULT_RETENTION_DAYS
};
