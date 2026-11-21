# Sample

このドキュメントでは、THREE Stage のサンプルプロジェクトの構成を説明する。

## 概要

床の上に箱、円柱、円錐を配置し、色の異なるボールを跳ね回らせるシーンである。\
モックデータの値 `level`（0〜100）に応じて、次の要素が変化する。

- ボールの速度
- 床のグリッドの色
- 一部の図形の色
- 空の色
- 画面の色味

コードはプロジェクトの `src/` に記述し、配置とパラメーターはエディタで設定する。\
配置とパラメーターは `content/scenes/main.stage.json` に保存される。\
エディタで Save をクリックすると、このファイルが更新される。

## 要素の一覧

| 要素 | ファイル | サンプルの対象 |
|---|---|---|
| 床と図形 | `content/glb/blocks.glb` | モデル |
| ボール | `content/glb/ball.glb`、`src/components/Balls.tsx` | コンポーネント |
| 図形の色 | `src/components/Accent.tsx` | モデル内のオブジェクトの変更 |
| 床のグリッド | `src/shaders/Grid.ts` | シェーダー |
| 空 | `content/hdr/sky-cool.hdr`、`content/hdr/sky-warm.hdr`、`src/components/SkyBlend.tsx` | HDRI の切り替え |
| 画面の色味 | `src/effects/Tint.ts` | ポストエフェクト |
| データ | `src/mock/index.ts` | モックデータ |
| 左下のカード | `src/Overlay.tsx` | 2D UI と Activation Track |
| 上部の通知 | `src/Overlay.tsx`、`src/SampleStage.tsx` | Event Timeline |
| カメラ | `content/scenes/main.stage.json` | Camera Track |

## 床と図形

`content/glb/blocks.glb` は、床の Floor と、図形をまとめた Blocks を含む。

## ボール

ボールの形状は `content/glb/ball.glb`、動きは `src/components/Balls.tsx` で定義する。\
コンポーネントの作成方法のサンプルである。\
Hierarchy の Components にある Balls で、次のパラメーターを設定できる。

| パラメーター | 説明 |
|---|---|
| Count | ボールの数 |
| Area | 動く範囲 |
| Bounce Height | 跳ねる高さ |
| Speed Scale | 速度の倍率 |

## 図形の色

`src/components/Accent.tsx` は、glb 内のオブジェクトをコードで変更するサンプルである。\
Hierarchy の Components にある Accent に対応する。\
Blocks のうち `Accent` マテリアルを使用する図形の色を、`level` に応じて Low Color から High Color に変化させる。

## 床のグリッド

`src/shaders/Grid.ts` は、シェーダーのサンプルである。\
MeshStandardMaterial を拡張し、ライトと影の効果を保ったままグリッドの線を描画する。\
線の色は `level` に応じて変化し、値が高いときは波紋が広がる。\
Assets の Materials にある Grid を、Floor のマテリアルスロット Floor に割り当てている。

## 空

空には、寒色の `content/hdr/sky-cool.hdr` と、暖色の `content/hdr/sky-warm.hdr` を使用する。\
2 つの HDRI は、ライトの位置が同じである。\
Environment の HDRI と HDRI B にそれぞれ設定している。\
`src/components/SkyBlend.tsx` が、`level` に応じて 2 つを混合する。\
Hierarchy の Components にある Sky Blend に対応する。\
Edit では、Environment の Blend の値で表示する。

## 画面の色味とポストプロセス

`src/effects/Tint.ts` は、ポストエフェクトのサンプルである。\
Environment の Post Processing にある Tint に対応する。\
`level` が高いほど、画面の色味を暖色に寄せる。\
ほかに、Vignette と FXAA を設定している。

## データ

`src/mock/index.ts` は、モックデータを定義する。\
`level` は、夜は低く、10 時と 15 時ごろに高くなる。\
Data タブで、時刻と進行速度を変更できる。

## 2D UI

| パーツ | 表示位置 | 表示の制御 |
|---|---|---|
| summary | 左下 | メインの Timeline の Activation Track |
| notice | 上部 | Event Timeline の notice |

どちらも `src/Overlay.tsx` で定義する。

notice の Event Timeline は、Trigger が None のため、データの変化では再生されない。\
組み込み先のコードが、`SampleStage` の ref の `fire('notice')` を呼び出して再生する。\
`fire` は `src/SampleStage.tsx` で定義している。\
エディタで再生する場合は、Timeline で notice を選択し、Inspector の Play をクリックする。

## カメラ

メインの Timeline の Camera Track で、overview（全体）から low（低い視点）に切り替わり、最初のカメラに戻る。

## アセット

glb と HDR は、スクリプトで three.js のプリミティブから生成したものである。\
独自のモデルに置き換えてよい。
