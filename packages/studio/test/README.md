# test

THREE Stage のエンドツーエンドテスト。
ツールが扱う要素をすべて含むテスト用のプロジェクト（`fixture/`）を、組み込み先と同じ手順（Publish、パッケージの作成、バンドルの読み込み）で処理し、結果を確認する。
THREE Stage 自体を開発する人向けの文書である。

## 実行

リポジトリのルートで実行する。

```bash
npm test
```

Chrome が必要である。
既定のパスにない場合は、環境変数 `CHROME_PATH` で指定する（`../tools/README.md`）。

| 環境変数 | 内容 |
|---|---|
| `CHROME_PATH` | Chrome の実行ファイルのパス |
| `TEST_GPU=1` | 実際の GPU で描画する。指定しない場合は SwiftShader（CPU による描画）を使う |
| `KEEP=1` | 作業用のフォルダ（OS の一時フォルダに複製した `fixture/`）を削除せずに残す |

テストはネットワークに接続しない。

## 確認する項目

| グループ | 確認する内容 |
|---|---|
| `types` | `three-stage typecheck` が通ること |
| `Publish` | 4つのシーンを書き出せること。パラメーターの既定値が参照するファイル、フォント、EXR・HDR・KTX2・圧縮した glTF、デコーダー（Draco、Basis）、Event の一覧がバンドルに含まれること。アセットが不足している場合に Publish が中断されること |
| `build` | パッケージ（tgz）に、エントリー、型定義、README が含まれること。エントリーから参照されない型定義が含まれないこと。`'use client'` が保持され、ファイルパスを含むコメントが残らないこと |
| `main`、`alt1`〜`alt3`、`content` | エディタのサーバーを起動し、ヘッドレス Chrome で `preview.html?bundle=` を開いて、three.js のシーンと 2D UI の状態を読み取る。テクスチャ、マテリアル、圧縮した glTF、オブジェクトの位置の上書き、コンポーネントのパラメーター、リフレクションプローブ、アニメーション Clip、List Change と独自 Trigger による Event、`fire` による Event の再生、Event の Animation Track、データで非表示にしたオブジェクトが Event の開始時に消えないこと、警告とエラーが出ないこと。`alt1`〜`alt3` は環境光の設定を変えたシーン、`content` はバンドルを経由せず `content/` から直接読み込む |

組み込み先の Web アプリケーション（Next.js など）での動作確認は含まない。
パッケージを npm からインストールする必要があり、ネットワーク接続が必要になるためである。

## テスト用のプロジェクト

| パス | 内容 |
|---|---|
| `fixture/content/scenes/main.stage.json` | すべての要素を含むシーン。HDRI B と Blend、リフレクションプローブ、5種類のライト、マテリアル（MeshStandardMaterial の全テクスチャ、MeshPhysicalMaterial、KTX2、独自シェーダーの2つの書き方）、ポストプロセス（組み込みの4種類、独自エフェクトの2つの書き方）、2種類のコンポーネント、Empty、4台のカメラ（Drift と独自の Motion）、Activation Track と Animation Track、3つの Event |
| `fixture/content/scenes/alt1〜3.stage.json` | `main` の環境光の設定を変えたシーン（背景色と Room Environment、背景なしと HDR、環境光なし） |
| `fixture/src/` | すべての種類の登録（コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動き、2D UI、モックデータ）。テストが読み取る値を `window.__probe` に出力する |

アセットは `node packages/studio/test/make-fixture-assets.mjs` で再生成する。
スクリプトで生成していないファイルは、スクリプトの先頭に記載している。
