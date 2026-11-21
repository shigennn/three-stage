# プロジェクトのコードとランタイム API

このドキュメントでは、プロジェクトの `src/` に記述するコード（コンポーネント、2D UI、シェーダー、ポストエフェクト、Trigger、カメラの動き、モックデータ）と、ランタイム（`@three-stage/runtime`）の API を説明する。\
シーン定義ファイルの形式と組み込み方法は [scene-format.md](scene-format.md)、エディタの操作は [studio.md](studio.md) を参照。

## 概要

コードは TypeScript で記述し、3D の描画には React Three Fiber（R3F）と three.js を使用する。\
以下、シーンを組み込む Web アプリケーションを「組み込み先」と呼ぶ。

### ファイルの構成

プロジェクトのコードは `src/` に配置する。\
次の 4 つのファイルは、役割が固定されている。

| ファイル | 必須 | 役割 |
|---|---|---|
| `src/stage.ts` | 必須 | エディタが読み込むエントリーポイント |
| `src/register.ts` | 任意 | 組み込み先にも含める登録をまとめるファイル |
| `src/index.ts` | `three-stage build` で必須 | パッケージのエントリーポイント |
| `src/mock/index.ts` | 任意 | モックデータ |

- `src/stage.ts` は、`src/register.ts` とモックデータ（`src/mock/`）を読み込む。
- `src/register.ts` は、コンポーネント、2D UI、シェーダー、ポストエフェクト、Trigger、カメラの動きを定義したファイルを `import` する。
- `src/index.ts` は、組み込み先で使用する React コンポーネントとデータの型をエクスポートする。
- `src/mock/index.ts` はパッケージの本体に含まれず、`<パッケージ名>/mock` として別に書き出される。

その他のファイル（`src/components/`、`src/shaders/`、`src/effects/` など）は、自由に分割してよい。\
サンプルのプロジェクト（`three-stage new <フォルダ> --template sample`）の `src/` には、すべての種類の登録の例が含まれる。

`src/register.ts` から読み込まれない登録は、エディタでは使用できるが、パッケージには含まれない。\
`three-stage publish` もパッケージのエントリーポイント（`src/index.ts`）から登録を収集する。\
そのため、そうした登録を使用するシーンは Publish できない。

`src/index.ts` は、`src/register.ts` がエクスポートする値（サンプルとひな形では `registered`）を参照して、登録を読み込ませる。\
`import './register'` と記述すると、生成される `.d.ts` にその行が残り、組み込み先がランタイムの型定義を必要とするためである。

### 登録の仕組み

コードは、ランタイムの `define〜` 関数で、種類ごとに登録する。\
エディタは、登録された種類を一覧に表示し、`params` の定義からパラメーターの入力欄を生成する。\
シーン定義ファイルに保存されるのは、種類名とパラメーターの値のみで、コードは含まれない。

| 関数 | 登録する対象 | エディタでの表示位置 |
|---|---|---|
| `defineComponent` | コンポーネント | Hierarchy の「＋」 |
| `defineOverlay` | 2D UI（プロジェクトに 1 つ） | Viewport の上 |
| `defineShader` | シェーダー（マテリアルの種類） | Assets の Materials の「＋」、マテリアルの Type |
| `definePostEffect` | ポストエフェクト | Environment の Post Processing の Add |
| `defineTrigger` | Event Timeline を再生する条件 | Event Timeline の Trigger の Type |
| `defineCameraMotion` | カメラの動き | Camera の Motion の Type |
| `defineMockData` | モックデータ（プロジェクトに 1 つ） | Data タブ |

- 種類名（`type`）には、プロジェクト名を接頭辞として付与する（例: `sample.flow`）。\
  接頭辞 `stage.` は、ランタイムに組み込まれた種類が使用する。
- 同じ種類名で再度登録すると、以前の登録が置き換えられる。\
  `src/` のファイルを保存すると、エディタはコードを再読み込みし、一覧とパネルを更新する。
- `label` はエディタに表示する名前である。\
  省略すると `type` が表示される。\
  コンポーネントを配置したときの名前も、`label` から生成される。
- 組み込みのマテリアル（`standard`、`physical`）や組み込みのポストエフェクト（`bloom`、`vignette`、`fxaa`、`smaa`）と同じ名前のシェーダーとポストエフェクトは、登録できない。\
  登録しようとすると、ブラウザのコンソールにエラーが出力される。

### インポートできるモジュール

`src/` からインポートできるのは、次のパッケージ（サブパスを含む）と、プロジェクト内のファイルである。

- `@three-stage/runtime`
- `react`、`react-dom`
- `three`（`three/examples/jsm/...` を含む）
- `@react-three/fiber`、`@react-three/drei`

プロジェクトは `node_modules` を持たない。\
これらのパッケージは、アプリケーションに同梱されたものが使用される。\
型の検査も、アプリケーションに同梱された型定義で行う（`three-stage typecheck <フォルダ>`）。\
パッケージを作成するとき、ランタイムはパッケージに含まれ、その他のパッケージは組み込み先のものが使用される（peerDependencies）。

### パラメーターの定義

コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動きは、いずれも `params` に同じ形式でパラメーターを定義する。\
Inspector はパラメーターごとに入力欄を表示し、値はシーン定義ファイルに保存される。

すべての型に共通する項目は次のとおりである。

| 項目 | 必須 | 説明 |
|---|---|---|
| `type` | 必須 | パラメーターの型（下表） |
| `default` | 必須 | 既定値 |
| `label` | 任意 | Inspector に表示する名前。省略するとキー名が表示される |

| `type` | 値 | 追加の項目 | シェーダーでの uniform の型 |
|---|---|---|---|
| `number` | 数値 | `min`、`max`、`step`、`unit` | `float` |
| `color` | `#RRGGBB` 形式の文字列 | なし | `vec3`（`THREE.Color`） |
| `boolean` | 真偽値 | なし | `bool` |
| `select` | `options` のいずれか | `options`（必須） | `int`（`options` 内の番号） |
| `text` | 文字列 | なし | なし |
| `asset` | `content/` からの相対パス | `kind`（必須）、`srgb` | `sampler2D`（`kind` が `texture` の場合） |
| `object` | シーン内のオブジェクト名 | なし | なし |
| `material` | シーン内のマテリアルの ID | なし | なし |

- `unit` は、Inspector で値と一緒に表示する単位である。
- `asset` の `kind` は `'glb'` または `'texture'` である。\
  `kind` が `glb` の場合、uniform は生成されない。
- `srgb: true` は、色を表すテクスチャに指定する。\
  法線や粗さのように、数値として扱うテクスチャには指定しない。
- `object` は、Inspector の一覧またはスポイトで選択する。
- `material` は、Assets の Materials の一覧から選択する。

`asset` のパラメーターが参照するファイルは、既定値のままでも Publish のバンドルに含まれる。\
ファイルが `content/` にない場合、Publish はエラーになる。

### コードで制御する対象

エディタの Timeline は、カメラの順序と表示する区間を扱い、キーフレームとカーブは扱わない。\
オブジェクトの動きは、glb の Animation Clip か、プロジェクトのコードで実現する。

| 対象 | 制御方法 |
|---|---|
| カメラ | Camera の Motion（[カメラの動き](#カメラの動き)） |
| モデルのアニメーション | glb の Animation Clip（下記） |
| 組み込みのマテリアルの色と発光 | `useSceneMaterial(id)` で取得し、`useFrame` 内で書き込む |
| ライト | `useSceneObject(name)` で取得し、`useFrame` 内で書き込む |
| フォグ、背景、露出 | `useThree()` の `scene` と `gl` に、`useFrame` 内で書き込む |
| 空（HDRI と HDRI B の切り替え） | `useSkyBlend()` の `.value` に、`useFrame` 内で書き込む |
| 組み込みのポストエフェクト | コードからは制御できない |
| Timeline の時刻に同期した動き | `usePlayback().t` を参照する |

Animation Clip は、再生する時機に応じて次のように設定する。

- 常に再生する場合は、Inspector の Animation に設定する。
- ループ内の決まった時刻に再生する場合は、メインの Timeline の Animation Track に配置する。
- 出来事が起きたときに再生する場合は、Event Timeline の Animation Track に配置する。

組み込みのポストエフェクト（Bloom、Vignette）のパラメーターは、シーン定義の値で固定される。\
値を変化させる場合は、同じ効果を `definePostEffect` で登録し、`update` で uniform に書き込む。

エディタでパラメーターを変更すると、ライト、マテリアル、環境はシーン定義の値で上書きされる。\
そのため、コードで制御する値は、変化したときに限らず、毎フレーム書き込む。

## コンポーネント

コンポーネントは、シーンに配置する R3F のコンポーネントである。\
エディタの Hierarchy の「＋」から配置し、Inspector でパラメーターとデータとの対応（Binding）を設定する。

```tsx
// src/components/Flow.tsx。src/register.ts から import './components/Flow' で読み込む
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { defineComponent, getPath, useSceneObject, useStageData, type StageComponentProps } from '@three-stage/runtime';

type Params = { color: string; size: number; speedPerUnit: number };

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// データの値に比例する速度で、from のオブジェクトから to のオブジェクトへ粒子を移動させる
function Flow({ params, binding, editing }: StageComponentProps<Params>) {
  const data = useStageData();
  const from = useSceneObject(binding.from ?? '');
  const to = useSceneObject(binding.to ?? '');
  const mesh = useRef<THREE.Mesh>(null);
  const phase = useRef(0);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m || !from || !to) return;
    const value = Number(getPath(data.value, binding.value ?? '')) || 0;
    if (!editing) phase.current = (phase.current + value * params.speedPerUnit * dt) % 1;
    m.position.lerpVectors(from.getWorldPosition(_a), to.getWorldPosition(_b), phase.current);
    m.parent?.worldToLocal(m.position); // コンポーネントのローカル座標に変換する
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[params.size, 16, 16]} />
      <meshStandardMaterial color={params.color} />
    </mesh>
  );
}

defineComponent<Params>({
  type: 'sample.flow',                 // 種類名
  label: 'Flow',                       // Hierarchy の「＋」に表示する名前
  params: {                            // Inspector の入力欄の定義
    color: { type: 'color', default: '#F79009', label: 'Color' },
    size: { type: 'number', default: 0.11, min: 0.05, max: 0.5, unit: 'm', label: 'Size' },
    speedPerUnit: { type: 'number', default: 0.3, min: 0, max: 2, label: 'Speed Per Unit' },
  },
  binding: { from: 'node', to: 'node', value: 'data' },  // Inspector の Binding で選択する対象
  Component: Flow,
});
```

毎フレームの変化は、`useFrame` 内で ref のオブジェクトに直接書き込み、setState は使用しない。\
データも、`useFrame` 内で `useStageData().value` を参照する。

### 定義の項目

| 項目 | 型 | 説明 |
|---|---|---|
| `type` | 文字列 | 種類名 |
| `label` | 文字列 | エディタに表示する名前 |
| `params` | オブジェクト | パラメーターの定義（[パラメーターの定義](#パラメーターの定義)） |
| `binding` | オブジェクト | Binding の名前と種類 |
| `Component` | React コンポーネント | 描画する R3F のコンポーネント |
| `count` | 関数 | 配置したオブジェクトの数を返す |
| `slots` | 真偽値 | Event Timeline でスロットのオブジェクトを対象にするかどうか |

- `binding` の種類は `'data'` または `'node'` である。\
  `'data'` はデータ内のパス、`'node'` はシーン内のオブジェクト名を指す。\
  Inspector の Binding では、`'data'` は現在のデータに含まれるパスから、`'node'` は一覧またはスポイトで選択する。
- `count` は `(params, data, binding) => number` の関数である。\
  戻り値は、Hierarchy に「名前 ×数」の形式で表示される。
- `slots` を `true` にすると、`setSlotKey` で Key を設定したオブジェクトを、Event Timeline で `名前 [Key]` として選択できる。

### props

| props | 型 | 説明 |
|---|---|---|
| `id` | 文字列 | シーン定義でのコンポーネントの ID |
| `name` | 文字列 | シーン定義でのコンポーネントの名前 |
| `params` | オブジェクト | パラメーターの値 |
| `binding` | オブジェクト | Binding の名前と、データ内のパスまたはオブジェクト名の対応 |
| `editing` | 真偽値 | エディタの Edit モードの間は `true` |

- `name` は、コンポーネントが配置するオブジェクトの名前の接頭辞に使用する（例: 「Items 1」「Items 2」）。\
  そのオブジェクトは、Empty の Parent やスポイトで、その名前で選択できる。
- `params` のうち、シーン定義にない値には既定値が設定される。
- `binding` には、未設定の Binding は含まれない。
- 編集中に停止させる動きは、`editing` を参照して停止する。

コンポーネントが例外を投げると、エディタの Console にエラーが表示され、そのコンポーネントのみが描画されなくなる。\
パラメーターまたは `content/` のファイルが変更されると、再度描画が試行される。\
Inspector の Enabled をオフにすると、コンポーネントは非表示になり、動作も停止する。

### シーンのオブジェクトとマテリアル

| API | 説明 |
|---|---|
| `useSceneObject(name)` | シーン内のオブジェクトを名前で取得する |
| `useSceneMaterial(id)` | シーンのマテリアルに対応する three.js のマテリアルを取得する |
| `useStageMaterial(object, id)` | シーンのマテリアルを、コンポーネントが読み込んだ glb に割り当てる |
| `useGltfAsset(path)` | `content/` 内の `.glb` を読み込む |
| `useAssetUrl(path)` | `content/` 内のファイルの URL を返す |

`useSceneObject(name)` の動作は次のとおりである。

- 対象は、glb の最上位のオブジェクト（Hierarchy の Models の下に表示される名前）、配置したモデル、Empty、コンポーネント、ライトである。
- 読み込みが完了するまでと、オブジェクトが見つからない場合は `null` を返す。
- 子孫のオブジェクトは、戻り値の `getObjectByName` や `traverse` で探索する。

`useSceneMaterial(id)` の動作は次のとおりである。

- 戻り値のマテリアルは、割り当てたすべてのオブジェクトで共有される。
- 組み込みのマテリアルの `color` や `emissiveIntensity` に、`useFrame` 内で書き込んで使用する。
- `create` 形式のシェーダーは割り当て先ごとに別のマテリアルとなるため、`null` を返す。

`useStageMaterial(object, id)` の動作は次のとおりである。

- `object` 内のすべてのメッシュに割り当てる。
- `create` 形式のシェーダーには、メッシュごとの元のマテリアルを `base` として渡す。
- `id` が空になるか、コンポーネントがアンマウントされると、元のマテリアルに戻す。

`useGltfAsset(path)` は、ファイルが変更されると再読み込みし、使用されなくなった以前のデータを GPU から解放する。\
読み込みが完了するまでは、Suspense で待機する。\
`useAssetUrl(path)` が返す URL は、ファイルが変更されると変化する。

`useSceneObject` で取得した glb のオブジェクトのマテリアルを書き換えると、同じ glb を使用する他のオブジェクトにも反映される。\
書き換えた値は、アンマウント時に元に戻す（例: サンプルの `src/components/Accent.tsx`）。

drei の `useGLTF` を直接使用すると、読み込んだ glb が GPU から解放されない。\
`.glb` は `useGltfAsset` で読み込む。

コンポーネントが `useGltfAsset` で読み込んだ glb には、Hierarchy の Material からマテリアルを割り当てられない。\
`material` 型のパラメーターを定義し、`useStageMaterial` で割り当てる。

```tsx
type ItemParams = { model: string; look: string };

function Item({ params }: StageComponentProps<ItemParams>) {
  const gltf = useGltfAsset(params.model);
  const obj = useMemo(() => gltf.scene.clone(), [gltf]);
  useStageMaterial(obj, params.look);
  return <primitive object={obj} />;
}

defineComponent<ItemParams>({
  type: 'sample.item',
  label: 'Item',
  params: {
    model: { type: 'asset', kind: 'glb', default: 'glb/item.glb', label: 'Model' },
    look: { type: 'material', default: '', label: 'Material' },
  },
  Component: Item,
});
```

### 表示とフェード

コンポーネント、モデル、ライトは、Activation Track の区間内のみ表示される。\
3D のオブジェクトは表示と非表示が切り替わるのみで、フェードしない。\
半透明で描画すると、描画の負荷が高くなるためである。

フェードさせる場合は、コンポーネントが `useActivation()` で区間の値を取得し、不透明度や拡大率に反映する。\
値は Fade In と Fade Out の間で 0〜1 の範囲で変化し、Track がない場合は 1 になる。\
区間内では値が 0 でも表示されているため、フェードアウトも実装できる。

```tsx
// コンポーネント内。mat は transparent: true のマテリアル
const activation = useActivation();
useFrame(() => {
  mat.opacity = activation.value('component:' + id);  // id は props の id
});
```

`value` に渡す対象は、次の形式で指定する。

| 形式 | 対象 |
|---|---|
| `component:<ID>` | コンポーネント |
| `object:<名前>` | モデル内のオブジェクト |
| `placed:<ID>` | 配置したモデル |
| `light:<ID>` | ライト |
| `ui:<名前>` | 2D UI のパーツ |

### 配置したオブジェクトの制御

| API | 説明 |
|---|---|
| `setSlotKey(obj, key)` | オブジェクトに、データの Key（一覧の要素の ID など）を設定する |
| `setDataVisible(obj, visible)` | データに基づいて、オブジェクトの表示と非表示を設定する |
| `setAnimationClips(obj, clips)` | Animation Track で再生できる Clip を、オブジェクトに設定する |

- `setSlotKey` は、定義の `slots: true` と組み合わせて使用する。
- `setDataVisible` は、一覧にない要素のオブジェクトを非表示にする場合などに使用する。\
  毎フレーム呼び出してよい。
- `setAnimationClips` には、glb から生成したオブジェクトの場合 `gltf.animations` を渡す。\
  glb のオブジェクトと配置したモデルには、ランタイムが Clip を設定する。

オブジェクトの `visible` には直接書き込まない。\
Activation Track と Event Timeline による表示と矛盾するためである。

## 2D UI

2D UI は、3D の上に重ねて表示する React のコンポーネントである。\
プロジェクトに 1 つのみ、`defineOverlay` で登録する。

2D UI は、高さ 1080 px のステージに描画される。\
幅はシーンの Aspect Ratio から算出され（16:9 の場合は 1920 px）、`useStageSize()` で取得できる。\
ランタイムは、ステージを表示領域に合わせて縮小する。

```tsx
// src/Overlay.tsx。src/register.ts から import './Overlay' で読み込む
import { defineOverlay, useActivationRef, useFollowRef } from '@three-stage/runtime';

function Overlay() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* overview の Activation Track の区間内のみ表示する */}
      <div ref={useActivationRef('overview')} style={{ position: 'absolute', left: 64, top: 48, fontSize: 48 }}>
        Overview
      </div>
      {/* Empty「Label A」の画面上の位置に配置し、その点の上に表示する */}
      <div ref={useFollowRef('Label A')}>
        <div style={{ transform: 'translate(-50%, -100%)', fontSize: 28 }}>A-03</div>
      </div>
    </div>
  );
}

defineOverlay({ Component: Overlay, parts: ['overview'] });
```

### 定義の項目

| 項目 | 型 | 説明 |
|---|---|---|
| `Component` | React コンポーネント | 2D UI のコンポーネント |
| `parts` | 文字列の配列 | Activation Track で表示を制御するパーツの名前 |

- `Component` の props の `data` は、受信したデータの `DataStore` である。
- エディタの Timeline は、`parts` から Activation Track の対象を選択する。\
  エディタでパーツを追加することはできない。

パーツの Activation Track の区間が、画面の切り替えの単位になる（例: 全体を表示している間は `overview`）。

### 2D UI の API

| API | 説明 |
|---|---|
| `useActivationRef(part)` | 要素をパーツ `part` として、Activation Track で表示を制御する |
| `useFollowRef(name)` | 要素を、指定した名前のオブジェクトの画面上の位置に移動する |
| `usePlayback()` | Timeline の再生状態を取得する |
| `useStageEnv()` | 描画の環境を取得する |
| `useStageSize()` | ステージの幅と高さ（px）を取得する |

`useActivationRef(part)` の動作は次のとおりである。

- 戻り値の関数を、要素の `ref` に渡す。
- ランタイムは、区間内のみ要素を表示し、Fade In と Fade Out の間は `opacity` を変化させる。
- Track のないパーツは、常に表示される。
- Event Timeline にのみ Track があるパーツは、その Event の再生中のみ表示される。

`useFollowRef(name)` の動作は次のとおりである。

- 戻り値の関数を、要素の `ref` に渡す。
- 対象は主に Empty である。
- 要素の左上が、オブジェクトの画面上の位置に一致する。
- オブジェクトがカメラの後方またはステージの外にある場合と、見つからない場合は、要素を非表示にする。

`usePlayback()` の値は毎フレーム変化するため、React で描画する内容は一定の間隔で参照する。\
`useStageEnv()` の `url(path)` は、`content/`（組み込み先ではバンドル）内のファイルの URL を返す。\
フォントのように、2D UI が独自に読み込むファイルに使用する。

位置と表示は毎フレーム変化するため、React の state にしない。\
ランタイムは、カメラを移動したのと同じフレーム内で、要素の `transform`、`opacity`、`visibility` に直接書き込む。\
2D UI 側で再生状態を参照して表示を切り替えると、カメラの切り替え中にラベルが残る。

`useActivationRef` と `useFollowRef` は、どちらも要素の `visibility` に書き込む。\
1 つの要素に両方を使用せず、要素を入れ子にして分ける。

### データの参照

受信したときのみ変化する値（数値の表示など）は、React の state にしてよい。\
`data.onReceive(f)` で受信のたびに値を取得し、state に保存する。\
エディタの Data タブで時刻を変更した場合は受信として扱われないため、サンプルの `src/Overlay.tsx` は一定の間隔でも値を取得し直している。

### クリック

2D UI の外側の要素には `pointer-events: none` が設定されている。\
クリックを受け付ける要素には、`pointerEvents: 'auto'` を指定する。

## シェーダー

ランタイムに組み込まれたマテリアルは、MeshStandardMaterial と MeshPhysicalMaterial である。\
その他の描画方法は、シェーダーとして登録する（Unity の Shader と Material の関係と同じ）。\
登録したシェーダーは、Assets の Materials の「＋」と、マテリアルの Type に表示される。\
作成したマテリアルは、他のマテリアルと同様に、glb のオブジェクトの Material でマテリアルスロットごとに割り当てる。

シェーダーの記述方法は 2 つある。

| 記述方法 | 用途 | 生成されるマテリアル |
|---|---|---|
| `vertexShader` と `fragmentShader` | ライトを受けないオブジェクト | three.js の `ShaderMaterial` |
| `create(uniforms, base)` | ライトと影を受けるオブジェクト | `create` が返すマテリアル |

- `vertexShader` と `fragmentShader` は、発光する線、画面、霧のような表現に適する。\
  `options` で、`transparent` や `side` などの `ShaderMaterial` の設定を指定できる。
- `create` は、three.js のマテリアル（`MeshStandardMaterial` を `onBeforeCompile` で書き換えたものなど）を生成して返す。\
  `base` は、割り当て先のマテリアルスロットの元のマテリアル（glb のマテリアル）である。

```ts
// src/shaders/Glow.ts。src/register.ts から import './shaders/Glow' で読み込む
import { defineShader } from '@three-stage/runtime';

defineShader({
  type: 'sample.glow',                         // 種類名
  label: 'Glow',                               // マテリアルの Type に表示する名前
  params: {                                    // コンポーネントと同じ形式。Inspector に入力欄が表示される
    color: { type: 'color', default: '#5B8DEF', label: 'Color' },
    pulse: { type: 'number', default: 1, min: 0, max: 4, label: 'Pulse' },
  },
  binding: { level: 'data' },                  // データ内の数値を、同じ名前の uniform に渡す
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 color;
    uniform float pulse;
    uniform float level;
    uniform float uTime;
    void main() {
      float k = 0.5 + 0.5 * sin(uTime * pulse);
      gl_FragColor = vec4(color * (1.0 + level / 100.0 * k), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
```

`create` を使用する例は、サンプルの `src/shaders/Grid.ts` にある。

陰影の付け方のみを変更し、glb の色とテクスチャをそのまま使用する場合は、`base` を複製して書き換える。\
同じマテリアルを色の異なる複数のマテリアルスロットに割り当てても、それぞれの元の色とテクスチャが維持される。\
Unity で Shader を切り替えても、同じ名前のプロパティが引き継がれるのと同じである。

```ts
// src/shaders/Bands.ts。光の当たり方を階段状にする
import * as THREE from 'three';
import { defineShader } from '@three-stage/runtime';

defineShader({
  type: 'sample.bands',
  label: 'Bands',
  params: { steps: { type: 'number', default: 3, min: 1, max: 8, step: 1, label: 'Steps' } },
  create(uniforms, base) {
    const mat = base?.clone() ?? new THREE.MeshStandardMaterial();
    mat.customProgramCacheKey = () => 'sample.bands';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float steps;')
        .replace(
          '#include <lights_fragment_end>',
          '#include <lights_fragment_end>\nreflectedLight.directDiffuse = floor(reflectedLight.directDiffuse * steps + 0.5) / steps;',
        );
    };
    return mat;
  },
});
```

### `create` と `base` の規則

- `create` は、元のマテリアルごとに 1 回呼び出される。\
  すべての呼び出しで `uniforms` を共有する。\
  パラメーターを変更しても再度呼び出されず、uniform の値のみが更新される。
- `base` は、他のマテリアルスロットと共有されている。\
  `clone()` してから書き換え、`base` 自体は書き換えず、戻り値にもしない。
- マテリアルスロットのない対象（元のマテリアルがない対象）に割り当てた場合、`base` は `undefined` になる。
- マテリアルは、元のマテリアルの数だけ生成される。\
  シェーダープログラムは three.js が同じ書き換えをまとめるため、draw call は増えない。
- three.js は、`onBeforeCompile` の関数のソースが同じマテリアルに、同じシェーダープログラムを再利用する。\
  関数を複製して GLSL の文字列のみを変更すると、別のシェーダーのプログラムで描画される。\
  `customProgramCacheKey` で種類名を返して区別する。
- ランタイムが解放するのは、`create` が返したマテリアルのみである（`dispose()`）。\
  `create` 内で生成したテクスチャやレンダーターゲットは、返すマテリアルの `dispose` を上書きして一緒に解放する。

### uniform

`params` と `binding` の名前は、そのまま同じ名前の uniform になる。\
型は [パラメーターの定義](#パラメーターの定義) の表のとおりである。\
`binding` の値は数値に変換され、`float` として渡される（数値でない場合は 0）。

| 項目 | 説明 |
|---|---|
| `uTime` | ランタイムが毎フレーム渡す経過秒数。Pause（❚❚）の間は停止する |
| `uniforms` | `params` 以外の uniform と、その初期値 |
| `update(uniforms, data, dt)` | 毎フレーム、`binding` の値を書き込んだ後に呼び出される関数 |

- `params` 以外の uniform は、`uniforms` に初期値を記述して事前に作成する。\
  three.js は、後から追加された uniform を GPU に送らない。
- `update` では、データから JavaScript で計算した値を uniform に書き込む。\
  ミリ秒単位の時刻のような大きな数値は、GPU の float では精度が不足するため、`update` で時間帯などに変換する。

### 描画の規則

| 項目 | 規則 |
|---|---|
| 色の出力 | `gl_FragColor` の後に `#include <tonemapping_fragment>` と `#include <colorspace_fragment>` を記述する |
| 影 | `vertexShader` で変形した形状は、影にも反映される |
| コードの更新 | 保存すると、エディタが再読み込みし、新しいシェーダーで描画する |
| 未登録の種類 | ピンクで描画され、Console に警告が表示される |
| コンパイルエラー | Console にエラーが表示され、そのオブジェクトは描画されない |

色の出力の 2 行は、`vertexShader` と `fragmentShader` で記述する場合に必要である。\
記述しないと、ポストプロセスを使用しないシーンで色が暗くなる。

影は、形状と同じ頂点シェーダーで描画される（ランタイムが影用のマテリアルを生成する）。\
対象は DirectionalLight と SpotLight の影のみである。\
次の場合、影は元の形状のまま描画される。

- PointLight の影
- `create` で形状を変形した場合
- マテリアルスロットが 2 つ以上あるメッシュで、スロットごとに異なるシェーダーを割り当てた場合（three.js の影用のマテリアルはメッシュに 1 つのため）

## ポストエフェクト

ランタイムに組み込まれたポストエフェクトは、Bloom、Vignette、FXAA、SMAA である。\
その他のエフェクトは、ポストエフェクトとして登録する。\
登録したエフェクトは、Environment の Post Processing の Add に表示される。

```ts
// src/effects/Sepia.ts。src/register.ts から import './effects/Sepia' で読み込む
import { definePostEffect } from '@three-stage/runtime';

definePostEffect({
  type: 'sample.sepia',
  label: 'Sepia',
  stage: 'display',                            // トーンマッピングの後。'hdr' の場合は前
  params: { amount: { type: 'number', default: 0.5, min: 0, max: 1, label: 'Amount' } },
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 sepia = vec3(dot(c.rgb, vec3(0.393, 0.769, 0.189)), dot(c.rgb, vec3(0.349, 0.686, 0.168)), dot(c.rgb, vec3(0.272, 0.534, 0.131)));
      gl_FragColor = vec4(mix(c.rgb, sepia, amount), c.a);
    }`,
});
```

`binding` と `update` を使用する例は、サンプルの `src/effects/Tint.ts` にある。

### 定義の項目

| 項目 | 型 | 説明 |
|---|---|---|
| `type` | 文字列 | 種類名 |
| `label` | 文字列 | エディタに表示する名前 |
| `stage` | 文字列 | 適用する段階。`'hdr'` または `'display'` |
| `params`、`binding`、`uniforms`、`update` | — | シェーダーと同じ |
| `fragmentShader` | 文字列 | 画面全体に 1 回適用する GLSL |
| `create(uniforms)` | 関数 | `fragmentShader` の代わりに、three.js の Pass を生成して返す |

### 適用の順序

ポストエフェクトは、次の順に適用される。

1. Bloom
2. `stage` が `hdr` のエフェクト
3. トーンマッピングと Vignette
4. `stage` が `display` のエフェクト
5. FXAA
6. SMAA

`hdr` の段階では、色は 1 を超える明るさを保持している。\
`display` の段階では、色は画面に表示する 0〜1 の値である。\
組み込みのエフェクトの位置は固定である。\
登録したエフェクトは、同じ `stage` の中で、Post Processing に並べた順に適用される。

### uniform

シェーダーと同様に、`params` と `binding` の名前の uniform、`uTime`、`uniforms` に記述した uniform を使用できる。\
ほかに、次の値を使用できる。\
使用するもののみを宣言する。

| 名前 | 型 | 説明 |
|---|---|---|
| `tDiffuse` | `sampler2D` | 前の段階までの画像 |
| `vUv` | `vec2`（varying） | 画面上の位置 |
| `uFrame` | `vec4` | 出力範囲 |

`uFrame` は、組み込み先に表示される範囲である。\
キャンバス全体を 0〜1 として、xy が出力範囲の左下、zw が幅と高さを表す。\
エディタの Edit モードでは、キャンバスが出力範囲より大きい。\
周辺を暗くするような、出力範囲を基準にするエフェクトは、`uFrame` で出力範囲内の位置に変換する。

### 規則

- 複数回描画するエフェクトは、`create(uniforms)` で three.js の Pass を生成して返す。
- `ShaderPass` には、`uniforms` をそのまま渡した `ShaderMaterial` を渡す。\
  uniform の定義（`{ uniforms: … }`）を渡すと、three.js が値を複製するため、パラメーターと Binding の変更が反映されない。
- `create` で `tDiffuse` を受け取るには、`uniforms` に `tDiffuse: null` を記述する。
- ランタイムが解放するのは、`create` が返した Pass のみである。
- 未登録の種類は適用されず、Console に警告が表示される。

## Trigger

Trigger は、Event Timeline を再生する条件である（Event Timeline の操作は [studio.md](studio.md) を参照）。\
よく使用する条件はランタイムに登録済みで、エディタでパラメーターを入力して使用する。\
それ以外の条件（複数の値の組み合わせ、時間の幅の判定など）は、プロジェクトのコードで登録する。

| Trigger | 種類名 | 動作 |
|---|---|---|
| None | `none` | データでは再生しない |
| List Change | `stage.listChange` | 一覧の要素の値が変化したとき、その要素の Key で再生する |
| その他 | プロジェクトで定義 | `defineTrigger` で登録する |

None の Event Timeline は、組み込み先のコードが名前で呼び出したときと、エディタの Inspector の Play で再生される。

List Change のパラメーターは次のとおりである。

| パラメーター | 既定値 | 説明 |
|---|---|---|
| List | なし | 一覧のパス |
| Key | `id` | 要素を区別するフィールドの名前 |
| Field | なし | 変化を検出するフィールドの名前 |
| From | なし | 変化前の値 |
| To | なし | 変化後の値 |

- Field の値が From から To に変化したとき、その要素の Key で再生する。
- From と To が空の場合は、任意の値から任意の値への変化で再生する。
- From を指定すると、前回の受信になかった要素（一覧に追加された要素や、前回の受信で一時的に含まれなかった要素）では再生しない。

```ts
// src/triggers/LevelReached.ts。src/register.ts から import './triggers/LevelReached' で読み込む
import { defineTrigger } from '@three-stage/runtime';

type Frame = { items: { id: string; level?: number }[] };

defineTrigger<{ level: number }>({
  type: 'sample.levelReached',                  // 種類名
  label: 'Level Reached',                       // Trigger の Type に表示する名前
  params: { level: { type: 'number', default: 80, min: 0, max: 100, unit: '%', label: 'Level' } },
  // 前回の受信と今回の受信を比較し、出来事が起きた要素の Key を返す
  detect(prev, next, p) {
    const before = new Map((prev as Frame).items.map((e) => [e.id, e.level ?? 0] as const));
    return (next as Frame).items.filter((e) => (before.get(e.id) ?? 0) < p.level && (e.level ?? 0) >= p.level).map((e) => e.id);
  },
  keys: (data) => (data as Frame).items.map((e) => e.id),  // エディタで手動で再生するときの Key の候補
});
```

| 項目 | 説明 |
|---|---|
| `detect(prev, next, params)` | 前回と今回のデータを比較し、再生する Key の配列を返す |
| `keys(data, params)` | 現在のデータに含まれる Key の配列を返す |

- `detect` は、受信のたびに呼び出される。\
  最初の受信と、エディタの Data タブで時刻を変更したときは呼び出されない。
- 要素に対応しない出来事の場合、`detect` は `['']` を返す。
- `detect` が例外を投げると、Console にエラーが表示される。
- `keys` の戻り値は、エディタで Event を手動で再生するときの候補になる。

1 回の受信で複数の Key を返すと、Key ごとに Event Timeline が再生される。\
組み込み先から Event を名前で直接再生するには、`EventStore` の `fire(name, key)` を使用する（[組み込み先に渡すコンポーネント](#組み込み先に渡すコンポーネント)）。

## カメラの動き

Camera は、Viewport で設定した Position、Target、FOV を基準とし、Motion によってショットの間も動作し続ける。\
Motion が None の場合、カメラは基準の位置で静止する。\
エディタで新しく追加したカメラには、Drift が設定される。

| Motion | 種類名 | 動作 |
|---|---|---|
| None | なし | 静止する |
| Drift | `stage.drift` | 基準の位置の周囲を、ゆっくり往復し続ける |
| その他 | プロジェクトで定義 | `defineCameraMotion` で登録する |

Drift のパラメーターは次のとおりである。

| パラメーター | 既定値 | 説明 |
|---|---|---|
| Orbit | 6° | Target を中心とする方位角の振れ幅 |
| Tilt | 0.6° | 仰角の振れ幅 |
| Distance | 5% | Target までの距離の振れ幅 |
| Sway | 0 m | 水平方向の平行移動の振れ幅 |
| Heave | 0 m | 垂直方向の平行移動の振れ幅 |
| Period | 30 秒 | 最も長い往復の周期 |

Drift は周期の異なる正弦波を重ねるため、同じ形の繰り返しに見えにくい。\
長時間再生しても、基準の位置から離れない。

```ts
// src/motions/EachItem.ts。src/register.ts から import './motions/EachItem' で読み込む
import * as THREE from 'three';
import { defineCameraMotion } from '@three-stage/runtime';

const _p = new THREE.Vector3();
const _offset = new THREE.Vector3();

// 名前が「Item 1」「Item 2」…のオブジェクトを、同じ向きと距離のまま順に 1 つずつ映す
defineCameraMotion<{ prefix: string }>({
  type: 'sample.eachItem',                       // 種類名
  label: 'Each Item',                            // Motion の Type に表示する名前
  params: { prefix: { type: 'text', default: 'Item ', label: 'Prefix' } },
  // out には基準の値が設定されている。書き換えた値が、このフレームのカメラになる
  apply(out, ctx, p) {
    const items = ctx.findAll(p.prefix);
    if (!items.length) return;
    const k = Math.min(items.length - 1, Math.floor((ctx.t / ctx.length) * items.length));
    items[k].getWorldPosition(_p);
    _offset.subVectors(out.position, out.target);  // Target からの向きと距離
    out.target.copy(_p);
    out.position.copy(_p).add(_offset);
  },
});
```

`apply(out, ctx, params)` の引数は次のとおりである。

| 名前 | 型 | 説明 |
|---|---|---|
| `out` | オブジェクト | このフレームのカメラ。`position`、`target`、`fov` を持つ |
| `ctx.time` | 数値 | Timeline の先頭からの秒数。ループしても戻らない |
| `ctx.t` | 数値 | このカメラへの切り替えの開始からの秒数 |
| `ctx.length` | 数値 | 切り替えの開始から、次のカメラへの切り替えの完了までの秒数 |
| `ctx.base` | オブジェクト | 基準の値（`out` と同じ形式） |
| `ctx.data` | 任意 | 現在のデータ |
| `ctx.find(name)` | 関数 | 指定した名前のオブジェクトを返す。見つからない場合は `null` |
| `ctx.findAll(prefix)` | 関数 | 名前が `prefix` で始まるオブジェクトの配列を返す |
| `params` | オブジェクト | Inspector で設定したパラメーター |

- `out` の `position` と `target` は `THREE.Vector3` である。\
  `out` には基準の値が設定されている。\
  Target にオブジェクトを指定している場合、`target` はそのオブジェクトの位置である。
- `ctx.time` は、ゆっくりした揺れのような、ショットをまたいで継続する動きに使用する。
- `ctx.t` は、前のカメラからのブレンドの開始から数える。
- ショットの中で順に対象を切り替える場合は、`ctx.t / ctx.length` を使用する。
- `ctx.base` は書き換えない。
- `ctx.findAll` は、名前に含まれる番号の順に返す（「Item 2」が「Item 10」より前）。\
  一致したオブジェクトの子は探索しない。\
  オブジェクトの数はデータに応じて増減してよく、1 秒以内に反映される。

カメラの位置は、時刻、データ、オブジェクトの位置のみから算出し、前のフレームの値を引き継がない。\
ブレンド中は、前のカメラと次のカメラの両方を毎フレーム計算して混合するため、切り替えの完了時に動きが不連続にならない。\
エディタで Timeline の目盛りをドラッグした場合も、再生した場合と同じく、その時刻の位置になる。

`apply` は毎フレーム呼び出される（ブレンド中は、前後 2 つのカメラの分）。\
ベクトルは関数の外で生成して再利用し、毎フレーム生成しない。

未登録の Motion を指定したカメラは、基準の位置で静止したまま描画される。

## データ

### データの受け渡し

エディタとランタイムは、データの形式を規定しない。\
扱うのは、組み込み先から渡される JSON の値と、その中の位置を指すパスのみである。\
データの形式（TypeScript の型）とモックデータは、プロジェクトで定義する（例: サンプルの `src/data.ts` と `src/mock/index.ts`）。

組み込み先では、`StageView` の `data` に現在のデータを、`receivedAt` に受信した時刻（エポックミリ秒）を渡す。\
`receivedAt` が変化すると受信として扱われ、`useReceive` の関数と Trigger の `detect` が呼び出される。\
エディタでは、登録したモックデータを Data タブで再生する。

| API | 説明 |
|---|---|
| `useStageData()` | 受信したデータの `DataStore` を返す |
| `useReceive(f)` | 受信のたびに `f(value, receivedAt)` を呼び出す |
| `getPath(data, path)` | パスで指定した値をデータから取得する。存在しない場合は `undefined` |

- `DataStore` の `.value` は最新のデータ、`.receivedAt` は受信した時刻である。\
  再描画は発生しないため、`useFrame` 内で参照する。
- `useReceive` に渡す `f` は、`useCallback` で固定する。

### パスの記述方法

Binding と `getPath` は、次の形式のパスでデータ内の位置を指定する。

| 形式 | 意味 |
|---|---|
| `total.value` | オブジェクトのフィールドを `.` で区切ってたどる |
| `items[3]` | 配列の番号（0 から） |
| `items[id=A-03]` | 配列の中で、フィールド `id` の値が `A-03` の要素 |
| `items[id=A-03].value` | 上記の組み合わせ |

- `[フィールド=値]` の値は、文字列として比較される。\
  `id` 以外のフィールドも指定できる。
- 順序が保証されないデータには、番号（`items[3]`）ではなく `[id=…]` を使用する。

Inspector の Binding は、現在のデータに含まれる数値と文字列のパスを候補として表示する。\
`id` を持つ要素の配列は `[id=…]` の形式で、それ以外の配列は番号で表示し、配列の長さ（`items.length`）も候補に含める。\
配列の候補は、先頭の 16 要素までである。

### モックデータ

モックデータは、エディタで組み込み先のデータの代わりに使用するデータである。\
`defineMockData` で 1 つのみ登録し、`src/stage.ts` から読み込む。\
Data タブの時刻と速度は、`sample` に渡す時刻を変更するのみである。

```ts
// src/mock/index.ts。src/stage.ts から import './mock' で読み込む
import { defineMockData, todayAt } from '@three-stage/runtime';
import type { Frame } from '../data';

// 1 分ごとに受信する架空の 1 日
const receivedAt = (minutes: number) => Math.floor(minutes);

function frameAt(m: number): Frame {
  return { measuredAt: todayAt(m), items: [{ id: 'A-03', value: 50 + 40 * Math.sin((m / 1440) * Math.PI * 2) }] };
}

// 組み込み先でモックデータを使用するための関数
export function mockFrameAt(minutes: number): Frame {
  return frameAt(receivedAt(minutes));
}

defineMockData({
  variantLabel: 'Variant',
  variants: [{ id: 'default', label: 'Default' }],
  sample(minutes) {
    const at = receivedAt(minutes);
    return { value: frameAt(at), receivedAt: at };
  },
  summary: (value) => `A-03 ${Math.round((value as Frame).items[0].value)}`,
});
```

| 項目 | 型 | 説明 |
|---|---|---|
| `variants` | 配列 | Data タブで切り替えるモックデータの種類。各要素は `id` と `label` を持つ |
| `variantLabel` | 文字列 | `variants` の選択欄の名前 |
| `sample(minutes, variant)` | 関数 | 指定した時刻までに受信した値と、受信した時刻を返す |
| `summary(value)` | 関数 | 受信した値の要約を返す。Data タブと Console に表示される |

- `sample` の `minutes` は、0 時からの分数である。
- `sample` は `{ value, receivedAt }` を返す。\
  `receivedAt` も 0 時からの分数で、この値が変化すると受信として扱われる。

`todayAt(minutes)` は、当日の 0 時から `minutes` 分後の時刻（エポックミリ秒）を返す。\
モックデータ内の時刻の生成に使用する。

`three-stage build` は、`src/mock/index.ts` がある場合、`<パッケージ名>/mock` として書き出す。\
組み込み先でモックデータを使用できるように、`mockFrameAt` のような通常の関数をエクスポートする。\
`defineMockData` の戻り値はエクスポートしない。\
生成される `.d.ts` がランタイムの型を参照し、組み込み先で型の検査が失敗するためである。

## ランタイム API 一覧

プロジェクトのコードから使用する、`@three-stage/runtime` のエクスポートの一覧である。\
シグネチャと詳細な動作は、ランタイムのソース（`packages/runtime/src/`）の TSDoc に記載されている。

### 登録

| API | 説明 |
|---|---|
| `defineComponent(def)` | コンポーネントを登録する |
| `defineOverlay(def)` | 2D UI を登録する（プロジェクトに 1 つ） |
| `defineShader(def)` | シェーダーを登録する |
| `definePostEffect(def)` | ポストエフェクトを登録する |
| `defineTrigger(def)` | Trigger を登録する |
| `defineCameraMotion(def)` | カメラの動きを登録する |
| `defineMockData(def)` | モックデータを登録する（プロジェクトに 1 つ） |

型として、`ParamDef`、`ComponentDef`、`StageComponentProps`、`OverlayDef`、`OverlayProps`、`ShaderDef`、`ShaderUniforms`、`PostEffectShaderDef`、`TriggerDef`、`CameraMotionDef`、`CameraMotionContext`、`MockDataDef` をエクスポートする。

### データ

| API | 説明 |
|---|---|
| `useStageData()` | 受信したデータの `DataStore`（`.value`、`.receivedAt`、`.onReceive(f)`）を返す |
| `useReceive(f)` | 受信のたびに `f(value, receivedAt)` を呼び出す |
| `getPath(data, path)` | パスで指定した値を取得する |
| `listPaths(data)` | データに含まれる数値と文字列のパスの一覧を返す（Inspector の Binding の候補と同じ） |
| `todayAt(minutes)` | 当日の 0 時から `minutes` 分後の時刻（エポックミリ秒）を返す |

### シーン

| API | 説明 |
|---|---|
| `useSceneObject(name)` | シーン内のオブジェクトを名前で取得する |
| `useSceneMaterial(id)` | シーンのマテリアルに対応する three.js のマテリアルを取得する |
| `useStageMaterial(object, id)` | シーンのマテリアルを、コンポーネントが読み込んだ glb に割り当てる |
| `useGltfAsset(path)` | `content/` 内の `.glb` を読み込む |
| `useAssetUrl(path)` | `content/` 内のファイルの URL を返す |
| `disposeObject(root)` | `root` 以下のメッシュのジオメトリ、マテリアル、テクスチャを解放する |
| `useSkyBlend()` | 空の Blend を制御するオブジェクトを返す |
| `useStageEnv()` | 描画の環境を返す |

`useSkyBlend()` の戻り値は次の項目を持つ。

| 項目 | 説明 |
|---|---|
| `.value` | コードから設定する Blend（0〜1）。`null` の場合は Inspector の Blend が使用される |
| `.applied` | 現在適用されている Blend |

- `.value` には、`useFrame` 内で書き込む。\
  0 で HDRI、1 で HDRI B になり、中間の値では 2 つが混合される。
- エディタの Edit モードでは、`.value` は使用されない。
- `.applied` は、太陽の強さなどを空に合わせる場合に参照する。

`useStageEnv()` の戻り値は次の項目を持つ。

| 項目 | 説明 |
|---|---|
| `url(path)` | `content/` 内のパスを URL に変換する |
| `log(level, text)` | エディタの Console にメッセージを表示する。`level` は `'info'`、`'warn'`、`'error'` のいずれか |
| `editing` | エディタの Edit モードの間は `true` |
| `settings` | ビューアの設定 |
| `render` | 開いているシーンの `render` の設定 |

### 再生と表示

| API | 説明 |
|---|---|
| `usePlayback()` | Timeline の再生状態を返す |
| `useActivation()` | Activation Track の現在の値を返す |
| `setDataVisible(obj, visible)` | データに基づいて、オブジェクトの表示と非表示を設定する |
| `setSlotKey(obj, key)` | 配置したオブジェクトに、データの Key を設定する |
| `setAnimationClips(obj, clips)` | Animation Track で再生できる Clip を、オブジェクトに設定する |
| `useEvents()` | `EventStore` を返す。`fire(name, key)` で Event を名前で再生する |

`usePlayback()` の戻り値は次の項目を持つ。\
再描画は発生しないため、`useFrame` 内で参照する。

| 項目 | 型 | 説明 |
|---|---|---|
| `t` | 数値 | Timeline の先頭からの秒数。ループしても戻らない |
| `cameraId` | 文字列 | 現在のカメラの ID。最初のフレームの前は `null` |
| `blending` | 真偽値 | 次のカメラへの切り替え中かどうか |
| `playing` | 真偽値 | Timeline が進行しているかどうか |

ループ内の時刻は、`t` を Camera Track の合計の長さで割った余りである。

`useActivation()` の `.value(target)` は、`useFrame` 内で呼び出す。\
Track がない対象では 1 を返す。\
Event Timeline にのみ Track がある対象では、Event の再生外で 0 を返す。

### 2D UI

| API | 説明 |
|---|---|
| `useActivationRef(part)` | 要素をパーツとして、Activation Track で表示を制御する |
| `useFollowRef(name)` | 要素を、オブジェクトの画面上の位置に移動する |
| `useStageSize()` | ステージの幅と高さ（px）を返す |

### 組み込み用

| API | 説明 |
|---|---|
| `StageView` | Publish したシーンを、エディタの Play と同じ描画と動作で表示する React コンポーネント |
| `EventStore` | Event を名前で再生する（`fire(name, key)`）。`StageView` の `events` に渡す |

この表にないエクスポート（`SceneContent`、`StageCanvas`、各 Director、`registry`、`normalizeScene` など）は、`StageView` の構成要素と、エディタが使用するものである。

## 登録したコードの書き出し

### パッケージとバンドル

組み込み先に渡す成果物は 2 つあり、変更した内容によって差し替える成果物が異なる。

| 成果物 | 作成方法 | 内容 |
|---|---|---|
| パッケージ | `three-stage build` | `src/index.ts` から読み込んだコードとランタイム |
| バンドル | エディタの Publish、または `three-stage publish` | シーン定義と、シーンが使用するアセット |

- パッケージには、コンポーネント、2D UI、シェーダー、ポストエフェクト、Trigger、カメラの動きのコードが含まれる。\
  `src/mock/index.ts` がある場合は、`<パッケージ名>/mock` も含まれる。
- バンドルに含まれる登録の情報は、種類名、パラメーター、Binding、パラメーターが参照するファイルのみである。

コードを変更した場合は、パッケージを再作成し、組み込み先で再インストールする。\
配置、パラメーター、Timeline のみを変更した場合は、バンドルを差し替えればよい。\
バンドルはコードを含まず、ランタイムはシーン定義からコードを実行しない。\
そのため、組み込み先が CSP を設定していても動作する。

パッケージとバンドルの構成と、組み込み先での使用方法は [scene-format.md](scene-format.md) を参照。

### Publish の検査

Publish は、シーン定義が未登録の種類（マテリアルのシェーダー、ポストエフェクト、コンポーネント、Trigger、カメラの Motion）を参照している場合、エラーになる。\
`asset` のパラメーターが参照するファイルが `content/` にない場合も、エラーになる。

エディタの Publish は、エディタに読み込まれている登録で検査する。\
`three-stage publish` は、パッケージのエントリーポイント（`src/index.ts`。ない場合は `src/stage.ts`）を Node で読み込み、登録を収集する。\
そのため、`src/stage.ts` からのみ読み込まれる登録は、`three-stage publish` では未登録として扱われる。

エントリーポイントを読み込めない場合も、`three-stage publish` はエラーになる。\
たとえば、ブラウザにのみ存在する `window` や `document` を、モジュールの読み込み時に参照している場合である。\
`window` や `document` は、コンポーネント内や `useEffect` 内で参照する。

### 組み込み先に渡すコンポーネント

`src/index.ts` は、組み込み先で使用する React コンポーネントをエクスポートする。\
このコンポーネントは、Publish したバンドルとデータを `StageView` に渡す。

```tsx
// src/MyStage.tsx。src/index.ts から export { MyStage } from './MyStage' でエクスポートする
import { useImperativeHandle, useState, type Ref } from 'react';
import { EventStore, StageView } from '@three-stage/runtime';
import type { Frame } from './data';
import { registered } from './register';

void registered;  // 登録を読み込ませる

export interface MyStageHandle {
  /** Event を名前で再生する。key は配置したオブジェクトの Key */
  fire(name: string, key?: string): void;
}

export interface MyStageProps {
  /** Publish した manifest.json の URL */
  bundle: string;
  /** 受信したデータ。新しい値を受信するたびに置き換える */
  data: Frame | null;
  ref?: Ref<MyStageHandle>;
}

export function MyStage({ bundle, data, ref }: MyStageProps) {
  const [events] = useState(() => new EventStore());  // 再生成しない
  useImperativeHandle(ref, () => ({ fire: (name, key) => events.fire(name, key) }), [events]);
  return <StageView bundle={bundle} data={data} receivedAt={data?.measuredAt ?? null} events={events} />;
}
```

エクスポートするコンポーネントの props の型には、ランタイムの型を使用しない。\
ランタイムはパッケージに含まれるため、組み込み先にはランタイムの型定義がない。\
props の説明は TSDoc に記述する。\
TSDoc はパッケージの `.d.ts` に残り、組み込み先のエディタで参照できる。

### `StageView` の props

| props | 型 | 既定値 | 説明 |
|---|---|---|---|
| `bundle` | 文字列 | なし | Publish で書き出した `manifest.json` の URL |
| `data` | JSON で表せる値 | なし | シーンに渡すデータ |
| `receivedAt` | 数値 | なし | データを受信した時刻（エポックミリ秒） |
| `events` | `EventStore` | 内部で生成 | Event を名前で再生するためのストア |
| `settings` | オブジェクト | 下表 | ビューアの設定 |
| `overlay` | 真偽値 | `true` | 2D UI を表示するかどうか |
| `className` | 文字列 | なし | 最も外側の要素のクラス名 |

`settings` は次の項目を持つ。\
指定した項目のみが既定値を上書きする。

| 項目 | 既定値 | 説明 |
|---|---|---|
| `quality` | `'high'` | 品質。`'high'` または `'low'` |
| `resolution` | `'1080p'` | 描画解像度。`'1080p'`、`'720p'`、`'auto'`（動的解像度）のいずれか |
| `limitFps` | `true` | フレームレートを 30fps に制限するかどうか |

`bundle` の代わりに、`content/` からシーンを直接読み込むための `sceneUrl`、`contentBase`、`decoders` と、シーン定義を直接渡す `scene` も指定できる。
