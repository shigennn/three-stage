# シーンの形式と組み込み

プロジェクトのファイル構成、シーン定義（`*.stage.json`）の形式、Publish とパッケージの出力、Web アプリケーションへの組み込み方を説明する。
シーンのファイルを直接読み書きする人と、書き出したシーンを Web アプリケーションに組み込む人に向けた文書である。

## 概要

THREE Stage で作ったシーンは、次の2つに分けて Web アプリケーションに渡す。

| 渡すもの | 作り方 | 内容 |
|---|---|---|
| シーンのバンドル | スタジオの Publish か `three-stage publish` | シーン定義と、シーンが使うモデル、テクスチャ、HDRI、フォント。静的ファイルとして配信する |
| パッケージ | `three-stage build` | プロジェクトのコード（コンポーネント、シェーダー、ポストエフェクト、2D UI）とランタイムをまとめた React コンポーネント。npm のパッケージ（tgz）として追加する |

以降、シーンを組み込む Web アプリケーションを「組み込み先」と呼ぶ。
組み込み先はパッケージの React コンポーネントを表示し、その props にバンドルの `manifest.json` の URL とデータを渡す。
シーンだけを変えたときは、バンドルを差し替えれば組み込み先のコードを変えずに済む。

## プロジェクトのファイルとフォルダ

| 対象 | 形式 | 置き場所 |
|---|---|---|
| プロジェクトの設定 | `three-stage.json` | `<プロジェクト>/` |
| シーン定義 | `*.stage.json` | `content/scenes/` |
| モデル | `.glb`（glTF 2.0） | `content/glb/` |
| テクスチャ | `.png`、`.jpg`、`.jpeg`、`.webp`、`.ktx2` | `content/textures/` |
| 空と環境光（HDRI） | `.hdr`、`.exr` | `content/hdr/` |
| 2D UI のフォント | フォントのファイル | `content/fonts/`（使うときだけ作る） |
| プロジェクトのコード | TypeScript（`.ts`、`.tsx`） | `src/` |
| Publish の出力 | `manifest.json` と、名前に内容のハッシュを付けたファイル | `dist/bundle/` |
| パッケージの出力 | `package/` と tgz | `dist/` |

`three-stage.json` の項目は次のとおり。

| 項目 | 内容 |
|---|---|
| `name` | プロジェクトの名前。パッケージの名前にもなる（npm のパッケージ名の規則に従う） |
| `version` | プロジェクトのバージョン。パッケージのバージョンにもなる |
| `description` | 説明。パッケージの `package.json` と README に書かれる |
| `tool` | プロジェクトを作成した THREE Stage のバージョン |

シーン定義の中でファイルを指すときは、`content/` からの相対パスで書く（`glb/blocks.glb`、`hdr/sky-cool.hdr` など）。
`dist/` と `.three-stage/` は PC ごとに作り直すので、git で管理しない。

## シーン定義（`*.stage.json`）

シーン定義は1つの JSON ファイルで、1つのシーンの内容をすべて含む。
スタジオで操作しても、テキストエディタで直接書いても、同じファイルが変わる。

| 規則 | 内容 |
|---|---|
| 単位 | 長さは m |
| 座標系 | Y が上（glTF と同じ） |
| 回転 | 度。`[x, y, z]` を XYZ の順に適用する |
| 色 | `#RRGGBB` の文字列 |
| 時間 | 秒 |
| ベクトル | `[x, y, z]` の配列 |

スタジオは、項目の順番を固定し、2つの空白で字下げし、数値を小数点以下4桁に丸めて保存する。
保存のたびに書き方が変わらないので、git の diff で変更点を読める。

項目が欠けていれば、ランタイムが既定値で補って読む。
古い形式のファイルは、読み込むときに現在の形式に変換する。
`schemaVersion` がランタイムより新しいファイルは読まず、エラーを出力する。

### 最上位の項目

| 項目 | 型 | 内容 |
|---|---|---|
| `schemaVersion` | 数値 | 形式のバージョン。現在は `2` |
| `name` | 文字列 | シーンの名前 |
| `assets` | 文字列の配列 | そのまま読み込む `.glb` のパス |
| `overrides` | オブジェクト | `assets` の `.glb` の中のオブジェクトへの変更。キーはオブジェクトの名前 |
| `placed` | 配列 | スタジオで配置した `.glb` のコピー |
| `materials` | オブジェクト | マテリアル。キーはマテリアルの id |
| `materialAssignments` | 配列 | `.glb` のマテリアルを `materials` のマテリアルに置き換える指定 |
| `lights` | 配列 | ライト |
| `environment` | オブジェクト | 背景、環境光、霧、トーンマッピング、影 |
| `postprocess` | 配列 | ポストプロセス |
| `components` | 配列 | コンポーネントのインスタンス |
| `empties` | 配列 | Empty |
| `cameras` | 配列 | Camera Track のカメラ。再生する順に並べる |
| `tracks` | 配列 | メインの Timeline の Activation Track |
| `animations` | 配列 | メインの Timeline の Animation Track |
| `timelines` | 配列 | Event の Timeline |
| `render` | オブジェクト | 描画の設定 |

`id` は、同じ配列（またはシーン）の中で重ならない文字列である。
`name` は画面に表示する名前である。

### `overrides`

`.glb` の中のオブジェクトを、名前で指定して変更する。
書いた項目だけが変わり、書いていない項目は `.glb` のままになる。

| 項目 | 内容 |
|---|---|
| `position` | 位置（m） |
| `rotation` | 回転（度） |
| `scale` | 軸ごとの拡大率 |
| `visible` | 表示するか |
| `castShadow`、`receiveShadow` | 影を落とすか、影を受けるか |
| `clip` | 繰り返し再生するアニメーションの Clip の名前 |
| `loop` | Clip をループするか |

DCC ツールでオブジェクトの名前を変えると、その名前の `overrides` は適用されなくなる。

### `placed`

| 項目 | 内容 |
|---|---|
| `id`、`name` | id と表示名 |
| `asset` | `.glb` のパス |
| `position`、`rotation`、`scale` | 位置、回転、拡大率 |
| `castShadow`、`receiveShadow` | 影を落とすか、影を受けるか |
| `clip`、`loop` | 繰り返し再生する Clip の名前と、ループするか |

### `materials`

マテリアルには、ランタイムに組み込まれた種類と、プロジェクトがシェーダーとして登録した種類がある。

組み込みの種類は `type` が `standard`（three.js の `MeshStandardMaterial`）か `physical`（`MeshPhysicalMaterial`）で、各項目は three.js の同じ名前のプロパティになる。

| 項目 | 内容 |
|---|---|
| `name` | 表示名 |
| `type` | `standard` か `physical` |
| `color`、`emissive` | 基本色と発光色 |
| `roughness`、`metalness` | 0〜1 |
| `emissiveIntensity` | 発光色の倍率 |
| `opacity`、`transparent` | 不透明度（0〜1）と、透明として描くか。`opacity` は `transparent` が `true` のときだけ効く |
| `envMapIntensity` | 環境光と映り込みの倍率 |
| `map`、`normalMap`、`roughnessMap`、`metalnessMap`、`aoMap`、`emissiveMap` | テクスチャのパス（省略可） |
| `clearcoat`、`clearcoatRoughness`、`transmission`、`thickness`、`ior`、`sheen`、`sheenColor` | `physical` だけ（省略可） |

登録したシェーダーの種類は、`type` に登録した名前を書く。

| 項目 | 内容 |
|---|---|
| `name` | 表示名 |
| `type` | `defineShader` で登録した種類の名前（`sample.grid` など） |
| `params` | シェーダーのパラメーターの値 |
| `binding` | uniform の名前から、データの中の場所（`items[3].value` など）への対応 |

シェーダーの書き方は [scripting.md](scripting.md) にある。

### `materialAssignments`

| 項目 | 内容 |
|---|---|
| `object` | オブジェクトの名前 |
| `slot` | `.glb` の中の元のマテリアルの名前（マテリアルスロット） |
| `material` | `materials` のキー |

### `lights`

| 項目 | 内容 |
|---|---|
| `id`、`name` | id と表示名 |
| `type` | `directional`、`point`、`spot`、`hemisphere`、`ambient`（three.js の同じ名前のライト） |
| `color`、`intensity` | 色と強さ |
| `position` | 位置 |
| `target` | 向ける点（`directional` と `spot`） |
| `targetObject` | 向けるオブジェクトの名前。あれば `target` より優先する |
| `groundColor` | 下からの色（`hemisphere` だけ） |
| `distance`、`decay` | 届く距離（m、0 は無制限）と減衰（`point` と `spot`） |
| `angle`、`penumbra` | 円錐の角度（度）と縁のぼかし 0〜1（`spot`） |
| `castShadow` | 影を落とすか |
| `shadow` | 影の設定（省略すると既定値）。`mapSize`（px）、`bias`、`normalBias`、`radius`、`cameraSize`（`directional` が影を描く範囲の幅の半分、m） |

### `environment`

| 項目 | 内容 |
|---|---|
| `background` | 背景。`type`（`none`、`color`、`environment`）、`color`、`blur`（`environment` のときのぼかし） |
| `source` | 環境光の元。`none`、`room`（three.js の `RoomEnvironment`）、`hdri` |
| `hdri` | HDRI のパス |
| `hdriB` | `hdri` と切り替える2枚目の HDRI のパス（色合いの違う空など） |
| `blend` | 0 で `hdri`、1 で `hdriB`。間の値は2枚を混ぜる |
| `intensity` | 環境光の倍率 |
| `rotation` | 環境光の Y 軸まわりの回転（度） |
| `reflection` | リフレクションプローブ。`enabled`、`position`（周りを撮る位置）、`resolution`（キューブの1面の幅。64、128、256 px のいずれか）。既定でオン |
| `fog` | 線形の霧。`enabled`、`color`、`near`、`far`（m） |
| `toneMapping` | `none`、`linear`、`reinhard`、`cineon`、`aces`、`agx`、`neutral` |
| `exposure` | 露出 |
| `shadows` | シーン全体の影。`enabled`、`type`（`pcf`、`vsm`、`basic`） |

### `postprocess`

| 項目 | 内容 |
|---|---|
| `id` | id |
| `type` | 組み込みの `bloom`、`vignette`、`fxaa`、`smaa` か、`definePostEffect` で登録した種類の名前 |
| `enabled` | かけるか |
| `params` | パラメーターの値。組み込みの種類は数値だけ |
| `binding` | 登録した種類だけ。uniform の名前から、データの中の場所への対応 |

かける順は、配列の順ではなく次の順に決まっている。
登録した種類どうしは、同じ `stage` の中で配列の順にかける。

1. `bloom`
2. 登録した種類のうち `stage` が `hdr` のもの
3. トーンマッピングと `vignette`
4. 登録した種類のうち `stage` が `display` のもの
5. `fxaa`
6. `smaa`

### `components`

| 項目 | 内容 |
|---|---|
| `id`、`name` | id と表示名 |
| `type` | `defineComponent` で登録した種類の名前（`sample.flow` など） |
| `enabled` | 描くか |
| `position`、`rotation`、`scale` | 位置、回転、拡大率 |
| `params` | パラメーターの値 |
| `binding` | データとの結び付け。値はデータの中の場所（`items[3].value` など）か、オブジェクトの名前 |

コンポーネントの書き方は [scripting.md](scripting.md) にある。

### `empties`

Empty は内容の無い点で、2D UI の表示位置、カメラとライトの向ける先、コンポーネントの基準に使う。

| 項目 | 内容 |
|---|---|
| `id`、`name` | id と表示名 |
| `position` | 位置。`parent` があれば、そのオブジェクトからのずれ（向きはワールド座標） |
| `parent` | 一緒に動くオブジェクトの名前（省略可）。回転と拡大率は引き継がない |

### `cameras`

カメラは並んだ順に再生し、最後のカメラの次は最初のカメラに戻る。

| 項目 | 内容 |
|---|---|
| `id`、`name` | id と表示名 |
| `position` | 位置 |
| `target` | 見る点 |
| `targetObject` | 見るオブジェクトの名前。あれば `target` より優先する |
| `fov` | 縦の画角（度）。出力のフレーム（`render.aspectRatio`）に対する値 |
| `duration` | Camera Track に置く長さ（秒） |
| `blend` | 次のカメラへのブレンドの長さ（秒）。`duration` の終わりに重なる |
| `easing` | ブレンドのイージング。`linear`、`easeInOut`、`easeOut`、`easeIn` |
| `motion` | `defineCameraMotion` で登録したカメラの動き。`type`（種類の名前）と `params`。無ければカメラは止まったまま |

### `tracks`

Activation Track は、対象を Clip の区間の中だけ表示する。

| 項目 | 内容 |
|---|---|
| `id` | id |
| `target` | 表示を切り替える対象。下の表の形で書く |
| `clips` | 表示する区間の配列。各 Clip は `id`、`start`、`end`（Timeline の始めからの秒）、`fadeIn`、`fadeOut`（秒） |

`fadeIn` と `fadeOut` が効くのは 2D UI だけである。3D の対象は区間の中で表示され、区間の外で隠れる。

| `target` の形 | 対象 |
|---|---|
| `ui:<名前>` | 2D UI の要素（`useActivationRef` に渡した名前） |
| `object:<名前>` | `.glb` の中のオブジェクト |
| `placed:<id>` | `placed` のモデル |
| `component:<id>` | `components` のコンポーネント |
| `light:<id>` | `lights` のライト |
| `slot:<コンポーネントの id>` | そのコンポーネントの、Event の Key のスロットのオブジェクト（Event の Timeline の中だけ） |

### `animations`

Animation Track は、区間の始まりで `.glb` のアニメーションの Clip を最初から再生する。
メインの Timeline はループするので、各 Clip はループの中の決まった時刻に再生される。

| 項目 | 内容 |
|---|---|
| `id` | id |
| `target` | 動かす対象。`object:<名前>` か `placed:<id>` |
| `clips` | 区間の配列。各 Clip は `id`、`start`、`end`（秒）、`clip`（`.glb` の中の AnimationClip の名前） |

### `timelines`

Event の Timeline は、Trigger の条件を満たしたとき、または組み込み先から名前で呼ばれたときに1回だけ再生する。
長さは、最後に終わる Clip の `end` である。

| 項目 | 内容 |
|---|---|
| `id` | id |
| `name` | Event の名前。シーンの中で重ならないようにする（Publish が検査する） |
| `trigger` | 再生する条件。`type`（`defineTrigger` で登録した種類の名前か `none`）と `params`。`none` は名前で呼ばれたときだけ再生する |
| `tracks` | Activation Track（`tracks` と同じ形。`target` に `slot:` も使える） |
| `animations` | Animation Track（`animations` と同じ形） |

Event の Timeline の操作は [studio.md](studio.md) の「Event の Timeline」、Trigger の書き方は [scripting.md](scripting.md) にある。

### `render`

スタジオの Render Settings で変える項目である。

| 項目 | 内容 |
|---|---|
| `aspectRatio` | 出力のフレームの縦横比 `[幅, 高さ]`。既定は `[16, 9]`。2D UI のステージは高さ 1080 px で、幅はこの比で決まる |
| `quality` | 品質のレベル `high` と `low` ごとの `maxHeight`（描画の高さの上限、px）と `shadowMapScale`（各ライトの `shadow.mapSize` にかける倍率） |
| `dynamicResolution` | フレーム時間が `frameTimeThreshold`（ms）を超え続けたとき、描画の高さを `minHeight`（px）に下げる |

### 例

```json
{
  "schemaVersion": 2,
  "name": "main",
  "assets": ["glb/blocks.glb"],
  "overrides": {
    "Pillar": { "position": [2, 0, -1], "rotation": [0, 45, 0] }
  },
  "placed": [],
  "materials": {
    "floor": {
      "name": "Floor",
      "type": "standard",
      "color": "#808080",
      "roughness": 0.7,
      "metalness": 0,
      "emissive": "#000000",
      "emissiveIntensity": 1,
      "opacity": 1,
      "transparent": false,
      "envMapIntensity": 1
    }
  },
  "materialAssignments": [
    { "object": "Floor", "slot": "FloorMat", "material": "floor" }
  ],
  "lights": [],
  "postprocess": [
    { "id": "fx-1", "type": "bloom", "enabled": true, "params": {} }
  ],
  "components": [],
  "empties": [],
  "cameras": [
    {
      "id": "camera-1",
      "name": "Overview",
      "position": [10, 8, 10],
      "target": [0, 0, 0],
      "fov": 30,
      "duration": 10,
      "blend": 1.5,
      "easing": "easeInOut"
    }
  ],
  "tracks": [],
  "animations": [],
  "timelines": []
}
```

この例は `environment` と `render` を省いているので、どちらも既定値で読まれる。

## Publish

Publish は、シーン定義と、シーンが使う `content/` のファイルを、組み込み先に配信する形（シーンのバンドル）に書き出す。
スタジオの Toolbar の Publish は開いている Scene を、`three-stage publish` は `--scene` で指定した Scene（既定は `scenes/main.stage.json`）を書き出す。
出力先は `<プロジェクト>/dist/bundle/` で、書き出すたびに前の出力を消して作り直す。

### 検査

Publish は書き出す前に次を検査し、1つでも当てはまればバンドルを作らない。

| 検査 | 内容 |
|---|---|
| 形式 | シーン定義が JSON として読めない。`schemaVersion` が無い。`schemaVersion` がランタイムより新しい |
| ファイル | `assets`、`placed` の `asset`、組み込みのマテリアルのテクスチャ、`environment.source` が `hdri` のときの `hdri` と `hdriB` が `content/` に無い |
| パラメーターが指すファイル | シェーダー、ポストエフェクト、コンポーネント、カメラの動きのアセットのパラメーター（既定値を含む）が指すファイルが、`content/` に無い |
| 登録 | シーンが名前で使うシェーダー、ポストエフェクト、コンポーネント、Trigger、カメラの動きが、プロジェクトのコードで登録されていない |
| Event の名前 | 同じ名前の Event の Timeline が2つ以上ある（Event は名前で呼ぶので、重なると片方しか再生できない） |

登録の検査は、`src/index.ts`（パッケージの入口）が登録するものを対象にする。
`src/index.ts` が無いプロジェクトでは、`src/stage.ts` が登録するものを対象にする。

結果は、スタジオでは画面の下と Console に、`three-stage publish` では標準エラー出力に表示する。

### 出力の構成

```
dist/bundle/
  manifest.json                  バンドルの目録。名前は変わらない
  scene.<ハッシュ>.json          シーン定義
  glb/stage.<ハッシュ>.glb       シーンが使うファイル。content/ と同じフォルダ構成
  textures/…
  hdr/…
  fonts/…                        content/fonts/ があれば、すべて
  decoders/draco.<ハッシュ>/     圧縮を解く three.js のプログラム（使うときだけ）
  decoders/basis.<ハッシュ>/
```

バンドルに入るファイルは次のとおり。

- シーン定義の中の文字列のうち、`content/` のファイル（`scenes/` を除く）を指すもの。コンポーネントのパラメーターで指したアセットも含む。
- 登録した種類のアセットのパラメーターの既定値が指すファイル（シーン定義に書かれていなくても含む）。
- `content/fonts/` のファイルすべて（2D UI が読むため）。

ファイル名には、内容から計算したハッシュを付ける。
内容が変わらなければ名前も変わらないので、`manifest.json` 以外のファイルは長期間キャッシュできる。

圧縮したファイルは、そのまま読める（Draco、Meshopt、KTX2）。
圧縮を解くプログラムは CDN から読まず、バンドルに入れたものを使う。

| 使っているもの | `decoders/` に入るもの |
|---|---|
| Draco で圧縮した `.glb`（`KHR_draco_mesh_compression`） | `draco` |
| `.ktx2`、または KTX2 のテクスチャを含む `.glb`（`KHR_texture_basisu`） | `basis` |

Publish は、アセットを圧縮し直さず、性能の上限も検査しない。
書き出したバンドルをサーバーにアップロードする機能は無い。

### `manifest.json`

| 項目 | 内容 |
|---|---|
| `format` | `manifest.json` の形式のバージョン。現在は `1` |
| `scene` | シーン定義のファイルのパス（`manifest.json` からの相対パス） |
| `source` | 書き出す元にしたシーン定義のパス（`content/` からの相対パス） |
| `files` | シーン定義に書かれたパスから、バンドルの中のパス（`manifest.json` からの相対パス）への対応 |
| `events` | Event の一覧（Event があるときだけ）。各要素は `name`、`trigger`（Trigger の種類の名前か `none`）、`params` |
| `decoders` | 圧縮を解くプログラムのフォルダ（使うときだけ）。`draco`、`basis` |

組み込み先から Event を名前で呼ぶときは、`events` の `name` を使う。

### 書き出したバンドルの確認

スタジオのサーバーを起動しているとき、次の URL で、書き出したバンドルを組み込み先と同じ描画で表示できる。

```
http://127.0.0.1:5180/preview.html?bundle=/dist/bundle/manifest.json
```

`preview.html` は、スタジオの編集の画面を除き、組み込み先と同じ描画だけを表示するページである。
データには、プロジェクトのモックデータを使う。

## パッケージ

`three-stage build` は、プロジェクトのコードとランタイムを、組み込み先に追加する npm のパッケージにまとめる。

```powershell
three-stage build <プロジェクトのフォルダ>
```

### 入口

| 入口 | 必須 | パッケージでの import の名前 |
|---|---|---|
| `src/index.ts` | 必須 | `<name>` |
| `src/mock/index.ts` | 任意（あればまとめる） | `<name>/mock` |

`<name>` は `three-stage.json` の `name` である。
`src/index.ts` からは、組み込み先に渡す React コンポーネントと、データの型を export する。
`src/mock/index.ts` からは、組み込み先の開発やテストで使うモックデータを export できる。

### 出力

```
dist/
  package/
    package.json
    README.md
    index.js
    mock.js              src/mock/index.ts があるときだけ
    chunk-<ハッシュ>.js  入口の間で共有するコード
    types/               型（.d.ts）
  <name>-<version>.tgz   package/ を npm pack と同じ形にまとめたもの
```

`name` がスコープ付き（`@acme/stage`）のときは、tgz の名前は `acme-stage-<version>.tgz` になる。

| ファイル | 内容 |
|---|---|
| `index.js`、`mock.js` | ESM。minify し、コメント、改行、ビルドした PC のファイルパスを含まない。シェーダーの GLSL は文字列なので、その中のコメントは残る。先頭に `'use client'` を付ける |
| `types/` | 入口から辿れる `.d.ts` だけを含む。コンポーネントの props の説明は、ここの JSDoc に書く |
| `package.json` | `three-stage.json` の `name`、`version`、`description`、`exports`、`peerDependencies` |
| `README.md` | インストールの方法、import の名前と型のファイル、バンドルの配置の方法 |

### peerDependencies

次のパッケージは組み込み先にインストールしたものを使うので、パッケージにまとめず `peerDependencies` に書く。
同じパッケージ（React など）が2つあると hooks が動かないので、組み込み先のものを使う。

| パッケージ |
|---|
| `react` |
| `react-dom` |
| `three` |
| `@react-three/fiber` |
| `@react-three/drei` |

バージョンの範囲は、生成された `package.json` と README に書かれる。
ランタイム（`@three-stage/runtime`）はパッケージの中にまとめるので、組み込み先は追加しない。

### 型

組み込み先はランタイムの型を持たない。
そのため、入口から export する型（props、データの型）は、ランタイムの型を参照せず、プロジェクトの中で定義する。
入口から辿れる型がランタイムの型を参照していると、`three-stage build` は警告を表示する。

## Web アプリケーションへの組み込み

### 手順

1. パッケージと peerDependencies を組み込み先に追加する。

   ```powershell
   npm install ./<name>-<version>.tgz react react-dom three @react-three/fiber @react-three/drei
   ```

   バージョンを指定したコマンドは、パッケージの README にある。

2. `dist/bundle/` の内容を、フォルダ構成を変えずに静的ファイルのサーバーか CDN に置く。
3. 組み込み先で、パッケージの React コンポーネントを表示し、`bundle` に `manifest.json` の URL を、`data` にデータを渡す。

### バンドルの配信

| ファイル | キャッシュ |
|---|---|
| `manifest.json` | キャッシュしない。ランタイムもキャッシュを使わずに読む |
| そのほかのファイル | 名前に内容のハッシュが付いているので、長期間キャッシュしてよい |

`manifest.json` の中のパスは `manifest.json` からの相対パスなので、バンドルはどの URL の下に置いてもよい。
シーンを更新するときは、新しいバンドルのファイルを置いてから `manifest.json` を置き換える。

### props

props の形はプロジェクトが決める。
ランタイムの `StageView` を包んだコンポーネントでは、少なくとも次の2つを受け取る。

| props | 内容 |
|---|---|
| `bundle` | Publish で書き出した `manifest.json` の URL |
| `data` | シーンが表示するデータ。JSON で表せる値で、データが届くたびに新しい値に置き換える |

シーンの `binding` は、`data` の中の場所（`items[3].value` など）を指す。
データの形とモックデータはプロジェクトが定義する（[scripting.md](scripting.md)）。

### 例

プロジェクトの側では、`StageView` を包んだコンポーネントを `src/index.ts` から export する。

```tsx
// src/MyStage.tsx
'use client';
import { StageView } from '@three-stage/runtime';
import type { MyData } from './data';
import { registered } from './register';

void registered;

/** Props of MyStage. */
export interface MyStageProps {
  /** URL of the published manifest.json. */
  bundle: string;
  /** The data the scene displays. */
  data: MyData | null;
  className?: string;
}

export function MyStage({ bundle, data, className }: MyStageProps) {
  return <StageView bundle={bundle} data={data} className={className} />;
}
```

```ts
// src/index.ts
export { MyStage, type MyStageProps } from './MyStage';
export type { MyData } from './data';
```

`register` の値を参照するのは、コンポーネントやシェーダーの登録をパッケージに確実に含めるためである。
`import './register'` だけだと、生成される `.d.ts` にランタイムへの参照が残る。

組み込み先の側では、パッケージのコンポーネントを表示する。

```tsx
import { useEffect, useState } from 'react';
import { MyStage, type MyData } from 'my-stage';

export function Dashboard() {
  const [data, setData] = useState<MyData | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.onmessage = (e) => setData(JSON.parse(e.data));
    return () => source.close();
  }, []);

  return <MyStage bundle="/stage/manifest.json" data={data} className="stage" />;
}
```

コンポーネントはブラウザでだけ動く。
出力の先頭に `'use client'` があるので、Next.js の App Router でもクライアントコンポーネントとして扱われる。
`StageView` は親の要素の幅と高さいっぱいに描くので、親の要素に幅と高さを指定する。

Event を組み込み先から名前で呼ぶには、`EventStore` を `StageView` の `events` に渡し、その `fire` をコンポーネントの ref などで公開する。
書き方は [scripting.md](scripting.md) にある。
