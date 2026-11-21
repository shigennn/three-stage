# エディタ

このドキュメントでは、THREE Stage のエディタの画面構成と操作を説明する。\
インストールとプロジェクトの作成方法は [getting-started.md](getting-started.md)、コードの記述方法は [scripting.md](scripting.md)、ファイルの形式と書き出しは [scene-format.md](scene-format.md) を参照。

## 概要

以下、シーンを組み込む Web アプリケーションを「組み込み先」と呼ぶ。\
エディタは、組み込み先と同じランタイム（`@three-stage/runtime`）でシーンを描画する。

モデルには、任意の DCC ツールで作成した glTF 2.0 のバイナリ形式（`.glb`）を使用できる。\
エディタは `content/glb/` に配置された `.glb` を読み込む。\
DCC ツールとは直接連携しない。

## 画面の構成

パネルの配置は Unity に、Viewport の操作は Blender に準じる。\
パネルの境界はドラッグで移動でき、各パネルの大きさはブラウザに保存される。

| パネル | 位置 | 内容 |
|---|---|---|
| Toolbar | 上端 | プロジェクト名、Scene、Branch、再生、保存、Publish |
| Viewport | 左 | シーンの表示と編集 |
| Timeline | 左下のタブ | Camera Track、Activation Track、Animation Track |
| Data | 左下のタブ | モックデータの時刻、速度、種類の指定 |
| Console | 左下のタブ | ログ |
| Profiler | 左下のタブ | 性能のグラフ |
| Hierarchy | 右の左列の上 | Scene 内のオブジェクトの一覧 |
| Assets | 右の左列の下 | マテリアルと `content/` のファイルの一覧 |
| Inspector | 右の右列 | 選択したものの設定 |

Inspector は、選択したものの設定のみを表示する。\
Scene 全体の設定（環境光、背景、霧、トーンマッピング、影、ポストプロセス）は、Hierarchy の Environment を選択すると表示される。\
マテリアルの設定は、Assets の Materials の項目を選択すると表示される。

保存と Publish の結果は、Console に出力され、画面下部にも数秒間表示される。

### エディタで扱わないもの

エディタには、キーフレームとカーブを編集する機能がない。\
動きは、次のいずれかの方法で設定する。

- モデルの動きは、glb に書き出したアニメーション Clip（以下、Clip）を名前で指定して再生する。
- コンポーネントの形状と動きはコードで定義する。\
  エディタでは、コードが公開したパラメーターを変更する。\
  コンポーネントは、プロジェクトの `src/` にコードで記述したオブジェクト（流れる粒子など）である。
- カメラの動き（Motion）もコードで定義する。\
  エディタでは、動きの種類とパラメーターを選択する。
- Timeline で指定するのは、カメラの順序、長さ、ブレンドと、表示する区間、Clip を再生する区間のみである。

コンポーネント、カメラの動き、シェーダー、ポストエフェクトの記述方法は [scripting.md](scripting.md) を参照。

## Scene と Timeline

視点の切り替え（全体の表示、一部の拡大など）は、Scene（ファイル）を切り替えず、1 つの Scene 内のアニメーションとして構成する。\
Scene を切り替えると、そのたびに 3D のデータが再読み込みされ、カメラの動きも連続しないためである。

| 用語 | 説明 |
|---|---|
| Scene | 1 つの `*.stage.json`。アセットの構成と表示方法をすべて含む |
| Timeline | 時間に沿ってカメラと表示を切り替える仕組み |
| Camera Track | カメラを再生順に並べるトラック |
| Activation Track | 対象を表示する区間を指定するトラック |
| Animation Track | glb の Clip を再生する区間を指定するトラック |

Scene に含まれるアセットは、3D モデル、ライト、コンポーネント、カメラ、2D UI である。\
Timeline も Scene に含まれる。

Timeline の選択欄で Play と表示される Timeline を、以下「メインの Timeline」と呼ぶ。\
メインの Timeline は常にループ再生される。\
長さは、Camera Track のカメラの長さの合計である。\
メインの Timeline のほかに、Event Timeline を任意の数だけ追加できる（後述の「Event Timeline」）。

Camera Track の各ブロックの右端にある斜線部分は、次のカメラへのブレンドである。\
最後のカメラの斜線部分は、最初のカメラへのブレンドである。\
カメラは Motion によってショットの間も動き続け、ブレンドは動いている 2 つのカメラの間を補間する。

Activation Track は、2D UI のパーツ、モデル、コンポーネント、ライトごとに 1 本ずつ作成する。\
各 Clip には、Fade In と Fade Out の長さを指定できる。

Animation Track は、区間の開始時に Clip を先頭から再生する。\
メインの Timeline では、ループ内の決まった時刻に Clip を再生する（カメラが近づいたときに扉を開くなど）。

### 2D UI

2D UI は、プロジェクトのコードが描画する HTML のオーバーレイである。\
2D UI のパーツ（`overview` など）は、2D UI のコードが名前を付けて登録する。\
エディタでは、登録されたパーツから選択する。\
画面の区切りは、2D UI のパーツの Activation Track の区間で構成する。

### フェード

ランタイムは、3D のモデルとコンポーネントの表示と非表示を切り替えるのみで、フェードは適用しない。\
半透明の描画は負荷が高いためである。\
フェードさせる場合は、コンポーネントのコードで Activation Track の値を読み取り、透明度や大きさに反映する（[scripting.md](scripting.md)）。

### 動きの設定方法

| 対象 | 設定方法 |
|---|---|
| カメラ | カメラの Motion |
| モデルの動き | glb の Clip |
| マテリアル（色、発光）、ライト、霧、背景、露出 | コンポーネントのコードで毎フレーム更新する |
| 組み込みのポストエフェクト（Bloom、Vignette） | パラメーターは固定 |
| Timeline の時刻に同期した動き | コンポーネントのコードで Timeline の再生位置を読み取る |

glb の Clip は、再生のタイミングに応じて次のいずれかで指定する。

| タイミング | 指定する場所 |
|---|---|
| 常時 | Inspector の Animation |
| ループ内の決まった時刻 | メインの Timeline の Animation Track |
| 出来事の発生時 | Event Timeline の Animation Track |

組み込みのポストエフェクトのパラメーターを時間やデータで変化させる場合は、同じ効果をポストエフェクトとしてコードで登録する。\
コードでの記述方法は [scripting.md](scripting.md) を参照。

### Event Timeline

Event Timeline は、出来事が発生したときに 1 回だけ再生する Timeline である。\
一覧に項目が 1 件追加されたときに、その項目に出現のアニメーションを表示する場合など、発生時刻が決まっていないものに使用する。

| 項目 | 説明 |
|---|---|
| Event | Timeline の名前 |
| Trigger | Timeline を再生する条件 |
| Key | 出来事が発生したスロットの識別子 |
| `<コンポーネント> [Key]` | Key のスロットのオブジェクトを指す Track の対象 |
| Length | Event Timeline の長さ |

- Event: 組み込み先のコードは、この名前で Event Timeline を直接再生できる。\
  Event Timeline どうしで同じ名前を使用すると、Publish が失敗する。
- Trigger: List Change（既定）、プロジェクトが登録した Trigger、None のいずれかを選択する。\
  None の場合は、組み込み先のコードから直接呼び出したときのみ再生される。
- Key: Trigger が決定する（一覧の要素の `id` など）。
- `<コンポーネント> [Key]`: オブジェクトをスロットとして並べるコンポーネントのみが表示する。
- Length: 最後に終わる Clip の終了時刻であり、そこで再生が終了する。

スロットは、コンポーネントが並べたオブジェクトの 1 つずつに、データの Key を対応付けたものである。

再生の仕様は次のとおりである。

- Trigger は、データを受信するたびに、前回の受信内容と今回の受信内容を比較する。\
  最初の受信時と、エディタで Time を変更したときは比較しない。
- 1 回の受信で 2 つのスロットに Event が発生した場合は、スロットごとに並行して再生する。\
  同じスロットの再生中に再度発生した場合は、先頭から再生し直す。
- Event Timeline には Camera Track を配置できない。\
  メインの Timeline のカメラワークは停止しない。
- Event Timeline は、メインの Timeline と並行して再生される。\
  ❚❚（Pause）の間は、Event Timeline も停止する。
- 組み込み先のコードから直接呼び出す Event は、Trigger を None にする。\
  データによる再生も有効な場合、直接呼び出した後に同じ変化を受信すると、再度再生される。\
  直接呼び出す方法は [scripting.md](scripting.md) を参照。
- 発生から Length を超えて待機した Event は破棄される。\
  ブラウザはタブが非表示の間は描画を停止するため、タブに戻ったときに古い出来事のアニメーションがまとめて再生されないようにするためである。
- 値が不明になりうる項目は、データの型で不明の状態を `null` とし、From を `true` または `false` に設定する。\
  たとえば `active` がオンライン、オフライン、不明の 3 状態を取る場合は、不明を `null` で表す。\
  From を空にすると、不明に変化しただけでも再生される。

表示の仕様は次のとおりである。\
停止しているときの表示は常にデータから決定し、Event Timeline は 2 つの状態の間の遷移のみを担う。\
表示を長時間続けた場合、途中から開いた場合、受信が欠落した場合にも、表示がデータと一致するようにするためである。

| オブジェクト | Event の Clip の区間内 | Event の Clip の区間外 |
|---|---|---|
| `[Key]` のオブジェクト | 表示する（データにより非表示の場合も） | データに従う |
| その他のオブジェクト、2D UI のパーツ | 表示する | メインの Timeline の Track に従う |

`[Key]` のオブジェクトの区間外の表示は、コンポーネントがデータに基づいて非表示にしたものも含め、データに従う。\
その他のオブジェクトは、メインの Timeline に Track がない場合、区間外では表示しない（Event 専用のオブジェクトとして扱う）。

### 表示の設定と Track の関係

Inspector の Rendering の Visible は、Track の区間がない時間帯の表示を指定する。\
Unity の GameObject の有効と無効に相当する。\
Visible を無効にしたオブジェクトも、Activation Track（メインの Timeline と Event Timeline）の区間内では表示される。

Hierarchy の Hide のアイコン（目の形）で非表示にしたオブジェクトは、エディタの Viewport でのみ、Track に関係なく非表示になる。\
Unity の Scene ビューでの非表示に相当する。

### Animation Track の Clip の終了

Animation Track の Clip は、再生位置が区間の外に移るか再生が終了すると停止し、オブジェクトは Clip の再生前の位置と回転に戻る。\
Clip で移動したオブジェクトが Clip の終了後に非表示になる場合、それはデータによって非表示になったものであり、Clip の終了位置に留まるわけではない。\
マテリアルの値のアニメーション（KHR_animation_pointer）は再生できない。

### Empty

Empty は、形状を持たない名前付きの点である。\
three.js では形状を持たない Object3D であり、Blender の Empty、Unity の空の GameObject に相当する。

| 用途 | 説明 |
|---|---|
| 2D UI のラベル | 2D UI の要素を、その点の画面上の位置に追従させる（[scripting.md](scripting.md)） |
| カメラとライトの Target | オブジェクトを Target に指定すると、その位置に向く |
| コンポーネントの接続先 | オブジェクト名を指すパラメーター（流れる粒子の始点、終点など）で選択する |

Target に指定した Empty が移動すると、カメラとライトの向きも追従する。

Parent を指定すると、Empty は Parent の位置に Offset を加えた位置に配置される。\
Parent の回転と拡大率は継承しない。\
Parent を変更しても、Empty が同じ位置に留まるように Offset が再計算される。

### Aspect Ratio

組み込み先で描画する範囲を、以下「出力フレーム」と呼ぶ。\
Aspect Ratio は、出力フレームの縦横比である。\
Render Settings の Output で数値を入力して変更する。\
既定値は 16:9 である（Unity の Game ビューの Aspect と同じ考え方）。

2D UI のステージは高さ 1080 px で、幅は Aspect Ratio から決まる（16:9 の場合は 1920 × 1080）。\
Edit の Viewport では、Overlays の Aspect Ratio を有効にすると出力フレームが重ねて表示される。\
Play と組み込み先では、出力フレームの範囲のみを描画する。\
カメラの FOV は、出力フレームに対する垂直方向の画角である。

## Stats と Profiler

性能の数値は 2 か所に表示される。

| 表示場所 | 内容 |
|---|---|
| Stats（Viewport の右上） | 現在の数値 |
| Profiler（左下のタブ） | 項目ごとの直近 60 秒のグラフ |

### Stats

Stats は、Unity の Game ビューの Stats、Blender の Statistics に相当する。\
表示する項目は次のとおりである。

- fps とフレーム時間
- CPU の時間と GPU の時間
- Calls、Triangles、Geometries、Textures（three.js の `renderer.info`）
- JS Heap と GC Alloc

Viewport 上部の右端の Stats ボタンで、表示と非表示を切り替える。\
View Helper を表示している間は、その左に配置される。\
Edit と Play のどちらでも表示できる。\
全画面表示では、全画面にする前の表示状態が維持される。

### Profiler

Profiler は、Unity の Profiler と同様に、項目ごとのグラフを縦に並べる。\
左に項目名と現在の値を、右に直近 60 秒のグラフを表示する。\
項目は Frame Time、CPU / GPU、JS Heap、GC Alloc、Calls である。\
上限は点線で表示される。\
エディタの起動時から、タブが非表示の間も 1 秒に 4 回記録する。

### 測定方法

| 項目 | 測定方法 |
|---|---|
| fps とフレーム時間 | `requestAnimationFrame` の呼び出し間隔 |
| CPU の時間 | 1 フレームの JavaScript の実行時間 |
| GPU の時間 | WebGL2 の GPU タイマー拡張（`EXT_disjoint_timer_query_webgl2`） |
| Calls、Triangles | three.js の `renderer.info` |
| Geometries、Textures | `renderer.info.memory` の数 |
| JS Heap | Chrome の `performance.memory` |
| GC Alloc | GC 間のヒープの増加速度（MB/s） |

- fps とフレーム時間: Render の Frame Rate が 30 fps の場合は 33.3 ms に揃い、負荷を確認できない。\
  測定するときは Frame Rate を Unlimited にする。
- GPU の時間と JS Heap: 使用できない環境では「―」と表示される。
- Geometries、Textures: GPU のメモリ使用量そのものを取得する API はブラウザにない。
- GC Alloc: ページの JavaScript から GC の実行は検出できない。\
  ヒープが急減した時点を GC の実行とみなし、GC と GC の間のヒープの 1 秒あたりの増加量を表示する。\
  Unity の Profiler の GC Alloc に相当する。\
  正確な内訳は、DevTools の Performance で確認する。

上限を超えた数値は色を変えて表示される。

| 項目 | 上限 |
|---|---|
| フレーム時間、CPU の時間、GPU の時間 | 描画の高さ 1080 で 12 ms、720 で 6 ms |
| JS Heap | 1 GB |

上限の考え方と、長時間のメモリの検査（`three-stage soak`）は [performance.md](performance.md) を参照。

## モード

▶ をクリックすると Play になり、再度クリックすると Edit に戻る。\
Space キーでも切り替えられる。

❚❚（Pause）は、Edit と Play のどちらでも、動いているものをすべて停止する。\
停止するのは、コンポーネントがコードで動かしているもの（回転、流れなど）、glb の Clip、Timeline の再生、モックデータの時刻である。\
描画は継続するため、停止中も視点を移動し、オブジェクトを選択して移動できる。\
再度 ❚❚ をクリックするか、▶ でモードを切り替えると再開する。

| モード | Viewport | カメラ | データ |
|---|---|---|---|
| Edit | 自由な視点。出力フレームを重ねて表示する | Blender と同じ操作で移動する | 停止した時刻の値 |
| Play | 組み込み先と同じ表示 | Camera Track に従う | モックデータが時間とともに進む |
| Pause | 現在のモードのまま停止する | 停止した位置 | 停止した時刻の値 |

- Edit: 表示と非表示は、Timeline の再生位置の時点の状態になる。\
  コンポーネントの動きは表示されるが、glb の Clip は再生されない。
- Play: Camera Track と Activation Track がループ再生され、データ受信時のアニメーションが再生される。

Play の間も Inspector で値を変更でき、変更は Scene の変更として残る。\
Unity と異なり、Play を終了しても値は元に戻らない。

### 全画面

Toolbar の Fullscreen または F11 キーで、Play の Viewport を画面全体に表示する。\
組み込み先での表示（ステージと 2D UI のみ）を確認するための機能である。

| 項目 | 説明 |
|---|---|
| 開始 | Edit と Play のどちらからでも開始できる |
| 表示するもの | ステージと 2D UI |
| 表示しないもの | Toolbar、パネル、画面下部の通知 |
| 終了 | Esc キー |

- Edit から全画面にすると、Play も開始する。\
  Play の途中で全画面にしても、再生は途切れない。
- 画面と縦横比が異なる場合、余白は黒で塗りつぶされる。
- Stats は、全画面にする前の表示状態が維持され、全画面の中では切り替えられない。
- Esc キーで全画面を終了すると、Play のまま元の画面に戻る。\
  その他のキー（Space、Ctrl＋S、Ctrl＋Z を含む）は無効になる。

ブラウザの全画面機能を使用するため、`--no-open` で起動したサーバーをブラウザで開いた場合も同様に動作する。\
ブラウザによっては F11 キーがブラウザ自体の全画面表示に割り当てられているため、その場合は Fullscreen ボタンを使用する。

## キーボードとマウスの操作

Viewport の操作（キー、修飾キー、マウスボタンの割り当て）は Blender に準じる。

| 操作 | キー |
|---|---|
| Translate、Rotate、Scale | G、R、S |
| 複製 | Shift＋D |
| 削除 | X、Delete |
| すべて選択、選択の解除 | A、Alt＋A |
| 非表示、すべて表示 | H、Alt＋H |
| 名前の変更 | F2 |
| 元に戻す | Ctrl＋Z |
| やり直し | Ctrl＋Shift＋Z、Ctrl＋Y |
| 正面、右、上から表示 | テンキーの 1、3、7 |
| 反対側から表示 | Ctrl＋テンキーの 1、3、7 |
| Perspective と Orthographic の切り替え | テンキーの 5 |
| ズームイン、ズームアウト | テンキーの +、- |
| 選択したオブジェクトを表示（Frame Selected） | テンキーの . |
| 全体を表示（Frame All） | Home |
| カメラから表示（Look Through） | テンキーの 0 |
| 選択したカメラを現在の視点に合わせる（Align With View） | Ctrl＋Alt＋テンキーの 0 |
| 再生の開始と終了 | Space |
| 全画面で再生（Fullscreen） | F11 |
| 保存 | Ctrl＋S |
| スポイトの取り消し | Esc |

各操作の詳細は次のとおりである。

- Translate、Rotate、Scale: オブジェクトを選択し、マウスポインターが Viewport 上にある状態でキーを押下する。\
  続けて X、Y、Z キーで軸を限定し、数値を入力すると値で指定できる。\
  Ctrl キーを押している間は、0.1 m、5°、0.1 の刻みに吸着する。\
  左クリックか Enter キーで確定し、右クリックか Esc キーで取り消す。\
  操作中は、画面下部に操作名、軸、値が表示される。
- 複製: 複製後、マウスポインターが Viewport 上にあれば、そのまま G の移動になる。
- 削除: 確認せずに削除する。\
  Ctrl＋Z で元に戻せる。
- すべて選択: A で選択されるのは、glb 内のオブジェクトと配置したモデルである。
- 決まった方向からの表示: Orthographic に切り替わり、視点を回転すると元の投影方法に戻る（Blender の Auto Perspective）。
- Look Through: 選択したカメラ、選択していない場合は最初のカメラから表示する。\
  投影方法は Perspective に戻る。
- Align With View: Blender の Align Active Camera to View に相当する。\
  Target にオブジェクトを指定したカメラでは、Position と FOV のみを変更する。
- Fullscreen: 全画面を終了できるのは Esc キーのみである。
- 保存: Toolbar の Save と同じ動作である。

視点のキー（テンキー、.、Home）は、Blender と同様に、マウスポインターが Viewport 上にあるときのみ有効である。\
テキストの入力欄に入力している間は、マウスポインターの位置にかかわらずエディタのキーは無効になる（Ctrl＋S は有効）。\
テンキーのない PC のために、数字キーもテンキーと同じく動作する（Blender の Emulate Numpad）。\
Hierarchy の Search などに数字を入力しても、視点は変化しない。

| 視点の操作 | マウス |
|---|---|
| 回転 | 中ボタンでドラッグ、または Alt＋左ドラッグ |
| 平行移動 | Shift＋中ボタンでドラッグ、または Shift＋Alt＋左ドラッグ |
| ズーム | ホイール |

Alt＋左ドラッグは、Blender の Emulate 3 Button Mouse と同じ代替操作である。

ギズモ（Transform Controls）の種類は、Viewport 上部の Translate、Rotate、Scale で選択する。\
Ctrl キーを押しながらギズモを操作すると、Translate は 0.1 m、Rotate は 5°、Scale は 0.1 の刻みに吸着する。\
ライトと Empty のギズモは Translate のみである。

Inspector の数値の欄は、ラベルを左右にドラッグしても変更できる（Unity と同じ）。\
Shift キーを押しながらドラッグすると細かく、Ctrl キーを押しながらドラッグすると刻みに合わせて変化する。

## 編集と保存

`.glb` は、書き出したときの位置のまま読み込まれる。\
Viewport でオブジェクトを移動した内容は、オブジェクト名ごとの上書きとして Scene に保存される。\
DCC ツールでオブジェクト名を変更すると、その上書きは適用されなくなる。

元に戻す（Ctrl＋Z）とやり直し（Ctrl＋Shift＋Z）は、Scene に対するすべての変更に適用できる。\
履歴は、エディタを開いている間のみ保持される。

保存は、Save（または Ctrl＋S）をクリックしたときのみ実行され、自動保存はしない。\
未保存の変更がある場合は、Toolbar の Scene 名の右に ● が表示される。\
変更の取り消しには Ctrl＋Z を使用する。\
保存した状態に戻すだけのボタンはない。\
削除は確認せずに実行され、Ctrl＋Z で元に戻せる。

確認のダイアログは、次の場合のみ表示される。

| 操作 | ダイアログのボタン |
|---|---|
| 未保存の変更がある状態で、別の Scene を開く、Publish する、ブランチを切り替える | Save、Don't Save、Cancel |
| Assets に同名のファイルを追加する（Replace File） | Replace、Cancel |

### 外部での変更

開いている Scene のファイルが外部で変更されることがある。\
テキストエディタや AI エージェントがファイルを編集した場合や、git でブランチを切り替えた場合である。\
未保存の変更がなければ、エディタはファイルを再読み込みする。\
未保存の変更があれば再読み込みせず、Toolbar に `The file was changed externally` と Reload ボタンを表示する。\
Reload で再読み込みすると未保存の変更は破棄されるが、再読み込み前の状態にも Ctrl＋Z で戻せる。

## 各パネルの操作

### Toolbar

| 操作 | 方法 |
|---|---|
| 最初の画面に戻る | 左端のプロジェクト名をクリックする |
| Scene を開く、切り替える | Scene でファイル名を選択する |
| 別名で保存 | Save As… |
| 再生、一時停止 | ▶（Play）、❚❚（Pause） |
| 全画面で再生 | Fullscreen（前述の「全画面」） |
| ブランチの確認と切り替え | Branch（後述の「ブランチ」） |
| 保存 | Save |
| 外部での変更の読み込み | Reload |
| バンドルの書き出し | Publish |

- 最初の画面に戻る操作は、アプリケーションのウィンドウでのみ使用できる。
- Scene の一覧には、`content/scenes/` の `*.stage.json` がファイル名（`main.stage.json` など）で表示される。\
  Scene を追加するには、Save As… を使用するか、`content/scenes/` にファイルを配置する。\
  同時に開ける Scene は 1 つである。
- Save As… は、ダイアログでファイル名を入力し、現在の Scene を未保存の変更を含めて別名で保存し、保存したファイルを開く。\
  元の Scene は、最後に保存した状態のまま残る。\
  同名のファイルが存在する場合は、ダイアログ内に通知され、保存できない。
- 未保存の変更がある場合は、Scene 名の右に ● が表示される。\
  Reload は、ファイルが外部で変更された場合のみ表示される。
- Publish は、検査を実行し、問題がなければシーンのバンドルを `dist/bundle/` に書き出す。\
  結果は画面下部と Console に表示される。\
  出力の形式は [scene-format.md](scene-format.md) を参照。

### ブランチ

プロジェクトのフォルダが git リポジトリ内にある場合、Toolbar の Branch に現在のブランチが表示される。\
既定のブランチは読み取り専用であり、編集は別のブランチで行う。\
変更をブランチで行い、プルリクエストで既定のブランチに取り込む運用を前提とする。\
プロジェクトのフォルダが git リポジトリ内にない場合（git がインストールされていない PC を含む）は、Branch は表示されず、常に編集できる。

| 操作 | 方法 |
|---|---|
| 現在のブランチの確認 | Branch の右にブランチ名が表示される |
| ブランチの切り替え | Branch をクリックし、一覧からブランチを選択する |
| ブランチの作成 | Branch の New Branch… でブランチ名を入力する |

- 現在のブランチが外部（git のコマンドなど）で切り替えられると、表示されるブランチ名が更新され、画面下部に通知される。
- 次の状態では Read Only と表示され、編集、Save、Save As…、Assets へのファイルの追加はできない。\
  Publish は実行できる。
  - `origin` の既定のブランチ（`origin` がない場合は `main` または `master`）
  - ブランチ上にない状態（detached HEAD）
- ブランチの一覧には、ローカルのブランチと、`origin` にのみ存在するブランチが表示される。\
  一覧を開くときに `git fetch` を実行する。\
  ブランチを選択すると、`git checkout` で切り替え、画面を再読み込みする。
- New Branch… は、既定のブランチ（取得できれば `origin` の最新）からブランチを作成し、切り替える。

`git checkout` を使用するため、プロジェクトのフォルダだけでなく、リポジトリ全体が切り替わる。\
コミットしていない変更（追跡しているファイルの変更）がある場合は、切り替えも作成も行わず、該当するファイルを通知する。\
コミットと push はエディタでは行わない。\
別のフォルダ（`git worktree`）で使用されているブランチには git が切り替えを許可しない。\
その場合は、アプリケーションのウィンドウでそのフォルダのプロジェクトを開き直す。

### Viewport 上部のメニュー

| メニュー | 内容 | Blender の相当機能 |
|---|---|---|
| View | 投影方法と視点の指定 | View |
| Translate、Rotate、Scale | ギズモの種類 | — |
| Gizmos | ギズモの表示と非表示 | Viewport Gizmos |
| Overlays | 補助表示の表示と非表示 | Viewport Overlays |
| Render | 組み込み先の描画条件の確認 | — |
| Stats | Stats の表示と非表示 | — |

- View: Projection（Perspective、Orthographic）、Viewpoint（Top、Bottom、Front、Back、Right、Left、Camera）、Frame Selected、Frame All を含む。\
  右側にショートカットキーが表示される。\
  Play の間は使用できない。
- Gizmos: 最上部の Gizmos で、すべてのギズモの表示と非表示を切り替える。\
  その下の項目で、ギズモを個別に切り替える。\
  Viewport Gizmos は View Helper と Transform Controls である。\
  View Helper は右上の X、Y、Z の軸であり、軸の端をクリックするとその方向から表示する。\
  Object Gizmos は Light Helpers（ライトの種類を示すアイコンと、向きを示す点線）と Empties である。
- Overlays: Guides は Grid と Axes（X、Y、Z を個別に指定）、Geometry は Wireframe、Output は 2D UI と Aspect Ratio である。\
  Grid と Wireframe は Edit でのみ表示される。
- Render: エディタでの確認のための指定であり、Scene には保存されない。\
  Quality は High または Low を選択する。\
  Resolution は高さ 1080、高さ 720、Dynamic Resolution から選択する（幅は Aspect Ratio から決まる）。\
  Frame Rate は 30 fps または Unlimited を選択する。\
  最下部の Render Settings… で設定画面を開く。

既定では、Quality は High、Resolution は高さ 1080、Frame Rate は 30 fps で、Stats は表示される。

### Render Settings

Render Settings は、Unity の Project Settings の Quality と同様に、左に項目、右に設定を表示する画面である。\
変更した値は Scene に保存され、組み込み先でも同じ設定で描画される。

| 項目 | 設定 | 既定値 |
|---|---|---|
| Output の Aspect Ratio | 出力フレームの縦横比 | 16:9 |
| Output の Resolution | Aspect Ratio と高さ 1080 から決まる解像度（表示のみ） | — |
| Output の Frame Rate | フレームレート（表示のみ） | 30 fps |
| Quality の Max Resolution | 描画解像度の高さの上限（1080、720、540） | High は 1080、Low は 720 |
| Quality の Shadow Map Scale | シャドウマップの解像度の倍率（100%、50%、25%） | High は 100%、Low は 50% |
| Dynamic Resolution の Minimum Resolution | 解像度を下げたときの高さ（720、540） | 720 |
| Dynamic Resolution の Frame Time Threshold | 遅いと判定するフレーム時間（20〜200 ms） | 40 ms |

Quality の値は、High と Low を切り替えてそれぞれ設定する。\
Dynamic Resolution は、直近 60 フレームのうち 12 フレームを超えて遅いフレームがあると解像度を下げ、元には戻さない。

### Viewport（Edit）

| 操作 | 方法 |
|---|---|
| 選択 | クリック |
| 選択への追加 | Shift＋クリック |
| Translate、Rotate、Scale | G、R、S キー、またはギズモのドラッグ |
| 複製、削除、非表示 | Shift＋D、X、H、Alt＋H |
| モデルの配置 | Assets から `.glb` をドラッグする |
| ライトの移動 | Light Helpers のアイコンを選択して移動する |
| Empty の配置 | Hierarchy の「＋」で追加し、Viewport で移動する |
| スポイトによる選択 | Inspector の欄の右にあるスポイトのアイコン |
| 視点の移動 | 前述の「キーボードとマウスの操作」 |
| 決まった方向からの表示 | テンキーの 1、3、7、View の Viewpoint、View Helper の軸の端 |
| Perspective と Orthographic の切り替え | テンキーの 5、View の Projection、View Helper の下のボタン |
| 選択したオブジェクトの表示 | テンキーの .、View の Frame Selected |
| Look Through | テンキーの 0、カメラのダブルクリック |
| Align With View | Ctrl＋Alt＋テンキーの 0 |

- 選択: Hierarchy の選択と連動し、Inspector に設定が表示される。
- Translate、Rotate、Scale: glb に書き出したときの位置に戻すには、Inspector の Transform の Reset を使用する。
- モデルの配置: ドロップした位置の地面またはオブジェクトの表面に配置される。
- ライトの移動: DirectionalLight と SpotLight の向きは Target で指定する。
- Empty の配置: Parent を指定すると、そのオブジェクトに追従する。\
  Parent のある Empty も、ギズモと G キーではワールド座標で移動し、Scene には Parent からの Offset として保存される。
- スポイトによる選択: アイコンをクリックすると、画面上部に `Click an object in the Viewport to pick it` と `Esc to cancel` が表示される。\
  オブジェクトをクリックすると、その名前が欄に設定される（流れる粒子の接続先、Empty の Parent、Target など）。\
  Esc キーで取り消す。
- Perspective と Orthographic の切り替え: Edit の視点のみの切り替えであり、Scene には保存されない。\
  Orthographic は、注視点の位置で Perspective と同じ範囲が映る大きさで描画し、ズームインすると範囲が狭くなる。
- Look Through: Timeline または Hierarchy でカメラをダブルクリックすると、そのカメラから表示する。
- Align With View: 選択したカメラを現在の視点に合わせる。

カメラを調整するときは、Look Through でそのカメラから表示し（Blender のカメラ視点と同じ）、視点を移動してから Align With View を実行する。

エディタでは、モデリング（頂点の編集）と親子関係の設定は行わない。\
コンポーネントが並べたオブジェクト（数に応じて並べるオブジェクトなど）は、個別には移動できない。\
並べる基準位置はギズモで移動し、間隔や列の数は Inspector のパラメーターで変更する。

### Viewport（Play）

| 操作 | 方法 |
|---|---|
| 組み込み先と同じ動作の確認 | ▶ で Play を開始する |
| 再生中のパラメーターの変更 | Inspector |
| 時刻と速度の変更 | Data タブ |

Play では、Camera Track と Activation Track のループ、データ受信時のアニメーション、モックデータの時間経過が再生される。\
Inspector で変更した値は、保存の対象になる。\
Play の間は、Viewport のクリックでオブジェクトを選択できない。\
選択するときは Hierarchy を使用する。\
カメラは Camera Track に従って移動し、手動では移動できない。

### Timeline

Timeline は、Unity の Timeline と同様に、左にトラックの見出し、右にトラックを表示する。\
上から順に、目盛り、Camera Track、Activation Track と Animation Track（追加した数だけ）、Add Activation Track、Add Animation Track が並ぶ。\
目盛りの左には、表示する Timeline の選択欄、「＋」、全体の秒数が表示される。\
選択欄の Play がメインの Timeline であり、それ以外は Event Timeline である。\
Event Timeline を選択すると、Inspector に Trigger が表示される。

| 操作 | 方法 |
|---|---|
| カメラの追加 | Camera Track の見出しの「＋」 |
| カメラの並べ替え | ブロックをドラッグする |
| Duration の変更 | ブロックの右端をドラッグする |
| Blend の変更 | 斜線部分の左端をドラッグする |
| Easing の変更 | Inspector |
| Activation Track の追加 | Add Activation Track |
| Animation Track の追加 | Add Animation Track |
| Clip の追加 | トラックを右クリックして Add Clip、またはトラックの空き領域をダブルクリック |
| Clip の移動 | Clip をドラッグする |
| Clip の Start と End の変更 | Clip の左端と右端をドラッグする |
| Track の削除 | 見出しを右クリックして Delete |
| Clip の削除 | Clip を選択して X または Delete |
| 動きの確認 | 目盛りをドラッグする |
| カメラの調整 | ブロックを選択する |

- カメラの追加: Hierarchy の「＋」の Camera と同じ動作である。\
  現在の視点からカメラを作成し、選択中のカメラの後ろ、選択していない場合は最後に追加する。\
  新しいカメラの Motion は Drift である。
- カメラの並べ替え: 隣のブロックの中央を越えた位置で入れ替わる。
- Duration の変更: 0.1 秒刻みで、Ctrl キーを押している間は 0.5 秒刻みになる。\
  最短は 0.5 秒である。
- Blend の変更: ブロックの右の斜線部分が、次のカメラへの Blend である。\
  0.05 秒刻みで、Ctrl キーを押している間は 0.5 秒刻みになる。
- ループの表示: 全体の終わりに点線が表示され、その右に最初のカメラが薄く表示される。\
  最後のカメラの斜線部分が、最初のカメラへの Blend である。
- Activation Track の追加: 2D UI のパーツか、オブジェクト（glb 内のオブジェクト、配置したモデル、コンポーネント、ライト）を選択する。\
  1 つの対象に作成できる Track は 1 本である。
- Animation Track の追加: glb 内のオブジェクトか配置したモデルを選択する。\
  Clip は Play の間のみ再生され、Edit で目盛りをドラッグしても再生されない（Edit ではオブジェクトの位置を調整するため）。
- Clip の追加: Activation Track には、クリックした位置から 5 秒間の Clip が追加される。\
  Animation Track には、glb の最初の Clip がその長さで追加される。
- Clip の Start と End の変更: 0.1 秒刻みで、Ctrl キーを押している間は 0.5 秒刻みになる。\
  Activation Track の Clip の Fade In と Fade Out は Inspector で指定する。\
  2D UI のパーツの Clip では、フェードが Clip の先頭と末尾の三角形で表示される。
- 動きの確認: 目盛りをドラッグすると、Edit のままその時点のカメラと表示状態になる。\
  Play はその位置から開始する。\
  Play の間に目盛りをクリックすると、再生位置が移動する。
- カメラの調整: ブロックを選択すると Inspector にカメラの設定が表示される。\
  ブロックをダブルクリックすると、そのカメラから表示する。

Activation Track のない対象は、常に表示される。\
Track のある対象は、Clip の区間内のみ表示される。\
Clip の位置は Timeline の先頭からの秒数で指定し、ループの終わりを超えた部分は使用されない。\
データ受信時のアニメーションはデータの受信を契機に再生されるため、Timeline には配置しない。

#### Event Timeline の操作

| 操作 | 方法 |
|---|---|
| Event Timeline の追加 | 目盛りの左の「＋」 |
| Trigger の指定 | Inspector の Trigger で Type を選択し、パラメーターを入力する |
| Track の追加 | Add Activation Track、Add Animation Track |
| Animation の Clip の追加 | Animation Track を右クリック、または空き領域をダブルクリック |
| 再生による確認 | Inspector の Event の Key を入力して Play をクリック |
| データによる確認 | Data の Time を出来事の少し前にして Play を開始 |
| 削除 | Event Timeline を選択して X または Delete |

- Event Timeline の追加: 名前は Event（重複する場合は番号が付与される）、Trigger は List Change になる。
- Trigger の指定: 項目が非アクティブになったときに再生する場合は、List Change で List を `items`、Key を `id`、Field を `active`、From を `true`、To を `false` にする。\
  アクティブになったときに再生する場合は、From と To を逆にする。\
  From と To を空にすると、値が変化するたびに再生する。
- Track の追加: どちらの Track でも、Key のスロットのオブジェクト（`<コンポーネント> [Key]`）を選択できる。
- Animation の Clip の追加: glb の最初の Clip がその長さで追加される。\
  Inspector で Clip を選択し直すと、区間がその Clip の長さになる。
- 再生による確認: Key が空の場合は、現在のデータの最初の Key を使用する。\
  Edit のままでも再生される。\
  再生中のみ、目盛りに再生位置が表示される。
- データによる確認: Console に `Played <Event>  Key <Key> (data change)` と表示される。
- 削除: Ctrl＋Z で元に戻せる。

Event Timeline では、目盛りをドラッグしてその時点の表示状態を確認することはできない。\
Key を指定しないと表示状態が決定しないためである。

### Console

| 操作 | 方法 |
|---|---|
| ログの確認 | Console タブを開く |
| 関連するオブジェクトの選択 | オブジェクトに関するログをクリックする |
| 種類による絞り込み | Info、Warning、Error のボタン |
| ログのコピー | Copy |
| ログの削除 | Clear |

Console には、次のログが表示される。

- データの受信（時刻と、プロジェクトが定義した値の要約）
- コンポーネントの警告とエラー
- 見つからないアセット
- 保存と Publish の結果
- Event Timeline の再生

種類のボタンで、その種類のログの表示と非表示を切り替える。\
各ボタンには、種類ごとの件数が表示される。\
Copy は、表示中のログをテキストとしてクリップボードにコピーする。

### Data

Data タブでは、プロジェクトがコードで登録したモックデータを操作する（登録方法は [scripting.md](scripting.md)）。\
エディタはデータの内容を解釈せず、時刻と種類を渡して値を受け取るのみである。\
モックデータを登録していないプロジェクトでは、`No mock data registered` と表示される。

| 項目 | 説明 |
|---|---|
| Time | 1 日（00:00〜23:59）の時刻のスライダー |
| Speed | Play で時刻が進む速度。×0、×1、×10、×60、×300 |
| 種類 | プロジェクトが定義したデータの種類 |
| Receive Now | 次の受信を待たずにデータを受信させるボタン |

- Time: Edit と Pause の間は、この時刻の値で停止する。
- Speed: ×1 は実時間、×60 は 1 分で 1 時間進む速度である。
- 種類: ラベルもプロジェクトが定義する。\
  種類が 1 つの場合は表示されない。
- Receive Now: データ受信時のアニメーションを確認するために使用する。\
  横に現在の値の要約が表示される。

データの形式、1 日分の値、受信の間隔は、プロジェクトのコード（`src/` 内）に記述する。\
画面からは設定しない。

### Hierarchy

Hierarchy には、Scene 内のオブジェクトが Models、Lights、Environment、Components、Empties、Cameras に分類して表示される。\
Models には、Scene に追加した `.glb` ごとのオブジェクトと、Viewport に配置したモデルが表示される。

| 操作 | 方法 |
|---|---|
| 絞り込み | Search |
| 選択 | クリック |
| 複数選択 | Shift＋クリック、Ctrl＋クリック |
| 名前の変更 | ダブルクリック、F2、右クリックの Rename |
| 非表示 | Hide のアイコン（目の形） |
| 選択の無効化 | Lock のアイコン |
| 追加 | 「＋」 |
| `.glb` の Scene への追加 | Assets から `.glb` を Hierarchy にドラッグする |
| 複製 | 右クリックの Duplicate、Shift＋D |
| 削除 | 右クリックの Delete、X |
| `.glb` の Scene からの削除 | `.glb` の行を右クリックして Remove from Scene |
| ファイルの場所を開く | `.glb` の行を右クリックして Show in Explorer |

- 選択: Viewport の選択と連動する。
- 名前の変更: カメラはダブルクリックするとそのカメラから表示するため、F2 か Rename を使用する。
- 非表示、選択の無効化: Lock は、台座のように移動しないオブジェクトを Viewport で選択できないようにするために使用する。\
  どちらも Viewport での表示のみを切り替え、Scene には保存されない。
- 追加: 「＋」から次のものを追加できる。
  - Light（DirectionalLight、PointLight、SpotLight、HemisphereLight）
  - Components（プロジェクトが登録したコンポーネント）
  - Camera（現在の視点から作成）
  - Empty
- `.glb` の Scene への追加: ファイル内のオブジェクトが、書き出したときの位置のまま追加される。\
  Viewport にドラッグした場合は、1 つのモデルとして配置される。

glb 内のオブジェクトは、複製も削除もできない。\
削除する場合は、DCC ツールで削除して書き出し直す。\
カメラと Environment は非表示にできない。\
コンポーネントが並べたオブジェクトは、1 行にまとめて表示される（`Items ×8` など）。\
ドラッグによる親子関係の設定はできない。

### Assets

Assets には、`content/` の `glb/`、`textures/`、`hdr/`、`scenes/` のファイルが一覧表示される。\
各ファイルのサイズが表示され、`.glb` にはポリゴン数も表示される。\
最上部の Materials には、Scene 内のマテリアルが表示される。

| 操作 | 方法 |
|---|---|
| マテリアルの設定 | Materials の項目をクリックする |
| マテリアルの作成 | Materials の「＋」 |
| 未使用のマテリアルの削除 | Materials の「＋」の Delete Unused |
| ファイルの追加 | エクスプローラーからファイルを Assets にドロップする |
| モデルの配置 | `.glb` を Viewport にドラッグする |
| 並べるパーツの指定 | `.glb` を Inspector のコンポーネントの Model の欄にドラッグする |
| テクスチャの設定 | テクスチャを Inspector のマテリアルの Textures の欄にドラッグする |
| 環境光の変更 | HDRI を Inspector の HDRI の欄にドラッグする |
| 2 枚目の空の設定 | HDRI を Inspector の HDRI B の欄にドラッグする |
| Scene を開く | `scenes/` の `*.stage.json` をダブルクリックする |
| `content/` を開く | 見出しの Show in Explorer |
| ファイルの場所を開く | ファイルを右クリックして Show in Explorer |

- マテリアルの作成: MeshStandardMaterial、MeshPhysicalMaterial、プロジェクトが登録したシェーダーから選択する。
- ファイルの追加: 拡張子に対応するフォルダにコピーされる。\
  同名のファイルがある場合は Replace File のダイアログが表示され、置き換えると、そのファイルを使用している箇所がすべて再読み込みされる。
- モデルの配置: ドロップした位置に配置される。
- 並べるパーツの指定: 数に応じて並べるコンポーネントのパーツを指定する。
- 環境光の変更: Hierarchy の Environment を選択してから行う。
- 2 枚目の空の設定: 光源の位置が同じで色調の異なる空などを HDRI B に設定し、Blend で比較する。\
  データに応じて切り替える場合は、コンポーネントのコードで行う（[scripting.md](scripting.md)）。
- ファイルの名前の変更と削除は、エクスプローラーで行う。

ファイルが変更されると、エディタは自動で再読み込みする。\
DCC ツールから書き出し直した場合も同様である。

追加できるファイルの形式は次のとおりである。

| 形式 | コピー先 |
|---|---|
| `.glb` | `content/glb/` |
| `.png`、`.jpg`、`.jpeg`、`.webp`、`.ktx2` | `content/textures/` |
| `.hdr`、`.exr` | `content/hdr/` |

ファイルの追加はコピーのみであり、取り込み時の変換や設定はない。\
テクスチャとジオメトリの最適化は、エディタでも Publish でも行わない（[scene-format.md](scene-format.md)）。\
圧縮した `.glb`（Draco、Meshopt、KTX2 のテクスチャ）と `.ktx2` は、そのまま読み込める。\
展開に使用するデコーダーは、エディタのサーバーが配信し、Publish がバンドルに含める。

### Inspector

Inspector は、選択したものに応じた設定を表示する。\
複数を選択した場合は、最初の 1 つの設定を表示する。

| 選択対象 | 表示する節 |
|---|---|
| glb 内のオブジェクト | Transform、Material、Rendering、Animation |
| 配置したモデル | Transform、Model、Material、Rendering、Animation |
| `.glb` のファイル（Hierarchy の Models の行） | glb |
| ライト | Light、Transform、Shadow |
| コンポーネント | コンポーネント名の節、Binding、Transform |
| Empty | Transform、Empty |
| カメラ | Camera、Timeline、Motion |
| Activation Track の Clip | Start、End、Fade In、Fade Out |
| Animation Track の Clip | Clip、Start、End |
| Event Timeline | Timeline、Trigger、Event |
| Environment（Hierarchy） | Environment、Reflection Probe、Background、Fog、Tone Mapping、Shadow Map、Post Processing |
| マテリアル（Assets） | Material、Textures |

各節の項目は次のとおりである。

| 選択対象 | 節 | 項目 |
|---|---|---|
| glb 内のオブジェクト | Transform | Position、Rotation、Scale、Reset |
| glb 内のオブジェクト | Material | マテリアルスロットごとの割り当て |
| glb 内のオブジェクト | Rendering | Visible、Cast Shadow、Receive Shadow |
| glb 内のオブジェクト | Animation | Clip、Loop |
| 配置したモデル | Model | File |
| 配置したモデル | Rendering | Cast Shadow、Receive Shadow |
| `.glb` のファイル | glb | Objects、Tris、Clips |
| ライト | Light | Color、Intensity、Ground Color、Distance、Decay、Angle、Penumbra、Target、Target Position |
| ライト | Transform | Position |
| ライト | Shadow | Cast Shadow、Map Size、Radius、Bias、Normal Bias、Camera Size |
| コンポーネント | コンポーネント名 | Enabled、パラメーター |
| コンポーネント | Binding | データとの対応付け、接続先のオブジェクト |
| Empty | Transform | Offset（Parent がある場合）、Position（Parent がない場合） |
| Empty | Empty | Parent |
| カメラ | Camera | Position、Target、Target Position、FOV、Look Through、Align With View |
| カメラ | Timeline | Duration、Blend、Easing |
| カメラ | Motion | Type、動きのパラメーター |
| Event Timeline | Timeline | Name、Length |
| Event Timeline | Trigger | Type、パラメーター |
| Event Timeline | Event | Key、Play |
| マテリアル | Material | Name、Type、パラメーター |
| マテリアル | ボタン | Select Users、Duplicate、Delete |

- Transform の Reset は、glb に書き出したときの位置に戻す。
- Animation は、glb に Clip がある場合のみ表示される。
- ライトの Light の項目は、ライトの種類に存在するもののみ表示される。
- コンポーネントのパラメーターの欄は、コードの定義から生成される。
- Empty の Parent は、一覧から選択するか、スポイトで指定する。\
  コンポーネントが並べたオブジェクトの 1 つ（`Items 3` など）も選択できる。
- シェーダーのマテリアルでは、シェーダーのパラメーターと Binding が表示される。

#### マテリアルスロット

マテリアルスロットは、glb のメッシュに割り当てられたマテリアルの 1 つずつである。\
Material の各スロットでは、Original（glb のマテリアルのまま）か、Scene のマテリアルを選択する。

| スロットの状態 | ボタン | 動作 |
|---|---|---|
| Original | Duplicate | glb のマテリアルを Scene のマテリアルとしてコピーし、そのスロットに割り当てる |
| Scene のマテリアル | Select | 割り当てたマテリアルを選択する |

Duplicate では、glb に埋め込まれたテクスチャはコピーされない。\
テクスチャは `content/textures/` に配置して割り当て直す（Console に警告が表示される）。

マテリアルの Delete は、そのマテリアルを使用しているオブジェクトの割り当ても解除する。\
Select Users は、そのマテリアルを使用しているオブジェクトとコンポーネントを選択する。

#### Binding

Binding は、パラメーターとデータの対応付けである。\
データの型の中から値を選択する（一覧の 3 番目の要素の値など）。\
オブジェクトを指すパラメーター（流れる粒子の接続先など）は、一覧から選択するか、スポイトのアイコンをクリックして Viewport のオブジェクトをクリックして指定する。

#### Environment

| 節 | 内容 |
|---|---|
| Environment | 環境光の種類（Room Environment、HDRI、None）、HDRI、HDRI B、Blend、Environment Intensity、Environment Rotation |
| Reflection Probe | 周囲のオブジェクトの映り込み。Enabled、Position、Resolution |
| Background | Color、Environment、None。Environment では Background Blurriness でぼかす |
| Fog | Enabled、Color、Near、Far |
| Tone Mapping | トーンマッピングの種類、Tone Mapping Exposure |
| Shadow Map | Enabled、Type（PCF、VSM、Basic） |
| Post Processing | Bloom、Vignette、FXAA、SMAA の有効と無効、パラメーター |

- Environment: HDRI B と Blend で 2 枚の空を混合する。
- Reflection Probe: 既定で有効である。\
  Position から周囲（空と、ランタイムが描画するオブジェクト）を撮影し、映り込みと環境光に使用する。\
  Environment が None の場合は使用されない。
- Shadow Map: VSM では PointLight の影を描画できない。\
  そのため PointLight の Cast Shadow は無効になり、Console に警告が表示される。
- Post Processing: 適用順序は固定であり、変更できない。\
  プロジェクトがポストエフェクトを登録している場合は、Add で追加し、Remove で削除する。\
  負荷については [performance.md](performance.md) を参照。

Reflection Probe は、次の場合に再撮影される。

- オブジェクトが増減したとき
- 表示状態が変化したとき（Activation Track、Event、データによる変化）
- 空の Blend が切り替わったとき
- Edit で Scene を変更したとき（0.5 秒に 1 回まで）

1 フレームに 1 面ずつ撮影するため、撮影が完了するまでは環境光がない。\
動いているオブジェクトは、撮影時の位置で映る。\
エディタの補助線と Empty のアイコンは映らない。

## 作業の流れ

1. DCC ツール（Blender など）でモデルを作成し、プロジェクトの `content/glb/` に `.glb` を書き出す。\
   エディタが自動で再読み込みする。
2. Edit で、カメラから表示しながらオブジェクトの位置を調整する。\
   マテリアル、ライト、環境光を設定し、コンポーネントを追加してデータと対応付ける。
3. Play で、モックデータの 1 日を再生しながら調整する。
4. Timeline で、カメラの順序、長さ、ブレンドと、2D UI とオブジェクトを表示する区間を指定する。
5. 保存し、git にコミットする。
6. 不足しているコンポーネントは、プロジェクトの `src/` に追加する（[scripting.md](scripting.md)）。
7. Publish し、組み込み先と同じ描画のみを表示するページ（`preview.html?bundle=/dist/bundle/manifest.json`）で確認する。

Scene のファイルとコードはテキストのため、テキストエディタや AI エージェントで直接編集できる。\
開いている Scene は、ファイルが変更されると再読み込みされる。\
画面を開かずに確認するときは、`three-stage <フォルダ> --no-open` でサーバーのみを起動し、`three-stage shot` と `three-stage measure` を使用する（[performance.md](performance.md)）。

## 付録: 他のツールとの用語の対応

エディタの表示名が、three.js、Unity、Blender の何に相当するかを示す。\
「—」は、相当する項目がないことを示す。

### three.js にあるもの

three.js にあるものは、エディタでも three.js のクラス名とプロパティ名で表示する。\
プロパティ名は単語に分割し、各単語の先頭を大文字にする（`emissiveIntensity` は Emissive Intensity）。\
角度のみ、three.js のラジアンを度に変換して表示する（Rotation、Angle、FOV）。

| エディタの表示 | three.js | Unity | Blender |
|---|---|---|---|
| Position、Rotation、Scale | `position`、`rotation`、`scale` | Position、Rotation、Scale | Location、Rotation、Scale |
| Visible | `visible` | GameObject の有効と無効 | Show in Viewports |
| Cast Shadow、Receive Shadow | `castShadow`、`receiveShadow` | Cast Shadows、Receive Shadows | — |
| Parent | `parent` | Parent | Parent |
| DirectionalLight、PointLight、SpotLight、HemisphereLight | 同名のクラス | Directional、Point、Spot | Sun、Point、Spot |
| Color、Intensity（ライト） | `color`、`intensity` | Color、Intensity | Color、Power（単位は W） |
| Ground Color | HemisphereLight の `groundColor` | 環境光の Gradient の Ground Color | — |
| Distance | `distance`（`0` は無制限） | Range | Custom Distance |
| Decay | `decay`（`2` が物理的に正しい減衰） | — | — |
| Angle | `angle`（中心から縁までの角度） | Spot Angle（円錐全体の角度） | Angle（円錐全体の角度） |
| Penumbra | `penumbra`（0〜1） | Inner Spot Angle（URP、角度で指定） | Blend（0〜1） |
| Target、Target Position | ライトの `target`、OrbitControls の `target` | — | — |
| Map Size | `shadow.mapSize` | Resolution | — |
| Radius（Shadow） | `shadow.radius` | — | — |
| Bias、Normal Bias | `shadow.bias`、`shadow.normalBias` | Bias、Normal Bias | Bias |
| Camera Size（Shadow） | `shadow.camera` の `left`、`right`、`top`、`bottom` | — | — |
| FOV | `fov`（垂直方向の画角） | Field of View | Field of View |
| MeshStandardMaterial、MeshPhysicalMaterial | 同名のクラス | Lit | Principled BSDF |
| プロジェクトが登録したシェーダー | `ShaderMaterial`、`onBeforeCompile` | Shader | — |
| Color、Map | `color`、`map` | Base Map | Base Color |
| Roughness、Metalness、Roughness Map、Metalness Map | `roughness`、`metalness`、`roughnessMap`、`metalnessMap` | Smoothness（粗さの逆）、Metallic | Roughness、Metallic |
| Normal Map、AO Map | `normalMap`、`aoMap` | Normal Map、Occlusion | Normal |
| Emissive、Emissive Intensity、Emissive Map | `emissive`、`emissiveIntensity`、`emissiveMap` | Emission | Emission Color、Emission Strength |
| Env Map Intensity | `envMapIntensity` | — | — |
| Transparent、Opacity | `transparent`、`opacity` | Surface Type の Transparent | Alpha |
| Clearcoat、Clearcoat Roughness、Transmission、Thickness、IOR、Sheen、Sheen Color | MeshPhysicalMaterial の同名のプロパティ | — | Coat、Transmission、IOR、Sheen |
| Environment（Room Environment、HDRI、None） | `scene.environment`（`RoomEnvironment` または HDRI） | Environment Lighting の Source | World |
| HDRI B、Blend | — | Skybox の Blend（シェーダーで混合） | World の Mix Shader |
| Reflection Probe | `CubeCamera`、`PMREMGenerator.fromCubemap` | Reflection Probe（Baked） | Reflection Cubemap |
| Environment Intensity、Environment Rotation | `scene.environmentIntensity`、`scene.environmentRotation` | Intensity Multiplier | Strength |
| Background、Background Blurriness | `scene.background`、`scene.backgroundBlurriness` | カメラの Background Type | — |
| Fog（Color、Near、Far） | `scene.fog` の `color`、`near`、`far` | Fog の Color、Start、End | Mist の Start、Depth |
| Tone Mapping、Tone Mapping Exposure | `renderer.toneMapping`、`renderer.toneMappingExposure` | Tonemapping の Mode、Post Exposure | View Transform、Exposure |
| Shadow Map（Enabled、Type） | `renderer.shadowMap.enabled`、`renderer.shadowMap.type` | — | — |
| Bloom（Strength、Radius、Threshold） | `UnrealBloomPass` の `strength`、`radius`、`threshold` | Bloom の Intensity、Scatter、Threshold | — |
| Vignette（Offset、Darkness） | `VignetteShader` の `offset`、`darkness` | Vignette の Intensity、Smoothness | — |
| プロジェクトが登録したポストエフェクト | `ShaderPass`、`Pass` | Renderer Feature、Custom Post Process | Compositor のノード |
| FXAA、SMAA | `FXAAPass`、`SMAAPass` | Anti-aliasing の FXAA、SMAA | — |
| Clip、Loop | `AnimationClip`、`AnimationAction` の `loop` | Animation Clip、Loop Time | Action |
| Wireframe | マテリアルの `wireframe` | Wireframe | Wireframe |
| Grid、Axes | `GridHelper`、`AxesHelper` | Grid | Grid、Axes |
| Light Helpers | `DirectionalLightHelper` などのヘルパー | ライトのギズモ | — |
| Transform Controls（Translate、Rotate、Scale） | `TransformControls` の `mode`（`translate`、`rotate`、`scale`） | Move、Rotate、Scale ツール | Move、Rotate、Scale |
| Projection（Perspective、Orthographic） | `PerspectiveCamera`、`OrthographicCamera` | Scene ビューの Persp、Iso | Perspective、Orthographic |
| View Helper | `ViewHelper` | — | Navigate |
| Calls、Triangles、Geometries、Textures | `renderer.info` の `render.calls`、`render.triangles`、`memory.geometries`、`memory.textures` | Statistics の Batches、Tris | Statistics |

### THREE Stage 固有のもの

three.js にないものは、Unity または Blender で一般的な名前で表示する。

| エディタの表示 | 説明 | Unity | Blender |
|---|---|---|---|
| Scene | 1 つのファイル（`*.stage.json`） | Scene | Scene |
| Timeline | 時間に沿った動き | Timeline | Timeline |
| Camera Track | カメラを並べるトラック | Cinemachine Track | — |
| Activation Track | 表示する区間を指定するトラック | Activation Track | — |
| Animation Track | glb の Clip を配置するトラック | Animation Track | NLA の Strip |
| Play、Event の名前（Timeline の選択欄） | メインの Timeline と Event Timeline | Play On Awake の Timeline と、外部から Play を呼び出す Timeline | — |
| Trigger | Event Timeline を再生する条件 | — | — |
| Key | 出来事が発生したスロット | 実行時に Track の Binding を差し替える | — |
| Length | Event Timeline の長さ | Duration | — |
| Clip、Duration | トラック上の区間と、その長さ | Clip、Duration | Strip |
| Blend、Easing | 次のカメラへの切り替え時間と、その加減速 | Cinemachine の Blend と Style | キーフレームの補間の Easing |
| Fade In、Fade Out | 区間の開始時と終了時のフェード | Ease In Duration、Ease Out Duration | — |
| Motion | ショット中のカメラの動き | Cinemachine Camera の Noise と Position Control | — |
| Empty | 形状を持たない名前付きの点 | 空の GameObject | Empty |
| Offset | Parent からの相対位置 | Parent Constraint の Offset | — |
| Enabled（コンポーネント） | コンポーネントの有効と無効 | Enabled | — |
| Binding | データとの対応付け | Binding | — |
| Original | glb に含まれていたマテリアル | — | — |
| Hierarchy、Inspector、Assets、Console、Profiler | パネル | Hierarchy、Inspector、Project、Console、Profiler | Outliner、Properties、File Browser、Info |
| Save、Save As… | 保存、別名で保存 | Save、Save As | Save、Save As |
| Reload | 外部で変更されたファイルの再読み込み | — | Revert |
| Play（▶）、Pause（❚❚） | 再生、一時停止 | Play、Pause | Play、Pause |
| Fullscreen | 全画面での再生 | Game ビューの Play Maximized | Toggle Fullscreen Area |
| Look Through | カメラからの表示 | — | View の Cameras の Active Camera |
| Align With View | カメラを現在の視点に合わせる | GameObject の Align With View | Align Active Camera to View |
| Show in Explorer | エクスプローラーで開く | Show in Explorer | — |
| スポイトのアイコン | Viewport のクリックによるオブジェクトの選択 | Object Picker | Eyedropper |
| View、Gizmos、Overlays | Viewport のメニュー | Gizmos | View、Viewport Gizmos、Viewport Overlays |
| Viewpoint（Top、Bottom、Front、Back、Right、Left、Camera） | 決まった方向からの表示 | — | View の Viewpoint |
| Frame Selected、Frame All | 選択したオブジェクトの表示、全体の表示 | Frame Selected | Frame Selected、Frame All |
| Empties（Gizmos） | Empty のアイコン | — | Empty の Display |
| Aspect Ratio | 出力フレームの縦横比と、その表示 | Game ビューの Aspect | Output の Aspect、カメラの Passepartout |
| Stats | 性能の数値 | Stats | Statistics |
| Profiler（Frame Time、CPU / GPU、JS Heap、GC Alloc、Calls） | 性能のグラフ | Profiler の CPU Usage、GPU Usage、Memory、Rendering | — |
| Render Settings | 描画の設定画面 | Project Settings の Quality | — |
| Quality（High、Low） | 品質の段階 | Quality Level | — |
| Max Resolution | 解像度の上限 | — | — |
| Shadow Map Scale | 影の解像度の倍率 | Shadow Resolution | — |
| Dynamic Resolution（Minimum Resolution、Frame Time Threshold） | 負荷が高いときに解像度を下げる設定 | Dynamic Resolution、Minimum Screen Percentage | — |
| Resolution、Aspect Ratio、Frame Rate | 出力の解像度、縦横比、フレームレート | Resolution、Aspect、Frame Rate | Resolution、Aspect、Frame Rate |
| Time、Speed | モックデータの時刻と進む速度 | Time、Time Scale | — |
| Receive Now | 次の受信を待たずにデータを受信させる | — | — |
| Info、Warning、Error | ログの種類 | Log、Warning、Error | Info、Warning、Error |
