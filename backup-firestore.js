// Script de backup de Firestore → archivo JSON local
// Uso: node backup-firestore.js
// Guarda un archivo: backup_YYYY-MM-DD_HH-MM.json en la raíz del proyecto

const { db, COLLECTIONS, initDB } = require('./db');
const fs = require('fs');

(async () => {
    try {
        console.log('🔌 Conectando a Firestore...');
        await initDB();

        const backup = {
            fecha: new Date().toISOString(),
            proyecto: 'DR-SISDEL',
            colecciones: {}
        };

        let totalDocs = 0;

        for (const coleccion of Object.values(COLLECTIONS)) {
            process.stdout.write(`📦 Exportando: ${coleccion}... `);
            const snap = await db.collection(coleccion).get();
            backup.colecciones[coleccion] = [];

            snap.forEach(doc => {
                const data = doc.data();
                // Convertir Timestamps de Firestore a strings legibles
                const cleaned = JSON.parse(JSON.stringify(data, (key, value) => {
                    if (value && typeof value === 'object' && value._seconds !== undefined) {
                        return new Date(value._seconds * 1000).toISOString();
                    }
                    return value;
                }));
                backup.colecciones[coleccion].push({ _id: doc.id, ...cleaned });
                totalDocs++;
            });

            console.log(`${snap.size} documentos`);
        }

        // Nombre del archivo con fecha y hora
        const ahora = new Date();
        const timestamp = ahora.toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const filename = `backup_${timestamp}.json`;
        const filepath = `./${filename}`;

        fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');

        console.log(`\n✅ Backup completado:`);
        console.log(`   📄 Archivo: ${filename}`);
        console.log(`   📊 Total documentos: ${totalDocs}`);
        console.log(`   💾 Tamaño: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
        console.log(`\n⚠️  Guarda este archivo en un lugar seguro (Google Drive, USB, etc).`);

        process.exit(0);
    } catch (err) {
        console.error('\n❌ Error en backup:', err.message);
        process.exit(1);
    }
})();
