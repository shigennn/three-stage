# シーン定義と書き出し

このドキュメントでは、プロジェクトのファイル構成、シーン定義ファイルの形式、シーンの書き出し方法、Web アプリケーションへの組み込み方法を説明する。\
コードの記述方法は [scripting.md](scripting.md)、エディタの操作は [studio.md](studio.md) を参照。

## 概要

THREE Stage で作成したシーンは、次の 2 つに分けて Web アプリケーションに渡す。

| 成果物 | 作成方法 | 内容 |
|---|---|---|
| シーンのバンドル | Publish | シーン定義と、シーンが使用するアセット |
| パッケージ | `three-stage build` | シーンを表示する React コンポーネント |

以下、シーンを組み込む Web アプリケーションを「組み込み先」と呼ぶ。\
組み込み先は、パッケージの React コンポーネントに、バンドルの URL とデータを渡して表示する。\
シーンだけを変更した場合は、バンドルを差し替えるだけで済み、組み込み先のコードを変更する必要はない。

## プロジェクトの構成

```
<プロジェクト>/
  three-stage.json     プロジェクトの設定
  src/                 プロジェクトのコード（TypeScript）
  content/
    scenes/            シーン定義（*.stage.json）
    glb/               モデル（.glb）
    textures/          テクスチャ（.png、.jpg、.jpeg、.webp、.ktx2）
    hdr/               HDRI（.hdr、.exr）
    fonts/             2D UI で使用するフォント
  dist/                Publish とパッケージの出力先
  .three-stage/        エディタが生成する設定とキャッシュ
```

`dist/` と `.three-stage/` は生成物のため、git で管理しない。

### `three-stage.json`

| 項目 | 型 | 説明 |
|---|---|---|
| `name` | 文字列 | プロジェクト名。パッケージ名としても使用するため、npm のパッケージ名の規則に従う |
| `version` | 文字列 | プロジェクトのバージョン。パッケージのバージョンとしても使用する |
| `description` | 文字列 | 説明。パッケージの `package.json` と README に記載される |
| `tool` | 文字列 | プロジェクトを作成した THREE Stage のバージョン |

## シーン定義ファイル

シーン定義ファイル（`*.stage.json`）は、1 つのシーンの構成をすべて記述した JSON ファイルである。\
エディタで編集した内容は、このファイルに保存される。\
テキストエディタで直接編集することもできる。

### 値の表し方

| 対象 | 表し方 |
|---|---|
| 長さ | メートル |
| 座標系 | Y 軸を上とする右手座標系（glTF と同じ） |
| 回転 | 度数法のオイラー角 `[x, y, z]`。X、Y、Z の順に適用する |
| 色 | `#RRGGBB` 形式の文字列 |
| 時間 | 秒 |
| ベクトル | 数値 3 つの配列 `[x, y, z]` |
| ファイル | `content/` からの相対パス（例: `glb/blocks.glb`） |

### 保存の形式

エディタは、項目の順序を固定し、インデントを空白 2 つにして保存する。\
数値は小数点以下 4 桁に丸める。\
保存のたびに書式が変化しないため、git の差分で変更内容を確認できる。

### 読み込みの規則

省略した項目には、既定値が適用される。\
以前の形式のファイルは、読み込むときに現在の形式に変換される。\
`schemaVersion` がランタイムの対応するバージョンより新しいファイルは読み込まれず、エラーになる。

### 最上位の項目

| 項目 | 型 | 説明 |
|---|---|---|
| `schemaVersion` | 数値 | 形式のバージョン。現在は `2` |
| `name` | 文字列 | シーンの名前 |
| `assets` | 文字列の配列 | 読み込む `.glb` のパス |
| `overrides` | オブジェクト | `assets` のモデル内のオブジェクトに対する変更 |
| `placed` | 配列 | エディタで追加配置したモデル |
| `materials` | オブジェクト | マテリアル |
| `materialAssignments` | 配列 | モデルのマテリアルの置き換え |
| `lights` | 配列 | ライト |
| `environment` | オブジェクト | 背景、環境光、霧、トーンマッピング、影 |
| `postprocess` | 配列 | ポストプロセス |
| `components` | 配列 | コンポーネント |
| `empties` | 配列 | Empty |
| `cameras` | 配列 | Camera Track のカメラ |
| `tracks` | 配列 | メインの Timeline の Activation Track |
| `animations` | 配列 | メインの Timeline の Animation Track |
| `timelines` | 配列 | Event Timeline |
| `render` | オブジェクト | 描画の設定 |

配列の要素が持つ `id` は、同じ配列の中で一意の文字列である。\
`name` はエディタに表示する名前である。

### `overrides`

`assets` のモデル内のオブジェクトを、オブジェクト名で指定して変更する。\
キーがオブジェクト名、値が次の項目を持つオブジェクトである。\
記述した項目だけが変更され、記述しない項目はモデルの値のままになる。

| 項目 | 型 | 説明 |
|---|---|---|
| `position` | ベクトル | 位置 |
| `rotation` | ベクトル | 回転 |
| `scale` | ベクトル | 拡大率 |
| `visible` | 真偽値 | 表示するかどうか |
| `castShadow` | 真偽値 | 影を落とすかどうか |
| `receiveShadow` | 真偽値 | 影を受けるかどうか |
| `clip` | 文字列 | 繰り返し再生するアニメーション Clip の名前 |
| `loop` | 真偽値 | Clip をループ再生するかどうか |

モデリングツールでオブジェクト名を変更すると、そのオブジェクトの `overrides` は適用されなくなる。

### `placed`

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `name` | 文字列 | 表示名 |
| `asset` | 文字列 | `.glb` のパス |
| `position`、`rotation`、`scale` | ベクトル | 位置、回転、拡大率 |
| `castShadow`、`receiveShadow` | 真偽値 | 影を落とすかどうか、影を受けるかどうか |
| `clip` | 文字列 | 繰り返し再生するアニメーション Clip の名前 |
| `loop` | 真偽値 | Clip をループ再生するかどうか |

### `materials`

キーがマテリアルの ID、値がマテリアルの定義である。\
マテリアルには、ランタイムに組み込まれた種類と、プロジェクトがシェーダーとして登録した種類がある。

組み込みの種類は、three.js の `MeshStandardMaterial` と `MeshPhysicalMaterial` に対応する。\
各項目は、three.js の同名のプロパティに設定される。

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `name` | 文字列 | ID | 表示名 |
| `type` | 文字列 | `standard` | `standard`（MeshStandardMaterial）または `physical`（MeshPhysicalMaterial） |
| `color` | 色 | `#FFFFFF` | 基本色 |
| `roughness` | 数値 | `0.7` | 粗さ（0〜1） |
| `metalness` | 数値 | `0` | 金属度（0〜1） |
| `emissive` | 色 | `#000000` | 発光色 |
| `emissiveIntensity` | 数値 | `1` | 発光の強さ |
| `opacity` | 数値 | `1` | 不透明度（0〜1）。`transparent` が `true` のときに有効 |
| `transparent` | 真偽値 | `false` | 半透明として描画するかどうか |
| `envMapIntensity` | 数値 | `1` | 環境光と映り込みの強さ |
| `map` | 文字列 | なし | ベースカラーのテクスチャ |
| `normalMap` | 文字列 | なし | 法線マップ |
| `roughnessMap` | 文字列 | なし | 粗さのテクスチャ |
| `metalnessMap` | 文字列 | なし | 金属度のテクスチャ |
| `aoMap` | 文字列 | なし | アンビエントオクルージョンのテクスチャ |
| `emissiveMap` | 文字列 | なし | 発光のテクスチャ |

`type` が `physical` の場合は、`clearcoat`、`clearcoatRoughness`、`transmission`、`thickness`、`ior`、`sheen`、`sheenColor` も指定できる。

登録したシェーダーを使用するマテリアルは、次の項目を持つ。

| 項目 | 型 | 説明 |
|---|---|---|
| `name` | 文字列 | 表示名 |
| `type` | 文字列 | `defineShader` で登録した種類名（例: `sample.grid`） |
| `params` | オブジェクト | パラメーターの値 |
| `binding` | オブジェクト | パラメーター名と、データ内のパスの対応 |

### `materialAssignments`

モデルのマテリアルを、`materials` のマテリアルに置き換える。

| 項目 | 型 | 説明 |
|---|---|---|
| `object` | 文字列 | オブジェクト名 |
| `slot` | 文字列 | 置き換える元のマテリアルの名前（マテリアルスロット） |
| `material` | 文字列 | `materials` のマテリアルの ID |

### `lights`

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `id` | 文字列 | 自動 | ID |
| `name` | 文字列 | 自動 | 表示名 |
| `type` | 文字列 | `point` | `directional`、`point`、`spot`、`hemisphere`、`ambient` のいずれか |
| `color` | 色 | `#FFFFFF` | 色 |
| `intensity` | 数値 | `1` | 強さ |
| `position` | ベクトル | `[0, 10, 0]` | 位置 |
| `target` | ベクトル | `[0, 0, 0]` | ライトを向ける点。`directional` と `spot` で使用する |
| `targetObject` | 文字列 | なし | ライトを向けるオブジェクトの名前。指定すると `target` より優先する |
| `groundColor` | 色 | なし | 地面側の色。`hemisphere` で使用する |
| `distance` | 数値 | three.js の既定値 | 光が届く距離。`0` は無制限である。`point` と `spot` で使用する |
| `decay` | 数値 | three.js の既定値 | 距離による減衰。`point` と `spot` で使用する |
| `angle` | 数値 | three.js の既定値 | 円錐の角度（度）。`spot` で使用する |
| `penumbra` | 数値 | three.js の既定値 | 円錐の縁のぼかし（0〜1）。`spot` で使用する |
| `castShadow` | 真偽値 | `false` | 影を落とすかどうか |
| `shadow` | オブジェクト | 下表 | 影の設定 |

`shadow` の項目は次のとおりである。

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `mapSize` | 数値 | `2048` | シャドウマップの解像度（px） |
| `bias` | 数値 | `-0.0005` | 深度のバイアス |
| `normalBias` | 数値 | `0.04` | 法線方向のバイアス |
| `radius` | 数値 | `4` | 影の縁のぼかし |
| `cameraSize` | 数値 | `40` | `directional` の影を描く範囲の半分の幅（m） |

### `environment`

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `background` | オブジェクト | 下表 | 背景 |
| `source` | 文字列 | `room` | 環境光の種類。`none`、`room`（three.js の RoomEnvironment）、`hdri` のいずれか |
| `hdri` | 文字列 | なし | HDRI のパス |
| `hdriB` | 文字列 | なし | 2 枚目の HDRI のパス。`blend` で `hdri` と混合する |
| `blend` | 数値 | `0` | `hdri` と `hdriB` の混合率。`0` で `hdri`、`1` で `hdriB` になる |
| `intensity` | 数値 | `1` | 環境光の強さ |
| `rotation` | 数値 | `0` | 環境光の Y 軸周りの回転（度） |
| `reflection` | オブジェクト | 下表 | リフレクションプローブ |
| `fog` | オブジェクト | 下表 | 線形フォグ |
| `toneMapping` | 文字列 | `neutral` | `none`、`linear`、`reinhard`、`cineon`、`aces`、`agx`、`neutral` のいずれか |
| `exposure` | 数値 | `1` | 露出 |
| `shadows` | オブジェクト | 下表 | シーン全体の影の設定 |

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `background.type` | 文字列 | `color` | `none`、`color`、`environment`（環境光の画像を表示）のいずれか |
| `background.color` | 色 | `#EEF1F5` | 背景色 |
| `background.blur` | 数値 | `0` | 背景のぼかし（0〜1）。`environment` のときに有効 |
| `reflection.enabled` | 真偽値 | `true` | リフレクションプローブを使用するかどうか |
| `reflection.position` | ベクトル | `[0, 1.5, 0]` | 周囲を撮影する位置 |
| `reflection.resolution` | 数値 | `128` | キューブマップの 1 面の幅（px）。`64`、`128`、`256` のいずれか |
| `fog.enabled` | 真偽値 | `false` | フォグを使用するかどうか |
| `fog.color` | 色 | `#EEF1F5` | フォグの色 |
| `fog.near`、`fog.far` | 数値 | `60`、`400` | フォグの開始距離と終了距離（m） |
| `shadows.enabled` | 真偽値 | `true` | 影を描画するかどうか |
| `shadows.type` | 文字列 | `pcf` | シャドウマップの種類。`pcf`、`vsm`、`basic` のいずれか |

### `postprocess`

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `type` | 文字列 | 組み込みの `bloom`、`vignette`、`fxaa`、`smaa`、または `definePostEffect` で登録した種類名 |
| `enabled` | 真偽値 | 適用するかどうか |
| `params` | オブジェクト | パラメーターの値 |
| `binding` | オブジェクト | パラメーター名と、データ内のパスの対応。登録した種類だけが使用する |

ポストプロセスは、配列の順序に関係なく、次の順に適用される。\
登録した種類どうしは、同じ段階の中で配列の順に適用される。

1. `bloom`
2. 登録した種類のうち、`stage` が `hdr` のもの
3. トーンマッピングと `vignette`
4. 登録した種類のうち、`stage` が `display` のもの
5. `fxaa`
6. `smaa`

### `components`

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `name` | 文字列 | 表示名 |
| `type` | 文字列 | `defineComponent` で登録した種類名（例: `sample.flow`） |
| `enabled` | 真偽値 | 有効にするかどうか |
| `position`、`rotation`、`scale` | ベクトル | 位置、回転、拡大率 |
| `params` | オブジェクト | パラメーターの値 |
| `binding` | オブジェクト | パラメーター名と、データ内のパスまたはオブジェクト名の対応 |

### `empties`

Empty は、形状を持たない名前付きの位置である。\
2D UI の表示位置、カメラやライトを向ける先、コンポーネントの基準位置として使用する。

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `name` | 文字列 | 表示名 |
| `position` | ベクトル | 位置。`parent` を指定した場合は、親オブジェクトからのオフセット（ワールド座標の向き） |
| `parent` | 文字列 | 追従する親オブジェクトの名前（省略可）。親の回転と拡大率は継承しない |

### `cameras`

カメラは配列の順に再生され、最後のカメラの次は最初のカメラに戻る。

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `id` | 文字列 | 自動 | ID |
| `name` | 文字列 | 自動 | 表示名 |
| `position` | ベクトル | `[10, 10, 10]` | 位置 |
| `target` | ベクトル | `[0, 0, 0]` | 注視点 |
| `targetObject` | 文字列 | なし | 注視するオブジェクトの名前。指定すると `target` より優先する |
| `fov` | 数値 | `30` | 垂直方向の画角（度） |
| `duration` | 数値 | `10` | Camera Track 上の長さ（秒） |
| `blend` | 数値 | `1.5` | 次のカメラへの切り替えにかける時間（秒）。`duration` の終わりに重なる |
| `easing` | 文字列 | `easeInOut` | 切り替えのイージング。`linear`、`easeIn`、`easeOut`、`easeInOut` のいずれか |
| `motion` | オブジェクト | なし | カメラの動き。`type`（種類名）と `params`（パラメーター）を持つ。省略するとカメラは静止する |

### `tracks`

Activation Track は、対象を Clip の区間内だけ表示する。

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `target` | 文字列 | 表示を切り替える対象（下表） |
| `clips` | 配列 | 表示する区間 |

`clips` の要素は次の項目を持つ。

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `id` | 文字列 | 自動 | ID |
| `start` | 数値 | `0` | 開始時刻（Timeline の先頭からの秒） |
| `end` | 数値 | `start` + 5 | 終了時刻（秒） |
| `fadeIn` | 数値 | `0` | フェードインの長さ（秒） |
| `fadeOut` | 数値 | `0` | フェードアウトの長さ（秒） |

フェードは 2D UI にだけ適用される。\
3D の対象は、区間の内側で表示され、外側で非表示になる。

`target` は次の形式で指定する。

| 形式 | 対象 |
|---|---|
| `ui:<名前>` | 2D UI のパーツ |
| `object:<名前>` | モデル内のオブジェクト |
| `placed:<ID>` | `placed` のモデル |
| `component:<ID>` | `components` のコンポーネント |
| `light:<ID>` | `lights` のライト |
| `slot:<コンポーネントの ID>` | Event の Key に対応するスロットのオブジェクト（Event Timeline 内でのみ使用可） |

### `animations`

Animation Track は、区間の開始時にモデルのアニメーション Clip を先頭から再生する。

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `target` | 文字列 | 対象。`object:<名前>` または `placed:<ID>` |
| `clips` | 配列 | 再生する区間。各要素は `id`、`start`、`end`（秒）、`clip`（アニメーション Clip の名前）を持つ |

### `timelines`

Event Timeline は、Trigger の条件を満たしたとき、または組み込み先から名前を指定して呼び出したときに、1 回だけ再生される。\
長さは、最後に終わる Clip の終了時刻で決まる。

| 項目 | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | ID |
| `name` | 文字列 | Event の名前。シーン内で一意にする |
| `trigger` | オブジェクト | 再生の条件。`type`（Trigger の種類名または `none`）と `params` を持つ。`none` の場合は、名前を指定した呼び出しでのみ再生される |
| `tracks` | 配列 | Activation Track（`tracks` と同じ形式） |
| `animations` | 配列 | Animation Track（`animations` と同じ形式） |

### `render`

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `aspectRatio` | 数値の配列 | `[16, 9]` | 出力フレームの縦横比 `[幅, 高さ]` |
| `quality.high` | オブジェクト | 下表 | 品質 High の設定 |
| `quality.low` | オブジェクト | 下表 | 品質 Low の設定 |
| `dynamicResolution` | オブジェクト | 下表 | 動的解像度の設定 |

| 項目 | 型 | 既定値（High / Low） | 説明 |
|---|---|---|---|
| `maxHeight` | 数値 | `1080` / `720` | 描画解像度の高さの上限（px） |
| `shadowMapScale` | 数値 | `1` / `0.5` | 各ライトの `shadow.mapSize` に掛ける倍率 |

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `dynamicResolution.minHeight` | 数値 | `720` | 解像度を下げたときの高さ（px） |
| `dynamicResolution.frameTimeThreshold` | 数値 | `40` | 遅いと判定するフレーム時間（ms） |

2D UI のステージは高さ 1080 px で、幅は `aspectRatio` から決まる。

### 例

`environment` と `render` を省略した例である。\
省略した項目には既定値が適用される。

```json
{
  "schemaVersion": 2,
  "name": "main",
  "assets": ["glb/blocks.glb"],
  "overrides": {
    "Box": { "position": [2, 0, -1], "rotation": [0, 45, 0] }
  },
  "materials": {
    "floor": { "name": "Floor", "type": "standard", "color": "#808080", "roughness": 0.9 }
  },
  "materialAssignments": [
    { "object": "Floor", "slot": "Floor", "material": "floor" }
  ],
  "lights": [
    { "id": "key", "name": "Key", "type": "directional", "intensity": 2, "position": [8, 14, 10], "castShadow": true }
  ],
  "cameras": [
    { "id": "overview", "name": "overview", "position": [10, 8, 10], "target": [0, 0, 0], "fov": 30, "duration": 10 }
  ]
}
```

## Publish

Publish は、シーン定義と、シーンが使用する `content/` のファイルを、配信用のバンドルとして書き出す機能である。

| 実行方法 | 対象のシーン |
|---|---|
| エディタの Toolbar の Publish | 開いているシーン |
| `three-stage publish <フォルダ>` | `--scene` で指定したシーン（既定は `scenes/main.stage.json`） |

出力先は `dist/bundle/` である。\
書き出すたびに、以前の出力は削除される。

### 書き出し前の検査

Publish は、書き出す前に次の項目を検査する。\
1 つでも問題があれば、バンドルは作成されない。

| 検査 | 失敗する条件 |
|---|---|
| 形式 | JSON として読み込めない、`schemaVersion` がない、`schemaVersion` がランタイムより新しい |
| ファイル | シーン定義が参照するファイルが `content/` にない |
| パラメーター | アセット型のパラメーターが参照するファイルが `content/` にない（既定値を含む） |
| 登録 | シーンが使用するシェーダー、ポストエフェクト、コンポーネント、Trigger、カメラの動きが登録されていない |
| Event 名 | 同じ名前の Event Timeline が複数ある |

登録の検査は、`src/index.ts` から読み込まれる登録を対象にする。\
`src/index.ts` がない場合は、`src/stage.ts` から読み込まれる登録を対象にする。

### 出力の構成

```
dist/bundle/
  manifest.json              バンドルの目録
  scene.<ハッシュ>.json      シーン定義
  glb/<名前>.<ハッシュ>.glb  シーンが使用するファイル（content/ と同じフォルダ構成）
  textures/
  hdr/
  fonts/                     content/fonts/ のすべてのファイル
  decoders/                  圧縮データのデコーダー（必要な場合のみ）
```

バンドルには、次のファイルが含まれる。

- シーン定義が参照する `content/` のファイル
- 登録したコードのアセット型パラメーターの既定値が参照するファイル
- `content/fonts/` のすべてのファイル

`manifest.json` 以外のファイル名には、内容から計算したハッシュが付与される。\
内容が同一であればファイル名も同一になるため、長期間キャッシュできる。

Draco、Meshopt、KTX2 で圧縮したファイルも、そのまま使用できる。\
デコーダーはバンドルに含まれるため、CDN から読み込む必要はない。

| 使用している形式 | `decoders/` に含まれるもの |
|---|---|
| Draco で圧縮した `.glb` | `draco` |
| `.ktx2`、または KTX2 テクスチャを含む `.glb` | `basis` |

Publish は、アセットの圧縮や最適化、サーバーへのアップロードは行わない。

### `manifest.json`

| 項目 | 型 | 説明 |
|---|---|---|
| `format` | 数値 | 目録の形式のバージョン。現在は `1` |
| `scene` | 文字列 | シーン定義ファイルのパス |
| `source` | 文字列 | 書き出し元のシーン定義のパス（`content/` からの相対パス） |
| `files` | オブジェクト | シーン定義内のパスと、バンドル内のパスの対応 |
| `events` | 配列 | Event の一覧。各要素は `name`、`trigger`、`params` を持つ |
| `decoders` | オブジェクト | デコーダーのフォルダ（`draco`、`basis`） |

バンドル内のパスは、すべて `manifest.json` からの相対パスである。

### バンドルの確認

エディタのサーバーを起動している間は、次の URL で、書き出したバンドルを組み込み先と同じ描画で表示できる。

```
http://127.0.0.1:5180/preview.html?bundle=/dist/bundle/manifest.json
```

データには、プロジェクトのモックデータが使用される。

## パッケージ

`three-stage build` は、プロジェクトのコードとランタイムを、組み込み先にインストールする npm パッケージにまとめる。

```powershell
three-stage build <プロジェクトのフォルダ>
```

### エントリーポイント

| ファイル | 必須 | インポート名 |
|---|---|---|
| `src/index.ts` | 必須 | `<name>` |
| `src/mock/index.ts` | 任意 | `<name>/mock` |

`<name>` は `three-stage.json` の `name` である。\
`src/index.ts` では、組み込み先で使用する React コンポーネントとデータの型をエクスポートする。\
`src/mock/index.ts` では、組み込み先の開発やテストで使用するモックデータをエクスポートできる。

### 出力の構成

```
dist/
  package/
    package.json
    README.md
    index.js
    mock.js                src/mock/index.ts がある場合のみ
    chunk-<ハッシュ>.js     エントリーポイント間で共有するコード
    types/                 型定義（.d.ts）
  <name>-<version>.tgz     package/ をまとめたもの
```

`name` がスコープ付き（例: `@acme/stage`）の場合、tgz のファイル名は `acme-stage-<version>.tgz` になる。

| ファイル | 内容 |
|---|---|
| `index.js`、`mock.js` | ES モジュール。minify 済みで、先頭に `'use client'` が付与される |
| `types/` | エントリーポイントから参照される型定義だけを含む |
| `package.json` | `three-stage.json` の `name`、`version`、`description` と、`exports`、`peerDependencies` |
| `README.md` | インストール方法、インポート名、バンドルの配置方法 |

### peerDependencies

次のパッケージは組み込み先にインストールされたものを使用するため、パッケージには含まれない。

- `react`
- `react-dom`
- `three`
- `@react-three/fiber`
- `@react-three/drei`

対応するバージョンの範囲は、生成された `package.json` と README に記載される。\
ランタイム（`@three-stage/runtime`）はパッケージに含まれるため、組み込み先でインストールする必要はない。

### 型定義

組み込み先にはランタイムの型定義がない。\
そのため、エントリーポイントからエクスポートする型（props、データの型）は、ランタイムの型を参照せず、プロジェクト内で定義しる。\
ランタイムの型を参照している場合、`three-stage build` は警告を表示する。

## Web アプリケーションへの組み込み

### 手順

1. パッケージと peerDependencies を、組み込み先にインストールする。\
   バージョンを指定したコマンドは、パッケージの README に記載されている。

   ```powershell
   npm install ./<name>-<version>.tgz react react-dom three @react-three/fiber @react-three/drei
   ```

2. `dist/bundle/` の内容を、フォルダ構成を維持したまま Web サーバーまたは CDN に配置する。
3. 組み込み先でパッケージの React コンポーネントを表示し、`bundle` に `manifest.json` の URL を、`data` にデータを渡す。

### バンドルの配信

| ファイル | キャッシュ |
|---|---|
| `manifest.json` | キャッシュしない |
| それ以外 | 長期間キャッシュしてよい |

`manifest.json` 内のパスは相対パスのため、バンドルは任意の URL の下に配置できる。\
シーンを更新するときは、新しいファイルを配置してから `manifest.json` を置き換える。

### props

props の形式はプロジェクトで定義する。\
ランタイムの `StageView` を使用するコンポーネントは、少なくとも次の 2 つを受け取る。

| props | 型 | 説明 |
|---|---|---|
| `bundle` | 文字列 | Publish で書き出した `manifest.json` の URL |
| `data` | JSON で表せる値 | シーンに渡すデータ。新しいデータを受け取るたびに置き換える |

シーン定義の `binding` は、`data` 内のパス（例: `items[id=A-03].value`）を指す。\
データの形式とモックデータは、プロジェクトで定義する（[scripting.md](scripting.md)）。

### 例

プロジェクト側では、`StageView` を使用するコンポーネントを作成し、`src/index.ts` からエクスポートする。

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

`registered` を参照するのは、登録したコードをパッケージに確実に含めるためである。\
`import './register'` と記述すると、生成される型定義にランタイムへの参照が残る。

組み込み先では、パッケージのコンポーネントを表示する。

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

コンポーネントはブラウザでのみ動作する。\
出力の先頭に `'use client'` があるため、Next.js の App Router ではクライアントコンポーネントとして扱われる。\
`StageView` は親要素の幅と高さいっぱいに描画するため、親要素にサイズを指定する。

組み込み先から Event を名前で再生する方法は、[scripting.md](scripting.md) を参照。
