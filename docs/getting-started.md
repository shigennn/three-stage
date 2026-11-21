# はじめに

THREE Stage のインストール、プロジェクトの作成と構成、基本の作業の流れ、コマンドを説明する。
初めて THREE Stage を使う人に向けた文書である。

## 概要

THREE Stage は、Web サイトや Web アプリケーションに組み込む 3D シーンを、three.js で作成するデスクトップアプリケーションである。
glTF（`.glb`）のモデルを配置し、マテリアル、ライト、カメラ、エフェクトを設定し、Web アプリケーションから渡すデータとシーンを結び付ける。
完成したシーンは、Publish（シーンのバンドル）と `three-stage build`（React コンポーネントのパッケージ）で書き出し、任意の Web アプリケーションに組み込む。

エディタ（スタジオ）は、書き出したコンポーネントと同じランタイム（`@three-stage/runtime`、React Three Fiber）で描画する。
そのため、スタジオで見た描画と、組み込み先の Web アプリケーション（以降「組み込み先」）で表示される描画は一致する。

THREE Stage は、Unity と同じく、アプリケーションとプロジェクトを分けて扱う。
アプリケーションは PC に1回インストールし、プロジェクトは任意のフォルダに作ってアプリケーションで開く。

| Unity | THREE Stage |
|---|---|
| Unity のエディタをインストールする | `THREE-Stage-Setup-<バージョン>.exe` で THREE Stage をインストールする |
| New Project | 最初の画面の New Project か `three-stage new <folder>` |
| プロジェクトを開く | 最初の画面の Open… か Recent Projects、または `three-stage <folder>` |
| UnityEngine の DLL | ランタイム、React、three.js はアプリケーションに含まれる。プロジェクトは `node_modules` を含まない |
| `ProjectVersion.txt` | `three-stage.json` の `tool`（プロジェクトを作成したアプリケーションのバージョン） |
| PC ごとに生成される `.csproj` | プロジェクトを開いたときに `.three-stage/` に生成される型チェックの設定と Vite のキャッシュ。git で管理しない |
| Build | `three-stage publish`（シーンのバンドル）と `three-stage build`（組み込み先に追加するパッケージ） |

## 動作環境

| 項目 | 内容 |
|---|---|
| OS | Windows 11 |
| アプリケーション | THREE Stage（Electron）。スタジオの画面はアプリケーションのウィンドウに表示するので、ブラウザは不要 |
| ネットワーク | 不要。three.js などはアプリケーションに含まれ、CDN から読まない |
| Chrome | `three-stage shot`、`three-stage measure`、`three-stage soak` を使うときに必要 |
| git | 任意。プロジェクトが git のリポジトリの中にあれば、スタジオの Toolbar に現在のブランチを表示する |
| インストーラーの作成 | Node.js 22 以降と npm（下の「インストール」） |

シーンとプロジェクトのコードは、次の技術で動く。

| 項目 | 内容 |
|---|---|
| 言語 | TypeScript |
| UI | React 19 |
| 3D | React Three Fiber v9、drei、three.js の WebGLRenderer（WebGL2） |
| シェーダー | GLSL |
| モデル | glTF 2.0（`.glb`）。Blender などの DCC ツールで書き出したものを使う |

## インストール

インストーラーは、THREE Stage のリポジトリから作成する。
リポジトリのフォルダで、次を実行する。

```powershell
npm install
npm run release
```

`dist/release/dist/` に `THREE-Stage-Setup-<バージョン>.exe` ができる。
これを実行して、THREE Stage をインストールする。
新しいバージョンのインストーラーを実行すると、インストール済みの THREE Stage を上書きして更新する。

アプリケーションを一度起動すると、`three-stage` コマンドを、コマンドプロンプトや PowerShell のどのフォルダからでも実行できるようになる。
コマンドの実体は `<インストール先>\resources\bin\three-stage.cmd` で、`%LOCALAPPDATA%\Microsoft\WindowsApps\three-stage.cmd` から呼ばれる。

## プロジェクトの作成

アプリケーションを起動すると、最初の画面が表示される。
New Project で Template、Name、Location を指定して Create を押すと、プロジェクトが作成され、そのままスタジオで開く。

| Template | 内容 |
|---|---|
| Empty | 空の Scene（Sun と Camera だけ）。`src/` は登録の入口だけを含む |
| Sample | コンポーネント、シェーダー、ポストエフェクト、2D UI、Event、モックデータの使用例を含むサンプル。内容は、作成したプロジェクトの `README.md` にある |

コマンドでは、次のように作成する。

```powershell
three-stage new <folder> --template sample
```

### プロジェクトを開く

最初の画面の Open… か Recent Projects で、プロジェクトのフォルダを開く。
`three-stage <folder>` でも開ける。

プロジェクトを開くと、THREE Stage はそのプロジェクト用の開発サーバー（Vite）を起動し、同じウィンドウにスタジオを表示する。
ウィンドウを閉じると、開発サーバーも停止する。

シーンは、Save（Ctrl＋S）を押したときだけ保存する。自動では保存しない。
保存していない変更があるままウィンドウを閉じようとすると、確認のダイアログを表示する。
変更は Ctrl＋Z で元に戻せる（スタジオを開いている間、200 回まで）。

## プロジェクトの構成

```
<プロジェクト>/
  three-stage.json   名前、バージョン、説明、作成したアプリケーションのバージョン
  tsconfig.json      .three-stage/tsconfig.json を継承するだけ。エディタの補完に使う
  .gitignore         .three-stage/ と dist/
  src/
    stage.ts         スタジオが読む入口。モックデータを登録し、register.ts を読み込む
    register.ts      コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動き、2D UI の登録。パッケージにも含まれる
    index.ts         パッケージの入口。組み込み先に渡す React コンポーネントを export する
    mock/            モックデータ（Sample にある。Empty では必要になったら作る）
    components/      コンポーネント（同上）
  content/
    scenes/          シーン定義（*.stage.json）
    glb/             モデル（.glb）
    textures/        テクスチャ
    hdr/             HDRI（.hdr、.exr）
  .three-stage/      アプリケーションが PC ごとに生成する。git で管理しない
  dist/              Publish とパッケージの出力。git で管理しない
```

git で管理するのは、`.three-stage/` と `dist/` 以外のすべてである。
どの PC でも、どこに clone しても、そのまま開ける。

`src/` から import できるのは、`@three-stage/runtime`、`react`、`react-dom`、`three`、`@react-three/fiber`、`@react-three/drei` と、プロジェクトの中のファイルである。
どれもアプリケーションに含まれるものを使うので、プロジェクトで `npm install` する必要はない。

ファイルの形式とシーン定義の項目は [scene-format.md](scene-format.md) にある。

## 基本の作業の流れ

1. DCC ツールでモデルを作り、glTF 2.0 の `.glb` で `content/glb/` に書き出す。エクスプローラーからスタジオの Assets にドラッグしても、`content/glb/` にコピーされる。ファイルが変わると、スタジオは自動で読み直す。
2. Assets の `.glb` を Hierarchy にドラッグしてそのままの配置で読み込むか、Viewport にドラッグして配置する。
3. Edit で、カメラから見ながらオブジェクトの位置を調整し、マテリアル、ライト、環境光、ポストプロセスを設定する。
4. コンポーネントを追加し、パラメーターとデータとの結び付け（Binding）を設定する。必要なコンポーネント、シェーダー、ポストエフェクトは、プロジェクトの `src/` に書き足す（[scripting.md](scripting.md)）。
5. Timeline で、カメラの並びと長さとブレンド、2D UI とオブジェクトを表示する区間を設定する。データの変化や組み込み先からの呼び出しで1回だけ再生する演出は、Event の Timeline で作る。
6. Play で、モックデータを流しながら、組み込み先と同じ描画と動きで確認する。
7. 保存し、git で管理する。
8. Publish でシーンのバンドルを書き出し、`three-stage build` でパッケージを作る。
9. 組み込み先にパッケージを追加し、バンドルを配信して、React コンポーネントを表示する（[scene-format.md](scene-format.md) の「Web アプリケーションへの組み込み」）。

画面と操作の詳細は [studio.md](studio.md) にある。

シーン定義とコードは、スタジオを使わずにテキストエディタで直接書いてもよい。
その場合は、`three-stage <folder> --no-open` でスタジオのサーバーだけを起動し、`three-stage shot` と `three-stage measure` で描画を確認する。

## コマンド一覧

| コマンド | 内容 |
|---|---|
| `three-stage` | 最初の画面を開く。実行したフォルダがプロジェクトなら、そのプロジェクトを開く |
| `three-stage <folder>` | プロジェクトをアプリケーションで開く |
| `three-stage [folder] --no-open [--port 5180]` | ウィンドウを開かずに、スタジオのサーバーだけを起動する。`http://127.0.0.1:5180/` がスタジオ、`http://127.0.0.1:5180/preview.html` が組み込み先と同じ描画だけを表示するページである。Ctrl＋C で停止する |
| `three-stage new <folder> [--name name] [--template empty\|sample]` | テンプレートから新しいプロジェクトを作る。既定のテンプレートは `empty`。空でないフォルダには作らない |
| `three-stage publish [folder] [--scene scenes/main.stage.json] [--out dist/bundle]` | シーンのバンドルを書き出す。`--scene` は `content/` からの相対パスで、既定は `scenes/main.stage.json`。既定の出力先は `dist/bundle/` |
| `three-stage build [folder]` | 組み込み先に追加するパッケージを `dist/package/` と tgz に書き出す |
| `three-stage typecheck [folder]` | `src/` の型をチェックする |
| `three-stage shot` / `measure` / `soak` | スクリーンショットの撮影と 2D UI の検査、性能の計測、メモリの長時間の検査。概要は [performance.md](performance.md)、引数は `<インストール先>\resources\studio\tools\README.md` にある |

`[folder]` を省くと、コマンドを実行したフォルダを使う。
