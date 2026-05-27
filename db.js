const admin = require('firebase-admin');
require('dotenv').config();

// Inicializar Firebase Admin SDK
// Soporta dos modos de credenciales:
//   1) GOOGLE_APPLICATION_CREDENTIALS apuntando a un archivo JSON (recomendado en local)
//   2) FIREBASE_SERVICE_ACCOUNT con el JSON completo en una variable de entorno (recomendado en Render/Cloud)
if (!admin.apps.length) {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        credential = admin.credential.applicationDefault();
    } else {
        try {
            const serviceAccount = require('./serviceAccountKey.json');
            credential = admin.credential.cert(serviceAccount);
        } catch (e) {
            console.error('No se encontraron credenciales de Firebase. Configura FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS o coloca serviceAccountKey.json en la raíz del proyecto.');
            throw e;
        }
    }
    admin.initializeApp({ credential });
}

const db = admin.firestore();

// Nombres de las colecciones (equivalentes a las antiguas tablas)
const COLLECTIONS = {
    pacientes: 'pacientes',
    centros_medicos: 'centros_medicos',
    medicos: 'medicos',
    citas: 'citas',
    alertas_sistema: 'alertas_sistema',
    historial_mensajes: 'historial_mensajes'
};

async function initDB() {
    // Firestore es schemaless: las colecciones se crean al insertar el primer documento.
    // No hay nada que hacer aquí salvo verificar conectividad.
    try {
        await db.listCollections();
        console.log('Firestore conectado correctamente');
    } catch (err) {
        console.error('Error conectando a Firestore:', err);
        throw err;
    }
}

module.exports = {
    db,
    admin,
    COLLECTIONS,
    initDB
};
