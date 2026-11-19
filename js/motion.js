/* PAWCARE 動きと手応え（v1.12）
 * 押した手応え（リップル）・まちがいの合図（シェイク）・ボトムシートを下に引いて閉じる・
 * 記録できたときの「ぽん」・紙吹雪・横にずらして削除・ボタンのくるくる。
 * ・「動きを減らす」設定の端末では、どれも動かさない。
 * ・緊急時の画面では、お祝いや遅れて出る動きを使わない（呼ぶ側で判断する）。 */
(function () {
  'use strict';
  var reduced = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* 1. リップル：押した所から波紋が広がる */
  var RIPPLE = '.btn, .quick-btn, .tile, .pill, .chip, .sw, .bottom-nav [data-nav], .notice-row, .log-item';
  document.addEventListener('pointerdown', function (e) {
    if (reduced() || e.button > 0) return;
    var el = e.target.closest && e.target.closest(RIPPLE);
    if (!el || el.disabled) return;
    var r = el.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2;
    var s = document.createElement('span');
    s.className = 'ripple';
    s.setAttribute('aria-hidden', 'true');
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size / 2) + 'px';
    s.style.top = (e.clientY - r.top - size / 2) + 'px';
    el.classList.add('has-ripple');
    el.appendChild(s);
    setTimeout(function () { s.remove(); }, 600);
  }, { passive: true });

  /* 2. シェイク：入力のまちがいを横に震えて知らせる */
  function shake(el) {
    if (!el) return;
    if (window.PAWCARE_MOTION && window.PAWCARE_MOTION.hapticOn()) haptic('error');
    if (reduced()) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 500);
  }
  document.addEventListener('invalid', function (e) { shake(e.target.closest('label') || e.target); }, true);

  /* 3. ぽん：記録できたボタンがはずんで「＋1」が浮かぶ */
  function pop(el, text) {
    if (!el || reduced()) return;
    el.classList.remove('popped'); void el.offsetWidth; el.classList.add('popped');
    var b = document.createElement('span');
    b.className = 'plus-one'; b.textContent = text || '+1'; b.setAttribute('aria-hidden', 'true');
    el.appendChild(b);
    setTimeout(function () { b.remove(); el.classList.remove('popped'); }, 900);
  }

  /* 4. 紙吹雪：レベルアップや勲章など、がんばりを祝うときだけ */
  function confetti() {
    if (reduced()) return;
    var colors = ['#34a8d8', '#f2a65a', '#9bd38a', '#f5b5c8', '#f7d95c', '#b9a3e3'];
    var box = document.createElement('div');
    box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 46; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.35) + 's';
      p.style.animationDuration = (1.4 + Math.random() * 1.1) + 's';
      p.style.setProperty('--x', ((Math.random() - 0.5) * 140) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      if (i % 3 === 0) p.style.borderRadius = '50%';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3000);
  }

  /* 5. くるくる→チェック：時間のかかる処理のあいだボタンを「処理中」に */
  function withLoading(el, promise) {
    if (!el || !promise || !promise.then) return promise;
    el.classList.add('is-loading'); el.setAttribute('aria-busy', 'true'); el.disabled = true;
    var done = function (ok) {
      el.classList.remove('is-loading'); el.removeAttribute('aria-busy'); el.disabled = false;
      if (ok && !reduced()) { el.classList.add('is-done'); setTimeout(function () { el.classList.remove('is-done'); }, 900); }
    };
    return promise.then(function (v) { done(true); return v; }, function (e) { done(false); throw e; });
  }

  /* 6. ボトムシートを下に引いて閉じる（スマホの下から出る形のときだけ） */
  function sheetDrag(panel, onClose) {
    var startY = 0, dy = 0, active = false;
    panel.addEventListener('pointerdown', function (e) {
      if (window.innerWidth >= 600) return;
      if (!e.target.closest('.sheet-head, .sheet-grab') || e.target.closest('button')) return;
      active = true; startY = e.clientY; dy = 0;
      panel.style.transition = 'none';
      try { panel.setPointerCapture(e.pointerId); } catch (x) { /* 古い端末 */ }
    });
    panel.addEventListener('pointermove', function (e) {
      if (!active) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
    });
    var end = function () {
      if (!active) return;
      active = false;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 90) onClose();
    };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
  }

  /* 7. 横にずらすと「削除」が出る（記録の一覧）。縦のスクロールはじゃましない */
  var swipe = null;
  function closeSwipes(except) {
    document.querySelectorAll('.swipe-row.open').forEach(function (r) { if (r !== except) { r.classList.remove('open'); r.querySelector('.log-item').style.transform = ''; } });
  }
  document.addEventListener('pointerdown', function (e) {
    var row = e.target.closest && e.target.closest('.swipe-row');
    if (!row || e.target.closest('.swipe-del')) { if (!row) closeSwipes(); return; }
    closeSwipes(row);
    swipe = { row: row, item: row.querySelector('.log-item'), x: e.clientX, y: e.clientY, dx: 0, moving: false, open: row.classList.contains('open') };
  }, { passive: true });
  document.addEventListener('pointermove', function (e) {
    if (!swipe) return;
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.moving) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
      if (Math.abs(dx) < 10) return;
      swipe.moving = true;
      swipe.item.style.transition = 'none';
    }
    var base = swipe.open ? -88 : 0;
    swipe.dx = Math.min(0, Math.max(-120, base + dx));
    swipe.item.style.transform = 'translateX(' + swipe.dx + 'px)';
  }, { passive: true });
  var swipeEnd = function () {
    if (!swipe) return;
    var s = swipe; swipe = null;
    if (!s.moving) return;
    s.item.style.transition = '';
    var open = s.dx < -44;
    s.row.classList.toggle('open', open);
    s.item.style.transform = open ? 'translateX(-88px)' : '';
    /* ずらした直後のタップで編集が開かないように */
    s.row.dataset.justSwiped = '1';
    setTimeout(function () { delete s.row.dataset.justSwiped; }, 350);
  };
  document.addEventListener('pointerup', swipeEnd);
  document.addEventListener('pointercancel', swipeEnd);

  /* 8. 画面が切り替わったとき、中身を少しずつずらして出す（スタッガー） */
  function enter(app) {
    if (reduced() || !app) return;
    app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
    clearTimeout(enter.t);
    enter.t = setTimeout(function () { app.classList.remove('enter'); }, 800);
  }

  /* 9. サウンドデザイン：音源ファイルを使わず、その場で短い音を作る（Web Audio）。
   * 小さく・短く・高めのやさしい音。マナーモードや設定オフでは鳴らさない */
  var ac = null;
  function ctx() {
    if (!ac) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(c, t, freq, dur, type, vol, slideTo) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  var SOUNDS = {
    tick: function (c, t) { tone(c, t, 880, 0.09, 'sine', 0.10, 1320); },                       /* 記録：ぽっ */
    combo: function (c, t) { tone(c, t, 988, 0.08, 'sine', 0.10); tone(c, t + 0.07, 1319, 0.12, 'sine', 0.10); },  /* コンボ：ぴぽっ */
    stamp: function (c, t) { tone(c, t, 180, 0.12, 'triangle', 0.25, 90); [523, 659, 784, 1047].forEach(function (f, i) { tone(c, t + 0.12 + i * 0.08, f, 0.22, 'sine', 0.09); }); }, /* パーフェクト：どんっ＋ドミソド */
    tap: function (c, t) { tone(c, t, 660, 0.06, 'sine', 0.06, 990); },                          /* なでる：ぷっ */
    error: function (c, t) { tone(c, t, 300, 0.1, 'triangle', 0.1); tone(c, t + 0.11, 220, 0.14, 'triangle', 0.1); }
  };
  function silence() { try { if (ac && ac.state === 'running') ac.suspend(); } catch (x) { /* 何もしない */ } }
  function sound(name, on) {
    if (on === false || !SOUNDS[name]) return;
    try { var c = ctx(); if (c) SOUNDS[name](c, c.currentTime + 0.01); } catch (x) { /* 鳴らせない端末 */ }
  }

  /* 10. ハプティクス：Androidは振動、iPhoneはSafariのスイッチ部品の「コツッ」を使う（iOS 18以降）。
   * どちらも非対応なら何もしない */
  var PAT = { light: 12, success: [14, 50, 14], combo: [10, 40, 10, 40, 10], stamp: [30, 60, 30, 60, 120], error: [20, 40, 20] };
  var iosSwitch = null;
  function iosTick() {
    if (!iosSwitch) {
      var l = document.createElement('label'); l.className = 'haptic-switch'; l.setAttribute('aria-hidden', 'true');
      var i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; i.className = 'haptic-input';
      l.appendChild(i); document.body.appendChild(l); iosSwitch = l;
    }
    iosSwitch.click();
  }
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function haptic(kind) {
    var p = PAT[kind] || PAT.light;
    if (navigator.vibrate) { try { navigator.vibrate(p); return; } catch (x) { /* 非対応 */ } }
    if (isIOS) {
      try {
        var n = Array.isArray(p) ? Math.ceil(p.length / 2) : 1;
        iosTick();
        for (var k = 1; k < Math.min(n, 3); k++) setTimeout(iosTick, k * 70);
      } catch (x) { /* 非対応 */ }
    }
  }

  window.PAWCARE_MOTION = { silence: silence, hapticOn: function () { return true; }, sound: sound, haptic: haptic, shake: shake, pop: pop, confetti: confetti, withLoading: withLoading, sheetDrag: sheetDrag, closeSwipes: closeSwipes, enter: enter, reduced: reduced };
})();
