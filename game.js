// Rock paper scissors against an order-2 Markov chain. The bot looks at the
// player's last two throws, predicts the most common next throw after that
// pair, and plays what beats it.
(function () {
  'use strict';

  var ui = document.getElementById('game-ui');
  if (!ui) { return; }

  var THROWS = ['R', 'P', 'S'];
  var NAME = { R: 'Rock', P: 'Paper', S: 'Scissors' };
  var BEATS = { R: 'P', P: 'S', S: 'R' }; // BEATS[x] is the throw that beats x.

  // Chance the bot throws at random instead of using its prediction. Without
  // it, someone who knows the rule could win every round.
  var EXPLORE = 0.10;

  // The demo and the visitor each play in their own game object, so nothing
  // the demo learned carries over into a real game.
  function freshGame() {
    return {
      last: [],    // last two throws
      counts: {},  // state -> { R: n, P: n, S: n }
      rounds: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      visited: []  // recent states, for the grid trail
    };
  }

  var liveGame = freshGame();
  var demoGame = freshGame();
  var active = liveGame; // the game being shown

  var buttons = ui.querySelectorAll('[data-throw]');
  var resultEl = document.getElementById('game-result');
  var verdictEl = document.getElementById('game-verdict');
  var resetBtn = document.getElementById('game-reset');
  var stat = {
    rounds: document.getElementById('stat-rounds'),
    wins: document.getElementById('stat-wins'),
    losses: document.getElementById('stat-losses'),
    ties: document.getElementById('stat-ties'),
    rate: document.getElementById('stat-rate')
  };

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function stateOf(game) {
    return game.last.length === 2 ? game.last[0] + game.last[1] : null;
  }

  function botThrowFor(game) {
    var state = stateOf(game);
    if (state === null || !game.counts[state] || Math.random() < EXPLORE) {
      return pick(THROWS);
    }
    var c = game.counts[state];
    var max = Math.max(c.R, c.P, c.S);
    var likely = THROWS.filter(function (t) { return c[t] === max; });
    var predicted = pick(likely); // Ties broken at random.
    return BEATS[predicted];
  }

  function outcome(player, bot) {
    if (player === bot) { return 'tie'; }
    return BEATS[bot] === player ? 'win' : 'loss';
  }

  // Record what the player threw after the current state, then advance it.
  function learnInto(game, player) {
    var state = stateOf(game);
    if (state !== null) {
      if (!game.counts[state]) { game.counts[state] = { R: 0, P: 0, S: 0 }; }
      game.counts[state][player] += 1;
    }
    game.last.push(player);
    if (game.last.length > 2) { game.last.shift(); }
  }

  // Used by both real rounds and the demo.
  function playRound(game, player) {
    var bot = botThrowFor(game);
    var result = outcome(player, bot);

    game.rounds += 1;
    if (result === 'win') { game.wins += 1; }
    else if (result === 'loss') { game.losses += 1; }
    else { game.ties += 1; }

    learnInto(game, player);

    var state = stateOf(game);
    if (state !== null) {
      game.visited.push(state);
      if (game.visited.length > 20) { game.visited.shift(); }
    }
    return { bot: bot, result: result };
  }

  function winRate() {
    return active.rounds === 0 ? 0 : Math.round(100 * active.wins / active.rounds);
  }

  function renderStats() {
    stat.rounds.textContent = String(active.rounds);
    stat.wins.textContent = String(active.wins);
    stat.losses.textContent = String(active.losses);
    stat.ties.textContent = String(active.ties);
    stat.rate.textContent = winRate() + '%';
  }

  function renderVerdict() {
    if (active.rounds < 10) {
      verdictEl.textContent = '';
      return;
    }
    var rate = winRate();
    var text;
    if (rate > 36) {
      text = 'You are winning ' + rate + '% of rounds. Random play would get about 33%, so you are beating it. Either you are hard to predict or you have worked out the rule.';
    } else if (rate >= 30) {
      text = 'You are winning ' + rate + '% of rounds, about what random play would get. Neither of you has figured the other out yet.';
    } else {
      text = 'You are winning ' + rate + '% of rounds. Random play would get about 33%. The bot has found your pattern.';
    }
    // Only update when the text changes, so screen readers don't repeat it
    // every round.
    if (verdictEl.textContent !== text) { verdictEl.textContent = text; }
  }

  function renderResult(player, bot, result) {
    var text = 'You played ' + NAME[player] + ', the bot played ' + NAME[bot] + '. ';
    if (result === 'win') { text += 'You win.'; }
    else if (result === 'loss') { text += 'You lose.'; }
    else { text += 'Tie.'; }
    resultEl.textContent = text;
  }

  // Chain grid: one block per state. Row is the older throw and column is the
  // newer one, so from state ab the next state is always in row b.
  var UX = 46;          // half-width of a block's top face
  var UY = 27;          // y step per grid position
  var TOP = 23;         // half-height of the top face
  var BASE_X = 150;
  var BASE_Y = 56;

  var FILL_STOPS = [
    [0, 'var(--grid-0)'],
    [1, 'var(--grid-1)'],
    [3, 'var(--grid-2)'],
    [6, 'var(--grid-3)'],
    [11, 'var(--grid-4)']
  ];

  // Block height by count, same bands as the fill. Keep it under UY or a
  // block in front would cover the top of the one behind it.
  var HEIGHTS = [3, 8, 13, 18, 23];

  var chainEl = document.querySelector('.chain');
  var descEl = document.getElementById('chain-desc');
  var markerEl = document.getElementById('chain-marker');

  // The label is centered on the top face, so the marker goes to its left.
  var MARKER_DX = 25;

  function idx(throwLetter) { return THROWS.indexOf(throwLetter); }

  function bandOf(total) {
    var b = 0;
    for (var i = 0; i < FILL_STOPS.length; i += 1) {
      if (total >= FILL_STOPS[i][0]) { b = i; }
    }
    return b;
  }

  function totalFor(state) {
    var c = active.counts[state];
    return c ? c.R + c.P + c.S : 0;
  }

  // Center of a state's top face. Taller blocks sit higher.
  function topOf(state) {
    var i = idx(state.charAt(0));
    var k = idx(state.charAt(1));
    var h = HEIGHTS[bandOf(totalFor(state))];
    return { x: BASE_X + (i - k) * UX, y: BASE_Y + (i + k) * UY - h, h: h };
  }

  function faces(t) {
    var x = t.x, y = t.y, h = t.h;
    return {
      top: 'M' + x + ' ' + (y - TOP) + 'L' + (x + UX) + ' ' + y +
           'L' + x + ' ' + (y + TOP) + 'L' + (x - UX) + ' ' + y + 'Z',
      left: 'M' + (x - UX) + ' ' + y + 'L' + x + ' ' + (y + TOP) +
            'L' + x + ' ' + (y + TOP + h) + 'L' + (x - UX) + ' ' + (y + h) + 'Z',
      right: 'M' + (x + UX) + ' ' + y + 'L' + x + ' ' + (y + TOP) +
             'L' + x + ' ' + (y + TOP + h) + 'L' + (x + UX) + ' ' + (y + h) + 'Z'
    };
  }

  // Stop the line at the edge of the target's top face so the arrowhead
  // touches it from any direction. The face is a rhombus: |dx|/UX + |dy|/TOP = 1.
  function edgeTo(from, to) {
    var dx = from.x - to.x, dy = from.y - to.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) { return null; }
    var s = 1 / (Math.abs(dx) / UX + Math.abs(dy) / TOP) + 6 / len;
    return 'M' + from.x + ' ' + from.y + 'L' + (to.x + dx * s) + ' ' + (to.y + dy * s);
  }

  // Staying in the same state draws a small loop over the block.
  function selfLoop(t) {
    return 'M' + (t.x - 11) + ' ' + (t.y - 9) +
           'A 13 13 0 1 1 ' + (t.x + 11) + ' ' + (t.y - 9);
  }

  function describe(state, total) {
    if (state === null) {
      return 'Nine blocks, one per two-throw state. ' +
             'The bot needs two throws before it has a state.';
    }
    if (total === 0) {
      return 'Current state ' + state + ', not seen before. The bot will play at random.';
    }
    var c = active.counts[state];
    var max = Math.max(c.R, c.P, c.S);
    var likely = THROWS.filter(function (t) { return c[t] === max; });
    var names = likely.map(function (t) { return NAME[t]; }).join(' or ');
    return 'Current state ' + state + ', seen ' + total +
           (total === 1 ? ' time. ' : ' times. ') + 'Most often followed by ' + names + '.';
  }

  // Colors are set as inline styles, not attributes. CSS rules like
  // .face { fill } override SVG attributes, so setAttribute('fill') does nothing.
  function renderChain() {
    if (!chainEl) { return; }

    var state = stateOf(active);

    var trail = [];
    var visited = active.visited;
    for (var v = visited.length - 1; v >= 0 && trail.length < 3; v -= 1) {
      if (visited[v] !== state && trail.indexOf(visited[v]) === -1) { trail.push(visited[v]); }
    }

    for (var r = 0; r < 3; r += 1) {
      for (var c = 0; c < 3; c += 1) {
        var name = THROWS[r] + THROWS[c];
        var block = document.getElementById('cell-' + name);
        if (!block) { continue; }

        var t = topOf(name);
        var f = faces(t);
        var token = FILL_STOPS[bandOf(totalFor(name))][1];

        var topEl = document.getElementById('top-' + name);
        var leftEl = document.getElementById('left-' + name);
        var rightEl = document.getElementById('right-' + name);
        topEl.style.d = 'path("' + f.top + '")';
        leftEl.style.d = 'path("' + f.left + '")';
        rightEl.style.d = 'path("' + f.right + '")';
        topEl.setAttribute('d', f.top);
        leftEl.setAttribute('d', f.left);
        rightEl.setAttribute('d', f.right);

        // Sides are darker mixes of the top color, so they follow the theme.
        topEl.style.fill = token;
        leftEl.style.fill = 'color-mix(in srgb, ' + token + ' 80%, #000)';
        rightEl.style.fill = 'color-mix(in srgb, ' + token + ' 64%, #000)';

        document.getElementById('label-' + name).setAttribute('y', String(t.y));
        block.setAttribute('class',
          'chain-block' + (name === state ? ' is-current' : (trail.indexOf(name) !== -1 ? ' is-trail' : '')));
      }
    }

    var total = state === null ? 0 : totalFor(state);
    var from = state === null ? null : topOf(state);
    for (var e = 0; e < 3; e += 1) {
      var edge = document.getElementById('edge-' + THROWS[e]);
      if (!edge) { continue; }
      if (state === null) {
        edge.style.opacity = '0';
        continue;
      }
      var dst = state.charAt(1) + THROWS[e];
      var path = dst === state ? selfLoop(from) : edgeTo(from, topOf(dst));
      edge.setAttribute('d', path || '');
      edge.style.opacity = '1';

      if (total === 0) {
        // New state, so the bot will throw at random. Dashed edges show that.
        edge.style.strokeWidth = '1';
        edge.style.strokeDasharray = '3 3';
      } else {
        edge.style.strokeWidth = String(1 + 4 * (active.counts[state][THROWS[e]] / total));
        edge.style.strokeDasharray = '';
      }
    }

    if (markerEl) {
      if (state === null) {
        markerEl.style.opacity = '0';
      } else {
        var m = topOf(state);
        var target = 'translate(' + (m.x - MARKER_DX) + 'px, ' + m.y + 'px)';
        if (markerEl.style.opacity !== '1') {
          // First time: jump into place before fading in, or it slides in from
          // the corner.
          markerEl.style.transition = 'none';
          markerEl.style.transform = target;
          void markerEl.getBoundingClientRect();
          markerEl.style.transition = '';
        } else {
          markerEl.style.transform = target;
        }
        markerEl.style.opacity = '1';
      }
    }

    if (descEl) { descEl.textContent = describe(state, total); }
  }

  function play(player) {
    stopDemo();

    var round = playRound(active, player);

    renderResult(player, round.bot, round.result);
    renderStats();
    renderVerdict();
    renderChain();
  }

  function reset() {
    stopDemo();
    liveGame = freshGame();
    active = liveGame;
    resultEl.textContent = '';
    verdictEl.textContent = '';
    renderStats();
    renderChain();
  }

  // Demo: until someone plays, a fake player throws every 900ms to show how the
  // grid works. The first real play stops it for good.
  var DEMO_TICK_MS = 900;
  var demoNote = document.getElementById('demo-note');
  var demoTimer = null;
  var demoStartTimer = null;
  var demoStopped = false;
  var demoPrev = null;

  // People repeat a throw less often than random (33%), so the fake player
  // only repeats 15% of the time. That gives the bot a pattern to find.
  function demoThrow() {
    if (demoPrev === null) { return pick(THROWS); }
    if (Math.random() < 0.15) { return demoPrev; }
    return pick(THROWS.filter(function (t) { return t !== demoPrev; }));
  }

  function demoTick() {
    demoTimer = null;
    if (demoStopped) { return; }
    if (document.hidden) { return; } // resumed on visibilitychange

    demoPrev = demoThrow();
    playRound(demoGame, demoPrev);

    // No result or verdict for demo rounds. The result line is a live region,
    // so screen readers would announce every one.
    renderStats();
    renderChain();

    demoTimer = setTimeout(demoTick, DEMO_TICK_MS);
  }

  function stopDemo() {
    if (demoStopped) { return; }
    demoStopped = true;
    if (demoStartTimer !== null) { clearTimeout(demoStartTimer); demoStartTimer = null; }
    if (demoTimer !== null) { clearTimeout(demoTimer); demoTimer = null; }
    if (demoNote) { demoNote.hidden = true; }
    active = liveGame;
  }

  // Start the demo after two seconds. It doesn't run at all with reduced motion.
  demoStartTimer = setTimeout(function () {
    demoStartTimer = null;
    if (demoStopped) { return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    active = demoGame;
    if (demoNote) { demoNote.hidden = false; }
    demoTick();
  }, 2000);

  // Pause the demo while the tab is hidden.
  document.addEventListener('visibilitychange', function () {
    if (demoStopped || active !== demoGame) { return; }
    if (document.hidden) {
      if (demoTimer !== null) { clearTimeout(demoTimer); demoTimer = null; }
    } else if (demoTimer === null) {
      demoTimer = setTimeout(demoTick, DEMO_TICK_MS);
    }
  });

  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener('click', function () {
      play(button.getAttribute('data-throw'));
    });
  });

  resetBtn.addEventListener('click', reset);

  document.addEventListener('keydown', function (event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) { return; }
    var tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { return; }
    var key = (event.key || '').toUpperCase();
    if (NAME[key]) {
      event.preventDefault();
      play(key);
    }
  });

  renderStats();
  renderChain();
  ui.hidden = false;
})();
