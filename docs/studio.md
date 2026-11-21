# スタジオ

THREE Stage のエディタ（以下、スタジオ）の画面と操作を説明する。
スタジオでシーンを組む人（3D アーティスト、Web 開発者）向け。
インストールとプロジェクトの作り方は [getting-started.md](getting-started.md)、コードの書き方は [scripting.md](scripting.md)、ファイルの形式と書き出しは [scene-format.md](scene-format.md) にある。

スタジオは、組み込み先の Web アプリケーション（以下、組み込み先）と同じランタイム（`@three-stage/runtime`）で描画する。
モデルは、どの DCC ツールで作った glTF 2.0（`.glb`）でもよい。
スタジオは `content/glb/` に置かれた `.glb` を読むだけで、DCC ツールとは直接やり取りしない。

## 画面の配置

パネルの配置は Unity に近く、Viewport の操作は Blender に近い。
左に Viewport を置き、その下に Timeline、Data、Console、Profiler をタブで並べる。
右は2列で、左の列の上に Hierarchy、下に Assets、右の列に Inspector を置く。
パネルの境目はドラッグで動かせ、大きさはブラウザに保存される。

| 場所 | 内容 |
|---|---|
| Toolbar（上） | 左にプロジェクトの名前、開いている Scene と未保存の印（●）、Branch。真ん中に ▶（Play）、❚❚（Pause）、全画面のボタン（Fullscreen）。右に Save、Save As…、Publish |
| Viewport（左） | 上に View、Translate・Rotate・Scale、Gizmos、Overlays、Render のメニューと Stats のボタン。右上に View Helper と、その下の Perspective・Orthographic の切り替え。クリックでオブジェクトを選ぶ |
| Timeline（下のタブ） | Camera Track、Activation Track、Animation Track（下の「Scene と Timeline」） |
| Data（下のタブ） | プロジェクトのモックデータの Time、Speed、種類、Receive Now |
| Console（下のタブ） | データの受信、警告（見つからないアセットなど）、エラー、保存と Publish の結果 |
| Profiler（下のタブ） | 性能のグラフ（下の「Stats と Profiler」） |
| Hierarchy（右の左列の上） | Scene の中のオブジェクトの一覧。Models、Lights、Environment、Components、Empties、Cameras に分ける。Search で絞り込み、「＋」で追加する |
| Assets（右の左列の下） | Scene の中のマテリアル（Materials）と、`content/` の中の `.glb`、テクスチャ、HDRI、Scene のファイルの一覧 |
| Inspector（右の右列） | 選んだものの設定 |

Inspector は、選んだものの設定だけを表示する。
Scene 全体の設定（環境光、背景、霧、トーンマッピング、影、ポストプロセス）は Hierarchy の Environment を、マテリアルは Assets の Materials の項目を選んで表示する。
保存と Publish の結果は、Console に書き、画面の下にも数秒表示する。

### スタジオで扱わないもの

スタジオには、キーフレームとカーブを編集する画面が無い。
動きは次のどれかで付ける。

- モデルの動きは、glb に書き出した AnimationClip（以下、Clip）を名前で再生する。
- コンポーネント（流れる粒子のような、プロジェクトの `src/` にコードで書いたもの）の形と動きはコードが決め、スタジオではコードが公開したパラメーターを変える。
- カメラの動きもコードが決め（Motion）、スタジオでは動きの種類とパラメーターを選ぶ。
- Timeline で決めるのは、カメラの順番と長さとブレンド、表示する区間、Clip を再生する区間だけ。

コンポーネント、カメラの動き、シェーダー、ポストエフェクトの書き方は [scripting.md](scripting.md) にある。

## Scene と Timeline

見せ方の切り替え（全体を見せる、一部に寄る）は、Scene（ファイル）の切り替えではなく、1つの Scene の中のアニメーションとして組む。
Scene ごと切り替えると、そのたびに 3D を読み直し、カメラもつながらないため。

| 名前 | 内容 |
|---|---|
| Scene | `*.stage.json` 1つ。アセット（3D モデル、ライト、コンポーネント、カメラ、2D UI）をどう組み立て、どう見せるかのすべて。Timeline も含む |
| Timeline | Play の Timeline は、時間に沿ってカメラと表示・非表示を動かし、常にループする。長さは Camera Track の合計。ほかに Event Timeline をいくつでも追加できる（下の「Event Timeline」） |
| Camera Track | カメラを並べる。ブロックの右端の斜線が次のカメラへのブレンドで、最後のカメラの斜線は最初のカメラへのブレンド。カメラは Motion でショットの間も動き続け、ブレンドは動いている2つのカメラの間を補間する |
| Activation Track | 2D UI のパーツ、モデル、コンポーネント、ライトごとに1本。表示する区間（Clip）を置く。Clip ごとに Fade In と Fade Out の長さを指定する |
| Animation Track | glb の Clip を、区間の中で頭から再生する。Play の Timeline では、ループの決まった時刻に再生する（カメラが寄ったときに扉が開く、など） |

2D UI は、プロジェクトのコードが描く HTML のオーバーレイである。
2D UI のパーツ（`overview` など）は、2D UI のコードが名前を付けて登録し、スタジオはその中から選ぶ。
画面の区切りは、2D UI のパーツの Activation Track の区間で作る。

3D のモデルとコンポーネントは、ランタイムでは表示・非表示を切り替えるだけで、フェードしない（半透明の描画は重いため）。
フェードさせたいオブジェクトは、コンポーネントのコードで Activation Track の値を読んで透明度や大きさに当てる（[scripting.md](scripting.md)）。

| 動かしたいもの | 方法 |
|---|---|
| カメラ | カメラの Motion |
| モデルの動き | glb の Clip。常に再生するなら Inspector の Animation、ループの決まった時刻なら Play の Timeline の Animation Track、出来事のときなら Event Timeline の Animation Track |
| マテリアル（色、発光）、ライト、霧、背景、露出 | コンポーネントのコードで、毎フレーム書き換える |
| 組み込みのポストエフェクト（Bloom、Vignette） | パラメーターは固定。動かすなら、同じ効果をポストエフェクトとしてコードで登録する |
| Timeline の時刻に合わせた動き | コンポーネントのコードで、Timeline の再生位置を読む |

コードで書く方法は [scripting.md](scripting.md) にある。

### Event Timeline

出来事が起きたときに1回だけ再生する Timeline。
一覧に1件増えたら、その項目に出現のアニメーションを見せる、のように、いつ起きるか決まっていないものに使う。

| 名前 | 内容 |
|---|---|
| Event | Timeline の名前。組み込み先のコードは、この名前で直接再生できる。Event Timeline どうしで名前を重ねない（Publish が止まる） |
| Trigger | Timeline を再生する条件。List Change（標準）、プロジェクトが登録したもの、None（直接呼んだときだけ）のどれか |
| Key | どのスロットの出来事か（一覧の要素の id など）。Trigger が決める |
| `<コンポーネント> [Key]` | Track の対象。Key のスロットのオブジェクトを指す。オブジェクトをスロットとして並べるコンポーネントだけが表示する |
| Length | 一番遅く終わる Clip の終わり。そこで再生が終わる |

スロットは、コンポーネントが並べたオブジェクトの1つずつに、データの Key を対応させたものである。

再生の仕様。

- Trigger は、データを受信するたびに、前の受信と今の受信を比べる。最初の受信と、スタジオで Time を動かしたときは比べない。
- 同じ受信で2つのスロットに Event が起きたら、スロットごとに並行して再生する。同じスロットの再生中にまた起きたら、頭から再生し直す。
- Event Timeline には Camera Track を置かない。Play の Timeline のカメラワークは止まらない。
- Play の Timeline と並行して再生する。❚❚（Pause）のときは、Event Timeline も止まる。
- 組み込み先のコードから直接呼ぶ Event は、Trigger を None にする。データでも再生すると、直接呼んだ後に同じ変化が届いたとき、もう一度再生される。直接呼ぶ方法は [scripting.md](scripting.md) にある。
- 起きてから Length より長く待たされた Event は捨てる。ブラウザはタブが隠れている間は描画を止めるので、戻ったときに古い出来事のアニメーションがまとめて再生されないようにするため。
- 値が分からないことのある項目は、データの型で、分からない状態を `null` にし、From を `true`・`false` にして組む（`active` なら、オンライン・オフライン・不明のうち、不明を `null` にする）。From を空にすると、不明に変わっただけでも再生される。

表示の仕様。
止まっているときの見た目は常にデータから決め、Event Timeline は2つの状態の間をつなぐだけにする。
表示を長く続けても、途中から開いても、受信が抜けても、見た目がデータとずれないようにするため。

| オブジェクト | Event の Clip の中 | Event の Clip の外 |
|---|---|---|
| `[Key]` のオブジェクト | 表示する（データで隠れていても） | データのまま（コンポーネントがデータで隠したオブジェクトなど） |
| ほかのオブジェクト、2D UI のパーツ | 表示する | Play の Timeline に Track があれば、そのとおり。無ければ表示しない（Event のためのオブジェクト） |

Inspector の Visible（Rendering）は、Unity の GameObject の有効・無効と同じく、Track の区間が無い所での表示を決める。
Visible を外したオブジェクトも、Activation Track（Play の Timeline と Event Timeline）の区間の中では表示する。
Hierarchy の Hide のアイコン（目の形）で隠したオブジェクトは、Unity の Scene ビューの非表示と同じく、スタジオの Viewport でだけ、Track に関係なく隠す。

Animation Track の Clip は、区間を出るか再生が終わると止まり、Clip で動かす前の位置と回転に戻る。
Clip で動いたオブジェクトが Clip の後に隠れているなら、それはデータで隠れたからで、Clip の終わりの位置に残るのではない。
マテリアルの値のアニメーション（KHR_animation_pointer）は再生できない。

### Empty

名前の付いた、形の無い点。
three.js では形の無い Object3D で、Blender の Empty、Unity の空の GameObject に当たる。

| 使い道 | 内容 |
|---|---|
| 2D UI のラベル | 2D UI の要素を、その点の画面上の位置に追従させる（[scripting.md](scripting.md)） |
| カメラとライトの Target | Target にオブジェクトを指定すると、その位置に向ける。Empty が動けば向きも変わる |
| コンポーネントの接続先 | 流れる粒子の始点・終点のように、オブジェクトの名前を指すパラメーターで選べる |

Parent を指定すると、そのオブジェクトの位置に Offset を足した所に置く（回転と大きさは受け継がない）。
Parent を変えても、Empty はその場に留まるように Offset を付け替える。

### Aspect Ratio

組み込み先で描く範囲（以下、出力フレーム）の縦横比。
Render Settings の Output で、数字を入力して変える。既定は 16:9（Unity の Game ビューの Aspect と同じ考え方）。
2D UI のステージは、高さ 1080 で、幅をこの比で決める（16:9 なら 1920 × 1080）。
Edit の Viewport では、Overlays の Aspect Ratio で出力フレームを重ねて表示し、Play と組み込み先では出力フレームだけを描く。
カメラの FOV は、出力フレームに対する縦の画角。

## Stats と Profiler

性能の数字は2か所に表示する。

| 場所 | 内容 |
|---|---|
| Stats（Viewport の右上） | 数字だけを表示する（Unity の Game ビューの Stats、Blender の Statistics に当たる）。fps とフレーム時間、CPU と GPU の時間、Calls・Triangles・Geometries・Textures（three.js の `renderer.info`）、JS Heap と GC Alloc。Viewport の上の右端の Stats のボタンで表示・非表示を切り替える。View Helper を表示している間は、その左に並ぶ。Edit でも Play でも表示でき、全画面のときは入る前の表示・非表示のまま |
| Profiler（下のタブ） | Unity の Profiler と同じく、項目ごとのグラフを縦に並べる。左に項目の名前と今の値、右に直近60秒。Frame Time、CPU / GPU、JS Heap、GC Alloc、Calls。上限の線を点線で引く。スタジオを開いた時から、タブを閉じていても1秒に4回記録している |

| 項目 | 測り方 |
|---|---|
| fps とフレーム時間 | `requestAnimationFrame` の間隔。Render の Frame Rate が 30 fps のときは 33.3ms にそろい、重さが見えないので、測るときは Unlimited にする |
| CPU の時間 | 1フレームの JavaScript の時間 |
| GPU の時間 | WebGL2 の GPU タイマーの拡張（`EXT_disjoint_timer_query_webgl2`）。使えない環境では「―」と表示する |
| Calls、Triangles | three.js の `renderer.info` |
| Geometries、Textures | `renderer.info.memory` の数。GPU のメモリそのものを読む API はブラウザに無い |
| JS Heap | Chrome の `performance.memory`。使えない環境では「―」と表示する |
| GC Alloc | ページの JavaScript から GC そのものは見えない。ヒープが急に減った所を GC が走った所とみなし、GC と GC の間にヒープが1秒あたりどれだけ増えるかを MB/s で表示する（Unity の Profiler の GC Alloc に当たる）。正確な内訳は DevTools の Performance で見る |

上限を超えた数字は色を変えて表示する。
フレーム時間と CPU・GPU の上限は、描画の高さが 1080 のとき 12ms、720 のとき 6ms、JS Heap の上限は 1 GB。
上限の考え方と、長時間のメモリの検査（`three-stage soak`）は [performance.md](performance.md) にある。

## モード

▶ を押している間が Play、もう一度押すと Edit に戻る（Space でも同じ）。
❚❚（Pause）は、Edit でも Play でも、動いているものをすべて止める。
止まるのは、コンポーネントがコードで動かしているもの（回転、流れ）、glb の Clip、Timeline の再生、モックデータの時刻。
描画は続くので、止めたまま視点を動かし、オブジェクトを選んで動かせる。
もう一度押すか、▶ でモードを切り替えると動き出す。

| モード | Viewport | カメラ | データ |
|---|---|---|---|
| Edit | 自由な視点。出力フレームを重ねて表示する。表示・非表示は Timeline の再生位置の時点のもの。コンポーネントの動きは見えるが、glb の Clip は再生しない | Blender と同じ操作で動かす | 止めた時刻の値 |
| Play | 組み込み先と同じ。Camera Track と Activation Track がループし、データ受信時のアニメーションが動く | Camera Track のとおり | モックデータが流れる |
| Pause | そのモードのまま、動きを止める | 止めた所 | 止めた時刻の値 |

Play の間も Inspector は使え、変えた値は Scene の変更として残る。
Unity と違い、Play を止めても値は戻らない。

### 全画面

Toolbar の Fullscreen か F11 で、Play の Viewport を画面全体に表示する。
組み込み先での見え方（ステージと 2D UI だけ）を確認するためのもの。

| 項目 | 内容 |
|---|---|
| 入る | Edit からでも Play からでも全画面にできる。Edit から入ると Play も始まる。Play の途中で入っても、再生は途切れない |
| 表示するもの | ステージと 2D UI。画面と縦横比が違えば、余りは黒で埋める。Stats は、入る前の表示・非表示のまま（全画面の中では切り替えない） |
| 表示しないもの | Toolbar、パネル、画面の下の通知 |
| キー | Esc で抜けて、Play のまま元の画面に戻る。ほかのキー（Space、Ctrl＋S、Ctrl＋Z も）は効かない |

ブラウザの全画面機能を使うので、`--no-open` で起動したサーバーをブラウザで開いたときも同じに動く。
ブラウザによっては F11 をブラウザ自身の全画面が使うので、そのときは Fullscreen のボタンで入る。

## キーボードとマウスの操作

Viewport の操作（キー、修飾キー、マウスのボタンの割り当て）は Blender に合わせている。

| 操作 | キー |
|---|---|
| Translate・Rotate・Scale | G・R・S。オブジェクトを選び、マウスを Viewport に置いて押す。続けて X・Y・Z で軸を絞り、数字を入力すると値で決まる。Ctrl を押している間は刻み（0.1m、5°、0.1）に合わせる。左クリックか Enter で確定し、右クリックか Esc で取り消す。操作中は、画面の下に操作の名前と軸と値を表示する |
| 複製 | Shift＋D。複製した後、マウスが Viewport の上にあればそのまま G の移動になる |
| 削除 | X か Delete。削除は確認せず、Ctrl＋Z で戻す |
| すべて選ぶ・選択を解除する | A・Alt＋A。A で選ぶのは glb のオブジェクトと置いたモデル |
| 非表示・すべて表示 | H・Alt＋H |
| 名前の変更 | F2 |
| 元に戻す・やり直し | Ctrl＋Z・Ctrl＋Shift＋Z（Ctrl＋Y でも） |
| 決まった向きから見る | テンキーの 1・3・7（正面・右・上）。Ctrl を足すと反対側から。Orthographic に切り替わり、視点を回すと元の投影に戻る（Blender の Auto Perspective） |
| Perspective・Orthographic の切り替え | テンキーの 5 |
| 寄る・離れる | テンキーの +・- |
| 選んだオブジェクトに寄る・全体に寄る | テンキーの .・Home |
| カメラから見る（Look Through） | テンキーの 0。選んだカメラ、選んでいなければ最初のカメラ。Perspective に戻る |
| 選んだカメラを今の視点に合わせる（Align With View） | Ctrl＋Alt＋テンキーの 0（Blender の Align Active Camera to View）。Target にオブジェクトを指定していれば、Position と FOV だけを変える |
| 再生する・やめる | Space |
| 全画面で再生する（Fullscreen） | F11。抜けるのは Esc だけ |
| 保存 | Ctrl＋S（Save と同じ） |
| スポイトをやめる | Esc |

視点のキー（テンキー、.、Home）は、Blender と同じく、マウスが Viewport の上にあるときだけ効く。
文字の入力欄に入力している間は、マウスがどこにあってもスタジオのキーは効かない（Ctrl＋S は効く）。
テンキーの無い PC のために、数字キーもテンキーと同じに効く（Blender の Emulate Numpad）。
Hierarchy の Search などに数字を入力しても、視点は変わらない。

| 視点の操作 | マウス |
|---|---|
| 回す | 中ボタンでドラッグ。または Alt＋左ドラッグ |
| 平行移動 | Shift＋中ボタンでドラッグ。または Shift＋Alt＋左ドラッグ |
| 寄る | ホイール |

Alt＋左ドラッグは、Blender の Emulate 3 Button Mouse と同じ代わりの操作。
ギズモ（Transform Controls）の種類は、Viewport の上の Translate・Rotate・Scale で選ぶ。
ギズモは Ctrl を押しながら動かすと、Translate 0.1m、Rotate 5°、Scale 0.1 の刻みに吸着する。
ライトと Empty のギズモは、Translate だけ。

Inspector の数値の欄は、ラベルを左右にドラッグしても変わる（Unity と同じ）。
Shift を押しながらだと細かく、Ctrl を押しながらだと刻みに合わせて変わる。

## 各エリアの操作

`.glb` は、書き出したときの位置のまま読む。
Viewport でオブジェクトを動かした分は、オブジェクトの名前ごとの上書きとして Scene に保存する。
DCC ツールでオブジェクトの名前を変えると、その上書きは当たらなくなる。

元に戻す（Ctrl＋Z）とやり直し（Ctrl＋Shift＋Z）は、Scene への変更すべてに効く。
履歴は、スタジオを開いている間だけ保持する。

保存は、Save（Ctrl＋S も同じ）を押したときだけ行う。自動では保存しない。
未保存の変更があることは、Toolbar の Scene の右の ● で示す。
変更を取り消すのは Ctrl＋Z で、保存した状態に戻すだけのボタンは無い。
削除は確認せず、Ctrl＋Z で戻す。
確認のダイアログを表示するのは、次のときだけ。

| とき | ダイアログのボタン |
|---|---|
| 保存していない変更があるまま、別の Scene を開く、Publish する、ブランチを切り替える | Save、Don't Save、Cancel |
| Assets に同じ名前のファイルを追加する（Replace File） | Replace、Cancel |

開いている Scene のファイルが外で書き換えられたとき（エディタや AI のエージェントがファイルを直したとき、git でブランチを切り替えたとき）は、保存していない変更が無ければ、そのまま読み直す。
保存していない変更があれば読み直さず、Toolbar に `The file was changed externally` と Reload のボタンを表示する。
Reload で読み直すと保存していない変更は消えるが、読み直す前の状態にも Ctrl＋Z で戻せる。

### Toolbar

| できること | 内容 |
|---|---|
| 最初の画面に戻る | 左端のプロジェクトの名前を押す（アプリケーションのウィンドウのとき） |
| Scene を開く・切り替える | Scene で、`content/scenes/` の `*.stage.json` をファイル名で選ぶ（`main.stage.json`）。増やすときは Save As… か、`content/scenes/` にファイルを置く。同時に開けるのは1つ |
| Save As… | ダイアログでファイル名を入力し、今の Scene を、未保存の変更ごと別の名前で保存し、そちらを開く。元の Scene は保存した状態のまま残る。同じ名前のファイルがあれば、ダイアログの中で知らせて保存させない |
| 再生する・止める | ▶（Play）と ❚❚（Pause） |
| 全画面で再生する | Fullscreen。上の「全画面」 |
| ブランチ | Branch に、プロジェクトのフォルダの git のブランチを表示する。下の「ブランチ」 |
| 保存 | 未保存の印（●）と Save。外で書き換えられたときだけ Reload を表示する |
| Publish | 検査をして、通ればシーンのバンドルを `dist/bundle/` に書き出す。結果は画面の下と Console に表示する。出力の形式は [scene-format.md](scene-format.md) にある |

### ブランチ

プロジェクトのフォルダが git リポジトリの中にあると、Toolbar の Branch に今のブランチを表示する。
既定のブランチは読み取り専用で、編集はブランチの上で行う（変更をブランチで行い、プルリクエストで既定のブランチに取り込む進め方）。
プロジェクトのフォルダが git リポジトリの中に無いとき（git をインストールしていない PC も）は、Branch を表示せず、いつでも編集できる。

| できること | 内容 |
|---|---|
| 今のブランチを見る | Branch の右に名前を表示する。外で（git のコマンドなどで）切り替えられたら、名前が変わり、画面の下に知らせる |
| 既定のブランチは見るだけ | `origin` の既定のブランチ（`origin` が無ければ `main` か `master`）と、ブランチの上にいないとき（detached HEAD）は Read Only。編集、Save、Save As…、Assets へのファイルの追加はできない。Publish はできる |
| 切り替える | Branch を押すと、ローカルのブランチと、`origin` にだけあるブランチ（押したときに `git fetch` する）が並ぶ。選ぶと `git checkout` で切り替え、画面を読み直す |
| 作る | New Branch… で名前を入力すると、既定のブランチ（取得できれば `origin` の最新）から作って、切り替える |

`git checkout` なので、プロジェクトのフォルダだけでなく、リポジトリ全体が切り替わる。
commit していない変更（追跡しているファイルの変更）があるときは、切り替えも作成もせず、そのファイルを知らせる。
commit と push はスタジオでは行わない。
別のフォルダ（`git worktree`）で使われているブランチは git が切り替えさせないので、アプリケーションのウィンドウではそのフォルダのプロジェクトを開き直す。

### Viewport の上のメニュー

| メニュー | 内容 |
|---|---|
| View | Blender の View に当たる。Projection（Perspective、Orthographic）、Viewpoint（Top、Bottom、Front、Back、Right、Left、Camera）、Frame Selected、Frame All。右の列にショートカットを表示する。Play の間は使えない |
| Translate・Rotate・Scale | ギズモの種類 |
| Gizmos | Blender の Viewport Gizmos に当たる。一番上の Gizmos でギズモすべての表示・非表示を切り替え、その下で1つずつ選ぶ。Viewport Gizmos は View Helper（右上の X・Y・Z の軸。端を押すとその向きから見る）と Transform Controls。Object Gizmos は Light Helpers（ライトの種類が分かるアイコンと、向きの点線）と Empties |
| Overlays | Blender の Viewport Overlays に当たる。Guides は Grid と Axes（X・Y・Z を1つずつ）。Geometry は Wireframe。Output は 2D UI と Aspect Ratio。Grid と Wireframe は Edit でだけ表示する |
| Render | 組み込み先での描画の条件を選んで見る。スタジオで見るためだけの選択で、Scene には保存しない。Quality は High・Low、Resolution は高さ 1080・720（幅は Aspect Ratio から決まる）・Dynamic Resolution、Frame Rate は 30 fps・Unlimited。一番下の Render Settings… で設定の画面を開く |
| Stats | 右上の Stats の表示・非表示 |

既定は、Quality が High、Resolution が高さ 1080、Frame Rate が 30 fps、Stats が表示。

### Render Settings

Unity の Project Settings の Quality と同じく、左に項目、右に設定を表示する画面。
変えた値は Scene に保存され、組み込み先でも同じ設定で描画する。

| 項目 | 内容 |
|---|---|
| Output | Aspect Ratio（既定は 16:9。数字を入力して変える）。Resolution は Aspect Ratio と高さ 1080 から決まり、表示だけ。Frame Rate は 30 fps で、表示だけ |
| Quality | High と Low を切り替えて、それぞれの Max Resolution（高さ 1080・720・540）と Shadow Map Scale（100%・50%・25%）を決める。既定は High が 1080 と 100%、Low が 720 と 50% |
| Dynamic Resolution | 遅いフレームが続いたときに下げる先（Minimum Resolution。高さ 720・540）と、遅いとみなすフレーム時間（Frame Time Threshold。20〜200ms）。既定は高さ 720 と 40ms。直近60フレームのうち12を超えるフレームが遅ければ下げ、戻さない |

### Viewport（Edit）

| できること | 操作 |
|---|---|
| 選ぶ | クリック。Shift＋クリックで追加する。Hierarchy の選択と連動し、Inspector に設定を表示する |
| Translate・Rotate・Scale | G・R・S（上の「キーボードとマウスの操作」）。ギズモをドラッグしてもよい。glb に書き出したときの位置に戻すのは、Inspector の Transform の Reset |
| 複製・削除・非表示 | Shift＋D・X・H と Alt＋H |
| モデルを置く | Assets から `.glb` をドラッグすると、ドロップした所の地面かオブジェクトの表面に置く |
| ライトを動かす | ライトは Light Helpers のアイコンで表示され、選んで動かす。DirectionalLight と SpotLight は、Target で向きを決める |
| Empty を置く | Hierarchy の「＋」で Empty を追加し、Viewport で動かす。Parent を指定すると、そのオブジェクトと一緒に動く。Parent のある Empty も、ギズモと G はワールドの位置で動かし、Scene には Parent からの Offset で保存する |
| スポイトで選ぶ | Inspector の欄の右のスポイトのアイコンを押すと、画面の上に `Click an object in the Viewport to pick it` と `Esc to cancel` が表示される。オブジェクトをクリックすると、その名前が入る（流れる粒子の接続先、Empty の Parent、Target など）。Esc でやめる |
| 視点を動かす | 上の「キーボードとマウスの操作」の、視点の操作 |
| 決まった向きから見る | テンキーの 1・3・7、View の Viewpoint、View Helper の軸の端 |
| Perspective・Orthographic の切り替え | テンキーの 5、View の Projection、View Helper の下のボタン。Edit の視点だけの切り替えで、Scene には保存しない。Orthographic は、注視点の所で Perspective と同じ広さが映る大きさで描き、寄ると狭くなる |
| 選んだオブジェクトに寄る | テンキーの . か、View の Frame Selected |
| Look Through・Align With View | テンキーの 0 か、Timeline か Hierarchy でカメラをダブルクリックすると、そのカメラから見る。Ctrl＋Alt＋テンキーの 0 で、選んだカメラを今の視点に合わせる |

カメラを調整するときは、Look Through でそのカメラから見て（Blender のカメラ視点と同じ）、視点を動かしてから Align With View を押す。

スタジオでは、モデリング（頂点の編集）と親子付けはしない。
コンポーネントが並べたオブジェクト（数に合わせて並べるオブジェクトなど）は、1つずつは動かせない。
並べる基準の位置はギズモで動かし、間隔や列の数は Inspector のパラメーターで変える。

### Viewport（Play）

| できること | 内容 |
|---|---|
| 組み込み先と同じ動きを見る | Camera Track と Activation Track のループ、データ受信時のアニメーション、モックデータの流れ |
| 見ながらパラメーターを変える | Inspector はそのまま使える。変えた値は保存の対象になる |
| 時刻と速さを変える | Data タブ |

Play の間は、Viewport でクリックしてオブジェクトを選べない。選ぶときは Hierarchy から選ぶ。
カメラは Camera Track のとおりに動き、手では動かせない。

### Timeline

Unity の Timeline と同じく、左にトラックの見出し、右にトラックを表示する。
上から、目盛り（左に表示する Timeline の選択、「＋」、全体の秒数）、Camera Track、Activation Track と Animation Track（追加した数だけ）、Add Activation Track、Add Animation Track。
選択の Play が、ループする Timeline。ほかは Event Timeline で、選ぶと Inspector に Trigger が表示される。

| できること | 操作 |
|---|---|
| カメラを追加する | Camera Track の見出しの「＋」（Hierarchy の「＋」の Camera と同じ）。今の視点から作り、選んでいるカメラの後ろ、選んでいなければ最後に入る。新しいカメラの Motion は Drift |
| カメラを並べ替える | ブロックをドラッグすると、隣のブロックの真ん中を越えたところで入れ替わる |
| Duration を変える | ブロックの右端をドラッグする（0.1 秒刻み、Ctrl で 0.5 秒刻み。最短 0.5 秒） |
| Blend を決める | ブロックの右の斜線が、次のカメラへの Blend。斜線の左端をドラッグして変える（0.05 秒刻み、Ctrl で 0.5 秒刻み）。Easing は Inspector で選ぶ |
| ループを見る | 全体の終わりに点線を引き、その右に最初のカメラを薄く表示する。最後のカメラの斜線が、最初のカメラへの Blend |
| Activation Track を追加する | Add Activation Track から、2D UI のパーツか、オブジェクト（glb のオブジェクト、置いたモデル、コンポーネント、ライト）を選ぶ。1つの対象に Track は1本 |
| Animation Track を追加する | Add Animation Track から、glb のオブジェクトか置いたモデルを選ぶ。Clip は Play の間だけ再生し、Edit で目盛りをドラッグしても再生しない（Edit ではオブジェクトの位置を調整するため） |
| Clip を追加する | トラックを右クリックして Add Clip、かトラックの空いた所をダブルクリック。Activation Track には押した所から 5 秒の Clip、Animation Track には glb の最初の Clip をその長さで置く |
| Clip を動かす・長さを変える | Clip をドラッグすると動き、左端と右端をドラッグすると Start と End が変わる（0.1 秒刻み、Ctrl で 0.5 秒刻み）。Activation Track の Clip は、Inspector で Fade In と Fade Out を決める。2D UI のパーツの Clip は、フェードを Clip の頭と終わりの三角で示す |
| Track を削除する | 見出しを右クリックして Delete。Clip は選んで X か Delete |
| 動きを確認する | 目盛りをドラッグすると、Edit のままその時点のカメラと表示・非表示になる。Play はその位置から始まり、Play の間に目盛りを押すと再生位置が移る |
| カメラを調整する | ブロックを選ぶと Inspector にカメラが表示される。ダブルクリックでそのカメラから見る |

Activation Track の無いものは、常に表示する。
Track があるものは、Clip の中だけ表示する。
Clip は Timeline の頭からの秒数で位置を決め、ループの終わりを越えた所は使わない。
データ受信時のアニメーションのきっかけはデータの受信で決まるので、Timeline には置かない。

Event Timeline を表示しているとき。

| できること | 操作 |
|---|---|
| Event Timeline を追加する | 目盛りの左の「＋」。名前は Event（重なれば番号を付ける）、Trigger は List Change |
| Trigger を決める | Inspector の Trigger で Type を選び、パラメーターを入力する。項目が非アクティブになったら再生するなら、List Change で List（`items`）、Key（`id`）、Field（`active`）、From（`true`）、To（`false`）。アクティブになったら再生するなら、From と To を逆にする。From と To を空にすると、値が変わればいつでも再生する |
| Track を追加する | Add Activation Track と Add Animation Track。どちらも、Key のスロットのオブジェクト（`<コンポーネント> [Key]`）を選べる |
| Animation の Clip を追加する | Animation Track を右クリックするか、空いた所をダブルクリック。glb の最初の Clip を、その長さで置く。Inspector で Clip を選び直すと、区間がその Clip の長さになる |
| 再生して確認する | Inspector の Event の Key にスロットの Key を入力して Play。空なら、今のデータの最初の Key。Edit のままでも再生する。再生の間だけ、目盛りに再生位置が表示される |
| データで確認する | Data の Time を出来事の少し前にして Play。Console に `Played <Event>  Key <Key> (data change)` と表示される |
| 削除する | Event Timeline を選んだ状態で X か Delete。Ctrl＋Z で戻る |

Event Timeline では、目盛りをドラッグしてその時点の見え方にすることはできない（Key を決めないと見え方が決まらないため）。

### Console

| できること | 内容 |
|---|---|
| ログを見る | データの受信（時刻と、プロジェクトが決めた値の要約）、コンポーネントの警告とエラー、見つからないアセット、保存と Publish の結果、Event Timeline の再生 |
| 元のオブジェクトを選ぶ | オブジェクトに関わるログをクリックすると、そのオブジェクトを選ぶ |
| 絞り込む・Copy・Clear | 種類（Info・Warning・Error）のボタンで表示・非表示を切り替える。ボタンには種類ごとの件数を表示する。Copy で表示中のログをテキストとしてコピーする。Clear でログを消す |

### Data

プロジェクトがコードで登録したモックデータを動かす（登録の方法は [scripting.md](scripting.md)）。
スタジオはデータの内容を知らず、時刻と種類を渡して値を受け取るだけ。
登録していないプロジェクトでは、`No mock data registered` と表示する。

| できること | 内容 |
|---|---|
| Time | 1日（00:00〜23:59）のスライダー。Edit と Pause の間は、この時刻の値で止まる |
| Speed | Play で時刻が進む速さ。×0・×1（実時間）・×10・×60（1分で1時間）・×300 |
| 種類を選ぶ | プロジェクトが決めた種類（ラベルもプロジェクトが決める）。種類が1つなら表示しない |
| Receive Now | 次の受信を待たずに、受信したときの動き（データ受信時のアニメーション）を見せる。横に今の値の要約を表示する |

データの形、1日分の値、受信の間隔は、プロジェクトのコード（`src/` の中）に書く。
画面からは設定しない。

### Hierarchy

| できること | 操作 |
|---|---|
| 一覧を見る | Models、Lights、Environment、Components、Empties、Cameras に分けた一覧。Models には、Scene に追加した `.glb` ごとにその中のオブジェクトと、Viewport に置いたモデルが並ぶ。Search で絞り込める |
| 選ぶ | クリック。Shift か Ctrl で複数選ぶ。Viewport の選択と連動する |
| 名前の変更 | ダブルクリックか F2、または右クリックの Rename。カメラはダブルクリックでそのカメラから見る |
| 非表示・選択の無効化 | Hide のアイコン（目の形）で非表示にする。Lock のアイコンで Viewport から選べなくする（台座のように動かさないものに使う）。どちらも Viewport だけの切り替えで、Scene には保存しない |
| 追加する | 「＋」から、Light（DirectionalLight、PointLight、SpotLight、HemisphereLight）、Components（プロジェクトが登録したコンポーネント）、Camera（今の視点から）、Empty |
| `.glb` を Scene に追加する | Assets から `.glb` を Hierarchy にドラッグすると、ファイルの中のオブジェクトを書き出したときの位置のまま追加する（Viewport にドラッグしたときは、1つのモデルとして置く） |
| 複製・削除 | 右クリックの Duplicate・Delete か Shift＋D・X |
| `.glb` を Scene から外す | `.glb` の行を右クリックして Remove from Scene。Show in Explorer でファイルの場所を開く |

glb のオブジェクトは、複製も削除もできない（元の DCC ツールで消して書き出し直す）。
カメラと Environment は、非表示にできない。
コンポーネントが並べたオブジェクトは、まとめて1行に表示する（`Items ×8`）。
ドラッグでの親子付けはしない。

### Assets

| できること | 操作 |
|---|---|
| 一覧を見る | `content/` の `glb/`、`textures/`、`hdr/`、`scenes/` を一覧にする。どのファイルも大きさを表示し、`.glb` はポリゴン数も表示する |
| マテリアル | 一番上の Materials に、Scene の中のマテリアルを表示する。押すと Inspector に設定を表示する。「＋」で作る（MeshStandardMaterial、MeshPhysicalMaterial と、プロジェクトが登録したシェーダー）。「＋」の Delete Unused で、使われていないマテリアルをまとめて削除する |
| ファイルを追加する | エクスプローラーからファイルを Assets にドロップすると、拡張子に合ったフォルダにコピーする。同じ名前があれば Replace File のダイアログを表示し、置き換えると使っている所がすべて読み直される |
| Scene に置く | `.glb` を Viewport にドラッグすると、ドロップした所に置く。数に合わせて並べるパーツは、並べるコンポーネントの Model の欄（Inspector）にドラッグする |
| テクスチャを貼る | テクスチャを、Inspector のマテリアルの Textures の欄にドラッグする |
| 環境光を変える | Hierarchy の Environment を選び、HDRI を Inspector の HDRI の欄にドラッグする |
| 空を切り替える | 2枚目の空（光の位置が同じで色合いの違う空など）を HDRI B の欄にドラッグし、Blend で見比べる。データで切り替えるのはコンポーネントのコード（[scripting.md](scripting.md)） |
| Scene を開く | `scenes/` の `*.stage.json` をダブルクリックする |
| 読み直す | ファイルが変わると自動で読み直す。DCC ツールから書き出し直したときも同じ |
| Show in Explorer | 見出しの Show in Explorer で `content/` を、ファイルを右クリックした Show in Explorer でそのファイルの場所を開く。ファイルの名前の変更と削除はエクスプローラーで行う |

追加できるのは `.glb`、`.png`、`.jpg`、`.ktx2`、`.hdr`、`.exr`。
追加はコピーするだけで、取り込み時の変換や設定は無い。
テクスチャとジオメトリの最適化は、スタジオでも Publish でもかけない（[scene-format.md](scene-format.md)）。
圧縮した `.glb`（Draco、Meshopt、KTX2 のテクスチャ）と `.ktx2` は、そのまま読める。展開に使うデコーダーは、スタジオのサーバーが配信し、Publish がバンドルに含める。

### Inspector

選んだものによって、表示する設定が変わる。
複数選んだときは、最初の1つを表示する。

| 選んだもの | 表示するもの |
|---|---|
| glb のオブジェクト | Transform（Position、Rotation、Scale と、glb の位置に戻す Reset）、Material（マテリアルスロットごとの割り当て）、Rendering（Visible、Cast Shadow、Receive Shadow）、Animation（Clip、Loop。glb に Clip があるとき） |
| 置いたモデル | Transform、Model（File）、Material、Rendering（Cast Shadow、Receive Shadow）、Animation（Clip、Loop。glb に Clip があるとき） |
| `.glb` のファイル（Hierarchy の Models の行） | glb（Objects、Tris、Clips） |
| ライト | Light（Color、Intensity、Ground Color、Distance、Decay、Angle、Penumbra、Target、Target Position のうち、ライトの種類にあるもの）、Transform の Position、Shadow（Cast Shadow、Map Size、Radius、Bias、Normal Bias、Camera Size） |
| コンポーネント | コンポーネントの名前の節に Enabled とパラメーター（コードの定義から作る）、Binding（データとの結び付けと、接続先のオブジェクト）、Transform |
| Empty | Transform（Parent があれば Offset、無ければ Position）、Empty の Parent（一覧かスポイトで選ぶ。コンポーネントが並べた1つずつ、例えば `Items 3` も選べる） |
| カメラ | Camera（Position、Target、Target Position、FOV と、Look Through、Align With View のボタン）、Timeline（Duration、Blend、Easing）、Motion（Type と、その動きのパラメーター） |
| Activation Track の Clip | Start、End、Fade In、Fade Out |
| Animation Track の Clip | Clip、Start、End |
| Event Timeline | Timeline（Name、Length）、Trigger（Type とパラメーター）、Event（Key と Play のボタン） |
| Environment（Hierarchy） | Environment（Room Environment・HDRI・None、HDRI、HDRI B と Blend、Environment Intensity、Environment Rotation）、Reflection Probe（Enabled、Position、Resolution）、Background、Fog、Tone Mapping、Shadow Map、Post Processing |
| マテリアル（Assets） | Material（Name、Type とパラメーター）、Textures。シェーダーのマテリアルは、シェーダーのパラメーターと Binding。Select Users、Duplicate、Delete のボタン |

マテリアルスロットは、glb のメッシュに割り当てられたマテリアルの1つずつである。
Material の各スロットでは、Original（glb のマテリアルのまま）か、Scene のマテリアルを選ぶ。
Original のときの Duplicate は、glb のマテリアルを編集できる Scene のマテリアルとしてコピーし、そのスロットに割り当てる。glb に埋め込まれたテクスチャはコピーされないので、`content/textures/` に置いて割り当て直す（Console に警告を表示する）。
Scene のマテリアルを割り当てているときの Select は、そのマテリアルを選ぶ。

マテリアルの Delete は、使っているオブジェクトがあれば、その割り当ても外す。
Select Users は、そのマテリアルを使っているオブジェクトとコンポーネントを選ぶ。

データとの結び付け（Binding）は、データの型の中から選ぶ（例: 一覧の3番の値）。
流れる粒子の接続先のように、オブジェクトを選ぶパラメーターは、一覧から選ぶか、スポイトのアイコンを押して Viewport のオブジェクトをクリックして決める。

Environment の設定。

| 節 | 内容 |
|---|---|
| Environment | 環境光の画像。Room Environment、HDRI、None。HDRI B と Blend で2枚の空を混ぜる |
| Reflection Probe | 周りのオブジェクトの映り込み。既定でオン。Position から周り（空と、ランタイムが描くオブジェクト）を撮影し、映り込みと環境光にする。オブジェクトが増減したとき、表示が変わったとき（Activation Track、Event、データ）、空の Blend が切り替わったとき、Edit で Scene を変えたとき（0.5 秒に1回まで）に撮り直す。1フレームに1面ずつ撮るので、撮り終えるまでは環境光が無い。動いているオブジェクトは撮った時の位置で映る。スタジオの補助線と Empty の印は写らない。Environment が None のときは使わない |
| Background | Color、Environment（Background Blurriness でぼかす）、None |
| Fog | Enabled、Color、Near、Far |
| Tone Mapping | Tone Mapping の種類と Tone Mapping Exposure |
| Shadow Map | Enabled と Type（PCF、VSM、Basic）。VSM のときは PointLight の影を描けないので、PointLight の Cast Shadow は効かず、Console に警告を表示する |
| Post Processing | Bloom、Vignette、FXAA、SMAA のオン・オフとパラメーター。並びは描画の順で決まっていて変えられない。プロジェクトがポストエフェクトを登録していれば、Add で追加し、Remove で外す。重さは [performance.md](performance.md) にある |

## 作業の流れ

1. DCC ツール（Blender など）でモデルを作り、`.glb` をプロジェクトの `content/glb/` に書き出す。スタジオが読み直す。
2. Edit で、カメラから見ながらオブジェクトの位置を調整し、マテリアル、ライト、環境光を決め、コンポーネントを追加してデータと結び付ける。
3. Play で、モックデータの1日を流しながら調整する。
4. Timeline で、カメラの順番と長さとブレンド、2D UI とオブジェクトを表示する区間を決める。
5. 保存し、git にコミットする。
6. 足りないコンポーネントは、プロジェクトの `src/` に書き足す（[scripting.md](scripting.md)）。
7. Publish し、組み込み先と同じ描画だけを表示するページ（`preview.html?bundle=/dist/bundle/manifest.json`）で確認する。

Scene のファイルとコードはテキストなので、エディタや AI のエージェントで直接書き換えてもよい。
開いている Scene は、ファイルが変わると読み直す。
画面を開かずに確認するときは、`three-stage <folder> --no-open` でサーバーだけを起動し、`three-stage shot` と `three-stage measure` を使う（[performance.md](performance.md)）。

## 付録: 他のツールとの用語の対応

スタジオの画面の名前が、three.js、Unity、Blender で何に当たるかの表。
「—」は、同じ意味の項目が見当たらないもの。

### three.js にあるもの

three.js にあるものは、画面でも three.js のクラス名とプロパティ名で呼ぶ。
プロパティ名は単語に分けて頭を大文字にする（`emissiveIntensity` は Emissive Intensity）。
角度だけは、three.js のラジアンを度で表示する（Rotation、Angle、FOV）。

| 画面 | three.js | Unity | Blender |
|---|---|---|---|
| Position、Rotation、Scale | `position`、`rotation`、`scale` | Position、Rotation、Scale | Location、Rotation、Scale |
| Visible | `visible` | GameObject の有効・無効 | Show in Viewports |
| Cast Shadow、Receive Shadow | `castShadow`、`receiveShadow` | Cast Shadows、Receive Shadows | — |
| Parent | `parent` | Parent | Parent |
| DirectionalLight、PointLight、SpotLight、HemisphereLight | 同じ名前のクラス | Directional、Point、Spot | Sun、Point、Spot |
| Color、Intensity（ライト） | `color`、`intensity` | Color、Intensity | Color、Power（単位が W で異なる） |
| Ground Color | HemisphereLight の `groundColor` | 環境光の Gradient の Ground Color | — |
| Distance | `distance`（0 なら無限） | Range | Custom Distance |
| Decay | `decay`（2 が物理的に正しい減衰） | — | — |
| Angle | `angle`（向きから縁までの角度） | Spot Angle（円錐全体の角度） | Angle（円錐全体の角度） |
| Penumbra | `penumbra`（0〜1） | Inner Spot Angle（URP。角度で指定） | Blend（0〜1） |
| Target、Target Position | ライトの `target`、OrbitControls の `target` | — | — |
| Map Size | `shadow.mapSize` | Resolution | — |
| Radius（Shadow） | `shadow.radius` | — | — |
| Bias、Normal Bias | `shadow.bias`、`shadow.normalBias` | Bias、Normal Bias | Bias |
| Camera Size（Shadow） | `shadow.camera` の `left`・`right`・`top`・`bottom` | — | — |
| FOV | `fov`（縦の角度） | Field of View | Field of View |
| MeshStandardMaterial、MeshPhysicalMaterial | 同じ名前のクラス | Lit | Principled BSDF |
| プロジェクトが登録したシェーダー | `ShaderMaterial`、`onBeforeCompile` | Shader | — |
| Color、Map | `color`、`map` | Base Map | Base Color |
| Roughness、Metalness、Roughness Map、Metalness Map | `roughness`、`metalness`、`roughnessMap`、`metalnessMap` | Smoothness（粗さの逆）、Metallic | Roughness、Metallic |
| Normal Map、AO Map | `normalMap`、`aoMap` | Normal Map、Occlusion | Normal |
| Emissive、Emissive Intensity、Emissive Map | `emissive`、`emissiveIntensity`、`emissiveMap` | Emission | Emission Color、Emission Strength |
| Env Map Intensity | `envMapIntensity` | — | — |
| Transparent、Opacity | `transparent`、`opacity` | Surface Type の Transparent | Alpha |
| Clearcoat、Clearcoat Roughness、Transmission、Thickness、IOR、Sheen、Sheen Color | MeshPhysicalMaterial の同じ名前のプロパティ | — | Coat、Transmission、IOR、Sheen |
| Environment（Room Environment、HDRI、None） | `scene.environment`（`RoomEnvironment` か HDRI） | Environment Lighting の Source | World |
| HDRI B、Blend | — | Skybox の Blend（シェーダーで混ぜる） | World の Mix Shader |
| Reflection Probe | `CubeCamera` と `PMREMGenerator.fromCubemap` | Reflection Probe（Baked） | Reflection Cubemap |
| Environment Intensity、Environment Rotation | `scene.environmentIntensity`、`scene.environmentRotation` | Intensity Multiplier | Strength |
| Background、Background Blurriness | `scene.background`、`scene.backgroundBlurriness` | カメラの Background Type | — |
| Fog（Color、Near、Far） | `scene.fog`（`Fog` の `color`、`near`、`far`） | Fog の Color、Start、End | Mist の Start、Depth |
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
| Transform Controls（Translate、Rotate、Scale） | `TransformControls`（`mode` の `translate`、`rotate`、`scale`） | Move、Rotate、Scale ツール | Move、Rotate、Scale |
| Projection（Perspective、Orthographic） | `PerspectiveCamera`、`OrthographicCamera` | Scene ビューの Persp、Iso | Perspective、Orthographic |
| View Helper | `ViewHelper` | — | Navigate |
| Calls、Triangles、Geometries、Textures | `renderer.info` の `render.calls`、`render.triangles`、`memory.geometries`、`memory.textures` | Statistics の Batches、Tris | Statistics |

### スタジオだけのもの

three.js に無いものは、Unity か Blender の一般的な名前で呼ぶ。

| 画面 | 内容 | Unity | Blender |
|---|---|---|---|
| Scene | ファイル1つ（`*.stage.json`） | Scene | Scene |
| Timeline | 時間に沿った動き | Timeline | Timeline |
| Camera Track | カメラを並べるトラック | Cinemachine Track | — |
| Activation Track | 表示する区間を置くトラック | Activation Track | — |
| Animation Track | glb の Clip を置くトラック | Animation Track | NLA の Strip |
| Play、Event の名前（Timeline の選択） | ループする Timeline と、出来事で再生する Timeline | Play On Awake の Timeline と、外から Play を呼ぶ Timeline | — |
| Trigger | Event Timeline を再生する条件 | — | — |
| Key | どのスロットの出来事か | 実行時に Track の Binding を替える | — |
| Length | Event Timeline の長さ | Duration | — |
| Clip、Duration | トラックに置く区間と、その長さ | Clip、Duration | Strip |
| Blend、Easing | 次のカメラへ移る時間と、移るときの加減速 | Cinemachine の Blend と Style | キーフレームの補間の Easing |
| Fade In、Fade Out | 区間の出始めと消え際 | Ease In Duration、Ease Out Duration | — |
| Motion | ショットの間のカメラの動き | Cinemachine Camera の Noise と Position Control | — |
| Empty | 名前の付いた、形の無い点 | 空の GameObject | Empty |
| Offset | Parent からのずれ | Parent Constraint の Offset | — |
| Enabled（コンポーネント） | コンポーネントのオン・オフ | Enabled | — |
| Binding | データとの結び付け | Binding | — |
| Original | glb に入っていたマテリアルのまま | — | — |
| Hierarchy、Inspector、Assets、Console、Profiler | パネル | Hierarchy、Inspector、Project、Console、Profiler | Outliner、Properties、File Browser、Info |
| Save、Save As… | 保存、別の名前で保存 | Save、Save As | Save、Save As |
| Reload | 外で書き換えられたファイルを読み直す | — | Revert |
| Play（▶）、Pause（❚❚） | 再生、一時停止 | Play、Pause | Play、Pause |
| Fullscreen | 全画面で再生する | Game ビューの Play Maximized | Toggle Fullscreen Area |
| Look Through | カメラから見る | — | View の Cameras の Active Camera |
| Align With View | カメラを今の視点に動かす | GameObject の Align With View | Align Active Camera to View |
| Show in Explorer | エクスプローラーで開く | Show in Explorer | — |
| スポイトのアイコン | Viewport でクリックしてオブジェクトを選ぶ | Object Picker | Eyedropper |
| View、Gizmos、Overlays | Viewport のメニュー | Gizmos | View、Viewport Gizmos、Viewport Overlays |
| Viewpoint（Top、Bottom、Front、Back、Right、Left、Camera） | 決まった向きから見る | — | View の Viewpoint |
| Frame Selected、Frame All | 選んだオブジェクトに寄る、全体に寄る | Frame Selected | Frame Selected、Frame All |
| Empties（Gizmos） | Empty の印 | — | Empty の Display |
| Aspect Ratio | 出力フレームの縦横比と、その表示 | Game ビューの Aspect | Output の Aspect、カメラの Passepartout |
| Stats | 性能の数字 | Stats | Statistics |
| Profiler（Frame Time、CPU / GPU、JS Heap、GC Alloc、Calls） | 性能のグラフ | Profiler の CPU Usage、GPU Usage、Memory、Rendering | — |
| Render Settings | 描画の設定の画面 | Project Settings の Quality | — |
| Quality（High、Low） | 品質の段階 | Quality Level | — |
| Max Resolution | 解像度の上限 | — | — |
| Shadow Map Scale | 影の解像度の倍率 | Shadow Resolution | — |
| Dynamic Resolution（Minimum Resolution、Frame Time Threshold） | 重いときに解像度を下げる設定 | Dynamic Resolution、Minimum Screen Percentage | — |
| Resolution、Aspect Ratio、Frame Rate | 出力の大きさ、縦横比、フレームレート | Resolution、Aspect、Frame Rate | Resolution、Aspect、Frame Rate |
| Time、Speed | モックデータの時刻と進む速さ | Time、Time Scale | — |
| Receive Now | 次の受信を待たずに受信させる | — | — |
| Info、Warning、Error | ログの種類 | Log、Warning、Error | Info、Warning、Error |
