# プロジェクトのコードの書き方

プロジェクトの `src/` に書くコード（コンポーネント、2D UI、シェーダー、ポストエフェクト、Trigger、カメラの動き、モックデータ）の書き方と、ランタイム（`@three-stage/runtime`）の API をまとめる。
TypeScript、React、React Three Fiber（R3F）、three.js でコードを書く人に向けた文書である。
シーンファイル（`*.stage.json`）の形式と、組み込み先の Web アプリケーション（以下、組み込み先）への組み込み方は [scene-format.md](scene-format.md) にある。

## 概要

### コードの置き場所

プロジェクトのコードは `src/` に置く。
役割が決まっているファイルは次の4つ。

| ファイル | 役割 |
|---|---|
| `src/stage.ts` | スタジオが読み込む入口。`src/register.ts` とモックデータ（`src/mock/`）を読み込む。プロジェクトのフォルダに必須 |
| `src/register.ts` | 組み込み先にも含める登録をまとめる。コンポーネント、2D UI、シェーダー、ポストエフェクト、Trigger、カメラの動きを書いたファイルを、ここから `import` する |
| `src/index.ts` | `three-stage build` が作るパッケージの入口。組み込み先に渡す React コンポーネントと、データの型を export する |
| `src/mock/index.ts` | モックデータ。`src/stage.ts` から読み込む。パッケージの本体には含めず、`<パッケージ名>/mock` として別に書き出す |

残りのファイル（`src/components/`、`src/shaders/`、`src/effects/` など）は自由に分けてよい。
Sample のプロジェクト（`three-stage new <フォルダ> --template sample`）の `src/` が、すべての種類の登録を含む例になっている。

`src/register.ts` から読み込まなかった登録は、スタジオでは使えても、パッケージに含まれない。
`three-stage publish` もパッケージの入口（`src/index.ts`）から登録を集めるので、そうした登録を使うシーンは Publish できない。

`src/index.ts` は、`src/register.ts` が export する値（Sample とひな形では `registered`）を参照して、登録を読み込ませる。
`import './register'` とだけ書くと、生成した `.d.ts` にその行が残り、組み込み先がランタイムの型を探すことになるためである。

### 登録の仕組み

コードは、ランタイムの `define〜` 関数で種類（type）ごとに登録する。
スタジオは登録された種類を一覧に表示し、パラメーターの入力欄を `params` の定義から作る。
シーンファイルに保存するのは、種類の名前とパラメーターの値だけで、コードは含まない。

| 登録する関数 | 登録するもの | スタジオで表示する場所 |
|---|---|---|
| `defineComponent` | コンポーネント | Hierarchy の「＋」 |
| `defineOverlay` | 2D UI（1つだけ） | Viewport の上。部品は Timeline の Activation Track の対象 |
| `defineShader` | シェーダー（マテリアルの種類） | Assets の Materials の「＋」と、マテリアルの Type |
| `definePostEffect` | ポストエフェクト | Environment の Post Processing の Add |
| `defineTrigger` | Event の Timeline を再生する条件 | Event の Timeline の Trigger の Type |
| `defineCameraMotion` | カメラの動き | Camera の Motion の Type |
| `defineMockData` | スタジオで流すモックデータ（1つだけ） | Data タブ |

- 種類の名前（`type`）には、プロジェクトの名前を頭に付ける（`sample.flow` など）。`stage.` はランタイムの組み込みの種類が使う。
- 同じ種類をもう一度登録すると、前の登録を置き換える。`src/` のファイルを保存すると、スタジオはコードを読み直し、一覧とパネルを更新する。
- `label` はスタジオに表示する名前。省くと `type` を表示する。コンポーネントを置いたときの名前も `label` から付ける。
- 組み込みのマテリアル（`standard`、`physical`）や組み込みのポストエフェクト（`bloom`、`vignette`、`fxaa`、`smaa`）と同じ名前のシェーダーとポストエフェクトは登録できない。ブラウザのコンソールにエラーを出力する。

### import できるモジュール

`src/` から import できるのは、次のパッケージ（とそのサブパス）と、プロジェクトの中のファイルである。

- `@three-stage/runtime`
- `react`、`react-dom`
- `three`（`three/examples/jsm/...` を含む）
- `@react-three/fiber`、`@react-three/drei`

プロジェクトは `node_modules` を含まない。
これらはアプリの側のものを使い、型の確認もアプリの側の型で行う（`three-stage typecheck <フォルダ>`）。
パッケージにするとき、ランタイムはパッケージの中にまとめ、ほかのパッケージは組み込み先のものを使う（peerDependencies）。

### パラメーターの定義

コンポーネント、シェーダー、ポストエフェクト、Trigger、カメラの動きは、どれも `params` で同じ形のパラメーターを定義する。
Inspector はパラメーターごとに入力欄を表示し、値はシーンファイルに保存する。
すべての型で `default`（既定値）は必須、`label`（Inspector に表示する名前）は任意である。
`label` を省くと、`params` のキーの名前を表示する。

| `type` | 値 | ほかの項目 | シェーダーとポストエフェクトでの uniform |
|---|---|---|---|
| `number` | 数 | `min`、`max`、`step`、`unit`（値と一緒に表示する単位） | float |
| `color` | `#RRGGBB` の文字列 | — | vec3（`THREE.Color`） |
| `boolean` | 真偽 | — | bool |
| `select` | `options` のどれか | `options`（必須） | int（`options` の中の番号） |
| `text` | 文字列 | — | なし |
| `asset` | `content/` の中のパス | `kind`（`'glb'` か `'texture'`。必須）、`srgb` | `kind: 'texture'` は sampler2D（`THREE.Texture`）。`glb` はなし |
| `object` | シーンのオブジェクトの名前。Inspector の一覧かスポイトで選ぶ | — | なし |
| `material` | シーンのマテリアルの id。Assets の Materials の一覧から選ぶ | — | なし |

`srgb: true` は色の画像に付ける。
法線や粗さのような、数として読む画像には付けない。

`asset` のパラメーターが指すファイルは、既定値のまま使っていても Publish のバンドルに含まれる。
ファイルが `content/` に無いと、Publish を止める。

### コードで動かすもの

スタジオの Timeline は、カメラの並びと表示する区間を扱い、キーフレームとカーブは扱わない。
オブジェクトの動きは、glb の Animation Clip か、プロジェクトのコードで作る。

| 動かしたいもの | 方法 |
|---|---|
| カメラ | Camera の Motion（「[カメラの動き](#カメラの動き)」） |
| モデルの動き | glb の Animation Clip。いつも再生するなら Inspector の Animation、ループの決まった時刻なら Play の Timeline の Animation Track、出来事が起きたときなら Event の Timeline の Animation Track |
| 組み込みのマテリアル（色、発光） | コンポーネントが `useSceneMaterial(id)` で取り出し、`useFrame` の中で書く |
| ライト | コンポーネントが `useSceneObject(name)` で取り出し、`useFrame` の中で書く |
| 霧、背景、露出 | コンポーネントが `useThree()` の `scene` と `gl` を、`useFrame` の中で書く |
| 空（HDRI と HDRI B の切り替え） | コンポーネントが `useSkyBlend()` の `.value` を、`useFrame` の中で書く |
| 組み込みのポストエフェクト（Bloom、Vignette） | パラメーターはシーンファイルの値で固定。動かすなら、同じ効果を `definePostEffect` で登録し、`update` で uniform を書く |
| Timeline の時刻に合わせた動き | `usePlayback().t` を読む |

スタジオでパラメーターを変えると、ライト、マテリアル、環境はシーンファイルの値で書き直される。
コードで動かす値は、変わったときだけでなく毎フレーム書く。

## コンポーネント

コンポーネントは、シーンに置く R3F のコンポーネントである。
スタジオの Hierarchy の「＋」から置き、Inspector でパラメーターとデータとの結び付け（Binding）を決める。

```tsx
// src/components/Flow.tsx。src/register.ts から import './components/Flow' で読み込む
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { defineComponent, getPath, useSceneObject, useStageData, type StageComponentProps } from '@three-stage/runtime';

type Params = { color: string; size: number; speedPerUnit: number };

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// from のオブジェクトから to のオブジェクトへ、データの値に比例する速さで粒を流す
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
    m.parent?.worldToLocal(m.position); // コンポーネント自身の位置からの座標に直す
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[params.size, 16, 16]} />
      <meshStandardMaterial color={params.color} />
    </mesh>
  );
}

defineComponent<Params>({
  type: 'sample.flow',                 // 種類の名前
  label: 'Flow',                       // Hierarchy の「＋」に表示する名前
  params: {                            // Inspector の入力欄はここから作る
    color: { type: 'color', default: '#F79009', label: 'Color' },
    size: { type: 'number', default: 0.11, min: 0.05, max: 0.5, unit: 'm', label: 'Size' },
    speedPerUnit: { type: 'number', default: 0.3, min: 0, max: 2, label: 'Speed Per Unit' },
  },
  binding: { from: 'node', to: 'node', value: 'data' },  // Inspector の Binding で選ぶ
  Component: Flow,
});
```

毎フレームの動きは `useFrame` の中で ref を直接書き、setState しない。
データも `useFrame` の中で `useStageData().value` を読む。

### 定義の項目

| 項目 | 内容 |
|---|---|
| `type` | 種類の名前 |
| `label` | スタジオに表示する名前 |
| `params` | パラメーターの定義（「[パラメーターの定義](#パラメーターの定義)」） |
| `binding` | データとの結び付けの名前と種類。`'data'` はデータの中のパス、`'node'` はシーンのオブジェクトの名前。Inspector の Binding で、`'data'` は今のデータに含まれるパスから、`'node'` は一覧かスポイトで選ぶ |
| `Component` | 描画する R3F のコンポーネント |
| `count` | `(params, data, binding) => number`。並べたオブジェクトの数を返すと、Hierarchy に「名前 ×数」と表示する |
| `slots` | `true` にすると、並べたオブジェクトに `setSlotKey` で付けた Key を、Event の Timeline で `名前 [Key]` として選べる |

### コンポーネントが受け取る props

| props | 内容 |
|---|---|
| `id` | シーンファイルでのコンポーネントの id |
| `name` | シーンファイルでのコンポーネントの名前。並べたオブジェクトに名前を付けるときに頭に付ける（「Items 1」「Items 2」…）。Empty の Parent やスポイトで、その名前で選べる |
| `params` | パラメーターの値。シーンファイルに無い値は既定値で埋める |
| `binding` | Binding の名前ごとの、データの中のパスかオブジェクトの名前。未設定の Binding は含まない |
| `editing` | スタジオの Edit の間は `true`。編集中に止めたい動きは、これを見て止める |

コンポーネントが例外を投げると、スタジオの Console にエラーを表示し、そのコンポーネントだけを描画しない。
パラメーターか `content/` のファイルが変わると、もう一度描画を試みる。
Inspector の Enabled を外すと、表示を消すだけでなく、コンポーネントそのものを止める。

### シーンのオブジェクトとマテリアル

| API | 内容 |
|---|---|
| `useSceneObject(name)` | シーンのオブジェクトを名前で取り出す。対象は glb の一番上のオブジェクト（Hierarchy の Models の下の名前）、置いたモデル、Empty、コンポーネント、ライト。読み込みが終わるまでと、見つからないときは `null`。中のオブジェクトは、返したオブジェクトの `getObjectByName` や `traverse` で探す |
| `useSceneMaterial(id)` | シーンのマテリアル（Assets の Materials のもの）の three.js のマテリアル。割り当てたすべてのオブジェクトで共有している。組み込みのマテリアルの `color` や `emissiveIntensity` を、`useFrame` の中で書く。`create` の形のシェーダーは割り当て先ごとに別のマテリアルなので `null` |
| `useStageMaterial(object, id)` | シーンのマテリアルを、コンポーネントが読み込んだ glb に割り当てる。`object` の中のすべてのメッシュに割り当て、`create` の形のシェーダーには、メッシュごとの元のマテリアルを `base` として渡す。`id` が空になるか、アンマウントすると元に戻す |
| `useGltfAsset(path)` | `content/` の中の `.glb` を読み込む。ファイルが変わると読み直し、使われなくなった前のものを GPU から解放する。読み込むまでは Suspense で待つ |
| `useAssetUrl(path)` | `content/` の中のファイルの URL。ファイルが変わると URL が変わる |

`useSceneObject` で取り出した glb のオブジェクトのマテリアルを書き換えると、同じ glb を使うほかのオブジェクトも変わる。
書き換えた値は、アンマウントするときに元に戻す（Sample の `src/components/Accent.tsx`）。

drei の `useGLTF` を直接使うと、読み込んだ glb が GPU から解放されない。
`.glb` は `useGltfAsset` で読み込む。

コンポーネントが `useGltfAsset` で読み込んだ glb には、Hierarchy の Material からマテリアルを割り当てられない。
`material` のパラメーターを定義し、`useStageMaterial` で割り当てる。

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

コンポーネント、モデル、ライトは、Activation Track の区間の中だけ表示する。
3D のオブジェクトは表示と非表示を切り替えるだけで、フェードしない（半透明で描画すると重くなるため）。

フェードさせたいときは、コンポーネントが `useActivation()` で区間の値を読み、透明度や大きさに当てる。
値は Fade In と Fade Out の間で 0〜1 の途中の値になり、Track が無いと 1 になる。
区間の中では値が 0 でも表示しているので、フェードアウトも書ける。

```tsx
// コンポーネントの中。mat は transparent: true のマテリアル
const activation = useActivation();
useFrame(() => {
  mat.opacity = activation.value('component:' + id);  // id は props の id
});
```

`value` に渡す対象の書き方は、`component:<id>`、`object:<名前>`、`placed:<id>`、`light:<id>`、`ui:<部品の名前>`。

### 並べたオブジェクト

| API | 内容 |
|---|---|
| `setSlotKey(obj, key)` | 並べたオブジェクトに、データの Key（一覧の要素の id など）を付ける。`slots: true` と一緒に使う |
| `setDataVisible(obj, visible)` | データで決めた表示（一覧に無い要素のオブジェクトを隠す、など）。毎フレーム呼んでよい |
| `setAnimationClips(obj, clips)` | オブジェクトに、Animation Track で再生できる Clip を設定する。glb から作ったオブジェクトには `gltf.animations` を渡す。glb のオブジェクトと置いたモデルには、ランタイムが付ける |

オブジェクトの `visible` は直接書かない。
Activation Track と Event の Timeline の表示と食い違う。

## 2D UI

2D UI は、3D の上に重ねる React のコンポーネントである。
プロジェクトに1つだけ、`defineOverlay` で登録する。

2D UI は高さ 1080 px のステージに描画する。
幅はシーンの Aspect Ratio で決まり（16:9 なら 1920 px）、`useStageSize()` で読める。
ランタイムが、ステージを表示する領域に合わせて縮小する。

```tsx
// src/Overlay.tsx。src/register.ts から import './Overlay' で読み込む
import { defineOverlay, useActivationRef, useFollowRef } from '@three-stage/runtime';

function Overlay() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* overview の Activation Track の区間だけ表示する */}
      <div ref={useActivationRef('overview')} style={{ position: 'absolute', left: 64, top: 48, fontSize: 48 }}>
        Overview
      </div>
      {/* Empty「Label A」の画面上の位置に置き、点の上に表示する */}
      <div ref={useFollowRef('Label A')}>
        <div style={{ transform: 'translate(-50%, -100%)', fontSize: 28 }}>A-03</div>
      </div>
    </div>
  );
}

defineOverlay({ Component: Overlay, parts: ['overview'] });
```

### 定義の項目

| 項目 | 内容 |
|---|---|
| `Component` | 2D UI のコンポーネント。props の `data` は受信したデータの `DataStore` |
| `parts` | `useActivationRef` で Activation Track に任せる部品の名前。スタジオの Timeline は、ここから Activation Track の対象を選ぶ。スタジオでは部品を増やせない |

部品の Activation Track の区間が、画面の切り替えの単位になる（全体を表示している間は `overview`、など）。

### 2D UI の API

| API | 内容 |
|---|---|
| `useActivationRef(part)` | 要素を部品 `part` として Activation Track に任せる。返した関数を要素の `ref` に渡す。ランタイムが、区間の中だけ表示し、Fade In と Fade Out で `opacity` を変える。Track の無い部品はいつも表示する。Event の Timeline にだけ Track がある部品は、その Event の再生中だけ表示する |
| `useFollowRef(name)` | 要素を、その名前のオブジェクト（多くは Empty）の画面上の位置に動かす。返した関数を要素の `ref` に渡す。要素の左上が点に来る。オブジェクトがカメラの後ろにあるか、ステージの外にあるか、見つからないときは表示しない |
| `usePlayback()` | Timeline の再生の状態（「[ランタイム API 一覧](#ランタイム-api-一覧)」）。毎フレーム変わるので、React で描画するものは間隔をあけて読む |
| `useStageEnv()` | `env.url(path)` で、`content/`（組み込み先ではバンドル）の中のファイルの URL を返す。書体のように、2D UI が自分で読み込むファイルに使う |
| `useStageSize()` | ステージの幅と高さ（px） |

位置と表示は毎フレーム変わるので、React の state にしない。
ランタイムが、カメラを動かしたのと同じフレームのうちに、要素の `transform`、`opacity`、`visibility` を直接書く。
2D UI の側で再生の状態を見て表示を切り替えると、カメラが移る途中にラベルが残る。

`useActivationRef` と `useFollowRef` は、どちらも要素の `visibility` を書く。
1つの要素に両方を使わず、要素を入れ子にして分ける。

### データの読み方

受信したときだけ変わる値（数値の表示など）は、React の state にしてよい。
`data.onReceive(f)` で受信のたびに読み、state に保存する。
スタジオの Data タブで時刻を動かしたときは受信として扱わないので、Sample の `src/Overlay.tsx` は一定の間隔でも読み直している。

### クリック

2D UI の外側の要素は `pointer-events: none` になっている。
クリックを受ける要素には `pointerEvents: 'auto'` を指定する。

## シェーダー

ランタイムが含むマテリアルは MeshStandardMaterial と MeshPhysicalMaterial で、ほかの描き方はシェーダーとして登録する（Unity の Shader と Material の関係と同じ）。
登録したシェーダーは、Assets の Materials の「＋」と、マテリアルの Type に並ぶ。
作ったマテリアルは、ほかのマテリアルと同じく、glb のオブジェクトの Material でマテリアルスロットごとに割り当てる。

書き方は2つある。

| 書き方 | 使うとき |
|---|---|
| `vertexShader` と `fragmentShader` | ライトを受けないオブジェクト（光る線、画面、霧のような見た目）。three.js の `ShaderMaterial` になる。`options` で `transparent` や `side` などを渡せる |
| `create(uniforms, base)` | ライトと影を受けたいオブジェクト。three.js のマテリアル（`MeshStandardMaterial` を `onBeforeCompile` で書き換えたものなど）を作って返す。`base` は割り当てたマテリアルスロットの元のマテリアル（glb のもの） |

```ts
// src/shaders/Glow.ts。src/register.ts から import './shaders/Glow' で読み込む
import { defineShader } from '@three-stage/runtime';

defineShader({
  type: 'sample.glow',                         // 種類の名前
  label: 'Glow',                               // マテリアルの Type に表示する名前
  params: {                                    // コンポーネントと同じ形。Inspector に入力欄を表示する
    color: { type: 'color', default: '#5B8DEF', label: 'Color' },
    pulse: { type: 'number', default: 1, min: 0, max: 4, label: 'Pulse' },
  },
  binding: { level: 'data' },                  // データの中の数を、同じ名前の uniform に渡す
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

`create` で書く例は、Sample の `src/shaders/Grid.ts` にある。

陰影の付け方だけを変え、glb の色とテクスチャはそのまま使いたいときは、`base` を複製して書き換える。
同じマテリアルを、色の違うマテリアルスロットにいくつ割り当てても、それぞれの元の色とテクスチャが残る（Unity で Shader を替えても、同じ名前のプロパティが引き継がれるのと同じ）。

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

### `create` と `base` の仕様

| 項目 | 内容 |
|---|---|
| 呼ばれる回数 | 元のマテリアルごとに1回。すべての呼び出しで `uniforms` を共有する。パラメーターを変えても呼び直さず、uniform だけを書き換える |
| `base` を書き換えない | `base` はほかのマテリアルスロットと共有している。`clone()` してから書き換え、`base` そのものは返さない |
| `base` が無いとき | マテリアルスロットの無い所（元のマテリアルの無い所）に割り当てたときは `undefined` |
| 数 | マテリアルは元のマテリアルの数だけできる。シェーダープログラムは three.js が同じ書き換えをまとめるので、draw call は増えない |
| `onBeforeCompile` | three.js は、`onBeforeCompile` の関数のソースが同じマテリアルに、同じプログラムを使い回す。関数を写して GLSL の文字列だけを変えると、別のシェーダーのプログラムで描画される。`customProgramCacheKey` で種類の名前を返して区別する |
| 後始末 | ランタイムが解放するのは、`create` が返したマテリアルだけ（`dispose()`）。`create` の中で作ったテクスチャやレンダーターゲットは、返すマテリアルの `dispose` を上書きして一緒に解放する |

### uniform と描画の仕様

| 項目 | 内容 |
|---|---|
| uniform | `params` と `binding` の名前が、そのまま同じ名前の uniform になる。型は「[パラメーターの定義](#パラメーターの定義)」の表のとおり。`binding` の値は数に直して float で渡す（数でなければ 0） |
| `uTime` | ランタイムが毎フレーム渡す秒数。Pause（❚❚）の間は止まる |
| `uniforms` と `update` | `params` に無い uniform は、`uniforms` に初期値を書いて作っておく（three.js は後から追加した uniform を送らない）。`update(uniforms, data, dt)` は毎フレーム、`binding` の値を書いた後に呼ばれる。データから JavaScript で計算した値を入れる。ミリ秒の時刻のような大きな数は GPU の float では桁が足りないので、ここで時間帯などに直す |
| 色の出力 | `vertexShader` と `fragmentShader` で書くときは、`gl_FragColor` を書いた後に `#include <tonemapping_fragment>` と `#include <colorspace_fragment>` を置く。置かないと、ポストプロセスを使わないシーンで色が暗くなる |
| 影 | `vertexShader` で形を動かすと、影も同じ頂点シェーダーで描画するので、形と同じに動く（ランタイムが影用のマテリアルを作る）。対象は DirectionalLight と SpotLight の影だけ。PointLight の影と、`create` で形を動かしたときの影は、元の形のまま。マテリアルスロットが2つ以上あるメッシュで、スロットごとに違うシェーダーを割り当てたときも、元の形のまま（three.js の影用のマテリアルはメッシュに1つ） |
| コードを変えたとき | 保存すると、スタジオが読み直し、新しいシェーダーで描画する |
| 登録されていない種類 | ピンクで描画し、Console に警告を表示する |
| コンパイルできないとき | Console にエラーを表示し、そのオブジェクトは描画されない |

## ポストエフェクト

ランタイムが含むポストエフェクトは Bloom、Vignette、FXAA、SMAA で、ほかのエフェクトはポストエフェクトとして登録する。
登録したエフェクトは、Environment の Post Processing の Add に並ぶ。

```ts
// src/effects/Sepia.ts。src/register.ts から import './effects/Sepia' で読み込む
import { definePostEffect } from '@three-stage/runtime';

definePostEffect({
  type: 'sample.sepia',
  label: 'Sepia',
  stage: 'display',                            // トーンマッピングの後。'hdr' なら前
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

`binding` と `update` を使う例は、Sample の `src/effects/Tint.ts` にある。

### 定義の項目

| 項目 | 内容 |
|---|---|
| `type`、`label` | 種類の名前と、スタジオに表示する名前 |
| `stage` | かける位置。`'hdr'` か `'display'` |
| `params`、`binding`、`uniforms`、`update` | シェーダーと同じ |
| `fragmentShader` | 画面全体に1回かける GLSL |
| `create(uniforms)` | `fragmentShader` の代わりに、three.js の Pass を作って返す |

### 仕様

| 項目 | 内容 |
|---|---|
| かける位置（`stage`） | 描画の順は、シーン → Bloom → `hdr` のエフェクト → トーンマッピングと Vignette → `display` のエフェクト → FXAA → SMAA。`hdr` では色は 1 を超える明るさのまま、`display` では画面に表示する 0〜1 の色 |
| 並び | 組み込みのエフェクトの位置は変わらない。登録したエフェクトは、同じ `stage` の中で、Post Processing に並べた順にかける |
| uniform | シェーダーと同じく、`params` と `binding` の名前の uniform、`uTime`、`uniforms` に書いたもの。ほかに、それまでの画像 `tDiffuse`、画面の位置 `vUv`（varying）、出力範囲 `uFrame`。使うものだけを宣言する |
| 出力範囲（`uFrame`） | 組み込み先に表示される範囲。キャンバス全体を 0〜1 として、xy が出力範囲の左下、zw が幅と高さ。スタジオの Edit ではキャンバスが出力範囲より大きいので、縁を暗くするような、出力範囲に対してかけるエフェクトは `uFrame` で出力範囲の中の位置に直す |
| 複数回描画するエフェクト | `create(uniforms)` で three.js の Pass を作って返す。`ShaderPass` には、`uniforms` をそのまま渡した `ShaderMaterial` を渡す。uniform の定義（`{ uniforms: … }`）を渡すと、three.js が値を複製するので、パラメーターと Binding の変化が届かない。`tDiffuse` を受け取るには、`uniforms` に `tDiffuse: null` を書いておく |
| 後始末 | ランタイムが解放するのは、`create` が返した Pass だけ |
| 登録されていない種類 | かけずに飛ばし、Console に警告を表示する |

## Trigger

Trigger は、Event の Timeline を再生する条件である（Event の Timeline の使い方は [studio.md](studio.md) の「Event の Timeline」）。
よく使う条件はランタイムが登録していて、スタジオでパラメーターを入力して使う。
当てはまらない条件（値を2つ以上組み合わせる、時間の幅を見る、など）は、プロジェクトのコードで登録する。

| Trigger | 内容 |
|---|---|
| None（`none`） | データでは再生しない。組み込み先のコードが名前で呼んだときと、スタジオの Inspector の Play で再生する |
| List Change（`stage.listChange`） | 一覧（List）の要素の値（Field）が From から To に変わったら、その要素の Key で再生する。Key は要素を区別するフィールドの名前（既定は `id`）。From と To が空なら、どの値からでも、どの値へでも再生する。From を入力すると、前の受信に無かった要素（一覧に追加された要素や、前の受信で一時的に含まれなかった要素）では再生しない |
| それ以外 | `defineTrigger` で登録する |

```ts
// src/triggers/LevelReached.ts。src/register.ts から import './triggers/LevelReached' で読み込む
import { defineTrigger } from '@three-stage/runtime';

type Frame = { items: { id: string; level?: number }[] };

defineTrigger<{ level: number }>({
  type: 'sample.levelReached',                  // 種類の名前
  label: 'Level Reached',                       // Trigger の Type に表示する名前
  params: { level: { type: 'number', default: 80, min: 0, max: 100, unit: '%', label: 'Level' } },
  // 前の受信と今の受信を比べ、出来事が起きた要素の Key を返す
  detect(prev, next, p) {
    const before = new Map((prev as Frame).items.map((e) => [e.id, e.level ?? 0] as const));
    return (next as Frame).items.filter((e) => (before.get(e.id) ?? 0) < p.level && (e.level ?? 0) >= p.level).map((e) => e.id);
  },
  keys: (data) => (data as Frame).items.map((e) => e.id),  // スタジオで手動で再生するときの Key の候補
});
```

| 項目 | 内容 |
|---|---|
| `detect(prev, next, params)` | 受信のたびに、前のデータと今のデータを比べ、再生する Key の配列を返す。要素に結び付かない出来事なら `['']` を返す。最初の受信と、スタジオの Data タブで時刻を動かしたときは呼ばれない。例外を投げると Console にエラーを表示する |
| `keys(data, params)` | 今のデータに含まれる Key。スタジオで Event を手動で再生するときの候補になる |

1回の受信で複数の Key を返すと、Key ごとに Event の Timeline を再生する。
組み込み先から Event を名前で直接再生するには、`EventStore` の `fire(name, key)` を使う（「[組み込み先に渡すコンポーネント](#組み込み先に渡すコンポーネント)」）。

## カメラの動き

Camera は、Viewport で決めた Position、Target、FOV を基準に、Motion でショットの間も動き続ける。
Motion が None なら、基準の位置で止まったまま。
スタジオで新しく追加したカメラは、Drift が設定された状態で作られる。

| Motion | 内容 |
|---|---|
| None | 動かさない |
| Drift（`stage.drift`） | 基準の位置のまわりを、ゆっくり往復し続ける。Orbit（Target のまわりの方位角の振れ幅）、Tilt（仰角の振れ幅）、Distance（Target までの距離の振れ幅。%）、Sway（横の平行移動の振れ幅）、Heave（縦の平行移動の振れ幅）、Period（最も長い往復の秒数）。周期の違う sin を重ねるので、同じ形の繰り返しに見えにくく、長く再生しても基準から離れていかない |
| それ以外 | `defineCameraMotion` で登録する |

```ts
// src/motions/EachItem.ts。src/register.ts から import './motions/EachItem' で読み込む
import * as THREE from 'three';
import { defineCameraMotion } from '@three-stage/runtime';

const _p = new THREE.Vector3();
const _offset = new THREE.Vector3();

// 名前が「Item 1」「Item 2」…のオブジェクトを、同じ向きと距離のまま1つずつ順に映す
defineCameraMotion<{ prefix: string }>({
  type: 'sample.eachItem',                       // 種類の名前
  label: 'Each Item',                            // Motion の Type に表示する名前
  params: { prefix: { type: 'text', default: 'Item ', label: 'Prefix' } },
  // out には基準の値が入っている。書き換えて、このフレームのカメラにする
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

`apply(out, ctx, params)` が受け取るもの。

| 名前 | 内容 |
|---|---|
| `out` | `position`、`target`（`THREE.Vector3`）、`fov`。基準の値が入っている。Target にオブジェクトを指定していれば、`target` はそのオブジェクトの位置 |
| `ctx.time` | Timeline の先頭からの秒数。ループしても戻らない。ゆっくり揺らすような、ショットをまたいで続く動きはこれで書く |
| `ctx.t` | このカメラに入り始めて（前のカメラからのブレンドの開始から）の秒数 |
| `ctx.length` | 入り始めから、次のカメラへ移り終わるまでの秒数。ショットの中で順に何かをするときは `ctx.t / ctx.length` を使う |
| `ctx.base` | 基準の値（`out` と同じ形）。書き換えない |
| `ctx.data` | 今のデータ |
| `ctx.find(name)` | その名前のオブジェクト。見つからなければ `null` |
| `ctx.findAll(prefix)` | 名前が `prefix` で始まるオブジェクトを、名前の中の番号の順に返す（「Item 2」が「Item 10」より先）。一致したオブジェクトの子は探さない。数はデータで変わってよく、1秒以内に反映される |
| `params` | Inspector で決めたパラメーター |

位置は、時刻、データ、オブジェクトの位置だけで決め、前のフレームの値を持ち越さない。
ブレンドの間は、前のカメラと次のカメラの両方を毎フレーム計算して混ぜるので、移り終わった瞬間に動きが飛ばない。
スタジオで Timeline の目盛りをドラッグしたときも、再生したときと同じ、その時刻の位置になる。
`apply` は毎フレーム呼ばれる（ブレンドの間は、前と次の2つのカメラの分）。
ベクトルは関数の外で作って使い回し、毎フレーム作らない。

登録されていない Motion を指すカメラは、基準の位置で止まったまま描画する。

## モックデータとデータの受け渡し

### データ

スタジオとランタイムは、データの形を知らない。
扱うのは、組み込み先から渡される JSON の値と、その中の場所を指すパスだけである。
データの形（TypeScript の型）とモックデータは、プロジェクトが定義する（Sample の `src/data.ts` と `src/mock/index.ts`）。

組み込み先では、`StageView` の `data` に今のデータを、`receivedAt` に受信した時刻（エポックミリ秒）を渡す。
`receivedAt` が変わると受信として扱い、`useReceive` の関数と Trigger の `detect` を呼ぶ。
スタジオでは、登録したモックデータを Data タブで流す。

| API | 内容 |
|---|---|
| `useStageData()` | 受信したデータの `DataStore`。`.value` が最新のデータ、`.receivedAt` が受信した時刻。再描画は起こさないので、`useFrame` の中で読む |
| `useReceive(f)` | 受信のたびに `f(value, receivedAt)` を呼ぶ。`f` は `useCallback` で固定する |
| `getPath(data, path)` | パスで、データから値を取り出す。無ければ `undefined` |

### パスの書き方

Binding と `getPath` は、データの中の場所を次のパスで指す。

| 書き方 | 意味 |
|---|---|
| `total.value` | オブジェクトのフィールドを `.` でたどる |
| `items[3]` | 配列の番号（0 から） |
| `items[id=A-03]` | 配列の中で、フィールド `id` が `A-03` の要素。値は文字列として比べる。`id` 以外のフィールドも使える |
| `items[id=A-03].value` | 組み合わせられる |

順番が決まっていないデータには、番号（`items[3]`）でなく `[id=…]` を使う。
Inspector の Binding は、今のデータに含まれる数と文字列のパスを候補に表示する。
`id` を含む要素の配列は `[id=…]` で、それ以外は番号で表示し、配列の長さ（`items.length`）も候補にする。
配列の候補は先頭の 16 要素まで。

### モックデータ

モックデータは、スタジオで組み込み先のデータの代わりに流すデータである。
`defineMockData` で1つだけ登録し、`src/stage.ts` から読み込む。
Data タブの時刻と速さは、`sample` に渡す時刻を動かすだけである。

```ts
// src/mock/index.ts。src/stage.ts から import './mock' で読み込む
import { defineMockData, todayAt } from '@three-stage/runtime';
import type { Frame } from '../data';

// 1分ごとに受信する架空の1日
const receivedAt = (minutes: number) => Math.floor(minutes);

function frameAt(m: number): Frame {
  return { measuredAt: todayAt(m), items: [{ id: 'A-03', value: 50 + 40 * Math.sin((m / 1440) * Math.PI * 2) }] };
}

// 組み込み先でモックデータを流すときに使う
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

| 項目 | 内容 |
|---|---|
| `variants`、`variantLabel` | Data タブで切り替えるモックデータの種類と、その選択欄の名前 |
| `sample(minutes, variant)` | 0 時からの分を受け取り、その時刻までに受信した値（`value`）と、受信した時刻（`receivedAt`。0 時からの分）を返す。`receivedAt` が変わると受信として扱う |
| `summary(value)` | 受信した値の要約。Data タブと Console に表示する |

`todayAt(minutes)` は、今日の 0 時から `minutes` 分後の時刻（エポックミリ秒）を返す。
モックデータの中の時刻を作るときに使う。

`three-stage build` は、`src/mock/index.ts` があれば `<パッケージ名>/mock` として書き出す。
組み込み先でモックデータを使えるように、`mockFrameAt` のような普通の関数を export する。
`defineMockData` の戻り値は export しない（生成した `.d.ts` がランタイムの型を参照し、組み込み先の型の確認が通らなくなる）。

## ランタイム API 一覧

プロジェクトのコードから使う、`@three-stage/runtime` の export。
シグネチャと詳しい動作は、ランタイムのソースの TSDoc（`packages/runtime/src/`）にある。

### 登録

| API | 内容 |
|---|---|
| `defineComponent(def)` | コンポーネントを登録する |
| `defineOverlay(def)` | 2D UI を登録する（1つだけ） |
| `defineShader(def)` | シェーダーを登録する |
| `definePostEffect(def)` | ポストエフェクトを登録する |
| `defineTrigger(def)` | Trigger を登録する |
| `defineCameraMotion(def)` | カメラの動きを登録する |
| `defineMockData(def)` | モックデータを登録する（1つだけ） |

型は `ParamDef`、`ComponentDef`、`StageComponentProps`、`OverlayDef`、`OverlayProps`、`ShaderDef`、`ShaderUniforms`、`PostEffectShaderDef`、`TriggerDef`、`CameraMotionDef`、`CameraMotionContext`、`MockDataDef`。

### データ

| API | 内容 |
|---|---|
| `useStageData()` | 受信したデータの `DataStore`（`.value`、`.receivedAt`、`.onReceive(f)`） |
| `useReceive(f)` | 受信のたびに `f(value, receivedAt)` を呼ぶ |
| `getPath(data, path)` | パスで値を取り出す |
| `listPaths(data)` | データに含まれる数と文字列のパスの一覧（Inspector の Binding の候補と同じ） |
| `todayAt(minutes)` | 今日の 0 時から `minutes` 分後の時刻（エポックミリ秒） |

### シーン

| API | 内容 |
|---|---|
| `useSceneObject(name)` | シーンのオブジェクトを名前で取り出す |
| `useSceneMaterial(id)` | シーンのマテリアルの three.js のマテリアル |
| `useStageMaterial(object, id)` | シーンのマテリアルを、コンポーネントが読み込んだ glb に割り当てる |
| `useGltfAsset(path)` | `content/` の `.glb` を読み込む |
| `useAssetUrl(path)` | `content/` のファイルの URL |
| `disposeObject(root)` | `root` の下のメッシュのジオメトリ、マテリアル、テクスチャを解放する |
| `useSkyBlend()` | 空の Blend。`useFrame` の中で `.value` に 0〜1 を書く（0 で HDRI、1 で HDRI B）。0 か 1 だけを書けば切り替わり、途中の値なら混ざる。`null` に戻すと Inspector の Blend を使う。スタジオの Edit ではコードの値を使わない。`.applied` は今使っている Blend で、太陽の強さなどを空に合わせるときに読む |
| `useStageEnv()` | 描画の環境。`url(path)`、`log(level, text)`（スタジオの Console に表示する）、`editing`、`settings`、`render` |

### 再生と表示

| API | 内容 |
|---|---|
| `usePlayback()` | Timeline の再生の状態。`t`（Timeline の先頭からの秒数。ループしても戻らない。Camera Track の合計で割った余りがループの中の時刻）、`cameraId`（今のカメラの id）、`blending`（次のカメラへ移っている最中か）、`playing`（Timeline が進んでいるか）。再描画は起こさないので、`useFrame` の中で読む |
| `useActivation()` | Activation Track の今の値。`.value(target)` を `useFrame` の中で呼ぶ。Track が無い対象は 1、Event の Timeline にだけ Track がある対象は Event の外で 0 |
| `setDataVisible(obj, visible)` | データで決めた表示 |
| `setSlotKey(obj, key)` | 並べたオブジェクトにデータの Key を付ける |
| `setAnimationClips(obj, clips)` | オブジェクトに Animation Track で再生できる Clip を設定する |
| `useEvents()` | `EventStore`。`fire(name, key)` で Event を名前で再生する |

### 2D UI

| API | 内容 |
|---|---|
| `useActivationRef(part)` | 要素を部品として Activation Track に任せる |
| `useFollowRef(name)` | 要素をオブジェクトの画面上の位置に動かす |
| `useStageSize()` | ステージの幅と高さ（px） |

### 組み込み用

| API | 内容 |
|---|---|
| `StageView` | Publish したシーンを、スタジオの Play と同じ描画と動きで表示する React コンポーネント |
| `EventStore` | Event を名前で再生する（`fire(name, key)`）。`StageView` の `events` に渡す |

この表に無い export（`SceneContent`、`StageCanvas`、各 Director、`registry`、`normalizeScene` など）は、`StageView` を構成する部品と、スタジオが使うものである。

## 登録したコードの書き出し

### パッケージとバンドル

組み込み先に渡すものは2つあり、変えたものによって差し替えるものが違う。

| 書き出すもの | 作り方 | 含むもの |
|---|---|---|
| パッケージ | `three-stage build` | `src/index.ts` から読み込んだコード（コンポーネント、2D UI、シェーダー、ポストエフェクト、Trigger、カメラの動き）とランタイム。`src/mock/index.ts` があれば `<パッケージ名>/mock` |
| バンドル | スタジオの Publish か `three-stage publish` | シーンファイルと、使うアセット。登録したものについては、種類の名前、パラメーター、Binding、パラメーターが指すファイルだけ |

コードを変えたら、パッケージを作り直し、組み込み先にインストールし直してもらう。
置き方、パラメーター、Timeline だけを変えたなら、バンドルを差し替えるだけでよい。
バンドルはコードを含まず、ランタイムはシーンファイルからコードを実行しないので、組み込み先が CSP を設定していても動く。

パッケージとバンドルの内容と、組み込み先での使い方は [scene-format.md](scene-format.md) にある。

### Publish の確認

Publish は、シーンファイルが登録されていない種類（マテリアルのシェーダー、ポストエフェクト、コンポーネント、Trigger、カメラの Motion）を指していると止まる。
`asset` のパラメーターが指すファイルが `content/` に無いときも止まる。

スタジオの Publish は、スタジオに読み込まれている登録で確認する。
`three-stage publish` は、パッケージの入口（`src/index.ts`。無ければ `src/stage.ts`）を Node で読み込んで登録を集める。
そのため、`src/stage.ts` からしか読み込んでいない登録は、`three-stage publish` では登録されていないものとして止まる。
入口を読み込めないときも止まる（ブラウザにしか無い `window` や `document` を、読み込んだ時点で使っている、など）。
`window` や `document` は、コンポーネントの中や `useEffect` の中で使う。

### 組み込み先に渡すコンポーネント

`src/index.ts` は、組み込み先が使う React コンポーネントを export する。
コンポーネントは、`StageView` に Publish したバンドルとデータを渡すだけでよい。

```tsx
// src/MyStage.tsx。src/index.ts から export { MyStage } from './MyStage' で export する
import { useImperativeHandle, useState, type Ref } from 'react';
import { EventStore, StageView } from '@three-stage/runtime';
import type { Frame } from './data';
import { registered } from './register';

void registered;  // 登録を読み込ませる

export interface MyStageHandle {
  /** Event を名前で再生する。key は並べたオブジェクトの Key */
  fire(name: string, key?: string): void;
}

export interface MyStageProps {
  /** Publish した manifest.json の URL */
  bundle: string;
  /** 受信したデータ。新しい値を受信したら差し替える */
  data: Frame | null;
  ref?: Ref<MyStageHandle>;
}

export function MyStage({ bundle, data, ref }: MyStageProps) {
  const [events] = useState(() => new EventStore());  // 作り直さない
  useImperativeHandle(ref, () => ({ fire: (name, key) => events.fire(name, key) }), [events]);
  return <StageView bundle={bundle} data={data} receivedAt={data?.measuredAt ?? null} events={events} />;
}
```

export するコンポーネントの props の型には、ランタイムの型を使わない。
ランタイムはパッケージの中にまとめるので、組み込み先にはランタイムの型が無い。
props の説明は TSDoc に書く。
パッケージの `.d.ts` に残り、組み込み先のエディタで読める。

`StageView` の props（`settings`、`overlay` など）は [scene-format.md](scene-format.md) にある。
