/**
 * 超能力麻将 - 技能注册表
 * 将 characters_skills.js 的文本描述转化为可执行的技能对象
 * （当前为骨架，具体技能效果需要逐个角色实现后填充）
 */
'use strict';

const Majiang = require('@kobalab/majiang-core');
const tileOps = require('../effect/tile-ops');
const extraTurn = require('../effect/extra-turn');
const winTileOverrider = require('../effect/win-tile-overrider');
const hanOps = require('../effect/han-ops');
const fanModifier = require('../effect/fan-modifier');
const doraOps = require('../effect/dora-ops');
const tileUtils = require('../effect/tile-utils');
const pointPayment = require('../effect/point-payment');

const { SkillType, UsageType, EffectType } = require('./skill-types');
const { TimingPoints, TurnType } = require('./triggers');

/**
 * 从角色数据创建一个可执行的技能对象
 *
 * @param {Object} character - 来自 characters_skills.js 的角色数据
 * @param {number} skillIndex - 技能在 skills 数组中的索引
 * @param {string} skillDescription - 技能描述文本
 * @returns {Object} Skill 对象
 */
function createSkill(character, skillIndex, skillDescription) {

    let skill = {
        /* 基础标识 */
        id:             `${character.id}_skill_${skillIndex}`,
        characterId:    character.id,
        characterName:  character.name,
        index:          skillIndex,
        description:    skillDescription,

        /* 技能性质（由 SKILL_EXECUTE_MAP 显式定义，默认被动） */
        type:        SkillType.PASSIVE,

        /* 触发信息 */
        trigger: {
            timing:    TimingPoints.CONTINUOUS,   // 持续生效（不触发则不产生效果）
            priority:  100,                       // 默认优先级（越大越先结算）
            condition: null,                      // 额外条件函数（具体实现时填充）
        },

        /* 效果 */
        effect: {
            type:   EffectType.NONE,             // 默认为无效果（由 SKILL_EXECUTE_MAP 显式覆盖）
            params: {},
            execute: null,                        // 效果执行函数（具体实现时填充）
        },

        /* 使用限制 */
        usage: {
            type:    UsageType.UNLIMITED,
            max:     999,
            current: 0,                           // 已使用次数
        },

        /* 消耗 */
        cost: {
            fieldTribut: 0,
            points: 0,
        },

        /* 封印状态 */
        sealed: {
            currently: false,
            until:     null,
        },

        /* 运行时状态 */
        state: {
            activated:  false,
            removable:  false,
            data:       {},                        // 技能自定义数据
        },

        /* 是否可选（主动技能需要玩家确认） */
        isOptional: false,

        /* AI 决策函数（如果该玩家是 AI，调用此函数做决策） */
        aiDecision: null,
    };

    /* 加载具体技能效果实现（覆盖上述默认值） */
    _loadSkillExecute(character, skillIndex, skill);

    return skill;
}

/**
 * 加载具体技能效果实现
 * 根据角色ID和技能索引从 SKILL_EXECUTE_MAP 覆盖技能属性
 */
function _loadSkillExecute(character, skillIndex, skill) {
    let handlers = SKILL_EXECUTE_MAP[character.id];
    if (!handlers) return;
    let handler = handlers[skillIndex];
    if (handler) {
        if (handler.condition) skill.trigger.condition = handler.condition;
        if (handler.execute) skill.effect.execute = handler.execute;
        if (handler.priority) skill.trigger.priority = handler.priority;
        if (handler.timing) skill.trigger.timing = handler.timing;
        if (handler.effectType) skill.effect.type = handler.effectType;
        if (handler.usageType) skill.usage.type = handler.usageType;
        if (handler.usageMax !== undefined) skill.usage.max = handler.usageMax;
        if (handler.isOptional !== undefined) skill.isOptional = handler.isOptional;
        if (handler.type) skill.type = handler.type;
        if (handler.aiDecision) skill.aiDecision = handler.aiDecision;
        if (handler.huleExpander) skill.huleExpander = handler.huleExpander;
        if (handler.tenpaiExpander) skill.tenpaiExpander = handler.tenpaiExpander;
        if (handler.ponExpander) skill.ponExpander = handler.ponExpander;
        if (handler.kanExpander) skill.kanExpander = handler.kanExpander;
        if (handler.chiExpander) skill.chiExpander = handler.chiExpander;
        if (handler.yakuExpander) skill.yakuExpander = handler.yakuExpander;
        if (handler.huleRestrictor) skill.huleRestrictor = handler.huleRestrictor;
        if (handler.shouldAutoExecute) skill.shouldAutoExecute = handler.shouldAutoExecute;
        /* 多时点子技能（parts），如"检查荣和资格"+"宣言和牌时选牌" */
        if (handler.parts) skill.parts = handler.parts;
    }
}

/* ================================================================
 * 技能效果实现表 — SKILL_EXECUTE_MAP[角色ID][技能索引]
 * ================================================================ */

/**
 * 天江衣技能③辅助判定：场上是否有玩家立直（含自己）
 */
function _isKoromoSkill3Active(game, seat) {
    for (let l = 0; l < 4; l++) {
        if (game._lizhi[l]) return true;
    }
    return false;
}

/**
 * 从手牌中枚举所有牌（含重复），用于庄家首巡选择"摸牌"
 * @param {Object} shoupai — Majiang.Shoupai 实例
 * @returns {string[]} 手牌列表，如 ['m1', 'm1', 'p0', ...]
 */
function _getHandTiles(shoupai) {
    let tiles = [];
    for (let s of ['m', 'p', 's', 'z']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        let maxN = s === 'z' ? 7 : 9;
        for (let n = 1; n <= maxN; n++) {
            let count = bp[n] || 0;
            if (n === 5 && s !== 'z') count -= (bp[0] || 0);
            for (let c = 0; c < count; c++) {
                tiles.push(s + n);
            }
        }
        /* 红5（_bingpai[s][0]） */
        if (s !== 'z' && bp[0]) {
            for (let c = 0; c < bp[0]; c++) {
                tiles.push(s + '0');
            }
        }
    }
    return tiles;
}

/**
 * 评估单张牌的 AI 价值（用于 AI 决策）
 * 综合考虑：红宝牌、宝牌、役牌、数牌连携性
 * @param {string} pai - 牌名（如 'p0', 'm5', 'z1'）
 * @param {Object} game - Game 实例
 * @param {number} seat - 玩家席位
 * @returns {number} 价值分数
 */
function _evalTileValue(pai, game, seat) {
    if (!pai || pai.length < 2) return 0;
    let value = 0;
    let s = pai[0], n = pai[1];

    /* 红宝牌 */
    if (n === '0') value += 20;

    /* 宝牌 */
    let model = game._model;
    if (model && model.baopai) {
        for (let bp of model.baopai) {
            let dora = Majiang.Shan.zhenbaopai(bp);
            let cmp = s + (n === '0' ? '5' : n);
            if (cmp === dora) value += 15;
        }
    }

    /* 役牌 */
    if (s === 'z') {
        let num = +n;
        if (num >= 5 && num <= 7) value += 5;  // 三元牌
        // 场风/自风
        let zhuangfeng = model && model.zhuangfeng != null ? model.zhuangfeng : 0;
        let menfeng = seat != null ? seat : 0;
        if (num === zhuangfeng + 1) value += 3;
        if (num === menfeng + 1) value += 3;
    }

    /* 幺九牌 */
    if (s !== 'z' && (n === '1' || n === '9')) value -= 2;

    return value;
}

/**
 * 评估手牌中单张牌的相对价值（越低越应该被换掉）
 * 用于 AI 选择"手中最没有价值的牌"
 * @param {string} pai - 牌名
 * @param {Object} shoupai - 手牌对象
 * @param {Object} game - Game 实例
 * @param {number} seat - 玩家席位
 * @returns {number} 价值分数（越低越差）
 */
function _evalHandTileValue(pai, shoupai, game, seat) {
    let base = _evalTileValue(pai, game, seat);
    let s = pai[0], n = pai[1] === '0' ? 5 : +pai[1];

    /* 孤张惩罚：在手牌中没有同花色相邻牌 */
    if (s !== 'z') {
        let bp = shoupai._bingpai[s];
        if (bp) {
            let hasNeighbor = false;
            for (let dn = -2; dn <= 2; dn++) {
                let nn = n + dn;
                if (nn < 1 || nn > 9) continue;
                if (dn === 0) continue;
                if ((bp[nn] || 0) > 0) { hasNeighbor = true; break; }
            }
            if (!hasNeighbor) base -= 8;
        }
    }

    /* 对子/刻子保留加成 */
    if (s !== 'z') {
        let bp = shoupai._bingpai[s];
        if (bp && (bp[n] || 0) >= 2) base += 4;
        // 红5对子
        if (pai[1] === '0' && bp && (bp[0] || 0) >= 2) base += 4;
    } else {
        let bp = shoupai._bingpai['z'];
        if (bp && (bp[n] || 0) >= 2) base += 6;
    }

    return base;
}

/** 获取当前所有宝牌指示牌 */
function _getBaopai(model) {
    return (model && model.baopai) ? model.baopai : [];
}

/** 判断牌是否为宝牌 */
function _isTileDora(pai, baopaiArr) {
    if (!pai || !baopaiArr) return false;
    let s = pai[0], n = (pai[1] === '0') ? '5' : pai[1];
    for (let bp of baopaiArr) {
        if (s + n === Majiang.Shan.zhenbaopai(bp)) return true;
    }
    return false;
}

/**
 * 判断摸到 tile 后是否会被 AI 立刻打出（手摸切）
 * 
 * 逻辑：模拟摸牌 → 遍历所有可选弃牌 → 若弃掉刚摸的牌
 * 就能达到最佳向听数（且不能比原手牌更优），则牌会被立刻打出。
 * 
 * @param {Object} hand - 当前手牌（克隆）
 * @param {string} tile - 要摸入的牌
 * @param {Function} xiangtingFn - 向听数计算函数
 * @param {Function} getDapaiFn - 获取可选弃牌列表的函数
 * @returns {boolean} 是否会被立刻打出
 */
function _wouldDiscardImmediately(hand, tile, xiangtingFn, getDapaiFn) {
    if (!hand || !tile || !xiangtingFn || !getDapaiFn) return false;
    let origShanten = xiangtingFn(hand);
    let testHand = hand.clone();
    try { testHand.zimo(tile); } catch(e) { return false; }
    let dapaiList = getDapaiFn(testHand);
    if (!dapaiList || dapaiList.length === 0) return false;
    let bestAfterDiscard = Infinity;
    let tsumogiriShanten = Infinity;
    let canTsumogiri = false;
    let tileBase = tile.replace(/[_\*\+\=\-]$/, '');
    for (let d of dapaiList) {
        let discardHand = testHand.clone();
        let dBase = d.replace(/[_\*\+\=\-]$/, '');
        let isTsumogiri = d.endsWith('_');
        try { discardHand.decrease(dBase, isTsumogiri ? '+' : '_'); } catch(e) { continue; }
        let s = xiangtingFn(discardHand);
        if (s < bestAfterDiscard) bestAfterDiscard = s;
        if (isTsumogiri && dBase === tileBase) { tsumogiriShanten = s; canTsumogiri = true; }
    }
    /* 若任一弃牌能改善向听 → 牌有用，不弃 */
    if (bestAfterDiscard < origShanten) return false;
    /* 若能手摸切且能达到最佳向听 → 会被打出 */
    if (canTsumogiri && tsumogiriShanten <= bestAfterDiscard) return true;
    return false;
}

/**
 * 获取手牌基础牌数（不含自摸牌）
 * 用于判断裸单骑等牌姿
 * @param {Object} shoupai — Majiang.Shoupai 实例
 * @returns {number} 基础手牌数
 */
function _getBaseHandTileCount(shoupai) {
    let count = 0;
    for (let s of ['m', 'p', 's', 'z']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        let maxN = s === 'z' ? 7 : 9;
        for (let n = 1; n <= maxN; n++) {
            count += bp[n] || 0;
        }
        /* 注意：红5（n=0）会同时增加 bp[0] 和 bp[5]，
         * 上方循环已从 bp[5] 计入，此处不能再加 bp[0]，否则会重复计数 */
    }
    /* 扣除自摸牌（_bingpai 已计入 _zimo） */
    if (shoupai._zimo && shoupai._zimo.length >= 2) {
        count -= 1;
    }
    return count;
}

/**
 * 额外翻开里宝牌并计入 hule 结果。
 *
 * 流程：通过 doraOps.getExtraUraDoraIndicators() "偷看"王牌的里宝指示牌
 * → tileUtils.buildDoraSet() 把指示牌转为实际宝牌集合
 * → fanModifier.countHandTiles() 统计手牌中命中张数
 * → 将命中数追加到 hule.hupai 中的"里宝牌"条目（如无则新建）。
 *
 * 注意：getExtraUraDoraIndicators 返回的是宝牌"指示牌"（baopai），
 * 而非宝牌本身。例如指示牌 m1 对应的宝牌是 m2。
 *
 * @param {Object} hule   — hule() 返回值（就地修改）
 * @param {Object} model  — game._model
 * @param {Object} shoupai — 和牌家手牌
 * @param {number} count  — 要额外翻开的里宝牌张数
 */
function _addExtraUraDora(hule, model, shoupai, count) {
    if (count <= 0) return;
    /* 1. 偷看 count 张未翻开的里宝指示牌 */
    let extraIndicators = doraOps.getExtraUraDoraIndicators(model, count);
    if (!extraIndicators || extraIndicators.length === 0) return;

    /* 保存额外里宝指示牌到 hule，供 game.js 合并到 paipu.fubaopai 用于 UI 显示 */
    if (!hule._extraUraDoraIndicators) hule._extraUraDoraIndicators = [];
    hule._extraUraDoraIndicators.push(...extraIndicators);

    /* 2. 把指示牌转为实际宝牌集合（doraOf 逻辑） */
    let doraSet = tileUtils.buildDoraSet(extraIndicators);

    /* 3. 统计手牌中命中的宝牌数（红5 等同于 5） */
    let extraDoraCount = fanModifier.countHandTiles(shoupai, function(pai) {
        let normalized = (pai[1] === '0') ? pai[0] + '5' : pai;
        return doraSet.has(normalized);
    });

    if (extraDoraCount <= 0) return;

    /* 4. 追加到 hule 结果：找到已有的"里宝牌"条目累加，否则新增 */
    let found = false;
    for (let i = 0; i < hule.hupai.length; i++) {
        if (hule.hupai[i].name === '里宝牌') {
            hule.hupai[i].fanshu += extraDoraCount;
            hule.fanshu += extraDoraCount;
            found = true;
            break;
        }
    }
    if (!found) {
        hule.hupai.push({ name: '里宝牌', fanshu: extraDoraCount, type: 'dora' });
        hule.fanshu += extraDoraCount;
    }
}

const SKILL_EXECUTE_MAP = {

    /* ===== 爱丝琳·威夏尔特 (Aislinn_Wishart) ===== */
    'Aislinn_Wishart': {
        0: {
            /* ① 你的每排牌河限一次,你手切后可进行额外巡 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.EXTRA_TURN,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 只响应手切（非摸切），打出的牌不以 _ 结尾 */
                let dapai = context.dapai || '';
                let base = dapai.replace(/\*$/, '');
                if (base.endsWith('_')) return false;
                /* 不在额外巡链中（防止额外巡手切再次触发） */
                if (game._extra_turn) return false;
                if (typeof game._extra_chain_remaining === 'number' && game._extra_chain_remaining >= 0) return false;
                /* 牌河当前排号是否已使用过（不含被副露的牌） */
                let seat = context.seat;
                let he = game._model.he[seat];
                if (!he) return false;
                let paiCount = 0;
                for (let t of he._pai) {
                    if (!t.match(/[\+\=\-]$/)) paiCount++;
                }
                let row = Math.ceil(paiCount / 6);
                let usedRows = game._skillManager
                    ? game._skillManager.getSkillData(seat, 'Aislinn_Wishart', 1)
                    : null;
                if (usedRows && usedRows.has(row)) return false;
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                /* 记录当前排号已使用（不含被副露的牌） */
                let he = game._model.he[seat];
                let paiCount = 0;
                for (let t of he._pai) {
                    if (!t.match(/[\+\=\-]$/)) paiCount++;
                }
                let row = Math.ceil(paiCount / 6);
                let usedRows = game._skillManager
                    ? game._skillManager.getSkillData(seat, 'Aislinn_Wishart', 1)
                    : null;
                if (!usedRows) {
                    usedRows = new Set();
                    game._skillManager.setSkillData(seat, 'Aislinn_Wishart', 1, usedRows);
                }
                usedRows.add(row);
                /* 启动额外巡（1次） */
                extraTurn.start(game, seat, 1);
                context.done();
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                /* 统计非副露牌河长度和当前排位 */
                let he = model.he[seat];
                let heLen = 0;
                for (let t of he._pai) {
                    if (!t.match(/[\+\=\-]$/)) heLen++;
                }
                let row = Math.ceil(heLen / 6);
                let posInRow = ((heLen - 1) % 6) + 1;
                /* 每排第6张必须发动 */
                if (posInRow === 6) return true;
                /* 向听数 */
                let shoupai = model.shoupai[seat];
                let xiangting = shoupai ? Majiang.Util.xiangting(shoupai) : 99;
                /* 基准发动概率：按排和位 */
                let prob = 0;
                if (row === 1) {
                    if (posInRow === 5) prob = 0.5;
                } else if (row === 2) {
                    if (posInRow === 3 || posInRow === 4) prob = 0.7;
                } else {
                    if (posInRow === 1 || posInRow === 2) prob = 0.7;
                }
                /* 听牌(0)或一向听(1)时提升概率 */
                if (xiangting <= 1) {
                    prob = Math.min(1.0, prob + 0.25);
                }
                return Math.random() < prob;
            },
        },
        1: {
            /* ② 若场上的副露玩家数少于2,你进行额外巡时,可以从牌河摸牌并暗切 */
            timing: TimingPoints.DRAW_SOURCE,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.DRAW_FROM_RIVER,
            condition: function(context) {
                let game = context.game;
                if (!game) return false;
                /* 仅在额外巡中触发 */
                if (!context.isExtraTurn) return false;
                /* 场上副露玩家数 < 2 */
                let model = game._model;
                if (!model || !model.shoupai) return false;
                let meldCount = 0;
                for (let l = 0; l < 4; l++) {
                    if (l === context.player) continue;
                    let shoupai = model.shoupai[l];
                    if (shoupai && !shoupai.menqian) meldCount++;
                }
                if (meldCount >= 2) return false;
                return true;
            },
            execute: function(context) {
                /* 效果由 _handleBeforeDrawSkillAction 统一处理（确认/牌河选牌/暗切标记） */
                return { executed: true };
            },
            aiDecision: function(context) {
                let riverTiles = context.riverTiles || [];
                let shoupai = context.shoupai;
                let paijiaFn = context.paijiaFn;
                let xiangtingFn = context.xiangtingFn;
                let getDapaiFn = context.getDapaiFn;
                let baopaiArr = context.baopai || [];
                if (!shoupai || !xiangtingFn || riverTiles.length === 0) {
                    return { activate: false };
                }
                /* 预检：若牌河中所有牌摸到后都会被立刻打出，则不发动 */
                if (getDapaiFn) {
                    let allDiscarded = true;
                    for (let tile of riverTiles) {
                        if (!_wouldDiscardImmediately(shoupai, tile.pai, xiangtingFn, getDapaiFn)) {
                            allDiscarded = false;
                            break;
                        }
                    }
                    if (allDiscarded) return { activate: false };
                }
                let currentShanten = xiangtingFn(shoupai);
                let bestScore = -Infinity;
                let bestTile = null;
                for (let tile of riverTiles) {
                    let testShoupai = shoupai.clone();
                    testShoupai.zimo(tile.pai);
                    let newShanten = xiangtingFn(testShoupai);
                    let improvement = currentShanten - newShanten;
                    /* 非向听改善且非宝牌 → 跳过 */
                    if (improvement <= 0 && !_isTileDora(tile.pai, baopaiArr)) continue;
                    let value = paijiaFn ? paijiaFn(tile.pai) : 0;
                    /* 向听改善权重远大于牌本身价值 */
                    let score = improvement * 100 + value;
                    if (score > bestScore) {
                        bestScore = score;
                        bestTile = tile;
                    }
                }
                if (bestScore > 0 && bestTile) {
                    return { activate: true, choice: { pai: bestTile.pai, seat: bestTile.seat, index: bestTile.index } };
                }
                return { activate: false };
            },
        },
    },


    /* ===== 天江衣 (Amae_Koromo) ===== */
    'Amae_Koromo': {
        0: {
            /* ① 海底/河底视为和牌 */
            timing: TimingPoints.DECLARE_HULE,
            type: SkillType.PASSIVE,
            usageType: UsageType.ONCE_PER_HAND,
            usageMax: 1,
            effectType: EffectType.VIEW_AS_WIN_TILE,
            huleExpander: function(context) {
                let game = context.game;
                if (!game) return [];
                let model = game._model;
                if (!model || !model.shan) return [];
                if (model.shan.paishu !== 0) return [];
                let shoupai = context.shoupai;
                if (!shoupai) return [];
                return winTileOverrider.getCandidates(shoupai, model, context.seat);
            },
            condition: function(context) {
                let game = context.game;
                if (!game) return false;
                let model = game._model;
                if (!model || !model.shan) return false;
                if (model.shan.paishu !== 0) return false;
                let shoupai = context.shoupai;
                if (!shoupai) return false;
                let candidates = winTileOverrider.getCandidates(shoupai, model, context.seat);
                return candidates.length > 0;
            },
            execute: async function(context) {
                /* 顶层 execute 已在 _huleExpanderUsed 路径被调用（带 input 桥接），
                   此 auto-execute 路径无条件弹窗 → 跳过 */
                if (!context.input || typeof context.input.askTileOptions !== 'function') return;

                let game = context.game;
                let shoupai = context.shoupai;
                let menfeng = context.seat;
                let input = context.input;

                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length <= 2) {
                    try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                }
                hand13._zimo = null;
                let candidates = Majiang.Util.tingpai(hand13) || [];

                if (candidates.length === 0) { context.done(); return; }

                if (candidates.length === 1) {
                    let chosenPai = candidates[0];
                    if (context.rongpai) {
                        let lunban = context.lunban;
                        let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                        context._overrideRongpai = chosenPai + suffix;
                    } else {
                        winTileOverrider.override(shoupai, chosenPai);
                    }
                    context._overridePai = chosenPai;
                    context.done();
                    return;
                }

                let chosenPai = await input.askTileOptions(candidates, '选择视为哪张牌和牌（海底/河底）',
                    () => {
                        let best = candidates[0];
                        let bestVal = _evalTileValue(best, game, menfeng);
                        for (let i = 1; i < candidates.length; i++) {
                            let val = _evalTileValue(candidates[i], game, menfeng);
                            if (val > bestVal) { bestVal = val; best = candidates[i]; }
                        }
                        return best;
                    });
                if (!chosenPai) { context.done(); return; }
                if (context.rongpai) {
                    let lunban = context.lunban;
                    let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                    context._overrideRongpai = chosenPai + suffix;
                } else {
                    winTileOverrider.override(shoupai, chosenPai);
                }
                context._overridePai = chosenPai;
                context.done();
            },
            aiDecision: function(context) {
                return true;
            },
        },
        1: {
            /* ② 舍牌时移动当前海底牌到王牌尾部
             * 数量：技能④触发过则复用④的选择，否则默认 1（有立直时 2） */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.SWAP_TILES,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                let model = game._model;
                if (!model || !model.shan) return false;
                if (model.shan.paishu <= 0) return false;
                return true;
            },
            /* 技能④本回合触发过 → 自动执行，不询问 */
            shouldAutoExecute: function(context) {
                let game = context.game;
                if (!game || !game._skillManager) {
                    console.log('[DEBUG] 技能② shouldAutoExecute: game或_skillManager不存在');
                    return false;
                }
                /* 牌山不足时无法发动 */
                let model = game._model;
                if (!model || !model.shan || model.shan.paishu <= 0) {
                    console.log('[DEBUG] 技能② shouldAutoExecute: 牌山不足 paishu=' +
                        (model?.shan?.paishu));
                    return false;
                }
                let triggered = game._skillManager.wasTriggered(context.seat, 'Amae_Koromo', 4);
                console.log('[DEBUG] 技能② shouldAutoExecute: seat=' + context.seat +
                    ', wasTriggered(4)=' + triggered +
                    ', paishu=' + model.shan.paishu +
                    ', turnTriggerLog=' + JSON.stringify(game._skillManager._turnTriggerLog));
                return triggered;
            },
            execute: async function(context) {
                let game = context.game;
                let model = game._model;
                if (!model || !model.shan) return { executed: true };
                let seat = context.seat;

                /* 从触发记录中获取技能④选择的移动数量 */
                let triggerData = game._skillManager
                    ? game._skillManager.getTriggerData(seat, 'Amae_Koromo', 4)
                    : null;
                let qty = triggerData?.qty > 0 ? triggerData.qty : 0;
                if (qty <= 0) {
                    /* 技能④未触发，需要自行决定数量 */
                    if (model.shan.paishu <= 1) {
                        qty = model.shan.paishu;
                    } else if (_isKoromoSkill3Active(game, seat)
                               && context.input && context.input.askNumber) {
                        /* 技能③（立直强化）激活 → 询问玩家移动张数 */
                        let maxQty = Math.min(2, model.shan.paishu);
                        let choice = await context.input.askNumber(
                            1, maxQty,
                            '移动海底牌到王牌尾部（张数）',
                            () => maxQty);
                        if (choice == null || choice <= 0) return { executed: true };
                        qty = choice;
                    } else {
                        qty = 1;
                    }
                }
                qty = Math.min(qty, model.shan.paishu);
                if (qty <= 0) return { executed: true };

                /* ── 牌山日志：发动前 ── */
                console.log('[skill②] 发动前 paishu=' + model.shan.paishu
                    + ' cursor=' + model.shan._cursor + '/' + model.shan._stacks.length
                    + ' haitei=' + model.shan._haitei + ' dw=' + model.shan._dw_count
                    + ' half=' + model.shan._half_consumed
                    + ' ' + model.shan._formatLivingWall()
                    + ' ' + model.shan._formatDeadWall());

                /* popEnd 用 unshift 收集，qty=2 时返回 [倒数第二张, 海底牌]。
                 * 逆序后 [海底牌, 倒数第二张]，先 push 海底再 push 倒数第二张。
                 * 王牌尾部 push：先 push 的沉在墩底靠尾部，后 push 的靠近岭上。 */
                let moved = tileOps.popEnd(model, qty);
                console.log('[skill②] popEnd: 数量=' + qty + ' 移走=' + moved.length + ' 张 [' + moved.join(',') + ']'
                    + ' paishu=' + model.shan.paishu
                    + ' cursor=' + model.shan._cursor + '/' + model.shan._stacks.length
                    + ' haitei=' + model.shan._haitei + ' dw=' + model.shan._dw_count
                    + ' half=' + model.shan._half_consumed
                    + ' ' + model.shan._formatLivingWall()
                    + ' ' + model.shan._formatDeadWall());

                moved.reverse();
                for (let tile of moved) {
                    tileOps.pushDeadWall(model, [tile]);
                }

                /* ── 牌山日志：发动后 ── */
                console.log('[skill②] 发动后 paishu=' + model.shan.paishu
                    + ' cursor=' + model.shan._cursor + '/' + model.shan._stacks.length
                    + ' haitei=' + model.shan._haitei + ' dw=' + model.shan._dw_count
                    + ' half=' + model.shan._half_consumed
                    + ' ' + model.shan._formatLivingWall()
                    + ' ' + model.shan._formatDeadWall());

                return { executed: true };
            },
            aiDecision: function(context) {
                let model = context.game._model;
                return model && model.shan && model.shan.paishu > 1;
            },
        },
        2: {
            /* ③ 被动强化：他人立直时②④技能量变2 */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
            effectType: EffectType.NONE,
        },
        3: {
            /* ④ 舍牌前展示海底牌并可选交换，联动技能② */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            priority: 400,
            effectType: EffectType.SWAP_TILES,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                let seat = context.seat;
                /* 只有②技能存在时才能发动 */
                let charId = game._skillManager._activeCharacters[seat];
                if (!charId) return false;
                let char = game._skillManager.getRegistry().getCharacter(charId);
                if (!char || !char.skills[1]) return false;
                let model = game._model;
                if (!model || !model.shan) return false;
                if (model.shan.paishu <= 0) return false;
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let model = game._model;
                let seat = context.seat;
                let input = context.input;

                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));
                let shoupai = model.shoupai[seat];
                /* condition 保证了 _zimo 存在且非空 */
                let drawnPai = shoupai._zimo;
                let isDealerFirst = game._diyizimo && seat === 0;

                /* 记录技能触发，确保技能②的 shouldAutoExecute
                 * 在异步间隙中也能检测到（qty 稍后更新） */
                game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty: 0 });
                console.log('[DEBUG] 技能④ execute: 初次 recordTrigger seat=' + seat +
                    ', turnTriggerLog=' + JSON.stringify(game._skillManager._turnTriggerLog));

                /* ── 1. 选择数量 ── */
                let qty = 1;
                if (_isKoromoSkill3Active(game, seat) && model.shan.paishu > 1) {
                    let choice = await input.askTextOptions(
                        ['移动 1 张', '移动 2 张'], ['1', '2'],
                        '选择移动数量', () => model.shan.paishu === 2 ? '1' : '2');
                    if (!choice) { context.done(); return; }
                    qty = parseInt(choice);
                }
                qty = Math.min(qty, model.shan.paishu);
                if (qty <= 0) { context.done(); return; }

                /* ── 2. 展示海底牌 ── */
                /* ── 牌山日志：发动前 ── */
                console.log('[skill④] 发动前 paishu=' + model.shan.paishu
                    + ' cursor=' + model.shan._cursor + '/' + model.shan._stacks.length
                    + ' haitei=' + model.shan._haitei + ' dw=' + model.shan._dw_count
                    + ' half=' + model.shan._half_consumed
                    + ' ' + model.shan._formatLivingWall()
                    + ' ' + model.shan._formatDeadWall());

                let peeked = tileOps.peekEnd(model, qty);
                console.log('[skill④] peekEnd: 数量=' + qty + ' 展示=' + peeked.length + ' 张 [' + peeked.join(',') + ']');
                let paiNames = peeked.map(p => game._pai_name(p)).join('、');
                game._add_action_log(spname + ' 展示了海底牌：' + paiNames, seat);
                input.showToast({ tiles: peeked, text: spname + ' 展示了海底牌：' + paiNames });

                /* 等待 2 秒，确保所有玩家看清海底牌展示后再进行交换决策 */
                await new Promise(resolve => setTimeout(resolve, 2000));

                /* 副露轮次无摸牌：展示后直接结束，不进行交换 */
                if (!drawnPai || drawnPai.length < 2) {
                    game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                    console.log('[DEBUG] 技能④ execute(副露): 最终 recordTrigger seat=' + seat +
                        ', qty=' + qty +
                        ', turnTriggerLog=' + JSON.stringify(game._skillManager._turnTriggerLog));
                    context.done();
                    return;
                }

                /* ── 3. 匹配（先匹配再确认） ── */
                let chosen;
                if (isDealerFirst) {
                    /* 庄家首巡：所有手牌 ↔ 海底牌匹配 */
                    let handTiles = _getHandTiles(shoupai);
                    let pairs = [];
                    for (let h of handTiles) {
                        if (h[0] === 'z') continue;
                        for (let wi = 0; wi < peeked.length; wi++) {
                            let w = peeked[wi];
                            if (w[0] === 'z') continue;
                            if (h[0] === w[0] || h[1] === w[1]) {
                                pairs.push({ hand: h, wall: w, peekIdx: wi });
                            }
                        }
                    }

                    if (pairs.length === 0) {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                        context.done();
                        return;
                    }

                    let wallCandidates = [];
                    let wallCandidatePeekIdx = [];  // 每张候选牌在 peeked 中的位置
                    for (let p of pairs) {
                        let idx = wallCandidates.indexOf(p.wall);
                        if (idx < 0) {
                            wallCandidates.push(p.wall);
                            wallCandidatePeekIdx.push(p.peekIdx);
                        }
                    }

                    /* AI：比较海底牌中是否存在比手牌最低价值更高的牌，否则取消 */
                    let lowestHandVal = Infinity;
                    for (let h of handTiles) {
                        if (h[0] === 'z') continue;
                        let val = _evalHandTileValue(h, shoupai, game, seat);
                        if (val < lowestHandVal) lowestHandVal = val;
                    }
                    if (!wallCandidates.some(w => _evalTileValue(w, game, seat) > lowestHandVal)) {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                        context.done();
                        return;
                    }

                    /* 3a. 选择海底牌（即确认交换，只可选能换的牌） */
                    let chosenWall;
                    let chosenWallPeekIdx;
                    if (wallCandidates.length === 1) {
                        chosenWall = wallCandidates[0];
                        chosenWallPeekIdx = wallCandidatePeekIdx[0];
                    } else {
                        chosenWall = await input.askTileOptions(wallCandidates,
                            '庄家首巡·选择一张海底牌进行交换',
                            () => {
                                let best = wallCandidates[0];
                                let bestVal = _evalTileValue(best, game, seat);
                                for (let i = 1; i < wallCandidates.length; i++) {
                                    let val = _evalTileValue(wallCandidates[i], game, seat);
                                    if (val > bestVal) { bestVal = val; best = wallCandidates[i]; }
                                }
                                return best;
                            }, true);
                        if (chosenWall) {
                            chosenWallPeekIdx = wallCandidatePeekIdx[wallCandidates.indexOf(chosenWall)];
                        }
                    }
                    if (!chosenWall) {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                        context.done();
                        return;
                    }

                    /* 3b. 选择与该海底牌交换的手牌（直接点击手牌） */
                    let handOptions = pairs.filter(p => p.wall === chosenWall).map(p => p.hand);
                    let chosenHand;
                    if (handOptions.length === 1) {
                        chosenHand = handOptions[0];
                    } else {
                        chosenHand = await input.askHandTile(
                            '选择与「' + game._pai_name(chosenWall) + '」交换的手牌',
                            () => {
                                let worst = handOptions[0];
                                let worstVal = _evalHandTileValue(worst, shoupai, game, seat);
                                for (let i = 1; i < handOptions.length; i++) {
                                    let val = _evalHandTileValue(handOptions[i], shoupai, game, seat);
                                    if (val < worstVal) { worstVal = val; worst = handOptions[i]; }
                                }
                                return worst;
                            },
                            handOptions);
                    }
                    if (!chosenHand) {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                        context.done();
                        return;
                    }

                    drawnPai = chosenHand;
                    chosen = chosenWall;
                    chosenIdx = chosenWallPeekIdx;

                } else {
                    /* 普通巡目：摸牌 ↔ 海底牌匹配 */
                    let drawnSuit = drawnPai[0];
                    let drawnNum = drawnPai[1];

                    let matches = [];
                    let matchPeekIdx = [];  // 平行数组，记录每张匹配牌在 peeked 中的位置
                    for (let i = 0; i < peeked.length; i++) {
                        let t = peeked[i];
                        if (t[0] === 'z') continue;
                        if (t[0] === drawnSuit || t[1] === drawnNum) {
                            matches.push(t);
                            matchPeekIdx.push(i);
                        }
                    }

                    if (matches.length === 0) {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                        context.done();
                        return;
                    }

                    /* 3. 确认 / 选择交换牌（先匹配再问，只可选能换的牌） */
                    var chosenIdx;
                    if (matches.length === 1) {
                        let wantsSwap = await input.askConfirm(
                            '是否用「' + game._pai_name(drawnPai) + '」交换「'
                                + game._pai_name(matches[0]) + '」？',
                            () => true);
                        if (!wantsSwap) {
                            game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                            context.done();
                            return;
                        }
                        chosen = matches[0];
                        chosenIdx = matchPeekIdx[0];
                    } else {
                        chosen = await input.askTileOptions(matches,
                            '选择一张牌与「' + game._pai_name(drawnPai) + '」交换',
                            () => {
                                let best = matches[0];
                                let bestVal = _evalTileValue(best, game, seat);
                                for (let i = 1; i < matches.length; i++) {
                                    let val = _evalTileValue(matches[i], game, seat);
                                    if (val > bestVal) { bestVal = val; best = matches[i]; }
                                }
                                return best;
                            }, true);
                        if (!chosen) {
                            game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                            context.done();
                            return;
                        }
                        chosenIdx = matchPeekIdx[matches.indexOf(chosen)];
                    }
                }

                /* ── 4. 执行交换：摸牌 ↔ 海底牌（原地替换，不移动其他牌） ── */
                if (chosenIdx == null || chosenIdx < 0) {
                    game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                    context.done();
                    return;
                }

                /* removeFromHand 清空 _zimo，然后用 shoupai.zimo 加入新牌
                 * （设置 _zimo + 增加计数，让后续 zimo 消息正确渲染摸牌） */
                tileOps.removeFromHand(shoupai, drawnPai);
                shoupai.zimo(chosen, false);

                /* peekEnd 返回 [倒数第二张, 海底牌]，chosenIdx 以此为序；
                 * swapWallEnd index 0 = 海底牌，需转换 */
                let swapIdx = qty - 1 - chosenIdx;
                tileOps.swapWallEnd(model, swapIdx, drawnPai);

                /* ── 牌山日志：交换后 ── */
                console.log('[skill④] swapWallEnd: 换入=' + drawnPai + ' 换出=' + chosen + ' idx=' + swapIdx
                    + ' paishu=' + model.shan.paishu
                    + ' cursor=' + model.shan._cursor + '/' + model.shan._stacks.length
                    + ' haitei=' + model.shan._haitei + ' dw=' + model.shan._dw_count
                    + ' half=' + model.shan._half_consumed
                    + ' ' + model.shan._formatLivingWall()
                    + ' ' + model.shan._formatDeadWall());

                game._add_action_log(spname + ' 将「' + game._pai_name(drawnPai)
                    + '」与海底「' + game._pai_name(chosen) + '」交换', seat);

                /* ── 5. 展示交换结果 ── */
                let afterSwap = tileOps.peekEnd(model, qty);
                let afterSwapNames = afterSwap.map(p => game._pai_name(p)).join('、');
                input.showToast({
                    tiles: afterSwap,
                    text: spname + ' 交换完成，海底牌变为：' + afterSwapNames,
                    duration: 2500,
                });

                /* 设定技能②的移动数量，本巡自动发动 */
                game._skillManager.recordTrigger(seat, 'Amae_Koromo', 4, { qty });
                console.log('[DEBUG] 技能④ execute(交换): 最终 recordTrigger seat=' + seat +
                    ', qty=' + qty +
                    ', turnTriggerLog=' + JSON.stringify(game._skillManager._turnTriggerLog));
                context.done();
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                if (!shoupai || !model.shan || model.shan.paishu <= 1) return false;

                /* 庄家首巡：一定发动 */
                if (game._diyizimo && seat === 0) return true;

                /* 普通巡目 */
                let drawn = shoupai._zimo;
                if (!drawn || drawn.length < 2) return false;

                /* 摸到字牌：跳过 */
                if (drawn[0] === 'z') return false;

                /* 检查所有和摸牌同花色或同点数的牌中，是否存在价值更高的牌。
                 * 不偷看牌山，只做理论判断。例如摸 s4，检查 s1-s9（含 s0）和 m4、p4 */
                let drawnSuit = drawn[0];
                let drawnNum = drawn[1] === '0' ? 5 : +drawn[1];
                let drawnValue = _evalTileValue(drawn, game, seat);

                /* 同花色的数牌 1-9（不含自身）及红 5 */
                if (drawnSuit !== 'z') {
                    for (let n = 1; n <= 9; n++) {
                        if (n === drawnNum) continue;
                        let pai = drawnSuit + n;
                        if (_evalTileValue(pai, game, seat) > drawnValue) return true;
                    }
                    /* 红 5（s0） */
                    if (drawnNum !== 5) {
                        let red5 = drawnSuit + '0';
                        if (_evalTileValue(red5, game, seat) > drawnValue) return true;
                    }
                }

                /* 同点数的其他花色（对方块 m/p，s 与 m/p 同点数也可） */
                for (let s of ['m', 'p', 's']) {
                    if (s === drawnSuit) continue;
                    let pai = s + drawn[1];  // 保留原始数字字符（可能是 '0'）
                    if (_evalTileValue(pai, game, seat) > drawnValue) return true;
                }
                return false;
            },
        },
    },

    /* ===== 片冈优希 (Kataoka_Yuuki) ===== */
    'Kataoka_Yuuki': {
        0: {
            /* ① 首巡舍牌前，两轮将至多两张手牌放海底并摸牌，之后可选交换手牌与摸牌 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_GAME,
            usageMax: 1,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 只有首巡可以发动 */
                if (!game._diyizimo) return false;
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let model = game._model;
                let seat = context.seat;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));

                /* 保存原始摸牌，后续 addToHand 会覆盖 _zimo 需恢复 */
                let origZimo = shoupai._zimo;

                /* AI：选择价值最低的 count 张牌 */
                function aiTopWorstTiles(count, tiles) {
                    let sorted = [...tiles].sort((a, b) =>
                        _evalHandTileValue(a, shoupai, game, seat) -
                        _evalHandTileValue(b, shoupai, game, seat));
                    return sorted.slice(0, count);
                }

                /* 执行「手牌 → 海底 + 摸牌」原子操作 */
                function doHaiteiSwap(selected) {
                    let zimoGone = false;
                    for (let t of selected) {
                        if (origZimo && t === origZimo) {
                            zimoGone = true;
                        }
                        tileOps.removeFromHand(shoupai, t);
                    }
                    /* 放入海底（完整1墩） */
                    tileOps.pushEnd(model, selected.slice());
                    /* 摸等量牌 */
                    let drawn = tileOps.popFront(model, selected.length);
                    for (let t of drawn) {
                        tileOps.addToHand(shoupai, t);  /* 会覆盖 _zimo */
                    }
                    /* 还原 _zimo；若被移除或摸牌为空，从手牌随机选一张 */
                    if (!zimoGone && origZimo && origZimo.length >= 2) {
                        shoupai._zimo = origZimo;
                    }
                    if (!shoupai._zimo || shoupai._zimo.length < 2) {
                        let allHand = _getHandTiles(shoupai);
                        if (allHand.length > 0) {
                            shoupai._zimo = allHand[Math.floor(Math.random() * allHand.length)];
                        }
                    }
                    return drawn;
                }

                /* —— 阶段1 —— */
                let xiangting = Majiang.Util.xiangting(shoupai);
                let tiles1 = _getHandTiles(shoupai);

                let sel1 = await input.pickHandTilesRange(0, 2,
                    '选牌放到海底，点手牌选择后点确定，点取消跳过',
                    () => {
                        let aiCnt = (xiangting === 1) ? 1 : (xiangting >= 2 ? 2 : 0);
                        if (tiles1.length === 0) return [];
                        return aiTopWorstTiles(aiCnt, tiles1);
                    },
                    tiles1);

                if (sel1 && sel1.length > 0) {
                    let drawn1 = doHaiteiSwap(sel1);
                    game._add_action_log(spname + ' 将' + sel1.length + '张牌放到海底，摸了'
                        + drawn1.length + '张牌', seat);
                }

                /* —— 阶段2 —— */
                xiangting = Majiang.Util.xiangting(shoupai);
                let tiles2 = _getHandTiles(shoupai);

                let sel2 = await input.pickHandTilesRange(0, 2,
                    '再次选牌放到海底，点手牌选择后点确定，点取消跳过',
                    () => {
                        let aiCnt = (xiangting >= 2) ? 2 : (xiangting === 1 ? 1 : 0);
                        if (tiles2.length === 0) return [];
                        return aiTopWorstTiles(aiCnt, tiles2);
                    },
                    tiles2);

                if (sel2 && sel2.length > 0) {
                    let drawn2 = doHaiteiSwap(sel2);
                    game._add_action_log(spname + ' 将' + sel2.length + '张牌放到海底，摸了'
                        + drawn2.length + '张牌', seat);
                }

                /* —— 阶段3：选择一张牌作为摸牌 —— */
                if (origZimo && origZimo.length >= 2) {
                    let tiles3 = _getHandTiles(shoupai);
                    if (tiles3.length > 0) {
                        let t = await input.pickHandTilesRange(0, 1,
                            '选择一张牌作为摸牌',
                            () => [],  /* AI 始终取消 */
                            tiles3);

                        if (t && t.length > 0) {
                            tileOps.removeFromHand(shoupai, t[0]);
                            tileOps.addToHand(shoupai, t[0]);
                            game._add_action_log(spname + ' 选择一张牌作为本巡摸牌', seat);
                        }
                    }
                }

                context.done();
            },
            aiDecision: function(context) {
                /* AI：未听牌则发动 */
                let game = context.game;
                let seat = context.seat;
                let shoupai = game._model.shoupai[seat];
                if (!shoupai) return false;
                let xiangting = Majiang.Util.xiangting(shoupai);
                return xiangting > 0;
            },
        },
    },

    /* ===== 南浦数绘 (Nanpo_Kazue) ===== */
    'Nanpo_Kazue': {
        0: {
            /* ① 摸2张牌，选2张手牌放回王牌尾部，再选1张作为本巡摸牌，若立直则解除振听 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_GAME,
            usageMax: 2,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 首巡可以发动 */
                if (game._diyizimo) return true;
                /* 技能②存在且所有玩家第一排牌河已填满 */
                let seat = context.seat;
                let charId = game._skillManager
                    ? game._skillManager._activeCharacters[seat]
                    : null;
                if (!charId) return false;
                let char = game._skillManager.getRegistry().getCharacter(charId);
                if (!char || !char.skills[1]) return false;
                let model = game._model;
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) return false;
                    let count = 0;
                    for (let t of he._pai) {
                        if (!t.match(/[\+\=\-]$/)) count++;
                    }
                    if (count < 6) return false;
                }
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let model = game._model;
                let seat = context.seat;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));

                /* 保存原始摸牌（回退时需恢复） */
                let origZimo = shoupai._zimo;

                /* 阶段1：摸2张牌 */
                let drawn = tileOps.popFront(model, 2);
                for (let t of drawn) {
                    tileOps.addToHand(shoupai, t);
                }
                game._add_action_log(spname + ' 发动技能，摸了2张牌', seat);

                /* 阶段2：选择2张手牌放回王牌尾部 */
                let handTiles = _getHandTiles(shoupai);
                let aiWorst = [...handTiles].sort((a, b) =>
                    _evalHandTileValue(a, shoupai, game, seat) -
                    _evalHandTileValue(b, shoupai, game, seat)
                ).slice(0, 2);

                let selected = await input.pickHandTiles(2,
                    '选2张手牌放回王牌尾部',
                    () => aiWorst,
                    handTiles,
                    { confirmText: '确定', noCancel: true, hideCount: true });

                if (!selected || selected.length < 2) {
                    /* 取消或选牌不足，回退摸牌操作 */
                    for (let t of drawn) {
                        tileOps.removeFromHand(shoupai, t);
                    }
                    tileOps.pushFront(model, drawn.slice());
                    /* 恢复原始摸牌 */
                    if (origZimo && origZimo.length >= 2) {
                        shoupai._zimo = origZimo;
                    } else if (!shoupai._zimo || shoupai._zimo.length < 2) {
                        let allTiles = _getHandTiles(shoupai);
                        if (allTiles.length > 0) {
                            shoupai._zimo = allTiles[Math.floor(Math.random() * allTiles.length)];
                        }
                    }
                    context.done();
                    return;
                }

                /* 移除手牌，放入王牌尾部 */
                for (let t of selected) {
                    tileOps.removeFromHand(shoupai, t);
                }
                /* 将两张牌作为完整1墩放入王牌尾部 */
                tileOps.pushDeadWall(model, selected.slice());

                game._add_action_log(spname + ' 将' + selected.length + '张牌放回王牌尾部', seat);

                /* 阶段3：选择1张牌作为本巡摸牌 */
                let handAfter = _getHandTiles(shoupai);
                if (handAfter.length > 0) {
                    /* AI：选择价值最高的牌 */
                    let aiBest = [...handAfter].sort((a, b) =>
                        _evalHandTileValue(b, shoupai, game, seat) -
                        _evalHandTileValue(a, shoupai, game, seat)
                    )[0];

                    let zimoPick = await input.askHandTile(
                        '选择一张牌作为摸牌',
                        () => aiBest,
                        handAfter);

                    if (zimoPick) {
                        shoupai._zimo = zimoPick;
                    } else if (!shoupai._zimo || shoupai._zimo.length < 2) {
                        /* 兜底：随机选一张 */
                        shoupai._zimo = handAfter[Math.floor(Math.random() * handAfter.length)];
                    }
                }

                /* 若立直，解除立直振听 */
                if (game._lizhi[seat]) {
                    game._neng_rong[seat] = true;
                    game._add_action_log(spname + ' 解除了立直振听', seat);
                }

                /* 阶段4：手牌已变，重新选择本巡打出的牌 */
                let finalHand = _getHandTiles(shoupai);
                if (finalHand.length > 0) {
                    /* AI：选择价值最低的牌打出 */
                    let aiDiscard = [...finalHand].sort((a, b) =>
                        _evalHandTileValue(a, shoupai, game, seat) -
                        _evalHandTileValue(b, shoupai, game, seat)
                    )[0];

                    let discardPick = await input.askHandTile(
                        '选择一张牌打出',
                        () => aiDiscard,
                        finalHand);

                    if (discardPick) {
                        game._skillRedapai = discardPick;
                    } else {
                        /* 兜底：摸牌或随机一张 */
                        game._skillRedapai = shoupai._zimo
                            || finalHand[Math.floor(Math.random() * finalHand.length)];
                    }
                }

                /* 刷新手牌 UI */
                if (game._view && game._view.shoupai && game._view.shoupai[seat]) {
                    game._view.shoupai[seat].redraw();
                }

                context.done();
            },
            aiDecision: function(context) {
                /* AI：无条件发动 */
                return true;
            },
        },
        1: {
            /* ② 技能①的强化条件（无实际效果），供技能①检测"第一排牌河填满" */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
        },
    },

    /* ===== 测试角色 (Test_Character) ===== */
    'Test_Character': {
        0: {
            /* 舍牌后,你可以执行1-5个额外巡目 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.EXTRA_TURN,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                if (game._extra_turn) return false;
                let model = game._model;
                if (model.shan.paishu < 2) return false;
                /* 额外巡链已经完成（或正在进行中），不再触发 */
                if (typeof game._extra_chain_remaining === 'number' && game._extra_chain_remaining >= 0) return false;
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let input = context.input;

                let count = await input.askNumber(1, 5, '选择额外巡目数',
                    () => Math.floor(Math.random() * 5) + 1);
                if (count === null) { context.done(); return; }
                extraTurn.start(game, seat, count);
                context.done();
            },
            aiDecision: function(context) {
                if (Math.random() < 0.5) return false;
                return true;
            },
        },
        1: {
            /* 舍牌时,你必须暗置舍牌 */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.PASSIVE,
            effectType: EffectType.HIDDEN_DISCARD,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                return true;
            },
            execute: function(context) {
                let game = context.game;
                game._extra_hidden_discard = true;
                return { executed: true };
            },
        },
        2: {
            /* 舍牌前,你可以选择移除牌山首部或者牌山尾部的4张牌 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            effectType: EffectType.SWAP_TILES,
            priority: 300,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                if (game._model.shan.paishu < 4) return false;
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let model = game._model;
                let input = context.input;

                let choice = await input.askTextOptions(
                    ['移除牌山首部4张牌', '移除牌山尾部4张牌'],
                    ['front', 'end'],
                    '选择移除位置',
                    () => Math.random() < 0.5 ? 'front' : 'end');
                if (!choice) { context.done(); return; }
                if (choice === 'front') {
                    tileOps.popFront(model, 4);
                } else {
                    tileOps.popEnd(model, 4);
                }
                context.done();
            },
            aiDecision: function(context) {
                if (Math.random() < 0.5) return false;
                return true;
            },
        },
        3: {
            /* 你可以将任何字牌当作你的和牌
             * Part A（huleExpander）：在 allow_hule() 判定时，将字牌加入候选和牌范围
             * Part B（execute）：宣言和牌时，自动弹出字牌选择 UI（无需确认弹窗）
             */
            timing: TimingPoints.DECLARE_HULE,
            type: SkillType.PASSIVE,
            usageType: UsageType.ONCE_PER_HAND,
            usageMax: 1,
            effectType: EffectType.VIEW_AS_WIN_TILE,
            /* 和牌资格扩展：返回可视为和牌的候选牌 */
            huleExpander: function(context) {
                let shoupai = context.shoupai;
                if (!shoupai) return [];
                return winTileOverrider.getCandidates(shoupai, context.game ? context.game._model : null, context.seat, {
                    suitFilter: ['z'],
                });
            },
            condition: function(context) {
                let game = context.game;
                if (!game) return false;
                let shoupai = context.shoupai;
                if (!shoupai) return false;
                let model = game._model;
                let candidates = winTileOverrider.getCandidates(shoupai, model, context.seat, {
                    suitFilter: ['z'],
                });
                return candidates.length > 0;
            },
            execute: async function(context) {
                /* 顶层 execute 已在 _huleExpanderUsed 路径被调用（带 input 桥接），
                   此 auto-execute 路径无条件弹窗 → 跳过 */
                if (!context.input || typeof context.input.askTileOptions !== 'function') return;

                let game = context.game;
                let shoupai = context.shoupai;
                let menfeng = context.seat;
                let input = context.input;

                /* 计算13张手牌（去除摸牌）的听牌列表 */
                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length <= 2) {
                    try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                }
                hand13._zimo = null;
                let candidates = Majiang.Util.tingpai(hand13) || [];

                if (candidates.length === 0) { context.done(); return; }

                /* 只有一张听牌：直接选择，不弹 UI */
                if (candidates.length === 1) {
                    let chosenPai = candidates[0];
                    if (context.rongpai) {
                        let lunban = context.lunban;
                        let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                        context._overrideRongpai = chosenPai + suffix;
                    } else {
                        winTileOverrider.override(shoupai, chosenPai);
                    }
                    context._overridePai = chosenPai;
                    context.done();
                    return;
                }

                /* 多张听牌：弹出牌图片选择 UI */
                let chosenPai = await input.askTileOptions(candidates, '选择视为哪张牌和牌',
                    () => candidates[Math.floor(Math.random() * candidates.length)]);
                if (!chosenPai) { context.done(); return; }
                if (context.rongpai) {
                    let lunban = context.lunban;
                    let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                    context._overrideRongpai = chosenPai + suffix;
                } else {
                    winTileOverrider.override(shoupai, chosenPai);
                }
                context._overridePai = chosenPai;
                context.done();
            },
            aiDecision: function(context) {
                if (Math.random() < 0.5) return false;
                return true;
            },
        },
    },

    /* ===== 原村和 (Haramura_Nodoka) ===== */
    'Haramura_Nodoka': {
        0: {
            /* ① 断幺/平和视为2番役 */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_YAKU_VALUE,
            condition: function(context) {
                return context.seat === context.player && !!(context.hule && context.hule.hupai);
            },
            execute: function(context) {
                let hule = context.hule;
                if (hanOps.hasYaku(hule, '断幺九')) {
                    hanOps.setYakuHan(hule, '断幺九', 2);
                }
                if (hanOps.hasYaku(hule, '平和')) {
                    hanOps.setYakuHan(hule, '平和', 2);
                }
                return { executed: true };
            },
        },

        1: {
            /* ② 允许有一个刻子的平和 — yakuExpander：副露可，至多1刻子 */
            timing: TimingPoints.CHECK_HULE,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_YAKU_VALUE,
            yakuExpander: function(context) {
                let shoupai = context.shoupai;
                let rongpai = context.rongpai;
                let game = context.game;
                let seat = context.seat;
                if (!shoupai || !game) return [];

                let model = game._model;
                if (!model) return [];

                let mianziList = Majiang.Util.hule_mianzi(shoupai, rongpai || null);
                if (!mianziList || mianziList.length === 0) return [];

                let zhuangfeng = model.zhuangfeng;
                let menfeng = seat;

                for (let mianzi of mianziList) {
                    if (mianzi.length !== 5) continue;

                    /* 统计刻子数（含副露的明刻）：条纹表示顺子，无条纹+三同数字表示刻子 */
                    let koutsuCount = 0;
                    for (let i = 1; i < mianzi.length; i++) {
                        let m = mianzi[i];
                        /* 刻子格式：Xabcd/d/d（无连字符）或 Xabcd+/d/d（有方向后缀） */
                        if (!m.includes('-') && /^[mpsz](\d)\1\1/.test(m)) koutsuCount++;
                    }
                    /* 允许至多 1 个刻子（技能允许副露平和 + 1个刻子） */
                    if (koutsuCount > 1) continue;

                    /* 检查雀头非役牌 */
                    let pair = mianzi[0];
                    if (/^z[567]/.test(pair)) continue;
                    if (pair.startsWith('z' + (zhuangfeng + 1))) continue;
                    if (pair.startsWith('z' + (menfeng + 1))) continue;

                    /* 检查听牌为两面（非单骑/嵌张/边张） */
                    let mWithHulepai = mianzi.find(m => m.includes('!'));
                    if (mWithHulepai) {
                        if (/^[mpsz](\d)\1[\+\=\-\_]\!/.test(mWithHulepai)) continue;
                        if (/^[mps]\d\d[\+\=\-\_]\!\d/.test(mWithHulepai)) continue;
                        if (/^[mps](123[\+\=\-\_]\!|7[\+\=\-\_]\!89)/.test(mWithHulepai)) continue;
                    }

                    /* 满足条件，返回虚拟平和役 */
                    return [{ name: '平和', fanshu: 1 }];
                }

                return [];
            },
        },

        2: {
            /* ③ 每局限(X+1)次暗切（X为场上立直家数） */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.HIDDEN_DISCARD,
            usageType: UsageType.CUSTOM,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;

                let riichiCount = 0;
                for (let l = 0; l < 4; l++) {
                    if (game._lizhi && game._lizhi[l]) riichiCount++;
                }
                let maxUses = riichiCount + 1;

                let used = game._skillManager
                    ? (game._skillManager.getSkillData(context.seat, 'Haramura_Nodoka', 2) || 0)
                    : 0;
                return used < maxUses;
            },
            execute: function(context) {
                let game = context.game;
                let seat = context.seat;

                let used = game._skillManager.getSkillData(seat, 'Haramura_Nodoka', 2) || 0;
                game._skillManager.setSkillData(seat, 'Haramura_Nodoka', 2, used + 1);

                game._extra_hidden_discard = true;
                return { executed: true };
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let shoupai = game._model.shoupai[seat];
                let xiangting = shoupai ? Majiang.Util.xiangting(shoupai) : 99;
                if (xiangting <= 0) return true;
                if (xiangting <= 1) return Math.random() < 0.7;
                let he = game._model.he[seat];
                let heLen = 0;
                for (let t of he._pai) {
                    if (!t.match(/[\+\=\-]$/)) heLen++;
                }
                if (heLen <= 6) return Math.random() < 0.3;
                return false;
            },
        },
    },

    /* ===== 姊带丰音 (Anetai_Toyone) ===== */
    'Anetai_Toyone': {
        0: {
            /* ① 他家舍牌后副露该家前X排牌河的牌（X=已有副露数，仅吃上家） */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_FULOU_RULE,
            priority: 500,

            ponExpander: function(context) {
                let game = context.game;
                let seat = context.seat;
                if (!game) return [];
                let model = game._model;
                let stats = fanModifier.getMeldStats(model, seat);
                let X = stats.total;
                if (X <= 0) return [];
                let discarder = model.lunban;
                if (discarder === seat) return [];
                let he = model.he[discarder];
                let rowLimit = X * 6;
                let seen = new Set();
                let candidates = [];
                for (let i = 0; i < Math.min(he._pai.length, rowLimit); i++) {
                    let p = he._pai[i];
                    /* 跳过暗切占位符和被副露取走的牌 */
                    if (p === '_') continue;
                    if (p.slice(-1).match(/[\+\-\=]/)) continue;
                    let base = p.slice(0, 2).replace(/\*$/, '');
                    if (!seen.has(base)) {
                        seen.add(base);
                        candidates.push(base);
                    }
                }
                return candidates;
            },

            kanExpander: function(context) {
                let game = context.game;
                let seat = context.seat;
                if (!game) return [];
                let model = game._model;
                let stats = fanModifier.getMeldStats(model, seat);
                let X = stats.total;
                if (X <= 0) return [];
                let discarder = model.lunban;
                if (discarder === seat) return [];
                let he = model.he[discarder];
                let rowLimit = X * 6;
                let seen = new Set();
                let candidates = [];
                for (let i = 0; i < Math.min(he._pai.length, rowLimit); i++) {
                    let p = he._pai[i];
                    if (p === '_') continue;
                    if (p.slice(-1).match(/[\+\-\=]/)) continue;
                    let base = p.slice(0, 2).replace(/\*$/, '');
                    if (!seen.has(base)) {
                        seen.add(base);
                        candidates.push(base);
                    }
                }
                return candidates;
            },

            chiExpander: function(context) {
                let game = context.game;
                let seat = context.seat;
                if (!game) return [];
                let model = game._model;
                /* 仅吃上家：弃牌者必须是上家 */
                if ((seat + 3) % 4 !== model.lunban) return [];
                let stats = fanModifier.getMeldStats(model, seat);
                let X = stats.total;
                if (X <= 0) return [];
                let he = model.he[model.lunban];
                let rowLimit = X * 6;
                let seen = new Set();
                let candidates = [];
                for (let i = 0; i < Math.min(he._pai.length, rowLimit); i++) {
                    let p = he._pai[i];
                    if (p === '_') continue;
                    if (p.slice(-1).match(/[\+\-\=]/)) continue;
                    let base = p.slice(0, 2).replace(/\*$/, '');
                    if (!seen.has(base)) {
                        seen.add(base);
                        candidates.push(base);
                    }
                }
                return candidates;
            },
        },

        1: {
            /* ② 三副露/追立视为1/2番役且铳点减半 */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
            effectType: EffectType.VIEW_AS_YAKU,

            parts: [
                {
                    /* Part A — DISCARD_SELECTED：记录是否追立 */
                    timing: TimingPoints.DISCARD_SELECTED,
                    condition: function(context) {
                        let game = context.game;
                        if (!game || context.player !== context.seat) return false;
                        return !!(context.dapai && context.dapai.slice(-1) === '*');
                    },
                    execute: function(context) {
                        let game = context.game;
                        let seat = context.seat;
                        /* 检查是否有其他玩家已立直 → 追立 */
                        for (let l = 0; l < 4; l++) {
                            if (l !== seat && game._lizhi && game._lizhi[l]) {
                                game._skillManager.setSkillData(
                                    seat, 'Anetai_Toyone', '_chaseRiichi', true);
                                break;
                            }
                        }
                        return { executed: true };
                    },
                },
                {
                    /* Part B — HULE_SETTLE：三副露→1番,十二落抬→2番,追立→2番（独立役种） */
                    timing: TimingPoints.HULE_SETTLE,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule.hupai);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        let seat = context.seat;
                        let game = context.game;
                        let model = game._model;
                        let shoupai = context.shoupai;

                        /* 追立：独立的2番役种 */
                        let isChaseRiichi = game._skillManager
                            ? game._skillManager.getSkillData(seat, 'Anetai_Toyone', '_chaseRiichi')
                            : false;
                        if (isChaseRiichi && hanOps.hasYaku(hule, '立直')) {
                            hanOps.setYakuHan(hule, '追立', 2);
                        }

                        /* 三副露/十二落抬 */
                        let stats = fanModifier.getMeldStats(model, seat);
                        let nonAnkanMelds = stats.total - stats.ankan;
                        if (nonAnkanMelds >= 3) {
                            let baseHandCount = _getBaseHandTileCount(shoupai);
                            let isShiErLuoTai = nonAnkanMelds >= 4 && baseHandCount === 1;
                            if (isShiErLuoTai) {
                                hanOps.setYakuHan(hule, '十二落抬', 2);
                            } else {
                                hanOps.setYakuHan(hule, '三副露', 1);
                            }
                        }

                        return { executed: true };
                    },
                },
                {
                    /* Part C — FENPEI_CALCULATED：铳点减半（追立或三副露以上时） */
                    timing: TimingPoints.FENPEI_CALCULATED,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule.fenpei);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        let seat = context.seat;
                        let game = context.game;
                        let isChaseRiichi = game._skillManager
                            ? game._skillManager.getSkillData(seat, 'Anetai_Toyone', '_chaseRiichi')
                            : false;
                        let stats = fanModifier.getMeldStats(game._model, seat);
                        let nonAnkanMelds = stats.total - stats.ankan;
                        if (context.wasRonned && (isChaseRiichi || nonAnkanMelds >= 3)) {
                            let oldPayment = hule.fenpei[seat];
                            pointPayment.multiplyPayment(hule.fenpei, seat, 0.5);
                            let newPayment = hule.fenpei[seat];
                            /* 铳点减半后，和牌家收入同步减少 */
                            let winnerSeat = context.ronBy;
                            if (winnerSeat != null && winnerSeat !== seat) {
                                let diff = oldPayment - newPayment;
                                hule.fenpei[winnerSeat] += diff;
                            }
                        }
                        return { executed: true };
                    },
                },
            ],
        },

        2: {
            /* ③ 宣言追立的巡目可以从牌河摸牌 */
            timing: TimingPoints.DRAW_SOURCE,
            type: SkillType.ACTIVE,
            usageType: UsageType.ONCE_PER_HAND,
            usageMax: 1,
            effectType: EffectType.CUSTOM,
            priority: 100,

            condition: function(context) {
                let game = context.game;
                let seat = context.seat;
                if (!game || context.player !== seat) return false;

                /* 有人立直 */
                let model = game._model;
                let hasRiichi = false;
                for (let l = 0; l < 4; l++) {
                    if (l !== seat && game._lizhi && game._lizhi[l]) {
                        hasRiichi = true;
                        break;
                    }
                }
                if (!hasRiichi) return false;

                /* 门清 */
                let shoupai = model.shoupai[seat];
                if (!shoupai) return false;
                let stats = fanModifier.getMeldStats(model, seat);
                if (stats.total > 0) return false;

                /* 点数足够立直 */
                let plIdx = model.seatToPlIdx[seat];
                if (plIdx == null || model.defen[plIdx] < 1000) return false;

                /* 手牌+牌河中至少1张牌能构成听牌型 */
                for (let l = 0; l < 4; l++) {
                    if (l === seat) continue;
                    let he = model.he[l];
                    for (let i = 0; i < he._pai.length; i++) {
                        let p = he._pai[i];
                        if (p === '_') continue;
                        if (p.slice(-1).match(/[\+\-\=]/)) continue;
                        let cloned = shoupai.clone();
                        try {
                            let base = p.slice(0, 2).replace(/\*$/, '');
                            cloned.zimo(base);
                            if (Majiang.Util.xiangting(cloned) <= 0) {
                                return true;
                            }
                        } catch(e) {}
                    }
                }

                return false;
            },

            /** 返回牌河中能构成听牌型的候选牌（供 _handleBeforeDrawSkillAction 使用） */
            riverTileFilter: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];

                let validTiles = new Set();
                for (let l = 0; l < 4; l++) {
                    if (l === seat) continue;
                    let he = model.he[l];
                    for (let i = 0; i < he._pai.length; i++) {
                        let p = he._pai[i];
                        if (p === '_') continue;
                        if (p.slice(-1).match(/[\+\-\=]/)) continue;

                        let cloned = shoupai.clone();
                        try {
                            let base = p.slice(0, 2).replace(/\*$/, '');
                            cloned.zimo(base);
                            let newShanten = Majiang.Util.xiangting(cloned);
                            if (newShanten < 1) {
                                validTiles.add(l + ':' + i);
                            }
                        } catch(e) {}
                    }
                }
                return validTiles;
            },

            execute: function(context) {
                /* 标记追立（_finish_zimo 已处理牌河摸入和手牌） */
                let game = context.game;
                let seat = context.seat;
                game._skillForceRiichi = seat;
                return { executed: true };
            },

            aiDecision: function(context) {
                return true;
            },
        },

        3: {
            /* ④ 追立/裸单骑时视为和牌 */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
            usageType: UsageType.ONCE_PER_HAND,
            usageMax: 1,
            effectType: EffectType.VIEW_AS_WIN_TILE,

            huleExpander: function(context) {
                let shoupai = context.shoupai;
                let game = context.game;
                let seat = context.seat;
                if (!shoupai || !game) return [];

                let isChaseRiichi = game._skillManager
                    ? game._skillManager.getSkillData(seat, 'Anetai_Toyone', '_sk4_chaseRiichi')
                    : false;
                let baseHandCount = _getBaseHandTileCount(shoupai);
                let isBareTanki = baseHandCount === 1;

                if (!isChaseRiichi && !isBareTanki) return [];

                /* 获取听牌列表 */
                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length <= 2) {
                    try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                }
                hand13._zimo = null;
                let ting = Majiang.Util.tingpai(hand13) || [];
                if (ting.length === 0) return[];

                /* 收集候补牌：
                   自摸时：点数或花色相同皆可
                   荣和时：仅点数相同 */
                let waitNumbers = new Set(ting.map(function(t) { return tileUtils.numberOf(t); }));
                let waitSuits = new Set(ting.map(function(t) { return tileUtils.suitOf(t); }));
                let isRong = !!context.rongpai;

                let candidates = new Set();
                let suits = ['m', 'p', 's', 'z'];
                for (let s = 0; s < suits.length; s++) {
                    let maxN = suits[s] === 'z' ? 7 : 9;
                    for (let n = 1; n <= maxN; n++) {
                        let pai = suits[s] + n;
                        if (isRong) {
                            if (waitNumbers.has(n)) candidates.add(pai);
                        } else {
                            if (waitNumbers.has(n) || (suits[s] !== 'z' && waitSuits.has(suits[s]))) {
                                candidates.add(pai);
                            }
                        }
                    }
                    if (suits[s] !== 'z') {
                        if (isRong) {
                            if (waitNumbers.has(5)) candidates.add(suits[s] + '0');
                        } else {
                            if (waitNumbers.has(5) || waitSuits.has(suits[s])) {
                                candidates.add(suits[s] + '0');
                            }
                        }
                    }
                }

                /* 移除听牌本身（已在正常和牌范围） */
                for (let t = 0; t < ting.length; t++) {
                    candidates.delete(ting[t]);
                    if (ting[t][1] === '0') candidates.delete(ting[t][0] + '5');
                    if (ting[t][1] === '5') candidates.delete(ting[t][0] + '0');
                }

                return Array.from(candidates);
            },

            /* 和牌时的选牌 UI */
            execute: async function(context) {
                let shoupai = context.shoupai;
                let menfeng = context.seat;
                let input = context.input;

                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length <= 2) {
                    try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                }
                hand13._zimo = null;
                let candidates = Majiang.Util.tingpai(hand13) || [];

                if (candidates.length === 0) { context.done(); return; }

                if (candidates.length === 1) {
                    let chosenPai = candidates[0];
                    if (context.rongpai) {
                        let lunban = context.lunban;
                        let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                        context._overrideRongpai = chosenPai + suffix;
                    } else {
                        winTileOverrider.override(shoupai, chosenPai);
                    }
                    context._overridePai = chosenPai;
                    context.done();
                    return;
                }

                let chosenPai = await input.askTileOptions(candidates,
                    '选择视为哪张牌和牌（追立/裸单骑）',
                    function() { return candidates[0]; });
                if (!chosenPai) { context.done(); return; }

                if (context.rongpai) {
                    let lunban = context.lunban;
                    let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                    context._overrideRongpai = chosenPai + suffix;
                } else {
                    winTileOverrider.override(shoupai, chosenPai);
                }
                context._overridePai = chosenPai;
                context.done();
            },

            parts: [
                {
                    /* Part A — DISCARD_SELECTED：独立记录追立 */
                    timing: TimingPoints.DISCARD_SELECTED,
                    type: SkillType.PASSIVE,
                    consumeUsage: false,
                    condition: function(context) {
                        let game = context.game;
                        if (!game || context.player !== context.seat) return false;
                        return !!(context.dapai && context.dapai.slice(-1) === '*');
                    },
                    execute: function(context) {
                        let game = context.game;
                        let seat = context.seat;
                        for (let l = 0; l < 4; l++) {
                            if (l !== seat && game._lizhi && game._lizhi[l]) {
                                game._skillManager.setSkillData(
                                    seat, 'Anetai_Toyone', '_sk4_chaseRiichi', true);
                                break;
                            }
                        }
                        return { executed: true };
                    },
                },
                {
                    /* Part B — DECLARE_HULE：追立/裸单骑时视为和牌 */
                    timing: TimingPoints.DECLARE_HULE,
                    type: SkillType.PASSIVE,
                    condition: function(context) {
                        let shoupai = context.shoupai;
                        let game = context.game;
                        let seat = context.seat;
                        if (!shoupai || !game) return false;

                        let isChaseRiichi = game._skillManager
                            ? game._skillManager.getSkillData(seat, 'Anetai_Toyone', '_sk4_chaseRiichi')
                            : false;
                        let baseHandCount = _getBaseHandTileCount(shoupai);
                        let isBareTanki = baseHandCount === 1;

                        if (!isChaseRiichi && !isBareTanki) return false;

                        let hand13 = shoupai.clone();
                        let origZimo = shoupai._zimo;
                        if (!context.rongpai && origZimo && origZimo.length <= 2) {
                            try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                        }
                        hand13._zimo = null;
                        let ting = Majiang.Util.tingpai(hand13) || [];
                        return ting.length > 0;
                    },
                    execute: async function(context) {
                        let game = context.game;
                        let shoupai = context.shoupai;
                        let menfeng = context.seat;
                        let input = context.input;

                        if (!input || typeof input.askTileOptions !== 'function') return;

                        let tryDone = function() {
                            if (typeof context.done === 'function') context.done();
                        };

                        let hand13 = shoupai.clone();
                        let origZimo = shoupai._zimo;
                        if (!context.rongpai && origZimo && origZimo.length <= 2) {
                            try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                        }
                        hand13._zimo = null;
                        let candidates = Majiang.Util.tingpai(hand13) || [];

                        if (candidates.length === 0) { tryDone(); return; }

                        if (candidates.length === 1) {
                            let chosenPai = candidates[0];
                            if (context.rongpai) {
                                let lunban = context.lunban;
                                let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                                context._overrideRongpai = chosenPai + suffix;
                            } else {
                                winTileOverrider.override(shoupai, chosenPai);
                            }
                            context._overridePai = chosenPai;
                            tryDone();
                            return;
                        }

                        let chosenPai = await input.askTileOptions(candidates,
                            '选择视为哪张牌和牌（追立/裸单骑）',
                            function() { return candidates[0]; });
                        if (!chosenPai) { tryDone(); return; }

                        if (context.rongpai) {
                            let lunban = context.lunban;
                            let suffix = '_+=-'[(4 + lunban - menfeng) % 4];
                            context._overrideRongpai = chosenPai + suffix;
                        } else {
                            winTileOverrider.override(shoupai, chosenPai);
                        }
                        context._overridePai = chosenPai;
                        tryDone();
                    },
                },
            ],

            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 新子憧 (Atarashi_Ako) ===== */
    'Atarashi_Ako': {
        0: {
            /* ① 副露舍牌前,可以用一张手牌交换牌河中花色或点数相同的一张牌 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            effectType: EffectType.SWAP_TILES,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                let turnType = context.turnType;
                if (turnType === TurnType.FULOU) return true;
                if (turnType !== TurnType.KAN) return false;
                /* 杠巡目中仅大明杠可发动。
                 * 暗杠 = 四张同数字且方向符全相同（全 - 或全 +）
                 * 加杠 = 原有碰的面子加一张（格式：三张+方向符+一张）*/
                let shoupai = game._model.shoupai[context.seat];
                let fulou = shoupai && shoupai._fulou;
                if (!fulou || fulou.length === 0) return false;
                let lastMeld = fulou[fulou.length - 1];
                if (typeof lastMeld !== 'string') return false;
                /* 加杠 → false */
                if (/^\w\d\w\d\w\d[\+\=\-]\d$/.test(lastMeld)) return false;
                /* 暗杠 → false */
                let digits = (lastMeld.match(/\d/g) || []).map(Number);
                if (digits.length === 4) {
                    let normalized = digits.map(function(d) { return d === 0 ? 5 : d; });
                    if (normalized.every(function(d) { return d === normalized[0]; })) {
                        let signs = lastMeld.match(/[\-\+]/g) || [];
                        if (signs.length === 4 && signs.every(function(s) { return s === signs[0]; })) {
                            return false;
                        }
                    }
                }
                return true;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));

                /* 阶段0：过滤字牌，保留可交换的手牌 */
                let allHandTiles = _getHandTiles(shoupai);
                let handTiles = allHandTiles.filter(function(t) { return t[0] !== 'z'; });
                if (handTiles.length === 0) { context.done(); return; }

                /* 阶段1：收集牌河中能被手牌匹配的牌（花色或点数相同） */
                let matches = [], matchLabels = [], matchValues = [];
                let seatNames = ['自家', '下家', '对家', '上家'];
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        if (t.match(/[\+\=\-]$/)) continue;
                        let base = t.replace(/[_\*]$/, '');
                        /* 存在至少一张非字手牌与该河牌花色或点数相同 */
                        let ok = false;
                        for (let j = 0; j < handTiles.length; j++) {
                            if (handTiles[j][0] === tileUtils.suitOf(base)
                                || tileUtils.numberOf(handTiles[j]) === tileUtils.numberOf(base)) {
                                ok = true;
                                break;
                            }
                        }
                        if (ok) {
                            let relSeat = (s - seat + 4) % 4;
                            let label = seatNames[relSeat] + '·' + game._pai_name(base);
                            matches.push({ pai: base, seat: s, index: i, label: label });
                            matchLabels.push(label);
                            matchValues.push(s + ':' + i);
                        }
                    }
                }

                if (matches.length === 0) { context.done(); return; }

                /* 阶段2：选择牌河牌（牌河直接点击，仅1张自动跳过） */
                let choice;
                if (matches.length === 1) {
                    choice = matchValues[0];
                } else {
                    let selected = await input.askRiverTile(
                        '选择牌河中的牌交换',
                        function() {
                            let bestIdx = 0, bestVal = _evalTileValue(matches[0].pai, game, seat);
                            for (let i = 1; i < matches.length; i++) {
                                let val = _evalTileValue(matches[i].pai, game, seat);
                                if (val > bestVal) { bestVal = val; bestIdx = i; }
                            }
                            return { pai: matches[bestIdx].pai, seat: matches[bestIdx].seat, index: matches[bestIdx].index };
                        },
                        matchValues);
                    if (!selected) { context.done(); return; }
                    choice = selected.seat + ':' + selected.index;
                }
                if (!choice) { context.done(); return; }

                let parts = choice.split(':');
                let targetSeat = parseInt(parts[0]), targetIdx = parseInt(parts[1]);
                let match = null;
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i].seat === targetSeat && matches[i].index === targetIdx) {
                        match = matches[i];
                        break;
                    }
                }
                if (!match) { context.done(); return; }

                let riverPai = match.pai;
                let riverSuit = riverPai[0], riverNum = tileUtils.numberOf(riverPai);

                /* 阶段3：选择能与该河牌交换的手牌（手牌直接点击，仅1张自动跳过） */
                let matchingHand = [];
                for (let i = 0; i < handTiles.length; i++) {
                    let ht = handTiles[i];
                    if (ht[0] === riverSuit || tileUtils.numberOf(ht) === riverNum) {
                        matchingHand.push(ht);
                    }
                }
                if (matchingHand.length === 0) { context.done(); return; }

                let handTile;
                if (matchingHand.length === 1) {
                    handTile = matchingHand[0];
                } else {
                    handTile = await input.askHandTile(
                        '选择与「' + game._pai_name(riverPai) + '」交换的手牌',
                        function() {
                            let worst = matchingHand[0];
                            let worstVal = _evalHandTileValue(worst, shoupai, game, seat);
                            for (let i = 1; i < matchingHand.length; i++) {
                                let val = _evalHandTileValue(matchingHand[i], shoupai, game, seat);
                                if (val < worstVal) { worstVal = val; worst = matchingHand[i]; }
                            }
                            return worst;
                        },
                        matchingHand);
                }
                if (!handTile) { context.done(); return; }

                /* 阶段4：执行交换 */
                tileOps.removeFromHand(shoupai, handTile);
                model.he[targetSeat]._pai[targetIdx] = handTile + '_';
                tileOps.addToHand(shoupai, match.pai);
                /* addToHand 已设置 _zimo，杠巡目可自动进行岭上开花判定 */

                game._add_action_log(spname + ' 将「' + game._pai_name(handTile)
                    + '」与' + match.label + '交换', seat);

                context.done();
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                if (!shoupai) return false;

                let allHandTiles = _getHandTiles(shoupai);
                let handTiles = allHandTiles.filter(function(t) { return t[0] !== 'z'; });
                if (handTiles.length === 0) return false;

                for (let i = 0; i < handTiles.length; i++) {
                    let handTile = handTiles[i];
                    let handSuit = handTile[0], handNum = tileUtils.numberOf(handTile);
                    let handVal = _evalHandTileValue(handTile, shoupai, game, seat);

                    for (let s = 0; s < 4; s++) {
                        let he = model.he[s];
                        if (!he) continue;
                        for (let j = 0; j < he._pai.length; j++) {
                            let t = he._pai[j];
                            if (t.match(/[\+\=\-]$/)) continue;
                            let base = t.replace(/[_\*]$/, '');
                            let ok = tileUtils.suitOf(base) === handSuit
                                || tileUtils.numberOf(base) === handNum;
                            if (ok && _evalTileValue(base, game, seat) > handVal) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            },
        },
        1: {
            /* ② 和牌时,若有人未完成前两排牌河,额外收取点数 */
            timing: TimingPoints.FENPEI_CALCULATED,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_PAYMENT,
            condition: function(context) {
                let hule = context.hule;
                if (!hule || !hule.fenpei) return false;
                return hule.fenpei[context.seat] > 0;
            },
            execute: function(context) {
                let hule = context.hule;
                let game = context.game;
                let model = game._model;
                let winnerSeat = context.seat;

                /* 判断是否为荣和（只有1家负分） */
                let payers = [];
                for (let i = 0; i < 4; i++) {
                    if (hule.fenpei[i] < 0) payers.push(i);
                }
                let isRon = payers.length === 1;
                let ronnedSeat = isRon ? payers[0] : -1;

                /* 统计各家牌河牌数（不计副露） */
                let riverCounts = [];
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) { riverCounts.push(0); continue; }
                    let count = 0;
                    for (let j = 0; j < he._pai.length; j++) {
                        if (!he._pai[j].match(/[\+\=\-]$/)) count++;
                    }
                    /* 荣和的牌不计入完成牌河 */
                    if (isRon && s === ronnedSeat) {
                        count = Math.max(0, count - 1);
                    }
                    riverCounts.push(count);
                }

                /* 判定未完成的排 */
                let hasRow1Incomplete = false;
                for (let s = 0; s < 4; s++) {
                    if (riverCounts[s] < 6) { hasRow1Incomplete = true; break; }
                }
                let hasRow2Incomplete = false;
                if (!hasRow1Incomplete) {
                    for (let s = 0; s < 4; s++) {
                        if (riverCounts[s] < 12) { hasRow2Incomplete = true; break; }
                    }
                }

                let penalty = 0;
                if (hasRow1Incomplete) {
                    penalty = 2000;
                } else if (hasRow2Incomplete) {
                    penalty = 1000;
                }

                if (penalty > 0) {
                    for (let s = 0; s < 4; s++) {
                        if (s === winnerSeat) continue;
                        pointPayment.modifyPayment(hule.fenpei, s, winnerSeat, penalty);
                    }
                }

                return { executed: true };
            },
        },
    },

    /* ===== 雀明华 (Choe_Myeonghwa) ===== */
    'Choe_Myeonghwa': {
        0: {
            /* ① 自风/场风役牌刻子算2番 */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_YAKU_VALUE,
            condition: function(context) {
                return context.seat === context.player
                    && !!(context.hule && context.hule.hupai);
            },
            execute: function(context) {
                let hule = context.hule;
                let game = context.game;
                let model = game._model;
                let seat = context.seat;

                let fengName = ['東','南','西','北'];
                /* 自风 */
                let ziYaku = '自风 ' + fengName[seat];
                if (hanOps.hasYaku(hule, ziYaku)) {
                    hanOps.setYakuHan(hule, ziYaku, 2);
                }
                /* 场风 */
                let changYaku = '场风 ' + fengName[model.zhuangfeng];
                if (hanOps.hasYaku(hule, changYaku)) {
                    hanOps.setYakuHan(hule, changYaku, 2);
                }

                return { executed: true };
            },
        },
        1: {
            /* ② 他家手牌中有你的自风牌时不能宣言和牌（役满除外）
             * 暗杠/副露不计入"手牌"；确定的13番以上（不计里宝牌）视为役满 */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
            effectType: EffectType.NONE,
            huleRestrictor: function(context) {
                let game = context.game;
                let model = game._model;
                let mySeat = context.mySeat;
                let targetSeat = context.seat;
                let shoupai = context.shoupai;
                if (!shoupai || !model) return null;

                /* 雀明华的自风 */
                let myWind = 'z' + (mySeat + 1);

                /* 检查手牌（_bingpai，不含副露/暗杠）中是否有自风 */
                let bingpai = shoupai._bingpai;
                if (!bingpai || !bingpai.z || !bingpai.z[mySeat + 1]) return null;

                /* 手牌中有自风 → 检查是否役满 */
                let isTsumo = !!(shoupai._zimo && shoupai._zimo.length >= 2);
                let testShoupai, rongpai;
                if (isTsumo) {
                    testShoupai = shoupai;
                    rongpai = null;
                } else {
                    testShoupai = shoupai.clone();
                    if (game._status === 'gang') {
                        rongpai = game._gang[0] + game._gang.slice(-1);
                    } else {
                        rongpai = game._dapai;
                    }
                    try { testShoupai.zimo(rongpai); } catch(e) {
                        return { forbidRon: true, forbidTsumo: true };
                    }
                }

                /* 计算确定番数（fubaopai 置空以不计里宝牌） */
                let param = {
                    rule: game._rule,
                    zhuangfeng: model.zhuangfeng,
                    menfeng: targetSeat,
                    hupai: {},
                    baopai: model.shan ? model.shan.baopai : [],
                    fubaopai: [],
                    jicun: { changbang: 0, lizhibang: 0 },
                };
                let hule = Majiang.Util.hule(testShoupai, rongpai, param);
                if (hule && hule.hupai && hule.hupai.length > 0) {
                    /* 役満（fanshu 为 '*' 的第一个元素） */
                    if (hule.hupai[0].fanshu[0] === '*') return null;
                    /* 累计役滿（确定的13番以上） */
                    let totalHan = 0;
                    for (let i = 0; i < hule.hupai.length; i++) {
                        totalHan += hule.hupai[i].fanshu;
                    }
                    if (totalHan >= 13) return null;
                }

                return { forbidRon: true, forbidTsumo: true };
            },
        },
        2: {
            /* ③ 每个巡目舍牌前，用幺九牌交换牌河中自风/场风牌 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            priority: 350,
            effectType: EffectType.SWAP_TILES,
            condition: function(context) {
                return !!(context.game && context.player === context.seat);
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));

                /* 阶段0：过滤幺九手牌（1/9 或字牌） */
                let allHandTiles = _getHandTiles(shoupai);
                let yaojiuHand = allHandTiles.filter(function(t) {
                    if (t[0] === 'z') return true;
                    let n = tileUtils.numberOf(t);
                    return n === 1 || n === 9;
                });
                if (yaojiuHand.length === 0) { context.done(); return; }

                /* 阶段1：收集牌河中的自风/场风牌 */
                let selfWind = 'z' + (seat + 1);
                let fieldWind = 'z' + (model.zhuangfeng + 1);
                let isSame = selfWind === fieldWind;

                let matches = [], matchLabels = [], matchValues = [];
                let seatNames = ['自家', '下家', '对家', '上家'];
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        if (t.match(/[\+\=\-]$/)) continue;
                        let base = t.replace(/[_\*]$/, '');
                        if (base === selfWind || base === fieldWind) {
                            let relSeat = (s - seat + 4) % 4;
                            let label = seatNames[relSeat] + '·' + game._pai_name(base);
                            matches.push({ pai: base, seat: s, index: i, label: label });
                            matchLabels.push(label);
                            matchValues.push(s + ':' + i);
                        }
                    }
                }

                if (matches.length === 0) { context.done(); return; }

                /* 阶段2：选择牌河牌（直接点击，仅1张自动跳过） */
                let choice;
                if (matches.length === 1) {
                    choice = matchValues[0];
                } else {
                    let selected = await input.askRiverTile(
                        '选择牌河中的' + (isSame ? '自风/场风牌' : '自风或场风牌') + '交换',
                        function() {
                            return { pai: matches[0].pai, seat: matches[0].seat, index: matches[0].index };
                        },
                        matchValues);
                    if (!selected) { context.done(); return; }
                    choice = selected.seat + ':' + selected.index;
                }
                if (!choice) { context.done(); return; }

                let parts = choice.split(':');
                let targetSeat = parseInt(parts[0]), targetIdx = parseInt(parts[1]);
                let match = null;
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i].seat === targetSeat && matches[i].index === targetIdx) {
                        match = matches[i];
                        break;
                    }
                }
                if (!match) { context.done(); return; }

                /* 阶段3：选择幺九手牌（直接点击，仅1张自动跳过） */
                let handTile;
                if (yaojiuHand.length === 1) {
                    handTile = yaojiuHand[0];
                } else {
                    handTile = await input.askHandTile(
                        '选择幺九牌与「' + game._pai_name(match.pai) + '」交换',
                        function() {
                            let worst = yaojiuHand[0];
                            let worstVal = _evalHandTileValue(worst, shoupai, game, seat);
                            for (let i = 1; i < yaojiuHand.length; i++) {
                                let val = _evalHandTileValue(yaojiuHand[i], shoupai, game, seat);
                                if (val < worstVal) { worstVal = val; worst = yaojiuHand[i]; }
                            }
                            return worst;
                        },
                        yaojiuHand);
                }
                if (!handTile) { context.done(); return; }

                /* 阶段4：执行交换 */
                tileOps.removeFromHand(shoupai, handTile);
                model.he[targetSeat]._pai[targetIdx] = handTile + '_';
                tileOps.addToHand(shoupai, match.pai);

                game._add_action_log(spname + ' 将幺九牌「' + game._pai_name(handTile)
                    + '」与' + match.label + '交换', seat);

                context.done();
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                if (!shoupai) return false;

                /* 收集幺九手牌 */
                let allHandTiles = _getHandTiles(shoupai);
                let yaojiuHand = allHandTiles.filter(function(t) {
                    if (t[0] === 'z') return true;
                    let n = tileUtils.numberOf(t);
                    return n === 1 || n === 9;
                });
                if (yaojiuHand.length === 0) return false;

                /* 检查牌河中是否有自风/场风 */
                let selfWind = 'z' + (seat + 1);
                let fieldWind = 'z' + (model.zhuangfeng + 1);
                let hasRiverMatch = false;
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        if (t.match(/[\+\=\-]$/)) continue;
                        let base = t.replace(/[_\*]$/, '');
                        if (base === selfWind || base === fieldWind) {
                            hasRiverMatch = true;
                            break;
                        }
                    }
                    if (hasRiverMatch) break;
                }
                if (!hasRiverMatch) return false;

                /* 发动条件：河牌价值高于手牌最低幺九牌价值 */
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        if (t.match(/[\+\=\-]$/)) continue;
                        let base = t.replace(/[_\*]$/, '');
                        if (base !== selfWind && base !== fieldWind) continue;
                        let riverVal = _evalTileValue(base, game, seat);
                        for (let j = 0; j < yaojiuHand.length; j++) {
                            if (_evalHandTileValue(yaojiuHand[j], shoupai, game, seat) < riverVal) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            },
        },
    },
};

/**
 * 技能注册表类
 * 将 characters_skills.js 的角色数据转为可执行技能
 */
class SkillRegistry {

    /**
     * @param {Object[]} characters - 角色数据
     */
    constructor(characters) {
        /** characterId -> processedCharacter */
        this._characters = {};

        /** skillId -> Skill */
        this._skills = {};

        this._load(characters);
    }

    /**
     * 加载角色数据，创建技能对象
     */
    _load(characters) {
        for (let char of characters) {
            let processed = {
                id: char.id,
                name: char.name,
                card: char.card,
                skills: [],
            };

            for (let i = 0; i < char.skills.length; i++) {
                let skill = createSkill(char, i, char.skills[i]);
                processed.skills.push(skill);
                this._skills[skill.id] = skill;
            }

            this._characters[char.id] = processed;
        }
    }

    /**
     * 通过角色 ID 获取角色及其技能
     * @param {string} characterId
     * @returns {Object|null}
     */
    getCharacter(characterId) {
        return this._characters[characterId] || null;
    }

    /**
     * 通过技能 ID 获取技能
     * @param {string} skillId
     * @returns {Object|null}
     */
    getSkill(skillId) {
        return this._skills[skillId] || null;
    }

    /**
     * 获取角色的所有技能
     * @param {string} characterId
     * @returns {Object[]}
     */
    getCharacterSkills(characterId) {
        let char = this._characters[characterId];
        return char ? char.skills : [];
    }

    /**
     * 查询在指定时机可以触发的技能
     *
     * @param {number} currentSeat - 当前玩家模型席位 (0-3)，用于座次排序
     * @param {string} timing - 触发时机
     * @param {string[]} activeCharacterIds - 4 个游戏席位当前激活的角色ID（按 seat 索引）
     * @param {number[]} [seatToPlIdx] - seat→plIdx 映射表（seatToPlIdx[seat] = plIdx），用于座次排序
     * @returns {Object[]} 匹配的技能列表 [{ seat, skill, priority }]，seat 是游戏席位
     */
    querySkills(currentSeat, timing, activeCharacterIds, seatToPlIdx) {
        let results = [];

        /* 遍历所有游戏席位（s = seat，0=东/1=南/2=西/3=北） */
        for (let s = 0; s < activeCharacterIds.length; s++) {
            let charId = activeCharacterIds[s];
            if (!charId) continue;

            let char = this._characters[charId];
            if (!char) continue;

            for (let skill of char.skills) {
                /* 跳过封印的技能 */
                if (skill.sealed.currently) continue;

                /* 检查使用次数 */
                if (skill.usage.type !== UsageType.UNLIMITED &&
                    skill.usage.current >= skill.usage.max) continue;

                /* 主时点匹配 */
                if (skill.trigger.timing === timing) {
                    results.push({
                        seat: s,
                        skill: skill,
                        priority: skill.trigger.priority,
                    });
                }

                /* 子技能（parts）时点匹配 */
                if (skill.parts) {
                    for (let part of skill.parts) {
                        if (part.timing === timing) {
                            results.push({
                                seat: s,
                                skill: skill,
                                part: part,
                                priority: part.priority !== undefined
                                    ? part.priority : skill.trigger.priority,
                            });
                        }
                    }
                }
            }
        }

        /* 按优先级排序（数字大的先结算） */
        results.sort((a, b) => b.priority - a.priority);

        /* 同优先级时按座次（从当前玩家顺时针） */
        results.sort((a, b) => {
            if (b.priority !== a.priority) return 0;
            /* a.seat / b.seat 已经是游戏席位，用 seatToPlIdx 可转为 plIdx 做距离计算 */
            let seatA = seatToPlIdx ? seatToPlIdx[a.seat] : a.seat;
            let seatB = seatToPlIdx ? seatToPlIdx[b.seat] : b.seat;
            let distA = (seatA - currentSeat + 4) % 4;
            let distB = (seatB - currentSeat + 4) % 4;
            return distA - distB;
        });

        return results;
    }

    /**
     * 获取所有角色列表
     */
    getAllCharacters() {
        return Object.values(this._characters);
    }
}

module.exports = SkillRegistry;
