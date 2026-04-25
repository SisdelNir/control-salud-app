const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Initialize DB
db.initDB();

// --- API Endpoints ---

// Verify patient and get name
app.get('/api/patient/:qsl/verify', async (req, res) => {
    try {
        const { qsl } = req.params;
        const result = await db.query('SELECT data FROM pacientes WHERE qsl_code = $1', [qsl]);
        if (result.rows.length === 0) {
            return res.json({ success: false });
        }
        const name = result.rows[0].data.nombre_completo || qsl;
        res.json({ success: true, name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Get full patient data payload
app.get('/api/patient/:qsl', async (req, res) => {
    try {
        const { qsl } = req.params;
        const result = await db.query('SELECT data, alerts_enabled FROM pacientes WHERE qsl_code = $1', [qsl]);
        if (result.rows.length === 0) {
            return res.json({ success: false, data: { illness: '', meds: [] } });
        }
        res.json({ success: true, data: result.rows[0].data, alerts_enabled: result.rows[0].alerts_enabled });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Save patient data (ensures name is searchable)
app.post('/api/patient/:qsl', async (req, res) => {
    try {
        const { qsl } = req.params;
        const { data } = req.body;
        await db.query(
            'INSERT INTO pacientes (qsl_code, data) VALUES ($1, $2) ON CONFLICT (qsl_code) DO UPDATE SET data = $2',
            [qsl, data]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Doctor login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { pass } = req.body;
        if (pass === '1122') {
            return res.json({ success: true, role: 'medico', id: 'MED-MASTER', name: 'Administrador Principal' });
        }

        // Check if it's an Admin General
        const centroResult = await db.query('SELECT * FROM centros_medicos WHERE admin_code = $1', [pass]);
        if (centroResult.rows.length > 0) {
            const centro = centroResult.rows[0];
            return res.json({ success: true, role: 'admin_general', id_centro: centro.id_centro, name: 'Administrador Central', nombre_centro: centro.nombre, max_medicos: centro.max_medicos });
        }

        const passHash = Buffer.from(pass).toString('base64');
        const result = await db.query('SELECT id_medico, data FROM medicos');
        const medico = result.rows.find(r => 
            r.data.usuario.toUpperCase() === pass.toUpperCase() || 
            r.data.password_hash === passHash
        );
        
        if (medico) {
            return res.json({ success: true, role: 'medico', id: medico.id_medico, name: medico.data.nombre_completo, data: medico.data });
        }
        
        res.json({ success: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Toggle patient alerts
app.post('/api/patient/:qsl/alerts', async (req, res) => {

    try {
        const { qsl } = req.params;
        const { enabled } = req.body;
        await db.query(
            'INSERT INTO pacientes (qsl_code, alerts_enabled) VALUES ($1, $2) ON CONFLICT (qsl_code) DO UPDATE SET alerts_enabled = $2',
            [qsl, enabled]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Get/Update medicos (Stored in JSON for simplicity or can be expanded)
app.get('/api/medicos', async (req, res) => {
    try {
        const result = await db.query('SELECT id_medico, data FROM medicos');
        const medicos = result.rows.map(r => ({ id_medico: r.id_medico, ...r.data }));
        res.json({ success: true, medicos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/medico/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        await db.query(
            'INSERT INTO medicos (id_medico, data) VALUES ($1, $2) ON CONFLICT (id_medico) DO UPDATE SET data = $2',
            [id, data]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/medico/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM medicos WHERE id_medico = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Centros Medicos routes
app.get('/api/centros', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM centros_medicos');
        res.json({ success: true, centros: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/centro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, admin_code, max_medicos, admin_nombre, admin_id, admin_telefono, admin_correo } = req.body;
        await db.query(
            'INSERT INTO centros_medicos (id_centro, nombre, admin_code, max_medicos, admin_nombre, admin_id, admin_telefono, admin_correo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id_centro) DO UPDATE SET nombre = $2, admin_code = $3, max_medicos = $4, admin_nombre = $5, admin_id = $6, admin_telefono = $7, admin_correo = $8',
            [id, nombre, admin_code, max_medicos, admin_nombre, admin_id, admin_telefono, admin_correo]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/centro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM centros_medicos WHERE id_centro = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === NUBE: Citas / Agenda ===
app.get('/api/appointments', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        const result = await db.query('SELECT * FROM citas WHERE doctor_id = $1 ORDER BY fecha ASC, hora ASC', [doctor_id]);
        res.json({ success: true, appointments: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/appointments', async (req, res) => {
    try {
        const { doctor_id, qsl_code, paciente_nombre, fecha, hora, motivo } = req.body;
        await db.query(
            'INSERT INTO citas (doctor_id, qsl_code, paciente_nombre, fecha, hora, motivo) VALUES ($1, $2, $3, $4, $5, $6)',
            [doctor_id, qsl_code, paciente_nombre, fecha, hora, motivo]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.delete('/api/appointments', async (req, res) => {
    try {
        const { doctor_id, qsl_code, fecha, hora } = req.body;
        await db.query('DELETE FROM citas WHERE doctor_id = $1 AND qsl_code = $2 AND fecha = $3 AND hora = $4', [doctor_id, qsl_code, fecha, hora]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === NUBE: Alertas del Sistema para el Paciente ===
app.get('/api/patient/:qsl/alerts/messages', async (req, res) => {
    try {
        const { qsl } = req.params;
        const result = await db.query('SELECT * FROM alertas_sistema WHERE qsl_code = $1 ORDER BY created_at DESC', [qsl]);
        res.json({ success: true, alerts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/patient/:qsl/alerts/messages', async (req, res) => {
    try {
        const { qsl } = req.params;
        const { id, mensaje, leido } = req.body;
        await db.query(
            'INSERT INTO alertas_sistema (id, qsl_code, mensaje, leido) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET leido = $4',
            [id, qsl, mensaje, leido]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


// === NUBE: Historial de Mensajes del Médico ===
app.get('/api/messages/history', async (req, res) => {
    try {
        const { doctor_id } = req.query;
        const result = await db.query('SELECT * FROM historial_mensajes WHERE doctor_id = $1 ORDER BY created_at DESC', [doctor_id]);
        res.json({ success: true, history: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/messages/history', async (req, res) => {
    try {
        const { id, doctor_id, mensaje, canal, grupo_objetivo, cantidad_destinatarios, nombres_destinatarios } = req.body;
        await db.query(
            'INSERT INTO historial_mensajes (id, doctor_id, mensaje, canal, grupo_objetivo, cantidad_destinatarios, nombres_destinatarios) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [id, doctor_id, mensaje, canal, grupo_objetivo, cantidad_destinatarios, JSON.stringify(nombres_destinatarios)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});


app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

