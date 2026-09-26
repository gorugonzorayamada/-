// シーンの sfx 配列（{t, type, dur?, vol?, pitch?}）から効果音・環境音を合成して WAV を返す。
// 外部素材なしで最低限の音を付けるためのもの。本番では差し替え推奨。
const SR = 48000;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}

// 各音色: (i, sampleIndexFromStart, ev) => value。len は秒。
const VOICES = {
  // 通知音（2音のベル）
  ping: { len: 0.6, f: (s, ev) => {
    const t = s / SR, p = ev.pitch || 1;
    const a = Math.sin(2 * Math.PI * 1318 * p * t) * Math.exp(-t * 9);
    const b = t > 0.09 ? Math.sin(2 * Math.PI * 1760 * p * (t - 0.09)) * Math.exp(-(t - 0.09) * 7) : 0;
    return (a + b) * 0.35;
  } },
  // 送信音（上昇する短いスイープ）
  send: { len: 0.18, f: (s) => {
    const t = s / SR, f = 500 + 2200 * t / 0.18;
    return Math.sin(2 * Math.PI * f * t) * Math.sin(Math.PI * t / 0.18) * 0.18;
  } },
  // タイピングのクリック
  tick: { len: 0.03, f: (s, ev, r) => r() * Math.exp(-s / SR * 250) * 0.25 },
  // 心音・重低音
  thump: { len: 0.5, f: (s, ev) => {
    const t = s / SR, f = 55 * (ev.pitch || 1) * (1 + Math.exp(-t * 30));
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 8) * 0.9;
  } },
  // 衝撃音（低音 + ノイズ）
  hit: { len: 1.2, f: (s, ev, r) => {
    const t = s / SR;
    return (Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 4) * 0.8 + r() * Math.exp(-t * 14) * 0.4);
  } },
  // ポップ（跳ねる・出現）
  pop: { len: 0.15, f: (s, ev) => {
    const t = s / SR, p = ev.pitch || 1, f = 300 * p + 900 * p * Math.exp(-t * 40);
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 30) * 0.4;
  } },
  // ボヨン（下降スイープ）
  boing: { len: 0.45, f: (s, ev) => {
    const t = s / SR, p = ev.pitch || 1;
    return Math.sin(2 * Math.PI * (180 * p + 60 * Math.sin(t * 60)) * t) * Math.exp(-t * 6) * 0.35;
  } },
  // 転がる音（ざらついた低ノイズ）
  roll: { len: null, f: (s, ev, r, st) => {
    st.v = (st.v || 0) * 0.97 + r() * 0.03;
    const t = s / SR, d = ev.dur;
    return st.v * Math.min(1, t * 8, (d - t) * 8) * 1.6;
  } },
  // 風切り音（フィルタノイズのスウェル）
  whoosh: { len: null, f: (s, ev, r, st) => {
    const t = s / SR, d = ev.dur || 0.6, k = 0.02 + 0.2 * Math.sin(Math.PI * t / d);
    st.v = (st.v || 0) * (1 - k) + r() * k;
    return st.v * Math.sin(Math.PI * Math.min(1, t / d)) * 0.8;
  } },
  // 電車の走行音（低いゴー + ガタンゴトン）
  train: { len: null, f: (s, ev, r, st) => {
    const t = s / SR, d = ev.dur;
    st.v = (st.v || 0) * 0.995 + r() * 0.005;
    const cyc = t % 1.1; // ガタン…ゴトン
    const clack = (Math.exp(-cyc * 60) + (cyc > 0.18 ? Math.exp(-(cyc - 0.18) * 60) : 0)) * Math.sin(2 * Math.PI * 90 * t) * 0.25;
    return (st.v * 5 + clack) * Math.min(1, t / 1.5, (d - t) / 1.5);
  } },
  // 環境パッド（ゆっくりした和音）。ev.chord に周波数配列
  pad: { len: null, f: (s, ev) => {
    const t = s / SR, d = ev.dur, env = Math.min(1, t / 2, (d - t) / 2);
    let v = 0;
    for (const [i, f] of (ev.chord || [220, 277, 330]).entries()) v += Math.sin(2 * Math.PI * f * t + i) * (0.6 + 0.4 * Math.sin(t * 0.7 + i));
    return v * env * 0.05;
  } },
  // オルゴール風の単音
  bell: { len: 2.5, f: (s, ev) => {
    const t = s / SR, f = ev.freq || 880;
    return (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 6)) * Math.exp(-t * 2.2) * 0.2;
  } },
  // 不穏な持続音（低い不協和）
  drone: { len: null, f: (s, ev) => {
    const t = s / SR, d = ev.dur, env = Math.min(1, t / 3, (d - t) / 1);
    return (Math.sin(2 * Math.PI * 55 * t) + Math.sin(2 * Math.PI * 58.3 * t) * 0.8 + Math.sin(2 * Math.PI * 110.7 * t) * 0.3) * env * 0.09;
  } },
};

export function synth(events, duration) {
  const n = Math.ceil(duration * SR);
  const buf = new Float32Array(n);
  events.forEach((ev, idx) => {
    const v = VOICES[ev.type];
    if (!v) throw new Error('unknown sfx: ' + ev.type);
    const len = Math.floor((v.len ?? ev.dur) * SR), start = Math.floor(ev.t * SR), vol = ev.vol ?? 1;
    const r = rng(idx * 7919 + 1), st = {};
    for (let s = 0; s < len && start + s < n; s++) buf[start + s] += v.f(s, ev, r, st) * vol;
  });
  // ソフトクリップしてから 16bit WAV に
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.tanh(buf[i]) * 32000), 44 + i * 2);
  return pcm;
}
