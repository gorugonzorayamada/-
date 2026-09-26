"""ナレーション合成。VOICEVOX エンジンが動いていればそれを使い、なければ Open JTalk を使う。

使い方: python3 scripts/tts.py < lines.json > result.json
  入力: [{"id", "text", "yomi"?, "vv": {"name": "青山龍星", "style": "ノーマル"}?,
          "vvSpeed"?, "vvPitch"?, "vvIntonation"?, "speed"?, "half_tone"?, "maxDur"?}, ...]
  出力: [{"id", "wav", "dur", "kana", "engine"}, ...]
  - kana: 実際の読み。読み間違いは台本側の yomi（カタカナ・ひらがな）で直す。
  - maxDur: 次のセリフまでの秒数。超える場合は話す速度を少しだけ上げて収める（最大 1.25 倍）。
環境変数 VOICEVOX_URL（既定 http://127.0.0.1:50021）、TTS_ENGINE=openjtalk で強制切替。
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request
import wave

import numpy as np

VV = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")
SR = 48000


def vv_alive():
    if os.environ.get("TTS_ENGINE") == "openjtalk":
        return False
    try:
        urllib.request.urlopen(VV + "/version", timeout=2)
        return True
    except Exception:
        return False


def http(path, data=None, params=None):
    url = VV + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


_speakers = None


def speaker_id(vv):
    """話者名とスタイル名から VOICEVOX のスタイル ID を引く"""
    global _speakers
    if _speakers is None:
        _speakers = json.loads(urllib.request.urlopen(VV + "/speakers").read())
    for sp in _speakers:
        if sp["name"] == vv["name"]:
            for st in sp["styles"]:
                if st["name"] == vv.get("style", "ノーマル"):
                    return st["id"]
            return sp["styles"][0]["id"]
    raise SystemExit(f"VOICEVOX に話者 {vv['name']} がいません")


def read_wav(b):
    with wave.open(io.BytesIO(b)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(axis=1)
        return x, w.getframerate()


def synth_vv(ln, say, speed):
    sid = speaker_id(ln.get("vv") or {"name": "青山龍星"})
    q = json.loads(http("/audio_query", params={"text": say, "speaker": sid}))
    q["speedScale"] = speed
    q["pitchScale"] = ln.get("vvPitch", 0.0)
    q["intonationScale"] = ln.get("vvIntonation", 1.0)
    q["prePhonemeLength"] = 0.05
    q["postPhonemeLength"] = 0.1
    q["outputSamplingRate"] = SR
    x, sr = read_wav(http("/synthesis", data=json.dumps(q).encode(), params={"speaker": sid}))
    return x, sr, q.get("kana", "")


def synth_ojt(ln, say, speed):
    with contextlib.redirect_stdout(sys.stderr):
        import pyopenjtalk
        x, sr = pyopenjtalk.tts(say, speed=speed, half_tone=ln.get("half_tone", -1))
        kana = pyopenjtalk.g2p(say, kana=True)
    return x.astype(np.float32) / 32768.0, sr, kana


def trim_norm(x, sr):
    if sr != SR:
        idx = np.arange(0, len(x), sr / SR)
        x = np.interp(idx, np.arange(len(x)), x).astype(np.float32)
    nz = np.where(np.abs(x) > 0.01)[0]
    if len(nz):
        x = x[max(0, nz[0] - 480): nz[-1] + 2400]
    return x / (np.max(np.abs(x)) + 1e-9) * 0.7


def main():
    # Windows でも日本語の JSON を正しく読み書きする
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    lines = json.load(sys.stdin)
    use_vv = vv_alive()
    outdir = tempfile.mkdtemp(prefix="tts-")
    result = []
    for ln in lines:
        say = ln.get("yomi") or ln["text"]
        base = ln.get("vvSpeed", 1.0) if use_vv else ln.get("speed", 1.0)
        synth = synth_vv if use_vv else synth_ojt
        x, sr, kana = synth(ln, say, base)
        x = trim_norm(x, sr)
        dur = len(x) / SR
        # 次のセリフに重なるなら、少しだけ速く話す
        if ln.get("maxDur") and dur > ln["maxDur"]:
            k = min(1.25, dur / ln["maxDur"] * 1.02)
            x, sr, kana = synth(ln, say, base * k)
            x = trim_norm(x, sr)
            dur = len(x) / SR
        path = os.path.join(outdir, ln["id"] + ".wav")
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((x * 32767).astype(np.int16).tobytes())
        result.append({"id": ln["id"], "wav": path, "dur": dur, "kana": kana, "engine": "voicevox" if use_vv else "openjtalk"})
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
