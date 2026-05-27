// Configuración de Firebase Web SDK para DR-SISDEL
// Estos valores son públicos (apiKey != admin key); la seguridad real vive
// en las Firestore Security Rules.
const FIREBASE_CONFIG = {
    projectId: 'dr-sisdel',
    appId: '1:1015447392518:web:7a05ebe479f392b0b08e87',
    storageBucket: 'dr-sisdel.firebasestorage.app',
    apiKey: 'AIzaSyDBCgMLd8VlgXk1knZdAmIl1lV1qQvF0M4',
    authDomain: 'dr-sisdel.firebaseapp.com',
    messagingSenderId: '1015447392518',
    measurementId: 'G-49GXM7DXZN'
};

// Inicializar Firebase (carga vía compat para no requerir bundler)
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// Exponer para que otros módulos lo usen
window.firebaseDb = db;
window.firebaseFieldValue = firebase.firestore.FieldValue;
