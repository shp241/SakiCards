/**
 * 视为和牌模块 (win-tile-overrider)
 *
 * 将某张牌"视为"和牌牌的通用操作。
 *
 * 使用场景：技能效果 "将牌视为和牌"
 * 即在和牌时，用指定牌替代真实和牌牌，保留原役种计算用的牌。
 *
 * 函数均为纯原子操作，不涉及 UI 或 AI 逻辑。
 *
 * getCandidates(shoupai, model, seat, options)
 *   — 收集可视为和牌的候选牌列表
 *
 * override(shoupai, chosenPai)
 *   — 用指定牌覆盖当前和牌牌
 */
'use strict';

const { numberOf, matchSuits, matchNumbers } = require('./tile-utils');

/* ================================================================
 * 候选手牌收集
 * ================================================================ */

/**
 * 收集可视为和牌的候选牌列表。
 * 遍历所有可能的牌（34 种 + 红5），按条件过滤。
 *
 * @param {Object} shoupai — Majiang.Shoupai 实例（当前手牌）
 * @param {Object} model   — Game._model
 * @param {number} seat    — 当前玩家席位
 * @param {Object} options — 过滤选项
 *   {
 *     suitFilter:   'any' | 'm' | ['m','s']  — 花色限制
 *     numberFilter: 'any' | [1,9] | [2,8]    — 点数限制
 *     onlyTingpai:  false   — 仅返回听牌范围内的候选
 *     tingpaiFn:    (shoupai, pai) => bool   — 听牌判断函数（onlyTingpai=true 时必需）
 *   }
 * @returns {string[]} 候选牌列表，如 ['m1', 'm5', 'p0', ...]
 */
function getCandidates(shoupai, model, seat, options = {}) {
    const {
        suitFilter = 'any',
        numberFilter = 'any',
        onlyTingpai = false,
        tingpaiFn = null,
    } = options;

    /* 生成所有可能的牌 */
    let candidates = [];
    const suits = ['m', 'p', 's', 'z'];
    for (const s of suits) {
        const maxN = s === 'z' ? 7 : 9;
        for (let n = 1; n <= maxN; n++) {
            /* 红5 等价于 5，加一种表示 */
            if (n === 5 && s !== 'z') {
                candidates.push(s + '0');
            }
            candidates.push(s + n);
        }
    }

    /* 花色过滤 */
    candidates = candidates.filter(p => matchSuits(p, suitFilter));

    /* 点数过滤 */
    candidates = candidates.filter(p => matchNumbers(p, numberFilter));

    /* 听牌过滤：仅保留能让手牌和牌的候选 */
    if (onlyTingpai && typeof tingpaiFn === 'function') {
        candidates = candidates.filter(p => tingpaiFn(shoupai, p));
    }

    return candidates;
}

/* ================================================================
 * 和牌牌覆盖
 * ================================================================ */

/**
 * 用指定牌覆盖当前手牌的"和牌牌"。
 * 将 shoupai._zimo（自摸时即和牌牌）替换为 chosenPai。
 *
 * @param {Object} shoupai   — Majiang.Shoupai 实例
 * @param {string} chosenPai — 替换成的牌，如 'm1'、's5'
 */
function override(shoupai, chosenPai) {
    if (!shoupai._zimo || shoupai._zimo.length > 2) {
        /* 没有摸牌状态的牌可替换（荣和场景由外部将 chosenPai 加入手牌再判定） */
        return;
    }

    const currentZimo = shoupai._zimo;

    /* 移除当前和牌牌 */
    shoupai.decrease(currentZimo[0], +currentZimo[1]);

    /* 添加新牌 */
    shoupai.zimo(chosenPai, false);
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    getCandidates,
    override,
};
