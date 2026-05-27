// =========================================================
// Script one-shot: deduplica citas existentes en Firestore
// =========================================================
// Limpia los duplicados causados por la versión anterior del endpoint
// POST /api/appointments (que usaba .add() sin ID determinístico y
// generaba un documento nuevo en cada reintento de red).
//
// Estrategia:
//   1. Lee TODAS las citas no-soft-deleted.
//   2. Agrupa por clave (doctor_id, qsl_code, fecha, hora).
//   3. Para cada grupo deja UN solo documento (el más reciente por
//      created_at/updated_at) y soft-deletea los demás.
//   4. Imprime un reporte: cuántos grupos, cuántos duplicados eliminados.
//
// Uso:
//   node dedupe-citas.js              → modo "dry-run" (solo muestra qué haría)
//   node dedupe-citas.js --apply      → ejecuta el soft-delete
//
// =========================================================

const { db, admin, COLLECTIONS, initDB } = require('./db');

const APPLY = process.argv.includes('--apply');

(async () => {
    try {
        console.log(`🔌 Conectando a Firestore... (modo: ${APPLY ? 'APPLY' : 'DRY-RUN'})`);
        await initDB();

        const snap = await db.collection(COLLECTIONS.citas).get();
        console.log(`📋 ${snap.size} documentos totales en 'citas'.`);

        const groups = new Map();   // clave → [{ ref, data, ts }]
        let alreadyDeleted = 0;

        snap.docs.forEach(d => {
            const data = d.data();
            if (data.deleted) { alreadyDeleted++; return; }
            const key = `${data.doctor_id}|${data.qsl_code}|${data.fecha}|${data.hora}`;
            const ts = data.updated_at?.toMillis?.() || data.created_at?.toMillis?.() || 0;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ ref: d.ref, id: d.id, data, ts });
        });

        let totalDup = 0;
        const toDelete = [];
        const dupGroups = [];

        for (const [key, items] of groups.entries()) {
            if (items.length <= 1) continue;
            // Ordena por timestamp desc → conserva el primero (más reciente)
            items.sort((a, b) => b.ts - a.ts);
            const keep = items[0];
            const dups = items.slice(1);
            totalDup += dups.length;
            dupGroups.push({ key, kept: keep.id, paciente: keep.data.paciente_nombre, count: items.length });
            dups.forEach(d => toDelete.push(d));
        }

        console.log(`\n📊 Reporte:`);
        console.log(`   - Soft-deleted previos: ${alreadyDeleted}`);
        console.log(`   - Grupos únicos (cita lógica): ${groups.size}`);
        console.log(`   - Grupos CON duplicados: ${dupGroups.length}`);
        console.log(`   - Total docs duplicados a eliminar: ${totalDup}`);

        if (dupGroups.length > 0) {
            console.log(`\n🔍 Primeros 20 grupos duplicados:`);
            dupGroups.slice(0, 20).forEach(g => {
                console.log(`   ${g.paciente || '?'} · ${g.key} → ${g.count} copias (se conserva ${g.kept})`);
            });
        }

        if (!APPLY) {
            console.log(`\n✋ DRY-RUN: no se eliminó nada. Para aplicar el soft-delete corre:\n   node dedupe-citas.js --apply`);
            process.exit(0);
        }

        if (toDelete.length === 0) {
            console.log(`\n✅ Sin duplicados que eliminar.`);
            process.exit(0);
        }

        console.log(`\n🗑  Aplicando soft-delete a ${toDelete.length} documentos duplicados...`);

        // Firestore batch: máximo 500 ops por batch
        const CHUNK = 400;
        for (let i = 0; i < toDelete.length; i += CHUNK) {
            const batch = db.batch();
            const chunk = toDelete.slice(i, i + CHUNK);
            chunk.forEach(d => batch.update(d.ref, {
                deleted: true,
                deleted_at: admin.firestore.FieldValue.serverTimestamp(),
                deleted_reason: 'duplicate_cleanup'
            }));
            await batch.commit();
            console.log(`   ✔ Batch ${Math.floor(i / CHUNK) + 1}: ${chunk.length} docs marcados.`);
        }

        console.log(`\n✅ Limpieza completa. ${toDelete.length} duplicados soft-deleted.`);
        console.log(`   Los originales conservados aparecerán en la agenda normalmente.`);
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Error:', err);
        process.exit(1);
    }
})();
