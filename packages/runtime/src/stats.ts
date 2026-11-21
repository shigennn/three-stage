// Per-frame rendering numbers. push must not allocate: it runs every frame in pages that stay open for days. Medians are computed when read.

const N = 120;
/** How many frames slowFrames can look back. */
const HISTORY_MAX = 8192;

class Ring {
  readonly buf: Float64Array;
  size = 0;
  private head = 0;
  constructor(capacity: number) {
    this.buf = new Float64Array(capacity);
  }
  push(v: number) {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.buf.length;
    if (this.size < this.buf.length) this.size++;
  }
  /** i = 0 is the oldest. */
  at(i: number) {
    return this.buf[(this.head - this.size + i + this.buf.length) % this.buf.length];
  }
  median() {
    if (!this.size) return 0;
    const a: number[] = [];
    for (let i = 0; i < this.size; i++) a.push(this.at(i));
    a.sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  }
}

/** Current rendering numbers. Times are medians over the last 120 frames; counts are from the last frame. */
export interface StatsSnapshot {
  /** Frames per second. */
  fps: number;
  /** Time between frames (ms). */
  frameMs: number;
  /** CPU time spent rendering a frame (ms). */
  cpuMs: number;
  /** GPU time of a frame (ms), or null where the GPU timer is unavailable. */
  gpuMs: number | null;
  /** Draw calls. */
  calls: number;
  /** Triangles drawn. */
  triangles: number;
  /** Textures alive on the GPU. */
  textures: number;
  /** Geometries alive on the GPU. */
  geometries: number;
  /** Shader programs. */
  programs: number;
  /** JS heap in use (MB), or null where the browser does not report it. */
  heapMB: number | null;
  /** Heap growth per second (MB) between garbage collections. An estimate of how much garbage each frame creates. */
  garbageMBps: number | null;
  /** Drawing buffer width (px). */
  renderWidth: number;
  /** Drawing buffer height (px). */
  renderHeight: number;
}

export interface FrameSample {
  t: number;
  interval: number;
  cpuMs: number;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
  programs: number;
  width: number;
  height: number;
}

/** Collects per-frame rendering numbers. Pass it to StageCanvas or StageView and read {@link FrameStats.last}. */
export class FrameStats {
  private intervals = new Ring(N);
  private cpu = new Ring(N);
  private gpu = new Ring(N);
  private hFrame = new Ring(HISTORY_MAX);
  private calls = 0;
  private triangles = 0;
  private textures = 0;
  private geometries = 0;
  private programs = 0;
  private width = 0;
  private height = 0;
  private heap: number | null = null;
  private garbage: number | null = null;
  private gcT = 0;
  private gcHeap = -1;

  /** Called every frame. The caller may reuse `f`. */
  push(f: FrameSample) {
    if (f.interval > 0) this.intervals.push(f.interval);
    this.cpu.push(f.cpuMs);
    const mem = (performance as any).memory;
    const heap = mem ? mem.usedJSHeapSize / 1048576 : null;
    if (heap !== null && this.heap !== null && heap < this.heap - 0.5) {
      if (this.gcHeap >= 0) {
        const dt = (f.t - this.gcT) / 1000;
        if (dt > 0.5) this.garbage = (this.heap - this.gcHeap) / dt;
      }
      this.gcT = f.t;
      this.gcHeap = heap;
    }
    this.heap = heap;
    this.calls = f.calls;
    this.triangles = f.triangles;
    this.textures = f.textures;
    this.geometries = f.geometries;
    this.programs = f.programs;
    this.width = f.width;
    this.height = f.height;
    this.hFrame.push(f.interval);
  }

  /** Records a GPU frame time (ms). */
  pushGpu(ms: number) {
    this.gpu.push(ms);
  }

  /** The current numbers. Each read computes medians, so don't read it every frame. */
  get last(): StatsSnapshot {
    const fm = this.intervals.median();
    return {
      fps: fm > 0 ? 1000 / fm : 0,
      frameMs: fm,
      cpuMs: this.cpu.median(),
      gpuMs: this.gpu.size ? this.gpu.median() : null,
      calls: this.calls,
      triangles: this.triangles,
      textures: this.textures,
      geometries: this.geometries,
      programs: this.programs,
      heapMB: this.heap,
      garbageMBps: this.garbage,
      renderWidth: this.width,
      renderHeight: this.height,
    };
  }

  /** Returns how many of the last `n` frames took longer than `ms`. `of` is less than `n` until `n` frames have been recorded. */
  slowFrames(n: number, ms: number) {
    const size = this.hFrame.size;
    if (size < n) return { count: 0, of: size };
    let count = 0;
    for (let i = size - n; i < size; i++) if (this.hFrame.at(i) > ms) count++;
    return { count, of: n };
  }
}

/** GPU timer for WebGL2 (EXT_disjoint_timer_query_webgl2). Results arrive a few frames late. */
export class GpuTimer {
  private ext: any;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  begin() {
    if (!this.ext || this.active) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  poll(out: (ms: number) => void) {
    if (!this.ext) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      if (!disjoint) out(ns / 1e6);
      gl.deleteQuery(q);
      this.pending.shift();
    }
  }

  dispose() {
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending = [];
  }
}
