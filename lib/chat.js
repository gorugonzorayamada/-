// chat.js — チャット画面の共通部品
// Chat.create({ header, items, typing, reads }) で作り、chat.draw(ctx, t, opt) で描く。
//   items: [{ kind: 'them'|'me'|'date'|'sys', text, t }]
//   typing: 入力欄で打つ文字 [{ text, a, b, until }]（a〜b で一文字ずつ打ち、until まで表示）
//   dots:   相手の「入力中…」 [[a, b], ...]
//   reads:  既読をつける自分の吹き出しの時刻 { [t]: 既読がつく時刻 }
(function () {
  const { W, H, seg, ease, lerp, clamp, rrect, wrap } = MG;
  const F = (w, s) => `${w} ${s}px "Noto Sans JP"`;
  const C = { bg: '#0e0f13', head: '#16181e', them: '#262932', me: '#3a6df0', text: '#f2f3f5', sub: '#8b8f9a', red: '#ff5a6e' };
  const TOP = 260, BOTTOM = 1640, PADX = 40, FS = 54, LH = 74, GAP = 30;

  function create(cfg) {
    let measured = false;
    const items = cfg.items;
    function measure(ctx) {
      if (measured) return; measured = true;
      ctx.font = F(400, FS);
      for (const it of items) {
        if (it.kind === 'date') it.h = 70;
        else if (it.kind === 'sys') it.h = 90;
        else { it.lines = wrap(ctx, it.text, 800); it.w = Math.max(...it.lines.map((l) => ctx.measureText(l).width)) + 64; it.h = it.lines.length * LH + 40; }
      }
    }
    function avatar(ctx, x, y, r) {
      ctx.fillStyle = cfg.avatarColor || '#4a4e5a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = F(700, r * 0.8); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cfg.avatar || '?', x, y + 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    function bubble(ctx, it, y, t, s) {
      const mine = it.kind === 'me', x = mine ? W - PADX - it.w : PADX + 110;
      ctx.save();
      ctx.translate(mine ? x + it.w : x, y + it.h); ctx.scale(s, s); ctx.translate(mine ? -it.w : 0, -it.h);
      ctx.fillStyle = mine ? C.me : (it.danger ? '#3a1015' : C.them); rrect(ctx, 0, 0, it.w, it.h, 40); ctx.fill();
      if (it.danger) { ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.fillStyle = C.text; ctx.font = F(400, FS);
      it.lines.forEach((l, k) => ctx.fillText(l, 32, 20 + LH * k + 52));
      ctx.restore();
      if (!mine) avatar(ctx, PADX + 42, y + it.h - 42, 42);
      const r = cfg.reads && cfg.reads[it.t];
      if (mine && r !== undefined && t > r) {
        ctx.globalAlpha = seg(t, r, r + 0.3); ctx.fillStyle = C.sub; ctx.font = F(400, 32); ctx.textAlign = 'right';
        ctx.fillText('既読', x - 14, y + it.h - 10); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
    }
    function dots(ctx, y, t) {
      const x = PADX + 110;
      ctx.fillStyle = C.them; rrect(ctx, x, y, 170, 92, 46); ctx.fill();
      for (let i = 0; i < 3; i++) { const b = Math.max(0, Math.sin(t * 9 - i * 0.9)); ctx.fillStyle = `rgba(200,204,214,${0.4 + 0.6 * b})`; ctx.beginPath(); ctx.arc(x + 48 + i * 37, y + 46 - b * 10, 11, 0, Math.PI * 2); ctx.fill(); }
      avatar(ctx, PADX + 42, y + 50, 42);
    }
    function drawList(ctx, t) {
      measure(ctx);
      ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, BOTTOM - TOP); ctx.clip();
      const list = items.filter((it) => t >= it.t);
      for (const [a, b] of cfg.dots || []) if (t >= a && t < b) list.push({ kind: 'dots', h: 92, t: a });
      const hs = list.map((it) => (it.h + GAP) * ease.outCubic(seg(t, it.t, it.t + 0.3)));
      const total = hs.reduce((x, y) => x + y, 0);
      let y = TOP + 40 - Math.max(0, total - (BOTTOM - TOP - 140));
      list.forEach((it, i) => {
        const p = seg(t, it.t, it.t + 0.3), s = lerp(0.7, 1, ease.outBack(p));
        ctx.globalAlpha = clamp(p * 2);
        if (it.kind === 'date') { ctx.fillStyle = C.sub; ctx.font = F(400, 32); ctx.textAlign = 'center'; ctx.fillText(it.text, W / 2, y + 44); ctx.textAlign = 'left'; }
        else if (it.kind === 'sys') {
          ctx.font = F(700, 36); const w = ctx.measureText(it.text).width + 60;
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; rrect(ctx, W / 2 - w / 2, y + 8, w, 70, 35); ctx.fill();
          ctx.fillStyle = C.sub; ctx.textAlign = 'center'; ctx.fillText(it.text, W / 2, y + 56); ctx.textAlign = 'left';
        } else if (it.kind === 'dots') dots(ctx, y, t);
        else bubble(ctx, it, y, t, s);
        ctx.globalAlpha = 1; y += hs[i];
      });
      ctx.restore();
    }
    function header(ctx, t) {
      ctx.fillStyle = C.head; ctx.fillRect(0, 0, W, TOP);
      ctx.fillStyle = C.text; ctx.font = F(700, 34); ctx.fillText(typeof cfg.clock === 'function' ? cfg.clock(t) : (cfg.clock || '0:00'), 70, 70);
      ctx.textAlign = 'right'; ctx.fillText('▮▮▮  42%', W - 60, 70); ctx.textAlign = 'left';
      ctx.strokeStyle = C.text; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(84, 150); ctx.lineTo(60, 174); ctx.lineTo(84, 198); ctx.stroke();
      avatar(ctx, 170, 174, 44);
      ctx.font = F(700, 44); ctx.fillStyle = C.text; ctx.fillText(cfg.title, 236, 166);
      ctx.font = F(400, 28); ctx.fillStyle = C.sub; ctx.fillText(typeof cfg.subtitle === 'function' ? cfg.subtitle(t) : cfg.subtitle || '', 236, 208);
    }
    function input(ctx, t) {
      ctx.fillStyle = C.head; ctx.fillRect(0, BOTTOM, W, H - BOTTOM);
      ctx.fillStyle = '#23262e'; rrect(ctx, 48, BOTTOM + 40, W - 200, 96, 48); ctx.fill();
      let txt = '', caret = false;
      for (const ty of cfg.typing || []) if (t >= ty.a && t < ty.until) { const n = [...ty.text]; txt = n.slice(0, Math.ceil(n.length * seg(t, ty.a, ty.b))).join(''); caret = true; }
      ctx.font = F(400, 42); ctx.fillStyle = txt ? C.text : C.sub;
      ctx.fillText(txt || 'メッセージを入力', 90, BOTTOM + 103);
      if (caret && Math.floor(t * 2.5) % 2 === 0) { const w = txt ? ctx.measureText(txt).width : 0; ctx.fillStyle = C.me; ctx.fillRect(92 + w, BOTTOM + 62, 4, 52); }
      ctx.fillStyle = C.me; ctx.beginPath(); ctx.arc(W - 100, BOTTOM + 88, 48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(W - 120, BOTTOM + 66); ctx.lineTo(W - 74, BOTTOM + 88); ctx.lineTo(W - 120, BOTTOM + 110); ctx.lineTo(W - 112, BOTTOM + 88); ctx.fill();
    }
    return {
      draw(ctx, t) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); drawList(ctx, t); header(ctx, t); input(ctx, t); },
      text() { return items.map((i) => i.text).join('') + (cfg.typing || []).map((x) => x.text).join('') + cfg.title + (cfg.subtitle && typeof cfg.subtitle === 'string' ? cfg.subtitle : '') + '既読メッセージを入力▮42%?0123456789:' + (cfg.avatar || ''); },
    };
  }
  window.Chat = { create, C, F, TOP, BOTTOM };
})();
