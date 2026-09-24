/*
 * ブラウザで実際に動かして確かめるテスト。
 *
 *   npm i -D playwright && npm run test:ui
 *
 * 画面まわりの不具合は node のテストでは捕まらない。ここでは本物の
 * ブラウザを立ち上げ、指の操作をそのまま再現して確かめる。
 *
 * ★ アプリを作ったら「ここにアプリごとの確認を足す」に書き足すこと。
 *   直した不具合には、かならず見張り役をここに置く。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8123);
const URL = `http://localhost:${PORT}/`;
const ROOT = __dirname;
const CHROMIUM = process.env.CHROMIUM_PATH;   // 手元の Chromium を使いたいとき

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + message);
  } else {
    failed++;
    console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message);
  }
}

function skip(message) {
  console.log('  \x1b[90m- とばした: ' + message + '\x1b[0m');
}

function section(name) {
  console.log('\n' + name);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(URL, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 10000) reject(new Error('サーバーが起動しない'));
          else setTimeout(tick, 100);
        });
    };
    tick();
  });
}

/**
 * 何かした直後に、その要素が本来の場所からどれだけずれるかを
 * 1 フレームずつ測る。「置いた瞬間に一瞬とぶ」たぐいの不具合はこれで見つかる。
 *
 * @returns {Promise<number>} 最大のずれ (px)
 */
function measureJump(page, selector, act) {
  return page.evaluate(async ({ sel, code }) => {
    const before = document.querySelector(sel).getBoundingClientRect();
    // eslint-disable-next-line no-new-func
    new Function(code)();
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const el = document.querySelector(sel);
      if (!el) { worst = Infinity; break; }
      const now = el.getBoundingClientRect();
      worst = Math.max(worst, Math.abs(now.left - before.left), Math.abs(now.top - before.top));
    }
    return Math.round(worst);
  }, { sel: selector, code: act });
}

async function run() {
  let chromium;
  let devices;
  try {
    ({ chromium, devices } = require('playwright'));
  } catch (e) {
    console.error('playwright が必要です:  npm i -D playwright');
    process.exit(1);
  }

  // 対象は iPhone 16 Plus だけ。入っている playwright が名前を知らなければ、同じ大きさ (430 幅) の端末で代える
  const PHONE_NAME = ['iPhone 16 Plus', 'iPhone 15 Plus', 'iPhone 14 Plus'].find((n) => devices[n]);
  const PHONE = devices[PHONE_NAME];

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
    stdio: 'ignore'
  });
  await waitForServer();

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ------------------------------------------------ スマホで開く
    section('スマホで開く');
    const context = await browser.newContext({ ...PHONE });
    const phone = await context.newPage();
    phone.on('pageerror', (e) => errors.push('スマホ: ' + e.message));
    phone.on('console', (m) => { if (m.type() === 'error') errors.push('スマホ: ' + m.text()); });
    phone.on('requestfailed', (r) => errors.push('読みこめない: ' + r.url()));
    await phone.goto(URL);
    await phone.waitForFunction(() => window.__app && window.__app.ready());
    ok(true, `ページが開いて、画面のしくみが立ち上がる (${PHONE_NAME})`);

    const fit = await phone.evaluate(() => ({
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.getElementById('title').textContent.trim(),
      fish: window.__app.state().fish.length
    }));
    ok(fit.wide <= 1, 'スマホ幅で横スクロールが出ない');
    ok(fit.title === 'すいぞくかん', `見出しが出ている (${fit.title})`);
    ok(fit.fish === 3, `はじめは魚が 3 びき (${fit.fish})`);

    const broken = await phone.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
    ok(broken.length === 0, '絵が全部読みこめている' + (broken.length ? ': ' + broken.join(', ') : ''));

    // ------------------------------------------------ アプリの操作
    section('魚をさわる');
    // 魚の見えている中心 (泳いでいるので、そのつど測る)
    const center = (id) => phone.evaluate((fid) => {
      const f = window.__app.state().fish.find((o) => o.id === fid);
      const r = f.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, id);
    const ids = await phone.evaluate(() => window.__app.state().fish.map((f) => [f.id, f.sp]));
    const coins0 = await phone.evaluate(() => window.__app.state().coins);
    let c = await center(ids[0][0]);
    await phone.mouse.move(c.x, c.y); await phone.mouse.down(); await phone.mouse.up();
    ok(await phone.evaluate(() => window.__app.state().coins) === coins0 + 1, 'タップするとコインが 1 ふえる');

    // ドラッグして重ねる。相手も泳いでいるので、少しずつ動かして最後に相手の真上で離す
    async function dragOnto(fromId, toId) {
      const a = await center(fromId);
      await phone.mouse.move(a.x, a.y); await phone.mouse.down();
      for (let i = 1; i <= 6; i++) {
        const b = await center(toId);
        await phone.mouse.move(a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6);
      }
      const b = await center(toId);
      await phone.mouse.move(b.x, b.y);
      await phone.mouse.up();
    }
    const kuma = ids.filter(([, sp]) => sp === 'kumanomi').map(([id]) => id);
    const hagi = ids.find(([, sp]) => sp === 'nanyouhagi')[0];
    await dragOnto(kuma[0], hagi);
    const bred = await phone.evaluate(() => window.__app.state().fish.map((f) => f.sp));
    ok(bred.length === 2 && bred.includes('kiirohagi'), `クマノミとナンヨウハギを重ねるとキイロハギが生まれる (${bred.join(',')})`);

    // なかよしでない 2 ひき (クマノミとキイロハギ)
    await phone.evaluate(() => { window.__app.state().fish.forEach((f) => { f.vx = 0; f.vy = 0; }); });
    const before = await phone.evaluate(() => window.__app.state().coins);
    const ki = (await phone.evaluate(() => window.__app.state().fish.find((f) => f.sp === 'kiirohagi').id));
    await dragOnto(kuma[1], ki);
    const none = await phone.evaluate(() => window.__app.state().fish.length);
    ok(none === 2, `なかよしでない 2 ひきは合体しない (${none} ひき)`);
    ok(await phone.evaluate(() => window.__app.state().coins) === before, 'なかよしでないときはコインが増えない');

    // 同じ魚どうし → 1 ぴきになり、コインがもらえる
    const twin = await phone.evaluate(() => window.__app.addFish('ebi', 0, 120, 200).f.id);
    const ebi = await phone.evaluate(() => window.__app.addFish('ebi', 0, 300, 200).f.id);
    const beforeSame = await phone.evaluate(() => window.__app.state().coins);
    await dragOnto(twin, ebi);
    const same = await phone.evaluate(() => ({ ebi: window.__app.state().fish.filter((f) => f.sp === 'ebi').length,
      coins: window.__app.state().coins }));
    ok(same.ebi === 1 && same.coins >= beforeSame + 5, `エビどうしを重ねると 1 ぴきになり、コインが増える (+${same.coins - beforeSame})`);

    section('ショップ');
    await phone.evaluate(() => { window.__app.state().coins = 100; });
    await phone.locator('#btnShop').click();
    ok(await phone.locator('.shop-item').count() === 9, 'おきものが 9 つならぶ');
    await phone.locator('[data-buy="shell"]').click();
    const bought = await phone.evaluate(() => ({ coins: window.__app.state().coins, decor: window.__app.state().decor.length,
      shown: document.querySelectorAll('#tank .decor').length }));
    ok(bought.coins === 80 && bought.decor === 1 && bought.shown === 1, `しんじゅ貝を 20 円で買って置ける (のこり ${bought.coins})`);
    await phone.locator('#btnShop').click();
    ok((await phone.locator('[data-buy="shell"]').textContent()).trim() === '30円', '2 つめのしんじゅ貝は 30 円');
    await phone.locator('#shopModal [data-close]').click();

    section('エサやり');
    await phone.evaluate(() => { window.__app.state().pending = 100; });
    const coinsF = await phone.evaluate(() => window.__app.state().coins);
    await phone.locator('#btnFeed').click();
    await phone.locator('#feedStartBtn').click();
    for (let i = 0; i < 5; i++) {
      await phone.waitForTimeout(150);
      await phone.locator('#feedTapBtn').click();
      await phone.waitForTimeout(700);
    }
    const fed = await phone.evaluate(() => ({ coins: window.__app.state().coins, pending: window.__app.state().pending,
      shown: document.getElementById('feedEarned').textContent }));
    // 遊んでいるあいだも 3 秒ごとに少したまるので、0 ぴったりにはならない
    ok(fed.coins > coinsF && fed.pending < 5, `5 回やると コインがもらえて、始めたときのエサがなくなる (${fed.shown} / のこり ${fed.pending.toFixed(1)})`);
    await phone.locator('#feedDone [data-close]').click();

    section('ずかん');
    await phone.locator('#btnZukan').click();
    ok(await phone.locator('.zk-card').count() === 10, 'ずかんに 10 種ならぶ');
    const zk = await phone.evaluate(() => document.querySelector('.zk-top').textContent);
    // クマノミ・ナンヨウハギ・キイロハギ・エビ + エビどうしで生まれた色 (ふつうなら増えない)
    const got = Number((zk.match(/(\d+) \/ 50/) || [])[1]);
    ok(got === 4 || got === 5, `みつけたすがたの数が出る (${got} / 50)`);
    await phone.locator('#zukanModal [data-close]').click();

    section('保存');
    const saved = await phone.evaluate(() => ({ coins: Math.floor(window.__app.state().coins), fish: window.__app.state().fish.length }));
    await phone.evaluate(() => window.__app.tick());
    await phone.reload();
    await phone.waitForFunction(() => window.__app && window.__app.ready());
    const loaded = await phone.evaluate(() => ({ coins: Math.floor(window.__app.state().coins),
      fish: document.querySelectorAll('#tank .fish').length, decor: document.querySelectorAll('#tank .decor').length }));
    ok(loaded.coins === saved.coins, `開きなおしてもコインが残る (${loaded.coins})`);
    ok(loaded.fish >= saved.fish && loaded.decor === 1, `開きなおしても魚とおきものが残る (魚 ${loaded.fish} / おきもの ${loaded.decor})`);

    // ------------------------------------------------ 明るい画面・暗い画面
    section('明るい画面と暗い画面');
    for (const scheme of ['light', 'dark']) {
      const themed = await browser.newContext({ ...PHONE, colorScheme: scheme });
      const page = await themed.newPage();
      page.on('pageerror', (e) => errors.push(scheme + ': ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app && window.__app.ready());
      const colors = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        fg: getComputedStyle(document.body).color
      }));
      ok(colors.bg !== colors.fg, `${scheme}: 文字と背景の色が違う (${colors.bg} / ${colors.fg})`);
      await themed.close();
    }

    // ------------------------------------------------ アイコン (用意していれば)
    section('アイコン');
    const desk = await browser.newPage();
    await desk.goto(URL);
    const apple = await desk.evaluate(() =>
      document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'));
    if (!apple) {
      skip('ホーム画面用のアイコンはまだ無い (PWA にするときに用意する)');
    } else {
      // iOS は SVG のアイコンを使えない
      ok(apple.endsWith('.png'), `ホーム画面用アイコンが PNG (${apple})`);
      const res = await desk.request.get(URL + apple.replace('./', ''));
      ok(res.ok(), `${apple} が配信される`);
    }

    // ------------------------------------------------ 更新とオフライン (sw.js があれば)
    section('更新とオフライン');
    if (!fs.existsSync(path.join(ROOT, 'sw.js'))) {
      skip('サービスワーカーはまだ無い (オフライン対応するときに用意する)');
    } else {
      const swCtx = await browser.newContext();
      const swPage = await swCtx.newPage();
      await swPage.goto(URL);
      await swPage.waitForFunction(() => window.__app);
      ok(await swPage.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false)),
        'サービスワーカーが動く');
      await swPage.waitForTimeout(800);

      // 直したものが 1 回のリロードで出るか (キャッシュ優先だと古い画面が出る)
      const indexPath = path.join(ROOT, 'index.html');
      const original = fs.readFileSync(indexPath, 'utf8');
      const marker = original.match(/<h1[^>]*>([^<]*)<\/h1>/);
      fs.writeFileSync(indexPath, original.replace(marker[1], 'こうしんかくにん'));
      await swPage.reload();
      await swPage.waitForTimeout(400);
      const title = await swPage.textContent('h1');
      fs.writeFileSync(indexPath, original);
      ok(title.trim() === 'こうしんかくにん', `直したものが 1 回のリロードで出る (${title.trim()})`);

      await swPage.reload();
      await swPage.waitForTimeout(500);
      await swCtx.setOffline(true);
      await swPage.reload().catch(() => {});
      await swPage.waitForTimeout(400);
      ok(await swPage.evaluate(() => !!window.__app).catch(() => false),
        'ネットにつながらなくても開ける');
      await swCtx.setOffline(false);
    }

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
