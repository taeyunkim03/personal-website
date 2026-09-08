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

  function play(player) {
    var bot = botThrow();
    var result = outcome(player, bot);

    rounds += 1;
    if (result === 'win') { wins += 1; }
    else if (result === 'loss') { losses += 1; }
    else { ties += 1; }

    learn(player);

    renderResult(player, bot, result);
    renderStats();
    renderVerdict();
  }

  function reset() {
    last = [];
    counts = {};
    rounds = 0;
    wins = 0;
    losses = 0;
    ties = 0;
    resultEl.textContent = '';
    verdictEl.textContent = '';
    renderStats();
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
  ui.hidden = false;
})();
