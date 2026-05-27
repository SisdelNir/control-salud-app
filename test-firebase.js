// Script de verificación de conexión a Firebase / Firestore
// Uso: node test-firebase.js
// Requiere: serviceAccountKey.json en la raíz (o FIREBASE_SERVICE_ACCOUNT en .env)

const { db, COLLECTIONS, initDB } = require('./db');

(async () => {
    try {
        console.log('🔌 Conectando a Firestore...');
        await initDB();

        console.log('\n📝 Escribiendo documento de prueba...');
        const testRef = db.collection('_test_conexion').doc('ping');
        await testRef.set({
            mensaje: 'Hola desde DR-SISDEL',
            timestamp: new Date().toISOString()
        });
        console.log('   ✅ Escritura exitosa');

        console.log('\n📖 Leyendo documento de prueba...');
        const snap = await testRef.get();
        console.log('   ✅ Lectura exitosa:', snap.data());

        console.log('\n🧹 Borrando documento de prueba...');
        await testRef.delete();
        console.log('   ✅ Borrado exitoso');

        console.log('\n📚 Colecciones esperadas en DR-SISDEL:');
        Object.values(COLLECTIONS).forEach(c => console.log('   -', c));

        console.log('\n✅ TODO FUNCIONANDO. Firebase está listo.');
        console.log('   Ya puedes ejecutar: npm start');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        console.error('\nRevisa FIREBASE_SETUP.md secciones 1-3 (crear proyecto y descargar credenciales).');
        process.exit(1);
    }
})();
