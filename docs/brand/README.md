# THREE Stage のロゴ

THREE Stage のロゴとアイコンの SVG ファイル。

| ファイル | 内容 |
|---|---|
| `logo-light.svg`、`logo-dark.svg` | アイコンとロゴタイプ。465.4×96 |
| `icon-light.svg`、`icon-dark.svg` | アイコンのみ。96×96。ファビコンにも使用する |
| `wordmark-light.svg`、`wordmark-dark.svg` | ロゴタイプのみ |
| `app-icon.svg` | アプリケーションのアイコン。512×512。白い角丸の背景に `icon-light.svg` の図柄を配置し、明るいタスクバーでも輪郭が分かるよう背景の縁に薄い灰色の線を付けている。`packages/studio/electron/icon.png` はこのファイルから書き出したもの |

明るい背景には `-light`、暗い背景には `-dark` を使う。
ロゴタイプは Space Grotesk（SIL Open Font License）をアウトライン化したもので、フォントを読み込まずに表示できる。
