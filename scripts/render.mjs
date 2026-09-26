// 使い方: node scripts/render.mjs <作品フォルダ...> [--out <出力フォルダ>] [--yomi]
//   例: node scripts/render.mjs stories/01-reply --out 不思議な物語
//   引数なしなら shorts/ と stories/ 以下をすべて書き出す。
//   --yomi を付けると、ナレーションの読み（カナ）を表示するだけで動画は作らない。
import { chromium } from 'playwright';
import { spawn, execSync, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { mix, SR } from './sfx.mjs';
import { fileURLToPath } from 'node:url';

// Windows では python3 ではなく python のことが多い
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = path.resolve(ROOT, outIdx >= 0 ? args.splice(outIdx, 2)[1] : 'out');
const YOMI_ONLY = args.includes('--yomi');
const dirs = args.filter((a) => !a.startsWith('--')).map((d) => d.replace(/\/$/, ''));
fs.mkdirSync(OUT, { recursive: true });

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return 'ffmpeg'; } catch {}
  try { return execSync(`${PY} -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim(); } catch {}
  throw new Error('ffmpeg が見つかりません。ffmpeg をインストールするか `pip install imageio-ffmpeg` してください');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

function readWav(file) {
  const b = fs.readFileSync(file), n = (b.length - 44) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  return x;
}

// ナレーションを合成し、読みと長さを返す
function speak(narration, name) {
  if (!narration.length) return [];
  const input = narration.map((l, i) => ({
    id: `${name}-${i}`, text: l.text.replace(/\n/g, ''), yomi: l.yomi, speed: l.speed, half_tone: l.halfTone,
    vv: l.vv, vvSpeed: l.vvSpeed, vvPitch: l.vvPitch, vvIntonation: l.vvIntonation,
    maxDur: narration[i + 1] ? narration[i + 1].t - l.t - 0.15 : undefined,
  }));
  const res = JSON.parse(execFileSync(PY, [path.join(ROOT, 'scripts', 'tts.py')], { input: JSON.stringify(input), maxBuffer: 1 << 26, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString());
  console.log(`\n[${name}] ナレーションの読み（${res[0]?.engine}。読み間違いがないか確認）`);
  res.forEach((r, i) => {
    const l = narration[i], end = l.t + r.dur, next = narration[i + 1];
    const warn = next && end > next.t ? `  ⚠ 次の行(${next.t}s)と重なる` : '';
    console.log(`  ${l.t.toFixed(1).padStart(5)}s  ${l.text.replace(/\n/g, '')}\n          → ${r.kana}  (${r.dur.toFixed(1)}s)${warn}`);
  });
  return res;
}

async function renderOne(browser, port, dir, ffmpeg) {
  const name = path.basename(dir);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => console.error(`[${name}]`, e));
  await page.goto(`http://localhost:${port}/${dir}/index.html?render=1`);
  const meta = await page.evaluate(async () => { await window.__mg.ready; const { duration, fps, sfx, narration } = window.__mg; return { duration, fps, sfx, narration }; });

  const spoken = speak(meta.narration, name);
  if (YOMI_ONLY) { await page.close(); return; }
  // 字幕の表示時間をページに渡す
  await page.evaluate((d) => window.__mg.setNarrationDurations(d), spoken.map((s) => s.dur));

  const frames = Math.round(meta.duration * meta.fps);
  const wav = path.join(OUT, `.${name}.wav`);
  fs.writeFileSync(wav, mix(meta.sfx, meta.duration, spoken.map((s, i) => ({ t: meta.narration[i].t, samples: readWav(s.wav), vol: meta.narration[i].vol, fx: meta.narration[i].fx }))));

  const mp4 = path.join(OUT, `${name}.mp4`);
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-t', String(meta.duration), '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });

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

const targets = dirs.length ? dirs
  : ['shorts', 'stories'].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => fs.readdirSync(path.join(ROOT, d)).sort().map((x) => `${d}/${x}`));

const ffmpeg = findFfmpeg();
const server = await serve();
const browser = await chromium.launch();
try {
  for (const dir of targets) await renderOne(browser, server.address().port, dir, ffmpeg);
} finally {
  await browser.close();
  server.close();
}
