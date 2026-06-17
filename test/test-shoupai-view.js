const Shoupai = require('../src/core/shoupai.js');
const ShoupaiView = require('../src/core/shoupai-view.js');
const { HandTile, HandTiles } = require('../src/core/hand-tile.js');

let passed = 0, failed = 0;

function test(name, actual, expected) {
    let pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (pass) { passed++; console.log('PASS ' + name); }
    else {
        failed++; console.log('FAIL ' + name);
        console.log('  expected:', JSON.stringify(expected));
        console.log('  actual:  ', JSON.stringify(actual));
    }
}

/** 快捷构造 Shoupai */
function makeHand(tiles, zimo = null, opts = {}) {
    let s = new Shoupai(tiles);
    s._zimo = zimo;
    s._lizhi = !!opts.lizhi;
    s._markedTiles = new Set(opts.marked || []);
    return s;
}

/** 添加工杠式副露（使用新格式 mianzi） */
function addFulou(shoupai, mianzi) {
    shoupai._fulou.push(mianzi);
    shoupai._fulouMeta.push({
        type: mianzi.split(':')[0],
        tiles: mianzi.split(':')[1].split('|').map(p => p.replace(/[\+\=\-]$/, '')),
        fromSeat: null,
        calledTileIndex: null,
    });
}

let s, view;

// ====================================================
// 基本构造（无副露）
// ====================================================
console.log('=== 基本构造（门前清） ===');

s = makeHand(['m1','m2','m3', 'p0','p5','p9', 'z1','z1','z2','z3', 's2','s3','s4'], 's2');
view = ShoupaiView.fromShoupai(s);

test('handTiles count', view.handTiles.count, 13);
test('melds length', view.melds.length, 0);
test('isMenzen true', view.isMenzen(), true);
test('isRiichi false', view.isRiichi(), false);
test('hasZipai true', view.hasZipai(), true);  // z1,z2,z3

s = makeHand(['m1','m2','m3','p1','p2','p3','s1','s2','s3'], null);
view = ShoupaiView.fromShoupai(s);
test('hasZipai false (all numbers)', view.hasZipai(), false);

// ====================================================
// 立直
// ====================================================
console.log('\n=== 立直 ===');
s = makeHand(['m1','m2','m3','p5'], null, { lizhi: true });
view = ShoupaiView.fromShoupai(s);
test('isRiichi true', view.isRiichi(), true);

// ====================================================
// 副露解析
// ====================================================
console.log('\n=== 副露解析 ===');

// 模拟带副露的 Shoupai（使用新格式 mianzi）
s = makeHand(['m4','m5','p0','p5','p9','z1','z1','z2'], 'z2');
addFulou(s, 'chi:s1-|s2|s3');
view = ShoupaiView.fromShoupai(s);

test('melds length with fulou', view.melds.length, 1);
test('meld type chi', view.melds[0].type, 'chi');
test('meld tiles', view.melds[0].tiles.join(','), 's1,s2,s3');
test('meld fromSeat', view.melds[0].fromSeat, 2);  // '-' = 2 (上家)
test('meld calledTileIndex', view.melds[0].calledTileIndex, 0);
test('isMenzen false (chi)', view.isMenzen(), false);

// 门前清：仅暗杠
s = makeHand(['m1','m2','m3','p0','p5','p9','z1','z1','z2','z3'], 'z3');
addFulou(s, 'ankan:s3|s3|s3|s3');
view = ShoupaiView.fromShoupai(s);
test('isMenzen true (only ankan)', view.isMenzen(), true);

// 非门前清：有 pon
s = makeHand(['m1','m2','m3','p0','p5','p9','z1','z1','z2','z3'], 'z3');
addFulou(s, 'pon:z2|z2|z2=');
view = ShoupaiView.fromShoupai(s);
test('isMenzen false (has pon)', view.isMenzen(), false);

// ====================================================
// hasZipai 含副露
// ====================================================
console.log('\n=== hasZipai 含副露 ===');

s = makeHand(['m1','m2','m3','p1','p2','p3','s1','s2','s3'], null);
addFulou(s, 'pon:z1|z1|z1=');
view = ShoupaiView.fromShoupai(s);
test('hasZipai from meld', view.hasZipai(), true);

// ====================================================
// getAllTiles / getAllVisibleTiles
// ====================================================
console.log('\n=== getAllTiles ===');

s = makeHand(['m1','m2','m3', 'p0','p5','p9', 'z1'], 'z1');
addFulou(s, 'pon:s1|s1|s1=');
view = ShoupaiView.fromShoupai(s);

let all = view.getAllTiles();
test('getAllTiles count', all.length, 10);  // 7 hand + 3 meld
test('getAllTiles sorted', all.sort().join(','), 'm1,m2,m3,p0,p5,p9,s1,s1,s1,z1');

// 含暗牌
s = makeHand(['_','_','_', 'm1','m2'], null);
addFulou(s, 'chi:s1-|s2|s3');
view = ShoupaiView.fromShoupai(s);

let visible = view.getAllVisibleTiles();
test('getAllVisibleTiles count', visible.length, 5);   // m1,m2,s1,s2,s3 (no hidden)
test('getAllVisibleTiles has no _', visible.includes('_'), false);

// ====================================================
// countSuits / countCategories / countMeldSuits
// ====================================================
console.log('\n=== 花色/种类统计 ===');

// 仅 m 花色（手牌 + 副露同花色）
s = makeHand(['m1','m2','m3','m4','m5','m6','m7','m8','m9'], null);
addFulou(s, 'pon:m1|m1|m1=');
view = ShoupaiView.fromShoupai(s);
test('countSuits 1 (only m)', view.countSuits(), 1);
test('countCategories 1 (only m)', view.countCategories(), 1);
test('countMeldSuits 1', view.countMeldSuits(), 1);

// m,p,s,z（四种花色，风+三元分开算种类）
s = makeHand(['m1','p1','s1','z1','z5'], null);
view = ShoupaiView.fromShoupai(s);
test('countSuits 3 (m,p,s)', view.countSuits(), 3);
test('countCategories 5 (m,p,s,wind,dragon)', view.countCategories(), 5);

// 副露引入新花色
s = makeHand(['m1','m2','m3'], null);
addFulou(s, 'pon:p1|p1|p1=');
addFulou(s, 'chi:s1-|s2|s3');
view = ShoupaiView.fromShoupai(s);
test('countSuits 3 from melds', view.countSuits(), 3);
test('countMeldSuits 2 (p,s)', view.countMeldSuits(), 2);

// z 风/三元区分（通过副露）
s = makeHand([], null);
addFulou(s, 'pon:z1|z1|z1=');   // 风
addFulou(s, 'pon:z5|z5|z5=');   // 三元
view = ShoupaiView.fromShoupai(s);
test('countCategories z wind+dragon', view.countCategories(), 2);  // 风+三元

// ====================================================
// syncTo round-trip
// ====================================================
console.log('\n=== syncTo round-trip ===');

// 门前清
s = makeHand(['m1','m2','m3', 'p0','p5','p9', 'z1','z1','z2','z3', 's2','s3','s4'], 's2');
view = ShoupaiView.fromShoupai(s);
let s2 = new Shoupai();
view.syncTo(s2);
test('syncTo menzen hand round-trip', s2.toString(), s.toString());
test('syncTo menzen fulou', s2._fulou.length, 0);

// 含副露
s = makeHand(['m1','m2','m3', 'p5','p9', 'z1'], 'z1');
addFulou(s, 'chi:s1-|s2|s3');
addFulou(s, 'pon:z5|z5|z5=');
view = ShoupaiView.fromShoupai(s);
s2 = new Shoupai();
view.syncTo(s2);
test('syncTo fulou hand round-trip', s2.toString(), s.toString());

// 验证 syncTo 的 meld 结构正确写回
let z5meta = s2._fulouMeta[1];
test('syncTo meldMeta type preserved', z5meta.type, 'pon');
test('syncTo meldMeta tiles preserved', z5meta.tiles.join(','), 'z5,z5,z5');
test('syncTo meldMeta fromSeat preserved', z5meta.fromSeat, 1);  // '=' = 1

// 含暗杠 + 立直
s = makeHand(['m1','m2','m3', 'p0','p5','p9', 'z1','z1','z2','z3'], 'z3', { lizhi: true });
addFulou(s, 'ankan:s3|s3|s3|s3');
view = ShoupaiView.fromShoupai(s);
s2 = new Shoupai();
view.syncTo(s2);
test('syncTo ankan+lizhi round-trip', s2.toString(), s.toString());

// ====================================================
// fromString → ShoupaiView → syncTo 集成
// ====================================================
console.log('\n=== fromString 集成 ===');

// 门前清 round-trip（无副露，格式一致）
let origStr = 'm123789p059z1123';
s = Shoupai.fromString(origStr);
view = ShoupaiView.fromShoupai(s);
s2 = new Shoupai();
view.syncTo(s2);
test('fromString menzen round-trip', s2.toString(), s.toString());

// fromString 旧格式副露 → ShoupaiView 正确解析
// 注意：syncTo 后 toString 输出新格式 mianzi，与旧格式输入不同，
// 因此验证 hand portion 和 meld 结构，不比较完整 string
origStr = 'm123p059z11,m111=,s1-23';
s = Shoupai.fromString(origStr);
view = ShoupaiView.fromShoupai(s);

// 验证副露解析正确（从旧格式 mianzi 解析）
test('fromString old-format meld count', view.melds.length, 2);

let ponMeld = view.melds.find(m => m.type === 'pon');
test('fromString pon type', ponMeld.type, 'pon');
test('fromString pon tiles', ponMeld.tiles.join(','), 'm1,m1,m1');
test('fromString pon fromSeat', ponMeld.fromSeat, 1);  // '='

let chiMeld = view.melds.find(m => m.type === 'chi');
test('fromString chi type', chiMeld.type, 'chi');
test('fromString chi tiles', chiMeld.tiles.join(','), 's1,s2,s3');
test('fromString chi fromSeat', chiMeld.fromSeat, 2);  // '-' = 上家

// 验证手牌张数
test('fromString handTile count', view.handTiles.count, 8);  // m123,p059,z11 = 8

console.log('\n' + passed + ' passed, ' + failed + ' failed');
console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(failed === 0 ? 0 : 1);
