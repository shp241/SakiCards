/**
 * 点数操作模块 (point-payment)
 *
 * 玩家间点数转移、场供（立直棒）操作、和牌点数分配修改。
 * 纯原子操作，不涉及 UI 或 AI 逻辑。
 *
 * 玩家间转移：
 *   transfer(model, fromSeat, toSeat, amount)    — 玩家间直接转移点数
 *
 * 场供（立直棒）：
 *   payToPool(model, seat, amount)               — 支付点数到场供
 *   collectFromPool(model, seat, amount)          — 从场供收取点数
 *   getPoolAmount(model)                          — 获取场供总点数
 *
 * 和牌点数分配：
 *   modifyPayment(fenpei, fromSeat, toSeat, amount) — 修改 fenpei 分配
 *   multiplyPayment(fenpei, seat, multiplier)       — 对某方点数翻倍
 *   redirectPayment(fenpei, fromSeat, toSeat)       — 将某方支付重定向
 */
'use strict';

/* ================================================================
 * 玩家间转移
 * ================================================================ */

/**
 * 从一名玩家转移点数给另一名玩家。
 *
 * @param {Object} model    — Game._model
 * @param {number} fromSeat — 支付方席位 (0-3)
 * @param {number} toSeat   — 接收方席位 (0-3)
 * @param {number} amount   — 点数（正数）
 */
function transfer(model, fromSeat, toSeat, amount) {
    if (amount <= 0) return;
    const fromPlIdx = model.seatToPlIdx[fromSeat];
    const toPlIdx = model.seatToPlIdx[toSeat];
    model.defen[fromPlIdx] -= amount;
    model.defen[toPlIdx] += amount;
}

/* ================================================================
 * 场供（立直棒池）
 * ================================================================ */

/**
 * 支付点数到场供（立直棒池）。
 * 每 1000 点 = 1 根立直棒。
 *
 * @param {Object} model  — Game._model
 * @param {number} seat   — 支付方席位
 * @param {number} amount — 点数（通常为 1000 的整数倍）
 */
function payToPool(model, seat, amount) {
    if (amount <= 0) return;
    const plIdx = model.seatToPlIdx[seat];
    model.defen[plIdx] -= amount;
    model.lizhibang += Math.floor(amount / 1000);
}

/**
 * 从场供收取点数。
 *
 * @param {Object} model  — Game._model
 * @param {number} seat   — 收取方席位
 * @param {number} amount — 点数
 */
function collectFromPool(model, seat, amount) {
    if (amount <= 0) return;
    const plIdx = model.seatToPlIdx[seat];
    const sticks = Math.floor(amount / 1000);
    const actualSticks = Math.min(sticks, model.lizhibang);
    model.lizhibang -= actualSticks;
    model.defen[plIdx] += actualSticks * 1000;
}

/**
 * 获取场供总点数。
 *
 * @param {Object} model — Game._model
 * @returns {number} 场供总点数（立直棒根数 × 1000）
 */
function getPoolAmount(model) {
    return model.lizhibang * 1000;
}

/* ================================================================
 * 和牌点数分配修改
 *
 * fenpei 格式：[东, 南, 西, 北]，按 seat 索引
 *   自摸: 赢家 +正，其他三家各 -负
 *   荣和: 输家 -负，赢家 +正
 * ================================================================ */

/**
 * 修改点数分配：从一方扣减，给另一方增加。
 *
 * @param {number[]} fenpei   — 当前分配数组 [东, 南, 西, 北]（按 seat 索引）
 * @param {number}   fromSeat — 扣减方席位
 * @param {number}   toSeat   — 增加方席位
 * @param {number}   amount   — 转移点数
 */
function modifyPayment(fenpei, fromSeat, toSeat, amount) {
    if (amount <= 0) return;
    fenpei[fromSeat] -= amount;
    fenpei[toSeat] += amount;
}

/**
 * 对某方的收支翻倍。
 *
 * @param {number[]} fenpei     — 当前分配数组
 * @param {number}   seat       — 目标席位
 * @param {number}   multiplier — 倍数（如 2 = 翻倍，0.5 = 减半）
 */
function multiplyPayment(fenpei, seat, multiplier) {
    let val = fenpei[seat] * multiplier;
    let absVal = Math.abs(val);
    let rounded = Math.floor(absVal / 100) * 100;
    fenpei[seat] = val >= 0 ? rounded : -rounded;
}

/**
 * 将某方的支付重定向到另一方。
 * 例如：B 本应支付给 A，重定向为 C 支付给 A。
 *
 * @param {number[]} fenpei   — 当前分配数组
 * @param {number}   fromSeat — 原支付方
 * @param {number}   toSeat   — 新支付方
 */
function redirectPayment(fenpei, fromSeat, toSeat) {
    if (fenpei[fromSeat] >= 0) return; /* 不是支付方 */
    const amount = -fenpei[fromSeat];
    fenpei[fromSeat] = 0;
    fenpei[toSeat] -= amount;
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    transfer,
    payToPool,
    collectFromPool,
    getPoolAmount,
    modifyPayment,
    multiplyPayment,
    redirectPayment,
};
