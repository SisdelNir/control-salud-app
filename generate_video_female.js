// Genera video DR-SISDEL con voz Kore (femenina, tono firme y publicitario) + acelerado
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

const API_KEY = fs.readFileSync(path.join(process.env.HOME, 'Desktop/eleven.txt'), 'utf8').trim().split('\n')[0].trim();
const SCRIPT_DIR = __dirname;
const OUT_DIR = path.join(SCRIPT_DIR, 'video_assets');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

const VOICE = 'Kore';          // Voz femenina firme (Gemini TTS)
const SPEED = 1.15;             // 15% más rápido sin cambiar tono
const STYLE_PROMPT = 'Narra el siguiente texto con tono firme, profesional y publicitario, como una voz comercial femenina de marca premium, con energía y autoridad:\n\n';

const SCRIPT = [
    { id: '01', img: 'cover',              text: '¿Tu clínica todavía depende de cuadernos, llamadas y procesos manuales?' },
    { id: '02', img: '01_expediente',      text: 'Mientras unos pierden pacientes por desorganización, otros ya automatizan toda su operación con inteligencia artificial.' },
    { id: '03', img: 'cover',              text: 'Dr-Sisdel llegó para cambiar la forma de administrar la salud.' },
    { id: '04', img: '02_agenda',          text: 'Agenda virtual en la nube. Citas online. Sincronización automática.' },
    { id: '05', img: '01_expediente',      text: 'Expediente clínico completo, en tiempo real.' },
    { id: '06', img: '04_recordatorios',   text: 'Recordatorios automáticos inteligentes que llevan a tus pacientes desde el amanecer hasta su turno.' },
    { id: '07', img: '07_portal_paciente', text: 'Recetas digitales directo al celular del paciente. Y alertas de medicación a la hora exacta.' },
    { id: '08', img: '03_consulta',        text: 'Mensajería masiva por WhatsApp. Monitoreo de glucosa y presión. Y funciona incluso sin internet.' },
    { id: '09', img: '06_programador',     text: 'Menos administración. Más productividad. Pacientes más satisfechos.' },
    { id: '10', img: 'closing',            text: 'Dr-Sisdel. Para una clínica inteligente. Disponible en veintidós países. Solicita tu demostración gratuita hoy.' }
];

// ─── Helpers ──────────────────────────────────────────────────────────────
function pcmToWav(pcm, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcm.length;
    const wav = Buffer.alloc(44 + dataSize);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);
    pcm.copy(wav, 44);
    return wav;
}

function callGeminiTTS(text, outPath) {
    return new Promise((resolve, reject) => {
        const fullText = STYLE_PROMPT + text;
        const payload = JSON.stringify({
            contents: [{ parts: [{ text: fullText }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } }
                }
            }
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.error) return reject(new Error(result.error.message));
                    const audioB64 = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (!audioB64) return reject(new Error('No audio in response'));
                    const pcmBuffer = Buffer.from(audioB64, 'base64');
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

function spawn(cmd, args) {
    const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr.toString().slice(-200)}`);
}

function audioDuration(p) {
    return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`).toString().trim());
}

// ─── Main pipeline ────────────────────────────────────────────────────────
(async () => {
    console.log(`🎙️  Generando audio con voz Kore (femenina, firme, publicitaria)...\n`);

    // 1. Generar audio TTS para cada segmento
    for (const seg of SCRIPT) {
        const outRaw = path.join(OUT_DIR, `audio_kore_${seg.id}.wav`);
        process.stdout.write(`${seg.id} `);
        await callGeminiTTS(seg.text, outRaw);
    }
    console.log('\n');

    // 2. Acelerar audio en 1.15x
    console.log(`⚡ Acelerando audio en ${SPEED}x...`);
    for (const seg of SCRIPT) {
        const inA = path.join(OUT_DIR, `audio_kore_${seg.id}.wav`);
        const outA = path.join(OUT_DIR, `audio_kore_${seg.id}_fast.wav`);
        spawn('ffmpeg', ['-y', '-i', inA, '-filter:a', `atempo=${SPEED}`, outA]);
        process.stdout.write(`${seg.id} `);
    }
    console.log('\n');

    // 3. Generar slides cover/closing si no existen
    const COVER = path.join(OUT_DIR, 'cover.png');
    const CLOSING = path.join(OUT_DIR, 'closing.png');
    if (!fs.existsSync(COVER) || !fs.existsSync(CLOSING)) {
        console.log('🎨 Generando portada/cierre...');
        // Si no existen, generarlas con node
        execSync(`node "${path.join(SCRIPT_DIR, 'generate_video.js')}" 2>&1 | grep -i "slide" || true`);
    }

    // 4. Crear clip por segmento
    console.log('🎬 Construyendo clips de video...');
    const clipPaths = [];
    for (const seg of SCRIPT) {
        const audioPath = path.join(OUT_DIR, `audio_kore_${seg.id}_fast.wav`);
        const imgPath = (seg.img === 'cover' || seg.img === 'closing')
            ? path.join(OUT_DIR, `${seg.img}.png`)
            : path.join(SCRIPT_DIR, 'screenshots', `${seg.img}.png`);
        const clipOut = path.join(OUT_DIR, `clip_kore_${seg.id}.mp4`);

        const dur = audioDuration(audioPath);
        spawn('ffmpeg', [
            '-y',
            '-loop', '1', '-i', imgPath,
            '-i', audioPath,
            '-c:v', 'libx264', '-tune', 'stillimage',
            '-c:a', 'aac', '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0A1628',
            '-t', String(dur),
            '-shortest', clipOut
        ]);
        process.stdout.write(`${seg.id}(${dur.toFixed(1)}s) `);
        clipPaths.push(clipOut);
    }
    console.log('\n');

    // 5. Concatenar
    console.log('🎞️  Concatenando video final...');
    const concatList = path.join(OUT_DIR, 'concat_kore.txt');
    fs.writeFileSync(concatList, clipPaths.map(p => `file '${p}'`).join('\n'));

    const finalPath = path.join(process.env.HOME, 'Desktop', 'DR-SISDEL-Video-Comercial.mp4');
    spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', finalPath]);

    const size = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);
    const dur = audioDuration(finalPath);
    console.log(`\n✅ VIDEO CON VOZ KORE LISTO`);
    console.log(`   Path: ${finalPath}`);
    console.log(`   Duración: ${dur.toFixed(1)}s  |  Tamaño: ${size} MB  |  Voz: Kore (femenina firme) @ ${SPEED}x`);
})();
