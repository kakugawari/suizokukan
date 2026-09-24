const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core.js');

// 決まった順番で数を出す乱数 (テストで結果を固定するため)
function seq(...xs) { let i = 0; return () => xs[i++ % xs.length]; }

test('いきもの・おきものの絵が全部そろっている', () => {
  for (const key of Object.keys(C.IMG_SIZE)) {
    assert.ok(fs.existsSync(path.join(__dirname, C.imgSrc(key))), key + ' の絵が無い');
  }
  for (const s of C.SPECIES) assert.ok(C.IMG_SIZE['f_' + s.id], s.id + ' の大きさが無い');
  for (const d of C.DECOR) assert.ok(C.IMG_SIZE['d_' + d.id], d.id + ' の大きさが無い');
  assert.ok(fs.existsSync(path.join(__dirname, 'img/tank.webp')));
});

test('こうはい先・出てくる魚は、ぜんぶ実在する魚', () => {
  for (const [k, c] of Object.entries(C.BREED)) {
    k.split('+').forEach((s) => assert.ok(C.SP[s], k));
    assert.ok(C.SP[c], c);
  }
  C.DECOR.forEach((d) => d.spawn.forEach((s) => assert.ok(C.SP[s], d.id + ':' + s)));
});

test('どの魚にも、手に入れる道がある', () => {
  const start = ['kumanomi', 'nanyouhagi'];
  const reach = new Set(start);
  C.DECOR.forEach((d) => d.spawn.forEach((s) => reach.add(s)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [k, c] of Object.entries(C.BREED)) {
      if (!reach.has(c) && k.split('+').every((s) => reach.has(s))) { reach.add(c); grew = true; }
    }
  }
  C.SPECIES.forEach((s) => assert.ok(reach.has(s.id), s.id + ' に届かない'));
});

test('breedOf は順番によらない', () => {
  assert.strictEqual(C.breedOf('kumanomi', 'nanyouhagi'), 'kiirohagi');
  assert.strictEqual(C.breedOf('nanyouhagi', 'kumanomi'), 'kiirohagi');
  assert.strictEqual(C.breedOf('kumanomi', 'kame'), undefined);
});

test('rollForm は割合どおりに引く (0〜99 をなめる)', () => {
  const count = [0, 0, 0, 0, 0];
  for (let i = 0; i < 100; i++) count[C.rollForm(false, () => (i + 0.5) / 100)]++;
  assert.deepStrictEqual(count, C.FORM_RATE);
  // 色ちがいどうしだと しろ・きん が 2 倍 (合計 115)
  const b = [0, 0, 0, 0, 0];
  for (let i = 0; i < 115; i++) b[C.rollForm(true, () => (i + 0.5) / 115)]++;
  assert.deepStrictEqual(b, [40, 25, 20, 20, 10]);
});

test('mergeOutcome: 同じ魚 / なかよし / なかよしでない', () => {
  const same = C.mergeOutcome({ sp: 'kumanomi', v: 0 }, { sp: 'kumanomi', v: 0 }, {}, seq(0.99));
  assert.deepStrictEqual(same, { kind: 'same', sp: 'kumanomi', v: 4, isNew: true, reward: 50 });
  const known = C.mergeOutcome({ sp: 'kumanomi', v: 0 }, { sp: 'kumanomi', v: 0 }, { kumanomi_0: true }, seq(0));
  assert.deepStrictEqual(known, { kind: 'same', sp: 'kumanomi', v: 0, isNew: false, reward: 5 });
  const br = C.mergeOutcome({ sp: 'ebi', v: 3 }, { sp: 'kingyo', v: 0 }, {});
  assert.deepStrictEqual(br, { kind: 'breed', sp: 'fugu', v: 0, isNew: true, reward: 40 });
  assert.strictEqual(C.mergeOutcome({ sp: 'ebi', v: 0 }, { sp: 'kame', v: 0 }, {}).kind, 'none');
});

test('おきものは同じ物を置くほど 1.5 倍ずつ高くなる', () => {
  const shell = C.DC.shell;
  assert.strictEqual(C.decorCost(shell, []), 20);
  assert.strictEqual(C.decorCost(shell, [{ type: 'shell' }]), 30);
  assert.strictEqual(C.decorCost(shell, [{ type: 'shell' }, { type: 'shell' }, { type: 'ship' }]), 40);
});

test('るすばんは最大 8 時間ぶん', () => {
  assert.strictEqual(C.awaySeconds(100000, 40000), 60);
  assert.strictEqual(C.awaySeconds(1e12, 0 + 1), C.AWAY_MAX);
  assert.strictEqual(C.awaySeconds(5000, undefined), 0);
});

test('migrate: 古いデータ(大きさ段階)を今の形に直す', () => {
  const old = { coins: 5, fish: [{ id: 3, sp: 'kumanomi', tier: 2 }, { id: 4, sp: 'nazo' }],
    decor: [{ id: 9, type: 'shell' }, { id: 10, type: 'nazo' }], found: { kumanomi_2: true, ebi_1: true } };
  C.migrate(old);
  assert.strictEqual(old.ver, 3);
  assert.deepStrictEqual(old.found, { kumanomi_0: true, ebi_0: true });
  assert.deepStrictEqual(old.fish, [{ id: 3, sp: 'kumanomi', v: 0 }]);
  assert.deepStrictEqual(old.decor, [{ id: 9, type: 'shell' }]);
  assert.strictEqual(C.nextUid(old), 10);
});

test('ずかんのごほうび: 数がそろうと受けとれる', () => {
  const found = {};
  C.SPECIES.slice(0, 2).forEach((s) => { for (let v = 0; v < 5; v++) found[s.id + '_' + v] = true; });
  // 10 すがた → 10 しゅるいのごほうび + 2 種ぶんのコンプリート
  assert.strictEqual(C.claimable(found, {}), 3);
  assert.strictEqual(C.claimable(found, { m10: true, s_kumanomi: true }), 1);
});

test('hintFor: 知っている親だけ名前が出る', () => {
  assert.strictEqual(C.hintFor('kiirohagi', {}), 'とうだいのちかくで見かけたらしい／？？？と？？？がなかよしらしい');
  assert.match(C.hintFor('kame', { fugu_0: true }), /フグと？？？がなかよしらしい/);
});

test('エサやり: まんなかほど良い判定', () => {
  assert.strictEqual(C.feedGrade(50).g, 'perfect');
  assert.strictEqual(C.feedGrade(62).g, 'good');
  assert.strictEqual(C.feedGrade(90).g, 'miss');
  assert.strictEqual(C.feedEarned(100, [1.3, 1.3, 1.3, 1.3, 1.3]), 130);
  assert.strictEqual(C.feedEarned(0.2, [0.45]), 1);   // 少なくても 1 はもらえる
  const m = C.feedMarker(0, 0);
  assert.strictEqual(m.pos, 50);
});
