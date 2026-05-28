// Genera video promocional DR-SISDEL con voz Charon (Gemini TTS) + slides
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

// ─── Configuración ────────────────────────────────────────────────────────
const API_KEY = fs.readFileSync(path.join(process.env.HOME, 'Desktop/eleven.txt'), 'utf8').trim().split('\n')[0].trim();
const SCRIPT_DIR = __dirname;
const OUT_DIR = path.join(SCRIPT_DIR, 'video_assets');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// Guion segmentado: cada item será un clip con su audio
const SCRIPT = [
    { id: '01', img: 'cover',          text: '¿Tu clínica todavía depende de cuadernos, llamadas y procesos manuales?', dur: 6 },
    { id: '02', img: '01_expediente',  text: 'Mientras unos pierden pacientes por desorganización, otros ya automatizan toda su operación con inteligencia artificial.', dur: 7 },
    { id: '03', img: 'cover',          text: 'Dr-Sisdel llegó para cambiar la forma de administrar la salud.', dur: 5 },
    { id: '04', img: '02_agenda',      text: 'Agenda virtual en la nube. Citas online. Sincronización automática.', dur: 6 },
    { id: '05', img: '01_expediente',  text: 'Expediente clínico completo, en tiempo real.', dur: 5 },
    { id: '06', img: '04_recordatorios', text: 'Recordatorios automáticos inteligentes que llevan a tus pacientes desde el amanecer hasta su turno.', dur: 7 },
    { id: '07', img: '07_portal_paciente', text: 'Recetas digitales directo al celular del paciente. Y alertas de medicación a la hora exacta.', dur: 7 },
    { id: '08', img: '03_consulta',    text: 'Mensajería masiva por WhatsApp. Monitoreo de glucosa y presión. Y funciona incluso sin internet.', dur: 7 },
    { id: '09', img: '06_programador', text: 'Menos administración. Más productividad. Pacientes más satisfechos.', dur: 5 },
    { id: '10', img: 'closing',        text: 'Dr-Sisdel. Para una clínica inteligente. Disponible en veintidós países. Solicita tu demostración gratuita hoy.', dur: 8 }
];

// ─── Llamar al API de Gemini TTS ──────────────────────────────────────────
function callGeminiTTS(text, outPath) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Charon' }
                    }
                }
            }
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.error) {
                        console.error('❌ API Error:', JSON.stringify(result.error).slice(0, 300));
                        return reject(new Error(result.error.message));
                    }
                    const audioB64 = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (!audioB64) {
                        console.error('❌ Respuesta inesperada:', body.slice(0, 300));
                        return reject(new Error('No audio in response'));
                    }
                    // Gemini devuelve PCM crudo a 24000Hz, 16-bit, mono
                    const pcmBuffer = Buffer.from(audioB64, 'base64');
                    // Construir cabecera WAV
                    const wav = pcmToWav(pcmBuffer, 24000, 1, 16);
                    fs.writeFileSync(outPath, wav);
                    resolve(outPath);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Convertir PCM crudo a WAV con cabecera
function pcmToWav(pcm, sampleRate, channels, bitsPerSample) {
    const blockAlign = channels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);            // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]);
}

// ─── Generar imágenes (cover + closing) ───────────────────────────────────
function generateBrandSlide(text, subtitle, outPath, isCover = true) {
    // Usar HTML + Puppeteer no, mejor con ffmpeg + drawtext directamente
    // Pero más fácil: usar sharp para componer
    const sharp = require('sharp');
    const w = 1920, h = 1080;

    // Fondo navy oscuro
    const svgContent = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0A1628"/>
                <stop offset="100%" stop-color="#0F1F3A"/>
            </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#bg)"/>
        ${isCover ? `
        <text x="${w/2}" y="${h/2 - 80}" font-family="Helvetica" font-size="40" fill="#00D4FF"
              text-anchor="middle" letter-spacing="6" font-weight="600">CLINICAL MANAGEMENT SOFTWARE</text>
        <line x1="${w/2 - 100}" y1="${h/2 - 30}" x2="${w/2 + 100}" y2="${h/2 - 30}" stroke="#00A8E8" stroke-width="4"/>
        <text x="${w/2}" y="${h/2 + 60}" font-family="Helvetica" font-size="100" fill="#FFFFFF"
              text-anchor="middle" font-weight="700">${text}</text>
        <text x="${w/2}" y="${h/2 + 160}" font-family="Helvetica" font-size="56" fill="#00D4FF"
              text-anchor="middle" font-style="italic">${subtitle}</text>
        ` : `
        <text x="${w/2}" y="${h/2 - 60}" font-family="Helvetica" font-size="130" fill="#FFFFFF"
              text-anchor="middle" font-weight="800">DR-SISDEL</text>
        <text x="${w/2}" y="${h/2 + 40}" font-family="Helvetica" font-size="50" fill="#00D4FF"
              text-anchor="middle" font-style="italic">${text}</text>
        <text x="${w/2}" y="${h/2 + 140}" font-family="Helvetica" font-size="36" fill="#CBD5E1"
              text-anchor="middle">${subtitle}</text>
        <rect x="${w/2 - 250}" y="${h/2 + 200}" width="500" height="80" rx="40" fill="#00A8E8"/>
        <text x="${w/2}" y="${h/2 + 253}" font-family="Helvetica" font-size="36" fill="#FFFFFF"
              text-anchor="middle" font-weight="700">🌎  Disponible en 22 países</text>
        `}
    </svg>`;

    return sharp(Buffer.from(svgContent)).png().toFile(outPath);
}

// ─── Main ─────────────────────────────────────────────────────────────────
(async () => {
    console.log('🎙️  Generando audio con voz Charon (Gemini TTS)...\n');

    // 1. Generar audio de cada segmento
    const audioPaths = [];
    for (const seg of SCRIPT) {
        const outAudio = path.join(OUT_DIR, `audio_${seg.id}.wav`);
        process.stdout.write(`  [${seg.id}] "${seg.text.slice(0, 50)}..."  `);
        try {
            await callGeminiTTS(seg.text, outAudio);
            const size = fs.statSync(outAudio).size;
            console.log(`✅ ${(size/1024).toFixed(0)} KB`);
            audioPaths.push({ ...seg, audioPath: outAudio });
        } catch (e) {
            console.log(`❌ ${e.message}`);
            throw e;
        }
        // Pequeña pausa entre llamadas
        await new Promise(r => setTimeout(r, 800));
    }

    // 2. Generar slides de portada y cierre
    console.log('\n🎨 Generando slides de portada y cierre...');
    await generateBrandSlide('LA CLÍNICA INTELIGENTE', 'del Futuro, disponible hoy',
        path.join(OUT_DIR, 'cover.png'), true);
    await generateBrandSlide('Para una Clínica Inteligente.', 'Solicita tu demostración gratuita',
        path.join(OUT_DIR, 'closing.png'), false);
    console.log('   ✅ cover.png + closing.png');

    // 3. Construir cada clip individual (imagen estática + su audio)
    console.log('\n🎬 Creando clips de video...');
    const clipPaths = [];
    for (let i = 0; i < audioPaths.length; i++) {
        const seg = audioPaths[i];
        const imgPath = seg.img === 'cover' || seg.img === 'closing'
            ? path.join(OUT_DIR, `${seg.img}.png`)
            : path.join(SCRIPT_DIR, 'screenshots', `${seg.img}.png`);
        const clipOut = path.join(OUT_DIR, `clip_${seg.id}.mp4`);

        // Obtener duración real del audio
        const durStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${seg.audioPath}"`).toString().trim();
        const audioDur = parseFloat(durStr);

        // ffmpeg: imagen + audio, escalar a 1920x1080 con padding
        const cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', imgPath,
            '-i', seg.audioPath,
            '-c:v', 'libx264', '-tune', 'stillimage',
            '-c:a', 'aac', '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0A1628',
            '-t', String(audioDur),
            '-shortest', clipOut
        ];
        const res = spawnSync(cmd[0], cmd.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
        if (res.status !== 0) {
            console.error(`❌ Clip ${seg.id}: ${res.stderr.toString().slice(-200)}`);
            process.exit(1);
        }
        process.stdout.write(`  ${seg.id} (${audioDur.toFixed(1)}s) `);
        clipPaths.push(clipOut);
    }
    console.log('\n');

    // 4. Concatenar todos los clips en un solo video
    console.log('🎞️  Concatenando video final...');
    const concatList = path.join(OUT_DIR, 'concat.txt');
    fs.writeFileSync(concatList, clipPaths.map(p => `file '${p}'`).join('\n'));

    const finalPath = path.join(process.env.HOME, 'Desktop', 'DR-SISDEL-Video-Comercial.mp4');
    const cmd2 = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', finalPath];
    const res2 = spawnSync(cmd2[0], cmd2.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
    if (res2.status !== 0) {
        console.error(res2.stderr.toString().slice(-300));
        process.exit(1);
    }

    const finalSize = (fs.statSync(finalPath).size / (1024 * 1024)).toFixed(1);
    console.log(`\n✅ VIDEO LISTO: ${finalPath}`);
    console.log(`   Tamaño: ${finalSize} MB`);
})();
