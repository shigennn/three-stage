# ロゴとアイコン

このドキュメントでは、THREE Stage のロゴとアイコンの SVG ファイルを説明する。

## ファイルの一覧

| ファイル | 内容 | サイズ |
|---|---|---|
| `logo-light.svg`、`logo-dark.svg` | アイコンとロゴタイプ | 465.4×96 |
| `icon-light.svg`、`icon-dark.svg` | アイコンのみ | 96×96 |
| `wordmark-light.svg`、`wordmark-dark.svg` | ロゴタイプのみ | 592.7×91.4 |
| `app-icon.svg` | アプリケーションのアイコン | 512×512 |

明るい背景には `-light`、暗い背景には `-dark` のファイルを使用する。\
`icon-light.svg`、`icon-dark.svg` は、ファビコンにも使用する。

## ロゴタイプ

ロゴタイプは、Space Grotesk（SIL Open Font License）をアウトライン化したものである。\
フォントを読み込まずに表示できる。

## アプリケーションのアイコン

`app-icon.svg` は、白い角丸の背景に `icon-light.svg` の図柄を配置したものである。\
明るいタスクバーでも輪郭を判別できるよう、背景の縁に薄い灰色の線を付与している。\
`packages/studio/electron/icon.png` は、このファイルから書き出したものである。
