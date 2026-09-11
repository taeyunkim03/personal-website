/*
 * Latent space
 *
 * A slowly rotating three-dimensional scatter of what I work on and think
 * about, in five clusters. Unlabelled at rest apart from a few labels riding
 * the front-most points; hover or tap names one, drag turns the cloud.
 *
 * Vanilla JavaScript, no libraries: the projection below is about sixty lines
 * of arithmetic. Positions come from a seeded generator so the cloud has the
 * same shape on every visit. Nothing is stored anywhere.
 */
(function () {
  'use strict';

  var section = document.getElementById('latent');
  var svg = document.getElementById('cloud-svg');
  if (!section || !svg) { return; }

  var NS = 'http://www.w3.org/2000/svg';

  // Centres sit further out than the clusters they name would need on their
  // own: the clusters are wider now and were starting to touch.
  var CENTRES = [
    [-0.60,  0.12,  0.21],  // 0 statistics and data science
    [ 0.55,  0.23, -0.25],  // 1 the lab
    [ 0.23, -0.35, -0.52],  // 2 computing
    [-0.17,  0.67, -0.40],  // 3 math and modelling
    [-0.06, -0.63,  0.44]   // 4 personal
  ];

  // Sampling radius per cluster, scaled by the cube root of the point count so
  // density stays roughly even, with personal loosened on purpose so the cloud
  // does not read as five identical blobs.
  var RADII = [0.36, 0.36, 0.36, 0.34, 0.42];

  // Cluster names live in the comments and never render.
  var POINTS = [
    // 0 statistics and data science (21)
    ['Hypothesis testing',0],['Regression',0],['Generalized linear models',0],
    ['Mixed effects models',0],['Nonparametric methods',0],['Survival analysis',0],
    ['Time series',0],['A/B testing',0],['Experimental design',0],
    ['Statistical power',0],['Causal inference',0],['Multiple testing',0],
    ['Missing data',0],['Bootstrap',0],['Maximum likelihood',0],
    ['Bayesian inference',0],['Cross-validation',0],['Regularization',0],
    ['Conformal prediction',0],['Calibration',0],['Biostatistics',0],

    // 1 the lab (20)
    ['Single-cell RNA-seq',1],['Bulk RNA-seq',1],['Spatial transcriptomics',1],
    ['Count matrices',1],['Read alignment',1],['Quality control',1],
    ['Unsupervised clustering',1],['Cell type annotation',1],['Marker genes',1],
    ['Differential expression',1],['Gene set enrichment',1],['Pseudotime',1],
    ['Batch integration',1],['Deep generative models',1],['Bulk deconvolution',1],
    ['Cross-species atlases',1],['BLAST',1],['Partek',1],
    ['Pigtail macaques',1],['Flu and pregnancy',1],

    // 2 computing (21)
    ['HPC clusters',2],['SLURM',2],['Linux',2],
    ['Bash scripting',2],['The command line',2],['Parallel computing',2],
    ['GPU acceleration',2],['Memory limits',2],['Benchmarking',2],
    ['Containers',2],['Conda environments',2],['Workflow pipelines',2],
    ['Jupyter notebooks',2],['Git',2],['Python and R',2],
    ['Java, SQL, MATLAB',2],['Hadoop',2],['Cloud platforms',2],
    ['Data visualization',2],['Machine learning',2],['AI',2],

    // 3 math and modelling (17)
    ['Probability theory',3],['Stochastic processes',3],['Markov chains',3],
    ['Monte Carlo methods',3],['Linear algebra',3],['Differential equations',3],
    ['Numerical methods',3],['Optimization',3],['Graph theory',3],
    ['Combinatorics',3],['Information theory',3],['Dynamical systems',3],
    ['Chaos and the Lorenz system',3],['Reservoir computing',3],['Neural networks',3],
    ['Transformers',3],['Computational neuroscience',3],

    // 4 personal (14)
    ['Seoul',4],['Seattle',4],['Korean',4],
    ['Korean food',4],['Military service',4],
    ['Quant trading',4],['HPC consulting',4],['Mentoring',4],
    ['Hackathons',4],['Website building',4],['Cooking',4],
    ['Working out',4],['Coffee',4]
  ];

  var LIGHT = ['#6B4A8F','#2F7A4E','#6B6B63','#A85434','#A8415E'];
  var DARK  = ['#A88FD0','#5FB380','#A8A89C','#DB8558','#D9788F'];

  /* Layout ----------------------------------------------------------------
   * Seeded, never Math.random: the map has to be the same shape on every
   * visit or it is not a thing anyone can come back and recognise. */

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
    do {                                   // rejection sample inside the ball
      x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    var c = CENTRES[p[1]], r = RADII[p[1]];
    return { label: p[0], c: p[1],
             x: c[0] + x * r, y: c[1] + y * r, z: c[2] + z * r };
  });

  // One relaxation pass so no two points sit on top of each other.
  var MIN = 0.075;   // clusters are denser now; the old threshold fought the layout
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

  /* View ------------------------------------------------------------------
   * The narrow viewBox is not cosmetic. With the desktop box on a 360px
   * screen a 13.5-unit label renders near 7px and cannot be read. */

  var DIST = 3.2;
  // The cloud is taller than it is wide, so the old 660-wide frame left large
  // dead margins either side and made everything render small. Narrowing the
  // box scales the whole drawing up at the same container width; sc then adds
  // a little more, bounded by how close the outermost point may come to an
  // edge before its label stops fitting.
  // sc is bounded by how close the outermost point may come to an edge before
  // its label stops fitting. The 93-point layout reaches further than the 58
  // did, so this is lower than before while the cloud still lands larger on
  // screen: a smaller scale over a wider spread.
  // The cloud is not vertically symmetric: over a full rotation it reaches
  // about 1.17 units above centre and only 0.92 below, so a frame centred on
  // the midpoint leaves roughly three times the dead space underneath. Height
  // and cy are set from those two bounds instead, giving equal margins.
  var WIDE = { w: 560, h: 364, cx: 280, cy: 201, sc: 155 };
  var NARROW = { w: 360, h: 296, cx: 180, cy: 163, sc: 124 };
  var view = WIDE;

  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var HIT = coarse ? 26 : 16;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ry = 0.5, rx = -0.16;
  var SPIN = 0.0022;

  /* Elements --------------------------------------------------------------
   * Built once. Each frame only moves things; nothing is created or parsed. */

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

  // Label widths in user units. Measured from the real elements, and measured
  // again once webfonts land, since the fallback face is a different width.
  function measure() {
    nodes.forEach(function (n) {
      n.text.setAttribute('x', '0');
      n.text.setAttribute('y', '0');
      try {
        var b = n.text.getBBox();       // relative to an anchor at the origin
        n.w = b.width; n.bx = b.x; n.by = b.y; n.bh = b.height;
      } catch (e) {
        n.w = n.text.textContent.length * 6; n.bx = 0; n.by = -9; n.bh = 12;
      }
    });
  }

  /* Projection ------------------------------------------------------------ */

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

  /* Ambient labels --------------------------------------------------------
   * Up to five, on the front hemisphere, chosen greedily so none overlaps.
   * Recomputed on a timer rather than per frame, held for a minimum time and
   * cross-faded: any one of those alone still flickers. */

  var shown = {};           // point index -> time it was first shown
  var MAX_LABELS = 5;
  var HOLD_MS = 1500;
  var RECOMPUTE_MS = 400;
  var lastChoice = 0;

  // A label is kept for HOLD_MS, so the question at selection time is not
  // "is this spot free now" but "does it stay free for as long as the label
  // lives". Each candidate is therefore tested as a swept rectangle: the union
  // of where its box sits across the whole hold window. Two labels accepted
  // against each other's sweeps cannot collide later, which means held labels
  // never have to be evicted, which is what kept the old version flickering.
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

  // Built from the measured glyph box at the same anchor render() uses, so the
  // rectangle tested here is the rectangle that actually appears on screen.
  function rectFor(q, n) {
    var flip = q.sx > view.w * 0.6;
    var ax = flip ? q.sx - 12 - n.w : q.sx + 12;
    var ay = q.sy + 4;
    return { x1: ax + n.bx, y1: ay + n.by,
             x2: ax + n.bx + n.w, y2: ay + n.by + n.bh };
  }

  // Null when the label would leave the canvas at any point in the window,
  // which is also what stops one drifting off an edge between recomputes.
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

    // Held labels keep their slots outright. They were accepted against a
    // sweep covering their whole life, so nothing can have moved into them.
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

    // Inline style, not the opacity attribute: `.cloud-label { opacity: 0 }`
    // is a stylesheet rule and outranks a presentation attribute, so setting
    // the attribute leaves every label invisible.
    for (var k = 0; k < nodes.length; k += 1) {
      nodes[k].text.style.opacity = next[k] !== undefined ? '1' : '0';
    }
    shown = next;
  }

  /* Drawing --------------------------------------------------------------- */

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

    // Nearer points must cover farther ones, which in SVG means later in the
    // document. Re-append only when the order actually changed.
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
        // The selected label supersedes the ambient one for the same dot.
        if (j === selected) { node.text.style.opacity = '0'; }
        var flip = q.sx > view.w * 0.6;
        var x = flip ? q.sx - 12 - node.w : q.sx + 12;
        x = Math.max(2, Math.min(x, view.w - node.w - 2));
        // Clamp vertically too: the dot keeps moving between recomputes, so a
        // label chosen inside the canvas can still drift off the top or bottom.
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

  /* Drag ------------------------------------------------------------------ */

  var dragging = false, lastX = 0, lastY = 0, moved = 0, suppressClick = false;

  svg.addEventListener('pointerdown', function (e) {
    dragging = true; moved = 0; suppressClick = false;
    lastX = e.clientX; lastY = e.clientY;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  });

  svg.addEventListener('pointermove', function (e) {
    if (!dragging) { return; }
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    ry += dx * 0.008;
    rx += dy * 0.006;
    rx = Math.max(-1.1, Math.min(1.1, rx));
    if (!running) { render(); chooseLabels(now()); }   // reduced motion draws on demand
  });

  function endDrag(e) {
    if (!dragging) { return; }
    dragging = false;
    // Without this every drag ends by selecting whatever dot it began on.
    if (moved > 4) { suppressClick = true; }
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('pointerleave', function () {
    if (!coarse) { select(null); }
  });

  /* Loop ------------------------------------------------------------------ */

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

  /* Theme and size -------------------------------------------------------- */

  // theme.js sets data-theme on <html> and fires nothing, so watch the attribute.
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

  /* Start ----------------------------------------------------------------- */

  // Visibility is CSS's job now, keyed on the `js` class: see style.css.
  view = window.innerWidth < 640 ? NARROW : WIDE;
  svg.setAttribute('viewBox', '0 0 ' + view.w + ' ' + view.h);
  measure();
  paint();
  render();
  chooseLabels(now());
  sync();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      measure();                       // widths change when the webfont lands
      render();
      chooseLabels(now());
    });
  }
})();
