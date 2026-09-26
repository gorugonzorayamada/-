// series.js — シリーズ『AIショートショート』共通の見た目
// 字幕・冒頭ロゴ・エンドカード・フォント読み込み。各話はこれを使って統一感を出す。
(function () {
  const { W, H, seg, ease, narrAt } = MG;
  const SERIES = 'AIショートショート';
  const MIN = (w, s) => `${w} ${s}px "Shippori Mincho"`;
  const SANS = (w, s) => `${w} ${s}px "Noto Sans JP"`;

  // 話者ごとの声（scripts/tts.py に渡す）。
  //   vv*: VOICEVOX（話者名・スタイル・速さ・高さ）/ speed, halfTone: Open JTalk（VOICEVOX がないとき）
  //   fx: 声のエフェクト（robot=機械音声, phone=電話越し）
  const VOICE = {
    narrator: { vv: { name: '青山龍星', style: 'しっとり' }, vvSpeed: 1.0 },                        // 語り手：低く落ち着いた声
    alien: { vv: { name: 'Voidoll', style: 'ノーマル' }, vvSpeed: 0.95, fx: 'robot', speed: 0.95, halfTone: -5 }, // 宇宙人
    owner: { vv: { name: '雀松朱司', style: 'ノーマル' }, vvSpeed: 0.95, speed: 0.95, halfTone: 0 },     // 店主（若い声のまま312歳）
    future: { vv: { name: '白上虎太郎', style: 'ふつう' }, vvSpeed: 1.0, fx: 'phone', halfTone: 0 },       // 電話の向こうの「三分後の自分」
    whisper: { vv: { name: '白上虎太郎', style: 'びくびく' }, speed: 0.95, halfTone: 0 },                // 主人公の小声
    operator: { vv: { name: '四国めたん', style: 'ノーマル' }, fx: 'phone', halfTone: 3 },              // 電話の向こうの警察官
    robot: { vv: { name: 'ナースロボ＿タイプＴ', style: 'ノーマル' }, halfTone: 2 },                    // 身代わりロボット
  };
  // [t, text, who, yomi] の配列からナレーション定義を作る
  function lines(arr) {
    return arr.map(([t, text, who = 'narrator', yomi]) => ({ t, text, who, yomi, ...VOICE[who] }));
  }

  // 字幕。style: 'plain'（白文字＋影）/'box'（半透明の帯）
  function caption(ctx, narration, t, opt = {}) {
    const n = narrAt(narration, t, opt.hold ?? 0.5);
    if (!n || n.line.noCaption || (opt.only && !opt.only.includes(n.line.who))) return;
    const size = opt.size || 58, y = opt.y ?? 1500, maxW = opt.maxW || W - 140;
    ctx.save();
    ctx.globalAlpha = Math.max(0, n.k);
    ctx.font = opt.font || MIN(500, size);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ls = MG.wrap(ctx, n.line.text, maxW), lh = size * 1.45;
    ls.forEach((s, i) => {
      const yy = y + (i - (ls.length - 1) / 2) * lh;
      if (opt.style === 'box') {
        const w = ctx.measureText(s).width + 48;
        ctx.fillStyle = opt.boxColor || 'rgba(0,0,0,0.55)'; MG.rrect(ctx, W / 2 - w / 2, yy - lh / 2, w, lh, 14); ctx.fill();
      } else {
        ctx.fillStyle = opt.shadow || 'rgba(0,0,0,0.6)'; ctx.fillText(s, W / 2 + 3, yy + 3);
      }
      ctx.fillStyle = opt.color || (n.line.who === 'narrator' ? '#fff' : opt.otherColor || '#fff');
      ctx.fillText(s, W / 2, yy);
    });
    ctx.restore();
  }

  // 冒頭3秒だけ出る小さなシリーズロゴ
  function logo(ctx, t, no, dark = true, y = 130) {
    const a = Math.min(seg(t, 0.2, 0.7), 1 - seg(t, 3.2, 3.8));
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.85)' : 'rgba(30,25,40,0.8)';
    ctx.font = MIN(800, 34); ctx.fillText(SERIES, W / 2, y);
    ctx.font = MIN(500, 28); ctx.fillText(`第${no}話`, W / 2, y + 46);
    ctx.restore();
  }

  // エンドカード
  function endCard(ctx, t, t0, no, title, bg = '#0b0b10') {
    const a = seg(t, t0, t0 + 0.8);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = seg(t, t0 + 0.3, t0 + 1.0);
    ctx.fillStyle = '#8d8a9a'; ctx.font = MIN(500, 40); ctx.fillText(`第${no}話`, W / 2, 840);
    ctx.fillStyle = '#f2f0f7'; ctx.font = MIN(800, 96); ctx.fillText(title, W / 2, 960);
    ctx.globalAlpha = seg(t, t0 + 0.8, t0 + 1.5);
    ctx.fillStyle = '#c9a86a'; ctx.fillRect(W / 2 - 60, 1060, 120, 2);
    ctx.fillStyle = '#b8b4c6'; ctx.font = MIN(500, 40); ctx.fillText(SERIES, W / 2, 1130);
    ctx.restore();
  }

  // 使う文字をまとめて読み込むためのフォント指定
  function fonts(text, { sans = false } = {}) {
    const f = [{ family: 'Shippori Mincho', weight: 500, text }, { family: 'Shippori Mincho', weight: 800, text }];
    if (sans) f.push({ family: 'Noto Sans JP', weight: 400, text }, { family: 'Noto Sans JP', weight: 700, text });
    return f;
  }
  function textOf(narration, extra = '') {
    return SERIES + '第話0123456789' + narration.map((l) => l.text).join('') + extra;
  }

  window.S = { SERIES, MIN, SANS, VOICE, lines, caption, logo, endCard, fonts, textOf };
})();
