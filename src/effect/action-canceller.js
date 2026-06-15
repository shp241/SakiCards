/**
 * 行动取消模块 (action-canceller)
 *
 * 取消他人副露（吃/碰/杠）或荣和声明。
 * 纯原子操作，不涉及 UI 或 AI 逻辑。
 *
 * 副露取消：
 *   cancelLastFulou(model, seat) — 撤销指定玩家的最后一次副露
 *
 * 荣和取消/阻止：
 *   cancelRon(model, seat)       — 将指定玩家移出荣和队列
 *   blockRon(model, seat)        — 阻止指定玩家荣和（本巡）
 *
 * 副露阻止：
 *   blockFulou(model, seat)      — 阻止指定玩家副露（本巡）
 */
'use strict';

/* ================================================================
 * 副露取消
 * ================================================================ */

/**
 * 撤销指定玩家的最后一次副露。
 * 从 _fulou 中移除最后一项，将牌归还手牌，清除 _zimo。
 *
 * 注意：此操作不恢复牌河状态（被鸣牌的 +-= 标记），
 * 调用方需自行处理 UI 同步和日志。
 *
 * @param {Object} model — Game._model
 * @param {number} seat  — 副露玩家席位
 * @returns {string|null} 被取消的副露 mianzi 字符串，无副露时返回 null
 */
function cancelLastFulou(model, seat) {
    const shoupai = model.shoupai[seat];
    if (!shoupai._fulou || shoupai._fulou.length === 0) return null;

    const mianzi = shoupai._fulou.pop();
    const s = mianzi[0];

    /* 解析 mianzi 中的牌数字，归还手牌 */
    const digits = mianzi.match(/\d/g);
    if (digits) {
        for (const d of digits) {
            shoupai._bingpai[s] = shoupai._bingpai[s] || [];
            shoupai._bingpai[s][+d] = (shoupai._bingpai[s][+d] || 0) + 1;
        }
    }

    /* 清除 _zimo（副露后设置为 mianzi 以启用喰い替え检查） */
    if (shoupai._zimo === mianzi) {
        shoupai._zimo = null;
    }

    return mianzi;
}

/* ================================================================
 * 荣和取消 / 阻止
 * ================================================================ */

/**
 * 将指定玩家移出荣和队列。
 * 在 game._hule 数组中移除该 seat。
 *
 * @param {Object} model  — Game._model（或包含 _hule 数组的上下文）
 * @param {number} seat   — 要移出的玩家席位
 * @param {Array}  [huleQueue] — 荣和队列引用（game._hule），若 model 不具备此属性则传入
 * @returns {boolean} 是否成功移除
 */
function cancelRon(model, seat, huleQueue) {
    const queue = huleQueue || model._hule;
    if (!queue) return false;
    const idx = queue.indexOf(seat);
    if (idx >= 0) {
        queue.splice(idx, 1);
        return true;
    }
    return false;
}

/**
 * 阻止指定玩家本巡荣和。
 * 将 model._neng_rong[seat] 设为 false。
 *
 * @param {Object} model — Game._model
 * @param {number} seat  — 要阻止的玩家席位
 */
function blockRon(model, seat) {
    if (model._neng_rong) {
        model._neng_rong[seat] = false;
    }
}

/* ================================================================
 * 副露阻止
 * ================================================================ */

/**
 * 阻止指定玩家本巡副露。
 * 通常由技能在 ASK_FULOU 时点调用，使目标玩家无法鸣牌。
 *
 * 本函数通过设置标记实现，调用方需在实际副露判断时检查此标记。
 *
 * @param {Object} model  — Game._model
 * @param {number} seat   — 要阻止的玩家席位
 * @param {Object} [blockMap] — 阻止标记存储位置（若 model 无 _block_fulou）
 */
function blockFulou(model, seat, blockMap) {
    const map = blockMap || model._block_fulou;
    if (map) {
        map[seat] = true;
    }
    /* 若 model 无 _block_fulou，初始化 */
    if (!model._block_fulou && !blockMap) {
        model._block_fulou = {};
        model._block_fulou[seat] = true;
    }
}

/**
 * 检查指定玩家是否被阻止副露。
 *
 * @param {Object} model — Game._model
 * @param {number} seat  — 要检查的席位
 * @returns {boolean}
 */
function isFulouBlocked(model, seat) {
    if (model._block_fulou && model._block_fulou[seat]) return true;
    return false;
}

/**
 * 清除本巡所有副露阻止标记。
 *
 * @param {Object} model — Game._model
 */
function clearFulouBlocks(model) {
    if (model._block_fulou) {
        model._block_fulou = {};
    }
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    cancelLastFulou,
    cancelRon,
    blockRon,
    blockFulou,
    isFulouBlocked,
    clearFulouBlocks,
};
