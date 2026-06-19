/**
 * 超能力麻将 - 技能类型与效果原子定义
 */
'use strict';

/* ========== 技能类型 ========== */

const SkillType = {
    /** 被动技能：持续生效，无需玩家操作 */
    PASSIVE:    'passive',

    /** 主动技能：玩家在特定时点手动选择发动 */
    ACTIVE:     'active',

    /** 条件触发：满足条件时自动弹出，需要玩家确认 */
    CONDITIONAL: 'conditional',
};

/* ========== 使用次数类型 ========== */

const UsageType = {
    /** 每巡目限一次 */
    ONCE_PER_TURN:     'once_per_turn',

    /** 每局限一次 */
    ONCE_PER_HAND:     'once_per_hand',

    /** 每半庄限一次 */
    ONCE_PER_GAME:     'once_per_game',

    /** 每排牌河限一次 */
    PER_RIVER_ROW:     'per_river_row',

    /** 每局每项限一次 */
    ONCE_PER_ITEM:     'once_per_item',

    /** 对每名角色限N次 */
    PER_PLAYER:        'per_player',

    /** 不限次数 */
    UNLIMITED:         'unlimited',

    /** AI 每巡限一次，人类可无限次发动（主要用于 BEFORE_DISCARD 技能） */
    AI_ONCE_PER_TURN:  'ai_once_per_turn',

    /** 自定义 */
    CUSTOM:            'custom',
};

/* ========== 效果原子类型 ========== */

const EffectType = {
    /* --- 摸牌/舍牌 --- */
    /** 额外巡目 */
    EXTRA_TURN:              'extra_turn',
    /** 从牌河摸牌 */
    DRAW_FROM_RIVER:         'draw_from_river',
    /** 从牌山顶摸牌 */
    DRAW_FROM_WALL_TOP:      'draw_from_wall_top',
    /** 从王牌区摸牌 */
    DRAW_FROM_DEADWALL:      'draw_from_deadwall',
    /** 交换牌（手牌↔牌河/牌山/预备区） */
    SWAP_TILES:              'swap_tiles',
    /** 暗切（倒置舍牌，不能被副露/荣和） */
    HIDDEN_DISCARD:          'hidden_discard',

    /* --- 副露修改 --- */
    /** 修改副露规则（任意家吃、最高优先级等） */
    MODIFY_FULOU_RULE:       'modify_fulou_rule',
    /** 从历史牌河副露 */
    FULOU_FROM_RIVER:        'fulou_from_river',

    /* --- 和了修改 --- */
    /** 修改和了条件（0番起和、地狱听牌等） */
    MODIFY_HULE_CONDITION:   'modify_hule_condition',
    /** 修改听牌范围（特殊牌视为和了牌） */
    VIEW_AS_WIN_TILE:        'view_as_win_tile',
    /** 无视振听 */
    IGNORE_FURITEN:          'ignore_furiten',

    /* --- 得分修改 --- */
    /** 追加番（奖励番，不能起和） */
    ADD_FAN:                 'add_fan',
    /** 打点倍率 */
    MULTIPLY_SCORE:          'multiply_score',
    /** 修改役种价值（平和2番等） */
    MODIFY_YAKU_VALUE:       'modify_yaku_value',
    /** 视为X番役（起和番） */
    VIEW_AS_YAKU:            'view_as_yaku',

    /* --- 牌可见性 --- */
    /** 观看牌山 */
    PEEK_WALL:               'peek_wall',
    /** 观看宝牌指示牌 */
    PEEK_DORA:               'peek_dora',
    /** 公开手牌/牌河 */
    REVEAL_TILES:            'reveal_tiles',
    /** 暗置手牌/牌河 */
    HIDE_TILES:              'hide_tiles',

    /* --- 宝牌修改 --- */
    /** 增加/开启宝牌指示牌 */
    ADD_DORA_INDICATOR:      'add_dora_indicator',
    /** 修改宝牌规则（双向指示等） */
    MODIFY_DORA_RULE:        'modify_dora_rule',
    /** 移除宝牌指示牌 */
    REMOVE_DORA_INDICATOR:   'remove_dora_indicator',

    /* --- 对手限制 --- */
    /** 限制副露/荣和（番缚、完全封锁等） */
    RESTRICT_OPPONENT:       'restrict_opponent',
    /** 取消对手动作 */
    CANCEL_ACTION:           'cancel_action',
    /** 禁止宣言和牌 */
    FORBID_HULE:             'forbid_hule',

    /* --- 牌转换 --- */
    /** 牌转换（风牌→西等） */
    TRANSFORM_TILE:          'transform_tile',
    /** 顺子头尾相连 */
    CIRCULAR_SHUNTSU:        'circular_shuntsu',

    /* --- 特殊 --- */
    /** 支付/收取场供 */
    PAY_FIELD:               'pay_field',
    /** 封印技能 */
    SEAL_SKILL:              'seal_skill',
    /** 角色牌区域操作 */
    ZONE_OPERATE:            'zone_operate',
    /** 决斗 */
    DUEL:                    'duel',
    /** 踢球（爱宕绢惠） */
    KICK_BALL:               'kick_ball',
    /** 补花/拔北 */
    NUKE_DORA:               'nuke_dora',
    /** 决斗 */
    CHALLENGE:               'challenge',
    /** 固定面子 */
    LOCK_MENTSU:             'lock_mentsu',
};

/* ========== 区域可见性 ========== */

const ZoneVisibility = {
    /** 全公开 */
    PUBLIC:    'public',
    /** 仅自己可查看 */
    PRIVATE:   'private',
    /** 自己也不可查看（如梅根暗置） */
    HIDDEN:    'hidden',
    /** 暗置但可舍出/副露 */
    FACE_DOWN: 'face_down',
};

/* ========== 角色分配模式 ========== */

const AssignmentMode = {
    /** 抽4选1 */
    DRAW_4:  'draw4',
    /** 抽2选1 */
    DRAW_2:  'draw2',
    /** 轮抽 */
    DRAFT:   'draft',
    /** 随机分配 */
    RANDOM:  'random',
    /** 自由选择 */
    FREE:    'free',
};

module.exports = {
    SkillType,
    UsageType,
    EffectType,
    ZoneVisibility,
    AssignmentMode,
};
