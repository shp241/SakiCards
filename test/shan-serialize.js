/**
 * 牌山序列化工具
 * 
 * 将 Shan 实例的完整内部状态序列化为 JSON，并支持反序列化恢复。
 * 用于牌谱记录和场况还原。
 */

'use strict';

/**
 * 序列化牌山为 JSON-safe 对象
 * @param {Shan} shan - Shan 实例
 * @returns {Object}
 */
function serializeShan(shan) {
    return {
        stacks: shan._stacks.map(s => ({ top: s.top, bottom: s.bottom })),
        cursor: shan._cursor,
        break: shan._break,
        haitei: shan._haitei,
        dw_count: shan._dw_count,
        dora_start: shan._dora_start,
        dora_flipped: shan._dora_flipped,
        rinshan_drawn: shan._rinshan_drawn,
        replenished: shan._replenished,
        weikaigang: shan._weikaigang,
        half_consumed: shan._half_consumed,
        closed: shan._closed,
        baopai: (shan._baopai || []).slice(),
        fubaopai: shan._fubaopai ? shan._fubaopai.slice() : null,
    };
}

/**
 * 反序列化恢复牌山状态
 * @param {Shan} shan - 已构造的 Shan 实例
 * @param {Object} data - serializeShan 的输出
 */
function deserializeShan(shan, data) {
    shan._stacks = data.stacks.map(s => ({ top: s.top, bottom: s.bottom }));
    shan._cursor = data.cursor;
    shan._break = data.break;
    shan._haitei = data.haitei;
    shan._dw_count = data.dw_count;
    shan._dora_start = data.dora_start;
    shan._dora_flipped = data.dora_flipped;
    shan._rinshan_drawn = data.rinshan_drawn;
    shan._replenished = data.replenished;
    shan._weikaigang = data.weikaigang;
    shan._half_consumed = data.half_consumed;
    shan._closed = data.closed;
    shan._baopai = (data.baopai || []).slice();
    shan._fubaopai = data.fubaopai ? data.fubaopai.slice() : [];
}

/**
 * 从序列化数据创建一个新的 Shan（绕过构造函数中的洗牌）
 * @param {Object} rule - 麻将规则
 * @param {Object} data - serializeShan 的输出
 * @returns {Shan}
 */
function createShanFromData(rule, data) {
    const Majiang = require('../src/core/index');
    let shan = new Majiang.Shan(rule);
    deserializeShan(shan, data);
    /* 重置关闭状态（回放时牌山必须是开放的） */
    if (shan._closed) shan._closed = false;
    /* 重置开杠状态 */
    if (shan._weikaigang) shan._weikaigang = false;
    /* 重置岭上摸牌计数 */
    if (shan._rinshan_drawn > 0) shan._rinshan_drawn = 0;
    /* 重置宝牌翻转计数（replay 时会通过 kaigang 操作重新设置） */
    /* 重置半消耗状态 */
    if (shan._half_consumed) shan._half_consumed = false;
    return shan;
}

module.exports = { serializeShan, deserializeShan, createShanFromData };
