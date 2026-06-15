/**
 * 额外巡目通用组件 (Extra Turn)
 *
 * 技能通过此组件启动额外巡目，将次数作为参数传入。
 *
 * 使用方式：
 *   const extraTurn = require('./extra-turn');
 *   extraTurn.start(game, seat, count);
 */
'use strict';

module.exports = {
    /**
     * 启动额外巡目
     * @param {Object} game - Game 实例
     * @param {number} seat - 玩家席位（模型席位 0-3）
     * @param {number} count - 额外巡目次数
     */
    start(game, seat, count) {
        game._extra_chain_remaining = count - 1;
        game._extra_turn = { player: seat };
    },
};
