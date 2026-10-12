'use strict';
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('./vendor/acorn/acorn.js');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'android/app/src/main/assets');
// Chrome 69 runs BigInt literals (shipped in Chrome 67, used by assistant.js).
// It does not run optional chaining, nullish coalescing, or class fields.
const opts = { ecmaVersion: 2020, sourceType: 'script', allowReturnOutsideFunction: false };

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  Object.keys(node).forEach(key => {
    const value = node[key];
    if (Array.isArray(value)) value.forEach(child => walkAst(child, visit));
    else if (value && typeof value === 'object' && value.type) walkAst(value, visit);
  });
}

function parse(source, label) {
  let ast;
  try {
    ast = acorn.parse(source, opts);
  } catch (error) {
    const line = error.loc ? error.loc.line : '?';
    const column = error.loc ? error.loc.column : '?';
    throw new Error(label + ':' + line + ':' + column + ' ' + error.message);
  }
  walkAst(ast, node => {
    if (node.type === 'ChainExpression' || node.optional) {
      throw new Error(label + ' uses optional chaining, which Chrome 69 does not support');
    }
    if (node.type === 'LogicalExpression' && node.operator === '??') {
      throw new Error(label + ' uses nullish coalescing, which Chrome 69 does not support');
    }
  });
}

function mustReject(source, label) {
  let rejected = false;
  try { parse(source, label); } catch (error) { rejected = true; }
  if (!rejected) throw new Error('Chrome 69 gate accepted ' + label);
}

mustReject('var a = b ?? c;', 'nullish coalescing');
mustReject('var a = b?.c;', 'optional chaining');
mustReject('class A { x = 1 }', 'class fields');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

const files = walk(assets);
let scripts = 0;
files.forEach(file => {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.js')) {
    parse(text, rel);
    scripts++;
  }
  if (file.endsWith('.html')) {
    const blocks = text.match(/<script>([\s\S]*?)<\/script>/g) || [];
    if (!blocks.length) throw new Error(rel + ' has no script');
    blocks.forEach((block, index) => {
      const code = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
      parse(code, rel + ' script ' + (index + 1));
      scripts++;
    });
    const styles = text.match(/<style>([\s\S]*?)<\/style>/g) || [];
    styles.forEach((block, index) => {
      if (block.indexOf(':has(') >= 0) throw new Error(rel + ' style ' + (index + 1) + ' uses :has()');
    });
  }
  if (file.endsWith('.css') || file.endsWith('.html')) {
    if (text.indexOf(':has(') >= 0) throw new Error(rel + ' uses :has(), which Chrome 69 does not support');
  }
});

const flowCss = fs.readFileSync(path.join(assets, 'folio-flow.css'), 'utf8');
if (/\bgap\s*:/.test(flowCss)) throw new Error('folio-flow.css uses gap without a Chrome 69 fallback');
if (/inset\s*:/.test(flowCss)) throw new Error('folio-flow.css uses inset, which Chrome 69 does not support');
if (flowCss.indexOf(':has(') >= 0) throw new Error('folio-flow.css uses :has()');

const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
if (manifest.indexOf('android.permission.INTERNET') >= 0) {
  throw new Error('Folio must not declare the INTERNET permission');
}
if (manifest.indexOf('android.speech.action.RECOGNIZE_SPEECH') < 0) {
  throw new Error('Manifest must declare the speech recognizer intent so Android 11+ can resolve it');
}

const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/folio/finance/MainActivity.java'), 'utf8');
if (activity.indexOf('RecognizerIntent.EXTRA_PREFER_OFFLINE, true') < 0) {
  throw new Error('Voice recognition must prefer offline recognition');
}

const voice = fs.readFileSync(path.join(assets, 'folio-v2.js'), 'utf8');
const notice = "the device's own recognizer may still send audio to its provider over the network";
if (voice.indexOf(notice) < 0) throw new Error('Voice sheet must say the recognizer may use the network');
if (voice.indexOf('prefer offline recognition') < 0) throw new Error('Voice sheet must say offline recognition is preferred');

files.forEach(file => {
  if (!/\.(js|html|css)$/.test(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  if (/\bfetch\s*\(/.test(text) || text.indexOf('XMLHttpRequest') >= 0 || text.indexOf('sendBeacon') >= 0) {
    throw new Error(path.relative(root, file) + ' adds a network call');
  }
});

if (scripts < 4) throw new Error('expected to parse the bundled scripts');
console.log('PASS Chrome 69 syntax and offline voice checks (' + scripts + ' scripts)');
