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
  var last = [];   // Player's previous throws, at most two.
  var counts = {}; // state -> { R: n, P: n, S: n }
  var rounds = 0;
  var wins = 0;
  var losses = 0;
  var ties = 0;

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

  function currentState() {
    return last.length === 2 ? last[0] + last[1] : null;
  }

  function botThrow() {
    var state = currentState();
    if (state === null || !counts[state] || Math.random() < EXPLORE) {
      return pick(THROWS);
    }
    var c = counts[state];
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
  function learn(player) {
    var state = currentState();
    if (state !== null) {
      if (!counts[state]) { counts[state] = { R: 0, P: 0, S: 0 }; }
      counts[state][player] += 1;
    }
    last.push(player);
    if (last.length > 2) { last.shift(); }
  }

  function winRate() {
    return rounds === 0 ? 0 : Math.round(100 * wins / rounds);
  }

  function renderStats() {
    stat.rounds.textContent = String(rounds);
    stat.wins.textContent = String(wins);
    stat.losses.textContent = String(losses);
    stat.ties.textContent = String(ties);
    stat.rate.textContent = winRate() + '%';
  }

  function renderVerdict() {
    if (rounds < 10) {
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

  var FILL_STOPS = [
    [0, '#EEF0F2'],
    [1, '#DCE7EC'],
    [3, '#BFD5E0'],
    [6, '#8FB6C8'],
    [11, '#5E93AC']
  ];

  var chainEl = document.querySelector('.chain');
  var descEl = document.getElementById('chain-desc');
  var markerEl = document.getElementById('chain-marker');

  // Which cells the player has passed through, most recent last. Used only for
  // the recency trail; the model itself never reads it.
  var visited = [];

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
    var c = counts[state];
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
    var c = counts[state];
    var max = Math.max(c.R, c.P, c.S);
    var likely = THROWS.filter(function (t) { return c[t] === max; });
    var names = likely.map(function (t) { return NAME[t]; }).join(' or ');
    return 'Current state ' + state + ', seen ' + total +
           (total === 1 ? ' time. ' : ' times. ') + 'Most often followed by ' + names + '.';
  }

  function renderChain() {
    if (!chainEl) { return; }

    var state = currentState();

    // Fills, plus the ring on the current cell and the fading trail behind it.
    var trail = [];
    for (var v = visited.length - 1; v >= 0 && trail.length < 3; v -= 1) {
      if (visited[v] !== state && trail.indexOf(visited[v]) === -1) { trail.push(visited[v]); }
    }

    for (var r = 0; r < 3; r += 1) {
      for (var c = 0; c < 3; c += 1) {
        var name = THROWS[r] + THROWS[c];
        var cell = document.getElementById('cell-' + name);
        if (!cell) { continue; }
        cell.setAttribute('fill', fillFor(totalFor(name)));
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
        edge.setAttribute('opacity', '0');
        continue;
      }
      var srcRow = idx(state.charAt(0));
      var srcCol = idx(state.charAt(1));
      var dstRow = srcCol;            // the column you are in is the row you move to
      var dstCol = t;

      edge.setAttribute('d', srcRow === dstRow
        ? sameRowEdge(srcCol, dstCol, srcRow, 12 + t * 10)
        : straightEdge(srcCol, srcRow, dstCol, dstRow));
      edge.setAttribute('opacity', '1');

      if (total === 0) {
        // No history here, so the bot is about to throw at random. Dashes say so.
        edge.setAttribute('stroke-width', '1');
        edge.setAttribute('stroke-dasharray', '3 3');
      } else {
        edge.setAttribute('stroke-width', String(1 + 4 * (counts[state][THROWS[t]] / total)));
        edge.removeAttribute('stroke-dasharray');
      }
    }

    if (markerEl) {
      if (state === null) {
        markerEl.setAttribute('opacity', '0');
      } else {
        markerEl.setAttribute('opacity', '1');
        markerEl.style.transform =
          'translate(' + markerX(idx(state.charAt(1))) + 'px, ' + centreY(idx(state.charAt(0))) + 'px)';
      }
    }

    // The result line is already a live region; this one is read on demand.
    if (descEl) { descEl.textContent = describe(state, total); }
  }

  function play(player) {
    var bot = botThrow();
    var result = outcome(player, bot);

    rounds += 1;
    if (result === 'win') { wins += 1; }
    else if (result === 'loss') { losses += 1; }
    else { ties += 1; }

    learn(player);

    var visitedState = currentState();
    if (visitedState !== null) {
      visited.push(visitedState);
      if (visited.length > 20) { visited.shift(); }
    }

    renderResult(player, bot, result);
    renderStats();
    renderVerdict();
    renderChain();
  }

  function reset() {
    last = [];
    counts = {};
    rounds = 0;
    wins = 0;
    losses = 0;
    ties = 0;
    visited = [];
    resultEl.textContent = '';
    verdictEl.textContent = '';
    renderStats();
    renderChain();
  }

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
