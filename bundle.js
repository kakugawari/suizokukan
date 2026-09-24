/*
 * テストプレイ用に、全部を 1 枚の HTML にまとめる: node bundle.js → dist/suizokukan.html
 * CSS・JS を埋めこみ、絵 (img/*.webp) は data: URI にする。
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dataUri = (f) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');

// 文字の中の img/xxx.webp を data: URI に置きかえる
const inlineImgs = (text) => text.replace(/img\/([a-z_-]+)\.webp/g, (m) => dataUri(m));

let html = read('index.html');
const must = (cond, what) => { if (!cond) throw new Error('まとめられない: ' + what); };

must(html.includes('<link rel="stylesheet" href="./styles.css">'), 'styles.css の読みこみ');
html = html.replace('<link rel="stylesheet" href="./styles.css">', () => '<style>\n' + inlineImgs(read('styles.css')) + '</style>');

// core.js の絵の場所は、名前から組み立てているので表にして渡す
let core = read('core.js');
const IMG_LINE = "const imgSrc = (key) => 'img/' + key + '.webp';";
must(core.includes(IMG_LINE), 'core.js の imgSrc');
const keys = [...core.matchAll(/\b([fd]_[a-z]+): \[/g)].map((m) => m[1]);
const table = Object.fromEntries(keys.map((k) => [k, dataUri('img/' + k + '.webp')]));
core = core.replace(IMG_LINE, () => 'const IMG_DATA = ' + JSON.stringify(table) + ';\n  const imgSrc = (key) => IMG_DATA[key];');

for (const [file, body] of [['core.js', core], ['sound.js', read('sound.js')], ['app.js', read('app.js')]]) {
  const tag = `<script src="./${file}"></script>`;
  must(html.includes(tag), file + ' の読みこみ');
  html = html.replace(tag, () => '<script>\n' + body + '</script>');
}
html = inlineImgs(html);
must(!/img\/[a-z_-]+\.webp/.test(html), '置きかえ残りの絵');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'suizokukan.html');
fs.writeFileSync(out, html);
console.log(out, Math.round(html.length / 1024) + 'KB');
