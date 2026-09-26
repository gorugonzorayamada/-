// 指定時刻のフレームを並べた確認用コンタクトシートを書き出す
// 使い方: node scripts/snap.mjs shorts/01-chat 0.5 5 10 20  → out/snap-01-chat.jpg
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [dir, ...times] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.error(e));
await page.goto(`http://localhost:${server.address().port}/${dir}/index.html?render=1`);
await page.evaluate(() => window.__mg.ready);
const ts = times.length ? times.map(Number) : [0.5, 3, 6, 9, 12, 15, 18, 21, 24, 27];
const cols = Math.min(5, ts.length), rows = Math.ceil(ts.length / cols);
await page.evaluate(({ ts, cols, rows }) => {
  const s = 0.3, w = 1080 * s, h = 1920 * s;
  const sheet = document.createElement('canvas');
  sheet.width = cols * w; sheet.height = rows * (h + 40);
  const c = sheet.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, sheet.width, sheet.height);
  ts.forEach((t, i) => {
    window.__mg.renderFrame(t);
    const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 40);
    c.drawImage(window.__mg.canvas, x, y + 40, w, h);
    c.fillStyle = '#000'; c.font = '28px sans-serif'; c.fillText(t + 's', x + 8, y + 30);
  });
  window.__sheet = sheet.toDataURL('image/jpeg', 0.9);
}, { ts, cols, rows });
const b64 = await page.evaluate(() => window.__sheet.split(',')[1]);
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const out = path.join(ROOT, 'out', `snap-${path.basename(dir)}.jpg`);
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(out);
await browser.close(); server.close();
