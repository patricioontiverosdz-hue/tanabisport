// Apply only the reviewed privacy entry points to the exact production base.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const baseBlob = '03899481f6e81335faf797b2f18162dd8d4f0477';
const replacements = [
  ['<title>Tanabi Sports Intelligence 2.2.5</title>', '<title>Tanabi Sports Intelligence 2.2.6</title>'],
  ['var APP_VERSION="2.2.5";', 'var APP_VERSION="2.2.6";'],
  ['<link rel="stylesheet" href="assets/tsi-210.css">', '<link rel="stylesheet" href="assets/tsi-226-privacy.css?v=226">\n<script src="assets/tsi-226-privacy.js?v=226"></script>\n<link rel="stylesheet" href="assets/tsi-210.css">'],
  ["}).join('')+'</nav></details>';}" , "}).join('')+(window.TSIPrivacy?window.TSIPrivacy.menuHTML():'')+'</nav></details>';}"],
  ["  return h+'</div></div>';\n}\nfunction viewPending(){", "  return h+'</div>'+(window.TSIPrivacy?window.TSIPrivacy.summaryHTML():'')+'</div>';\n}\nfunction viewPending(){"],
  ["'+tsiThemeControl()+right+'</div></header>';", "'+tsiThemeControl()+(S.view===\"home\"?'<button type=\"button\" class=\"btn small\" data-privacy=\"integral\" aria-haspopup=\"dialog\">Privacidad</button>':'')+right+'</div></header>';"],
];
function gitBlob(text) { const data = Buffer.from(text); return crypto.createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex'); }
if (require.main === module) {
  const target = path.join(root, 'index.html');
  let text = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  if (gitBlob(text) !== baseBlob) throw Error('Production base changed; review before applying 2.2.6.');
  for (const [before, after] of replacements) {
    if (text.split(before).length !== 2) throw Error('Expected exactly one privacy integration point: ' + before.slice(0, 90));
    text = text.replace(before, after);
  }
  fs.writeFileSync(target, text);
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(root, name), pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pkg.version !== '2.2.5') throw Error('Unexpected package version');
    pkg.version = '2.2.6';
    if (name === 'package-lock.json') {
      if (pkg.packages[''].version !== '2.2.5') throw Error('Unexpected lock version');
      pkg.packages[''].version = '2.2.6';
    } else {
      pkg.scripts['test:privacy'] = 'node dev-tests/privacy-226.cjs';
      pkg.scripts['test:release-226'] = 'node dev-tests/release-226.cjs && node dev-tests/privacy-226.cjs';
    }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  }
  console.log('2.2.6 prepared: privacy documents, login/menu entry points and package identity only.');
}
module.exports = {baseBlob, replacements, gitBlob};
