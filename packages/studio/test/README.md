# エンドツーエンドテスト

このドキュメントでは、THREE Stage のエンドツーエンドテストの実行方法と確認項目を説明する。\
Chrome の指定方法は [tools/README.md](../tools/README.md) を参照。

## 概要

テストは、テスト用のプロジェクト（`fixture/`）を、組み込み先と同じ手順で処理して結果を確認する。\
テスト用のプロジェクトは、THREE Stage が扱う要素をすべて含む。\
処理の手順は、Publish、パッケージの作成、バンドルの読み込みである。

## 実行方法

リポジトリのルートで、次のコマンドを実行する。

```powershell
npm test
```

Chrome が必要である。\
テストはネットワークに接続しない。

| 環境変数 | 説明 |
|---|---|
| `CHROME_PATH` | Chrome の実行ファイルのパス。既定のパスにない場合に指定する |
| `TEST_GPU=1` | GPU で描画する。指定しない場合は SwiftShader（CPU による描画）を使用する |
| `KEEP=1` | 作業用のフォルダを削除せずに残す |

作業用のフォルダは、OS の一時フォルダに複製した `fixture/` である。

## 確認項目

| グループ | 対象 |
|---|---|
| `types` | 型の検査 |
| `Publish` | バンドルの書き出し |
| `build` | パッケージの作成 |
| `main`、`alt1`〜`alt3`、`content` | 組み込み先と同じ描画での表示 |

### `types`

`three-stage typecheck` が成功することを確認する。

### `Publish`

次の項目を確認する。

- 4 つのシーンを書き出せること
- パラメーターの既定値が参照するファイルが、バンドルに含まれること
- フォント、EXR、HDR、KTX2、圧縮した glTF が、バンドルに含まれること
- デコーダー（Draco、Basis）が、バンドルに含まれること
- Event の一覧が、バンドルに含まれること
- アセットが不足している場合に、Publish が中断されること

### `build`

パッケージ（tgz）について、次の項目を確認する。

- エントリー、型定義、README が含まれること
- エントリーから参照されない型定義が含まれないこと
- `'use client'` が保持されること
- ファイルパスを含むコメントが残らないこと

### `main`、`alt1`〜`alt3`、`content`

エディタのサーバーを起動し、ヘッドレス Chrome で `preview.html?bundle=` を開く。\
three.js のシーンと 2D UI の状態を読み取り、次の項目を確認する。

- テクスチャ、マテリアル、圧縮した glTF
- オブジェクトの位置の上書き
- コンポーネントのパラメーター
- リフレクションプローブ
- アニメーション Clip
- List Change と独自の Trigger による Event の再生
- `fire` による Event の再生
- Event 内の Animation Track
- データで非表示にしたオブジェクトが、Event の開始時に表示されないこと
- 警告とエラーが表示されないこと

| グループ | シーン |
|---|---|
| `main` | すべての要素を含むシーン |
| `alt1`〜`alt3` | 環境光の設定を変更したシーン |
| `content` | `main` を、バンドルを経由せずに `content/` から直接読み込んだもの |

### 対象外

組み込み先の Web アプリケーション（Next.js など）での動作確認は含まない。\
パッケージを npm からインストールする必要があり、ネットワーク接続が必要になるためである。

## テスト用のプロジェクト

| パス | 内容 |
|---|---|
| `fixture/content/scenes/main.stage.json` | すべての要素を含むシーン |
| `fixture/content/scenes/alt1〜3.stage.json` | `main` の環境光の設定を変更したシーン |
| `fixture/src/` | すべての種類の登録 |

`main.stage.json` は、次の要素を含む。

- HDRI B と Blend
- リフレクションプローブ
- 5 種類のライト
- マテリアル。MeshStandardMaterial のすべてのテクスチャ、MeshPhysicalMaterial、KTX2、2 つの記述方法による独自シェーダー
- ポストプロセス。組み込みの 4 種類と、2 つの記述方法による独自エフェクト
- 2 種類のコンポーネント
- Empty
- 4 台のカメラ。Drift と独自の Motion を使用する
- Activation Track と Animation Track
- 3 つの Event

`alt1`〜`alt3` の環境光の設定は、次のとおりである。

| シーン | 背景 | 環境光 |
|---|---|---|
| `alt1` | 背景色 | Room Environment |
| `alt2` | なし | HDR |
| `alt3` | 既定値 | なし |

`fixture/src/` は、コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動き、2D UI、モックデータを登録する。\
テストが読み取る値は、`window.__probe` に出力する。

アセットは、`node packages/studio/test/make-fixture-assets.mjs` で再生成する。\
スクリプトで生成していないファイルは、スクリプトの先頭に記載している。
