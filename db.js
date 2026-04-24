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
            CREATE TABLE IF NOT EXISTS medicos (
                id_medico TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
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

