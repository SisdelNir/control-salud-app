// Acelera el audio del video DR-SISDEL en 1.15x sin cambiar el tono
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const OUT_DIR = path.join(SCRIPT_DIR, 'video_assets');
const SPEED = 1.15;  // 15% más rápido

// Mapeo de segmentos (mismo orden que generate_video.js)
const SCRIPT = [
    { id: '01', img: 'cover' },
    { id: '02', img: '01_expediente' },
    { id: '03', img: 'cover' },
    { id: '04', img: '02_agenda' },
    { id: '05', img: '01_expediente' },
    { id: '06', img: '04_recordatorios' },
    { id: '07', img: '07_portal_paciente' },
    { id: '08', img: '03_consulta' },
    { id: '09', img: '06_programador' },
    { id: '10', img: 'closing' }
];

console.log(`⚡ Acelerando audio en ${SPEED}x...\n`);

// 1. Acelerar cada audio
for (const seg of SCRIPT) {
    const inAudio = path.join(OUT_DIR, `audio_${seg.id}.wav`);
    const outAudio = path.join(OUT_DIR, `audio_${seg.id}_fast.wav`);
    const cmd = ['ffmpeg', '-y', '-i', inAudio, '-filter:a', `atempo=${SPEED}`, outAudio];
    const r = spawnSync(cmd[0], cmd.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) {
        console.error(`❌ ${seg.id}: ${r.stderr.toString().slice(-200)}`);
        process.exit(1);
    }
    process.stdout.write(`${seg.id} `);
}
console.log('\n');

// 2. Recrear cada clip con el audio acelerado
console.log('🎬 Reconstruyendo clips...');
const clipPaths = [];
for (const seg of SCRIPT) {
    const audioPath = path.join(OUT_DIR, `audio_${seg.id}_fast.wav`);
    const imgPath = seg.img === 'cover' || seg.img === 'closing'
        ? path.join(OUT_DIR, `${seg.img}.png`)
        : path.join(SCRIPT_DIR, 'screenshots', `${seg.img}.png`);
    const clipOut = path.join(OUT_DIR, `clip_${seg.id}_fast.mp4`);

    const durStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`).toString().trim();
    const audioDur = parseFloat(durStr);

    const cmd = [
        'ffmpeg', '-y',
        '-loop', '1', '-i', imgPath,
        '-i', audioPath,
        '-c:v', 'libx264', '-tune', 'stillimage',
        '-c:a', 'aac', '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0A1628',
        '-t', String(audioDur),
        '-shortest', clipOut
    ];
    const r = spawnSync(cmd[0], cmd.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) {
        console.error(`❌ Clip ${seg.id}`);
        process.exit(1);
    }
    process.stdout.write(`${seg.id}(${audioDur.toFixed(1)}s) `);
    clipPaths.push(clipOut);
}
console.log('\n');

// 3. Concatenar
console.log('🎞️  Concatenando video final...');
const concatList = path.join(OUT_DIR, 'concat_fast.txt');
fs.writeFileSync(concatList, clipPaths.map(p => `file '${p}'`).join('\n'));

const finalPath = path.join(process.env.HOME, 'Desktop', 'DR-SISDEL-Video-Comercial.mp4');
const r = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', finalPath],
    { stdio: ['ignore', 'ignore', 'pipe'] });
if (r.status !== 0) {
    console.error(r.stderr.toString().slice(-300));
    process.exit(1);
}

const size = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);
const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`).toString().trim();
console.log(`\n✅ VIDEO ACELERADO LISTO`);
console.log(`   Path: ${finalPath}`);
console.log(`   Duración: ${parseFloat(dur).toFixed(1)}s  |  Tamaño: ${size} MB`);
