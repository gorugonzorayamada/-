// 音の合成とミックス。
//   sfx 配列（{t, type, ...}）から効果音・BGM を合成し、ナレーション音声と混ぜて WAV を返す。
//   外部素材なしで完結させるためのもの。BGM は type:'music' のイベントで簡単な曲を自動生成する。
export const SR = 48000;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------- 効果音 ----------
// 各音色: f(s, ev, r, st) => 値。s は開始からのサンプル数。len は秒（null なら ev.dur）
const VOICES = {
  ping: { len: 0.6, f: (s, ev) => {
    const t = s / SR, p = ev.pitch || 1;
    const a = Math.sin(2 * Math.PI * 1318 * p * t) * Math.exp(-t * 9);
    const b = t > 0.09 ? Math.sin(2 * Math.PI * 1760 * p * (t - 0.09)) * Math.exp(-(t - 0.09) * 7) : 0;
    return (a + b) * 0.3;
  } },
  send: { len: 0.18, f: (s) => {
    const t = s / SR, f = 500 + 2200 * t / 0.18;
    return Math.sin(2 * Math.PI * f * t) * Math.sin(Math.PI * t / 0.18) * 0.15;
  } },
  tick: { len: 0.03, f: (s, ev, r) => r() * Math.exp(-s / SR * 250) * 0.22 },
  // 時計の秒針
  clock: { len: 0.05, f: (s, ev, r) => { const t = s / SR; return (r() * 0.3 + Math.sin(2 * Math.PI * 3200 * t)) * Math.exp(-t * 180) * 0.25 * (ev.pitch || 1); } },
  thump: { len: 0.5, f: (s, ev) => {
    const t = s / SR, f = 55 * (ev.pitch || 1) * (1 + Math.exp(-t * 30));
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 8) * 0.8;
  } },
  hit: { len: 1.2, f: (s, ev, r) => {
    const t = s / SR;
    return (Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 4) * 0.7 + r() * Math.exp(-t * 14) * 0.35);
  } },
  pop: { len: 0.15, f: (s, ev) => {
    const t = s / SR, p = ev.pitch || 1, f = 300 * p + 900 * p * Math.exp(-t * 40);
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 30) * 0.35;
  } },
  // 泡が割れる
  bubble: { len: 0.12, f: (s, ev, r) => {
    const t = s / SR, p = ev.pitch || 1;
    return (Math.sin(2 * Math.PI * (600 * p + 2400 * p * t) * t) * 0.6 + r() * 0.4) * Math.exp(-t * 45) * 0.35;
  } },
  boing: { len: 0.45, f: (s, ev) => {
    const t = s / SR, p = ev.pitch || 1;
    return Math.sin(2 * Math.PI * (180 * p + 60 * Math.sin(t * 60)) * t) * Math.exp(-t * 6) * 0.3;
  } },
  roll: { len: null, f: (s, ev, r, st) => {
    st.v = (st.v || 0) * 0.97 + r() * 0.03;
    const t = s / SR, d = ev.dur;
    return st.v * Math.min(1, t * 8, (d - t) * 8) * 1.4;
  } },
  whoosh: { len: null, f: (s, ev, r, st) => {
    const t = s / SR, d = ev.dur || 0.6, k = 0.02 + 0.2 * Math.sin(Math.PI * t / d);
    st.v = (st.v || 0) * (1 - k) + r() * k;
    return st.v * Math.sin(Math.PI * Math.min(1, t / d)) * 0.7;
  } },
  // 削る音
  scrape: { len: null, f: (s, ev, r, st) => {
    const t = s / SR, d = ev.dur;
    st.v = (st.v || 0) * 0.6 + r() * 0.4;
    return st.v * (0.5 + 0.5 * Math.sin(t * 50)) * Math.min(1, t * 20, (d - t) * 20) * 0.25;
  } },
  // 足音
  step: { len: 0.12, f: (s, ev, r, st) => { const t = s / SR; st.v = (st.v || 0) * 0.8 + r() * 0.2; return (st.v * 2 + Math.sin(2 * Math.PI * 90 * t)) * Math.exp(-t * 40) * 0.35; } },
  train: { len: null, f: (s, ev, r, st) => {
    const t = s / SR, d = ev.dur;
    st.v = (st.v || 0) * 0.995 + r() * 0.005;
    const cyc = t % 1.1;
    const clack = (Math.exp(-cyc * 60) + (cyc > 0.18 ? Math.exp(-(cyc - 0.18) * 60) : 0)) * Math.sin(2 * Math.PI * 90 * t) * 0.22;
    return (st.v * 5 + clack) * Math.min(1, t / 1.5, (d - t) / 1.5);
  } },
  // 波の音
  waves: { len: null, f: (s, ev, r, st) => {
    const t = s / SR, d = ev.dur;
    st.v = (st.v || 0) * 0.9 + r() * 0.1;
    return st.v * (0.4 + 0.6 * Math.pow(Math.sin(t * 0.9) * 0.5 + 0.5, 2)) * Math.min(1, t, d - t) * 1.2;
  } },
  // レジ
  register: { len: 0.5, f: (s) => {
    const t = s / SR;
    return (Math.sin(2 * Math.PI * 2093 * t) + Math.sin(2 * Math.PI * 2637 * t) * 0.7) * Math.exp(-t * 7) * 0.18 + (t < 0.03 ? Math.sin(t * 9000) * 0.2 : 0);
  } },
  // 判子
  stamp: { len: 0.35, f: (s, ev, r) => { const t = s / SR; return (Math.sin(2 * Math.PI * 70 * t) * 0.8 + r() * 0.5) * Math.exp(-t * 22) * 0.8; } },
  // 警告音
  alert: { len: 0.5, f: (s) => { const t = s / SR; return Math.sign(Math.sin(2 * Math.PI * (t < 0.25 ? 880 : 660) * t)) * 0.07 * Math.min(1, (0.5 - t) * 30); } },
  // 猫
  meow: { len: 0.7, f: (s) => {
    const t = s / SR, f = 500 + 350 * Math.sin(Math.PI * t / 0.7) - 150 * t;
    let v = 0; for (let h = 1; h < 6; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * h);
    return v * Math.sin(Math.PI * t / 0.7) * 0.22;
  } },
  // ファンファーレ（小さなラッパ風）
  fanfare: { len: 1.6, f: (s, ev) => {
    const t = s / SR, notes = ev.notes || [72, 76, 79, 84], i = Math.min(notes.length - 1, Math.floor(t / 0.18));
    const tt = t - i * 0.18, f = midi(notes[i] + (ev.shift || 0));
    let v = 0; for (let h = 1; h < 7; h++) v += Math.sin(2 * Math.PI * f * h * tt) * (1 / h);
    const env = i === notes.length - 1 ? Math.exp(-tt * 1.6) : Math.exp(-tt * 6);
    return v * env * Math.min(1, tt * 60) * 0.1;
  } },
  pad: { len: null, f: (s, ev) => {
    const t = s / SR, d = ev.dur, env = Math.min(1, t / 2, (d - t) / 2);
    let v = 0;
    for (const [i, f] of (ev.chord || [220, 277, 330]).entries()) v += Math.sin(2 * Math.PI * f * t + i) * (0.6 + 0.4 * Math.sin(t * 0.7 + i));
    return v * env * 0.04;
  } },
  bell: { len: 2.5, f: (s, ev) => {
    const t = s / SR, f = ev.freq || 880;
    return (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 6)) * Math.exp(-t * 2.2) * 0.18;
  } },
  drone: { len: null, f: (s, ev) => {
    const t = s / SR, d = ev.dur, env = Math.min(1, t / 3, (d - t) / 1);
    return (Math.sin(2 * Math.PI * 55 * t) + Math.sin(2 * Math.PI * 58.3 * t) * 0.8 + Math.sin(2 * Math.PI * 110.7 * t) * 0.3) * env * 0.08;
  } },
};

// ---------- BGM ----------
// 楽器の音色（周波数 f、経過秒 t、音の長さ d）
const TIMBRE = {
  // オルゴール
  box: (f, t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 8) + 0.1 * Math.sin(2 * Math.PI * f * 6.3 * t) * Math.exp(-t * 12)) * Math.exp(-t * 2.6) * Math.min(1, t * 400),
  // ピアノ風（倍音が早く減衰）
  piano: (f, t) => { let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t * (1 + 0.0004 * h * h)) * Math.exp(-t * (1.6 + h * 1.2)) / h; return v * Math.min(1, t * 300); },
  // ピチカート
  pluck: (f, t) => { let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) * Math.exp(-t * (7 + h * 5)) / h; return v * Math.min(1, t * 500) * 1.3; },
  // マリンバ
  marimba: (f, t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 3.9 * t) * Math.exp(-t * 20)) * Math.exp(-t * 7) * Math.min(1, t * 400),
  // シンセのアルペジオ（明るい矩形寄り）
  synth: (f, t) => { let v = 0; for (let h = 1; h <= 7; h += 2) v += Math.sin(2 * Math.PI * f * h * t) / h; return v * Math.exp(-t * 6) * Math.min(1, t * 400) * 0.7; },
};

// パターン: コード進行の各小節に対し、どの拍でどの音を鳴らすか
// ev: {t, dur, bpm, beats(拍/小節), chords:[[midi...]], pattern, timbre, vol, bass, padVol, stopAt?}
function renderMusic(ev, out, off) {
  const spb = 60 / ev.bpm, beats = ev.beats || 4, bar = spb * beats, T = TIMBRE[ev.timbre || 'box'];
  const r = rng(Math.floor(ev.t * 1000) + 7);
  const notes = [];
  const bars = Math.ceil(ev.dur / bar);
  for (let b = 0; b < bars; b++) {
    const ch = ev.chords[b % ev.chords.length], t0 = b * bar;
    if (ev.bass !== false) notes.push({ t: t0, n: ch[0] - 12, T: TIMBRE.piano, v: 0.5 });
    const pat = ev.pattern || 'arp';
    if (pat === 'arp') for (let i = 0; i < beats * 2; i++) notes.push({ t: t0 + i * spb / 2, n: ch[[0, 1, 2, 1, 3, 2, 1, 2][i % 8] % ch.length] + 12, v: i % 2 ? 0.5 : 0.75 });
    if (pat === 'waltz') for (let i = 0; i < 3; i++) { notes.push({ t: t0 + i * spb, n: ch[(i + 1) % ch.length] + 12, v: 0.6 }); if (i === 0) notes.push({ t: t0 + spb * 1.5, n: ch[2 % ch.length] + 24, v: 0.35 }); }
    if (pat === 'sparse') { notes.push({ t: t0, n: ch[1 % ch.length] + 12, v: 0.7 }); notes.push({ t: t0 + spb * 2.5, n: ch[2 % ch.length] + 12 + (r() > 0 ? 12 : 0), v: 0.45 }); }
    if (pat === 'bounce') for (let i = 0; i < beats; i++) { notes.push({ t: t0 + i * spb, n: ch[i % ch.length] + 12, v: 0.7 }); if (i % 2) notes.push({ t: t0 + i * spb + spb / 2, n: ch[(i + 1) % ch.length] + 24, v: 0.4 }); }
    if (pat === 'pulse') for (let i = 0; i < beats * 4; i++) notes.push({ t: t0 + i * spb / 4, n: ch[i % ch.length] + (i % 8 < 4 ? 12 : 24), v: i % 4 === 0 ? 0.6 : 0.35 });
    if (ev.melody) for (const [bt, n] of (ev.melody[b % ev.melody.length] || [])) notes.push({ t: t0 + bt * spb, n, v: 0.8, T: TIMBRE[ev.melodyTimbre || 'box'] });
  }
  const vol = ev.vol ?? 1, stop = ev.stopAt ?? ev.dur, fade = ev.fadeOut ?? 1.5;
  for (const nt of notes) {
    if (nt.t >= stop) continue;
    const f = midi(nt.n), start = Math.floor((ev.t + nt.t) * SR) - off, len = Math.floor(3 * SR), Tn = nt.T || T;
    for (let s = 0; s < len; s++) {
      const i = start + s; if (i < 0 || i >= out.length) continue;
      const tt = s / SR, abs = nt.t + tt;
      const env = Math.min(1, (stop - abs) / Math.min(fade, stop) > 0 ? (stop - abs) / fade : 0);
      if (env <= 0) break;
      out[i] += Tn(f, tt) * nt.v * vol * 0.09 * Math.min(1, env);
    }
  }
  // コードの持続音
  if (ev.padVol) for (let b = 0; b < bars; b++) {
    const ch = ev.chords[b % ev.chords.length], t0 = ev.t + b * bar;
    for (let s = 0; s < bar * SR; s++) {
      const i = Math.floor(t0 * SR) + s - off; if (i < 0 || i >= out.length) continue;
      const abs = b * bar + s / SR; if (abs >= stop) break;
      const tt = s / SR, env = Math.min(1, tt / 0.3, (bar - tt) / 0.3, (stop - abs) / fade);
      let v = 0; for (const n of ch) v += Math.sin(2 * Math.PI * midi(n) * (ev.t + abs)) + 0.3 * Math.sin(2 * Math.PI * midi(n) * 2.003 * (ev.t + abs));
      out[i] += v * env * ev.padVol * 0.012;
    }
  }
}

// 簡易リバーブ（Schroeder）
function reverb(x, mix = 0.25) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d: Math.floor(d * SR / 44100), buf: new Float32Array(Math.floor(d * SR / 44100)), i: 0 }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let acc = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.buf[c.i] = x[n] + o * 0.84; c.i = (c.i + 1) % c.d; acc += o; }
    acc /= 4;
    for (const a of aps) { const o = a.buf[a.i]; const v = -acc + o; a.buf[a.i] = acc + o * 0.5; a.i = (a.i + 1) % a.d; acc = v; }
    y[n] = x[n] * (1 - mix) + acc * mix * 1.6;
  }
  return y;
}

// events: sfx 配列 / voices: [{t, samples(Float32Array, SR=48000), vol}] / 戻り値: WAV Buffer
export function mix(events, duration, voices = []) {
  const n = Math.ceil(duration * SR);
  const music = new Float32Array(n), fx = new Float32Array(n), voice = new Float32Array(n);
  events.forEach((ev, idx) => {
    if (ev.type === 'music') return renderMusic(ev, music, 0);
    const v = VOICES[ev.type];
    if (!v) throw new Error('unknown sfx: ' + ev.type);
    const len = Math.floor((v.len ?? ev.dur) * SR), start = Math.floor(ev.t * SR), vol = ev.vol ?? 1;
    const r = rng(idx * 7919 + 1), st = {};
    for (let s = 0; s < len && start + s < n; s++) fx[start + s] += v.f(s, ev, r, st) * vol;
  });
  for (const vc of voices) {
    const start = Math.floor(vc.t * SR);
    for (let s = 0; s < vc.samples.length && start + s < n; s++) voice[start + s] += vc.samples[s] * (vc.vol ?? 1);
  }
  const mw = reverb(music, 0.3), fw = reverb(fx, 0.12);
  // ナレーション中は BGM を下げる（ダッキング）
  let envv = 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    envv = Math.max(Math.abs(voice[i]), envv * 0.99985);
    const duck = 1 - Math.min(0.55, envv * 2.5);
    out[i] = mw[i] * duck + fw[i] + voice[i];
  }
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.tanh(out[i] * 1.1) * 32000), 44 + i * 2);
  return pcm;
}

// 旧 API（試作4本用）
export const synth = (events, duration) => mix(events, duration);
