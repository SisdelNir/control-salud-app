// Re-captura el Módulo Programador modificando el DOM para mostrar HOSPITAL MONTEREY
const puppeteer = require('puppeteer');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'screenshots');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Login como MED-MASTER
    await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
        localStorage.setItem('user_real_name', 'Dr. Roberto Gómez');
        localStorage.setItem('user_role', 'medico');
        localStorage.setItem('user_qsl_code', 'MED-MASTER');
        localStorage.setItem('current_doctor_id', 'MED-MASTER');
        localStorage.setItem('sisdel_tema', 'tema-oscuro');
    });

    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3500));

    // Navegar al módulo Programador
    await page.evaluate(() => {
        const link = document.querySelector('li[data-section="programmer"]');
        if (link) link.click();
    });
    await new Promise(r => setTimeout(r, 3500));

    // Modificar el DOM: reemplazar todos los textos "HOSPITAL PILAR" por "HOSPITAL MONTEREY"
    await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        const nodesToFix = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue && node.nodeValue.includes('HOSPITAL PILAR')) {
                nodesToFix.push(node);
            }
            if (node.nodeValue && node.nodeValue.includes('Hospital Pilar')) {
                nodesToFix.push(node);
            }
        }
        nodesToFix.forEach(n => {
            n.nodeValue = n.nodeValue.replace(/HOSPITAL PILAR/g, 'HOSPITAL RENUEVO');
            n.nodeValue = n.nodeValue.replace(/HOSPITAL MONTEREY/g, 'HOSPITAL RENUEVO');
            n.nodeValue = n.nodeValue.replace(/Hospital Pilar/g, 'Hospital Renuevo');
        });
    });
    await new Promise(r => setTimeout(r, 500));

    console.log('📸 Capturando con HOSPITAL MONTEREY');
    await page.screenshot({ path: path.join(OUT_DIR, '06_programador.png') });

    await browser.close();
    console.log('✅ Listo');
})();
