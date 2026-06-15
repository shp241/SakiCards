/**
 * 番数 & 打点操作模块 (han-ops)
 *
 * 对和牌计算结果（Majiang.Util.hule() 的返回值）进行番数/打点修改。
 * 纯原子操作，不涉及 UI 或 AI 逻辑。
 *
 * hule 返回值结构：
 *   {
 *     hupai:  [{ name: '役名', fanshu: 番数, type: 'yaku'|'dora'|'bonus' }, ...],
 *     fu:     符数,
 *     fanshu: 总番数,
 *     defen:  打点（基本点）,
 *     fenpei: 点数分配 [东, 南, 西, 北],
 *     ...
 *   }
 *
 * hupai 条目 type 字段：
 *   'yaku'  — 有役番（标准役种 / yakuExpander 追加 / setYakuHan 创建，计入番缚）
 *   'dora'  — 宝牌（宝牌/红宝牌/里宝牌，不计入番缚）
 *   'bonus' — 无役奖励番（addHan 追加的技能番，不计入番缚）
 *
 * 番数操作：
 *   addHan(result, han, name)     — 添加通用加番（如技能番）
 *   setYakuHan(result, yakuName, han) — 设置指定役种的番数
 *   addYakuHan(result, yakuName, delta) — 增加指定役种的番数
 *   removeYaku(result, yakuName)  — 移除指定役种
 *   getTotalHan(result)           — 获取总番数（含技能番）
 *   hasYaku(result, yakuName)     — 检查是否有某役种
 *
 * 打点操作：
 *   multiplyDefen(result, multiplier)  — 打点翻倍
 *   multiplyFenpei(fenpei, multiplier) — 分配数组翻倍
 */
'use strict';

/* ================================================================
 * 番数操作
 * ================================================================ */

/**
 * 添加通用加番（如技能带来的额外番数）。
 *
 * @param {Object} result — hule() 返回值
 * @param {number} han    — 番数
 * @param {string} [name] — 番的名称（默认 '技能'）
 * @returns {Object} 修改后的 result（就地修改）
 */
function addHan(result, han, name) {
    if (han <= 0) return result;
    result.hupai.push({ name: name || '技能', fanshu: han, type: 'bonus' });
    result.fanshu += han;
    /* 简单重算打点：每番翻倍 */
    if (result.defen != null && result.defen > 0) {
        for (let i = 0; i < han; i++) {
            /* 满贯以上不翻 */
            if (result.defen < 2000) {
                result.defen = Math.min(result.defen * 2, 2000);
            }
        }
    }
    return result;
}

/**
 * 设置指定役种的番数。
 * 若役种不存在则新增。
 *
 * @param {Object} result   — hule() 返回值
 * @param {string} yakuName — 役种名（如 '立直'、'断幺九'）
 * @param {number} han      — 新番数
 * @returns {Object} result
 */
function setYakuHan(result, yakuName, han) {
    if (!result.hupai) result.hupai = [];
    if (result.fanshu == null) result.fanshu = 0;
    let found = false;
    for (let y of result.hupai) {
        if (y.name === yakuName) {
            result.fanshu = result.fanshu - y.fanshu + han;
            y.fanshu = han;
            y.type = 'yaku';
            found = true;
            break;
        }
    }
    if (!found) {
        result.hupai.push({ name: yakuName, fanshu: han, type: 'yaku' });
        result.fanshu += han;
    }
    return result;
}

/**
 * 增加指定役种的番数。
 *
 * @param {Object} result   — hule() 返回值
 * @param {string} yakuName — 役种名
 * @param {number} delta    — 增加量（可为负）
 * @returns {Object} result
 */
function addYakuHan(result, yakuName, delta) {
    for (let y of result.hupai) {
        if (y.name === yakuName) {
            y.fanshu += delta;
            result.fanshu += delta;
            if (y.fanshu <= 0) {
                result.hupai = result.hupai.filter(x => x.name !== yakuName || x.fanshu > 0);
            }
            break;
        }
    }
    return result;
}

/**
 * 移除指定役种。
 *
 * @param {Object} result   — hule() 返回值
 * @param {string} yakuName — 役种名
 * @returns {Object} result
 */
function removeYaku(result, yakuName) {
    for (let i = 0; i < result.hupai.length; i++) {
        if (result.hupai[i].name === yakuName) {
            result.fanshu -= result.hupai[i].fanshu;
            result.hupai.splice(i, 1);
            break;
        }
    }
    return result;
}

/* ================================================================
 * 查询
 * ================================================================ */

/**
 * 获取总番数。
 *
 * @param {Object} result — hule() 返回值
 * @returns {number} 总番数
 */
function getTotalHan(result) {
    return result.fanshu;
}

/**
 * 检查是否有某役种。
 *
 * @param {Object} result   — hule() 返回值
 * @param {string} yakuName — 役种名
 * @returns {boolean}
 */
function hasYaku(result, yakuName) {
    return result.hupai.some(y => y.name === yakuName);
}

/* ================================================================
 * 打点操作
 * ================================================================ */

/**
 * 打点（基本点）翻倍。
 * 适用于"原始打点增加倍数"场景。
 *
 * @param {Object} result     — hule() 返回值
 * @param {number} multiplier — 倍数
 * @returns {Object} result
 */
function multiplyDefen(result, multiplier) {
    if (result.defen != null) {
        result.defen = Math.floor(result.defen * multiplier);
    }
    return result;
}

/**
 * 分配数组翻倍。
 *
 * @param {number[]} fenpei     — 分配数组
 * @param {number}   multiplier — 倍数
 */
function multiplyFenpei(fenpei, multiplier) {
    for (let i = 0; i < fenpei.length; i++) {
        fenpei[i] = Math.floor(fenpei[i] * multiplier);
    }
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    addHan,
    setYakuHan,
    addYakuHan,
    removeYaku,
    getTotalHan,
    hasYaku,
    multiplyDefen,
    multiplyFenpei,
};
