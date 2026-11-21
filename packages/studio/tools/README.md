# 計測の命令

`three-stage shot`、`three-stage measure`、`three-stage soak` の引数と出力の一覧。
読み手は、シーンの見た目と性能を、条件を揃えて確認する人。
目標の数字と、測った結果の読み方は [docs/performance.md](../../../docs/performance.md) にある。

## 一覧

| 命令 | スクリプト | 内容 |
|---|---|---|
| `three-stage shot` | `cdp.mjs` | ヘッドレス Chrome で 1920×1080 のスクリーンショットを撮る。`check.js` で 2D UI の文字の重なりとはみ出しを数える |
| `three-stage measure` | `measure.mjs` | 1フレームの draw call、ポリゴン数、パスごとの内訳、フレームの間隔を出力する |
| `three-stage soak` | `soak.mjs` | 長く動かして、JS のヒープと WebGL のオブジェクトの数が増え続けないかを判定する |

`chrome.mjs` は、`cdp.mjs` と `soak.mjs` が使う、ヘッドレス Chrome の起動と CDP の接続の部品である。
リポジトリから動かすときは、`three-stage` の代わりに `node packages/studio/bin/three-stage.mjs` を実行する。

## 必要なもの

- Windows。GPU で描画するときは、Chrome の ANGLE を D3D11 で動かす。
- Chrome。既定のパスは `C:/Program Files/Google/Chrome/Application/chrome.exe`。別の場所にあるなら、環境変数 `CHROME_PATH` で指定する。
- リポジトリから動かすときは Node 22 以上（グローバルの `fetch` と `WebSocket` を使う）。インストールしたアプリの `three-stage` は、アプリに含まれる Node で動く。
- 窓を開かずに起動したスタジオのサーバー。どの命令も、そのサーバーのページを開く。

```powershell
three-stage <folder> --no-open --port 5180
```

下の例の URL は、このサーバーのものである。
相対パスの引数と出力先は、命令を実行したフォルダを基準にする。

Chrome のプロファイルは、OS の一時フォルダの `three-stage-tools\` の下に作る。
同じプロファイルで Chrome がすでに動いていると、新しく起動した Chrome はそちらに処理を渡して終了する。
`shot` を同時に2つ動かすときは、3つ目の引数でプロファイルの名前を分ける。
`measure` はモード（`gpu` か `swiftshader`）ごとに1つのプロファイルを使うので、同じモードでは同時に動かせない。
`soak` は実行ごとに別のプロファイルを作り、終了時に削除する。

## preview.html

`http://127.0.0.1:5180/preview.html` は、組み込み先と同じ描画だけを表示するページである。
3つの命令は、どれもこのページを開いて使う。

| クエリ | 内容 | 既定 |
|---|---|---|
| `scene` | 開くシーンの、`content/` からのパス | `scenes/main.stage.json` |
| `bundle` | `content/` のシーンの代わりに、Publish したバンドルの `manifest.json` を開く（`/dist/bundle/manifest.json`） | なし |
| `start` | モックデータの開始時刻（`HH:MM`） | `12:00` |
| `speed` | モックデータの時刻の進む速さ。実時間の1秒で `speed` 秒進む。`1440` で、1日が1分で進む | `60` |
| `variant` | モックデータのバリエーションの ID | 最初のバリエーション |
| `limit` | `0` で 30fps の制限を外す | 制限あり |
| `res` | レンダリング解像度。`1080p`、`720p`、`auto`（Dynamic Resolution） | `1080p` |
| `quality` | Quality。`high` か `low` | `high` |
| `ui` | `0` で 2D UI を表示しない。3D だけの負荷を測るときに使う | 表示する |

ページの `window.__stage` で、次の値を読める。

| 値 | 内容 |
|---|---|
| `stats` | ランタイムの `FrameStats`。`stats.last` で今の数字を読む。時間は直近120フレームの中央値、数は直前のフレームの値 |
| `events` | `EventStore` |
| `played` | 再生した Event の一覧。1件が「名前 Key 発生元」の文字列で、発生元は `data`（データの変化）か `call`（コードからの呼び出し） |

## three-stage shot

`cdp.mjs` を実行する。

```powershell
three-stage shot steps.json out/shots
```

| 引数 | 内容 |
|---|---|
| 1つ目 | 手順の JSON ファイル |
| 2つ目 | 画像を書き出すフォルダ。無ければ作る |
| 3つ目 | プロファイルの名前（既定は `prof`） |

`steps.json` は手順の配列で、上から順に実行する。

```json
[
  { "name": "noon", "url": "http://127.0.0.1:5180/preview.html?start=12:00", "wait": 10000, "check": true },
  { "name": "evening", "url": "http://127.0.0.1:5180/preview.html?start=18:00", "wait": 10000, "check": true }
]
```

1つの手順は、次のキーの順に実行する。

| キー | 内容 |
|---|---|
| `url` | 開く URL。load のイベントを最大10秒待つ |
| `js` | 開いた後に評価する式。視点の切り替えなど。例外は最後の `errors:` に出力する |
| `keys` | `js` の後に送るキーの配列。`{ "key": "s", "code": "KeyS", "keyCode": 83, "ctrl": true, "shift": true, "alt": true, "text": "入力する文字", "wait": ミリ秒 }`。`wait` の既定は 50 |
| `mouse` | `keys` の後に送るマウスの操作の配列。`{ "type": "down" \| "move" \| "up", "x", "y", "held": true（押したまま動かす）, "ctrl": true, "wait": ミリ秒 }`。`wait` の既定は 30。ドラッグの確認に使う |
| `wait` | 撮る前に待つミリ秒 |
| `out` | 評価して、結果を出力する式 |
| `check` | `true` なら `check.js` を評価して、結果を出力する |
| `thumb` | 幅800の縮小画像（JPEG）を書き出すパス |
| `name` | 画像のファイル名（`<name>.jpg`）。出力の行の見出しにも使う。無い手順は撮らない |
| `shot` | `false` なら撮らない |

出力は、`out` と `check` の結果を1行ずつ「`<name> <JSON>`」で並べ、最後に `errors:` を出力する。
`errors:` には、console の error と warning、ページの例外、ブラウザのログの error、`js` の例外が並ぶ。
何も無ければ `errors: none` になる。

描画は、既定では SwiftShader（CPU でのソフトウェア描画）で行う。
見た目の確認用で、速さは測れない。速さは `three-stage measure` で測る。
SwiftShader では1フレームに数百 ms かかり、読み込みにも数秒かかるので、`wait` を長めに取る。
フレームの間隔が 250ms を超えると、ランタイムは1フレームを 1/30 秒として進める。
そのため SwiftShader では、カメラや Clip の再生が実時間よりずっと遅く進む。
再生の後の場面を撮るときは、環境変数 `CDP_GPU=1` を付けて GPU で描画する。

## check.js

`check: true` の手順で、ページの中で評価するスクリプト。
ランタイムは 2D UI のステージの要素に `id="stage"` を付ける。
`check.js` はこの要素の中を調べ、2D UI が無いページ（2D UI を登録していないプロジェクトや `ui=0`）では `"no stage"` を返す。

座標は、ステージの幅を 1920、高さを 1080 とみなして、ステージの座標に直して返す。
画面の解像度が 4K でも、ステージの幅から倍率を求めて換算する。
Aspect Ratio が 16:9 でないシーンでは、ステージの幅が 1920 でないので、座標と `edge` の判定がずれる。

見えている文字は、テキストノードごとに数える。
`opacity` が 0.12 未満の祖先がある文字は、見えていないものとして扱う。

| 項目 | 内容 |
|---|---|
| `texts` | 見えている文字の数 |
| `overlaps` | 別の要素の文字どうしが、縦横とも 2px を超えて重なっている箇所（最大30件） |
| `overflow` | いちばん近い、背景か罫線のある祖先の要素（幅40以上、高さ20以上）から、文字がはみ出している箇所（最大30件） |
| `clipped` | `overflow: hidden` や `clip` で切れている文字（最大20件） |
| `edge` | ステージの外にはみ出している文字（最大20件） |
| `align` | 横に並んだ、背景か罫線のある要素（幅160以上、高さ80以上）で、上端か下端が 1px を超え 200px 未満ずれている組（最大20件）。縦に半分以上重なっている組だけを比べる |

## three-stage measure

`measure.mjs` を実行する。
WebGL2 の呼び出しを数えて、1フレームの描画の内容を出力する。

```powershell
three-stage measure "http://127.0.0.1:5180/preview.html?start=12:00&limit=0"
```

| 引数 | 内容 |
|---|---|
| 1つ目 | 測る URL か、複数の場面を並べた `runs.json`（`.json` で終わるパス） |
| 2つ目 | `gpu`（既定）か `swiftshader` |

`gpu` は D3D11 で GPU を使い、どちらのモードも垂直同期と Chrome のフレームレートの制限を外して動かす。
1フレームの上限と比べるときは、`preview.html` に `limit=0` を付けて、ランタイムの 30fps の制限も外す。

`runs.json` は場面の配列で、上から順に測る。

```json
[
  { "label": "noon", "url": "http://127.0.0.1:5180/preview.html?start=12:00&limit=0" },
  { "label": "noon 720p", "url": "http://127.0.0.1:5180/preview.html?start=12:00&limit=0&res=720p", "warm": 6000 }
]
```

| キー | 内容 | 既定 |
|---|---|---|
| `label` | 出力の行の見出し | `url` |
| `url` | 開く URL。load のイベントを最大15秒待つ | 無ければ前の場面のページのまま |
| `js` | 開いた後に評価する式 | なし |
| `warm` | 集計を始める前に待つミリ秒 | 8000 |
| `sample` | 集計するミリ秒 | 6000 |

出力は、最初の行が `GPU: <レンダラーの名前>`、次に場面ごとに「`<label> <JSON>`」の1行、最後に `shaders`、`lights`、`errors:`（ページの例外）である。

場面の JSON の項目は次のとおり。
集計するのは、draw call が1回以上あったフレームだけである。

| 項目 | 内容 |
|---|---|
| `frames` | 集計したフレームの数 |
| `calls` / `callsMax` | 1フレームの draw call（中央値と最大） |
| `instanced` | そのうち、インスタンスの数が2以上の draw call（中央値） |
| `tris` / `trisMax` | 1フレームで描画した三角形の数（中央値と最大）。シャドウマップやリフレクションでシーンを複数回描画すると、その分増える |
| `lines` / `points` | 1フレームで描画した線の頂点数と点の数（中央値） |
| `cpuMs` / `cpuP95` | 描画した rAF のコールバックの中の JS の時間（中央値と95パーセンタイル） |
| `frameMs` / `frameP95` | フレームの間隔（中央値と95パーセンタイル）。1フレームの上限と比べるのはこれ |
| `canvas` | ページの最初の canvas の大きさ |
| `programs` | ページを開いてから link したシェーダープログラムの数 |
| `pass` | viewport の大きさごとの、そのパスを含むフレームの数（`frames`）、draw call（`calls`）、三角形の数（`tris`）。シャドウマップ（`2048x2048` など）、メインのパス（`1920x1080`）、Bloom の縮小したレンダーターゲットが別々に集計される |

`shaders` は、three.js のマテリアルの種類（`SHADER_TYPE`）ごとの、コンパイルしたフラグメントシェーダーの数である。
`lights` は、シェーダーの `#define NUM_DIR_LIGHTS` などの最大値を読む。
three.js（0.186）はライトの数を `#define` でなく文字列の置き換えでシェーダーに埋め込むので、`lights` は空になる。
ライトの数は、ページの中で `scene.traverse` して `isLight` を数える。

- ウィンドウは 1920×1080、デバイスピクセル比は 1 で固定する。720p の上限と比べるときは、`res=720p` でレンダリング解像度を下げて測る。
- HTTP のキャッシュは使わない。
- フレームは直近の2000枚だけを保持する。フレームの速いページでは、`sample` の一部だけが集計される。

## three-stage soak

`soak.mjs` を実行する。
ページを長く動かし、JS のヒープと WebGL のオブジェクトの数を記録して、増え続けていないかを判定する。

```powershell
three-stage soak "http://127.0.0.1:5180/preview.html?start=00:00&speed=1440&limit=0" --minutes 30
```

`speed=1440` で、モックデータの1日が1分で進む。
`limit=0` で 30fps の制限を外し、同じ時間で描画するフレームの数を増やす。

| 引数 | 内容 | 既定 |
|---|---|---|
| URL | 開くページ | 必須 |
| `--minutes` | 動かす分。実時間で24時間動かすなら 1440 | 30 |
| `--every` | 記録する間隔の秒 | 30 |
| `--warmup` | 判定に含めない最初の分。読み込みとシェーダーの作成で増える分を除く | 2 |
| `--js` | 開いた後に評価する式 | なし |
| `--out` | 記録の CSV のパス | `out/soak-<日時>.csv` |
| `--swiftshader` | GPU を使わず SwiftShader で描画する | GPU で描画する |

ページの load のイベントは最大20秒待つ。
バックグラウンドのタブとしての間引きは外して動かす。

記録のたびに、CDP で GC を実行してから、次の列を CSV に1行追加し、同じ内容を1行出力する。

| 列 | 内容 |
|---|---|
| `min` | 開始からの分 |
| `heapMB` | GC の後の JS のヒープ（MB） |
| `texture` `buffer` `framebuffer` `renderbuffer` `program` `shader` `query` `vao` | WebGL2 のオブジェクトの、作った数から削除した数を引いた数。ページのすべての WebGL2 のコンテキストについて数える |
| `dom` | DOM の要素の数 |
| `fps` | 前の記録から、1秒あたりに呼ばれた rAF のコールバックの数。ページの中のすべての rAF のループを合計するので、描画の fps とは一致しない |
| `frameMs` | `window.__stage.stats` のフレームの間隔の中央値。`preview.html` 以外のページでは空になる |

判定は、`--warmup` の後の記録を3つに分けて行う。
後ろの3分の1の最小値が、前の3分の1の最大値を超えた列を不合格（`FAIL`）にする。
対象は `heapMB` から `dom` までの列で、`heapMB` だけは 2MB までの増加を揺れとして許す。
`--warmup` の後の記録が3つ未満なら、`samples` を不合格にする。`--minutes` を増やすか、`--every` を減らす。

終了すると、ヒープの傾き（`heap slope`。1時間あたりと、24時間に延ばした値。判定には使わない）、列ごとの `PASS` か `FAIL`、`errors:`（ページの例外）、記録の場所（`log: <path>`）、全体の判定（`result: PASS` か `result: FAIL`）を出力する。
終了コードは、合格なら 0、不合格なら 1、URL が無ければ 2 である。
