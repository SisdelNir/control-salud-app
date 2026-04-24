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

        const passHash = Buffer.from(pass).toString('base64');
        const result = await db.query('SELECT id_medico, data FROM medicos');
        const medico = result.rows.find(r => 
            r.data.usuario.toUpperCase() === pass.toUpperCase() || 
            r.data.password_hash === passHash
        );
        
        if (medico) {
            return res.json({ success: true, role: 'medico', id: medico.id_medico, name: medico.data.nombre_completo });
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


app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

