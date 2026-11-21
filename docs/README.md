# THREE Stage ドキュメント

THREE Stage は、Web サイトや Web アプリケーションに組み込む 3D シーンを、three.js で作成するデスクトップアプリケーションである。
このフォルダには、利用者向けの文書を置く。

| 文書 | 対象の読者 | 内容 |
|---|---|---|
| [getting-started.md](getting-started.md) | 初めて使う人 | 動作環境、インストール、プロジェクトの作成と構成、基本の作業の流れ、コマンド |
| [studio.md](studio.md) | エディタを操作する人 | 画面の構成、Scene と Timeline、各パネルの操作、ショートカット |
| [scripting.md](scripting.md) | プロジェクトのコードを書く人 | コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動き、2D UI、モックデータ、ランタイムの API |
| [scene-format.md](scene-format.md) | シーンのファイルを扱う人、Web アプリケーションに組み込む人 | シーン定義の形式、Publish の出力、パッケージ、組み込みの手順 |
| [performance.md](performance.md) | 性能を調整する人 | 性能の目標と上限、計測の方法、最適化の手法 |

計測用のコマンド（`three-stage shot`、`measure`、`soak`）の詳細は [packages/studio/tools/README.md](../packages/studio/tools/README.md) にある。
インストールしたアプリケーションでは、同じ文書が `<インストール先>\resources\studio\tools\README.md` にある。
