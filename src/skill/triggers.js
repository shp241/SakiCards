/**
 * 超能力麻将 - 技能触发时机定义
 *
 * 16 个主动时点 + 巡目上下文标记
 * 巡目入口统一为 ①摸牌前（BEFORE_DRAW），由 context.turnType 区分巡目类型。
 */
'use strict';

/* ========== 16 个技能发动时点 ========== */

const TimingPoints = {
    /* ===== 巡目内（入口统一为 BEFORE_DRAW）===== */

    /** ① 摸牌前 — 回合最早时点，可放弃摸牌 */
    BEFORE_DRAW:          'before_draw',

    /** ② 摸牌时 — 确定摸牌来源（牌山/岭上/牌河/他家），即将摸还没摸 */
    DRAW_SOURCE:          'draw_source',

    /** ③ 舍牌前 — 最自由时点，类比三国杀出牌阶段空闲时点。可选择暗杠/加杠/立直/舍牌 */
    BEFORE_DISCARD:       'before_discard',

    /** ④ 舍牌时 — 确定舍出哪张牌，还未打出 */
    DISCARD_SELECTED:     'discard_selected',

    /* ===== 鸣牌阶段 ===== */

    /** ⑤ 询问副露时 — 向所有其他玩家依次询问是否鸣牌/荣和，各自选择（暂不结算） */
    ASK_FULOU:            'ask_fulou',

    /** ⑥ 宣言副露时 — 按优先级确定成功鸣牌者后，技能在此结算。可被取消（取消→⑧） */
    DECLARE_FULOU:        'declare_fulou',

    /** ⑦ 副露时 — 摆出牌+拿走他家牌后。碰→正常巡目③，大明杠→杠巡目① */
    AFTER_FULOU:          'after_fulou',

    /* ===== 舍牌成功 ===== */

    /** ⑧ 舍牌后 — 成功舍牌且未被吃碰杠荣和。巡目结束，额外巡触发点 */
    AFTER_DISCARD:        'after_discard',

    /* ===== 杠 ===== */

    /** ⑨ 开杠后 — 暗杠/加杠/大明杠摸完岭上牌之后，翻开杠宝牌之前 */
    AFTER_KAN:            'after_kan',

    /* ===== 立直 ===== */

    /** ⑩ 宣言立直时 — 宣言立直意图，在④舍牌时之前 */
    DECLARE_RIICHI:       'declare_riichi',

    /* ===== 和牌 ===== */

    /** ⑩½ 检查和牌资格时 — 在 allow_hule() 判定阶段，技能可扩展可和牌范围 */
    CHECK_HULE:           'check_hule',

    /** ⑩¾ 检查听牌资格时 — 在 pingju() 判定阶段，技能可扩展听牌范围 */
    CHECK_TENPAI:         'check_tenpai',

    /** ⑩⅞ 检查碰牌资格时 — 在 get_peng_mianzi() 判定阶段，技能可扩展碰牌范围 */
    CHECK_PON:            'check_pon',

    /** ⑩⅞ 检查杠牌资格时 — 在 get_gang_mianzi() 判定阶段，技能可扩展杠牌范围 */
    CHECK_KAN:            'check_kan',

    /** ⑩⅞ 检查吃牌资格时 — 在 get_chi_mianzi() 判定阶段，技能可扩展吃牌范围 */
    CHECK_CHI:            'check_chi',

    /** ⑪ 宣言和牌时 — 有人宣言荣和/自摸，还未结算 */
    DECLARE_HULE:         'declare_hule',

    /** ⑫ 和牌时 — 进入结算，计算分数前。和牌者技能先发动，再轮到放铳者 */
    HULE_SETTLE:          'hule_settle',

    /** ⑫½ 和牌点数重算后 — 番数修改已反映到点数，点数修改（如铳点减半）在此触发 */
    FENPEI_CALCULATED:    'fenpei_calculated',

    /** ⑬ 和牌后 — 计算分数并完成支付后 */
    AFTER_HULE:           'after_hule',

    /* ===== 流局 ===== */

    /** ⑭ 流局时 — 流局结算前 */
    RYUUKYOKU:            'ryuukyoku',

    /* ===== 特殊 ===== */

    /** ⑮ 被飞时 — 需支付分数 > 持有分数时 */
    ON_TOBISARU:          'on_tobisaru',

    /** ⑯ 牌被取走/交换时 — 牌被超能力从牌河/手牌移走时，受影响玩家在此触发技能 */
    TILE_TAKEN:           'tile_taken',

    /* ===== 被动常驻 ===== */

    /** 持续生效的被动技能（不是时点，是技能类型标记） */
    CONTINUOUS:            'continuous',
};

/* ========== 巡目类型 ========== */

const TurnType = {
    /** 正常巡目：入口 ①摸牌前（牌山摸牌） */
    NORMAL: 'normal',

    /** 副露巡目：入口 ①摸牌前（碰/吃后，从③舍牌前开始，跳过①②） */
    FULOU:  'fulou',

    /** 杠巡目：入口 ①摸牌前（岭上牌） */
    KAN:    'kan',
};

/* ========== 时点显示名称（用于UI提示） ========== */

const TimingLabels = {
    [TimingPoints.BEFORE_DRAW]:           '摸牌前',
    [TimingPoints.DRAW_SOURCE]:           '摸牌时',
    [TimingPoints.BEFORE_DISCARD]:        '舍牌前',
    [TimingPoints.DISCARD_SELECTED]:      '舍牌时',
    [TimingPoints.ASK_FULOU]:             '询问副露时',
    [TimingPoints.DECLARE_FULOU]:         '宣言副露时',
    [TimingPoints.AFTER_FULOU]:           '副露时',
    [TimingPoints.AFTER_DISCARD]:         '舍牌后',
    [TimingPoints.AFTER_KAN]:             '开杠后',
    [TimingPoints.DECLARE_RIICHI]:        '宣言立直时',
    [TimingPoints.CHECK_HULE]:            '检查和牌资格时',
    [TimingPoints.CHECK_TENPAI]:          '检查听牌资格时',
    [TimingPoints.CHECK_PON]:             '检查碰牌资格时',
    [TimingPoints.CHECK_KAN]:             '检查杠牌资格时',
    [TimingPoints.CHECK_CHI]:             '检查吃牌资格时',
    [TimingPoints.DECLARE_HULE]:          '宣言和牌时',
    [TimingPoints.HULE_SETTLE]:           '和牌时',
    [TimingPoints.FENPEI_CALCULATED]:     '和牌点数重算后',
    [TimingPoints.AFTER_HULE]:            '和牌后',
    [TimingPoints.RYUUKYOKU]:             '流局时',
    [TimingPoints.ON_TOBISARU]:           '被飞时',
    [TimingPoints.TILE_TAKEN]:            '牌被取走/交换时',
    [TimingPoints.CONTINUOUS]:            '持续生效',
};

module.exports = {
    TimingPoints,
    TurnType,
    TimingLabels,
};
