// 使い方: node scripts/render.mjs [shorts/01-chat ...]
// 引数なしなら shorts/ 以下をすべて書き出す。出力は out/<名前>.mp4
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { synth } from './sfx.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return 'ffmpeg'; } catch {}
  try { return execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim(); } catch {}
  throw new Error('ffmpeg が見つかりません。ffmpeg をインストールするか `pip install imageio-ffmpeg` してください');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

async function renderOne(browser, port, dir, ffmpeg) {
  const name = path.basename(dir);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => console.error(`[${name}]`, e));
  await page.goto(`http://localhost:${port}/${dir}/index.html?render=1`);
  const meta = await page.evaluate(async () => { await window.__mg.ready; const { duration, fps, sfx } = window.__mg; return { duration, fps, sfx }; });
  const frames = Math.round(meta.duration * meta.fps);

  const wav = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(wav, synth(meta.sfx, meta.duration));

  const mp4 = path.join(OUT, `${name}.mp4`);
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(meta.duration), '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < frames; i++) {
    const b64 = await page.evaluate((t) => { window.__mg.renderFrame(t); return window.__mg.canvas.toDataURL('image/jpeg', 0.95).split(',')[1]; }, i / meta.fps);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`\r[${name}] ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))));
  fs.unlinkSync(wav);
  console.log(`\r[${name}] ${frames}/${frames} → ${path.relative(ROOT, mp4)}`);
  await page.close();
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((d) => d.replace(/\/$/, ''))
  : fs.readdirSync(path.join(ROOT, 'shorts')).sort().map((d) => `shorts/${d}`);

const ffmpeg = findFfmpeg();
const server = await serve();
const browser = await chromium.launch();
try {
  for (const dir of targets) await renderOne(browser, server.address().port, dir, ffmpeg);
} finally {
  await browser.close();
  server.close();
}
