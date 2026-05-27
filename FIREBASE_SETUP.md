# Migración a Firebase / Firestore - DR-SISDEL

Esta guía te lleva paso a paso desde cero hasta tener el proyecto corriendo en Firebase.

## 1. Crear el proyecto en Firebase

1. Entra a https://console.firebase.google.com
2. Haz clic en **"Agregar proyecto"**.
3. Nombre: `dr-sisdel` (o el que prefieras). Continuar.
4. Google Analytics: puedes desactivarlo (no es necesario).
5. Espera a que se cree el proyecto.

## 2. Habilitar Firestore

1. Dentro del proyecto, en el menú izquierdo: **Build → Firestore Database**.
2. Clic en **"Crear base de datos"**.
3. Modo: **Producción** (más seguro). Continuar.
4. Ubicación: elige una cercana (ej. `southamerica-east1` o `us-central1`).
5. Habilitar.

## 3. Descargar las credenciales (Service Account)

1. En la consola, clic en el engranaje arriba a la izquierda → **Configuración del proyecto**.
2. Pestaña **Cuentas de servicio**.
3. Clic en **"Generar nueva clave privada"** → **Generar clave**.
4. Se descargará un archivo JSON. **NO lo subas a git**.
5. Renómbralo a `serviceAccountKey.json` y colócalo en la raíz del proyecto:
   ```
   /Users/nir/Desktop/DR-SISDEL/serviceAccountKey.json
   ```

> Ya está en `.gitignore` para que no se suba accidentalmente.

## 4. Instalar dependencias

Desde la raíz del proyecto:

```bash
npm install
```

Esto instalará `firebase-admin` y quitará automáticamente `pg`.

## 5. Probar localmente

```bash
npm start
```

Deberías ver:
```
Firestore conectado correctamente
Servidor corriendo en http://localhost:3000
```

## 6. Reglas de seguridad de Firestore (opcional pero recomendado)

Como el backend usa Firebase Admin SDK, **ignora las reglas de seguridad** (acceso total).
Pero si en el futuro quieres acceder desde el cliente directamente, ve a:
**Firestore → Reglas** y configura algo como:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;  // Solo backend con Admin SDK
    }
  }
}
```

## 7. Deploy en Render (u otro hosting)

En Render, en lugar de subir el archivo JSON, agrega esta variable de entorno:

- **Clave:** `FIREBASE_SERVICE_ACCOUNT`
- **Valor:** el contenido COMPLETO del JSON en una sola línea.

`db.js` ya está configurado para leer esta variable automáticamente.

También configura:
- `PORT=3000`
- `NODE_ENV=production`

## Estructura de datos en Firestore

Las antiguas tablas de PostgreSQL ahora son **colecciones** en Firestore:

| Antes (PostgreSQL)    | Ahora (Firestore)        | ID del documento     |
|-----------------------|--------------------------|----------------------|
| `pacientes`           | `pacientes`              | `qsl_code`           |
| `centros_medicos`     | `centros_medicos`        | `id_centro`          |
| `medicos`             | `medicos`                | `id_medico`          |
| `citas`               | `citas`                  | auto-generado        |
| `alertas_sistema`     | `alertas_sistema`        | `id` (proporcionado) |
| `historial_mensajes`  | `historial_mensajes`     | `id` (proporcionado) |

Las colecciones se crean automáticamente al insertar el primer documento. No necesitas hacer nada manualmente.

## Endpoints

Todos los endpoints REST en `server.js` siguen funcionando **exactamente igual** que antes. El frontend (`dashboard.js`, `index.html`) no requiere cambios.

## Eliminar Supabase

Cuando confirmes que todo funciona en Firebase, puedes:
1. Pausar o eliminar el proyecto en Supabase.
2. Quitar la variable `DATABASE_URL` del hosting (Render, etc.).
