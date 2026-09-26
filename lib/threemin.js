// threemin.js — 「三分後の自分」前編・後編で共通の演出
(function () {
  const { W, H, seg, ease, lerp, clamp, rrect, noise1, rng } = MG;
  const F = (w, s) => `${w} ${s}px "Noto Sans JP"`;

  // 3分のカウントダウン。sec: 残り秒、big: 画面中央に大きく
  function countdown(ctx, sec, a, big = false) {
    if (a <= 0) return;
    const m = Math.floor(Math.max(0, sec) / 60), s = Math.floor(Math.max(0, sec) % 60);
    const txt = `${m}:${String(s).padStart(2, '0')}`;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    if (big) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrect(ctx, W / 2 - 300, 780, 600, 300, 40); ctx.fill();
      ctx.fillStyle = '#ff4d5e'; ctx.font = F(700, 190); ctx.fillText(txt, W / 2, 1000);
    } else {
      // ヘッダーの右側にタイマーを出す
      ctx.fillStyle = 'rgba(90,10,20,0.95)'; rrect(ctx, W - 300, 124, 240, 100, 50); ctx.fill();
      ctx.fillStyle = '#ff8090'; ctx.font = F(700, 64); ctx.fillText(txt, W - 180, 196);
    }
    ctx.restore();
  }

  // インターホンのモニター（フードの人影）。near: 近さ 0..1
  function intercom(ctx, t, a, near = 0) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    const y = lerp(-700, 300, ease.outCubic(Math.min(1, a * 1.2)));
    ctx.fillStyle = '#1b1d22'; rrect(ctx, 90, y, W - 180, 760, 40); ctx.fill();
    ctx.fillStyle = '#9aa0ad'; ctx.font = F(700, 34); ctx.fillText('インターホン　玄関', 140, y + 64);
    ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(W - 150, y + 52, 10, 0, Math.PI * 2); ctx.fill();
    // 画面: 暗い廊下と人影（ノイズでちらつく）
    ctx.save(); ctx.beginPath(); rrect(ctx, 130, y + 100, W - 260, 600, 18); ctx.clip();
    const g = ctx.createRadialGradient(W / 2, y + 250, 20, W / 2, y + 400, 500);
    g.addColorStop(0, '#6f7a74'); g.addColorStop(1, '#141816');
    ctx.fillStyle = g; ctx.fillRect(130, y + 100, W - 260, 600);
    const s = lerp(1, 1.6, near), cx = W / 2 + noise1(t * 2, 3) * 6, cy = y + 700;
    ctx.fillStyle = '#0a0c0b';
    ctx.beginPath(); ctx.moveTo(cx - 200 * s, cy); ctx.quadraticCurveTo(cx - 190 * s, cy - 260 * s, cx - 90 * s, cy - 300 * s);
    ctx.quadraticCurveTo(cx - 110 * s, cy - 480 * s, cx, cy - 500 * s); ctx.quadraticCurveTo(cx + 110 * s, cy - 480 * s, cx + 90 * s, cy - 300 * s);
    ctx.quadraticCurveTo(cx + 190 * s, cy - 260 * s, cx + 200 * s, cy); ctx.fill();
    // 走査線とノイズ
    const r = rng(Math.floor(t * 24));
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${(r() * 0.08).toFixed(3)})`; ctx.fillRect(130, y + 100 + r() * 600, W - 260, 2); }
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let yy = y + 100; yy < y + 700; yy += 5) ctx.fillRect(130, yy, W - 260, 2);
    ctx.restore();
    ctx.fillStyle = '#9aa0ad'; ctx.font = F(400, 28); ctx.fillText(`REC  ${new Date(0).toISOString().slice(0, 0)}00:0${Math.floor(t) % 10}`, 150, y + 740);
    ctx.restore();
  }

  // こぼれたコーヒーのしみ（画面を伝って流れる）
  function coffee(ctx, t, t0) {
    const p = seg(t, t0, t0 + 1.2), fade = 1 - seg(t, t0 + 3.2, t0 + 4.2);
    if (p <= 0 || fade <= 0) return;
    ctx.save(); ctx.globalAlpha = 0.75 * fade; ctx.fillStyle = '#4a2c17';
    const r = rng(77);
    for (let i = 0; i < 9; i++) {
      const x = 80 + r() * (W - 160), w = 30 + r() * 70, len = (300 + r() * 900) * ease.outCubic(p);
      ctx.beginPath(); ctx.ellipse(x, 900, w * 0.9, w * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      rrect(ctx, x - w / 3, 900, w * 0.66, len, w / 3); ctx.fill();
    }
    ctx.restore();
  }

  window.TM = { countdown, intercom, coffee };
})();
