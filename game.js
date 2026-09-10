/*
 * Can you beat a Markov chain?
 *
 * Rock paper scissors against an order-2 Markov chain over the player's own
 * throw history. The state is the player's previous two throws. For each
 * state the bot counts what the player threw next, predicts the most common
 * follow-up, and plays the throw that beats it.
 *
 * Vanilla JavaScript, no dependencies. All state lives in memory and is gone
 * on reload. Nothing is stored or sent anywhere.
 */
(function () {
  'use strict';

  var ui = document.getElementById('game-ui');
  if (!ui) { return; }

  var THROWS = ['R', 'P', 'S'];
  var NAME = { R: 'Rock', P: 'Paper', S: 'Scissors' };
  var BEATS = { R: 'P', P: 'S', S: 'R' }; // BEATS[x] is the throw that beats x.

  // On this fraction of moves the bot ignores its prediction and throws at
  // random. Without it, a player who has worked out the rule can win every
  // round by feeding it a pattern and then breaking it. A little noise keeps
  // the game honest in both directions and makes it feel less rigged.
  var EXPLORE = 0.10;

  // Counts are not pre-seeded. The first rounds really are random, and the
  // bot only starts to bite once it has seen a pattern more than once.
  //
  // A whole game lives in one bundle, and there are two bundles: the idle
  // demo plays into its own and the visitor plays into the other. Handover is
  // a pointer swap to an object the demo never touched, so a trained model
  // cannot leak into somebody's first real round through a missed field.
  function freshGame() {
    return {
      last: [],    // previous throws, at most two
      counts: {},  // state -> { R: n, P: n, S: n }
      rounds: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      visited: []  // recently occupied states; only the grid's trail reads it
    };
  }

  var liveGame = freshGame(); // the visitor's game; the demo never writes here
  var demoGame = freshGame(); // the demo's game; abandoned at handover
  var active = liveGame;      // whichever bundle the renderers draw

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

  // One complete round against a given bundle. Real play and the idle demo
  // both come through here, so the model logic cannot fork into two copies
  // that drift apart.
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
    // Only touch the live region when the sentence changes, so a screen
    // reader is not read the same verdict after every round.
    if (verdictEl.textContent !== text) { verdictEl.textContent = text; }
  }

  function renderResult(player, bot, result) {
    var text = 'You played ' + NAME[player] + ', the bot played ' + NAME[bot] + '. ';
    if (result === 'win') { text += 'You win.'; }
    else if (result === 'loss') { text += 'You lose.'; }
    else { text += 'Tie.'; }
    resultEl.textContent = text;
  }

  /* Chain grid --------------------------------------------------------------
   *
   * Nine cells, one per ordered pair. Row is the older throw, column is the
   * newer one. From (a, b) the three successors are (b, R), (b, P), (b, S),
   * which all sit in row b: the column you are in becomes the row you move to.
   * That is why the marker only ever walks down a column and then along a row.
   */

  var COL_X = [8, 116, 224];
  var ROW_Y = [8, 104, 200];
  var CELL_W = 88;
  var CELL_H = 56;

  // var() references, not resolved hex: the browser resolves them against the
  // active theme, so toggling light/dark recolours every cell instantly
  // without another render.
  var FILL_STOPS = [
    [0, 'var(--grid-0)'],
    [1, 'var(--grid-1)'],
    [3, 'var(--grid-2)'],
    [6, 'var(--grid-3)'],
    [11, 'var(--grid-4)']
  ];

  var chainEl = document.querySelector('.chain');
  var descEl = document.getElementById('chain-desc');
  var markerEl = document.getElementById('chain-marker');

  // The brief puts both the label and the marker at the cell centre, where they
  // sit on top of each other and the state text becomes unreadable. The label
  // keeps the centre, since it is the thing you need to read; the marker sits
  // left of it, still inside the cell and still hopping between cells.
  var MARKER_DX = 18;

  function idx(throwLetter) { return THROWS.indexOf(throwLetter); }
  function centreX(col) { return COL_X[col] + CELL_W / 2; }
  function centreY(row) { return ROW_Y[row] + CELL_H / 2; }
  function markerX(col) { return COL_X[col] + MARKER_DX; }

  function fillFor(total) {
    var fill = FILL_STOPS[0][1];
    for (var i = 0; i < FILL_STOPS.length; i += 1) {
      if (total >= FILL_STOPS[i][0]) { fill = FILL_STOPS[i][1]; }
    }
    return fill;
  }

  function totalFor(state) {
    var c = active.counts[state];
    return c ? c.R + c.P + c.S : 0;
  }

  // A straight drop or climb between two different rows. Edges are painted
  // under the cells, so the rare line that clips a cell between distant rows is
  // hidden by it rather than drawn across it.
  function straightEdge(srcCol, srcRow, dstCol, dstRow) {
    var x1 = centreX(srcCol);
    var x2 = centreX(dstCol);
    var down = dstRow > srcRow;
    var y1 = down ? ROW_Y[srcRow] + CELL_H : ROW_Y[srcRow];
    var y2 = down ? ROW_Y[dstRow] - 6 : ROW_Y[dstRow] + CELL_H + 6;
    return 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2;
  }

  // Successors share the current row when the two throws are equal. Drawing
  // those straight would run the line through whatever cell sits between, so
  // they detour into the gap band instead, one lane per throw.
  function sameRowEdge(srcCol, dstCol, row, lane) {
    var below = row < 2;
    var edgeY = below ? ROW_Y[row] + CELL_H : ROW_Y[row];
    var laneY = below ? edgeY + lane : edgeY - lane;
    var stopY = below ? edgeY + 6 : edgeY - 6;

    // Landing back on the same cell: a small U, so it reads as "stays put".
    if (srcCol === dstCol) {
      var cx = centreX(srcCol);
      return 'M' + (cx - 12) + ' ' + edgeY +
             'L' + (cx - 12) + ' ' + laneY +
             'L' + (cx + 12) + ' ' + laneY +
             'L' + (cx + 12) + ' ' + stopY;
    }
    return 'M' + centreX(srcCol) + ' ' + edgeY +
           'L' + centreX(srcCol) + ' ' + laneY +
           'L' + centreX(dstCol) + ' ' + laneY +
           'L' + centreX(dstCol) + ' ' + stopY;
  }

  function describe(state, total) {
    if (state === null) {
      return 'A three by three grid of the nine two-throw states. ' +
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

  // Everything painted here is written as an inline style, never as an SVG
  // presentation attribute. A stylesheet rule outranks a presentation
  // attribute, so `setAttribute('fill', ...)` against a CSS `.chain-cell { fill }`
  // is silently discarded and every cell keeps the base colour.
  function renderChain() {
    if (!chainEl) { return; }

    var state = stateOf(active);

    // Fills, plus the ring on the current cell and the fading trail behind it.
    var trail = [];
    var visited = active.visited;
    for (var v = visited.length - 1; v >= 0 && trail.length < 3; v -= 1) {
      if (visited[v] !== state && trail.indexOf(visited[v]) === -1) { trail.push(visited[v]); }
    }

    for (var r = 0; r < 3; r += 1) {
      for (var c = 0; c < 3; c += 1) {
        var name = THROWS[r] + THROWS[c];
        var cell = document.getElementById('cell-' + name);
        if (!cell) { continue; }
        cell.style.fill = fillFor(totalFor(name));
        cell.setAttribute('class',
          'chain-cell' + (name === state ? ' is-current' : (trail.indexOf(name) !== -1 ? ' is-trail' : '')));
      }
    }

    // Only the three edges leaving the current state are ever drawn.
    var total = state === null ? 0 : totalFor(state);
    for (var t = 0; t < 3; t += 1) {
      var edge = document.getElementById('edge-' + THROWS[t]);
      if (!edge) { continue; }
      if (state === null) {
        edge.style.opacity = '0';
        continue;
      }
      var srcRow = idx(state.charAt(0));
      var srcCol = idx(state.charAt(1));
      var dstRow = srcCol;            // the column you are in is the row you move to
      var dstCol = t;

      edge.setAttribute('d', srcRow === dstRow
        ? sameRowEdge(srcCol, dstCol, srcRow, 12 + t * 10)
        : straightEdge(srcCol, srcRow, dstCol, dstRow));
      edge.style.opacity = '1';

      if (total === 0) {
        // No history here, so the bot is about to throw at random. Dashes say so.
        edge.style.strokeWidth = '1';
        edge.style.strokeDasharray = '3 3';
      } else {
        edge.style.strokeWidth = String(1 + 4 * (active.counts[state][THROWS[t]] / total));
        edge.style.strokeDasharray = '';
      }
    }

    if (markerEl) {
      if (state === null) {
        markerEl.style.opacity = '0';
      } else {
        var target =
          'translate(' + markerX(idx(state.charAt(1))) + 'px, ' + centreY(idx(state.charAt(0))) + 'px)';
        if (markerEl.style.opacity !== '1') {
          // First appearance: place it, then fade it in. Without this the
          // transform transitions from its initial identity, so the marker
          // visibly flies in from the SVG's top-left corner.
          markerEl.style.transition = 'none';
          markerEl.style.transform = target;
          void markerEl.getBoundingClientRect(); // commit the jump
          markerEl.style.transition = '';
        } else {
          markerEl.style.transform = target;
        }
        markerEl.style.opacity = '1';
      }
    }

    // The result line is already a live region; this one is read on demand.
    if (descEl) { descEl.textContent = describe(state, total); }
  }

  function play(player) {
    stopDemo(); // The first real interaction ends the demo before the round lands.

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

  /* Idle self-play ----------------------------------------------------------
   *
   * Until somebody plays, a simulated opponent throws every 900ms so the grid
   * demonstrates itself: the marker hops, cells darken, edges thicken. The
   * first real interaction stops it for good and hands over liveGame, on
   * which nothing has ever been learned.
   */

  var DEMO_TICK_MS = 900;
  var demoNote = document.getElementById('demo-note');
  var demoTimer = null;      // the pending tick, if one is scheduled
  var demoStartTimer = null; // the settle delay before the first tick
  var demoStopped = false;   // once true, the demo never runs again
  var demoPrev = null;       // the simulated player's previous throw

  // Humans under-repeat, so the simulated player does too: it repeats 15% of
  // the time where uniform random would repeat 33%. That is the skew the bot
  // visibly finds, without winning so hard the demo looks staged.
  function demoThrow() {
    if (demoPrev === null) { return pick(THROWS); }
    if (Math.random() < 0.15) { return demoPrev; }
    return pick(THROWS.filter(function (t) { return t !== demoPrev; }));
  }

  function demoTick() {
    demoTimer = null;
    if (demoStopped) { return; }
    if (document.hidden) { return; } // the visibilitychange handler resumes

    demoPrev = demoThrow();
    playRound(demoGame, demoPrev);

    // Deliberately no renderResult and no renderVerdict. The result line is a
    // polite live region that must not narrate a demo round every 900ms, and
    // the verdict addresses a visitor who is not playing yet.
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
    active = liveGame; // Handover: zero everywhere by construction, not cleanup.
  }

  // The demo waits two seconds so the page can settle first. With reduced
  // motion it never runs at all: the grid sits empty until a real click.
  demoStartTimer = setTimeout(function () {
    demoStartTimer = null;
    if (demoStopped) { return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    active = demoGame;
    if (demoNote) { demoNote.hidden = false; }
    demoTick();
  }, 2000);

  // A background tab should not burn a timer for an hour. Pause while hidden,
  // resume on return, unless the demo has already been stopped.
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
