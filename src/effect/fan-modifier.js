/**
 * 番数修改通用组件 (fan-modifier)
 *
 * 对和牌计算结果进行番数/役种修改的声明式通用组件。
 * 在 HULE_SETTLE 时点使用，与 han-ops 配合完成"额外加番"和"视为役"。
 *
 * 分为两层：
 *   1. 查询层：独立的游戏状态查询函数（不依赖角色 ID）
 *   2. 规则层：FanRule 声明式规则 + evaluate 执行引擎
 *
 * 查询函数：
 *   countMelds(model, seat, type)     — 统计某类副露数量
 *   getMeldStats(model, seat)         — 获取副露统计 { chi, pon, kan, ankan, total }
 *   countHandTiles(shoupai, filter)   — 统计手牌中满足条件的牌数
 *   countRiverTiles(model, seat, filter) — 统计牌河中满足条件的牌数
 *   countZoneTiles(zoneManager, seat, zoneId, filter) — 统计角色牌区域中满足条件的牌数
 *   hasYakuInResult(hule, yakuName)   — 检查 hule 结果中是否已有某役种
 *
 * 规则引擎：
 *   FanRule({ name, type, condition, computeHan }) — 一条番数修改规则
 *     type: 'bonus'  — 追加额外番（不起和）
 *           'yaku'   — 视为 X 番役（可起和）
 *           'modify' — 修改已有役种番数
 *   evaluate(hule, seat, model, shoupai, rules) — 对一组规则求值并应用
 *   buildComputeContext(model, seat, shoupai)    — 构建预计算上下文
 */
'use strict';

const { TurnType } = require('../skill/triggers');
const hanOps = require('./han-ops');
const tileUtils = require('./tile-utils');

/* ================================================================
 * 一、查询层：游戏状态查询函数（纯函数，不依赖角色 ID）
 * ================================================================ */

/**
 * 统计某类副露的数量。
 *
 * @param {Object} model — game._model
 * @param {number} seat  — 席位 (0-3)
 * @param {string} type  — 'chi' | 'pon' | 'kan' | 'ankan' | 'daiminkan'
 * @returns {number}
 */
function countMelds(model, seat, type) {
    if (!model || !model.shoupai || !model.shoupai[seat]) return 0;
    let shoupai = model.shoupai[seat];
    let metas = shoupai.meldMetas;
    if (!metas || metas.length === 0) return 0;

    let count = 0;
    for (let meta of metas) {
        let meldType = meta.type;

        switch (type) {
            case 'chi':
                if (meldType === 'chi') count++;
                break;
            case 'pon':
                if (meldType === 'pon') count++;
                break;
            case 'kan':
                if (meldType === 'minkan' || meldType === 'ankan' || meldType === 'kakan') count++;
                break;
            case 'ankan':
                if (meldType === 'ankan') count++;
                break;
            case 'daiminkan':
                if (meldType === 'minkan') count++;
                break;
            default:
                break;
        }
    }
    return count;
}

/**
 * 获取副露统计信息。
 *
 * @param {Object} model — game._model
 * @param {number} seat  — 席位 (0-3)
 * @returns {{ chi: number, pon: number, kan: number, ankan: number, daiminkan: number, total: number }}
 */
function getMeldStats(model, seat) {
    let stats = { chi: 0, pon: 0, kan: 0, ankan: 0, daiminkan: 0, total: 0 };
    if (!model || !model.shoupai || !model.shoupai[seat]) return stats;
    let shoupai = model.shoupai[seat];
    let metas = shoupai.meldMetas;
    if (!metas || metas.length === 0) return stats;

    for (let meta of metas) {
        switch (meta.type) {
            case 'chi':
                stats.chi++;
                break;
            case 'pon':
                stats.pon++;
                break;
            case 'minkan':
                stats.kan++;
                stats.daiminkan++;
                break;
            case 'ankan':
                stats.kan++;
                stats.ankan++;
                break;
            case 'kakan':
                stats.kan++;
                stats.daiminkan++;
                break;
            default:
                break;
        }
        stats.total++;
    }
    return stats;
}

/**
 * 获取副露数（吃、碰、大明杠、加杠，排除暗杠）。
 * 等价于 getMeldStats().total - getMeldStats().ankan。
 *
 * @param {Object} model — game._model
 * @param {number} seat  — 席位 (0-3)
 * @returns {number}
 */
function getFulouCount(model, seat) {
    let stats = getMeldStats(model, seat);
    return stats.total - stats.ankan;
}

/**
 * 判断当前巡目是否为副露巡目（吃碰巡目 或 杠巡目中的大明杠）。
 *
 * 吃碰巡目（chipeng）和杠巡目（kan）中的大明杠均属于副露行为，
 * 暗杠和加杠不属于副露巡目。
 *
 * @param {Object} context — 技能上下文，需含 turnType 和 game
 * @returns {boolean}
 */
function isFulouTurn(context) {
    if (!context) return false;
    let turnType = context.turnType;
    if (turnType === TurnType.CHIPENG) return true;
    if (turnType === TurnType.KAN) {
        let game = context.game;
        if (game && game._kanType === 'daiminkan') return true;
    }
    return false;
}

/**
 * 统计手牌中满足条件的牌数。
 *
 * @param {Object} shoupai       — Majiang.Shoupai 实例
 * @param {Function} filter      — (paiStr) => boolean
 * @returns {number}
 */
function countHandTiles(shoupai, filter) {
    if (!shoupai) return 0;
    let count = 0;
    for (let s of ['m', 'p', 's', 'z']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        let maxN = s === 'z' ? 7 : 9;
        for (let n = 1; n <= maxN; n++) {
            let c = bp[n] || 0;
            /* 数牌5：bp[5] 已包含红5数量，需减去以避免后续 bp[0] 重复计数 */
            if (s !== 'z' && n === 5) c -= (bp[0] || 0);
            if (c > 0 && filter(s + n)) count += c;
        }
        /* 红5（_bingpai[s][0]），单独统计，不与 bp[5] 重复 */
        if (s !== 'z' && bp[0] && bp[0] > 0 && filter(s + '0')) {
            count += bp[0];
        }
    }
    return count;
}

/**
 * 统计牌河中满足条件的牌数。
 * 仅统计可见的牌（不含被副露的牌，不含方向后缀）。
 *
 * @param {Object} model   — game._model
 * @param {number} seat    — 席位 (0-3)
 * @param {Function} filter — (paiStr) => boolean，paiStr 不含方向后缀
 * @returns {number}
 */
function countRiverTiles(model, seat, filter) {
    if (!model || !model.he || !model.he[seat]) return 0;
    let he = model.he[seat];
    let count = 0;
    for (let t of he._pai) {
        // 跳过暗牌
        if (t === '_') continue;
        if (t.slice(-1) === '_') continue;
        let pai = t.length >= 2 ? t.slice(0, 2) : t;
        if (filter(pai)) count++;
    }
    return count;
}

/**
 * 统计角色牌区域中满足条件的牌数。
 *
 * @param {Object} zoneManager — SkillManager.getZoneManager()
 * @param {number} seat        — 席位 (0-3)
 * @param {string} zoneId      — 区域 ID（如 'choushi', 'mibi'）
 * @param {Function} filter    — (paiStr) => boolean
 * @returns {number}
 */
function countZoneTiles(zoneManager, seat, zoneId, filter) {
    if (!zoneManager) return 0;
    let zone = zoneManager.getZone(seat, zoneId);
    if (!zone) return 0;
    let tiles = zone.getTiles ? zone.getTiles() : [];
    let count = 0;
    for (let t of tiles) {
        if (filter(t)) count++;
    }
    return count;
}

/**
 * 检查 hule 结果中是否已有某役种。
 *
 * @param {Object} hule     — hule() 返回值
 * @param {string} yakuName — 役种名
 * @returns {boolean}
 */
function hasYakuInResult(hule, yakuName) {
    if (!hule || !hule.hupai) return false;
    return hule.hupai.some(y => y.name === yakuName);
}

/* ================================================================
 * 二、规则层：声明式番数修改规则
 * ================================================================ */

/**
 * 番数修改规则。
 *
 * @param {Object} opts
 * @param {string}   opts.name        — 番/役名称
 * @param {string}   opts.type        — 'bonus' | 'yaku' | 'modify'
 * @param {Function} opts.condition   — (ctx) => boolean，是否适用
 * @param {Function} opts.computeHan  — (ctx) => number，计算番数
 */
function FanRule(opts) {
    this.name = opts.name;
    this.type = opts.type;
    this.condition = opts.condition || (() => true);
    this.computeHan = opts.computeHan || (() => 0);
}

/**
 * 对一组 FanRule 求值并应用到 hule 结果。
 *
 * @param {Object}   hule    — hule() 返回值（就地修改）
 * @param {number}   seat    — 和牌家席位
 * @param {Object}   model   — game._model
 * @param {Object}   shoupai — 和牌家手牌
 * @param {FanRule[]} rules  — 规则数组
 * @returns {Object} 修改后的 hule 结果
 */
function evaluate(hule, seat, model, shoupai, rules) {
    if (!hule || !rules || rules.length === 0) return hule;

    let ctx = buildComputeContext(model, seat, shoupai);

    for (let rule of rules) {
        if (!rule.condition(ctx)) continue;

        let han = rule.computeHan(ctx);
        if (han <= 0) continue;

        switch (rule.type) {
            case 'bonus':
                hanOps.addHan(hule, han, rule.name);
                break;
            case 'yaku':
                hanOps.setYakuHan(hule, rule.name, han);
                break;
            case 'modify':
                if (hanOps.hasYaku(hule, rule.name)) {
                    hanOps.setYakuHan(hule, rule.name, han);
                }
                break;
            default:
                break;
        }
    }

    return hule;
}

/**
 * 构建预计算上下文（缓存 meldStats 等，避免重复计算）。
 *
 * @param {Object} model   — game._model
 * @param {number} seat    — 席位 (0-3)
 * @param {Object} shoupai — 手牌对象
 * @returns {Object} 上下文字典
 */
function buildComputeContext(model, seat, shoupai) {
    return {
        model,
        seat,
        shoupai,
        meldStats: getMeldStats(model, seat),
        // 便捷计数方法
        countHandTiles: (filter) => countHandTiles(shoupai, filter),
        countRiverTiles: (filter) => countRiverTiles(model, seat, filter),
    };
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    // 查询层
    countMelds,
    getMeldStats,
    getFulouCount,
    isFulouTurn,
    countHandTiles,
    countRiverTiles,
    countZoneTiles,
    hasYakuInResult,
    // 规则层
    FanRule,
    evaluate,
    buildComputeContext,
};
