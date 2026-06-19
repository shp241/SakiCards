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
const { TimingPoints } = require('./triggers');

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
 * 判断摸到 tile 后是否会被 AI 立刻切出同名牌
 * （p0/p5 视为不同牌）
 *
 * 逻辑：模拟摸牌 → 遍历所有可选弃牌 →
 * 若弃掉刚摸的牌或手牌已有的同名牌（basename 一致）
 * 就能达到最佳向听数（且不能比原手牌更优），则牌无用。
 *
 * @param {Object} hand - 当前手牌（克隆）
 * @param {string} tile - 要摸入的牌
 * @param {Function} xiangtingFn - 向听数计算函数
 * @param {Function} getDapaiFn - 获取可选弃牌列表的函数
 * @returns {boolean} 是否会被立刻切出
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
    let sameNameShanten = Infinity;
    let canTsumogiri = false;
    let canDiscardSameName = false;
    let tileBase = tile.replace(/[_\*\+\=\-]$/, '');
    for (let d of dapaiList) {
        let discardHand = testHand.clone();
        let dBase = d.replace(/[_\*\+\=\-]$/, '');
        let isTsumogiri = d.endsWith('_');
        try { discardHand.decrease(dBase, isTsumogiri ? '+' : '_'); } catch(e) { continue; }
        let s = xiangtingFn(discardHand);
        if (s < bestAfterDiscard) bestAfterDiscard = s;
        if (dBase === tileBase) {
            if (isTsumogiri) {
                tsumogiriShanten = s;
                canTsumogiri = true;
            } else {
                if (s < sameNameShanten) sameNameShanten = s;
                canDiscardSameName = true;
            }
        }
    }
    /* 若任一弃牌能改善向听 → 牌有用，不弃 */
    if (bestAfterDiscard < origShanten) return false;
    /* 若能打出同名牌（摸切或手牌中已有的）且达到最佳向听 → 牌无用 */
    if (canTsumogiri && tsumogiriShanten <= bestAfterDiscard) return true;
    if (canDiscardSameName && sameNameShanten <= bestAfterDiscard) return true;
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
 * 反向宝牌指示牌：对于指示牌 X，返回将其视为 doraOf 的牌 T（即 doraOf(T) = X）。
 * 等价于「宝牌指示牌的前一张牌」。
 *
 * 数牌：1←9←8←…←2←1，前一张即 n-1（1的前一张是9）
 * 风牌：东←北←西←南←东
 * 三元牌：白←中←発←白
 *
 * @param {string} indicator — 宝牌指示牌
 * @returns {string} 反向指示牌
 */
function _reverseDoraOf(indicator) {
    let s = indicator[0];
    let n = parseInt(indicator[1]) || 5;
    if (s === 'z') {
        if (n <= 4) {
            /* 风牌：1→4, 2→1, 3→2, 4→3 */
            return s + (n === 1 ? 4 : n - 1);
        } else {
            /* 三元牌：5→7, 6→5, 7→6 */
            return s + ((n - 3) % 3 + 5);
        }
    } else {
        /* 数牌：1→9, 2→1, ..., 9→8 */
        return s + (n === 1 ? 9 : n - 1);
    }
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

/**
 * 国广一技能①②共用交换逻辑：
 * 选一张手牌 → 筛选牌河中花色或点数相同的数牌 → 选一张牌河牌 → 交换。
 *
 * @param {Object} context - 技能上下文
 * @param {Object} game - 游戏实例
 * @param {number} seat - 技能持有者席位
 * @param {Object} model - 游戏 model
 * @param {Object} input - 输入接口
 * @param {Object} shoupai - 手牌
 * @param {string} spname - 玩家显示名
 */
async function _kunihiroSwap(context, game, seat, model, input, shoupai, spname) {
    const CLASS_TO_OFFSET = { main: 0, xiajia: 1, duimian: 2, shangjia: 3 };
    const OFFSET_TO_CLASS = ['main', 'xiajia', 'duimian', 'shangjia'];

    /* ── ExchangePrompt（人类/AI 统一路径） ── */
    let pairs = await input.askExchange({
        swapCount: 1,
        condition: 'suit_or_number',
        pairing: 'hand_river',
        description: '选择手牌与牌河中的数牌交换',
    }, () => {
        /* AI 默认：选能最大程度降低向听数的交换对 */
        let currentShanten = Majiang.Util.xiangting(shoupai);
        let handTiles = [...new Set(_getHandTiles(shoupai))].filter(t => t[0] !== 'z');
        if (handTiles.length === 0) return null;
        let bestHand = null, bestRiver = null, bestRiverSeat = -1, bestRiverIdx = -1, bestShanten = 99;
        for (let handTile of handTiles) {
            for (let s = 0; s < 4; s++) {
                let he = model.he[s];
                if (!he) continue;
                for (let i = 0; i < he._pai.length; i++) {
                    if (he._pai[i] === '_') continue;
                    let base = he._pai[i].replace(/[_\*]$/, '');
                    if (base[0] === 'z') continue;
                    if (!tileUtils.sameSuit(handTile, base) && !tileUtils.sameNumber(handTile, base)) continue;
                    let test = shoupai.clone();
                    tileOps.removeFromHand(test, handTile);
                    tileOps.addToHand(test, base);
                    let st = Majiang.Util.xiangting(test);
                    if (st < bestShanten) {
                        bestShanten = st;
                        bestHand = handTile;
                        bestRiver = base;
                        bestRiverSeat = s;
                        bestRiverIdx = i;
                    }
                }
            }
        }
        if (!bestHand || bestShanten >= currentShanten) return null;
        let riverClass = OFFSET_TO_CLASS[(bestRiverSeat - seat + 4) % 4];
        return [{ a: { tile: bestHand, player: 'hand', idx: -1 }, b: { tile: bestRiver, player: riverClass, idx: bestRiverIdx } }];
    });
    if (pairs && pairs.length > 0) {
        let p = pairs[0];
        /* 区分手牌和牌河 */
        let handTile, riverSeat, riverIdx;
        if (p.a.player === 'hand') {
            handTile = p.a.tile;
            riverSeat = (seat + (CLASS_TO_OFFSET[p.b.player] || 0)) % 4;
            riverIdx = p.b.idx;
        } else {
            handTile = p.b.tile;
            riverSeat = (seat + (CLASS_TO_OFFSET[p.a.player] || 0)) % 4;
            riverIdx = p.a.idx;
        }
        /* 验证：仅数牌 */
        if (handTile[0] === 'z') { context.done(); return; }
        let riverTile = model.he[riverSeat]._pai[riverIdx];
        if (!riverTile || riverTile === '_' || riverTile[0] === 'z') { context.done(); return; }
        let riverBase = riverTile.replace(/[_\*]$/, '');
        /* 执行交换 */
        model.he[riverSeat]._pai[riverIdx] = handTile + '_';
        tileOps.swapInHand(shoupai, handTile, riverBase);
        game._add_action_log(spname + ' 将「' + game._pai_name(handTile)
            + '」与牌河「' + game._pai_name(riverBase) + '」交换', seat);
        if (game._view) game._view.redraw();
        context.done();
        return;
    }

    /* askExchange 未返回有效交换，技能取消 */
    context.done();
}

/**
 * 涩谷尧深：获取自家当前排牌河首张牌（不含被副露标记和 _/* 修饰）
 * @param {Object} he - 牌河对象
 * @returns {string|null} 首张牌的牌面字符串
 */
function _getRiverFirstTile(he) {
    if (!he || he._pai.length === 0) return null;
    let count = tileUtils.countHePai(he);
    if (count === 0) return null;
    let rowStart = Math.floor((count - 1) / 6) * 6;
    if (rowStart >= he._pai.length) return null;
    /* 该排首张为暗置牌则无法触发 */
    let t = he._pai[rowStart];
    if (t === '_') return null;
    return t.replace(/[_\*]$/, '');
}

/**
 * 获取手牌中所有牌面字符串列表（含重复）
 * @param {Object} shoupai
 * @returns {string[]}
 */
function _getAllHandTiles(shoupai) {
    let tiles = [];
    for (let s of ['m', 'p', 's', 'z']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        let maxN = s === 'z' ? 7 : 9;
        for (let n = 1; n <= maxN; n++) {
            let count = bp[n] || 0;
            if (n === 5 && s !== 'z') count -= (bp[0] || 0);
            for (let i = 0; i < count; i++) {
                tiles.push(s + n);
            }
        }
        if (s !== 'z' && bp[0]) {
            for (let i = 0; i < bp[0]; i++) {
                tiles.push(s + '0');
            }
        }
    }
    return tiles;
}

/**
 * 检查手牌中是否存在未公开的牌
 * @param {Object} shoupai
 * @param {Set} openedSet
 * @returns {boolean}
 */
function _hasUnopenedTiles(shoupai, openedSet) {
    let tiles = _getAllHandTiles(shoupai);
    for (let t of tiles) {
        if (!openedSet.has(t)) return true;
    }
    return false;
}

/**
 * 神代小莳：根据 hule.defen 重新计算 fenpei（点数分配）
 * @param {Object} context — FENPEI_CALCULATED 上下文
 * @param {Object} hule — 和牌结果
 * @param {number} seat — 和牌者席位
 */
function _recalcJindaiFenpei(context, hule, seat) {
    let game = context.game;
    let model = game._model;
    let chang = model.changbang || 0;
    let lizhi = model.lizhibang || 0;
    let defen = hule.defen;
    let isRon = !!context.rongpai;

    if (isRon) {
        let ronSeat = model.lunban;
        hule.fenpei[seat] = defen + chang * 300 + lizhi * 1000;
        hule.fenpei[ronSeat] = -(defen + chang * 300);
    } else if (seat === 0) {
        /* 庄家自摸 */
        let zhuangjia = Math.ceil(defen / 3 / 100) * 100;
        hule.fenpei[0] = defen + chang * 300 + lizhi * 1000;
        for (let l = 1; l < 4; l++) {
            hule.fenpei[l] = -(zhuangjia + chang * 100);
        }
    } else {
        /* 子家自摸 */
        let zhuangjia = Math.ceil(defen * 2 / 400) * 100;
        let sanjia = Math.ceil(defen / 400) * 100;
        hule.fenpei[seat] = defen + chang * 300 + lizhi * 1000;
        hule.fenpei[0] = -(zhuangjia + chang * 100);
        for (let l = 1; l < 4; l++) {
            if (l !== seat) {
                hule.fenpei[l] = -(sanjia + chang * 100);
            }
        }
    }
}

/**
 * 获取某牌的靠张集合（相同的字牌，或点数差2以内的数牌）
 * @param {string} tile — 牌面字符串，如 'p6'、'z3'
 * @returns {Set<string>}
 */
function _getKaozhangSet(tile) {
    let s = tile[0];
    let n = tile[1] === '0' ? 5 : parseInt(tile[1]);
    let result = new Set();
    if (s === 'z') {
        result.add('z' + n);
    } else {
        for (let i = Math.max(1, n - 2); i <= Math.min(9, n + 2); i++) {
            result.add(s + i);
        }
        if (result.has(s + '5')) result.add(s + '0');
    }
    return result;
}

/**
 * 统计手牌+副露中出现的牌种类数（m/p/s/风/三元）
 * @param {Object} shoupai
 * @returns {number} 3-5
 */
function _countCategories(shoupai) {
    let has = { m: false, p: false, s: false, wind: false, dragon: false };

    /* 手牌 */
    for (let s of ['m', 'p', 's']) {
        let bp = shoupai._bingpai[s];
        if (bp) {
            for (let n = 0; n <= 9; n++) {
                if (bp[n] > 0) { has[s] = true; break; }
            }
        }
    }
    let bpz = shoupai._bingpai['z'];
    if (bpz) {
        for (let n = 1; n <= 4; n++) { if (bpz[n] > 0) { has.wind = true; break; } }
        for (let n = 5; n <= 7; n++) { if (bpz[n] > 0) { has.dragon = true; break; } }
    }

    /* 副露：fulou 首字母即为花色，z 时所有牌数字相同 */
    for (let m of (shoupai._fulou || [])) {
        let s = m[0];
        if (s === 'm') has.m = true;
        else if (s === 'p') has.p = true;
        else if (s === 's') has.s = true;
        else if (s === 'z') {
            let n = parseInt(m[1]);
            if (n >= 1 && n <= 4) has.wind = true;
            else if (n >= 5 && n <= 7) has.dragon = true;
        }
    }

    let count = 0;
    for (let k of ['m', 'p', 's', 'wind', 'dragon']) {
        if (has[k]) count++;
    }
    return count;
}

/**
 * 静态牌价值评估（仅基于牌面本身，不考虑手牌上下文）
 * z < 1/9 < 2/8 < 3/7 < 4/6 < 5 < 赤5
 */
function _evalStaticTileValue(tile) {
    let s = tile[0], n = tile[1];
    if (s === 'z') return 0;
    if (n === '0') return 6;
    let num = parseInt(n);
    if (num === 1 || num === 9) return 1;
    if (num === 2 || num === 8) return 2;
    if (num === 3 || num === 7) return 3;
    if (num === 4 || num === 6) return 4;
    return 5;
}

/**
 * 泽村智纪：宽松一杯口/两杯口判定
 * 仅需顺子点数相同（不需同花色），允许副露
 * @param {Object} shoupai — 手牌对象
 * @returns {number} 一杯口对数之和（0/1/2）
 */
function _countRelaxedIipeikou(shoupai) {
    let shunziByNum = {};
    for (let n = 1; n <= 7; n++) shunziByNum[n] = 0;

    for (let s of ['m', 'p', 's']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        let c = {};
        for (let n = 1; n <= 9; n++) c[n] = (bp[n] || 0);
        c[5] += (bp[0] || 0);  /* 红5合并到5 */

        /* 贪心提取顺子 */
        for (let n = 1; n <= 7; n++) {
            let count = Math.min(c[n], c[n + 1], c[n + 2]);
            if (count > 0) {
                shunziByNum[n] += count;
                c[n] -= count;
                c[n + 1] -= count;
                c[n + 2] -= count;
            }
        }
    }

    let beikou = 0;
    for (let n = 1; n <= 7; n++) {
        beikou += (shunziByNum[n] >> 1);
    }
    return beikou;
}

/**
 * 获取手牌+副露+荣牌的所有牌面列表
 * @param {Object} shoupai
 * @param {string|null} rongpai — 荣和牌（自摸时为 null）
 * @returns {string[]}
 */
function _getAllTilesWithMelds(shoupai, rongpai) {
    let tiles = _getAllHandTiles(shoupai);
    if (rongpai) tiles.push(rongpai);
    if (shoupai._fulou) {
        for (let m of shoupai._fulou) {
            let parts = m.match(/[mpsz]\d/g);
            if (parts) tiles.push(...parts);
        }
    }
    return tiles;
}

/**
 * 一姬：按类型统计宝牌枚数（表/杠/红/里）
 * @param {string[]} allTiles — 全部牌面
 * @param {Object} model
 * @returns {{ omote: number, kan: number, aka: number, ura: number }}
 */
function _countDoraByType(allTiles, model) {
    /* 表宝牌：仅 baopai[0]（最初翻开的那一枚） */
    let omoteSet = tileUtils.buildDoraSet([model.shan._baopai[0]].filter(Boolean));
    /* 杠宝牌：baopai[1..4]（任何情况下新开的宝牌） */
    let kanSet = tileUtils.buildDoraSet(model.shan._baopai.slice(1).filter(Boolean));
    /* 里宝牌 */
    let uraSet = tileUtils.buildDoraSet(model.shan._fubaopai.filter(Boolean));

    let omote = 0, kan = 0, aka = 0, ura = 0;
    for (let t of allTiles) {
        let n = (t[1] === '0') ? t[0] + '5' : t;
        if (omoteSet.has(n)) omote++;
        if (kanSet.has(n)) kan++;
        if (uraSet.has(n)) ura++;
    }
    /* 红宝牌：手牌中牌面第二位为 '0' 的牌 */
    aka = allTiles.filter(t => t[1] === '0').length;

    return { omote, kan, aka, ura };
}

/**
 * 统计手牌中出现的数牌花色种类数（m/p/s）
 * 含手牌和所有副露（包括暗杠）
 */
function _countNumberSuits(shoupai) {
    let has = { m: false, p: false, s: false };
    /* 手牌 */
    for (let s of ['m', 'p', 's']) {
        let bp = shoupai._bingpai[s];
        if (bp) {
            for (let n = 0; n <= 9; n++) {
                if (bp[n] > 0) { has[s] = true; break; }
            }
        }
    }
    /* 副露（含暗杠） */
    for (let m of (shoupai._fulou || [])) {
        let s = m[0];
        if (s === 'm' || s === 'p' || s === 's') has[s] = true;
    }
    let count = 0;
    for (let k of ['m', 'p', 's']) { if (has[k]) count++; }
    return count;
}

/**
 * 检查手牌中是否有字牌（含手牌和副露）
 */
function _hasZipai(shoupai) {
    let bpz = shoupai._bingpai['z'];
    if (bpz) {
        for (let n = 1; n <= 7; n++) { if (bpz[n] > 0) return true; }
    }
    for (let m of (shoupai._fulou || [])) {
        if (m[0] === 'z') return true;
    }
    return false;
}

/**
 * 统计副露区（不含暗杠）中数牌花色种类数
 * 暗杠不属于副露区（只检查吃碰大明杠）
 */
function _countMeldSuits(shoupai) {
    let has = { m: false, p: false, s: false };
    for (let m of (shoupai._fulou || [])) {
        let s = m[0];
        if (s !== 'm' && s !== 'p' && s !== 's') continue;
        /* 检测暗杠：4同数字且符号全同 → 跳过 */
        let digits = (m.match(/\d/g) || []).map(Number);
        if (digits.length === 4) {
            let normalized = digits.map(d => d === 0 ? 5 : d);
            if (normalized.every(d => d === normalized[0])) {
                let signs = m.match(/[\-\+]/g) || [];
                if (signs.length === 4 && signs.every(si => si === signs[0])) {
                    continue;
                }
            }
        }
        has[s] = true;
    }
    let count = 0;
    for (let k of ['m', 'p', 's']) { if (has[k]) count++; }
    return count;
}

/**
 * 统计全桌可见的某张牌的数量（牌河 + 副露 + 他人明牌）
 * @param {Object} model — game._model
 * @param {number} seat — 当前玩家席位
 * @param {string} suit — 花色
 * @param {number} num  — 点数（5为红5普通5统一）
 * @param {string|null} excludeTile — 不计入的牌（本次自摸/荣和的牌）
 */
function _countAllVisibleTiles(model, seat, suit, num, excludeTile) {
    let count = 0;
    /* 所有玩家牌河可见牌 */
    for (let i = 0; i < 4; i++) {
        let he = model.he[i];
        if (!he || !he._pai) continue;
        for (let t of he._pai) {
            if (t.slice(-1) === '_') continue;   /* 暗切隐藏 */
            let pai = t.length >= 2 ? t.slice(0, 2) : t;
            if (tileUtils.suitOf(pai) === suit && tileUtils.numberOf(pai) === num) count++;
        }
    }
    /* 所有玩家副露（含暗杠） */
    for (let i = 0; i < 4; i++) {
        let sp = model.shoupai[i];
        if (!sp || !sp._fulou) continue;
        for (let m of sp._fulou) {
            if (typeof m !== 'string' || m[0] !== suit) continue;
            let digits = (m.match(/\d/g) || []).map(function(d) {
                let dn = parseInt(d); return isNaN(dn) || dn === 0 ? 5 : dn;
            });
            for (let d of digits) {
                if (d === num) count++;
            }
        }
    }
    /* 其他玩家手中明牌 */
    for (let i = 0; i < 4; i++) {
        if (i === seat) continue;
        let sp = model.shoupai[i];
        if (!sp || !sp._markedTiles) continue;
        for (let mt of sp._markedTiles.keys()) {
            if (tileUtils.suitOf(mt) === suit && tileUtils.numberOf(mt) === num) count++;
        }
    }
    /* 不计入本次自摸/荣和的牌 */
    if (excludeTile) {
        if (tileUtils.suitOf(excludeTile) === suit && tileUtils.numberOf(excludeTile) === num && count > 0) count--;
    }
    return count;
}

/**
 * 计算某张牌的残枚数
 * 4 - 自己手牌 - 全桌可见牌（牌河/副露/他人明牌），不计入本次自摸/荣和牌
 */
function _countRemaining(model, seat, tile, excludeTile) {
    let s = tileUtils.suitOf(tile);
    let n = tileUtils.numberOf(tile);

    let remaining = 4;
    /* 手牌 */
    let shoupai = model.shoupai[seat];
    if (shoupai && shoupai._bingpai[s]) {
        remaining -= (shoupai._bingpai[s][n] || 0);
        if (n === 5) remaining -= (shoupai._bingpai[s][0] || 0);
    }
    /* 全桌可见牌 */
    remaining -= _countAllVisibleTiles(model, seat, s, n, excludeTile);
    return Math.max(0, remaining);
}

/**
 * 检查手牌中是否全是 3-7 的中张数牌（无字牌、无1/2/8/9）
 * 含手牌和副露
 */
function _isAllChunchan(shoupai) {
    /* 仅检查手牌：m/p/s 不能有 1/2/8/9，也不能有 z */
    for (let s of ['m', 'p', 's']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        for (let n of [1, 2, 8, 9]) {
            if (bp[n] > 0) return false;
        }
    }
    let bpz = shoupai._bingpai['z'];
    if (bpz) {
        for (let n = 1; n <= 7; n++) {
            if (bpz[n] > 0) return false;
        }
    }
    /* 至少有一些 3-7 的牌 */
    let hasTiles = false;
    for (let s of ['m', 'p', 's']) {
        let bp = shoupai._bingpai[s];
        if (!bp) continue;
        for (let n = 3; n <= 7; n++) {
            if (bp[n] > 0) { hasTiles = true; break; }
        }
        if (bp[0] > 0) { hasTiles = true; break; }
    }
    return hasTiles;
}

/**
 * 辻垣内智叶：牌墙交换辅助
 * @param {Object} context — 技能上下文
 * @param {string} wallTile — 牌山第一张牌
 * @returns {Object} { executed: true, cancelled?: true }
 */
async function _doWallSwap(context, wallTile) {
    let game = context.game;
    let seat = context.seat;
    let model = game._model;
    let shoupai = model.shoupai[seat];
    let input = context.input;
    let wallName = game._pai_name(wallTile);

    /* ---- 人类/AI 统一路径：使用 ExchangePrompt ---- */
    let pairs = await input.askExchange({
        offerTiles: [wallTile],
        source: 'both',
        swapCount: 1,
        condition: 'none',
        allowSourceSwitch: false,
        cancellable: true,
        description: '牌山第一张: ' + wallName,
    }, () => {
        /* ── AI 逻辑 ── */
        const OFFSET_TO_CLASS = ['main', 'xiajia', 'duimian', 'shangjia'];
        let currentShanten = Majiang.Util.xiangting(shoupai);

        /* ① 判断 wallTile 是否能降低向听数 */
        let testWall = shoupai.clone();
        tileOps.addToHand(testWall, wallTile);
        let wallShanten = Majiang.Util.xiangting(testWall);

        if (wallShanten < currentShanten) {
            /* 能降低→选手牌最没用的牌与之交换 */
            let allHandTiles = _getHandTiles(shoupai);
            if (allHandTiles.length === 0) return null;
            let worst = allHandTiles[0], worstVal = _evalHandTileValue(allHandTiles[0], shoupai, game, seat);
            for (let i = 1; i < allHandTiles.length; i++) {
                let v = _evalHandTileValue(allHandTiles[i], shoupai, game, seat);
                if (v < worstVal) { worstVal = v; worst = allHandTiles[i]; }
            }
            return [{ offerTile: wallTile, offerIdx: 0, sideTile: worst, sidePlayer: 'hand', sideIdx: -1 }];
        }

        /* ② wallTile 无法降低向听数 */
        let nextPlayer = (game._turnOwner + 1) % 4;
        if (nextPlayer === seat) {
            /* 下巡是自己：从牌河中寻找能降低向听数的牌，选最优 */
            let bestTile = null, bestSeat = -1, bestIdx = -1, bestShanten = 99;
            for (let s = 0; s < 4; s++) {
                let he = model.he[s];
                if (!he) continue;
                for (let i = 0; i < he._pai.length; i++) {
                    if (he._pai[i] === '_') continue;
                    let base = he._pai[i].replace(/[_\*]$/, '');
                    let test = shoupai.clone();
                    tileOps.addToHand(test, base);
                    let st = Majiang.Util.xiangting(test);
                    if (st < bestShanten) {
                        bestShanten = st;
                        bestTile = base;
                        bestSeat = s;
                        bestIdx = i;
                    }
                }
            }
            if (bestTile && bestShanten < currentShanten) {
                let riverClass = OFFSET_TO_CLASS[(bestSeat - seat + 4) % 4];
                return [{ offerTile: wallTile, offerIdx: 0, sideTile: bestTile, sidePlayer: riverClass, sideIdx: bestIdx }];
            }
            return null;  /* 没有可用牌，取消 */
        }

        /* 下巡不是自己：从下巡玩家牌河中找价值最低的牌给他 */
        let worstTile = null, worstIdx = -1, worstSeat = -1, worstVal = Infinity;
        /* 先找下巡玩家 */
        let heTarget = model.he[nextPlayer];
        if (heTarget) {
            for (let i = 0; i < heTarget._pai.length; i++) {
                if (heTarget._pai[i] === '_') continue;
                let base = heTarget._pai[i].replace(/[_\*]$/, '');
                let v = _evalTileValue(base, game, seat);
                if (v < worstVal) { worstVal = v; worstTile = base; worstSeat = nextPlayer; worstIdx = i; }
            }
        }
        /* 下巡玩家没有→从其他家找 */
        if (!worstTile) {
            for (let s = 0; s < 4; s++) {
                if (s === nextPlayer) continue;
                let he = model.he[s];
                if (!he) continue;
                for (let i = 0; i < he._pai.length; i++) {
                    if (he._pai[i] === '_') continue;
                    let base = he._pai[i].replace(/[_\*]$/, '');
                    let v = _evalTileValue(base, game, seat);
                    if (v < worstVal) { worstVal = v; worstTile = base; worstSeat = s; worstIdx = i; }
                }
            }
        }
        if (worstTile) {
            let riverClass = OFFSET_TO_CLASS[(worstSeat - seat + 4) % 4];
            return [{ offerTile: wallTile, offerIdx: 0, sideTile: worstTile, sidePlayer: riverClass, sideIdx: worstIdx }];
        }
        return null;  /* 都没有，取消 */
    });

    if (pairs && pairs.length > 0) {
        let p = pairs[0]; /* { offerTile, sideTile, sidePlayer, sideIdx } */
        /* 牌山顶放上被换出的牌，被换入的 wallTile 放入手牌/牌河 */
        tileOps.swapWallFront(model, 0, p.sideTile);
        tileOps.exchangeWallSwap(model, seat, wallTile, p);
        let loc = p.sidePlayer === 'hand' ? '手牌' : '牌河';
        game._add_action_log('辻垣内智叶 ' + loc + '交换: ' + game._pai_name(p.sideTile) + ' ↔ ' + wallName, seat);
        if (game._recalculateFuriten) game._recalculateFuriten();
        if (game._view) game._view.redraw();
        return { executed: true };
    }

    /* askExchange 未返回有效交换，技能取消 */
    return { executed: true, cancelled: true };
}

/* ===== 南浦数绘 (Nanpo_Kazue) 共用执行体 ===== */
/* 摸2张→选2张放回王牌尾部→选1张作摸牌+立直振听重置 */
async function _executeNanpoKazue(context) {
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
    /* 将两张牌逐张放入王牌尾部（处理半墩填充） */
    for (let t of selected) {
        tileOps.pushDeadWall(model, [t]);
    }

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

    /* 刷新手牌 UI */
    if (game._view && game._view.shoupai && game._view.shoupai[seat]) {
        game._view.shoupai[seat].redraw();
    }

    context.done();
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
                let paiCount = tileUtils.countHePai(he);
                let row = tileUtils.heRow(paiCount);
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
                let paiCount = tileUtils.countHePai(he);
                let row = tileUtils.heRow(paiCount);
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
                let heLen = tileUtils.countHePai(he);
                let row = tileUtils.heRow(heLen);
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
                /* 仅技能持有者自己的额外巡触发 */
                if (!context.isExtraTurn) return false;
                if (context.player !== context.seat) return false;
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
                /* 标记本巡舍牌为暗切 */
                if (context.game) {
                    context.game._extra_hidden_discard = true;
                }
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
                    return false;
                }
                /* 牌山不足时无法发动 */
                let model = game._model;
                if (!model || !model.shan || model.shan.paishu <= 0) {
                    return false;
                }
                let triggered = game._skillManager.wasTriggered(context.seat, 'Amae_Koromo', 3);
                return triggered;
            },
            execute: async function(context) {
                let game = context.game;
                let model = game._model;
                if (!model || !model.shan) return { executed: true };
                let seat = context.seat;

                /* 从触发记录中获取技能④选择的移动数量 */
                let triggerData = game._skillManager
                    ? game._skillManager.getTriggerData(seat, 'Amae_Koromo', 3)
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

                console.debug('[SRV] Amae_Koromo_skill_3 execute START seat=' + seat + ' paishu=' + (model.shan?.paishu));

                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));
                let shoupai = model.shoupai[seat];
                /* condition 保证了 _zimo 存在且非空 */
                let drawnPai = shoupai._zimo;
                let isDealerFirst = game._diyizimo && seat === 0;
                let chosenIdx;

                /* ── 1. 选择数量 ── */
                let qty = 1;
                if (_isKoromoSkill3Active(game, seat) && model.shan.paishu > 1) {
                    console.debug('[SRV] Amae_Koromo_skill_3 before askTextOptions');
                    let choice = await input.askTextOptions(
                        ['移动 1 张', '移动 2 张'], ['1', '2'],
                        '选择移动数量', () => model.shan.paishu === 2 ? '1' : '2');
                    console.debug('[SRV] Amae_Koromo_skill_3 after askTextOptions choice=' + choice);
                    if (!choice) { console.debug('[SRV] Amae_Koromo_skill_3 DONE (no choice)'); context.done(); return; }
                    qty = parseInt(choice);
                }
                qty = Math.min(qty, model.shan.paishu);
                if (qty <= 0) { console.debug('[SRV] Amae_Koromo_skill_3 DONE (qty<=0)'); context.done(); return; }

                /* ── 2. 展示海底牌 ── */
                console.debug('[SRV] Amae_Koromo_skill_3 before showToast qty=' + qty);

                let peeked = tileOps.peekEnd(model, qty);
                let paiNames = peeked.map(p => game._pai_name(p)).join('、');
                game._add_action_log(spname + ' 展示了海底牌：' + paiNames, seat);
                input.showToast({ tiles: peeked, text: spname + ' 展示了海底牌：' + paiNames });

                /* 等待 2 秒，确保所有玩家看清海底牌展示后再进行交换决策 */
                console.debug('[SRV] Amae_Koromo_skill_3 before 2s wait');
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.debug('[SRV] Amae_Koromo_skill_3 after 2s wait');

                /* 副露轮次无摸牌：展示后直接结束，不进行交换 */
                if (!drawnPai || drawnPai.length < 2) {
                    console.debug('[SRV] Amae_Koromo_skill_3 DONE (no drawnPai)');
                    game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
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
                            if (tileUtils.sameSuit(h, w) || tileUtils.sameNumber(h, w)) {
                                pairs.push({ hand: h, wall: w, peekIdx: wi });
                            }
                        }
                    }

                    if (pairs.length === 0) {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
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
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
                        context.done();
                        return;
                    }

                    /* 3a. 选择海底牌和手牌 */
                    let chosenWall;
                    let chosenWallPeekIdx;
                    let chosenHand;
                    let epPairs = await input.askExchange({
                        offerTiles: wallCandidates,
                        source: 'hand',
                        swapCount: 1,
                        condition: 'none',
                        allowSourceSwitch: false,
                        cancellable: true,
                        description: '庄家首巡·选择海底牌和手牌交换',
                    }, () => {
                        /* ── AI 默认：选价值最高的海底牌，再选手牌中价值最低的匹配牌 ── */
                        let bestIdx = 0;
                        let bestVal = _evalTileValue(wallCandidates[0], game, seat);
                        for (let i = 1; i < wallCandidates.length; i++) {
                            let v = _evalTileValue(wallCandidates[i], game, seat);
                            if (v > bestVal) { bestVal = v; bestIdx = i; }
                        }
                        let hOptions = pairs.filter(p => p.wall === wallCandidates[bestIdx]).map(p => p.hand);
                        if (hOptions.length === 0 || (hOptions.length === 1 && hOptions[0][0] === 'z')) return null;
                        let worstIdx = 0;
                        let worstVal = _evalHandTileValue(hOptions[0], shoupai, game, seat);
                        for (let i = 1; i < hOptions.length; i++) {
                            let v = _evalHandTileValue(hOptions[i], shoupai, game, seat);
                            if (v < worstVal) { worstVal = v; worstIdx = i; }
                        }
                        return [{ offerTile: wallCandidates[bestIdx], offerIdx: wallCandidatePeekIdx[bestIdx], sideTile: hOptions[worstIdx], sidePlayer: 'hand', sideIdx: -1 }];
                    });
                    if (epPairs && epPairs.length > 0) {
                        let ep = epPairs[0];
                        chosenWall   = ep.offerTile;
                        chosenWallPeekIdx = ep.offerIdx;
                        chosenHand   = ep.sideTile;
                        let handOptions = pairs.filter(p => p.wall === chosenWall).map(p => p.hand);
                        if (handOptions.indexOf(chosenHand) < 0 || chosenHand[0] === 'z') {
                            context.done(); return;
                        }
                    } else {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
                        context.done();
                        return;
                    }

                    drawnPai = chosenHand;
                    chosen = chosenWall;
                    chosenIdx = chosenWallPeekIdx;

                } else {
                    /* 普通巡目：摸牌 ↔ 海底牌匹配 */
                    console.debug('[SRV] Amae_Koromo_skill_3 non-dealer matching drawnPai=' + drawnPai + ' peeked=' + JSON.stringify(peeked));
                    let matches = [];
                    let matchPeekIdx = [];  // 平行数组，记录每张匹配牌在 peeked 中的位置
                    for (let i = 0; i < peeked.length; i++) {
                        let t = peeked[i];
                        if (t[0] === 'z') continue;
                        if (tileUtils.sameSuit(t, drawnPai) || tileUtils.sameNumber(t, drawnPai)) {
                            matches.push(t);
                            matchPeekIdx.push(i);
                        }
                    }

                    if (matches.length === 0) {
                        console.debug('[SRV] Amae_Koromo_skill_3 DONE (no matches)');
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
                        context.done();
                        return;
                    }

                    /* 3. 确认 / 选择交换牌（先匹配再问，只可选能换的牌） */
                    /* 普通巡目只允许用当前摸牌交换，不允许选其他手牌或牌河牌 */
                    let epPairs = await input.askExchange({
                        offerTiles: matches,
                        source: 'hand',
                        swapCount: 1,
                        condition: 'none',
                        allowSourceSwitch: false,
                        cancellable: true,
                        tileFilter: (tile, type) => {
                            if (type === 'hand') return tile === drawnPai;
                            return false; /* 禁止选牌河 */
                        },
                        description: '选择海底牌与「' + game._pai_name(drawnPai) + '」交换',
                    }, () => {
                        /* ── AI 默认：有匹配则选价值最高的海底牌 ── */
                        let best = matches[0];
                        let bestVal = _evalTileValue(best, game, seat);
                        for (let i = 1; i < matches.length; i++) {
                            let v = _evalTileValue(matches[i], game, seat);
                            if (v > bestVal) { bestVal = v; best = matches[i]; }
                        }
                        return [{ offerTile: best, offerIdx: matchPeekIdx[matches.indexOf(best)], sideTile: drawnPai, sidePlayer: 'hand', sideIdx: -1 }];
                    });
                    if (epPairs && epPairs.length > 0) {
                        let ep = epPairs[0];
                        if (ep.sideTile !== drawnPai) { context.done(); return; }
                        chosen = ep.offerTile;
                        chosenIdx = ep.offerIdx;
                        if (chosenIdx == null) { context.done(); return; }
                    } else {
                        game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
                        context.done();
                        return;
                    }
                }

                /* ── 4. 执行交换：摸牌 ↔ 海底牌（原地替换，不移动其他牌） ── */
                if (chosenIdx == null || chosenIdx < 0) {
                    console.debug('[SRV] Amae_Koromo_skill_3 DONE (bad chosenIdx)');
                    game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
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
                game._skillManager.recordTrigger(seat, 'Amae_Koromo', 3, { qty });
                console.debug('[SRV] Amae_Koromo_skill_3 DONE (context.done)');
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
            /* ① 首巡舍牌前，将至多2张手牌放海底并摸牌，每回合可发动两次 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 2,
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
                    /* 洗混选中的牌再放入海底（保证玩家无法通过手牌顺序操纵海底） */
                    let shuffled = [...selected];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        let j = Math.floor(Math.random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    tileOps.pushEnd(model, shuffled);
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

                /* 选择要放到海底的牌 */
                let xiangting = Majiang.Util.xiangting(shoupai);
                let tiles = _getHandTiles(shoupai);

                let sel = await input.pickHandTilesRange(0, 2,
                    '选牌放到海底，点手牌选择后点确定，点取消跳过',
                    () => {
                        let aiCnt = (xiangting === 1) ? 1 : (xiangting >= 2 ? 2 : 0);
                        if (tiles.length === 0) return [];
                        return aiTopWorstTiles(aiCnt, tiles);
                    },
                    tiles);

                if (sel && sel.length > 0) {
                    let drawn = doHaiteiSwap(sel);
                    game._add_action_log(spname + ' 将' + sel.length + '张牌放到海底，摸了'
                        + drawn.length + '张牌', seat);
                }

                /* 选择一张牌作为摸牌 */
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
                            shoupai._zimo = t[0];
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

    /* ===== 小濑川白望 (Kosegawa_Shiromi) ===== */
    'Kosegawa_Shiromi': {
        0: {
            /* ① 宝牌和里宝指示牌对你为双向指示 */
            timing: TimingPoints.CONTINUOUS,
            type: SkillType.PASSIVE,
            effectType: EffectType.VIEW_AS_YAKU,

            parts: [
                {
                    timing: TimingPoints.HULE_SETTLE,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule.hupai);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        let model = context.game._model;
                        let shoupai = context.shoupai;

                        if (!shoupai) return { executed: true };

                        /* 表宝牌双向指示 */
                        let baopai = model.shan.baopai;
                        if (baopai && baopai.length > 0) {
                            let reverseDora = baopai
                                .filter(x => x)
                                .map(bp => _reverseDoraOf(bp));
                            if (reverseDora.length > 0) {
                                let doraSet = new Set(reverseDora.filter(x => x));
                                let extraDoraCount = fanModifier.countHandTiles(shoupai, function(pai) {
                                    let normalized = (pai[1] === '0') ? pai[0] + '5' : pai;
                                    return doraSet.has(normalized);
                                });
                                console.log('[dora-log 白望] 逆向表宝牌: 指示牌=' + JSON.stringify(baopai.filter(x=>x)) + ' 逆向宝牌=' + JSON.stringify([...doraSet]) + ' 手牌=' + shoupai.toString() + ' 命中=' + extraDoraCount);
                                if (extraDoraCount > 0) {
                                    let found = false;
                                    for (let i = 0; i < hule.hupai.length; i++) {
                                        if (hule.hupai[i].name === '宝牌') {
                                            hule.hupai[i].fanshu += extraDoraCount;
                                            hule.fanshu += extraDoraCount;
                                            found = true;
                                            break;
                                        }
                                    }
                                    if (!found) {
                                        hule.hupai.push({ name: '宝牌', fanshu: extraDoraCount, type: 'dora' });
                                        hule.fanshu += extraDoraCount;
                                    }
                                }
                            }
                        }

                        /* 里宝牌双向指示（仅立直时） */
                        if (shoupai.lizhi) {
                            let fubaopai = model.shan.fubaopai;
                            if (fubaopai && fubaopai.length > 0) {
                                let reverseUraDora = fubaopai
                                    .filter(x => x)
                                    .map(bp => _reverseDoraOf(bp));
                                if (reverseUraDora.length > 0) {
                                    let uraDoraSet = new Set(reverseUraDora.filter(x => x));
                                    let extraUraCount = fanModifier.countHandTiles(shoupai, function(pai) {
                                        let normalized = (pai[1] === '0') ? pai[0] + '5' : pai;
                                        return uraDoraSet.has(normalized);
                                    });
                                    console.log('[dora-log 白望] 逆向里宝牌: 指示牌=' + JSON.stringify(fubaopai.filter(x=>x)) + ' 逆向里宝牌=' + JSON.stringify([...uraDoraSet]) + ' 手牌=' + shoupai.toString() + ' 命中=' + extraUraCount);
                                    if (extraUraCount > 0) {
                                        let found = false;
                                        for (let i = 0; i < hule.hupai.length; i++) {
                                            if (hule.hupai[i].name === '里宝牌') {
                                                hule.hupai[i].fanshu += extraUraCount;
                                                hule.fanshu += extraUraCount;
                                                found = true;
                                                break;
                                            }
                                        }
                                        if (!found) {
                                            hule.hupai.push({ name: '里宝牌', fanshu: extraUraCount, type: 'dora' });
                                            hule.fanshu += extraUraCount;
                                        }
                                    }
                                }
                            }
                        }

                        return { executed: true };
                    },
                },
            ],
        },

        1: {
            /* ② 舍牌为跟切/现物/筋牌后可额外巡目并暗切 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.EXTRA_TURN,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 不在额外巡链中 */
                if (game._extra_turn) return false;
                if (typeof game._extra_chain_remaining === 'number' && game._extra_chain_remaining >= 0) return false;
                let dapai = context.dapai || '';
                if (!dapai) return false;
                let base = dapai.replace(/\*$/, '');
                if (base[0] === '_') return false;

                let model = game._model;
                let seat = context.seat;
                let n = tileUtils.numberOf(base);
                let suit = tileUtils.suitOf(base);

                /* 跟切（仅数牌）：与任意家牌河最后一张未被副露的牌相同 */
                if (suit !== 'z') {
                    for (let l = 0; l < 4; l++) {
                        if (l === seat) continue;
                        let he = model.he[l];
                        if (!he) continue;
                        for (let i = he._pai.length - 1; i >= 0; i--) {
                            let p = he._pai[i];
                            if (p === '_') break;  /* 暗切记为不可见，无法跟切 */
                            if (p.slice(-1).match(/[\+\-\=]/)) continue;
                            /* 找到最后一张未被副露的牌 */
                            if (tileUtils.isEquivalent(p, base)) {
                                console.log('[shirabi-log] 跟切匹配: seat=' + seat + ' 手牌=' + base + ' 跟切家=' + l + ' 牌=' + p);
                                return true;
                            }
                            break; /* 只检查最后一张 */
                        }
                    }
                }

                /* 现物或筋牌：对每个立直家检查 */
                for (let l = 0; l < 4; l++) {
                    if (l === seat) continue;
                    if (!game._lizhi[l]) continue;
                    let genbutsu = game.getGenbutsu(l);
                    /* 排除自己刚刚打出的这张（现物列表最后一张） */
                    let genbutsuCheck = genbutsu.slice(0, -1);
                    if (genbutsuCheck.includes(suit + n)) {
                        console.log('[shirabi-log] 现物匹配: seat=' + seat + ' 手牌=' + base + ' 立直家=' + l + ' 现物列表=' + JSON.stringify(genbutsu));
                        return true;
                    }
                    let suji = game.getSuji(genbutsu);
                    if (suji.includes(suit + n)) {
                        console.log('[shirabi-log] 筋牌匹配: seat=' + seat + ' 手牌=' + base + ' 立直家=' + l + ' 现物列表=' + JSON.stringify(genbutsu) + ' 筋牌列表=' + JSON.stringify(suji));
                        return true;
                    }
                }

                return false;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                /* 标记为暗切 */
                game._extra_hidden_discard = true;
                /* 启动额外巡（1次） */
                extraTurn.start(game, seat, 1);
                context.done();
            },
            aiDecision: function(context) {
                /* 始终发动 */
                return true;
            },
        },
    },

    /* ===== 国广一 (Kunihiro_Hajime) ===== */
    'Kunihiro_Hajime': {
        0: {
            /* ① 牌河6/12张舍牌时，交换手牌与牌河数牌 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            priority: 340,
            effectType: EffectType.SWAP_TILES,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                let seat = context.seat;
                let model = game._model;
                let he = model.he[seat];
                if (!he) return false;
                /* 计数牌河舍牌，不计被副露的（+/-/= 标记） */
                let count = tileUtils.countHePai(he);
                return count === 6 || count === 12;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));
                await _kunihiroSwap(context, game, seat, model, input, shoupai, spname);
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                if (!shoupai) return false;
                let currentShanten = Majiang.Util.xiangting(shoupai);
                if (currentShanten < 0) return false;
                /* 收集牌河数牌（去重） */
                let riverSet = new Set();
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let t of he._pai) {
                        if (t === '_') continue;
                        let base = t.replace(/[_\*]$/, '');
                        if (base[0] === 'z') continue;
                        riverSet.add(base);
                    }
                }
                if (riverSet.size === 0) return false;
                /* 检查是否存在能降低向听数的交换 */
                let handTiles = [...new Set(_getHandTiles(shoupai))];
                for (let handTile of handTiles) {
                    for (let riverTile of riverSet) {
                        if (!tileUtils.sameSuit(riverTile, handTile) && !tileUtils.sameNumber(riverTile, handTile)) continue;
                        let testShoupai = shoupai.clone();
                        tileOps.removeFromHand(testShoupai, handTile);
                        tileOps.addToHand(testShoupai, riverTile);
                        if (Majiang.Util.xiangting(testShoupai) < currentShanten) return true;
                    }
                }
                return false;
            },
        },
        1: {
            /* ② 每有一家立直，可于任意巡目发动一次①的能力 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            priority: 340,
            effectType: EffectType.SWAP_TILES,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 计数立直家数 */
                let lizhiCount = 0;
                for (let s = 0; s < 4; s++) {
                    if (game._lizhi[s]) lizhiCount++;
                }
                if (lizhiCount === 0) return false;
                /* 手动追踪全局限次 */
                if (!game._kunihiroBUsed) game._kunihiroBUsed = 0;
                return game._kunihiroBUsed < lizhiCount;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));
                await _kunihiroSwap(context, game, seat, model, input, shoupai, spname);
                /* 全局限次计数 */
                if (!game._kunihiroBUsed) game._kunihiroBUsed = 0;
                game._kunihiroBUsed++;
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                if (!shoupai) return false;
                let currentShanten = Majiang.Util.xiangting(shoupai);
                if (currentShanten < 0) return false;
                /* 收集牌河数牌（去重） */
                let riverSet = new Set();
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let t of he._pai) {
                        if (t === '_') continue;
                        let base = t.replace(/[_\*]$/, '');
                        if (base[0] === 'z') continue;
                        riverSet.add(base);
                    }
                }
                if (riverSet.size === 0) return false;
                /* 检查是否存在能降低向听数的交换 */
                let handTiles = [...new Set(_getHandTiles(shoupai))];
                for (let handTile of handTiles) {
                    for (let riverTile of riverSet) {
                        if (!tileUtils.sameSuit(riverTile, handTile) && !tileUtils.sameNumber(riverTile, handTile)) continue;
                        let testShoupai = shoupai.clone();
                        tileOps.removeFromHand(testShoupai, handTile);
                        tileOps.addToHand(testShoupai, riverTile);
                        if (Majiang.Util.xiangting(testShoupai) < currentShanten) return true;
                    }
                }
                return false;
            },
        },
    },

    'Nanpo_Kazue': {
        0: {
            /* ① 你舍弃第一张牌前，可再摸两张牌并将两张牌置入王牌尾部 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_GAME,
            usageMax: 1,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 仅首巡可发动 */
                return !!game._diyizimo;
            },
            execute: _executeNanpoKazue,
            aiDecision: function(context) {
                return true;
            },
        },
        1: {
            /* ② 你舍牌前，若场上所有玩家均完成第一排牌，你再摸两张牌并将两张牌置入王牌尾部 */
            timing: TimingPoints.BEFORE_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_GAME,
            usageMax: 1,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 所有玩家第一排牌河已填满 */
                let model = game._model;
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) return false;
                    if (tileUtils.countHePai(he) < 6) return false;
                }
                return true;
            },
            execute: _executeNanpoKazue,
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 测试角色 (Test_Character) ===== */
    'Test_Character': {
        0: {
            /* 你舍牌时，可以暗置舍牌（AI默认发动） */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.HIDDEN_DISCARD,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                return true;
            },
            execute: function(context) {
                context.game._extra_hidden_discard = true;
                return { executed: true };
            },
            aiDecision: function(context) {
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
                let heLen = tileUtils.countHePai(he);
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
                    /* Part B — HULE_SETTLE：三副露→1番,追立→2番（独立役种） */
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

                        /* 追立：独立的2番役种 */
                        let isChaseRiichi = game._skillManager
                            ? game._skillManager.getSkillData(seat, 'Anetai_Toyone', '_chaseRiichi')
                            : false;
                        if (isChaseRiichi && hanOps.hasYaku(hule, '立直')) {
                            hanOps.setYakuHan(hule, '追立', 2);
                        }

                        /* 三副露 */
                        let nonAnkanMelds = fanModifier.getFulouCount(model, seat);
                        if (nonAnkanMelds >= 3) {
                            hanOps.setYakuHan(hule, '三副露', 1);
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
                        let nonAnkanMelds = fanModifier.getFulouCount(game._model, seat);
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
                let isRong = !!context.rongpai;

                let candidates = new Set();
                let allSuits = ['m', 'p', 's', 'z'];
                for (let si = 0; si < allSuits.length; si++) {
                    let maxN = allSuits[si] === 'z' ? 7 : 9;
                    for (let n = 1; n <= maxN; n++) {
                        let pai = allSuits[si] + n;
                        for (let waitTile of ting) {
                            if (isRong) {
                                if (tileUtils.sameNumber(waitTile, pai)) {
                                    candidates.add(pai); break;
                                }
                            } else {
                                if (tileUtils.sameNumber(waitTile, pai)
                                    || tileUtils.sameSuit(waitTile, pai)) {
                                    candidates.add(pai); break;
                                }
                            }
                        }
                    }
                    if (allSuits[si] !== 'z') {
                        let red5 = allSuits[si] + '0';
                        for (let waitTile of ting) {
                            if (isRong) {
                                if (tileUtils.sameNumber(waitTile, red5)) {
                                    candidates.add(red5); break;
                                }
                            } else {
                                if (tileUtils.sameNumber(waitTile, red5)
                                    || tileUtils.sameSuit(waitTile, red5)) {
                                    candidates.add(red5); break;
                                }
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
                /* 副露巡目：吃碰巡目 或 杠巡目中的大明杠 */
                return fanModifier.isFulouTurn(context);
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let input = context.input;
                let shoupai = model.shoupai[seat];
                if (!shoupai) { context.done(); return; }
                let spname = game._playerDisplayName(game._ctx.playerIndex(seat));

                const CLASS_TO_OFFSET = { main: 0, xiajia: 1, duimian: 2, shangjia: 3 };
                const OFFSET_TO_CLASS = ['main', 'xiajia', 'duimian', 'shangjia'];

                /* ── ExchangePrompt 路径（人类玩家），AI 默认由 callback 处理 ── */
                let pairs = await input.askExchange({
                    swapCount: 1,
                    condition: 'suit_or_number',
                    pairing: 'hand_river',
                    description: '选择手牌与牌河牌交换（同花色或同点数）',
                }, () => {
                    /* ── AI 默认：选价值最低的非字手牌，配价值最高的匹配河牌 ── */
                    let allHandTiles = _getHandTiles(shoupai);
                    let handTiles = allHandTiles.filter(t => t[0] !== 'z');
                    if (handTiles.length === 0) return null;
                    let worstHand = handTiles[0], worstVal = _evalHandTileValue(handTiles[0], shoupai, game, seat);
                    for (let i = 1; i < handTiles.length; i++) {
                        let v = _evalHandTileValue(handTiles[i], shoupai, game, seat);
                        if (v < worstVal) { worstVal = v; worstHand = handTiles[i]; }
                    }
                    let bestRiver = null, bestRiverSeat = -1, bestRiverIdx = -1, bestVal = -Infinity;
                    for (let s = 0; s < 4; s++) {
                        let he = model.he[s];
                        if (!he) continue;
                        for (let i = 0; i < he._pai.length; i++) {
                            let base = he._pai[i].replace(/[_\*]$/, '');
                            if (base[0] === 'z') continue;
                            if (tileUtils.sameSuit(worstHand, base) || tileUtils.sameNumber(worstHand, base)) {
                                let v = _evalTileValue(base, game, seat);
                                if (v > bestVal) { bestVal = v; bestRiver = base; bestRiverSeat = s; bestRiverIdx = i; }
                            }
                        }
                    }
                    if (!bestRiver) return null;
                    let riverClass = OFFSET_TO_CLASS[(bestRiverSeat - seat + 4) % 4];
                    return [{ a: { tile: worstHand, player: 'hand', idx: -1 }, b: { tile: bestRiver, player: riverClass, idx: bestRiverIdx } }];
                });
                if (pairs && pairs.length > 0) {
                    let p = pairs[0];
                    let handTile, riverSeat, riverIdx;
                    if (p.a.player === 'hand') {
                        handTile = p.a.tile;
                        riverSeat = (seat + (CLASS_TO_OFFSET[p.b.player] || 0)) % 4;
                        riverIdx = p.b.idx;
                    } else {
                        handTile = p.b.tile;
                        riverSeat = (seat + (CLASS_TO_OFFSET[p.a.player] || 0)) % 4;
                        riverIdx = p.a.idx;
                    }
                    if (handTile[0] === 'z') { context.done(); return; }
                    let riverTile = model.he[riverSeat]._pai[riverIdx];
                    if (!riverTile) { context.done(); return; }
                    let riverBase = riverTile.replace(/[_\*]$/, '');
                    if (riverBase[0] === 'z') { context.done(); return; }
                    tileOps.removeFromHand(shoupai, handTile);
                    model.he[riverSeat]._pai[riverIdx] = handTile + '_';
                    tileOps.addToHand(shoupai, riverBase);
                    shoupai._zimo = riverBase;
                    game._add_action_log(spname + ' 将「' + game._pai_name(handTile)
                        + '」与牌河「' + game._pai_name(riverBase) + '」交换', seat);
                    if (game._view) game._view.redraw();
                    context.done();
                    return;
                }

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
                    let handVal = _evalHandTileValue(handTile, shoupai, game, seat);

                    for (let s = 0; s < 4; s++) {
                        let he = model.he[s];
                        if (!he) continue;
                        for (let j = 0; j < he._pai.length; j++) {
                            let t = he._pai[j];
                            let base = t.replace(/[_\*]$/, '');
                            let ok = tileUtils.sameSuit(base, handTile)
                                || tileUtils.sameNumber(base, handTile);
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
                if (context.player !== context.seat) return false;  // 防止 FENPEI_CALCULATED 放铳者二次触发
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
                    let count = tileUtils.countHePai(he);
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
                if (!(context.game && context.player === context.seat)) return false;
                let model = context.game._model;
                if (!model) return false;
                let shoupai = model.shoupai[context.seat];
                if (!shoupai) return false;
                /* 检查手上是否有幺九牌 */
                let allHandTiles = _getHandTiles(shoupai);
                let hasYaojiu = allHandTiles.some(function(t) {
                    if (t[0] === 'z') return true;
                    let n = tileUtils.numberOf(t);
                    return n === 1 || n === 9;
                });
                if (!hasYaojiu) return false;
                /* 检查牌河中是否有自风/场风 */
                let selfWind = 'z' + (context.seat + 1);
                let fieldWind = 'z' + (model.zhuangfeng + 1);
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        let base = t.replace(/[_\*]$/, '');
                        if (base === selfWind || base === fieldWind) return true;
                    }
                }
                return false;
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
                let matches = [];
                let seatNames = ['自家', '下家', '对家', '上家'];
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        let base = t.replace(/[_\*]$/, '');
                        if (base === selfWind || base === fieldWind) {
                            let relSeat = (s - seat + 4) % 4;
                            let label = seatNames[relSeat] + '·' + game._pai_name(base);
                            matches.push({ pai: base, seat: s, index: i, label: label });
                        }
                    }
                }

                if (matches.length === 0) { context.done(); return; }

                /* ── ExchangePrompt 路径（人类玩家），AI 默认由 callback 处理 ── */
                const OFFSET_TO_CLASS = ['main', 'xiajia', 'duimian', 'shangjia'];
                let pairs = await input.askExchange({
                    swapCount: 1,
                    condition: 'none',
                    pairing: 'hand_river',
                    description: '用幺九牌交换牌河中的自风/场风牌',
                    tileFilter: function(tile, source) {
                        if (source === 'hand') {
                            return tile[0] === 'z'
                                || tileUtils.numberOf(tile) === 1
                                || tileUtils.numberOf(tile) === 9;
                        } else {
                            return tile === selfWind || tile === fieldWind;
                        }
                    },
                }, () => {
                    /* ── AI 默认：选价值最低的幺九手牌，配第一个匹配的河牌 ── */
                    if (matches.length === 0 || yaojiuHand.length === 0) return null;
                    let m = matches[0];
                    let worst = yaojiuHand[0], worstVal = _evalHandTileValue(yaojiuHand[0], shoupai, game, seat);
                    for (let i = 1; i < yaojiuHand.length; i++) {
                        let v = _evalHandTileValue(yaojiuHand[i], shoupai, game, seat);
                        if (v < worstVal) { worstVal = v; worst = yaojiuHand[i]; }
                    }
                    let riverClass = OFFSET_TO_CLASS[(m.seat - seat + 4) % 4];
                    return [{ a: { tile: worst, player: 'hand', idx: -1 }, b: { tile: m.pai, player: riverClass, idx: m.index } }];
                });
                if (pairs && pairs.length > 0) {
                    let p = pairs[0];
                    const CLASS_TO_OFFSET = { main: 0, xiajia: 1, duimian: 2, shangjia: 3 };
                    /* 区分手牌和牌河 */
                    let handTile, riverSeat, riverIdx;
                    if (p.a.player === 'hand') {
                        handTile = p.a.tile;
                        riverSeat = (seat + (CLASS_TO_OFFSET[p.b.player] || 0)) % 4;
                        riverIdx = p.b.idx;
                    } else {
                        handTile = p.b.tile;
                        riverSeat = (seat + (CLASS_TO_OFFSET[p.a.player] || 0)) % 4;
                        riverIdx = p.a.idx;
                    }
                    /* 验证：河牌是自风/场风 */
                    let riverTile = model.he[riverSeat]._pai[riverIdx];
                    if (!riverTile || riverTile === '_') { context.done(); return; }
                    let riverBase = riverTile.replace(/[_\*]$/, '');
                    if (riverBase !== selfWind && riverBase !== fieldWind) { context.done(); return; }
                    /* 验证：手牌是幺九牌 */
                    let isYaojiu = (handTile[0] === 'z')
                        || (tileUtils.numberOf(handTile) === 1 || tileUtils.numberOf(handTile) === 9);
                    if (!isYaojiu) { context.done(); return; }
                    /* 执行交换 */
                    model.he[riverSeat]._pai[riverIdx] = handTile + '_';
                    tileOps.swapInHand(shoupai, handTile, riverBase);
                    game._add_action_log(spname + ' 将幺九牌「' + game._pai_name(handTile)
                        + '」与' + seatNames[(riverSeat - seat + 4) % 4] + '·' + game._pai_name(riverBase) + '交换', seat);
                    /* 若立直，交换后重置立直振听 */
                    if (game._lizhi[seat]) {
                        game._neng_rong[seat] = true;
                        game._add_action_log(spname + ' 交换后重置了立直振听', seat);
                    }
                    if (game._view) game._view.redraw();
                    context.done();
                    return;
                }

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

    /* ===== 涩谷尧深 (Shibuya_Takami) ===== */
    'Shibuya_Takami': {
        0: {
            /* 从牌河摸取与自己当前排牌河首张牌相同的牌，代替山摸，需手切 */
            timing: TimingPoints.BEFORE_DRAW,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            priority: 100,
            effectType: EffectType.DRAW_SOURCE,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) {
                    return false;
                }
                let seat = context.seat;
                let model = game._model;
                if (context.isExtraTurn) {
                    return false;
                }
                /* 当前排牌河首张牌，暗置时不可发动 */
                let firstTile = _getRiverFirstTile(model.he[seat]);
                if (!firstTile) {
                    return false;
                }
                /* 立直时仅自摸牌可发动 */
                if (game._lizhi[seat]) {
                    let shoupai = model.shoupai[seat];
                    if (!shoupai) return false;
                    let test = shoupai.clone();
                    tileOps.addToHand(test, firstTile);
                    return Majiang.Util.xiangting(test) < 0;
                }
                return true;
            },
            riverTileFilter: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let firstTile = _getRiverFirstTile(model.he[seat]);
                if (!firstTile) return new Set();
                let result = new Set();
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        if (t === '_') continue;
                        if (t.replace(/[_\*]$/, '') === firstTile) result.add(s + ':' + i);
                    }
                }
                return result;
            },
            execute: function(context) {
                let game = context.game;
                let seat = context.seat;
                /* 标记本巡须手切（不可切摸入牌） */
                game._skillHandDiscard = { seat: seat };
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                if (!shoupai) return { activate: false };

                let firstTile = _getRiverFirstTile(model.he[seat]);
                if (!firstTile) return { activate: false };

                /* 立直：仅自摸时发动 */
                if (game._lizhi[seat]) {
                    let test = shoupai.clone();
                    tileOps.addToHand(test, firstTile);
                    if (Majiang.Util.xiangting(test) >= 0) return { activate: false };
                } else {
                    let currentShanten = Majiang.Util.xiangting(shoupai);
                    let test = shoupai.clone();
                    tileOps.addToHand(test, firstTile);
                    if (Majiang.Util.xiangting(test) >= currentShanten) return { activate: false };
                }

                /* 摸入后会被立刻手摸切打出 → 不发动 */
                let getDapaiFn = context.getDapaiFn;
                if (getDapaiFn && _wouldDiscardImmediately(shoupai, firstTile, Majiang.Util.xiangting, getDapaiFn)) {
                    return { activate: false };
                }

                /* 找任意一张匹配牌河牌作为 choice */
                for (let s = 0; s < 4; s++) {
                    let he = model.he[s];
                    if (!he) continue;
                    for (let i = 0; i < he._pai.length; i++) {
                        let t = he._pai[i];
                        if (t === '_') continue;
                        if (t.replace(/[_\*]$/, '') === firstTile) {
                            let totalHe = 0;
                            for (let hs = 0; hs < 4; hs++) {
                                if (model.he[hs]) totalHe += tileUtils.countHePai(model.he[hs]);
                            }
                            /* 60% 概率发动 */
                            if (Math.random() > 0.6) return { activate: false };
                            console.log('[涩谷尧深] ✓发动! 总牌河=' + totalHe
                                + ' 自家牌河=' + JSON.stringify(model.he[seat]._pai)
                                + ' 首张=' + firstTile + ' 向听=' + Majiang.Util.xiangting(shoupai)
                                + ' 手牌=' + JSON.stringify(_getAllHandTiles(shoupai)));
                            return { activate: true, choice: { pai: firstTile, seat: s, index: i } };
                        }
                    }
                }
                return { activate: false };
            },
        },
    },

    /* ===== 神代小莳 (Jindai_Komaki) ===== */
    'Jindai_Komaki': {
        0: {
            /* ① 公开手牌并增加打点倍率（三个触发时点） */
            type: SkillType.CONDITIONAL,
            isOptional: true,
            priority: 100,

            parts: [
                {
                    /* Part A — BEFORE_DISCARD + firstTurn：第一次舍牌前 */
                    timing: TimingPoints.BEFORE_DISCARD,
                    condition: function(context) {
                        let game = context.game;
                        if (!game || context.player !== context.seat) return false;
                        if (!context.firstTurn) return false;
                        let seat = context.seat;
                        let openedSet = game._jindaiOpened[seat];
                        let shoupai = game._model.shoupai[seat];
                        if (!shoupai) return false;
                        return _hasUnopenedTiles(shoupai, openedSet);
                    },
                    execute: function(context) {
                        let game = context.game;
                        let seat = context.seat;
                        let shoupai = game._model.shoupai[seat];
                        let openedSet = game._jindaiOpened[seat];
                        let tiles = _getAllHandTiles(shoupai);
                        for (let t of tiles) {
                            openedSet.add(t);
                        }
                        shoupai.markTiles(tiles);
                        game._pointMulCoeff[seat] += 1;
                        game._add_action_log(
                            '神代小莳 公开手牌（倍率系数=' + game._pointMulCoeff[seat] + '）', seat);
                        if (game._view) game._view.redraw();
                        return { executed: true };
                    },
                    aiDecision: function(context) {
                        return true;
                    },
                },
                {
                    /* Part B — AFTER_DISCARD：舍牌后牌河共6张 */
                    timing: TimingPoints.AFTER_DISCARD,
                    condition: function(context) {
                        let game = context.game;
                        if (!game || context.player !== context.seat) return false;
                        let seat = context.seat;
                        let he = game._model.he[seat];
                        if (!he) return false;
                        let count = tileUtils.countHePai(he);
                        if (count !== 6) return false;
                        let openedSet = game._jindaiOpened[seat];
                        let shoupai = game._model.shoupai[seat];
                        if (!shoupai) return false;
                        return _hasUnopenedTiles(shoupai, openedSet);
                    },
                    execute: function(context) {
                        let game = context.game;
                        let seat = context.seat;
                        let shoupai = game._model.shoupai[seat];
                        let openedSet = game._jindaiOpened[seat];
                        let tiles = _getAllHandTiles(shoupai);
                        for (let t of tiles) {
                            openedSet.add(t);
                        }
                        shoupai.markTiles(tiles);
                        game._pointMulCoeff[seat] += 1;
                        game._add_action_log(
                            '神代小莳 公开手牌（倍率系数=' + game._pointMulCoeff[seat] + '）', seat);
                        if (game._view) game._view.redraw();
                        return { executed: true };
                    },
                    aiDecision: function(context) {
                        return true;
                    },
                },
                {
                    /* Part C — AFTER_DISCARD：舍牌后牌河共12张 */
                    timing: TimingPoints.AFTER_DISCARD,
                    condition: function(context) {
                        let game = context.game;
                        if (!game || context.player !== context.seat) return false;
                        let seat = context.seat;
                        let he = game._model.he[seat];
                        if (!he) return false;
                        let count = tileUtils.countHePai(he);
                        if (count !== 12) return false;
                        let openedSet = game._jindaiOpened[seat];
                        let shoupai = game._model.shoupai[seat];
                        if (!shoupai) return false;
                        return _hasUnopenedTiles(shoupai, openedSet);
                    },
                    execute: function(context) {
                        let game = context.game;
                        let seat = context.seat;
                        let shoupai = game._model.shoupai[seat];
                        let openedSet = game._jindaiOpened[seat];
                        let tiles = _getAllHandTiles(shoupai);
                        for (let t of tiles) {
                            openedSet.add(t);
                        }
                        shoupai.markTiles(tiles);
                        game._pointMulCoeff[seat] += 1;
                        game._add_action_log(
                            '神代小莳 公开手牌（倍率系数=' + game._pointMulCoeff[seat] + '）', seat);
                        if (game._view) game._view.redraw();
                        return { executed: true };
                    },
                    aiDecision: function(context) {
                        return true;
                    },
                },
                {
                    /* Part D — FENPEI_CALCULATED：应用乘算/加算系数 */
                    timing: TimingPoints.FENPEI_CALCULATED,
                    type: SkillType.PASSIVE,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule.defen != null && context.hule.fenpei);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        let seat = context.seat;
                        let game = context.game;
                        let coeff = game._pointMulCoeff[seat] || 1;
                        let adder = game._pointAddCoeff[seat] || 0;
                        if (coeff === 1 && adder === 0) return { executed: true };
                        hule.defen = Math.floor(coeff * hule.defen + adder);
                        _recalcJindaiFenpei(context, hule, seat);
                        return { executed: true };
                    },
                },
            ],
        },

        1: {
            /* ② 立直/一发/里宝视为2番，两立直视为4番 */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            priority: 200,
            condition: function(context) {
                return context.seat === context.player
                    && !!(context.hule && context.hule.hupai);
            },
            execute: function(context) {
                let hule = context.hule;
                if (hanOps.hasYaku(hule, '立直')) hanOps.setYakuHan(hule, '立直', 2);
                if (hanOps.hasYaku(hule, '一発')) hanOps.setYakuHan(hule, '一発', 2);
                /* 裏宝牌：每枚2番 → 总番加倍 */
                for (let y of hule.hupai) {
                    if (y.name === '裏宝牌') {
                        hule.fanshu = hule.fanshu - y.fanshu + y.fanshu * 2;
                        y.fanshu = y.fanshu * 2;
                        break;
                    }
                }
                if (hanOps.hasYaku(hule, '両立直')) hanOps.setYakuHan(hule, '両立直', 4);
                return { executed: true };
            },
        },

        2: {
            /* ③ 天和/地和视为双倍役满 */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            priority: 199,
            parts: [
                {
                    /* Part A — HULE_SETTLE：检查天和/地 */
                    timing: TimingPoints.HULE_SETTLE,
                    type: SkillType.PASSIVE,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule.hupai);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        if (hanOps.hasYaku(hule, '天和') || hanOps.hasYaku(hule, '地和')) {
                            hule._jindaiDoubleYakuman = true;
                        }
                        return { executed: true };
                    },
                },
                {
                    /* Part B — FENPEI_CALCULATED：打点翻倍 */
                    timing: TimingPoints.FENPEI_CALCULATED,
                    type: SkillType.PASSIVE,
                    priority: 199,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule._jindaiDoubleYakuman
                                  && context.hule.defen != null && context.hule.fenpei);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        let seat = context.seat;
                        hule.defen = hule.defen * 2;
                        _recalcJindaiFenpei(context, hule, seat);
                        return { executed: true };
                    },
                },
            ],
        },
    },

    /* ===== 戒能良子 (Kainou_Yoshiko) ===== */
    'Kainou_Yoshiko': {
        0: {
            /* ① 三/四/五门齐视为1/2/3番食下役且可以翻里宝 */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            priority: 150,
            condition: function(context) {
                return context.seat === context.player
                    && !!(context.hule && context.hule.hupai);
            },
            execute: function(context) {
                let hule = context.hule;
                let shoupai = context.shoupai;
                let game = context.game;
                let seat = context.seat;
                let model = game._model;

                if (!shoupai) return { executed: true };

                let catCount = _countCategories(shoupai);
                if (catCount < 3) return { executed: true };

                let names = ['', '', '', '三门齐', '四门齐', '五门齐'];
                let name = names[catCount];
                let han = catCount - 2; /* 3→1, 4→2, 5→3 */

                /* 食下：有副露（非暗杠）则-1番 */
                let isMenzen = fanModifier.getFulouCount(model, seat) === 0;
                if (!isMenzen) han -= 1;

                if (han > 0) {
                    hanOps.setYakuHan(hule, name, han);
                }

                /* 可以翻里宝：即使食下后0番也仍能翻，翻牌数量跟立直一致 */
                _addExtraUraDora(hule, model, shoupai, model.shan.baopai.length);

                return { executed: true };
            },
        },

        1: {
            /* ② 舍牌后暗切靠张摸牌 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            priority: 100,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 立直时无法发动 */
                let seat = context.seat;
                if (game._lizhi[seat]) return false;
                let dapai = context.dapai || '';
                let base = dapai.replace(/[_*]$/, '');
                if (!base) return false;
                /* 手牌中存在靠张 */
                let kaozhangSet = _getKaozhangSet(base);
                let shoupai = game._model.shoupai[seat];
                if (!shoupai) return false;
                let tiles = _getAllHandTiles(shoupai);
                for (let t of tiles) {
                    if (kaozhangSet.has(t) || kaozhangSet.has(t[0] + (t[1] === '0' ? '5' : t[1]))) {
                        return true;
                    }
                }
                return false;
            },
            execute: async function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                let input = context.input;
                let dapai = context.dapai || '';
                let base = dapai.replace(/[_*]$/, '');

                let kaozhangSet = _getKaozhangSet(base);
                let handTiles = _getAllHandTiles(shoupai);
                let candidates = [];
                for (let t of handTiles) {
                    let key = t[1] === '0' ? t[0] + '5' : t;
                    if (kaozhangSet.has(key)) {
                        candidates.push(t);
                    }
                }

                if (candidates.length === 0) { context.done(); return; }

                let chosen;
                if (candidates.length === 1) {
                    chosen = candidates[0];
                } else {
                    /* 多张靠张时 UI 选择 */
                    let sel = await input.pickHandTiles(1, '选择一张靠张暗切',
                        () => [candidates[0]],
                        candidates,
                        { confirmText: '确定', noCancel: true });
                    chosen = (sel && sel.length > 0) ? sel[0] : candidates[0];
                }
                if (!chosen) { context.done(); return; }

                /* 展示靠张 */
                game._add_action_log(
                    '戒能良子 展示靠张「' + game._pai_name(chosen) + '」并暗切摸牌', seat);

                /* 从手牌移除并暗切置入牌河 */
                try {
                    tileOps.removeFromHand(shoupai, chosen);
                } catch(e) {
                    context.done();
                    return;
                }
                model.he[seat].dapai(chosen, true);
                /* 摸1张牌 */
                if (model.shan.paishu === 0) {
                    context.done();
                    return;
                }
                let newTile = model.shan.zimo();
                shoupai.zimo(newTile, false);
                shoupai._zimo = null;
                if (game._view) game._view.redraw();
                context.done();
            },
            aiDecision: function(context) {
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = model.shoupai[seat];
                let dapai = context.dapai || '';
                let base = dapai.replace(/\*$/, '');
                let kaozhangSet = _getKaozhangSet(base);
                let handTiles = _getAllHandTiles(shoupai);

                /* 计算当前向听数 */
                let currentShanten = Majiang.Util.xiangting(shoupai);

                let bestTile = null;
                let bestValue = Infinity;
                for (let t of handTiles) {
                    let key = t[1] === '0' ? t[0] + '5' : t;
                    if (!kaozhangSet.has(key)) continue;
                    /* 模拟移除靠张后向听数不降低（不增加） */
                    let test = shoupai.clone();
                    tileOps.removeFromHand(test, t);
                    if (Majiang.Util.xiangting(test) > currentShanten) continue;
                    let val = _evalStaticTileValue(t);
                    if (val < bestValue) {
                        bestValue = val;
                        bestTile = t;
                    }
                }
                return !!bestTile;
            },
        },
    },

    /* ===== 泽村智纪 (Sawamura_Tomoki) ===== */
    'Sawamura_Tomoki': {
        0: {
            /* ① 一杯口/两杯口仅需顺子点数相同，2/5番且可副露，不复计三色同顺 */
            yakuExpander: function(context) {
                let shoupai = context.shoupai;
                if (!shoupai) return [];
                let beikou = _countRelaxedIipeikou(shoupai);
                if (beikou >= 2) return [{ name: '二杯口', fanshu: 5 }];
                if (beikou >= 1) return [{ name: '一杯口', fanshu: 2 }];
                return [];
            },
            parts: [
                {
                    timing: TimingPoints.HULE_SETTLE,
                    condition: function(context) {
                        return context.seat === context.player
                            && !!(context.hule && context.hule.hupai);
                    },
                    execute: function(context) {
                        let hule = context.hule;
                        /* 一杯口→2番，二杯口→5番 */
                        if (hanOps.hasYaku(hule, '一杯口')) hanOps.setYakuHan(hule, '一杯口', 2);
                        if (hanOps.hasYaku(hule, '二杯口')) hanOps.setYakuHan(hule, '二杯口', 5);
                        /* 不复计三色同顺 */
                        if (hanOps.hasYaku(hule, '一杯口') || hanOps.hasYaku(hule, '二杯口')) {
                            hanOps.removeYaku(hule, '三色同顺');
                        }
                        return { executed: true };
                    },
                },
            ],
        },
        1: {
            /* ② 自摸新役种：门清2番（覆盖门前清自摸和），副露1番（食下役） */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_YAKU_VALUE,
            condition: function(context) {
                return context.seat === context.player
                    && !!(context.hule && context.hule.hupai)
                    && !context.rongpai;
            },
            execute: function(context) {
                let hule = context.hule;
                if (hanOps.hasYaku(hule, '门前清自摸和')) {
                    /* 门清自摸：去除门前清自摸和（1番），添加自摸（2番） */
                    hanOps.removeYaku(hule, '门前清自摸和');
                    if (!hanOps.hasYaku(hule, '自摸')) {
                        hule.hupai.push({ name: '自摸', fanshu: 2, type: 'yaku' });
                        hule.fanshu += 2;
                    }
                } else {
                    /* 副露自摸：自摸1番（食下役） */
                    if (!hanOps.hasYaku(hule, '自摸')) {
                        hule.hupai.push({ name: '自摸', fanshu: 1, type: 'yaku' });
                        hule.fanshu += 1;
                    }
                }
                return { executed: true };
            },
        },
        2: {
            /* ③ 你舍牌时，若有玩家最后一张舍牌是宝牌或立直宣言牌，可以暗切 */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.HIDDEN_DISCARD,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                let model = game._model;
                let lastDiscard = context.lastDiscard;
                if (!lastDiscard) return false;

                for (let s = 0; s < 4; s++) {
                    let t = lastDiscard[s];
                    if (!t) continue;
                    /* 红宝牌 */
                    if (tileUtils.isRed5(t)) return true;
                    /* 表宝牌/杠宝牌（不含里宝牌） */
                    if (tileUtils.isDora(t, model.shan._baopai)) return true;
                    /* 立直宣言牌：精确匹配宣言立直时打出的那张牌（非后续摸切） */
                    if (game._riichiDeclarationTiles
                        && game._riichiDeclarationTiles[s] === t) return true;
                }
                return false;
            },
            execute: function(context) {
                context.game._extra_hidden_discard = true;
                return { executed: true };
            },
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 染谷真子 (Someya_Mako) ===== */
    'Someya_Mako': {
        0: {
            /* ① 混一色仅需花色数不多于2 */
            yakuExpander: function(context) {
                let shoupai = context.shoupai;
                let game = context.game;
                let seat = context.seat;
                if (!shoupai || !game) return [];

                let model = game._model;
                if (!model) return [];

                /* 只有花牌种类恰好为2时才追加混一色
                   0种 → 字一色, 1种 → 清一色或标准混一色, 3种以上 → 不满足 */
                let handSuits = _countNumberSuits(shoupai);
                if (handSuits !== 2) return [];

                let isMenzen = fanModifier.getFulouCount(model, seat) === 0;

                return [{ name: '混一色', fanshu: isMenzen ? 3 : 2 }];
            },
        },

        1: {
            /* ② 副露舍牌后，副露区满足染手条件可额外巡 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            priority: 100,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 不在额外巡链中 */
                if (game._extra_turn) return false;
                if (typeof game._extra_chain_remaining === 'number' && game._extra_chain_remaining >= 0) return false;
                /* 仅副露/大明杠导致的舍牌巡目触发 */
                if (!fanModifier.isFulouTurn(context)) return false;
                /* 副露区满足染手条件（数牌花色不超过1） */
                let shoupai = game._model.shoupai[context.seat];
                return _countMeldSuits(shoupai) <= 1;
            },
            execute: function(context) {
                let game = context.game;
                let seat = context.seat;
                game._add_action_log('染谷真子 发动技能进行额外巡', seat);
                extraTurn.start(game, seat, 1);
                context.done();
            },
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 竹井久 (Takei_Hisa) ===== */
    'Takei_Hisa': {
        0: {
            /* ① 恶听：残听枚数总和 → 番数 */
            timing: TimingPoints.CHECK_HULE,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_YAKU_VALUE,
            yakuExpander: function(context) {
                let shoupai = context.shoupai;
                let game = context.game;
                let seat = context.seat;
                if (!shoupai || !game) return [];

                let model = game._model;
                if (!model) return [];

                /* 获取听牌列表（不含当前摸/荣牌） */
                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length >= 2) {
                    try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                }
                hand13._zimo = null;
                let ting = Majiang.Util.tingpai(hand13) || [];
                if (ting.length === 0) return [];

                let excludeTile = context.rongpai || origZimo;

                /* 计算所有听牌的残枚数总和 */
                let totalRemaining = 0;
                for (let t of ting) {
                    totalRemaining += _countRemaining(model, seat, t, excludeTile);
                }

                /* 1→4番, 2→3番, 3→2番, 4-5→1番 */
                let han;
                if (totalRemaining === 1) han = 4;
                else if (totalRemaining === 2) han = 3;
                else if (totalRemaining === 3) han = 2;
                else if (totalRemaining >= 4 && totalRemaining <= 5) han = 1;
                else return [];

                return [{ name: '恶听', fanshu: han }];
            },
        },

        1: {
            /* ② 地狱听牌(残枚1)时可魔法和牌点数相同的牌 */
            timing: TimingPoints.DECLARE_HULE,
            type: SkillType.PASSIVE,
            usageType: UsageType.ONCE_PER_HAND,
            usageMax: 1,
            effectType: EffectType.VIEW_AS_WIN_TILE,
            huleExpander: function(context) {
                let shoupai = context.shoupai;
                let game = context.game;
                let seat = context.seat;
                if (!shoupai || !game) return [];

                let model = game._model;
                if (!model) return [];

                /* 听牌列表 */
                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length >= 2) {
                    try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                }
                hand13._zimo = null;
                let ting = Majiang.Util.tingpai(hand13) || [];
                if (ting.length === 0) return [];

                let excludeTile = context.rongpai || origZimo;

                /* 残枚数总和必须为 1 */
                let totalRemaining = 0;
                for (let t of ting) {
                    totalRemaining += _countRemaining(model, seat, t, excludeTile);
                }
                if (totalRemaining !== 1) return [];

                /* 收集听牌点数（字牌无点数不计） */
                let pointValues = new Set();
                for (let t of ting) {
                    if (t[0] === 'z') continue;
                    let n = parseInt(t[1]);
                    if (isNaN(n) || n === 0) n = 5;
                    pointValues.add(n);
                }
                if (pointValues.size === 0) return [];

                /* 候选牌：所有同点数的数牌 */
                let candidates = new Set();
                for (let s of ['m', 'p', 's']) {
                    for (let pv of pointValues) {
                        candidates.add(s + pv);
                    }
                }

                /* 移除听牌本身（正常和牌范围） */
                for (let t of ting) {
                    candidates.delete(t);
                    if (t[1] === '0') candidates.delete(t[0] + '5');
                    if (t[1] === '5') candidates.delete(t[0] + '0');
                }

                return Array.from(candidates);
            },
            condition: function(context) {
                return context.seat === context.player;
            },
            execute: async function(context) {
                if (!context.input || typeof context.input.askTileOptions !== 'function') return;

                let shoupai = context.shoupai;
                let menfeng = context.seat;
                let input = context.input;

                /* 听牌列表作为选项 */
                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length >= 2) {
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
                    '选择视为哪张牌和牌（恶听）',
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
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 泷见春 (Takimi_Haru) ===== */
    'Takimi_Haru': {
        0: {
            /* ① 副露时可以暗切 */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.HIDDEN_DISCARD,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 仅副露/大明杠导致的舍牌巡目触发 */
                return fanModifier.isFulouTurn(context);
            },
            execute: function(context) {
                context.game._extra_hidden_discard = true;
                return { executed: true };
            },
            aiDecision: function(context) {
                return true;
            },
        },

        1: {
            /* ② 舍弃点数2或8的牌后，可以执行额外巡 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            priority: 100,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 不在额外巡链中 */
                if (game._extra_turn) return false;
                if (typeof game._extra_chain_remaining === 'number' && game._extra_chain_remaining >= 0) return false;
                /* 舍牌点数为 2 或 8 */
                let dapai = context.dapai || '';
                let base = dapai.replace(/\*$/, '');
                if (!base || base.endsWith('_')) return false;
                if (base[0] === 'z') return false;
                let n = parseInt(base[1]);
                return n === 2 || n === 8;
            },
            execute: function(context) {
                let game = context.game;
                let seat = context.seat;
                game._add_action_log('泷见春 舍弃' + game._pai_name(context.dapai) + '后进行额外巡', seat);
                extraTurn.start(game, seat, 1);
                context.done();
            },
            aiDecision: function(context) {
                return true;
            },
        },

        2: {
            /* ③ 中张：手牌全3-7数牌视为1番役，且可魔法和牌同点数牌 */
            timing: TimingPoints.DECLARE_HULE,
            type: SkillType.PASSIVE,
            usageType: UsageType.ONCE_PER_HAND,
            usageMax: 1,
            effectType: EffectType.VIEW_AS_WIN_TILE,
            yakuExpander: function(context) {
                let shoupai = context.shoupai;
                let game = context.game;
                if (!shoupai || !game) return [];

                /* 荣和时 shoupai 为 13 张不含荣牌 → 自摸时 shoupai 为 14 张含自摸牌
                   _isAllChunchan 自然反映 ron/zimo 区分 */
                if (!_isAllChunchan(shoupai)) return [];

                return [{ name: '中张', fanshu: 1 }];
            },
            huleExpander: function(context) {
                let shoupai = context.shoupai;
                let game = context.game;
                if (!shoupai || !game) return [];

                if (!_isAllChunchan(shoupai)) return [];

                /* 候选牌：手牌中出现的牌（0和5互为相同牌） */
                let candidates = new Set();
                for (let s of ['m', 'p', 's']) {
                    let bp = shoupai._bingpai[s];
                    if (!bp) continue;
                    for (let n = 3; n <= 7; n++) {
                        if ((bp[n] || 0) > 0) {
                            candidates.add(s + n);
                            if (n === 5) candidates.add(s + '0');
                        }
                    }
                    if ((bp[0] || 0) > 0) { candidates.add(s + '5'); candidates.add(s + '0'); }
                }
                return Array.from(candidates);
            },
            condition: function(context) {
                return context.seat === context.player;
            },
            execute: async function(context) {
                if (!context.input || typeof context.input.askTileOptions !== 'function') return;

                let shoupai = context.shoupai;
                let menfeng = context.seat;
                let input = context.input;

                /* 听牌列表作为选项 */
                let hand13 = shoupai.clone();
                let origZimo = shoupai._zimo;
                if (!context.rongpai && origZimo && origZimo.length >= 2) {
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
                    '选择视为哪张牌和牌（中张）',
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
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 东横桃子 (Touyouko_Momoko) ===== */
    'Touyouko_Momoko': {
        0: {
            /* ① 默听和牌时结算立直、一发、里宝 */
            timing: TimingPoints.HULE_SETTLE,
            type: SkillType.PASSIVE,
            effectType: EffectType.MODIFY_YAKU_VALUE,
            condition: function(context) {
                if (context.seat !== context.player) return false;
                if (!(context.hule && context.hule.hupai)) return false;
                let game = context.game;
                /* 未立直 */
                if (game._lizhi[context.seat] !== 0) return false;
                /* 门清 */
                return fanModifier.getFulouCount(game._model, context.seat) === 0;
            },
            execute: function(context) {
                let hule = context.hule;
                let game = context.game;
                let seat = context.seat;
                let model = game._model;
                let shoupai = context.shoupai;

                /* 添加立直（1番） */
                if (!hanOps.hasYaku(hule, '立直')) {
                    hule.hupai.push({ name: '立直', fanshu: 1 });
                    hule.fanshu += 1;
                }
                /* 添加一发（1番） */
                if (!hanOps.hasYaku(hule, '一発')) {
                    hule.hupai.push({ name: '一発', fanshu: 1 });
                    hule.fanshu += 1;
                }
                /* 翻里宝牌 */
                _addExtraUraDora(hule, model, shoupai, model.shan.baopai.length);

                return { executed: true };
            },
        },

        1: {
            /* ② 第三排牌河（>12张，仅跳副露不跳暗切）或两家以上他人立直时可暗切 */
            timing: TimingPoints.DISCARD_SELECTED,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            effectType: EffectType.HIDDEN_DISCARD,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                let seat = context.seat;

                /* 两家以上他人立直 */
                let riichiCount = 0;
                for (let l = 0; l < 4; l++) {
                    if (l !== seat && game._lizhi && game._lizhi[l]) riichiCount++;
                }
                if (riichiCount >= 2) return true;

                /* 牌河可见牌 >12（仅跳过被副露的牌，暗切牌计入） */
                let he = game._model.he[seat];
                if (!he || !he._pai) return false;
                return tileUtils.countHePai(he) > 12;
            },
            execute: function(context) {
                context.game._extra_hidden_discard = true;
                return { executed: true };
            },
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 辻垣内智叶 (Tsujigaito_Satoha) ===== */
    'Tsujigaito_Satoha': {
        0: {
            /* ① 观看牌山第一张，与手牌或牌河交换 */
            type: SkillType.CONDITIONAL,
            isOptional: true,
            usageType: UsageType.ONCE_PER_TURN,
            usageMax: 1,
            effectType: EffectType.SWAP_TILES,
            parts: [
                {
                    /* 首巡舍牌前 */
                    timing: TimingPoints.BEFORE_DISCARD,
                    condition: function(context) {
                        let game = context.game;
                        if (!game || context.player !== context.seat) return false;
                        return !!context.firstTurn;
                    },
                },
                {
                    /* 他家暗切时 */
                    timing: TimingPoints.AFTER_DISCARD,
                    condition: function(context) {
                        if (!context.game || context.player === context.seat) return false;
                        return !!context.game._dapaiHidden;
                    },
                },
                {
                    /* 他家副露时 */
                    timing: TimingPoints.AFTER_FULOU,
                    condition: function(context) {
                        if (!context.game) return false;
                        return context.player !== context.seat;
                    },
                },
                {
                    /* 他家宣言立直时 */
                    timing: TimingPoints.DECLARE_RIICHI,
                    condition: function(context) {
                        if (!context.game) return false;
                        return context.player !== context.seat;
                    },
                },
            ],
            execute: async function(context) {
                let game = context.game;
                let model = game._model;

                /* 观看牌山第一张 */
                let peeked = tileOps.peekFront(model, 1);
                if (!peeked || peeked.length === 0) { context.done(); return; }
                let wallTile = peeked[0];

                game._add_action_log(
                    '辻垣内智叶 观看牌山: ' + game._pai_name(wallTile),
                    context.seat);

                await _doWallSwap(context, wallTile);
                context.done();
            },
            aiDecision: function(context) {
                return true;
            },
        },
    },

    /* ===== 一姬 (Ichihime) ===== */
    'Ichihime': {
        0: {
            /* ① 非额外巡舍出幺九牌后，可执行额外巡目 */
            timing: TimingPoints.AFTER_DISCARD,
            type: SkillType.CONDITIONAL,
            isOptional: true,
            priority: 100,
            effectType: EffectType.EXTRA_TURN,
            condition: function(context) {
                let game = context.game;
                if (!game || context.player !== context.seat) return false;
                /* 不在额外巡链中 */
                if (game._extra_turn) return false;
                if (typeof game._extra_chain_remaining === 'number'
                    && game._extra_chain_remaining >= 0) return false;
                /* 舍牌为幺九牌（1/9 数牌或字牌） */
                let dapai = context.dapai || '';
                let base = dapai.replace(/\*$/, '');
                if (!base || base.endsWith('_')) return false;
                if (base[0] === 'z') return true;
                let n = parseInt(base[1]);
                return n === 1 || n === 9;
            },
            execute: function(context) {
                let game = context.game;
                let seat = context.seat;
                game._add_action_log('一姬 舍弃幺九牌' + game._pai_name(context.dapai) + '后进行额外巡', seat);
                extraTurn.start(game, seat, 1);
                context.done();
            },
            aiDecision: function(context) {
                return true;
            },
        },
        1: {
            /* ② 和牌役种包含断幺九→不计红宝牌和杠宝牌；不含断幺九→不计表宝牌和里宝牌 */
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
                let shoupai = context.shoupai;
                let rongpai = context.rongpai;
                let model = game._model;

                if (!shoupai) return { executed: true };

                let allTiles = _getAllTilesWithMelds(shoupai, rongpai);
                let d = _countDoraByType(allTiles, model);

                if (hanOps.hasYaku(hule, '断幺九')) {
                    /* 包含断幺九 → 不计红宝牌和杠宝牌 → 只计表宝牌和里宝牌 */
                    hanOps.removeYaku(hule, '宝牌');
                    hanOps.removeYaku(hule, '红宝牌');
                    if (d.omote > 0) {
                        hule.hupai.push({ name: '宝牌', fanshu: d.omote, type: 'dora' });
                        hule.fanshu += d.omote;
                    }
                    /* 里宝牌保留 */
                } else {
                    /* 不含断幺九 → 不计表宝牌和里宝牌 → 只计杠宝牌和红宝牌 */
                    hanOps.removeYaku(hule, '宝牌');
                    hanOps.removeYaku(hule, '里宝牌');
                    if (d.kan > 0) {
                        hule.hupai.push({ name: '宝牌', fanshu: d.kan, type: 'dora' });
                        hule.fanshu += d.kan;
                    }
                    /* 红宝牌保留 */
                }

                return { executed: true };
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
                    skill.usage.type !== UsageType.AI_ONCE_PER_TURN &&
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
module.exports.SKILL_EXECUTE_MAP = SKILL_EXECUTE_MAP;
