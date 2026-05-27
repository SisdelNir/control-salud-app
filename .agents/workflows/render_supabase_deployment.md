---
description: Guía experta paso a paso para conectar de forma exitosa y sin errores una base de datos de Supabase con Render.
---

# Guía Paso a Paso: Conexión de Supabase a Render

Esta guía nació tras un análisis profundo de los errores más comunes al intentar vincular Supabase con un entorno moderno como Render. Si el proyecto estuvo en pausa o es una migración nueva, sigue **exclusivamente** estos pasos para esquivar problemas de compatibilidad (IPv6) o de enrutadores oxidados (Tenant not found):

### Paso 1: Certificar la Contraseña (El candado inicial)
Si el proyecto se "congeló" por inactividad o tienes dudas de la clave, empieza por aquí para no perder tiempo adivinando:
1. Ve al panel principal de tu proyecto en Supabase.
2. En el menú lateral izquierdo, haz clic en **`Project Settings`** (el ícono del engrane) > **`Database`**.
3. Baja ligeramente hasta encontrar el recuadro "Database password" y haz clic en el botón **`Reset password`**.
4. Escribe una nueva clave. **Regla de oro:** No uses corchetes `[ ]` ni símbolos extremadamente raros para evitar rupturas de sintaxis en el enlace. (Ej: `MiClaveSegura2026`).

### Paso 2: Extraer el Enlace Oficial con "Session Pooler" (La ruta obligatoria de Render)
Render (en sus planes normales gratis) no soporta redes de última hipergeneración (IPv6). Por tanto, *jamás* podrás conectarlo usando simplemente el host directo clásico; usarlo lanzará un gigantesco error `ENETUNREACH`. Tenemos que usar el puente intermedio (Pooler) en su modalidad segura:
1. En Supabase, sube la mirada al marco negro superior y haz clic en el botón central de **`Connect 🔌`**.
2. En la pequeña ventana que se despliega encimada, no te quedes en Framework. Haz clic en la **segunda pestaña superior** que se llama **`Direct (Connection string)`**.
3. Cambia la selección redonda y marca exclusivamente la tercera opción: **`Session pooler`** (esto forzará el uso del puerto mágico `5432` con un enrutador IPv4).
4. El cuadro inferior de "1. Connection string" se iluminará. Ese es tu enlace sagrado. Únicamente usa el botón de "Copy" para llevártelo *intacto*. 

### Paso 3: Inyección Segura en Render (Aquí suceden los "errores de dedo")
1. Abre tu panel maestro de Render y ve a la sección izquierda morada de **`Environment`**.
2. Ubica la fila del título `DATABASE_URL`. Borra absolutamente todo lo que haya en la caja vacía.
3. Pega tu nuevo enlace copiado tal cual.
4. Con el cuidado de un cirujano clínico, ponte sobre el enlace, borra EXACTAMENTE el corchete de `[YOUR-PASSWORD]` e inserta tu contraseña real del Paso 1. 

**⚠️ ALERTA DE PUNTO DE QUIEBRE:**
Asegúrate de no haber borrado el símbolo de arroba (`@`) que separa tu contraseña del inicio de la dirección del servidor (como `aws-1-us...`). Si borraste el `@` y escribiste una `a` o lo quitaste completo, las puertas no se abrirán y escupirá error de "Password auth failed".

### Paso 4: Encendido y Despegue
1. Haz clic en **`Save, rebuild, and deploy`**.
2. Para evitar dolores de estómago esperando, salta al menú de la izquierda y haz clic en la bitácora de **`Logs`**.
3. Verás cómo las computadoras se comunican en forma de letitas bajando rápidamente. Espera silenciosamente un minuto. Todo está bien.
4. El proceso culminará en gloria absoluta al ver aparecer un flamante rectángulo verde en la esquina con la palabra **`Live`**.
