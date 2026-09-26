// 音の合成とミックス（ステレオ・48kHz）。
//   sfx 配列（{t, type, vol?, pan?, ...}）から効果音・環境音・BGM を合成し、ナレーションと混ぜて WAV を返す。
//   外部素材を使わず、フィルタとノイズで質感を作る。
export const SR = 48000;
const TAU = Math.PI * 2;

// ---------- 基本部品 ----------
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// RBJ バイカッドフィルタ
class Biquad {
  constructor(type, f, q = 0.707) { this.type = type; this.set(f, q); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(f, q = this.q) {
    this.q = q; f = Math.max(20, Math.min(SR * 0.45, f));
    const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // bp
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

// ---------- 効果音 ----------
// 各音: { len(秒 or null=ev.dur), make(ev, r) => (s) => サンプル値 }。s は開始からのサンプル数
const V = {};

// 通知音（やわらかいマリンバ風の2音）。ev.tone: 'low' で不穏な低い音
V.notify = { len: 1.0, make: (ev) => {
  const low = ev.tone === 'low', p = ev.pitch || 1;
  const n1 = (low ? 659 : 1175) * p, n2 = (low ? 622 : 1568) * p;
  const note = (f, t) => t < 0 ? 0 : (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 3.9 * t) * Math.exp(-t * 30)) * Math.exp(-t * (low ? 4 : 7)) * Math.min(1, t * 800);
  return (s) => { const t = s / SR; return (note(n1, t) + note(n2, t - 0.11) * 0.9) * 0.22; };
} };
// スマホのバイブ（ブーッ、ブーッ）
V.vibrate = { len: 1.1, make: (ev, r) => {
  const lp = new Biquad('lp', 600);
  return (s) => { const t = s / SR, on = (t % 0.55) < 0.38 ? 1 : 0; const buzz = Math.sign(Math.sin(TAU * 170 * t)) * 0.5 + r() * 0.3; return lp.run(buzz * on) * 0.35 * Math.min(1, (1.1 - t) * 20); };
} };
// 画面をタップ／フリック入力
V.tap = { len: 0.05, make: (ev, r) => { const bp = new Biquad('bp', 2400 * (ev.pitch || 1), 2); return (s) => bp.run(r()) * Math.exp(-s / SR * 160) * 0.6; } };
// 送信（ヒュッ）
V.send = { len: 0.35, make: (ev, r) => {
  const bp = new Biquad('bp', 800, 3);
  return (s) => { const t = s / SR; bp.set(800 + 5000 * t / 0.35, 3); return (bp.run(r()) * 0.9 + Math.sin(TAU * (900 + 1800 * t) * t) * 0.08) * Math.sin(Math.PI * t / 0.35) * 0.5; };
} };
// タイプライター（報告書）
V.type = { len: 0.09, make: (ev, r) => { const bp = new Biquad('bp', 3200, 1.5), lp = new Biquad('lp', 300); return (s) => { const t = s / SR; return bp.run(r()) * Math.exp(-t * 90) * 0.5 + lp.run(r()) * Math.exp(-t * 60) * 0.8; }; } };
// 心音（ドクン）
V.heart = { len: 0.7, make: (ev) => {
  const lp = new Biquad('lp', 120);
  const beat = (t) => t < 0 ? 0 : Math.sin(TAU * 48 * t) * Math.exp(-t * 18) * Math.min(1, t * 400);
  return (s) => { const t = s / SR; return lp.run(beat(t) + beat(t - 0.17) * 0.7) * 2.2; };
} };
// 重低音の衝撃（どんでん返しの瞬間）
V.boom = { len: 3.0, make: (ev, r) => {
  const lp = new Biquad('lp', 900);
  return (s) => { const t = s / SR, f = 30 + 50 * Math.exp(-t * 3); return (Math.sin(TAU * f * t) * Math.exp(-t * 1.2) * 0.9 + lp.run(r()) * Math.exp(-t * 6) * 0.6) * Math.min(1, t * 300); };
} };
// 盛り上げ（だんだん上がって、ぷつっと切れる）
V.riser = { len: null, make: (ev, r) => {
  const bp = new Biquad('bp', 300, 4), d = ev.dur;
  return (s) => { const t = s / SR, p = t / d; bp.set(300 + 5000 * p * p, 4); return (bp.run(r()) * 1.2 + Math.sin(TAU * (120 + 600 * p * p) * t) * 0.15) * p * p * 0.6; };
} };
// 逆再生シンバル風（吸い込まれる音）
V.reverse = { len: null, make: (ev, r) => { const hp = new Biquad('hp', 3000), d = ev.dur || 1.5; return (s) => { const t = s / SR; return hp.run(r()) * Math.pow(t / d, 3) * 0.7; }; } };
// 風切り
V.whoosh = { len: null, make: (ev, r) => {
  const bp = new Biquad('bp', 400, 1.2), d = ev.dur || 0.8;
  return (s) => { const t = s / SR, p = t / d; bp.set(300 + 2500 * Math.sin(Math.PI * p), 1.2); return bp.run(r()) * Math.sin(Math.PI * p) * 1.1; };
} };
// インターホン（ピンポーン）
V.doorbell = { len: 2.2, make: () => {
  const tone = (f, t) => t < 0 ? 0 : (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 1.6) * Math.min(1, t * 500);
  return (s) => { const t = s / SR; return (tone(740, t) + tone(587, t - 0.55)) * 0.16; };
} };
// ノック（コン、コン、コン）
V.knock = { len: 1.2, make: (ev, r) => {
  const lp = new Biquad('lp', 900), n = ev.count || 3;
  const k = (t) => t < 0 ? 0 : (Math.sin(TAU * 170 * t) * 0.8 + r() * 0.5) * Math.exp(-t * 45);
  return (s) => { const t = s / SR; let v = 0; for (let i = 0; i < n; i++) v += k(t - i * 0.28); return lp.run(v) * 0.9; };
} };
// ドアノブをガチャガチャ
V.rattle = { len: 1.0, make: (ev, r) => {
  const bp = new Biquad('bp', 1800, 3);
  return (s) => { const t = s / SR, burst = Math.max(0, Math.sin(TAU * 7 * t)); return bp.run(r()) * burst * burst * 0.9 * Math.min(1, (1 - t) * 10); };
} };
// 時計（チク・タク）
V.clock = { len: 0.06, make: (ev, r) => { const bp = new Biquad('bp', ev.tock ? 2200 : 3000, 6); return (s) => bp.run(r()) * Math.exp(-s / SR * 150) * 0.9; } };
// レジ・小銭
V.register = { len: 0.8, make: (ev, r) => {
  const bell = (f, t) => Math.sin(TAU * f * t) * Math.exp(-t * 6);
  const lp = new Biquad('lp', 2000);
  return (s) => { const t = s / SR; return (bell(2637, t) * 0.5 + bell(3520, t) * 0.3) * 0.2 + (t < 0.08 ? lp.run(r()) * 0.5 : 0); };
} };
V.coin = { len: 0.5, make: () => (s) => { const t = s / SR; return (Math.sin(TAU * 3950 * t) + Math.sin(TAU * 5200 * t) * 0.6 + Math.sin(TAU * 6900 * t) * 0.3) * Math.exp(-t * 9) * 0.08; } };
// 紙のめくれ・ハンコ
V.paper = { len: 0.35, make: (ev, r) => { const hp = new Biquad('hp', 1500); return (s) => { const t = s / SR; return hp.run(r()) * Math.sin(Math.PI * t / 0.35) * (0.5 + 0.5 * Math.sin(t * 90)) * 0.5; }; } };
V.stamp = { len: 0.4, make: (ev, r) => { const lp = new Biquad('lp', 500); return (s) => { const t = s / SR; return (Math.sin(TAU * 65 * t) * 0.9 + lp.run(r())) * Math.exp(-t * 20); }; } };
// 足音
V.step = { len: 0.15, make: (ev, r) => { const lp = new Biquad('lp', ev.hard ? 2500 : 900); return (s) => { const t = s / SR; return lp.run(r()) * Math.exp(-t * 35) * (ev.hard ? 0.7 : 1.0); }; } };
// ガラスの割れる音
V.glass = { len: 1.2, make: (ev, r) => {
  const hp = new Biquad('hp', 2500);
  const fs = [2300, 3100, 4050, 5230, 6100];
  return (s) => { const t = s / SR; let v = 0; for (const f of fs) v += Math.sin(TAU * f * t + f) * Math.exp(-t * (4 + f / 1500)); return v * 0.05 + hp.run(r()) * Math.exp(-t * 12) * 0.6; };
} };
// デジタルのノイズ
V.glitch = { len: null, make: (ev, r) => {
  let hold = 0, v = 0; const d = ev.dur || 0.4;
  return (s) => { if (hold-- <= 0) { hold = 40 + Math.floor((r() + 1) * 300); v = r(); } const t = s / SR; return Math.round(v * 4) / 4 * 0.35 * ((Math.floor(t * 30) % 2) ? 1 : 0.4) * Math.min(1, (d - t) * 30); };
} };
// ポップ・泡
V.pop = { len: 0.15, make: (ev) => (s) => { const t = s / SR, p = ev.pitch || 1, f = 300 * p + 900 * p * Math.exp(-t * 40); return Math.sin(TAU * f * t) * Math.exp(-t * 30) * 0.35; } };
// ベル（余韻）
V.bell = { len: 3.0, make: (ev) => { const f = ev.freq || 880; return (s) => { const t = s / SR; return (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 3) + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 6)) * Math.exp(-t * 1.6) * 0.14 * Math.min(1, t * 1000); }; } };
// ラジオ・テレビのニュース風のざわめき
V.static = { len: null, make: (ev, r) => { const bp = new Biquad('bp', 1500, 0.8); const d = ev.dur; return (s) => { const t = s / SR; return bp.run(r()) * 0.25 * Math.min(1, t * 5, (d - t) * 5); }; } };
// サイレン（遠く）
V.siren = { len: null, make: (ev) => { const d = ev.dur; let ph = 0; return (s) => { const t = s / SR, f = 700 + 250 * Math.sin(TAU * 0.5 * t); ph += TAU * f / SR; return (Math.sin(ph) + 0.3 * Math.sin(ph * 2)) * 0.06 * Math.min(1, t / 1.5, (d - t) / 1.5); }; } };

// ---------- 環境音（長く鳴らす） ----------
// 部屋の空気（かすかなハム）
V.room = { len: null, make: (ev, r) => { const lp = new Biquad('lp', 200); const d = ev.dur; return (s) => { const t = s / SR; return (lp.run(r()) * 0.5 + Math.sin(TAU * 50 * t) * 0.02) * Math.min(1, t, d - t) * 0.6; }; } };
// 街（遠くの車の流れ）
V.city = { len: null, make: (ev, r) => {
  const lp = new Biquad('lp', 350), bp = new Biquad('bp', 900, 0.7); const d = ev.dur;
  return (s) => { const t = s / SR, swell = 0.6 + 0.4 * Math.sin(t * 0.5) * Math.sin(t * 0.23); return (lp.run(r()) * 0.9 + bp.run(r()) * 0.15 * swell) * Math.min(1, t, d - t) * 0.7; };
} };
// 雑踏（人の声のざわめき）
V.crowd = { len: null, make: (ev, r) => {
  const f1 = new Biquad('bp', 500, 3), f2 = new Biquad('bp', 1400, 3), d = ev.dur;
  let a = 500, b = 1400, n = 0;
  return (s) => { if (n-- <= 0) { n = 2000; a = 400 + (r() + 1) * 300; b = 1100 + (r() + 1) * 700; f1.set(a, 3); f2.set(b, 3); } const t = s / SR, x = r(); return (f1.run(x) + f2.run(x) * 0.6) * (0.6 + 0.4 * Math.sin(t * 3.1) * Math.sin(t * 1.7)) * Math.min(1, t, d - t) * 0.9; };
} };
// 雨
V.rain = { len: null, make: (ev, r) => {
  const hp = new Biquad('hp', 1800), lp = new Biquad('lp', 5000), d = ev.dur; let drop = 0;
  return (s) => { const t = s / SR; if (r() > 0.9985) drop = 1; drop *= 0.97; return (lp.run(hp.run(r())) * 0.35 + drop * r() * 0.6) * Math.min(1, t * 2, (d - t) * 2); };
} };
// 夜風
V.wind = { len: null, make: (ev, r) => { const bp = new Biquad('bp', 400, 1.5), d = ev.dur; return (s) => { const t = s / SR; bp.set(300 + 200 * Math.sin(t * 0.4) + 100 * Math.sin(t * 1.3), 1.5); return bp.run(r()) * 0.9 * Math.min(1, t / 2, (d - t) / 2); }; } };
// 電車の走行音
V.train = { len: null, make: (ev, r) => {
  const lp = new Biquad('lp', 180), d = ev.dur;
  return (s) => { const t = s / SR, cyc = t % 1.15; const clack = (Math.exp(-cyc * 50) + (cyc > 0.16 ? Math.exp(-(cyc - 0.16) * 50) : 0)) * (r() * 0.4 + Math.sin(TAU * 95 * t)) * 0.35; return (lp.run(r()) * 1.6 + clack) * Math.min(1, t / 1.5, (d - t) / 1.5); };
} };
// 宇宙船の低いうなり
V.hum = { len: null, make: (ev) => { const d = ev.dur; return (s) => { const t = s / SR; return (Math.sin(TAU * 41 * t) + 0.5 * Math.sin(TAU * 61.7 * t + Math.sin(t * 0.8) * 3) + 0.2 * Math.sin(TAU * 123 * t)) * 0.07 * Math.min(1, t / 2, (d - t) / 2); }; } };
// 不穏な持続音
V.drone = { len: null, make: (ev) => { const d = ev.dur; return (s) => { const t = s / SR; return (Math.sin(TAU * 55 * t) + Math.sin(TAU * 58.3 * t) * 0.8 + Math.sin(TAU * 110.7 * t) * 0.3) * 0.07 * Math.min(1, t / 3, (d - t) / 1); }; } };
// コードの持続音
V.pad = { len: null, make: (ev) => { const d = ev.dur, ch = ev.chord || [220, 277, 330]; return (s) => { const t = s / SR; let v = 0; ch.forEach((f, i) => { v += Math.sin(TAU * f * t + i) * (0.6 + 0.4 * Math.sin(t * 0.7 + i)); }); return v * 0.035 * Math.min(1, t / 2, (d - t) / 2); }; } };

// ---------- BGM（自動作曲） ----------
const TIMBRE = {
  box: (f, t) => (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 8) + 0.1 * Math.sin(TAU * f * 6.3 * t) * Math.exp(-t * 12)) * Math.exp(-t * 2.6) * Math.min(1, t * 400),
  piano: (f, t) => { let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(TAU * f * h * t * (1 + 0.0004 * h * h)) * Math.exp(-t * (1.2 + h * 1.1)) / (h * h * 0.6 + 0.4); return v * Math.min(1, t * 300) * 0.8; },
  pluck: (f, t) => { let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(TAU * f * h * t) * Math.exp(-t * (7 + h * 5)) / h; return v * Math.min(1, t * 500) * 1.3; },
  marimba: (f, t) => (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 3.9 * t) * Math.exp(-t * 20)) * Math.exp(-t * 7) * Math.min(1, t * 400),
  synth: (f, t) => { let v = 0; for (let h = 1; h <= 7; h += 2) v += Math.sin(TAU * f * h * t) / h; return v * Math.exp(-t * 6) * Math.min(1, t * 400) * 0.7; },
  // 弦のようなやわらかい持続音（ゆっくり立ち上がる）
  strings: (f, t) => { let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(TAU * f * h * t + Math.sin(TAU * 5 * t) * 0.02 * h) / h; return v * Math.min(1, t * 2) * Math.exp(-t * 0.4) * 0.6; },
};
function renderMusic(ev, L, R) {
  const spb = 60 / ev.bpm, beats = ev.beats || 4, bar = spb * beats, T = TIMBRE[ev.timbre || 'box'];
  const r = rng(Math.floor(ev.t * 1000) + 7), notes = [], bars = Math.ceil(ev.dur / bar);
  for (let b = 0; b < bars; b++) {
    const ch = ev.chords[b % ev.chords.length], t0 = b * bar, pat = ev.pattern || 'arp';
    if (ev.bass !== false) notes.push({ t: t0, n: ch[0] - 12, T: TIMBRE.piano, v: 0.55, pan: 0 });
    if (pat === 'arp') for (let i = 0; i < beats * 2; i++) notes.push({ t: t0 + i * spb / 2, n: ch[[0, 1, 2, 1, 3, 2, 1, 2][i % 8] % ch.length] + 12, v: i % 2 ? 0.45 : 0.7 });
    if (pat === 'waltz') for (let i = 0; i < 3; i++) { notes.push({ t: t0 + i * spb, n: ch[(i + 1) % ch.length] + 12, v: 0.6 }); if (i === 0) notes.push({ t: t0 + spb * 1.5, n: ch[2 % ch.length] + 24, v: 0.35 }); }
    if (pat === 'sparse') { notes.push({ t: t0, n: ch[1 % ch.length] + 12, v: 0.7 }); notes.push({ t: t0 + spb * 2.5, n: ch[2 % ch.length] + 12 + (r() > 0 ? 12 : 0), v: 0.45 }); }
    if (pat === 'bounce') for (let i = 0; i < beats; i++) { notes.push({ t: t0 + i * spb, n: ch[i % ch.length] + 12, v: 0.7 }); if (i % 2) notes.push({ t: t0 + i * spb + spb / 2, n: ch[(i + 1) % ch.length] + 24, v: 0.4 }); }
    if (pat === 'pulse') for (let i = 0; i < beats * 4; i++) notes.push({ t: t0 + i * spb / 4, n: ch[i % ch.length] + (i % 8 < 4 ? 12 : 24), v: i % 4 === 0 ? 0.55 : 0.3 });
    if (pat === 'hold') notes.push(...ch.map((n) => ({ t: t0, n: n + 12, v: 0.5, T: TIMBRE.strings, len: bar + 0.5 })));
  }
  const vol = ev.vol ?? 1, stop = ev.stopAt ?? ev.dur, fade = ev.fadeOut ?? 1.5;
  notes.forEach((nt, k) => {
    if (nt.t >= stop) return;
    const f = midi(nt.n), start = Math.floor((ev.t + nt.t) * SR), len = Math.floor((nt.len || 3) * SR), Tn = nt.T || T;
    const pan = nt.pan ?? Math.sin(k * 1.7) * 0.35, gl = Math.sqrt((1 - pan) / 2), gr = Math.sqrt((1 + pan) / 2);
    for (let s = 0; s < len; s++) {
      const i = start + s; if (i < 0 || i >= L.length) continue;
      const tt = s / SR, abs = nt.t + tt, env = Math.min(1, (stop - abs) / fade);
      if (env <= 0) break;
      const v = Tn(f, tt) * nt.v * vol * 0.085 * env;
      L[i] += v * gl; R[i] += v * gr;
    }
  });
}

// ---------- 残響（ステレオ） ----------
function reverb(xL, xR, mix, size = 0.84) {
  const mk = (ds) => ({ combs: ds.map((d) => ({ d, buf: new Float32Array(d), i: 0 })), aps: [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 })) });
  const chans = [mk([1557, 1617, 1491, 1422].map((d) => Math.floor(d * SR / 44100))), mk([1580, 1640, 1514, 1445].map((d) => Math.floor(d * SR / 44100)))];
  const out = [new Float32Array(xL.length), new Float32Array(xL.length)];
  [xL, xR].forEach((x, c) => {
    const { combs, aps } = chans[c], y = out[c];
    for (let n = 0; n < x.length; n++) {
      let acc = 0;
      for (const cb of combs) { const o = cb.buf[cb.i]; cb.buf[cb.i] = x[n] + o * size; cb.i = (cb.i + 1) % cb.d; acc += o; }
      acc /= 4;
      for (const a of aps) { const o = a.buf[a.i]; const v = -acc + o; a.buf[a.i] = acc + o * 0.5; a.i = (a.i + 1) % a.d; acc = v; }
      y[n] = x[n] * (1 - mix) + acc * mix * 1.6;
    }
  });
  return out;
}

// 声のエフェクト: robot=機械音声（宇宙人）/ phone=電話越し / old=年配の響き
function voiceFx(x, fx) {
  if (!fx) return x;
  const y = new Float32Array(x.length);
  if (fx === 'robot') {
    const d = Math.floor(SR * 0.012), hp = new Biquad('hp', 180);
    for (let i = 0; i < x.length; i++) { const ring = Math.sin(TAU * 38 * i / SR); const v = x[i] * (0.55 + 0.45 * ring) + (i >= d ? x[i - d] * 0.5 : 0); y[i] = hp.run(v) * 0.9; }
  } else if (fx === 'phone') {
    const hp = new Biquad('hp', 400), lp = new Biquad('lp', 3200);
    for (let i = 0; i < x.length; i++) y[i] = Math.tanh(lp.run(hp.run(x[i])) * 2) * 0.6;
  } else return x;
  return y;
}

// events: sfx 配列 / voices: [{t, samples, vol, fx}] / 戻り値: ステレオ WAV
export function mix(events, duration, voices = []) {
  const n = Math.ceil(duration * SR);
  const mL = new Float32Array(n), mR = new Float32Array(n), fL = new Float32Array(n), fR = new Float32Array(n), vo = new Float32Array(n);
  events.forEach((ev, idx) => {
    if (ev.type === 'music') return renderMusic(ev, mL, mR);
    const v = V[ev.type];
    if (!v) throw new Error('unknown sfx: ' + ev.type);
    const len = Math.floor((v.len ?? ev.dur) * SR), start = Math.floor(ev.t * SR), vol = ev.vol ?? 1;
    const pan = ev.pan ?? 0, gl = Math.sqrt((1 - pan) / 2) * 1.414, gr = Math.sqrt((1 + pan) / 2) * 1.414;
    const f = v.make(ev, rng(idx * 7919 + 1));
    for (let s = 0; s < len && start + s < n; s++) { if (start + s < 0) continue; const x = f(s) * vol; fL[start + s] += x * gl; fR[start + s] += x * gr; }
  });
  for (const vc of voices) {
    const x = voiceFx(vc.samples, vc.fx), start = Math.floor(vc.t * SR);
    for (let s = 0; s < x.length && start + s < n; s++) vo[start + s] += x[s] * (vc.vol ?? 1);
  }
  const [mwL, mwR] = reverb(mL, mR, 0.3), [fwL, fwR] = reverb(fL, fR, 0.14, 0.8);
  // ナレーション中は BGM と環境音を下げる（ダッキング）
  let env = 0;
  const pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    env = Math.max(Math.abs(vo[i]), env * 0.99985);
    const duck = 1 - Math.min(0.6, env * 2.5), duckFx = 1 - Math.min(0.3, env * 1.2);
    const L = mwL[i] * duck + fwL[i] * duckFx + vo[i], R = mwR[i] * duck + fwR[i] * duckFx + vo[i];
    pcm.writeInt16LE(Math.round(Math.tanh(L * 1.1) * 32000), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(R * 1.1) * 32000), 46 + i * 4);
  }
  return pcm;
}

// 旧 API（試作4本用）: 古い音名を新しい音に読み替える
const ALIAS = { ping: 'notify', tick: 'tap', thump: 'heart', hit: 'boom', roll: 'whoosh', scrape: 'paper', boing: 'pop', waves: 'wind', alert: 'glitch', fanfare: 'bell', meow: 'pop', bubble: 'pop' };
export const synth = (events, duration) => mix(events.map((e) => (V[e.type] || e.type === 'music' ? e : { ...e, type: ALIAS[e.type] || 'pop' })), duration);
