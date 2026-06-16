/**
 * 牌工具函数 (tile-utils)
 *
 * 牌的字符串格式为 "suit+number"：
 *   'm1'..'m9' (万), 'p1'..'p9' (筒), 's1'..'s9' (索), 'z1'..'z7' (字)
 *   红5 用 'm0', 'p0', 's0' 表示，其点数等价于 5
 *
 * 所有比较函数均处理红5：'m0' 与 'm5' 视为同点数。
 */
'use strict';

/* ================================================================
 * 基础访问
 * ================================================================ */

/**
 * 获取牌的花色。
 * @param {string} pai — 如 'm1', 'p0', 'z7'
 * @returns {string} 'm'|'p'|'s'|'z'
 */
function suitOf(pai) {
    return pai[0];
}

/**
 * 获取牌的点数（红5 返回 5）。
 * @param {string} pai — 如 'm1', 'p0', 'z7'
 * @returns {number} 1～9 或 1～7（字牌）
 */
function numberOf(pai) {
    let n = parseInt(pai[1]);
    return n === 0 ? 5 : n;
}

/**
 * 是否为红5。
 * @param {string} pai
 * @returns {boolean}
 */
function isRed5(pai) {
    return pai[1] === '0';
}

/* ================================================================
 * 相等比较
 * ================================================================ */

/**
 * 完全相等（同一张牌）。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isEqual(a, b) {
    return a === b;
}

/**
 * 花色相同。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameSuit(a, b) {
    return a[0] === b[0];
}

/**
 * 点数相同（红5 视为 5）。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameNumber(a, b) {
    return numberOf(a) === numberOf(b);
}

/**
 * 同一张牌或红5等价（'m0' 和 'm5' 视为相同）。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isEquivalent(a, b) {
    return sameSuit(a, b) && sameNumber(a, b);
}

/* ================================================================
 * 点数/花色匹配
 * ================================================================ */

/**
 * 点数是否在指定范围内。
 * @param {string} pai
 * @param {number[]|'any'} numbers — 如 [2,8] | [1,2,3,4] | 'any'
 * @returns {boolean}
 */
function matchNumbers(pai, numbers) {
    if (numbers === 'any') return true;
    if (!Array.isArray(numbers) || numbers.length === 0) return true;
    return numbers.includes(numberOf(pai));
}

/**
 * 花色是否在指定范围内。
 * @param {string} pai
 * @param {string[]|'any'} suits — 如 ['m'] | ['m','p'] | 'any'
 * @returns {boolean}
 */
function matchSuits(pai, suits) {
    if (suits === 'any') return true;
    if (!Array.isArray(suits) || suits.length === 0) return true;
    return suits.includes(suitOf(pai));
}

/* ================================================================
 * 牌河计数
 * ================================================================ */

/**
 * 统计牌河中有效舍牌数。
 * 不计被副露的牌（+/=/- 后缀），但计暗置的舍牌（_ 后缀）。
 *
 * @param {Object} he — 牌河对象（model.he[seat]）
 * @returns {number} 有效舍牌数
 */
function countHePai(he) {
    if (!he || !he._pai) return 0;
    let count = 0;
    for (let t of he._pai) {
        if (t.match(/[\+\=\-]$/)) continue;
        count++;
    }
    return count;
}

/**
 * 根据牌河牌数计算当前牌河排数（每排 6 张）。
 *
 * @param {number} paiCount — 有效舍牌数
 * @returns {number} 排号（1 起）
 */
function heRow(paiCount) {
    return Math.ceil(paiCount / 6);
}

/* ================================================================
 * 宝牌
 * ================================================================ */

/**
 * 根据宝牌指示牌获取其为宝牌的牌。
 * @param {string} indicator — 宝牌指示牌，如 'm1'（表示 'm2' 是宝牌）
 * @returns {string} 实际宝牌
 */
function doraOf(indicator) {
    let s = suitOf(indicator);
    let n = numberOf(indicator);
    if (s === 'z') {
        let doraN = n === 7 ? 1 : n + 1;
        return s + doraN;
    } else {
        let doraN = n === 9 ? 1 : n + 1;
        return s + doraN;
    }
}

/**
 * 构建宝牌集合。
 * @param {string[]} baopai — 宝牌指示牌数组
 * @returns {Set<string>}
 */
function buildDoraSet(baopai) {
    let set = new Set();
    if (!baopai) return set;
    for (let bp of baopai) {
        if (bp && bp.length >= 2) {
            set.add(doraOf(bp));
        }
    }
    return set;
}

/**
 * 判断牌是否为宝牌（含红5：'m0' 和 'm5' 均视为宝牌 'm6' 的指示对象）。
 * @param {string} pai
 * @param {string[]} baopai
 * @returns {boolean}
 */
function isDora(pai, baopai) {
    let set = buildDoraSet(baopai);
    /* 红5 也需要检查对应正常 5 是否为宝牌 */
    if (isRed5(pai) && set.has(suitOf(pai) + '5')) return true;
    if (set.has(pai)) return true;
    return false;
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    suitOf,
    numberOf,
    isRed5,
    isEqual,
    sameSuit,
    sameNumber,
    isEquivalent,
    matchNumbers,
    matchSuits,
    countHePai,
    heRow,
    doraOf,
    buildDoraSet,
    isDora,
};
