/*
 * Update bar (the same file in all of Anderson's apps).
 * ---------------------------------------------------------------
 * When a new version is published on GitHub (VERSION changed in sw.js),
 * the app shows "A new version of <name> is ready" with an Update button.
 * Nothing changes until Update is tapped, so it never interrupts work in
 * progress. The app checks for updates when it opens and every time you
 * come back to it.
 *
 * Use:  <script src="update.js" data-app="App name"></script>
 * Needs sw.js to: not call skipWaiting() on install, and call it when it
 * receives the message {type: 'SKIP_WAITING'}.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var NAME = (me && me.getAttribute('data-app')) || 'this app';
  var SW = (me && me.getAttribute('data-sw')) || 'sw.js';
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  try { if (window.self !== window.top) return; } catch (e) { return; } // previews inside other pages

  var wanted = false;     // reload only after the person tapped Update
  var bar = null;
  var snoozed = false;    // "Later" hides it until the next time the app is opened
  var lastCheck = 0;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (wanted) { wanted = false; location.reload(); }
  });

  function addStyles() {
    if (document.getElementById('upd-style')) return;
    var s = document.createElement('style');
    s.id = 'upd-style';
    s.textContent =
      '.upd-bar{position:fixed;left:50%;top:max(12px,calc(env(safe-area-inset-top,0px) + 20px));transform:translateX(-50%);' +
      'z-index:2147483000;display:flex;align-items:center;gap:6px;width:max-content;max-width:calc(100% - 24px);' +
      'padding:6px 4px 6px 16px;border-radius:18px;background:#141a2e;color:#f3f5ff;' +
      'box-shadow:0 12px 36px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08);' +
      'font:600 14px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;animation:upd-in .3s ease-out}' +
      '.upd-text{min-width:0}' +
      '.upd-go{flex:none;min-height:44px;padding:0 16px;border:0;border-radius:13px;background:#f3f5ff;color:#141a2e;' +
      'font:800 14px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;cursor:pointer}' +
      '.upd-go:disabled{opacity:.7}' +
      '.upd-x{flex:none;width:44px;height:44px;border:0;background:none;color:#9aa3c7;font-size:22px;line-height:1;cursor:pointer}' +
      '.upd-go:focus-visible,.upd-x:focus-visible{outline:3px solid #8fb4ff;outline-offset:2px}' +
      '@keyframes upd-in{from{opacity:0;transform:translate(-50%,-8px)}}' +
      '@media (prefers-reduced-motion:reduce){.upd-bar{animation:none}}';
    document.head.appendChild(s);
  }

  function show(reg) {
    if (bar || snoozed) return;
    addStyles();
    bar = document.createElement('div');
    bar.className = 'upd-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="upd-text"></span><button type="button" class="upd-go">Update</button>' +
      '<button type="button" class="upd-x" aria-label="Not now">×</button>';
    bar.querySelector('.upd-text').textContent = 'A new version of ' + NAME + ' is ready.';
    bar.querySelector('.upd-go').addEventListener('click', function () {
      var w = reg.waiting;
      if (!w) { location.reload(); return; }
      wanted = true;
      this.disabled = true;
      this.textContent = 'Updating…';
      w.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(function () { if (wanted) location.reload(); }, 4000); // safety net
    });
    bar.querySelector('.upd-x').addEventListener('click', function () {
      snoozed = true;
      if (bar) { bar.remove(); bar = null; }
    });
    document.body.appendChild(bar);
  }

  function watch(reg) {
    var ready = function () { return reg.waiting && navigator.serviceWorker.controller; };
    if (ready()) show(reg);
    reg.addEventListener('updatefound', function () {
      var w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'installed' && navigator.serviceWorker.controller) show(reg);
      });
    });
    function check() {
      var now = Date.now();
      if (now - lastCheck < 30000) return;
      lastCheck = now;
      reg.update().catch(function () {});
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { snoozed = false; return; }
      check();
      if (ready()) show(reg);
    });
    setInterval(check, 30 * 60 * 1000);
  }

  function start() {
    navigator.serviceWorker.register(SW).then(watch).catch(function () {});
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
