const Shoupai = require('../src/core/shoupai.js');
const meldParser = require('../src/core/meld-parser.js');

let allPass = true;

function test(name, actual, expected) {
    let pass = JSON.stringify(actual) === JSON.stringify(expected);
    console.log((pass ? 'PASS' : 'FAIL') + ' ' + name);
    if (!pass) {
        console.log('  expected:', JSON.stringify(expected));
        console.log('  actual:  ', JSON.stringify(actual));
    }
    allPass = allPass && pass;
    return pass;
}

// ===== 1. valid_mianzi =====
console.log('=== 1. valid_mianzi ===');
test('new chi', Shoupai.valid_mianzi('chi:s1-|s2|s3'), 'chi:s1-|s2|s3');
test('new pon', Shoupai.valid_mianzi('pon:z2|z2|z2='), 'pon:z2|z2|z2=');
test('new minkan', Shoupai.valid_mianzi('minkan:m5|m5|m5+|m5'), 'minkan:m5|m5|m5+|m5');
test('new kakan', Shoupai.valid_mianzi('kakan:p1|p1|p1=|p1'), 'kakan:p1|p1|p1=|p1');
test('new ankan', Shoupai.valid_mianzi('ankan:s3|s3|s3|s3'), 'ankan:s3|s3|s3|s3');
test('old chi → new', Shoupai.valid_mianzi('s1-23'), 'chi:s1-|s2|s3');
test('old pon → new', Shoupai.valid_mianzi('z222='), 'pon:z2|z2|z2=');
test('old minkan → new', Shoupai.valid_mianzi('m5555+'), 'minkan:m5|m5|m5+|m5');
test('old kakan → new', Shoupai.valid_mianzi('p111=1'), 'kakan:p1|p1|p1=|p1');
test('old ankan → new', Shoupai.valid_mianzi('s3333'), 'ankan:s3|s3|s3|s3');
test('invalid', Shoupai.valid_mianzi('xyz'), undefined);

// ===== 2. fromString with old-format fulou =====
console.log('\n=== 2. fromString with old-format fulou ===');
let s = Shoupai.fromString('m12344,s1-23,z222=');
test('_fulou[0] new format', s._fulou[0], 'chi:s1-|s2|s3');
test('_fulou[1] new format', s._fulou[1], 'pon:z2|z2|z2=');
test('meta[0] type', s._fulouMeta[0].type, 'chi');
test('meta[0] tiles', s._fulouMeta[0].tiles, ['s1','s2','s3']);
test('meta[0] fromSeat', s._fulouMeta[0].fromSeat, 2);
test('meta[0] calledTileIndex', s._fulouMeta[0].calledTileIndex, 0);
test('meta[1] type', s._fulouMeta[1].type, 'pon');
test('meta[1] fromSeat', s._fulouMeta[1].fromSeat, 1);
test('meta[1] calledTileIndex', s._fulouMeta[1].calledTileIndex, 2);

// ===== 3. fromString with new-format fulou =====
console.log('\n=== 3. fromString with new-format fulou ===');
let s2 = Shoupai.fromString('m12344,chi:s1-|s2|s3');
test('new in stored', s2._fulou[0], 'chi:s1-|s2|s3');
test('new meta fromSeat', s2._fulouMeta[0].fromSeat, 2);
test('new meta calledTileIndex', s2._fulouMeta[0].calledTileIndex, 0);

// _zimo after fulou (trailing comma)
let s3 = Shoupai.fromString('m12345,chi:s1-|s2|s3,');
test('zimo after fulou is mianzi', meldParser.isNewFormat(s3._zimo), true);

// ===== 4. toString outputs new format =====
console.log('\n=== 4. toString ===');
s = Shoupai.fromString('m12344,s1-23,z222=');
test('toString has new chi', s.toString().includes('chi:s1-|s2|s3'), true);
test('toString has new pon', s.toString().includes('pon:z2|z2|z2='), true);

// ===== 5. clone preserves _fulouMeta =====
console.log('\n=== 5. clone ===');
s = Shoupai.fromString('m12344,s1-23,z222=');
let c = s.clone();
test('clone _fulou[0]', c._fulou[0], s._fulou[0]);
test('clone meta[0].fromSeat', c._fulouMeta[0].fromSeat, 2);
test('clone meta[0].calledTileIndex', c._fulouMeta[0].calledTileIndex, 0);
test('clone meta deep copy', c._fulouMeta[0] !== s._fulouMeta[0], true);

// ===== 6. fulou(m) with both formats =====
console.log('\n=== 6. fulou(m) ===');
// fulou during another player's turn: no zimo
// Need 3 z2 in hand for pon
s = new Shoupai(['m1','m2','m3','m4','m5','z2','z2','z2']);
s.fulou('z222+');
test('fulou stored new format', s._fulou[0], 'pon:z2|z2|z2+');
test('fulou meta fromSeat', s._fulouMeta[0].fromSeat, 0);
test('fulou meta tiles', s._fulouMeta[0].tiles, ['z2','z2','z2']);
test('fulou meta calledTileIndex', s._fulouMeta[0].calledTileIndex, 2);

// New format chi (called from 上家, direction '-')
// Need s2, s3 in hand (s1 is called from another player)
s = new Shoupai(['m1','m2','m3','m4','m5','m6','s2','s3']);
s.fulou('chi:s1-|s2|s3');
test('new fulou stored', s._fulou[0], 'chi:s1-|s2|s3');
test('new fulou meta tiles', s._fulouMeta[0].tiles, ['s1','s2','s3']);
test('new fulou meta calledTileIndex', s._fulouMeta[0].calledTileIndex, 0);

// fulou sets zimo to mianzi (not for ankan)
test('zimo is mianzi after fulou', meldParser.isNewFormat(s._zimo), true);

// ===== 7. gang(m) =====
console.log('\n=== 7. gang(m) ===');
// ankan (need 3 in hand, draw 4th, then gang)
s = new Shoupai(['s3','s3','s3','m1','m2','m3','m4','m5','m6','p1']);
s.zimo('s3', false);
s.gang('ankan:s3|s3|s3|s3');
test('ankan stored', s._fulou[0], 'ankan:s3|s3|s3|s3');
test('ankan meta fromSeat', s._fulouMeta[0].fromSeat, null);

// kakan (从 pon 加杠)
s = new Shoupai(['m1','m1','m1','m1','s2','s3','s4']);
s.fulou('pon:m1|m1|m1+');
test('pon stored', s._fulou[0], 'pon:m1|m1|m1+');
s.zimo('m1', false);
s.gang('kakan:m1|m1|m1|m1+');
test('kakan stored', s._fulou[0], 'kakan:m1|m1|m1|m1+');
test('kakan meta tiles', s._fulouMeta[0].tiles, ['m1','m1','m1','m1']);

// ===== 8. fulouType / fulouTiles =====
console.log('\n=== 8. fulouType / fulouTiles ===');
test('fulouType new', Shoupai.fulouType('chi:s1-|s2|s3'), 'chi');
test('fulouType old', Shoupai.fulouType('z222='), 'pon');
test('fulouTiles new', JSON.stringify(Shoupai.fulouTiles('ankan:s3|s3|s3|s3')), JSON.stringify(['s3','s3','s3','s3']));
test('fulouTiles old', JSON.stringify(Shoupai.fulouTiles('s1-23')), JSON.stringify(['s1','s2','s3']));

// ===== 9. menqian getter =====
console.log('\n=== 9. menqian ===');
s = new Shoupai(['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p4']);
test('no fulou menqian', s.menqian, true);
s = Shoupai.fromString('m12344,s1-23');
test('chi fulou not menqian', s.menqian, false);
s = Shoupai.fromString('m123456789,s3333');
test('ankan menqian', s.menqian, true);

// ===== 10. meldMetas getter =====
console.log('\n=== 10. meldMetas getter ===');
s = Shoupai.fromString('m12345,s1-23,z222=');
test('meldMetas length', s.meldMetas.length, 2);
test('meldMetas[0].type', s.meldMetas[0].type, 'chi');

// ===== 11. get_dapai deny logic =====
console.log('\n=== 11. get_dapai deny logic ===');
// After chi fulou, called tile can't be discarded
s = Shoupai.fromString('m12345,s234,chi:s1-|s2|s3,');
let dp = s.get_dapai();
test('dapai denies called tile s1', dp.includes('s1'), false);
test('dapai denies s4 (chi s123, called s1 at index 0)', dp.includes('s4'), false);

// After pon fulou
s = Shoupai.fromString('m12345,z22,pon:z2|z2|z2=,');
dp = s.get_dapai();
test('dapai denies called tile z2', dp.includes('z2'), false);

// ===== 12. get_chi_mianzi =====
console.log('\n=== 12. get_chi_mianzi ===');
// Pattern 1: called at end (hand has p3,p4)
s = new Shoupai(['m1','m1','m1','m2','m3','m4','m5','m6','m7','m8','p3','p4']);
let chi = s.get_chi_mianzi('p5-');
test('chi called at end', chi.includes('chi:p3|p4|p5-'), true);

// Pattern 2: called in middle (hand has p3,p5)
s = new Shoupai(['m1','m1','m1','m2','m3','m4','m5','m6','m7','m8','p3','p5']);
chi = s.get_chi_mianzi('p4-');
test('chi called middle', chi.includes('chi:p3|p4-|p5'), true);

// Pattern 3: called at start (hand has p4,p5)
s = new Shoupai(['m1','m1','m1','m2','m3','m4','m5','m6','m7','m8','p4','p5']);
chi = s.get_chi_mianzi('p3-');
test('chi called start', chi.includes('chi:p3-|p4|p5'), true);

// Chi with red5
s = new Shoupai(['m1','m2','m3','m4','m5','m5','m0','s4','s5']);
chi = s.get_chi_mianzi('s6-');
test('chi with red5 exists', chi.length > 0, true);
for (let c of chi) test('chi is new format', meldParser.isNewFormat(c), true);

// ===== 13. get_peng_mianzi =====
console.log('\n=== 13. get_peng_mianzi ===');
s = new Shoupai(['m1','m1','m1','m2','m3','m4','p5','p5']);
let peng = s.get_peng_mianzi('p5+');
test('peng exists', peng.length > 0, true);
test('peng new format', meldParser.isNewFormat(peng[0]), true);

s = new Shoupai(['m1','m1','m1','m2','m3','m4','z1','z1']);
peng = s.get_peng_mianzi('z1=');
test('peng z1 new format', peng[0], 'pon:z1|z1|z1=');

// Peng with red5 (1 red5 + 1 normal 5)
s = new Shoupai(['m1','m2','m3','m4','m0','m5','s1','s2']);
peng = s.get_peng_mianzi('m5=');
test('peng red5 exists', peng.length > 0, true);
for (let p of peng) test('peng red5 new format', meldParser.isNewFormat(p), true);

// ===== 14. get_gang_mianzi =====
console.log('\n=== 14. get_gang_mianzi ===');
// Called minkan (no zimo needed for this check)
s = new Shoupai(['m1','m1','m1','m1','m2','m3','m4','s9','s9','s9']);
let gang = s.get_gang_mianzi('s9+');
test('minkan exists', gang.length > 0, true);
test('minkan new format', meldParser.isNewFormat(gang[0]), true);

// Ankan (needs zimo: 3 in hand, draw 4th)
s = new Shoupai(['s3','s3','s3','m1','m2','m3','m4','m5','m6','p1']);
s.zimo('s3', false);
gang = s.get_gang_mianzi();
test('ankan exists', gang.length > 0, true);
test('ankan new format', meldParser.isNewFormat(gang[0]), true);

// Kakan (加杠)
s = new Shoupai(['z1','z1','z1','m1','m2','m3']);
s.fulou('pon:z1|z1|z1=');
s.zimo('z1', false);
gang = s.get_gang_mianzi();
test('kakan exists', gang.length > 0, true);
test('kakan new format', meldParser.isNewFormat(gang[0]), true);

// Gang with red5 (1 red5 + 2 normal 5, draw 4th)
s = new Shoupai(['m0','m5','m5','m1','m2','m3','m4','m6','m7','p1']);
s.zimo('m5', false);
gang = s.get_gang_mianzi();
test('ankan red5 exists', gang.length > 0, true);
test('ankan red5 new format', meldParser.isNewFormat(gang[0]), true);

// ===== 15. fromString → toString round-trip =====
console.log('\n=== 15. round-trip ===');
// Old format input → toString → fromString
s = Shoupai.fromString('m12344,s1-23,z222=');
let str = s.toString();
let s4 = Shoupai.fromString(str);
test('roundtrip _fulou[0]', s4._fulou[0], 'chi:s1-|s2|s3');
test('roundtrip meta[0].fromSeat', s4._fulouMeta[0].fromSeat, 2);
test('roundtrip _fulou[1]', s4._fulou[1], 'pon:z2|z2|z2=');

// New format input → toString → fromString
s = Shoupai.fromString('m12345,chi:s1-|s2|s3,ankan:m5|m5|m5|m5');
str = s.toString();
s4 = Shoupai.fromString(str);
test('roundtrip new chi', s4._fulou[0], 'chi:s1-|s2|s3');
test('roundtrip new ankan', s4._fulou[1], 'ankan:m5|m5|m5|m5');
test('roundtrip ankan meta', s4._fulouMeta[1].fromSeat, null);

// ===== 16. ankan clears zimo =====
console.log('\n=== 16. ankan clears zimo ===');
s = new Shoupai(['s3','s3','s3','m1','m2','m3','m4','m5','m6','p1']);
s.zimo('s3', false);
s.gang('ankan:s3|s3|s3|s3');
test('zimo null after ankan', s._zimo, null);

console.log('\n' + (allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));
process.exit(allPass ? 0 : 1);
