# Sample

THREE Stage のサンプルプロジェクト。
床の上に箱、円柱、円錐を置き、色違いのボールを跳ね回らせる。
モックデータの値 `level`（0〜100）に応じて、ボールの速さ、床のグリッドの色、一部の図形の色、空の色、画面の色味が変わる。

| 要素 | ファイルと設定 |
|---|---|
| 床と図形 | `content/glb/blocks.glb`。床（Floor）と、図形をまとめた Blocks を含む |
| ボール | 形は `content/glb/ball.glb`。動きは `src/components/Balls.tsx`（Hierarchy の Components の Balls）。コンポーネントの書き方のサンプル。Count で数、Area で動く範囲、Bounce Height で跳ねる高さ、Speed Scale で速さの倍率を変える |
| 図形の色 | `src/components/Accent.tsx`（Hierarchy の Components の Accent）。glb の中のオブジェクトをコードで変えるサンプル。Blocks の中で `Accent` マテリアルを使う図形の色を、`level` に応じて Low Color から High Color に変える |
| 床のグリッド | `src/shaders/Grid.ts`。シェーダーのサンプル。MeshStandardMaterial を拡張し、ライトと影を受けたままグリッドの線を描く。線の色は `level` に応じて変わり、値が高いときは波紋が広がる。Assets の Materials の Grid を、Floor のマテリアルスロット Floor に割り当てている |
| 空 | 寒色の `content/hdr/sky-cool.hdr` と、ライトの位置が同じ暖色の `content/hdr/sky-warm.hdr`。Environment の HDRI と HDRI B に設定し、`src/components/SkyBlend.tsx`（Hierarchy の Components の Sky Blend）が `level` に応じて混ぜる。Edit では Environment の Blend の値で表示する |
| 画面の色味 | `src/effects/Tint.ts`（Environment の Post Processing の Tint）。ポストエフェクトのサンプル。`level` が高いほど画面を暖色に寄せる |
| ポストプロセス | ほかに Vignette と FXAA を設定している |
| データ | `src/mock/index.ts` のモックデータ。1日のうち、夜は低く、10時と15時ごろに高くなる。Data タブで時刻と速さを変えられる |
| 左下のカード | `src/Overlay.tsx` の 2D UI の summary。Timeline の Activation Track で表示する区間を決めている |
| 上部の通知 | `src/Overlay.tsx` の 2D UI の notice。Event Timeline（notice）だけが表示する。Trigger は None で、データでは再生されない。組み込み先のコードが `SampleStage` の ref から `fire('notice')` で再生する（`src/SampleStage.tsx`）。スタジオでは、Timeline で notice を選び、Inspector の Play で再生する |
| カメラ | Timeline の Camera Track。overview（全体）から low（低い視点）に切り替わり、最初に戻る |
| 配置とパラメーター | `content/scenes/main.stage.json`。スタジオで Save すると更新される |

コードはプロジェクトの `src/` に書き、配置とパラメーターはスタジオで決める。
glb と HDR は、スクリプトで three.js のプリミティブから生成したもの。自分のモデルに置き換えてよい。
