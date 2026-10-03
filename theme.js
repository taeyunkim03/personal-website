// Light and dark theme. Loaded in <head> without defer so the saved theme is
// applied before the page paints.
(function () {
  'use strict';

  var KEY = 'theme';
  var META = { light: '#FAF5E9', dark: '#14171A' };
  var root = document.documentElement;

  // Lets CSS show the parts that need JavaScript, like the theme button.
  root.className += (root.className ? ' ' : '') + 'js';

  // localStorage can throw in private browsing, even when reading.
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

    // Match the browser bar color on mobile.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', META[theme]); }

    // Not there yet on the first call, since this runs before the body loads.
    var button = document.getElementById('theme-toggle');
    if (button) {
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  var system = query();
  var current = stored() || (system && system.matches ? 'dark' : 'light');
  apply(current);

  document.addEventListener('DOMContentLoaded', function () {
    apply(current); // again, now that the button exists

    var button = document.getElementById('theme-toggle');
    if (!button) { return; }

    button.addEventListener('click', function () {
      current = current === 'dark' ? 'light' : 'dark';
      apply(current);
      try {
        window.localStorage.setItem(KEY, current);
      } catch (e) {
        // Still works for this page, it just won't be saved.
      }
    });
  });

  // Follow the system setting until the visitor picks a theme.
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
