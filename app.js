/*!
 * app.js — 画面まわり。操作と描画はここに書く。中身の決まりごとは core.js。
 */
(function () {
  'use strict';

  const C = window.Core;
  const { SP, DC, DECOR, SPECIES, FORM_N } = C;
  const src = (key) => C.imgSrc(key);
  const ratio = (key) => C.IMG_SIZE[key][1] / C.IMG_SIZE[key][0];

  /* ===== 状態 ===== */
  let state = C.newState(Date.now());
  let uid = 1;
  function save() {
    state.lastTs = Date.now();
    try {
      localStorage.setItem(C.SAVE_KEY, JSON.stringify({
        ...state,
        fish: state.fish.map(({ el, drag, ...f }) => f),
        decor: state.decor.map(({ el, ...d }) => d)
      }));
    } catch (e) {}
  }
  function load() {
    try { const r = localStorage.getItem(C.SAVE_KEY); if (r) state = Object.assign(state, JSON.parse(r)); } catch (e) {}
    C.migrate(state);
    uid = C.nextUid(state);
  }

  /* ===== 画面 ===== */
  const tank = document.getElementById('tank');
  const coinEl = document.getElementById('coinval');
  const W = () => tank.clientWidth, H = () => tank.clientHeight;
  function setCoins() { coinEl.textContent = Math.floor(state.coins); }

  function fishSize(f) { const w = SP[f.sp].w; return { w, h: w * ratio('f_' + f.sp) }; }

  function makeFishEl(f) {
    const el = document.createElement('div'); el.className = 'fish' + (f.v === 4 ? ' kira' : '');
    const { w, h } = fishSize(f); el.style.width = w + 'px'; el.style.height = h + 'px';
    el.innerHTML = `<img class="body" src="${src('f_' + f.sp)}" style="--ff:${C.formFilter(f.sp, f.v)}" alt="">`;
    f.el = el; tank.appendChild(el); attachFishDrag(f); placeFish(f);
  }
  function placeFish(f) {
    const { w, h } = fishSize(f);
    const bob = f.drag ? 0 : Math.sin(performance.now() / 600 + f.id) * 3;
    f.el.style.left = (f.x - w / 2) + 'px'; f.el.style.top = (f.y - h / 2 + bob) + 'px';
    const face = SP[f.sp].face;
    if (face) {
      const flip = (f.vx > 0 ? 1 : -1) * face;
      f.el.querySelector('.body').style.transform = flip < 0 ? 'scaleX(-1)' : 'none';
    }
  }
  function addFish(sp, v, x, y) {
    const f = { id: uid++, sp, v, x: x ?? 50 + Math.random() * (W() - 100), y: y ?? H() * (0.12 + Math.random() * 0.5),
      vx: (Math.random() < .5 ? -1 : 1) * (0.35 + Math.random() * 0.45), vy: (Math.random() - .5) * 0.25 };
    state.fish.push(f); makeFishEl(f);
    const k = sp + '_' + v, isNew = !state.found[k]; state.found[k] = true;
    if (isNew) setTimeout(updateZukanBadge, 0);
    return { f, isNew };
  }

  function makeDecorEl(d) {
    const t = DC[d.type];
    const el = document.createElement('div'); el.className = 'decor';
    el.style.width = t.w + 'px';
    el.innerHTML = `<img src="${src('d_' + d.type)}" alt="">`;
    d.el = el; tank.appendChild(el); placeDecor(d); attachDecorDrag(d);
  }
  function decorH(d) { return DC[d.type].w * ratio('d_' + d.type); }
  function placeDecor(d) {
    const t = DC[d.type];
    d.el.style.left = (d.fx * W() - t.w / 2) + 'px';
    d.el.style.top = (d.fy * H() - decorH(d)) + 'px';   // fy = 足もとの位置
    d.el.style.zIndex = 4 + Math.round(d.fy * 10);
  }

  /* ===== うごき ===== */
  function loop() {
    const w = W(), h = H();
    for (const f of state.fish) {
      if (f.drag) continue;
      f.x += f.vx; f.y += f.vy;
      const { w: fw } = fishSize(f);
      if (f.x < fw / 2 + 6) { f.x = fw / 2 + 6; f.vx = Math.abs(f.vx); }
      if (f.x > w - fw / 2 - 6) { f.x = w - fw / 2 - 6; f.vx = -Math.abs(f.vx); }
      if (f.y < h * 0.1) { f.y = h * 0.1; f.vy = Math.abs(f.vy); }
      if (f.y > h * 0.74) { f.y = h * 0.74; f.vy = -Math.abs(f.vy); }
      if (Math.random() < 0.008) f.vy = (Math.random() - .5) * 0.35;
      if (Math.random() < 0.002) f.vx *= -1;
      placeFish(f);
    }
    requestAnimationFrame(loop);
  }

  /* ===== ドラッグ ===== */
  function attachFishDrag(f) {
    const el = f.el; let ox, oy, sx, sy, moved;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const r = tank.getBoundingClientRect(); ox = e.clientX - r.left - f.x; oy = e.clientY - r.top - f.y;
      sx = e.clientX; sy = e.clientY; moved = false;
      f.drag = true; el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!f.drag) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) moved = true;
      const r = tank.getBoundingClientRect(); f.x = e.clientX - r.left - ox; f.y = e.clientY - r.top - oy; placeFish(f);
    });
    const up = () => {
      if (!f.drag) return; f.drag = false; el.classList.remove('dragging');
      if (!moved) { state.coins += 1; setCoins(); floatText(f.x, f.y - 20, '+1'); save(); return; }
      tryMerge(f);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function attachDecorDrag(d) {
    const el = d.el; let dragging = false, ox, oy;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId); dragging = true; el.classList.add('dragging');
      const r = tank.getBoundingClientRect(); ox = e.clientX - r.left - d.fx * W(); oy = e.clientY - r.top - d.fy * H();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return; const r = tank.getBoundingClientRect();
      d.fx = Math.min(0.92, Math.max(0.08, (e.clientX - r.left - ox) / W()));
      d.fy = Math.min(0.99, Math.max(0.35, (e.clientY - r.top - oy) / H()));
      placeDecor(d);
    });
    const up = () => { if (!dragging) return; dragging = false; el.classList.remove('dragging'); save(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  /* ===== 合体・こうはい ===== */
  function removeFish(f) { state.fish = state.fish.filter((o) => o !== f); f.el.remove(); }
  function tryMerge(f) {
    const p = state.fish.find((o) => o !== f && Math.hypot(o.x - f.x, o.y - f.y) < Math.max(40, fishSize(f).w * 0.6));
    if (!p) { save(); return; }
    const out = C.mergeOutcome(f, p, state.found);
    if (out.kind === 'none') { toast('この2ひきは なかよしじゃないみたい…'); save(); return; }
    const x = (f.x + p.x) / 2, y = (f.y + p.y) / 2;
    removeFish(f); removeFish(p);
    const { f: n } = addFish(out.sp, out.v, x, y); popFx(n);
    state.coins += out.reward; setCoins(); floatText(x, y - 30, '+' + out.reward);
    const head = out.isNew ? '✨ 新発見！ ' : '';
    if (out.kind === 'same') {
      const v = out.v;
      toast(head + C.fishName(out.sp, v) + (v === 4 ? ' がうまれた！ きらきら！' : v ? ' がうまれた！' : ' がうまれた'));
    } else {
      toast(head + SP[out.sp].name + 'がうまれた！');
    }
    save();
  }
  function popFx(f) { f.el.classList.add('pop'); sparkle(f.x, f.y); }

  /* ===== 演出 ===== */
  function sparkle(x, y) {
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('div'); s.className = 'sparkle';
      s.style.left = (x - 9 + (Math.random() - .5) * 50) + 'px'; s.style.top = (y - 9 + (Math.random() - .5) * 44) + 'px';
      s.innerHTML = '<svg viewBox="0 0 16 16"><path d="M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4Z" fill="#fff8c8"/></svg>';
      tank.appendChild(s); setTimeout(() => s.remove(), 750);
    }
  }
  function floatText(x, y, t) {
    const e = document.createElement('div'); e.className = 'coinfloat'; e.textContent = t;
    e.style.left = (x - 10) + 'px'; e.style.top = y + 'px'; tank.appendChild(e); setTimeout(() => e.remove(), 900);
  }
  let tt;
  function toast(m) {
    const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2000);
  }
  function bubbles() {
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('div'); b.className = 'bubble'; const s = 5 + Math.random() * 9;
      b.style.width = b.style.height = s + 'px'; b.style.left = (5 + Math.random() * 90) + '%';
      b.style.animationDuration = (6 + Math.random() * 6) + 's'; b.style.animationDelay = (-Math.random() * 10) + 's';
      tank.appendChild(b);
    }
  }

  /* ===== 放置・自然発生 ===== */
  function updateBadge() {
    const b = document.getElementById('feedBadge'), n = Math.floor(state.pending);
    b.style.display = n > 0 ? 'block' : 'none'; b.textContent = n;
  }
  function tick() {
    state.pending += C.rate(state.decor.length) * 3; updateBadge();
    if (state.fish.length < C.TANK_CAP && state.decor.length && Math.random() < 0.3) {
      const d = state.decor[Math.floor(Math.random() * state.decor.length)], list = DC[d.type].spawn;
      const sp = list[Math.floor(Math.random() * list.length)];
      const { f, isNew } = addFish(sp, 0, d.fx * W(), Math.min(H() * 0.72, d.fy * H() - decorH(d) * 0.5)); popFx(f);
      toast((isNew ? '✨ 新発見！ ' : '') + DC[d.type].name + 'から' + SP[sp].name + 'が出てきた！');
    }
    save();
  }

  /* ===== モーダル ===== */
  const modals = {
    shop: document.getElementById('shopModal'),
    zukan: document.getElementById('zukanModal'),
    feed: document.getElementById('feedModal')
  };
  function closeModals() { Object.values(modals).forEach((m) => m.classList.remove('open')); stopFeed(); }
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModals; });
  Object.values(modals).forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
  document.getElementById('btnShop').onclick = () => { renderShop(); modals.shop.classList.add('open'); };
  document.getElementById('btnZukan').onclick = () => { renderZukan(); modals.zukan.classList.add('open'); };

  function renderShop() {
    document.getElementById('shopList').innerHTML = DECOR.map((d) => {
      const c = C.decorCost(d, state.decor), n = state.decor.filter((x) => x.type === d.id).length;
      const who = d.spawn.length > 2 ? 'いろんな魚' : d.spawn.map((s) => SP[s].name).join('・');
      return `<div class="shop-item"><div class="icon"><img src="${src('d_' + d.id)}" alt=""></div>
        <div class="info"><b>${d.name}</b><span>${who}が出てくる${n ? '　・ 設置 ' + n : ''}</span></div>
        <button class="buybtn" ${state.coins >= c ? '' : 'disabled'} data-buy="${d.id}">${c}円</button></div>`;
    }).join('');
    document.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => buy(b.dataset.buy); });
  }
  function buy(id) {
    const d = DC[id], c = C.decorCost(d, state.decor); if (state.coins < c) return;
    state.coins -= c; setCoins();
    const o = { id: uid++, type: id, fx: 0.15 + Math.random() * 0.7, fy: 0.86 + Math.random() * 0.1 };
    state.decor.push(o); makeDecorEl(o); sparkle(o.fx * W(), o.fy * H() - 40);
    save(); closeModals(); toast(d.name + 'を置いたよ！ ドラッグで動かせるよ');
  }

  function renderZukan() {
    const total = SPECIES.length * FORM_N; const got = C.foundCount(state.found);
    const next = C.nextMilestone(state.claimed);
    let top = `<div class="zk-top"><div class="row"><span>あつめた すがた</span><span style="color:var(--gold)">${got} / ${total}</span></div>
      <div class="zk-bar"><i style="width:${got / total * 100}%"></i></div>`;
    if (next) {
      top += got >= next[0]
        ? `<div class="row"><small>${next[0]}しゅるい たっせい！</small><button class="buybtn" data-claim="m${next[0]}" data-amt="${next[1]}">+${next[1]}円 うけとる</button></div>`
        : `<small>あと ${next[0] - got} しゅるいで ごほうび +${next[1]}円</small>`;
    } else top += '<small>ぜんぶのごほうびを もらったよ！</small>';
    top += '</div>';
    let html = '';
    for (const s of SPECIES) {
      const n = C.formsFound(state.found, s.id), known = n > 0, done = n === FORM_N;
      const img = src('f_' + s.id);
      const main = known ? `<img src="${img}" alt="">` : `<img class="sil" src="${img}" alt="">`;
      let forms = '';
      for (let v = 0; v < FORM_N; v++) {
        const has = state.found[s.id + '_' + v];
        forms += `<div class="zk-f ${v === 4 ? 'g' : ''}"><img ${has ? `style="filter:${C.formFilter(s.id, v)}"` : 'class="sil"'} src="${img}" alt=""><span>${has || known ? C.formLabel(s.id, v) : '？'}</span></div>`;
      }
      let note;
      if (!known) note = `<div class="zk-note hint">🔍 ${C.hintFor(s.id, state.found)}</div>`;
      else if (!done) note = `<div class="zk-note fact">${s.fact}</div><div class="zk-reward"><span>${s.name}どうしを合わせると色ちがいが出るかも</span></div>`;
      else note = `<div class="zk-note fact">${s.fact}</div>`;
      let reward = '';
      if (known) {
        if (state.claimed['s_' + s.id]) reward = `<div class="zk-reward"><span class="ok">★ コンプリート！</span></div>`;
        else if (done) reward = `<div class="zk-reward"><span class="ok">★ ぜんぶそろった！</span><button class="buybtn" data-claim="s_${s.id}" data-amt="${C.SPECIES_REWARD}">+${C.SPECIES_REWARD}円 うけとる</button></div>`;
        else reward = `<div class="zk-reward"><span>5つそろえると +${C.SPECIES_REWARD}円</span></div>`;
      }
      html += `<div class="zk-card ${state.claimed['s_' + s.id] ? 'done' : ''}"><div class="zk-head"><div class="zk-main">${main}</div>
        <div class="zk-info"><b>${known ? s.name : '？？？'}</b><span class="cnt">${n}/${FORM_N}</span><div class="zk-forms">${forms}</div></div></div>${note}${reward}</div>`;
    }
    document.getElementById('zukanGrid').innerHTML = top + html;
    document.getElementById('zukanCount').textContent = '';
    document.querySelectorAll('[data-claim]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.claim, amt = +b.dataset.amt; if (state.claimed[k]) return;
        state.claimed[k] = true; state.coins += amt; setCoins(); save(); toast('🎁 ごほうび +' + amt + '円！'); renderZukan();
      };
    });
    updateZukanBadge();
  }
  function updateZukanBadge() {
    const b = document.getElementById('zukanBadge'); const n = C.claimable(state.found, state.claimed);
    b.style.display = n ? 'block' : 'none'; b.textContent = '!';
  }

  /* ===== エサやりミニゲーム ===== */
  const fm = document.getElementById('feedMarker');
  let fs = null;
  document.getElementById('btnFeed').onclick = () => {
    if (state.pending < 1) { toast('まだエサがたまっていないよ'); return; }
    document.getElementById('feedPendingVal').textContent = Math.floor(state.pending);
    show('feedIntro'); modals.feed.classList.add('open');
  };
  function show(id) {
    ['feedIntro', 'feedGame', 'feedDone'].forEach((k) => { document.getElementById(k).style.display = k === id ? 'block' : 'none'; });
  }
  document.getElementById('feedStartBtn').onclick = () => { fs = { round: 0, res: [], pool: state.pending }; show('feedGame'); round(); };
  function round() {
    document.getElementById('feedRoundNo').textContent = fs.round + 1; document.getElementById('feedResult').textContent = '';
    fs.lock = false; fs.t0 = performance.now();
    const step = (t) => {
      const m = C.feedMarker(t - fs.t0, fs.round);
      fs.pos = m.pos; fm.style.left = m.pos + '%';
      fm.style.transform = 'translate(-50%,-50%)' + (m.left ? ' scaleX(-1)' : '');
      fs.raf = requestAnimationFrame(step);
    };
    fs.raf = requestAnimationFrame(step);
  }
  document.getElementById('feedTapBtn').onclick = () => {
    if (!fs || fs.lock) return; fs.lock = true; cancelAnimationFrame(fs.raf);
    const r = C.feedGrade(fs.pos);
    fs.res.push(r.wgt); document.getElementById('feedResult').innerHTML = `<span class="grade ${r.g}">${r.label}</span>`;
    setTimeout(() => { if (!fs) return; fs.round++; fs.round >= C.FEED_ROUNDS ? finishFeed() : round(); }, 600);
  };
  function finishFeed() {
    const earned = C.feedEarned(fs.pool, fs.res);
    state.coins += earned; state.pending = Math.max(0, state.pending - fs.pool); setCoins(); updateBadge(); save();
    document.getElementById('feedEarned').textContent = '+' + earned + '円'; show('feedDone'); fs = null;
  }
  function stopFeed() { if (fs) { cancelAnimationFrame(fs.raf); fs = null; } }

  /* ===== スタート ===== */
  function init() {
    load();
    const away = C.awaySeconds(Date.now(), state.lastTs);
    if (away > 10) { state.pending += C.rate(state.decor.length) * away; setTimeout(() => toast('🐟 るすばん中にエサがたまったよ！'), 600); }
    bubbles();
    state.decor.forEach(makeDecorEl);
    const saved = state.fish; state.fish = [];
    requestAnimationFrame(() => {
      if (saved.length) {
        saved.forEach((f) => {
          state.fish.push(f); f.drag = false;
          f.x = Math.min(Math.max(f.x, 40), W() - 40); f.y = Math.min(Math.max(f.y, H() * 0.1), H() * 0.74);
          makeFishEl(f);
        });
      } else {
        addFish('kumanomi', 0, W() * 0.3, H() * 0.25); addFish('nanyouhagi', 0, W() * 0.7, H() * 0.45); addFish('kumanomi', 0, W() * 0.5, H() * 0.6);
      }
      setCoins(); updateBadge(); updateZukanBadge(); save(); loop();
      ready = true;
    });
    setInterval(tick, 3000);
    window.addEventListener('resize', () => state.decor.forEach(placeDecor));
  }

  let ready = false;
  // 自動テストから中身をのぞくための入口
  window.__app = {
    ready: () => ready,
    state: () => state,
    tick: tick,
    addFish: addFish
  };

  init();
})();
