# AIショートショート

星新一のショートショートを参考にした、1話完結の縦型ショート動画シリーズです。
どの動画も 1080×1920・30fps・約50秒で、ナレーション、BGM、効果音が入っています。

| 話 | ファイル | タイトル | 表現 | 後味 |
|---|---|---|---|---|
| 1 | `01-reply.mp4` | 返信 | チャット画面 | 皮肉 |
| 2 | `02-shadow.mp4` | 一日先の影 | シルエット劇 | ほっこり・恋愛 |
| 3 | `03-time-shop.mp4` | 時間買い取ります | 文字と数字 | 皮肉・考えさせる |
| 4 | `04-no-corners.mp4` | 角のない国 | 図形キャラ（絵本風） | 寓話・ほっこり |
| 5 | `05-optimize.mp4` | 最適化 | アプリ画面と図形 | 皮肉からの救い |
| 6 | `06-report.mp4` | 第三惑星調査報告 | 報告書とシルエット | 風刺・余韻 |

## 素材について
- **ナレーション**：Open JTalk（pyopenjtalk-plus）による合成音声。全行の読みをカナに変換して確認済み。
- **BGM・効果音**：すべてプログラムで作曲・合成したオリジナル。外部の音源は使っていません。
- **フォント**：しっぽり明朝、Noto Sans JP、Zen Maru Gothic（いずれも SIL Open Font License）。

## 作り直すとき
```sh
npm install
pip install pyopenjtalk-plus imageio-ffmpeg
node scripts/render.mjs stories/01-reply --out AIショートショート   # 1話だけ
node scripts/render.mjs stories/01-reply --yomi                    # 読みの確認だけ
```
台本（ナレーションと読み、タイミング）は `stories/<話>/index.html` の先頭にまとまっています。
