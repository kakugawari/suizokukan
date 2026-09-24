/*!
 * sound.js — 効果音と振動。音は Web Audio でその場で作る (音のファイルは無い)。
 *
 * iPhone の Safari について:
 * - 音は、指で触ったときに AudioContext を起こさないと鳴らない (unlock)
 * - 本体のマナースイッチが入っていると、Web Audio の音は鳴らない (それでよい)
 * - navigator.vibrate が無い。iOS 18 からは <input type="checkbox" switch> を
 *   切りかえると本体がコツッと震えるので、それを使う (指で触った流れの中でだけ効く)
 */
(function (root) {
  'use strict';

  let ctx = null;
  let enabled = true;
  const log = [];   // 自動テスト用: 鳴らした/震わせた名前を残す

  function unlock() {
    if (!enabled) return;
    try {
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }

  /** 1 音。f0→f1 へ音程をすべらせ、短く消える */
  function note(f0, f1, at, dur, type, vol) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568;
  const SOUNDS = {
    coin:   () => { note(988, 988, 0, 0.07, 'square', 0.06); note(1319, 1319, 0.06, 0.16, 'square', 0.06); },
    bubble: () => { note(380, 900, 0, 0.12, 'sine', 0.14); },
    merge:  () => { note(300, 820, 0, 0.14, 'sine', 0.2); note(C6, C6, 0.1, 0.18, 'triangle', 0.1); },
    rare:   () => { [C6, E6, G6].forEach((f, i) => note(f, f, i * 0.07, 0.22, 'triangle', 0.12)); },
    gold:   () => { [C6, E6, G6, C6 * 2].forEach((f, i) => note(f, f, i * 0.06, 0.3, 'triangle', 0.12));
                    [0.3, 0.38, 0.46].forEach((a) => note(2637, 2637, a, 0.12, 'sine', 0.05)); },
    found:  () => { [C5, E5, G5, C6].forEach((f, i) => note(f, f, i * 0.1, 0.32, 'triangle', 0.16));
                    note(E6, E6, 0.42, 0.5, 'sine', 0.08); },
    nope:   () => { note(260, 170, 0, 0.18, 'sine', 0.16); },
    buy:    () => { note(G5, G5, 0, 0.08, 'square', 0.05); note(C6, C6, 0.07, 0.2, 'square', 0.05); },
    tap:    () => { note(660, 660, 0, 0.05, 'triangle', 0.08); },
    perfect:() => { [G5, C6, E6].forEach((f, i) => note(f, f, i * 0.05, 0.18, 'triangle', 0.12)); },
    good:   () => { note(G5, G5, 0, 0.14, 'triangle', 0.12); },
    miss:   () => { note(300, 220, 0, 0.16, 'sine', 0.12); }
  };

  function play(name) {
    log.push('s:' + name);
    if (!enabled || !ctx || ctx.state !== 'running') return;
    try { SOUNDS[name](); } catch (e) {}
  }

  /* 振動 */
  let sw = null;
  function switchLabel() {
    if (sw) return sw;
    sw = document.createElement('label');
    sw.setAttribute('aria-hidden', 'true');
    sw.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    sw.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.appendChild(sw);
    return sw;
  }
  /** times 回 (間を少しあけて) 震わせる */
  function buzz(times) {
    const n = times || 1;
    log.push('b:' + n);
    if (!enabled) return;
    try {
      if (navigator.vibrate) { navigator.vibrate(n === 1 ? 15 : Array.from({ length: n * 2 - 1 }, (_, i) => (i % 2 ? 60 : 20))); return; }
      const l = switchLabel();
      l.click();
      for (let i = 1; i < n; i++) setTimeout(() => l.click(), i * 90);
    } catch (e) {}
  }

  root.Sound = {
    unlock, play, buzz,
    setEnabled(v) { enabled = !!v; if (enabled) unlock(); },
    get enabled() { return enabled; },
    log
  };
})(typeof window !== 'undefined' ? window : globalThis);
