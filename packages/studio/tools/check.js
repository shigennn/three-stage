/* Evaluated in the page by cdp.mjs. Within #stage, reports visible text that overlaps, overflows its nearest box
   (an ancestor with a background or border), is clipped or leaves the stage, and side-by-side boxes whose top or
   bottom edges are slightly misaligned. Coordinates are in stage space (1920x1080). */
(function () {
  var stage = document.getElementById('stage');
  if (!stage) return 'no stage';
  var sr = stage.getBoundingClientRect(), k = sr.width / 1920;
  function S(b) { return { x: (b.left - sr.left) / k, y: (b.top - sr.top) / k, r: (b.right - sr.left) / k, b: (b.bottom - sr.top) / k }; }
  function visible(e) {
    if (!e.getClientRects().length) return false;
    if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    for (var p = e; p && p !== stage; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (+cs.opacity < 0.12) return false;
    }
    return true;
  }
  function hasBox(e) {
    var cs = getComputedStyle(e);
    var bg = cs.backgroundColor, bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth);
    var bgOn = bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg);
    return bgOn || (bw > 0 && cs.borderTopStyle !== 'none') || cs.backgroundImage !== 'none';
  }
  var items = [];
  var w = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT), n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    var e = n.parentElement;
    if (!e || !visible(e)) continue;
    if (e.closest('svg') && !/^(text|tspan|textPath)$/.test(e.tagName)) continue;
    var r = document.createRange(); r.selectNodeContents(n);
    var b = r.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    items.push({ e: e, t: n.nodeValue.trim().slice(0, 20), b: S(b) });
  }
  var overlaps = [];
  for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
    var a = items[i], c = items[j];
    if (a.e === c.e) continue;
    var ox = Math.min(a.b.r, c.b.r) - Math.max(a.b.x, c.b.x), oy = Math.min(a.b.b, c.b.b) - Math.max(a.b.y, c.b.y);
    if (ox > 2 && oy > 2) overlaps.push('"' + a.t + '" x "' + c.t + '" ' + Math.round(ox) + 'x' + Math.round(oy) + ' @' + Math.round(a.b.x) + ',' + Math.round(a.b.y));
  }
  var overflow = [];
  items.forEach(function (it) {
    for (var p = it.e.parentElement; p && p !== stage; p = p.parentElement) {
      if (p.closest('svg') && p.tagName !== 'svg') continue;
      if (!hasBox(p)) continue;
      var pb = S(p.getBoundingClientRect());
      if (pb.r - pb.x < 40 || pb.b - pb.y < 20) break;
      if (it.b.x < pb.x - 1 || it.b.r > pb.r + 1 || it.b.y < pb.y - 1 || it.b.b > pb.b + 1)
        overflow.push('"' + it.t + '" [' + [it.b.x, it.b.y, it.b.r, it.b.b].map(Math.round) + '] in .' + (p.className && p.className.baseVal !== undefined ? p.className.baseVal : p.className) + ' [' + [pb.x, pb.y, pb.r, pb.b].map(Math.round) + ']');
      break;
    }
  });
  var clipped = [];
  items.forEach(function (it) { var e = it.e; if (e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(e).overflowX)) clipped.push('"' + it.t + '" ' + e.scrollWidth + '>' + e.clientWidth); });
  var edge = items.filter(function (it) { return it.b.x < 0 || it.b.y < 0 || it.b.r > 1920 || it.b.b > 1080; }).map(function (it) { return '"' + it.t + '" [' + [it.b.x, it.b.y, it.b.r, it.b.b].map(Math.round) + ']'; });
  var boxes = Array.prototype.filter.call(stage.querySelectorAll('*'), function (e) {
    if (e.closest('svg') || !visible(e) || !hasBox(e)) return false;
    var b = e.getBoundingClientRect(); return b.width / k >= 160 && b.height / k >= 80;
  }).map(function (e) { return { e: e, b: S(e.getBoundingClientRect()) }; });
  var align = [];
  for (var i2 = 0; i2 < boxes.length; i2++) for (var j2 = i2 + 1; j2 < boxes.length; j2++) {
    var A = boxes[i2], B = boxes[j2];
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    if (A.b.r <= B.b.x || B.b.r <= A.b.x) {
      var vo = Math.min(A.b.b, B.b.b) - Math.max(A.b.y, B.b.y), mh = Math.min(A.b.b - A.b.y, B.b.b - B.b.y);
      if (vo > mh * 0.5) {
        var dt = Math.abs(A.b.y - B.b.y), db = Math.abs(A.b.b - B.b.b);
        if ((dt > 1 && dt < 200) || (db > 1 && db < 200)) align.push('.' + String(A.e.className).split(' ')[0] + ' / .' + String(B.e.className).split(' ')[0] + ' top±' + Math.round(dt) + ' bottom±' + Math.round(db));
      }
    }
  }
  return { texts: items.length, overlaps: overlaps.slice(0, 30), overflow: overflow.slice(0, 30), clipped: clipped.slice(0, 20), edge: edge.slice(0, 20), align: align.slice(0, 20) };
})()
