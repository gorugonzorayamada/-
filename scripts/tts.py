"""ナレーション合成（Open JTalk / pyopenjtalk-plus）。

使い方: python3 scripts/tts.py < lines.json > result.json
  入力:  [{"id": "n0", "text": "表示用の文", "yomi": "読み上げ用（省略可。カタカナ推奨）"}, ...]
  出力:  [{"id": "n0", "wav": "パス", "dur": 秒, "kana": "実際の読み"}, ...]
読み間違いの確認は `kana` を見る。間違っていれば台本側の yomi で上書きする。
"""
import json
import os
import sys
import tempfile
import wave

import contextlib

import numpy as np

# import 時の警告が stdout（JSON 出力先）に混ざらないようにする
with contextlib.redirect_stdout(sys.stderr):
    import pyopenjtalk

SPEED = float(os.environ.get("TTS_SPEED", "1.0"))
HALF_TONE = float(os.environ.get("TTS_HALF_TONE", "-1"))

lines = json.load(sys.stdin)
outdir = tempfile.mkdtemp(prefix="tts-")
result = []
for ln in lines:
    say = ln.get("yomi") or ln["text"]
    with contextlib.redirect_stdout(sys.stderr):
        x, sr = pyopenjtalk.tts(say, speed=ln.get("speed", SPEED), half_tone=ln.get("half_tone", HALF_TONE))
    x = x.astype(np.float32) / 32768.0
    # 48kHz に揃える
    if sr != 48000:
        idx = np.arange(0, len(x), sr / 48000)
        x = np.interp(idx, np.arange(len(x)), x).astype(np.float32)
    # 前後の無音を詰める
    nz = np.where(np.abs(x) > 0.01)[0]
    if len(nz):
        x = x[max(0, nz[0] - 480): nz[-1] + 2400]
    # 音量をそろえる（ピーク -3dB）
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.7
    path = os.path.join(outdir, ln["id"] + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    with contextlib.redirect_stdout(sys.stderr):
        kana = pyopenjtalk.g2p(say, kana=True)
    result.append({"id": ln["id"], "wav": path, "dur": len(x) / 48000, "kana": kana})
json.dump(result, sys.stdout, ensure_ascii=False)
