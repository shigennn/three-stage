# はじめに

このドキュメントでは、THREE Stage のインストール、プロジェクトの作成と構成、基本的な作業の流れ、コマンドを説明する。\
シーン定義の形式は [scene-format.md](scene-format.md)、エディタの操作は [studio.md](studio.md) を参照。

## 概要

THREE Stage は、Web アプリケーションに組み込む 3D シーンを three.js で作成するデスクトップアプリケーションである。\
glTF（`.glb`）のモデルを配置し、マテリアル、ライト、カメラ、エフェクトを設定し、Web アプリケーションから渡すデータをシーンに結び付ける。\
完成したシーンは、Publish でシーンのバンドルとして、`three-stage build` で React コンポーネントのパッケージとして書き出し、Web アプリケーションに組み込む。

以下、シーンを組み込む Web アプリケーションを「組み込み先」と呼ぶ。\
エディタは、組み込み先と同じランタイム（`@three-stage/runtime`）と React Three Fiber で描画する。\
そのため、エディタで確認した描画は、組み込み先での描画と一致する。

### アプリケーションとプロジェクト

THREE Stage は、Unity と同様に、アプリケーションとプロジェクトを分けて扱う。\
アプリケーションは PC に 1 回インストールする。\
プロジェクトは任意のフォルダに作成し、アプリケーションで開く。

| Unity | THREE Stage |
|---|---|
| Unity Editor のインストール | `THREE-Stage-Setup-<バージョン>.exe` によるインストール |
| New Project | 最初の画面の New Project、または `three-stage new` |
| プロジェクトを開く | 最初の画面の Open… または Recent Projects、または `three-stage <フォルダ>` |
| UnityEngine の DLL | アプリケーションに含まれるランタイム、React、three.js |
| `ProjectVersion.txt` | `three-stage.json` の `tool` |
| PC ごとに生成される `.csproj` | `.three-stage/` |
| Build | `three-stage publish` と `three-stage build` |

プロジェクトは `node_modules` を持たない。\
`three-stage.json` の `tool` には、プロジェクトを作成したアプリケーションのバージョンが記録される。\
`.three-stage/` には、プロジェクトを開いたときに、型チェックの設定と Vite のキャッシュが生成される。\
`.three-stage/` は git で管理しない。

## 動作環境

| 項目 | 要件 |
|---|---|
| OS | Windows 11 |
| ネットワーク接続 | 不要 |
| Chrome | `three-stage shot`、`measure`、`soak` を実行する場合に必要 |
| git | 任意 |
| Node.js 22 以降と npm | インストーラーを作成する場合に必要 |

エディタはアプリケーションのウィンドウに表示されるため、ブラウザは不要である。\
three.js などのライブラリはアプリケーションに含まれ、CDN から読み込まない。\
プロジェクトが git リポジトリ内にある場合は、エディタの Toolbar に現在のブランチが表示される。

### 使用する技術

シーンとプロジェクトのコードは、次の技術で動作する。

| 項目 | 技術 |
|---|---|
| 言語 | TypeScript |
| UI | React 19 |
| 3D | React Three Fiber v9、drei、three.js |
| 描画 | WebGL2（three.js の WebGLRenderer） |
| シェーダー | GLSL |
| モデル | glTF 2.0（`.glb`） |

モデルには、Blender などの DCC ツールで書き出した `.glb` を使用する。

## インストール

インストーラーは、THREE Stage のリポジトリから作成する。\
リポジトリのフォルダで、次のコマンドを実行する。

```powershell
npm install
npm run release
```

`dist/release/dist/` に `THREE-Stage-Setup-<バージョン>.exe` が生成される。\
このファイルを実行すると、THREE Stage がインストールされる。\
新しいバージョンのインストーラーを実行すると、インストール済みの THREE Stage が上書きで更新される。

アプリケーションを一度起動すると、コマンドプロンプトと PowerShell の任意のフォルダで `three-stage` コマンドを実行できる。\
コマンドの実体は `<インストール先>\resources\bin\three-stage.cmd` である。\
このファイルは `%LOCALAPPDATA%\Microsoft\WindowsApps\three-stage.cmd` から呼び出される。

## プロジェクトの作成

アプリケーションを起動すると、最初の画面が表示される。\
New Project で Template、Name、Location を指定し、Create をクリックすると、プロジェクトが作成されてエディタで開く。

| Template | 内容 |
|---|---|
| Empty | Sun と Camera のみを持つ空のシーン |
| Sample | 各機能の使用例を含むサンプル |

Empty の `src/` には、登録のエントリーポイントのみが含まれる。\
Sample には、コンポーネント、シェーダー、ポストエフェクト、2D UI、Event、モックデータの使用例が含まれる。\
Sample の内容は、作成したプロジェクトの `README.md` に記載されている。

コマンドで作成する場合は、次のように実行する。

```powershell
three-stage new <フォルダ> --template sample
```

### プロジェクトを開く

最初の画面の Open… または Recent Projects で、プロジェクトのフォルダを開く。\
`three-stage <フォルダ>` でも開くことができる。

プロジェクトを開くと、THREE Stage はプロジェクト用の開発サーバー（Vite）を起動し、同じウィンドウにエディタを表示する。\
ウィンドウを閉じると、開発サーバーも停止する。

### 保存と取り消し

シーンは、Save（Ctrl＋S）を実行したときにのみ保存される。\
自動保存は行わない。\
未保存の変更がある状態でウィンドウを閉じると、確認のダイアログが表示される。

変更は Ctrl＋Z で取り消すことができる。\
取り消せるのは、エディタを開いている間の直近 200 回までである。

## プロジェクトの構成

```
<プロジェクト>/
  three-stage.json   プロジェクトの設定
  tsconfig.json      コードエディタの補完の設定
  .gitignore
  src/
    stage.ts         エディタのエントリーポイント
    register.ts      コンポーネントなどの登録
    index.ts         パッケージのエントリーポイント
    mock/            モックデータ（Sample のみ）
    components/      コンポーネント（Sample のみ）
  content/
    scenes/          シーン定義（*.stage.json）
    glb/             モデル（.glb）
    textures/        テクスチャ
    hdr/             HDRI（.hdr、.exr）
  .three-stage/      アプリケーションが生成する設定とキャッシュ
  dist/              Publish とパッケージの出力先
```

| ファイル | 役割 |
|---|---|
| `three-stage.json` | プロジェクト名、バージョン、説明、作成したアプリケーションのバージョン |
| `tsconfig.json` | `.three-stage/tsconfig.json` の継承 |
| `.gitignore` | `.three-stage/` と `dist/` の除外 |
| `src/stage.ts` | モックデータの登録と、`register.ts` の読み込み |
| `src/register.ts` | コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動き、2D UI の登録 |
| `src/index.ts` | 組み込み先に渡す React コンポーネントのエクスポート |

`src/stage.ts` はエディタのみが読み込み、パッケージには含まれない。\
`src/register.ts` はパッケージにも含まれる。\
Empty には `mock/` と `components/` が含まれないため、必要になった時点で作成する。\
`three-stage.json` の項目は [scene-format.md](scene-format.md) を参照。

### git での管理

git で管理するのは、`.three-stage/` と `dist/` 以外のすべてのファイルである。\
そのため、どの PC のどのフォルダに clone しても、そのまま開くことができる。

### インポートできるモジュール

`src/` のコードからインポートできるのは、次のモジュールとプロジェクト内のファイルである。

- `@three-stage/runtime`
- `react`
- `react-dom`
- `three`
- `@react-three/fiber`
- `@react-three/drei`

これらのモジュールはアプリケーションに含まれるものを使用するため、プロジェクトで `npm install` を実行する必要はない。

## 基本的な作業の流れ

1. DCC ツールでモデルを作成し、glTF 2.0 の `.glb` として `content/glb/` に書き出す。\
   エクスプローラーからエディタの Assets にドラッグした場合も、`content/glb/` にコピーされる。\
   ファイルが変更されると、エディタは自動で再読み込みする。
2. Assets の `.glb` を Hierarchy にドラッグすると、書き出したときの配置のままシーンに追加される。\
   Viewport にドラッグすると、ドロップした位置に 1 つのモデルとして配置される。
3. Edit モードで、カメラの視点から確認しながらオブジェクトの位置を調整する。\
   マテリアル、ライト、環境光、ポストプロセスを設定する。
4. コンポーネントを追加し、パラメーターとデータの対応（Binding）を設定する。\
   必要なコンポーネント、シェーダー、ポストエフェクトは、プロジェクトの `src/` に追加する（[scripting.md](scripting.md)）。
5. Timeline で、カメラの順序、長さ、ブレンドと、2D UI とオブジェクトを表示する区間を設定する。\
   データの変化や組み込み先からの呼び出しで 1 回だけ再生する演出は、Event Timeline で作成する。
6. Play モードで、モックデータを流しながら、組み込み先と同じ描画と動作を確認する。
7. シーンを保存し、git でコミットする。
8. Publish でシーンのバンドルを書き出し、`three-stage build` でパッケージを生成する。
9. 組み込み先にパッケージを追加し、バンドルを配信して、React コンポーネントを表示する。\
   手順は [scene-format.md](scene-format.md) の「Web アプリケーションへの組み込み」を参照。

画面と操作の詳細は [studio.md](studio.md) を参照。

### エディタを使用しない場合

シーン定義とコードは、テキストエディタで直接編集することもできる。\
その場合は、`three-stage <フォルダ> --no-open` でエディタのサーバーのみを起動する。\
描画は、`three-stage shot` と `three-stage measure` で確認する。

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `three-stage` | 最初の画面を開く |
| `three-stage <フォルダ>` | プロジェクトを開く |
| `three-stage <フォルダ> --no-open` | ウィンドウを開かずに、エディタのサーバーのみを起動する |
| `three-stage new <フォルダ>` | テンプレートからプロジェクトを作成する |
| `three-stage publish <フォルダ>` | シーンのバンドルを書き出す |
| `three-stage build <フォルダ>` | 組み込み先に追加するパッケージを生成する |
| `three-stage typecheck <フォルダ>` | `src/` の型をチェックする |
| `three-stage shot` | スクリーンショットを撮影し、2D UI を検査する |
| `three-stage measure` | 描画の性能を計測する |
| `three-stage soak` | 長時間動作させ、メモリの増加を検査する |

`three-stage` をプロジェクトのフォルダで実行すると、そのプロジェクトを開く。\
`new` 以外のコマンドで `<フォルダ>` を省略すると、コマンドを実行したフォルダが対象になる。

### オプション

| オプション | 対象 | 既定値 | 説明 |
|---|---|---|---|
| `--port <番号>` | `--no-open` | `5180` | サーバーのポート番号 |
| `--name <名前>` | `new` | フォルダ名 | プロジェクト名 |
| `--template <種類>` | `new` | `empty` | テンプレート。`empty` または `sample` |
| `--scene <パス>` | `publish` | `scenes/main.stage.json` | 書き出すシーン定義。`content/` からの相対パス |
| `--out <フォルダ>` | `publish` | `dist/bundle` | 出力先 |

### 補足

`--no-open` で起動したサーバーでは、次のページを開くことができる。\
停止するには Ctrl＋C を入力する。

| URL | ページ |
|---|---|
| `http://127.0.0.1:5180/` | エディタ |
| `http://127.0.0.1:5180/preview.html` | 組み込み先と同じ描画のみを表示するページ |

`new` は、空でないフォルダにはプロジェクトを作成しない。\
`build` は、パッケージを `dist/package/` と tgz ファイルに書き出す。\
`shot`、`measure`、`soak` の概要は [performance.md](performance.md) を参照。\
これらの引数は `<インストール先>\resources\studio\tools\README.md` に記載されている。
