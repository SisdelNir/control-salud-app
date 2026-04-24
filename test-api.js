const fetch = require('node-fetch'); // Assuming node-fetch is available or using globally in modern node

async function testAPI() {
    const baseUrl = 'http://localhost:3000';
    console.log('Starting API verification...');

    // 1. Test Patient Verification
    try {
        const resp = await fetch(`${baseUrl}/api/patient/TEST-001/verify`);
        const result = await resp.json();
        console.log('Patient Verify (New):', result);
    } catch (e) { console.log('Patient Verify Failed (Expected if not started)'); }

    // 2. Test Doctor Login
    try {
        const resp = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pass: '1122' })
        });
        const result = await resp.json();
        console.log('Master Login:', result);
    } catch (e) { console.log('Login Test Failed'); }

    // 3. Test Saving Patient
    try {
        const resp = await fetch(`${baseUrl}/api/patient/TEST-001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { nombre_completo: 'Test Patient', meds: [] } })
        });
        const result = await resp.json();
        console.log('Save Patient:', result);
    } catch (e) { console.log('Save Patient Failed'); }

    // 4. Test Toggle Alerts
    try {
        const resp = await fetch(`${baseUrl}/api/patient/TEST-001/alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        const result = await resp.json();
        console.log('Toggle Alerts:', result);
    } catch (e) { console.log('Toggle Alerts Failed'); }

    console.log('Verification finished.');
}

// testAPI(); // Uncomment to run if node-fetch is available
console.log('Test script created. Run with node test.js in a session with the server running.');
