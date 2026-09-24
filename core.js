/*!
 * core.js — すいぞくかんのロジック。DOM を触らないので node でテストできる。
 *
 * ブラウザでは <script> で読み込むと window.Core になり、
 * node からは require() できる。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Core = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ===== 絵 ===== */
  // 絵の元の大きさ [幅, 高さ]。表示の縦横比を出すのに使う。絵は img/<名前>.webp
  const IMG_SIZE = {
    d_arch: [260, 225], d_barrel: [253, 255], d_chest: [260, 246], d_light: [260, 291],
    d_moai: [237, 290], d_plane: [260, 165], d_shell: [236, 189], d_ship: [260, 342],
    d_sign: [260, 247],
    f_ebi: [150, 110], f_fugu: [208, 157], f_kame: [220, 121], f_kiirohagi: [181, 149],
    f_kingyo: [220, 160], f_kumanomi: [220, 146], f_kurage: [164, 213],
    f_nanyouhagi: [220, 157], f_neon: [202, 109], f_tsunodashi: [218, 228]
  };
  const imgSrc = (key) => 'img/' + key + '.webp';

  /* ===== いきもの ===== */
  // face: 1=右向きの絵, -1=左向きの絵, 0=向きなし / a,b = 色ちがい[色相, 色の名前]
  const SPECIES = [
    {id:'kumanomi',   name:'クマノミ',     w:74, face: 1, a:[180,'あお'],     b:[300,'ピンク'],
     fact:'イソギンチャクの中でくらしていて、イソギンチャクの毒にさされないよ。'},
    {id:'nanyouhagi', name:'ナンヨウハギ', w:76, face:-1, a:[60,'むらさき'],  b:[120,'あか'],
     fact:'しっぽのつけねに、するどいトゲをかくしもっているよ。'},
    {id:'kiirohagi',  name:'キイロハギ',   w:62, face:-1, a:[60,'みどり'],    b:[240,'ピンク'],
     fact:'ハワイの海にたくさんいるよ。夜になると体に白っぽいもようが出るんだ。'},
    {id:'kingyo',     name:'きんぎょ',     w:80, face: 1, a:[180,'あお'],     b:[240,'むらさき'],
     fact:'むかし中国で、フナのなかまから生まれた魚なんだよ。'},
    {id:'fugu',       name:'フグ',         w:66, face:-1, a:[60,'みどり'],    b:[240,'むらさき'],
     fact:'きけんを感じると、水をすいこんでぷくーっとふくらむよ。'},
    {id:'neon',       name:'ネオンテトラ', w:66, face:-1, a:[60,'むらさき'],  b:[240,'きみどり'],
     fact:'南アメリカのアマゾン川にすんでいる、青い線が光って見える魚だよ。'},
    {id:'tsunodashi', name:'ツノダシ',     w:68, face: 1, a:[60,'むらさき'],  b:[240,'みどり'],
     fact:'目の上にちいさなツノのような出っぱりがあるから「ツノダシ」なんだ。'},
    {id:'ebi',        name:'エビ',         w:56, face:-1, a:[120,'みどり'],   b:[180,'あお'],
     fact:'かたいからをぬいで(脱皮して)、すこしずつ大きくなるよ。'},
    {id:'kame',       name:'ウミガメ',     w:96, face: 1, a:[120,'あお'],     b:[180,'ピンク'],
     fact:'自分が生まれた砂浜にもどってきて、たまごをうむといわれているよ。'},
    {id:'kurage',     name:'クラゲ',       w:54, face: 0, a:[60,'ピンク'],    b:[180,'みどり'],
     fact:'体のほとんど(95%より多く)が水でできているよ。'}
  ];
  const SP = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

  /* すがた(色ちがい) 0:ふつう 1:色A 2:色B 3:しろ 4:きん */
  const FORM_RATE = [40, 25, 20, 10, 5];
  const FORM_N = 5;
  const GOLD = 'sepia(1) saturate(3.2) hue-rotate(-12deg) brightness(1.12)';
  function formFilter(sp, v) {
    const s = SP[sp];
    return ['none', 'hue-rotate(' + s.a[0] + 'deg)', 'hue-rotate(' + s.b[0] + 'deg)',
      'grayscale(1) brightness(1.35) contrast(.9)', GOLD][v];
  }
  function formLabel(sp, v) { const s = SP[sp]; return ['ふつう', s.a[1], s.b[1], 'しろ', 'きん'][v]; }
  function fishName(sp, v) { return v ? formLabel(sp, v) + SP[sp].name : SP[sp].name; }

  /** 生まれるすがたを引く。bonus (色ちがいどうし) だと しろ・きん が 2 倍出やすい */
  function rollForm(bonus, rng) {
    const random = rng || Math.random;
    const w = FORM_RATE.map((r, i) => (i >= 3 && bonus ? r * 2 : r));
    let x = random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { if ((x -= w[i]) < 0) return i; }
    return 0;
  }

  /* ===== こうはい ===== */
  const BREED = {
    'kumanomi+nanyouhagi': 'kiirohagi',
    'ebi+kingyo': 'fugu',
    'neon+tsunodashi': 'kurage',
    'fugu+kiirohagi': 'kame'
  };
  const breedOf = (a, b) => BREED[[a, b].sort().join('+')];
  /** 重ねたら何か生まれる組か (同じ魚どうし、または なかよし) */
  const canMerge = (a, b) => a.sp === b.sp || !!breedOf(a.sp, b.sp);

  /**
   * 指をはなした所で、どの魚と重ねたことにするか。
   * 届く範囲 (reach) の中で、合わせられる魚を先に、近い順に選ぶ。
   * 合わせられる魚が範囲に無ければ、いちばん近い魚 (なかよしでない) を返す。
   */
  function pickPartner(f, others, reach) {
    let best = null, bestD = Infinity, mate = false;
    for (const o of others) {
      if (o === f) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d >= reach) continue;
      const m = canMerge(f, o);
      if ((m && !mate) || (m === mate && d < bestD)) { best = o; bestD = d; mate = m; }
    }
    return best;
  }

  /**
   * 2 ひきを重ねたときに何が起きるか。
   * @returns {{kind:'same'|'breed'|'none', sp?, v?, isNew?, reward?}}
   */
  function mergeOutcome(a, b, found, rng) {
    if (a.sp === b.sp) {
      // 同じ魚どうし → 何色が生まれるかな？(色ちがいどうしだとレアが出やすい)
      const v = rollForm(a.v > 0 && b.v > 0, rng);
      const isNew = !found[a.sp + '_' + v];
      return { kind: 'same', sp: a.sp, v, isNew, reward: [5, 8, 8, 15, 30][v] + (isNew ? 20 : 0) };
    }
    const child = breedOf(a.sp, b.sp);
    if (!child) return { kind: 'none' };
    const isNew = !found[child + '_0'];
    return { kind: 'breed', sp: child, v: 0, isNew, reward: 10 + (isNew ? 30 : 0) };
  }

  /* ===== おきもの ===== */
  const DECOR = [
    {id:'shell',  name:'しんじゅ貝',   cost:20,  w:78,  spawn:['ebi']},
    {id:'barrel', name:'たる',         cost:30,  w:96,  spawn:['kingyo']},
    {id:'sign',   name:'かんばん',     cost:45,  w:92,  spawn:['neon']},
    {id:'arch',   name:'いせき',       cost:60,  w:100, spawn:['tsunodashi']},
    {id:'light',  name:'とうだい',     cost:80,  w:96,  spawn:['kiirohagi']},
    {id:'moai',   name:'モアイ',       cost:100, w:84,  spawn:['fugu']},
    {id:'chest',  name:'たからばこ',   cost:130, w:96,  spawn:['kurage']},
    {id:'plane',  name:'ひこうき',     cost:160, w:124, spawn:['kame']},
    {id:'ship',   name:'かいぞくせん', cost:200, w:130, spawn:['kumanomi', 'nanyouhagi', 'kingyo', 'neon', 'ebi']}
  ];
  const DC = Object.fromEntries(DECOR.map((d) => [d.id, d]));
  /** 同じおきものを 1 つ置くごとに 1.5 倍ずつ高くなる */
  const decorCost = (d, placed) => Math.round(d.cost * (1 + 0.5 * placed.filter((x) => x.type === d.id).length));
  const TANK_CAP = 18;

  /* ===== 放置 ===== */
  /** 1 秒あたりにたまるエサ。おきものが多いほど増える */
  const rate = (decorCount) => 0.3 * (1 + 0.2 * decorCount);
  const AWAY_MAX = 8 * 3600;
  /** るすばんしていた秒数 (最大 8 時間) */
  const awaySeconds = (now, lastTs) => Math.min((now - (lastTs || now)) / 1000, AWAY_MAX);

  /* ===== 保存データ ===== */
  const SAVE_KEY = 'suizokukan_v2';
  function newState(now) {
    return { coins: 30, pending: 0, lastTs: now, fish: [], decor: [], found: {}, claimed: {}, sound: true, ver: 3 };
  }
  /** 読みこんだデータを今の形にそろえる (その場で書きかえる) */
  function migrate(state) {
    if (state.ver !== 3) { // 旧データ(大きさ段階)からの引っこし
      const nf = {};
      Object.keys(state.found || {}).forEach((k) => { nf[k.split('_')[0] + '_0'] = true; });
      state.found = nf;
      state.fish.forEach((f) => { f.v = 0; delete f.tier; });
      state.claimed = {};
      state.ver = 3;
    }
    state.claimed = state.claimed || {};
    if (state.sound == null) state.sound = true;
    state.fish = state.fish.filter((f) => SP[f.sp]);
    state.fish.forEach((f) => { if (f.v == null) f.v = 0; });
    state.decor = state.decor.filter((d) => DC[d.type]);
    return state;
  }
  const nextUid = (state) => 1 + Math.max(0, ...state.fish.map((f) => f.id), ...state.decor.map((d) => d.id));

  /* ===== ずかん ===== */
  const MILESTONES = [[10, 100], [20, 250], [30, 500], [40, 900], [50, 2000]];
  const SPECIES_REWARD = 300;
  const foundCount = (found) => Object.keys(found).filter((k) => found[k]).length;
  function formsFound(found, sp) { let n = 0; for (let v = 0; v < FORM_N; v++) if (found[sp + '_' + v]) n++; return n; }
  /** まだ受けとっていない次のごほうび [しゅるい数, 円] (ぜんぶ受けとったら undefined) */
  const nextMilestone = (claimed) => MILESTONES.find(([n]) => !claimed['m' + n]);
  /** 今うけとれるごほうびの数 */
  function claimable(found, claimed) {
    let n = 0;
    const next = nextMilestone(claimed);
    if (next && foundCount(found) >= next[0]) n++;
    SPECIES.forEach((s) => { if (formsFound(found, s.id) === FORM_N && !claimed['s_' + s.id]) n++; });
    return n;
  }
  function hintFor(sp, found) {
    const h = [];
    if (sp === 'kumanomi' || sp === 'nanyouhagi') h.push('さいしょから水槽にいるよ');
    DECOR.forEach((d) => { if (d.spawn.includes(sp)) h.push(d.name + 'のちかくで見かけたらしい'); });
    Object.entries(BREED).forEach(([k, c]) => {
      if (c !== sp) return;
      const [a, b] = k.split('+');
      const known = [a, b].filter((x) => found[x + '_0']);
      h.push(known.length === 2 ? SP[a].name + 'と' + SP[b].name + 'はなかよし'
        : (known[0] ? SP[known[0]].name + 'と？？？がなかよしらしい' : '？？？と？？？がなかよしらしい'));
    });
    return h[0] ? h.slice(0, 2).join('／') : 'どこかにいるらしい…';
  }

  /* ===== エサやりミニゲーム ===== */
  const FEED_ROUNDS = 5;
  /** 魚の位置 (0〜100%) から判定。まんなか 50% がいちばん良い */
  function feedGrade(pos) {
    const acc = 1 - Math.abs(pos - 50) / 42;
    if (acc >= 0.8) return { g: 'perfect', wgt: 1.3, label: 'パーフェクト！' };
    if (acc >= 0.5) return { g: 'good', wgt: 1, label: 'グッド' };
    return { g: 'miss', wgt: 0.45, label: 'ミス…' };
  }
  /** 経過ミリ秒 → 魚の位置(%) と 向き(左へ向かっているか) */
  function feedMarker(ms, round) {
    const ph = ms / 430 * (1 + round * 0.2);
    return { pos: 50 + 42 * Math.sin(ph), left: Math.cos(ph) < 0 };
  }
  function feedEarned(pool, weights) {
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
    return Math.max(1, Math.round(pool * avg));
  }

  return {
    IMG_SIZE, imgSrc,
    SPECIES, SP, FORM_RATE, FORM_N, formFilter, formLabel, fishName, rollForm,
    BREED, breedOf, canMerge, pickPartner, mergeOutcome,
    DECOR, DC, decorCost, TANK_CAP,
    rate, AWAY_MAX, awaySeconds,
    SAVE_KEY, newState, migrate, nextUid,
    MILESTONES, SPECIES_REWARD, foundCount, formsFound, nextMilestone, claimable, hintFor,
    FEED_ROUNDS, feedGrade, feedMarker, feedEarned
  };
});
