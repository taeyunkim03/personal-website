/*
 * Light and dark theme toggle.
 *
 * Loaded synchronously from <head> rather than deferred, so the stored choice
 * lands on <html> before the first paint. Deferring it would let a dark-theme
 * visitor see a flash of the light palette on every page load.
 *
 * The choice is kept in localStorage and is the only thing this site stores.
 * Until someone picks a side, the operating system preference wins.
 */
(function () {
  'use strict';

  var KEY = 'theme';
  var META = { light: '#FAF5E9', dark: '#14171A' };
  var root = document.documentElement;

  // Lets the stylesheet reveal the button. Without JavaScript the button could
  // not do anything, so CSS keeps it hidden rather than showing a dead control.
  root.className += (root.className ? ' ' : '') + 'js';

  // Private browsing and blocked site data both throw on access, not just on
  // write, so every localStorage call here is guarded.
  function stored() {
    try {
      var value = window.localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function query() {
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);

    // Keeps the mobile browser chrome in step with the page.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', META[theme]); }

    // Absent on the first run: this script parses before the button does.
    var button = document.getElementById('theme-toggle');
    if (button) {
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  var system = query();
  var current = stored() || (system && system.matches ? 'dark' : 'light');
  apply(current);

  document.addEventListener('DOMContentLoaded', function () {
    apply(current); // Labels the button now that it exists.

    var button = document.getElementById('theme-toggle');
    if (!button) { return; }

    button.addEventListener('click', function () {
      current = current === 'dark' ? 'light' : 'dark';
      apply(current);
      try {
        window.localStorage.setItem(KEY, current);
      } catch (e) {
        // The theme still applies for this page view; it just will not persist.
      }
    });
  });

  // Track the system setting, but only while the visitor has not overridden it.
  if (system) {
    var onSystemChange = function (event) {
      if (stored()) { return; }
      current = event.matches ? 'dark' : 'light';
      apply(current);
    };
    if (system.addEventListener) { system.addEventListener('change', onSystemChange); }
    else if (system.addListener) { system.addListener(onSystemChange); }
  }
})();
