// Slowly spinning 3D point cloud of things I work on and think about, in five
// clusters. Hover or tap a point to see its name, drag to rotate.
(function () {
  'use strict';

  var section = document.getElementById('latent');
  var svg = document.getElementById('cloud-svg');
  if (!section || !svg) { return; }

  var NS = 'http://www.w3.org/2000/svg';

  var CENTRES = [
    [-0.60,  0.12,  0.21],  // 0 statistics and data science
    [ 0.55,  0.23, -0.25],  // 1 the lab
    [ 0.23, -0.35, -0.52],  // 2 computing
    [-0.17,  0.67, -0.40],  // 3 math and modelling
    [-0.06, -0.63,  0.44]   // 4 personal
  ];

  // Cluster radii. Personal is a bit looser so the clusters don't all look
  // the same.
  var RADII = [0.36, 0.36, 0.36, 0.34, 0.42];

  var POINTS = [
    // 0 statistics and data science
    ['Hypothesis testing',0],['Regression',0],['Generalized linear models',0],
    ['Mixed effects models',0],['Nonparametric methods',0],['Survival analysis',0],
    ['Time series',0],['A/B testing',0],['Experimental design',0],
    ['Statistical power',0],['Causal inference',0],['Multiple testing',0],
    ['Missing data',0],['Bootstrap',0],['Maximum likelihood',0],
    ['Bayesian inference',0],['Cross-validation',0],['Regularization',0],
    ['Conformal prediction',0],['Calibration',0],['Biostatistics',0],

    // 1 the lab
    ['Single-cell RNA-seq',1],['Bulk RNA-seq',1],['Spatial transcriptomics',1],
    ['Count matrices',1],['Read alignment',1],['Quality control',1],
    ['Unsupervised clustering',1],['Cell type annotation',1],['Marker genes',1],
    ['Differential expression',1],['Gene set enrichment',1],['Pseudotime',1],
    ['Batch integration',1],['Deep generative models',1],['Bulk deconvolution',1],
    ['Cross-species atlases',1],['BLAST',1],['Partek',1],
    ['Pigtail macaques',1],['Flu and pregnancy',1],

    // 2 computing
    ['HPC clusters',2],['SLURM',2],['Linux',2],
    ['Bash scripting',2],['The command line',2],['Parallel computing',2],
    ['GPU acceleration',2],['Memory limits',2],['Benchmarking',2],
    ['Containers',2],['Conda environments',2],['Workflow pipelines',2],
    ['Jupyter notebooks',2],['Git',2],['Python and R',2],
    ['Java, SQL, MATLAB',2],['Hadoop',2],['Cloud platforms',2],
    ['Data visualization',2],['Machine learning',2],['AI',2],

    // 3 math and modelling
    ['Probability theory',3],['Stochastic processes',3],['Markov chains',3],
    ['Monte Carlo methods',3],['Linear algebra',3],['Differential equations',3],
    ['Numerical methods',3],['Optimization',3],['Graph theory',3],
    ['Combinatorics',3],['Information theory',3],['Dynamical systems',3],
    ['Chaos and the Lorenz system',3],['Reservoir computing',3],['Neural networks',3],
    ['Transformers',3],['Computational neuroscience',3],

    // 4 personal
    ['Seoul',4],['Seattle',4],['Korean',4],
    ['Korean food',4],['Military service',4],
    ['Quant trading',4],['HPC consulting',4],['Mentoring',4],
    ['Hackathons',4],['Website building',4],['Cooking',4],
    ['Working out',4],['Coffee',4]
  ];

  var LIGHT = ['#6B4A8F','#2F7A4E','#6B6B63','#A85434','#A8415E'];
  var DARK  = ['#A88FD0','#5FB380','#A8A89C','#DB8558','#D9788F'];

  // Seeded so the cloud has the same shape on every visit.
  var SEED = 20260910;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var rand = mulberry32(SEED);

  var pts = POINTS.map(function (p) {
    var x, y, z;
    do { // random point inside the unit sphere
      x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    var c = CENTRES[p[1]], r = RADII[p[1]];
    return { label: p[0], c: p[1],
             x: c[0] + x * r, y: c[1] + y * r, z: c[2] + z * r };
  });

  // Push apart points that are too close together.
  var MIN = 0.075;
  for (var a = 0; a < pts.length; a += 1) {
    for (var b = a + 1; b < pts.length; b += 1) {
      var dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y, dz = pts[b].z - pts[a].z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-9 && d < MIN) {
        var push = (MIN - d) / (2 * d);
        pts[a].x -= dx * push; pts[a].y -= dy * push; pts[a].z -= dz * push;
        pts[b].x += dx * push; pts[b].y += dy * push; pts[b].z += dz * push;
      }
    }
  }

  var DIST = 3.2;
  // Narrow view for phones, where the wide one shrinks labels too much to read.
  // sc is as large as the outer labels allow, and cy sits below the middle
  // since the cloud reaches further up than down.
  var WIDE = { w: 560, h: 364, cx: 280, cy: 201, sc: 155 };
  var NARROW = { w: 360, h: 296, cx: 180, cy: 163, sc: 124 };
  var view = WIDE;

  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var HIT = coarse ? 26 : 16;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ry = 0.5, rx = -0.16;
  var SPIN = 0.0022;

  var dotLayer = document.getElementById('cloud-dots');
  var labelLayer = document.getElementById('cloud-labels');
  var pickLayer = document.getElementById('cloud-pick');

  var nodes = pts.map(function (p, i) {
    var g = document.createElementNS(NS, 'g');
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'cloud-dot');
    var hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('class', 'cloud-hit');
    hit.setAttribute('r', HIT);
    g.appendChild(dot); g.appendChild(hit);
    dotLayer.appendChild(g);

    var text = document.createElementNS(NS, 'text');
    text.setAttribute('class', 'cloud-label');
    text.textContent = p.label;
    labelLayer.appendChild(text);

    hit.addEventListener('pointerenter', function () {
      if (coarse || dragging) { return; }
      select(i);
    });
    hit.addEventListener('click', function () {
      if (suppressClick) { return; }
      if (coarse) { select(selected === i ? null : i); }
    });

    return { g: g, dot: dot, hit: hit, text: text, w: 0, order: -1 };
  });

  var pickBox = document.createElementNS(NS, 'rect');
  pickBox.setAttribute('class', 'cloud-pick-box');
  pickBox.setAttribute('rx', '7');
  var pickText = document.createElementNS(NS, 'text');
  pickText.setAttribute('class', 'cloud-pick-text');
  pickLayer.appendChild(pickBox); pickLayer.appendChild(pickText);
  pickLayer.setAttribute('opacity', '0');

  // Label sizes. Measured again after the webfont loads since the fallback
  // font has different widths.
  function measure() {
    nodes.forEach(function (n) {
      n.text.setAttribute('x', '0');
      n.text.setAttribute('y', '0');
      try {
        var b = n.text.getBBox();
        n.w = b.width; n.bx = b.x; n.by = b.y; n.bh = b.height;
      } catch (e) {
        n.w = n.text.textContent.length * 6; n.bx = 0; n.by = -9; n.bh = 12;
      }
    });
  }

  var proj = pts.map(function () { return { sx: 0, sy: 0, k: 1, d: 0 }; });

  function projectAll() {
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cx = Math.cos(rx), sx = Math.sin(rx);
    for (var i = 0; i < pts.length; i += 1) {
      var p = pts[i];
      var x1 = p.x * cy + p.z * sy;
      var z1 = -p.x * sy + p.z * cy;
      var y2 = p.y * cx - z1 * sx;
      var z2 = p.y * sx + z1 * cx;
      var k = DIST / (DIST - z2);
      var q = proj[i];
      q.sx = view.cx + x1 * k * view.sc;
      q.sy = view.cy - y2 * k * view.sc;
      q.k = k; q.d = z2;
    }
  }

  // A few labels on the front points, chosen so they don't overlap. They're
  // rechosen every 400ms, held for at least 1.5s and fade in and out, so they
  // don't flicker.

  var shown = {}; // point index -> time first shown
  var MAX_LABELS = 5;
  var HOLD_MS = 1500;
  var RECOMPUTE_MS = 400;
  var lastChoice = 0;

  // Each candidate is checked against the whole area its label will cover
  // while it's held, so held labels never collide and never need removing.
  var HOLD_FRAMES = HOLD_MS / 16.7;
  var SWEEP_STEPS = 10;

  function projectOne(i, dry) {
    var ang = ry + dry;
    var cy = Math.cos(ang), sy = Math.sin(ang);
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var p = pts[i];
    var x1 = p.x * cy + p.z * sy;
    var z1 = -p.x * sy + p.z * cy;
    var y2 = p.y * cx - z1 * sx;
    var z2 = p.y * sx + z1 * cx;
    var k = DIST / (DIST - z2);
    return { sx: view.cx + x1 * k * view.sc, sy: view.cy - y2 * k * view.sc, d: z2 };
  }

  // Same label position render() uses.
  function rectFor(q, n) {
    var flip = q.sx > view.w * 0.6;
    var ax = flip ? q.sx - 12 - n.w : q.sx + 12;
    var ay = q.sy + 4;
    return { x1: ax + n.bx, y1: ay + n.by,
             x2: ax + n.bx + n.w, y2: ay + n.by + n.bh };
  }

  // Null if the label would leave the canvas at any point while it's held.
  function sweptRect(i) {
    var n = nodes[i];
    var spin = reduced ? 0 : SPIN;
    var out = null;
    for (var s = 0; s <= SWEEP_STEPS; s += 1) {
      var r = rectFor(projectOne(i, spin * HOLD_FRAMES * (s / SWEEP_STEPS)), n);
      if (r.x1 < 0 || r.x2 > view.w || r.y1 < 0 || r.y2 > view.h) { return null; }
      out = out ? { x1: Math.min(out.x1, r.x1), y1: Math.min(out.y1, r.y1),
                    x2: Math.max(out.x2, r.x2), y2: Math.max(out.y2, r.y2) } : r;
    }
    return out;
  }

  function overlaps(r, list) {
    for (var i = 0; i < list.length; i += 1) {
      var o = list[i];
      if (r.x1 - 6 < o.x2 && r.x2 + 6 > o.x1 && r.y1 - 6 < o.y2 && r.y2 + 6 > o.y1) { return true; }
    }
    return false;
  }

  function chooseLabels(now) {
    var taken = [], next = {}, count = 0;

    // Labels still being held keep their spots.
    Object.keys(shown).forEach(function (key) {
      var i = +key;
      if (now - shown[i] < HOLD_MS) {
        var r = sweptRect(i);
        if (r) { taken.push(r); }
        next[i] = shown[i];
        count += 1;
      }
    });

    var cand = [];
    for (var i = 0; i < pts.length; i += 1) {
      if (proj[i].d > 0 && next[i] === undefined) { cand.push(i); }
    }
    cand.sort(function (p, q) { return proj[q].d - proj[p].d; });

    for (var n = 0; n < cand.length && count < MAX_LABELS; n += 1) {
      var j = cand[n];
      var rect = sweptRect(j);
      if (!rect || overlaps(rect, taken)) { continue; }
      taken.push(rect);
      next[j] = now;
      count += 1;
    }

    // Inline style because the CSS opacity rule overrides the SVG attribute.
    for (var k = 0; k < nodes.length; k += 1) {
      nodes[k].text.style.opacity = next[k] !== undefined ? '1' : '0';
    }
    shown = next;
  }

  var selected = null;
  var orderKey = '';

  function paint() {
    var palette = document.documentElement.getAttribute('data-theme') === 'dark' ? DARK : LIGHT;
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].dot.setAttribute('fill', palette[pts[i].c]);
    }
    if (selected !== null) { pickText.setAttribute('fill', palette[pts[selected].c]); }
  }

  function render() {
    projectAll();

    // Nearer points have to come later in the SVG to draw on top. Only
    // reorder when the order changes.
    var idx = [];
    for (var i = 0; i < pts.length; i += 1) { idx.push(i); }
    idx.sort(function (p, q) { return proj[p].d - proj[q].d; });
    var key = idx.join(',');
    if (key !== orderKey) {
      orderKey = key;
      for (var n = 0; n < idx.length; n += 1) { dotLayer.appendChild(nodes[idx[n]].g); }
    }

    for (var j = 0; j < pts.length; j += 1) {
      var q = proj[j], node = nodes[j];
      node.dot.setAttribute('cx', q.sx.toFixed(2));
      node.dot.setAttribute('cy', q.sy.toFixed(2));
      node.dot.setAttribute('r', (3.4 * q.k).toFixed(2));
      node.dot.setAttribute('opacity', (0.5 + 0.5 * (q.d + 1) / 2).toFixed(3));
      node.hit.setAttribute('cx', q.sx.toFixed(2));
      node.hit.setAttribute('cy', q.sy.toFixed(2));

      if (shown[j] !== undefined) {
        // Hide the ambient label when its dot is selected.
        if (j === selected) { node.text.style.opacity = '0'; }
        var flip = q.sx > view.w * 0.6;
        var x = flip ? q.sx - 12 - node.w : q.sx + 12;
        x = Math.max(2, Math.min(x, view.w - node.w - 2));
        // The dot keeps moving between label picks, so clamp vertically too.
        var ly = Math.max(11, Math.min(q.sy + 4, view.h - 4));
        node.text.setAttribute('x', x.toFixed(2));
        node.text.setAttribute('y', ly.toFixed(2));
      }
    }

    if (selected !== null) { placePick(); }
  }

  function placePick() {
    var q = proj[selected];
    var w = pickText.getComputedTextLength() + 14;
    var h = 24;
    var flip = q.sx > view.w * 0.6;
    var x = flip ? q.sx - 12 - w : q.sx + 12;
    x = Math.max(2, Math.min(x, view.w - w - 2));
    var y = Math.max(2, Math.min(q.sy - h / 2, view.h - h - 2));
    pickBox.setAttribute('x', x.toFixed(2));
    pickBox.setAttribute('y', y.toFixed(2));
    pickBox.setAttribute('width', w.toFixed(2));
    pickBox.setAttribute('height', h);
    pickText.setAttribute('x', (x + 7).toFixed(2));
    pickText.setAttribute('y', (y + h / 2 + 4.5).toFixed(2));
  }

  function select(i) {
    selected = i;
    if (i === null) {
      pickLayer.setAttribute('opacity', '0');
    } else {
      pickText.textContent = pts[i].label;
      paint();
      pickLayer.setAttribute('opacity', '1');
    }
    render();
  }

  var dragging = false, lastX = 0, lastY = 0, moved = 0, suppressClick = false;

  svg.addEventListener('pointerdown', function (e) {
    dragging = true; moved = 0; suppressClick = false;
    lastX = e.clientX; lastY = e.clientY;
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  });

  svg.addEventListener('pointermove', function (e) {
    if (!dragging) { return; }
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    ry += dx * 0.008;
    rx += dy * 0.006;
    rx = Math.max(-1.1, Math.min(1.1, rx));
    if (!running) { render(); chooseLabels(now()); } // no animation loop with reduced motion
  });

  function endDrag(e) {
    if (!dragging) { return; }
    dragging = false;
    // So the end of a drag doesn't count as a click on a dot.
    if (moved > 4) { suppressClick = true; }
    try { svg.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('pointerleave', function () {
    if (!coarse) { select(null); }
  });

  var running = false, onScreen = false, frame = 0;

  function now() { return Date.now(); }

  function step() {
    if (!running) { return; }
    if (!dragging && selected === null) { ry += SPIN; }
    render();
    var t = now();
    if (t - lastChoice > RECOMPUTE_MS) { lastChoice = t; chooseLabels(t); }
    frame = window.requestAnimationFrame(step);
  }

  function sync() {
    var want = onScreen && !document.hidden && !reduced;
    if (want && !running) { running = true; frame = window.requestAnimationFrame(step); }
    else if (!want && running) { running = false; window.cancelAnimationFrame(frame); }
  }

  if (window.IntersectionObserver) {
    new window.IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(section);
  } else {
    onScreen = true;
  }
  document.addEventListener('visibilitychange', sync);

  // theme.js doesn't fire an event, so watch data-theme instead.
  if (window.MutationObserver) {
    new window.MutationObserver(paint).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-theme'] });
  }

  function applyView() {
    var next = window.innerWidth < 640 ? NARROW : WIDE;
    if (next === view) { return; }
    view = next;
    svg.setAttribute('viewBox', '0 0 ' + view.w + ' ' + view.h);
    render();
    chooseLabels(now());
  }
  window.addEventListener('resize', applyView);

  view = window.innerWidth < 640 ? NARROW : WIDE;
  svg.setAttribute('viewBox', '0 0 ' + view.w + ' ' + view.h);
  measure();
  paint();
  render();
  chooseLabels(now());
  sync();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      measure();
      render();
      chooseLabels(now());
    });
  }
})();
