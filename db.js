const admin = require('firebase-admin');
require('dotenv').config();

// Inicializar Firebase Admin SDK
// Soporta dos modos de credenciales:
//   1) GOOGLE_APPLICATION_CREDENTIALS apuntando a un archivo JSON (recomendado en local)
//   2) FIREBASE_SERVICE_ACCOUNT con el JSON completo en una variable de entorno (recomendado en Render/Cloud)
let _projectId = null;
if (!admin.apps.length) {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
        _projectId = serviceAccount.project_id;
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        credential = admin.credential.applicationDefault();
    } else {
        try {
            const serviceAccount = require('./serviceAccountKey.json');
            credential = admin.credential.cert(serviceAccount);
            _projectId = serviceAccount.project_id;
        } catch (e) {
            console.error('No se encontraron credenciales de Firebase. Configura FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS o coloca serviceAccountKey.json en la raíz del proyecto.');
            throw e;
        }
    }
    // Bucket de Storage: se permite override por env var (FIREBASE_STORAGE_BUCKET)
    // Default: <project-id>.appspot.com (formato clásico de Firebase Storage)
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET
        || (_projectId ? `${_projectId}.appspot.com` : undefined);
    admin.initializeApp({ credential, storageBucket });
}

const db = admin.firestore();
const storage = admin.storage();
// El bucket puede no existir si Storage no está activado en la consola Firebase.
// Los backups intentarán usarlo y caerán a fallback (Firestore) si no está disponible.
let _bucket = null;
try { _bucket = storage.bucket(); } catch (e) { _bucket = null; }

// Nombres de las colecciones (equivalentes a las antiguas tablas)
const COLLECTIONS = {
    pacientes: 'pacientes',
    centros_medicos: 'centros_medicos',
    medicos: 'medicos',
    citas: 'citas',
    alertas_sistema: 'alertas_sistema',
    historial_mensajes: 'historial_mensajes',
    backups_registro: 'backups_registro'  // metadatos de cada backup generado
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
    storage,
    bucket: _bucket,
    COLLECTIONS,
    initDB
};
