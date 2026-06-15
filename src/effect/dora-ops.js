/**
 * 宝牌操作模块 (dora-ops)
 *
 * 额外翻开宝牌指示牌、获取额外宝牌/里宝牌指示牌（用于和牌计算时多计入宝牌）。
 * 纯原子操作，不涉及 UI 或 AI 逻辑。
 *
 * 翻开操作：
 *   flipExtraDora(model, count)              — 额外翻开表宝牌指示牌
 *   getFlippedDoraCount(model)               — 获取已翻开的宝牌指示牌张数
 *
 * 额外宝牌指示牌（用于和牌计算）：
 *   getExtraDoraIndicators(model, count)     — 偷看即将翻开的宝牌指示牌（用于提前计入）
 *   getExtraUraDoraIndicators(model, count)  — 偷看即将翻开的里宝牌（用于提前计入）
 *
 * 使用方式（技能在和牌计算时额外计入宝牌）：
 *   let extra = getExtraDoraIndicators(model, 2);        // 偷看后 2 张表宝牌
 *   let param = { baopai: model.shan.baopai.concat(extra), ... };
 *   let result = Majiang.Util.hule(shoupai, rongpai, param);
 */
'use strict';

/* ================================================================
 * 额外翻开表宝牌
 * ================================================================ */

/**
 * 额外翻开表宝牌指示牌。
 * 调用 shan.kaigang()，每翻一张消耗一次"杠宝牌"机会。
 * 最多 5 张（含初始），超出部分无效果。
 *
 * @param {Object} model — Game._model
 * @param {number} count — 要额外翻开的张数
 * @returns {number} 实际翻开的张数
 */
function flipExtraDora(model, count) {
    const shan = model.shan;
    let flipped = 0;
    const maxDora = 5;
    for (let i = 0; i < count; i++) {
        if (shan._baopai.filter(x => x).length >= maxDora) break;
        shan.kaigang();
        flipped++;
    }
    return flipped;
}

/**
 * 获取已翻开的宝牌指示牌张数。
 *
 * @param {Object} model — Game._model
 * @returns {number} 已翻开的有效宝牌指示牌张数
 */
function getFlippedDoraCount(model) {
    return model.shan._baopai.filter(x => x).length;
}

/* ================================================================
 * 额外宝牌指示牌（偷看未翻开的，用于和牌计算时提前计入）
 * ================================================================ */

/**
 * 偷看即将翻开的表宝牌指示牌。
 * 从王牌墩上层读取尚未翻开的宝牌指示牌，用于计算额外宝牌。
 *
 * @param {Object} model — Game._model
 * @param {number} count — 要偷看的张数
 * @returns {string[]} 额外宝牌指示牌（已转换，可直接用 doraOf 获取实际宝牌）
 */
function getExtraDoraIndicators(model, count) {
    const shan = model.shan;
    const results = [];
    if (count <= 0) return results;

    /* dora_order: 宝2(n=3), 宝3(n=2), 宝4(n=1), 宝5(n=0) */
    /* 已翻开的 = _dora_flipped 张（含宝1）。未翻开的从 n = 4 - _dora_flipped 开始 */
    const firstUnflippedN = 4 - shan._dora_flipped;
    for (let ni = firstUnflippedN; ni >= 0 && results.length < count; ni--) {
        const idx = shan._dead_wall_stack(ni);
        const tile = shan._stacks[idx].top;
        if (tile != null) {
            results.push(tile);
        }
    }

    return results;
}

/**
 * 偷看即将翻开的里宝牌。
 * 从王牌墩下层读取尚未翻开的里宝牌，用于计算额外里宝牌。
 * 里宝牌仅在立直玩家和牌时生效，未翻开的里宝牌通常不可见。
 *
 * @param {Object} model — Game._model
 * @param {number} count — 要偷看的张数
 * @returns {string[]} 额外里宝牌指示牌
 */
function getExtraUraDoraIndicators(model, count) {
    const shan = model.shan;
    const results = [];
    if (count <= 0) return results;

    /* 已翻开的里宝牌 = shan._fubaopai（若未关闭则为 null） */
    const revealedCount = shan._fubaopai ? shan._fubaopai.filter(x => x).length : 0;

    /* 未翻开的从 revealedCount 位置开始 */
    const firstUnrevealedN = 4 - revealedCount;
    for (let ni = firstUnrevealedN; ni >= 0 && results.length < count; ni--) {
        const idx = shan._dead_wall_stack(ni);
        const tile = shan._stacks[idx].bottom;
        if (tile != null) {
            results.push(tile);
        }
    }

    return results;
}

/**
 * 获取全部里宝牌指示牌（含已公开和未翻开的）。
 *
 * @param {Object} model — Game._model
 * @returns {string[]} 所有里宝牌指示牌
 */
function getAllUraDoraIndicators(model) {
    return getExtraUraDoraIndicators(model, 5);
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    flipExtraDora,
    getFlippedDoraCount,
    getExtraDoraIndicators,
    getExtraUraDoraIndicators,
    getAllUraDoraIndicators,
};
