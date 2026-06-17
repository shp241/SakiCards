const Shoupai = require('../src/core/shoupai.js');
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

/** 快捷构造：手牌数组 + 自摸牌字符串 */
function makeHand(tiles, zimo = null, opts = {}) {
    let s = new Shoupai(tiles);
    s._zimo = zimo;
    s._lizhi = !!opts.lizhi;
    s._markedTiles = new Set(opts.marked || []);
    return s;
}

let s, ht, tiles, hidden;

// ====================================================
// 基础构造（手动构造 Shoupai）
// ====================================================
console.log('=== 基础构造 ===');

// 手牌包含红5(p0)、字牌(z1)，自摸牌是 s2（唯一，避免歧义）
s = makeHand(
    ['m1','m2','m3', 'p0','p5','p9', 'z1','z1','z2','z3', 's2','s3','s4'],
    's2'
);
ht = HandTiles.fromShoupai(s);

test('count', ht.count, 13);
test('countNoZimo', ht.countNoZimo, 12);
test('zimoTile exists', ht.zimoTile !== null, true);
test('zimoTile string', ht.zimoTile.toString(), 's2');
test('isLizhi false', ht.isLizhi(), false);

// 红5识别
test('countRed m', ht.countRed('m'), 0);
test('countRed p', ht.countRed('p'), 1);

tiles = ht.getByNum('p', 5);
test('p5 total (red+normal)', tiles.length, 2);

tiles = ht.getBySuit('p');
test('p-suit count', tiles.length, 3);

test('hasSuit m', ht.hasSuit('m'), true);
test('hasSuit s', ht.hasSuit('s'), true);
test('hasSuit z', ht.hasSuit('z'), true);

// 纯字牌手牌
s = makeHand(['z1','z1'], null);
ht = HandTiles.fromShoupai(s);
test('hasZipai true', ht.hasZipai(), true);
test('countOf z1', ht.countOf('z', 1), 2);

// ====================================================
// 立直
// ====================================================
console.log('\n=== 立直 ===');
s = makeHand(['m1','m2','m3','p5'], null, { lizhi: true });
ht = HandTiles.fromShoupai(s);
test('lizhi true', ht.isLizhi(), true);

// ====================================================
// 暗牌
// ====================================================
console.log('\n=== 暗牌 ===');
s = makeHand(['_','_','_', 'm1','m2'], null);
ht = HandTiles.fromShoupai(s);
hidden = ht.getAll().filter(t => t.isHidden);
test('hidden count', hidden.length, 3);
test('hidden toString', hidden[0].toString(), '_');

// ====================================================
// 无自摸
// ====================================================
console.log('\n=== 无自摸 ===');
s = makeHand(['m1','m2','m3','p5','p9','z1'], null);
ht = HandTiles.fromShoupai(s);
test('no zimo', ht.zimoTile === null, true);
test('count no zimo', ht.count, 6);

// ====================================================
// 副露巡目
// ====================================================
console.log('\n=== 副露巡目 ===');
s = new Shoupai(['m1','m2','m3','p5','p9']);
s._zimo = 's1-23';  // 副露后状态，_zimo 长度 > 2
ht = HandTiles.fromShoupai(s);
test('fulou turn', ht.isInFulouTurn(), true);
test('fulou turn no zimo', ht.zimoTile === null, true);

// ====================================================
// 查询方法
// ====================================================
console.log('\n=== 查询 ===');
s = makeHand(
    ['m1','m2','m3', 'p0','p5','p9', 'z1','z1','z2','z3', 's2','s3','s4'],
    's2'
);
ht = HandTiles.fromShoupai(s);

test('countOf m1', ht.countOf('m', 1), 1);
test('countOf m2', ht.countOf('m', 2), 1);
test('countOf p5 (red+normal)', ht.countOf('p', 5), 2);
test('countOf p0→5', ht.countOf('p', 0), 2);
test('countSuits', ht.countSuits(), 3);  // m, p, s
test('countCategories', ht.countCategories(), 4);  // m, p, s, z

// ====================================================
// 牌姿判断
// ====================================================
console.log('\n=== 牌姿判断 ===');

// hasNeighbor
s = makeHand(['m1','m2','m3', 'p0','p5','p9', 'z1','z1','z2','z3', 's2','s3','s4'], 's2');
ht = HandTiles.fromShoupai(s);
test('m1 hasNeighbor', ht.hasNeighbor('m', 1), true);   // m2,m3 在 ±2 内
test('p9 hasNeighbor', ht.hasNeighbor('p', 9), false);  // 只有 p5，差 4，不在 ±2
test('z1 hasNeighbor', ht.hasNeighbor('z', 1), false);  // 字牌无邻
test('m6 noNeighbor', ht.hasNeighbor('m', 6), false);   // 没有 m4-m8

// isAllChunchan
s = makeHand(['m3','m4','m5','p4','p5','p6','s3','s4','s5'], null);
ht = HandTiles.fromShoupai(s);
test('all chunchan', ht.isAllChunchan(), true);

s = makeHand(['m1','m2','p4','p5','p6','s3','s4','s5'], null);
ht = HandTiles.fromShoupai(s);
test('not all chunchan', ht.isAllChunchan(), false);

// ====================================================
// 对子/刻子
// ====================================================
console.log('\n=== 对子/刻子 ===');
// m1 对子 + z1 对子
s = makeHand(['m1','m1','z1','z1','p2','p3','p5','p9','m2','m3','m4','m5','s1'], 's1');
ht = HandTiles.fromShoupai(s);
test('countPairs', ht.countPairs(), 2);  // m1 pair, z1 pair

// m1 刻子 + p2 刻子
s = makeHand(['m1','m1','m1','p2','p2','p2','m4','m5','p6','p7','s1','s2','s3'], 's3');
ht = HandTiles.fromShoupai(s);
test('countTriplets', ht.countTriplets(), 2);

// ====================================================
// 宽松一杯口
// ====================================================
console.log('\n=== 宽松一杯口 ===');
// 同花色两个同点顺子 m1-2-3 + m1-2-3
s = makeHand(['m1','m1','m2','m2','m3','m3','p4','p5','p6','m4','m5','z1','z1'], 'z1');
ht = HandTiles.fromShoupai(s);
test('iipeikou 1', ht.countRelaxedIipeikou(), 1);

// 3组同点顺子（m1-2-3 × 3）→ 只有1对
s = makeHand(['m1','m1','m1','m2','m2','m2','m3','m3','m3','p4','p5','m4','m5'], 'm1');
ht = HandTiles.fromShoupai(s);
test('iipeikou 3seq=1pair', ht.countRelaxedIipeikou(), 1);

// ====================================================
// syncTo round-trip（含暗牌）
// ====================================================
console.log('\n=== syncTo round-trip ===');

// 含暗牌 + 自摸 + 红5
s = makeHand(['_','_','_', 'm1','m2','m3','p0','p5','p9','z1','z1','z2','z3'], 'z3');
ht = HandTiles.fromShoupai(s);
let s2 = new Shoupai();
ht.syncTo(s2);
test('syncTo hidden+zimo round-trip', s2.toString(), s.toString());

// 含暗牌 + 立直
s = makeHand(['_','_','_', 'm1','m2','m3','p0','p5','p9','z1','z1','z2','z3'], 'z3', { lizhi: true });
ht = HandTiles.fromShoupai(s);
s2 = new Shoupai();
ht.syncTo(s2);
test('syncTo hidden+lizhi round-trip', s2.toString(), s.toString());

// ====================================================
// fromString → fromShoupai → syncTo round-trip
// ====================================================
console.log('\n=== fromString → syncTo round-trip ===');

// 13张牌（无自摸，无副露）
let origStr = 'm123789p059z1123';
s = Shoupai.fromString(origStr);
ht = HandTiles.fromShoupai(s);
s2 = new Shoupai();
ht.syncTo(s2);
test('fromString 13-tile round-trip', s2.toString(), s.toString());

// 14张牌（有自摸，无副露）
origStr = 'm123789p059z1123m9';
s = Shoupai.fromString(origStr);
ht = HandTiles.fromShoupai(s);
s2 = new Shoupai();
ht.syncTo(s2);
test('fromString 14-tile+zimo round-trip', s2.toString(), s.toString());

// 14张牌 + 立直
origStr = 'm123789p059z1123m9*';
s = Shoupai.fromString(origStr);
ht = HandTiles.fromShoupai(s);
s2 = new Shoupai();
ht.syncTo(s2);
test('fromString 14-tile+zimo+lizhi round-trip', s2.toString(), s.toString());

// ====================================================
// HandTile 对象
// ====================================================
console.log('\n=== HandTile 对象 ===');
let t1 = new HandTile('m', 1);
let t2 = new HandTile('m', 1);
let t3 = new HandTile('m', 1, { isRed: false });
let tr = new HandTile('m', 5, { isRed: true });
let t5 = new HandTile('m', 5);
let th = new HandTile('_', 0, { isHidden: true });

test('equals same suit+num', t1.equals(t2), true);
test('equals normal vs non-red', t1.equals(t3), true);
test('equals cross-suit', t1.equals(new HandTile('p', 1)), false);
test('equals cross-num', t1.equals(new HandTile('m', 2)), false);
test('equals red5 vs normal5', tr.equals(t5), true);  // 红5 == 普通5
test('strictEquals red5 vs normal5', tr.strictEquals(t5), false);
test('hidden toString', th.toString(), '_');
test('red5 toString', tr.toString(), 'm0');
test('normal toString', t1.toString(), 'm1');
test('z tile toString', new HandTile('z', 3).toString(), 'z3');
test('number method', tr.number(), 5);  // 红5 number = 5

console.log('\n' + passed + ' passed, ' + failed + ' failed');
console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
process.exit(failed === 0 ? 0 : 1);
