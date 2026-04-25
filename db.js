const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Inicializar tablas si no existen
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS pacientes (
                qsl_code TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
                alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS centros_medicos (
                id_centro VARCHAR(255) PRIMARY KEY,
                nombre VARCHAR(255),
                admin_code VARCHAR(255),
                max_medicos INTEGER,
                admin_nombre VARCHAR(255),
                admin_id VARCHAR(255),
                admin_telefono VARCHAR(255),
                admin_correo VARCHAR(255)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS medicos (
                id_medico TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // --- Tablas de nueva Migración a la Nube ---
        
        // 1. Citas / Agenda
        await client.query(`
            CREATE TABLE IF NOT EXISTS citas (
                id SERIAL PRIMARY KEY,
                doctor_id VARCHAR(255) NOT NULL,
                qsl_code VARCHAR(255) NOT NULL,
                paciente_nombre VARCHAR(255),
                fecha DATE NOT NULL,
                hora VARCHAR(50) NOT NULL,
                motivo TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 2. Alertas del Sistema para el Paciente
        await client.query(`
            CREATE TABLE IF NOT EXISTS alertas_sistema (
                id VARCHAR(255) PRIMARY KEY,
                qsl_code VARCHAR(255) NOT NULL,
                mensaje TEXT NOT NULL,
                leido BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Historial de Mensajería Masiva
        await client.query(`
            CREATE TABLE IF NOT EXISTS historial_mensajes (
                id VARCHAR(255) PRIMARY KEY,
                doctor_id VARCHAR(255) NOT NULL,
                mensaje TEXT NOT NULL,
                canal VARCHAR(50),
                grupo_objetivo VARCHAR(100),
                cantidad_destinatarios INTEGER,
                nombres_destinatarios JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Database initialized');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        client.release();
    }
}

module.exports = {
    query: (text, params) => pool.query(text, params),
    initDB
};

