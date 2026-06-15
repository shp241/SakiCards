/**
 * 超能力麻将 — 效果原子模块
 *
 * 将通用操作封装为可复用的效果组件，供 SKILL_EXECUTE_MAP 直接调用。
 */
'use strict';

module.exports = {
    tileUtils:              require('./tile-utils'),
    tileOps:                require('./tile-ops'),
    pointPayment:           require('./point-payment'),
    hanOps:                 require('./han-ops'),
    fanModifier:            require('./fan-modifier'),
    actionCanceller:        require('./action-canceller'),
    doraOps:                require('./dora-ops'),
    WinTileOverrider:       require('./win-tile-overrider'),
};
