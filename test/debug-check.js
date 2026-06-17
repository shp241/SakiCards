"use strict";

const Module = require('module');
const path = require('path');
const originalResolveFilename = Module._resolveFilename;
const ROOT = path.resolve(__dirname, '..');

Module._resolveFilename = function(request, parent, isMain, options) {
    const aliases = {
        '@kobalab/majiang-core': path.resolve(ROOT, 'src/core/index.js'),
        '@kobalab/majiang-ai': path.resolve(ROOT, 'src/ai/index.js'),
    };
    if (aliases[request]) return aliases[request];
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

const Majiang = require('@kobalab/majiang-core');

// Test: what does fromString give for a 13-tile hand (no zimo)?
let s = Majiang.Shoupai.fromString('m13357889p26s0z12');
console.log('13-tile fromString:');
console.log('  _zimo:', s._zimo);
console.log('  toString:', s.toString());
console.log('  _bingpai._:', s._bingpai._);

// After zimo:
let s2 = Majiang.Shoupai.fromString('m13357889p26s0z12');
s2.zimo('s5', false);
console.log('\nAfter zimo(s5):');
console.log('  _zimo:', s2._zimo);
console.log('  toString:', s2.toString());
console.log('  _bingpai._:', s2._bingpai._);

// Check: can we get chi mianzi with zimo set?
let chi = s2.get_chi_mianzi('p2-');
console.log('get_chi_mianzi(p2-) with zimo:', chi);

// tingpai scenario
console.log('\nTesting tingpai scenario:');
let tingpaiTiles = Majiang.Util.tingpai(s2);
console.log('tingpai tiles:', tingpaiTiles);

// Try fulou
console.log('\nTest clone + fulou:');
try {
    let c = s2.clone();
    console.log('  clone _zimo:', c._zimo);
    // try to fulou with a mianzi that chi returns
    let f = s2.get_chi_mianzi('p2-');  // should be null since zimo is set
    console.log('  chi mianzi:', f);
} catch(e) {
    console.log('  error:', e.message);
}
