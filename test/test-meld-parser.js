const mp = require('../src/core/meld-parser.js');

function test(name, actual, expected) {
    let pass = JSON.stringify(actual) === JSON.stringify(expected);
    console.log((pass ? 'PASS' : 'FAIL') + ' ' + name);
    if (!pass) {
        console.log('  expected:', JSON.stringify(expected));
        console.log('  actual:  ', JSON.stringify(actual));
    }
    return pass;
}

let allPass = true;
let r, str;

// ===== 新格式 round-trip =====
console.log('=== 新格式 round-trip ===');

r = mp.parseMianzi('chi:s1-|s2|s3');
allPass &= test('chi parse', r, {type:'chi', tiles:['s1','s2','s3'], fromSeat:2, calledTileIndex:0});
allPass &= test('chi toString', mp.toMianziString(r), 'chi:s1-|s2|s3');

r = mp.parseMianzi('chi:m3|m4|m0-');
allPass &= test('chi red5 parse', r, {type:'chi', tiles:['m3','m4','m0'], fromSeat:2, calledTileIndex:2});
allPass &= test('chi red5 toString', mp.toMianziString(r), 'chi:m3|m4|m0-');

r = mp.parseMianzi('pon:z2|z2|z2=');
allPass &= test('pon parse', r, {type:'pon', tiles:['z2','z2','z2'], fromSeat:1, calledTileIndex:2});
allPass &= test('pon toString', mp.toMianziString(r), 'pon:z2|z2|z2=');

r = mp.parseMianzi('minkan:m5|m5|m5+|m5');
allPass &= test('minkan parse', r, {type:'minkan', tiles:['m5','m5','m5','m5'], fromSeat:0, calledTileIndex:2});
allPass &= test('minkan toString', mp.toMianziString(r), 'minkan:m5|m5|m5+|m5');

r = mp.parseMianzi('kakan:p1|p1|p1=|p1');
allPass &= test('kakan parse', r, {type:'kakan', tiles:['p1','p1','p1','p1'], fromSeat:1, calledTileIndex:2});
allPass &= test('kakan toString', mp.toMianziString(r), 'kakan:p1|p1|p1=|p1');

r = mp.parseMianzi('ankan:s3|s3|s3|s3');
allPass &= test('ankan parse', r, {type:'ankan', tiles:['s3','s3','s3','s3'], fromSeat:null, calledTileIndex:null});
allPass &= test('ankan toString', mp.toMianziString(r), 'ankan:s3|s3|s3|s3');

// 异形
r = mp.parseMianzi('chi:z1-|z2|z3');
allPass &= test('irr chi parse', r, {type:'chi', tiles:['z1','z2','z3'], fromSeat:2, calledTileIndex:0});
allPass &= test('irr chi toString', mp.toMianziString(r), 'chi:z1-|z2|z3');

r = mp.parseMianzi('pon:p3|s3|m3=');
allPass &= test('irr pon parse', r, {type:'pon', tiles:['p3','s3','m3'], fromSeat:1, calledTileIndex:2});
allPass &= test('irr pon toString', mp.toMianziString(r), 'pon:p3|s3|m3=');

// ===== 旧格式兼容读取 =====
console.log('\n=== 旧格式兼容读取 ===');

r = mp.parseMianzi('s1-23');
allPass &= test('old chi tiles', r.tiles, ['s1','s2','s3']);
allPass &= test('old chi type', r.type, 'chi');
allPass &= test('old chi fromSeat', r.fromSeat, 2);
allPass &= test('old chi calledIdx', r.calledTileIndex, 0);

r = mp.parseMianzi('m34-0');
allPass &= test('old chi red5 tiles', r.tiles, ['m3','m4','m0']);
allPass &= test('old chi red5 type', r.type, 'chi');

r = mp.parseMianzi('z222=');
allPass &= test('old pon tiles', r.tiles, ['z2','z2','z2']);
allPass &= test('old pon type', r.type, 'pon');

r = mp.parseMianzi('m5555+');
allPass &= test('old minkan tiles', r.tiles, ['m5','m5','m5','m5']);
allPass &= test('old minkan type', r.type, 'minkan');

r = mp.parseMianzi('p111=1');
allPass &= test('old kakan tiles', r.tiles, ['p1','p1','p1','p1']);
allPass &= test('old kakan type', r.type, 'kakan');
allPass &= test('old kakan fromSeat', r.fromSeat, 1);

r = mp.parseMianzi('s3333');
allPass &= test('old ankan tiles', r.tiles, ['s3','s3','s3','s3']);
allPass &= test('old ankan type', r.type, 'ankan');
allPass &= test('old ankan fromSeat', r.fromSeat, null);

// 旧 → 新 round-trip
r = mp.parseMianzi('s1-23');
str = mp.toMianziString(r);
allPass &= test('old-to-new chi', str, 'chi:s1-|s2|s3');

r = mp.parseMianzi('p111=1');
str = mp.toMianziString(r);
allPass &= test('old-to-new kakan', str, 'kakan:p1|p1|p1=|p1');

// ===== fulouType / fulouTiles =====
console.log('\n=== fulouType / fulouTiles ===');
allPass &= test('fulouType new chi', mp.fulouType('chi:s1-|s2|s3'), 'chi');
allPass &= test('fulouType old pon', mp.fulouType('z222='), 'pon');
allPass &= test('fulouTiles new ankan', JSON.stringify(mp.fulouTiles('ankan:s3|s3|s3|s3')), JSON.stringify(['s3','s3','s3','s3']));
allPass &= test('fulouTiles old chi', JSON.stringify(mp.fulouTiles('s1-23')), JSON.stringify(['s1','s2','s3']));

// ===== validMianzi =====
console.log('\n=== validMianzi ===');
allPass &= test('valid new chi', mp.validMianzi('chi:s1-|s2|s3'), 'chi:s1-|s2|s3');
allPass &= test('valid new ankan', mp.validMianzi('ankan:s3|s3|s3|s3'), 'ankan:s3|s3|s3|s3');
allPass &= test('valid ankan+dir fail', mp.validMianzi('ankan:s3|s3|s3+|s3'), null);
allPass &= test('valid old format fail', mp.validMianzi('s1-23'), null);
allPass &= test('isNewFormat new', mp.isNewFormat('chi:s1-|s2|s3'), true);
allPass &= test('isNewFormat old', mp.isNewFormat('s1-23'), false);

console.log('\n' + (allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));
process.exit(allPass ? 0 : 1);
