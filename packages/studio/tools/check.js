/* Evaluated in the page by cdp.mjs. Within #stage, reports visible text that overlaps, overflows its nearest box
   (an ancestor with a background or border), is clipped or leaves the stage, and side-by-side boxes whose top or
   bottom edges are slightly misaligned. Coordinates are in stage space: the stage's unscaled size, 1080 high and as
   wide as the scene's Aspect Ratio. */
(() => {
  const stage = document.getElementById('stage');
  if (!stage) return 'no stage';
  // The stage is laid out at its stage-space size and scaled with a transform, so offsetWidth is the unscaled width
  const W = stage.offsetWidth, H = stage.offsetHeight;
  const sr = stage.getBoundingClientRect(), k = sr.width / W;
  const S = (b) => ({ x: (b.left - sr.left) / k, y: (b.top - sr.top) / k, r: (b.right - sr.left) / k, b: (b.bottom - sr.top) / k });
  const visible = (e) => {
    if (!e.getClientRects().length) return false;
    if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    for (let p = e; p && p !== stage; p = p.parentElement) {
      if (+getComputedStyle(p).opacity < 0.12) return false;
    }
    return true;
  };
  const hasBox = (e) => {
    const cs = getComputedStyle(e);
    const bg = cs.backgroundColor, bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth);
    const bgOn = bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg);
    return bgOn || (bw > 0 && cs.borderTopStyle !== 'none') || cs.backgroundImage !== 'none';
  };
  const rect = (b) => '[' + [b.x, b.y, b.r, b.b].map(Math.round) + ']';
  const items = [];
  const w = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const e = n.parentElement;
    if (!e || !visible(e)) continue;
    if (e.closest('svg') && !/^(text|tspan|textPath)$/.test(e.tagName)) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    items.push({ e, t: n.nodeValue.trim().slice(0, 20), b: S(b) });
  }
  const overlaps = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], c = items[j];
    if (a.e === c.e) continue;
    const ox = Math.min(a.b.r, c.b.r) - Math.max(a.b.x, c.b.x), oy = Math.min(a.b.b, c.b.b) - Math.max(a.b.y, c.b.y);
    if (ox > 2 && oy > 2) overlaps.push('"' + a.t + '" x "' + c.t + '" ' + Math.round(ox) + 'x' + Math.round(oy) + ' @' + Math.round(a.b.x) + ',' + Math.round(a.b.y));
  }
  const overflow = [];
  for (const it of items) {
    for (let p = it.e.parentElement; p && p !== stage; p = p.parentElement) {
      if (p.closest('svg') && p.tagName !== 'svg') continue;
      if (!hasBox(p)) continue;
      const pb = S(p.getBoundingClientRect());
      if (pb.r - pb.x < 40 || pb.b - pb.y < 20) break;
      if (it.b.x < pb.x - 1 || it.b.r > pb.r + 1 || it.b.y < pb.y - 1 || it.b.b > pb.b + 1)
        overflow.push('"' + it.t + '" ' + rect(it.b) + ' in .' + (p.className && p.className.baseVal !== undefined ? p.className.baseVal : p.className) + ' ' + rect(pb));
      break;
    }
  }
  const clipped = items
    .filter(({ e }) => e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(e).overflowX))
    .map(({ e, t }) => '"' + t + '" ' + e.scrollWidth + '>' + e.clientWidth);
  const edge = items.filter(({ b }) => b.x < 0 || b.y < 0 || b.r > W || b.b > H).map(({ t, b }) => '"' + t + '" ' + rect(b));
  const boxes = [...stage.querySelectorAll('*')]
    .filter((e) => {
      if (e.closest('svg') || !visible(e) || !hasBox(e)) return false;
      const b = e.getBoundingClientRect();
      return b.width / k >= 160 && b.height / k >= 80;
    })
    .map((e) => ({ e, b: S(e.getBoundingClientRect()) }));
  const align = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    if (A.b.r > B.b.x && B.b.r > A.b.x) continue;
    const vo = Math.min(A.b.b, B.b.b) - Math.max(A.b.y, B.b.y), mh = Math.min(A.b.b - A.b.y, B.b.b - B.b.y);
    if (vo <= mh * 0.5) continue;
    const dt = Math.abs(A.b.y - B.b.y), db = Math.abs(A.b.b - B.b.b);
    if ((dt > 1 && dt < 200) || (db > 1 && db < 200)) align.push('.' + String(A.e.className).split(' ')[0] + ' / .' + String(B.e.className).split(' ')[0] + ' top±' + Math.round(dt) + ' bottom±' + Math.round(db));
  }
  return { stage: W + 'x' + H, texts: items.length, overlaps: overlaps.slice(0, 30), overflow: overflow.slice(0, 30), clipped: clipped.slice(0, 20), edge: edge.slice(0, 20), align: align.slice(0, 20) };
})()
