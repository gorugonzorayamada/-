// mg.js — 縦型ショート用の最小モーショングラフィックエンジン
// 各シーンは draw(ctx, t) を1つ定義するだけ。t は秒。
// 同じ t なら必ず同じ絵になる（決定的）ので、プレビューと書き出しが一致する。
(function () {
  const W = 1080, H = 1920, FPS = 30;

  // ---- 数学ユーティリティ ----
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  // t が [a, b] のどこにいるかを 0..1 で返す
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = {
    linear: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inCubic: (p) => p * p * p,
    outBack: (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    outElastic: (p) => p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  };
  // 決定的な疑似乱数（シード固定）
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  // 1次元の滑らかなノイズ（手ぶれ・揺らぎ用）
  function noise1(x, seed = 0) {
    const h = (n) => { const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(h(i), h(i + 1), u) * 2 - 1;
  }

  // キーフレーム補間: keys = [[時刻, 値, イージング名?], ...]。イージングは次のキーへの区間に適用
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0, e] = keys[i], [t1, v1] = keys[i + 1];
      if (t < t1) return lerp(v0, v1, ease[e || 'inOut']((t - t0) / (t1 - t0)));
    }
    return keys[keys.length - 1][1];
  }

  // ---- 描画ユーティリティ ----
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 日本語向けの文字単位折り返し
  function wrap(ctx, text, maxW) {
    const lines = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
        else line += ch;
      }
      lines.push(line);
    }
    return lines;
  }

  function create(scene) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const render = new URLSearchParams(location.search).has('render');

    // canvas は unicode-range 分割フォントを自動で読み込まないので、使う文字を明示的に読み込む
    const ready = Promise.all((scene.fonts || []).map((f) =>
      document.fonts.load(`${f.weight || 400} 40px "${f.family}"`, f.text || 'あ')
    )).then(() => document.fonts.ready);

    const renderFrame = (t) => {
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      scene.draw(ctx, t);
      ctx.restore();
    };

    window.__mg = { W, H, fps: FPS, duration: scene.duration, sfx: scene.sfx || [], ready, renderFrame, canvas };

    if (!render) {
      // プレビュー: ループ再生 + シークバー
      const bar = document.createElement('div');
      bar.id = 'mg-bar';
      bar.innerHTML = '<button id="mg-play">⏸</button><input id="mg-seek" type="range" min="0" step="0.01"><span id="mg-time"></span>';
      document.body.appendChild(bar);
      const seek = bar.querySelector('#mg-seek'), play = bar.querySelector('#mg-play'), label = bar.querySelector('#mg-time');
      seek.max = scene.duration;
      let playing = true, t0 = performance.now(), cur = 0;
      play.onclick = () => { playing = !playing; play.textContent = playing ? '⏸' : '▶'; t0 = performance.now() - cur * 1000; };
      seek.oninput = () => { cur = +seek.value; t0 = performance.now() - cur * 1000; };
      ready.then(() => {
        const loop = () => {
          if (playing) cur = ((performance.now() - t0) / 1000) % scene.duration;
          renderFrame(cur);
          seek.value = cur; label.textContent = cur.toFixed(1) + 's';
          requestAnimationFrame(loop);
        };
        loop();
      });
    }
  }

  window.MG = { W, H, FPS, clamp, lerp, seg, ease, rng, noise1, kf, rrect, wrap, create };
})();
