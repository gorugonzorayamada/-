#!/usr/bin/env bash
# VOICEVOX エンジン（Linux CPU 版）を用意して起動する。
#   Docker Hub の公式イメージ voicevox/voicevox_engine から中身を取り出す（約 2GB、初回のみ）。
#   必要なネットワーク許可: auth.docker.io, registry-1.docker.io と Docker Hub の配信 CDN
# 使い方: bash scripts/setup-voicevox.sh   → http://127.0.0.1:50021 で起動
set -euo pipefail
DIR="${VOICEVOX_DIR:-$HOME/.voicevox}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
if curl -fs http://127.0.0.1:50021/version >/dev/null; then echo "VOICEVOX はすでに起動しています"; exit 0; fi
if [ ! -f "$DIR/rootfs/opt/voicevox_engine/run" ]; then
  mkdir -p "$DIR"
  python3 "$ROOT/voicevox_pull.py" "$DIR/rootfs"
fi
ENGINE="$DIR/rootfs/opt/voicevox_engine"
chmod +x "$ENGINE/run"
(cd "$ENGINE" && nohup ./run --host 127.0.0.1 --port 50021 > "$DIR/engine.log" 2>&1 &)
for i in $(seq 1 60); do
  if curl -fs http://127.0.0.1:50021/version >/dev/null; then echo "VOICEVOX 起動: $(curl -s http://127.0.0.1:50021/version)"; exit 0; fi
  sleep 2
done
echo "起動に失敗しました。$DIR/engine.log を確認してください"; exit 1
