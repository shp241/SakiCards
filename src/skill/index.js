/**
 * 超能力麻将 - 技能系统主入口
 * SkillManager 是技能系统与 Game/Player/UI 交互的唯一接口
 */
'use strict';

const { TimingPoints } = require('./triggers');
const { SkillType, UsageType, EffectType, AssignmentMode, ZoneVisibility } = require('./skill-types');
const { ZoneManager } = require('./zone-manager');
const CharacterPool = require('./character-pool');
const SkillRegistry = require('./skill-registry');
const { mergeRule } = require('./game-settings');
const tileOps = require('../effect/tile-ops');

/**
 * 技能管理器
 * 管理对局中所有玩家的角色和技能
 */
class SkillManager {

    /**
     * @param {Object} options
     * @param {Object[]} options.characters - 角色数据（来自 characters_skills.js）
     * @param {Object} options.rule - 规则配置
     */
    constructor(options = {}) {
        let rule = mergeRule(options.rule || {});

        /** 规则配置 */
        this._rule = rule;

        /** 技能是否启用 */
        this._enabled = rule['技能模式'] !== '关闭';
        this._passiveOnly = rule['技能模式'] === '仅被动';

        /** 角色注册表 */
        this._registry = new SkillRegistry(options.characters || []);

        /** 角色池 */
        this._pool = new CharacterPool(
            this._registry.getAllCharacters(),
            {
                poolLimit: rule['角色池限制'],
                cooldown: rule['角色冷却あり'],
            }
        );

        /** 区域管理器 */
        this._zoneManager = new ZoneManager(rule['プレイヤー数'] || 4);

        /**
         * 各玩家当前激活的角色ID。
         * **按游戏席位（gameSeat）索引**：_activeCharacters[seat] = characterId | null
         * seat=0: 东家, seat=1: 南家, seat=2: 西家, seat=3: 北家
         * 与 model.shoupai[seat] / model.he[seat] 使用同一套索引体系
         */
        this._activeCharacters = [null, null, null, null];

        /** 各玩家已使用的角色（用于半庄冷却） */
        this._usedCharacters = [];

        /** 对局中的玩家数量 */
        this._playerCount = rule['プレイヤー数'] || 4;

        /** 待处理的角色选择结果 */
        this._dealResult = null;

        /** 待处理的玩家操作 */
        this._pendingActions = [];

        /** 当前游戏引用 */
        this._game = null;

        /**
         * 本回合技能触发记录（每次摸牌回合清零）
         * 结构：{ [seat]: { [skillIndex]: data } }
         * skillIndex 从 1 开始（展示用），与技能编号对应
         */
        this._turnTriggerLog = {};

        /**
         * 本巡 BEFORE_DISCARD 已发动过的技能 ID 集合
         * 确保每个舍牌前技能每巡目限一次，但不影响其他技能
         * 仅在新摸牌自然调用时清除（_finish_zimo 非重入），技能回调中不清除
         */
        this._bdUsedThisTurn = {};

        /**
         * 技能持久数据存储（每局清零）
         * 技能可在此存储跨回合的数据（如"已使用的牌河排号"等）
         * 结构：{ [seat]: { [characterId]: { [skillIndex]: value } } }
         */
        this._skillData = {};
    }

    /* ================================================================
     * 角色管理
     * ================================================================ */

    /**
     * 开局分配角色卡
     *
     * @param {string} mode - 分配模式
     * @returns {Object[]} 每位玩家的可选角色列表
     */
    dealCharacters(mode) {
        if (!this._enabled) return [];

        let assignmentMode = mode || this._rule['角色分配方式'];
        this._dealResult = this._pool.deal(assignmentMode, this._playerCount);
        return this._dealResult;
    }

    /**
     * 【角色池操作】从角色池中确认选择某个角色。
     * 仅操作角色池（CharacterPool），不涉及 _activeCharacters / 座位分配。
     *
     * **重要**：参数 `selectSeat` 是选择时的席位（qipai 前 = dealResult 中的 player 字段），
     * 不是 qipai 后的游戏席位。角色池按 selectSeat 查找每位玩家的发牌选项。
     *
     * 调用后需单独调用 assignCharacterToSeat() 将角色分配给正确的游戏席位。
     *
     * @param {number} selectSeat - 选择时的席位 (0-3 = dealResult[].player)
     * @param {number} optionIndex - 选择的角色在选项数组中的索引
     * @returns {Object} 被选中的角色数据 { id, name, card, skills }
     */
    confirmChoiceFromPool(selectSeat, optionIndex) {
        if (!this._dealResult) {
            throw new Error('尚未发牌角色卡');
        }

        let character = this._pool.confirmChoice(
            selectSeat, optionIndex, this._dealResult
        );

        this._usedCharacters.push(character);
        return character;
    }

    /**
     * 【座位分配】将角色分配到指定游戏席位。
     * 写入 _activeCharacters、激活被动技能、创建角色牌区域。
     *
     * **重要**：参数 `gameSeat` 是 qipai 后的模型席位（0=东, 1=南, 2=西, 3=北），
     * 后续所有技能触发都以 gameSeat 索引 _activeCharacters。
     *
     * @param {number} gameSeat - 游戏席位 (0-3，qipai 后的 seat)
     * @param {string} characterId - 角色 ID（来自 confirmChoiceFromPool 返回值的 .id）
     */
    assignCharacterToSeat(gameSeat, characterId) {
        this._activeCharacters[gameSeat] = characterId;

        /* 激活角色的持续被动技能 */
        this._activatePassiveSkills(gameSeat, characterId);

        /* 创建角色牌区域 */
        this._setupCharacterZones(gameSeat, characterId);
    }

    /**
     * @deprecated 请使用 confirmChoiceFromPool() + assignCharacterToSeat() 两步调用。
     *             保留此方法以兼容旧代码，内部调用上述两个新方法。
     */
    confirmCharacter(playerIdx, optionIndex) {
        let character = this.confirmChoiceFromPool(playerIdx, optionIndex);
        this.assignCharacterToSeat(playerIdx, character.id);
        return character;
    }

    /**
     * 获取某游戏席位当前激活的角色
     * @param {number} seat - 游戏席位 (0=东/1=南/2=西/3=北)
     * @returns {Object|null} 角色对象
     */
    getCharacter(seat) {
        let charId = this._activeCharacters[seat];
        if (!charId) return null;
        return this._registry.getCharacter(charId);
    }

    /**
     * 获取某游戏席位的角色ID
     * @param {number} seat - 游戏席位 (0=东/1=南/2=西/3=北)
     * @returns {string|null}
     */
    getCharacterId(seat) {
        return this._activeCharacters[seat] || null;
    }

    /**
     * 获取某游戏席位当前角色的所有技能（原始 skill 对象，含 type/condition/usage/sealed 等）
     * @param {number} seat - 游戏席位 (0=东/1=南/2=西/3=北)
     * @returns {Object[]}
     */
    getCharacterSkills(playerIdx) {
        let charId = this._activeCharacters[playerIdx];
        if (!charId) return [];
        return this._registry.getCharacterSkills(charId);
    }

    /**
     * 查询指定时点下某座位的可选技能（不触发、不执行）
     * 用于 UI 层提前获取可用技能按钮列表（如 BEFORE_DISCARD 主动技）。
     *
     * @param {string} timing - 时点
     * @param {number} seat  - 游戏席位 (0=东/1=南/2=西/3=北)
     * @param {Object} context - 上下文（传给 condition 检查）
     * @returns {Array<{ skillId, label, seat }>}
     */
    getOptionalSkillDescriptions(timing, seat, context = {}) {
        if (!this._enabled) return [];
        let seatToPlIdx = context.tableCtx
            ? [0, 1, 2, 3].map(s => context.tableCtx.playerIndex(s))
            : [];
        let matches = this._registry.querySkills(seat, timing, this._activeCharacters, seatToPlIdx);
        let actions = [];
        for (let match of matches) {
            let skill = match.skill;
            if (!skill.isOptional || skill.sealed.currently) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            /* 本巡已发动过的 BEFORE_DISCARD 技能不再显示 */
            if (timing === TimingPoints.BEFORE_DISCARD && this._bdUsedThisTurn[skill.id]) continue;
            if (skill.trigger.condition) {
                let condCtx = Object.assign({}, context, { seat: match.seat });
                if (!skill.trigger.condition(condCtx)) continue;
            }
            let circleNums = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
            let charSkills = this.getCharacterSkills(match.seat);
            let idx = -1;
            for (let i = 0; i < charSkills.length; i++) {
                if (charSkills[i].id === skill.id) { idx = i; break; }
            }
            actions.push({
                skillId: skill.id,
                label: skill.characterName + (idx >= 0 ? circleNums[idx + 1] : ''),
                seat: match.seat,
            });
        }
        return actions;
    }

    /**
     * 获取所有玩家的角色信息（用于 kaiju 消息）
     * @returns {Array} 角色信息数组
     */
    getAllCharacters() {
        let result = [];
        for (let l = 0; l < 4; l++) {
            let charId = this._activeCharacters[l];
            let charData = charId ? this._registry.getCharacter(charId) : null;
            result[l] = {
                id:     charId || null,
                name:   charData ? charData.name : '',
                card:   charData ? charData.card : '',
                skills: charData ? charData.skills.map(s => (typeof s === 'string' ? s : s.description)) : [],
            };
        }
        return result;
    }

    /**
     * 查询指定座位的和牌资格扩展器（huleExpander）。
     * 返回所有可以扩展和牌候选范围的技能数据。
     *
     * @param {number} seat - 游戏席位 (0=东/1=南/2=西/3=北)
     * @param {Object} context - 上下文（含 shoupai 等）
     * @returns {Array<{ skillId, candidates: string[], seat }>}
     */
    getHuleExpanders(seat, context = {}) {
        if (!this._enabled) return [];
        let charId = this._activeCharacters[seat];
        if (!charId) return [];
        let skills = this._registry.getCharacterSkills(charId);
        let expanders = [];
        for (let skill of skills) {
            if (skill.sealed.currently) continue;
            if (!skill.huleExpander) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            let candidates = skill.huleExpander(Object.assign({}, context, { seat }));
            if (candidates && candidates.length > 0) {
                expanders.push({
                    skillId: skill.id,
                    skill: skill,
                    candidates: candidates,
                    seat: seat,
                });
            }
        }
        return expanders;
    }

    /**
     * 查询指定座位的听牌资格扩展器（tenpaiExpander）。
     * 在 pingju() 听牌判定时调用，返回可视为听牌的候选牌列表。
     */
    getTenpaiExpanders(seat, context = {}) {
        if (!this._enabled) return [];
        let charId = this._activeCharacters[seat];
        if (!charId) return [];
        let skills = this._registry.getCharacterSkills(charId);
        let expanders = [];
        for (let skill of skills) {
            if (skill.sealed.currently) continue;
            if (!skill.tenpaiExpander) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            let candidates = skill.tenpaiExpander(Object.assign({}, context, { seat }));
            if (candidates && candidates.length > 0) {
                expanders.push({
                    skillId: skill.id,
                    skill: skill,
                    candidates: candidates,
                    seat: seat,
                });
            }
        }
        return expanders;
    }

    /**
     * 查询指定座位的碰牌资格扩展器（ponExpander）。
     * 在 get_peng_mianzi() 判定时调用，返回可视为碰牌的候选牌列表。
     */
    getPonExpanders(seat, context = {}) {
        if (!this._enabled) return [];
        let charId = this._activeCharacters[seat];
        if (!charId) return [];
        let skills = this._registry.getCharacterSkills(charId);
        let expanders = [];
        for (let skill of skills) {
            if (skill.sealed.currently) continue;
            if (!skill.ponExpander) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            let candidates = skill.ponExpander(Object.assign({}, context, { seat }));
            if (candidates && candidates.length > 0) {
                expanders.push({
                    skillId: skill.id,
                    skill: skill,
                    candidates: candidates,
                    seat: seat,
                });
            }
        }
        return expanders;
    }

    /**
     * 查询指定座位的杠牌资格扩展器（kanExpander）。
     * 在 get_gang_mianzi() 判定时调用，返回可视为杠牌的候选牌列表。
     */
    getKanExpanders(seat, context = {}) {
        if (!this._enabled) return [];
        let charId = this._activeCharacters[seat];
        if (!charId) return [];
        let skills = this._registry.getCharacterSkills(charId);
        let expanders = [];
        for (let skill of skills) {
            if (skill.sealed.currently) continue;
            if (!skill.kanExpander) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            let candidates = skill.kanExpander(Object.assign({}, context, { seat }));
            if (candidates && candidates.length > 0) {
                expanders.push({
                    skillId: skill.id,
                    skill: skill,
                    candidates: candidates,
                    seat: seat,
                });
            }
        }
        return expanders;
    }

    /**
     * 查询指定座位的吃牌资格扩展器（chiExpander）。
     * 在 get_chi_mianzi() 判定时调用，返回可视为吃牌的候选牌列表。
     */
    getChiExpanders(seat, context = {}) {
        if (!this._enabled) return [];
        let charId = this._activeCharacters[seat];
        if (!charId) return [];
        let skills = this._registry.getCharacterSkills(charId);
        let expanders = [];
        for (let skill of skills) {
            if (skill.sealed.currently) continue;
            if (!skill.chiExpander) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            let candidates = skill.chiExpander(Object.assign({}, context, { seat }));
            if (candidates && candidates.length > 0) {
                expanders.push({
                    skillId: skill.id,
                    skill: skill,
                    candidates: candidates,
                    seat: seat,
                });
            }
        }
        return expanders;
    }

    /**
     * 查询指定座位的起和扩展器（yakuExpander）。
     * 返回所有可以为和牌家提供虚拟起和役的技能数据。
     * 仅查询和牌家自己的技能。
     *
     * @param {number} seat - 游戏席位 (0=东/1=南/2=西/3=北)
     * @param {Object} context - 上下文（含 shoupai 等）
     * @returns {Array<{ skillId, yakus: Array<{ name, fanshu }> }>}
     */
    getYakuExpanders(seat, context = {}) {
        if (!this._enabled) return [];
        let charId = this._activeCharacters[seat];
        if (!charId) return [];
        let skills = this._registry.getCharacterSkills(charId);
        let expanders = [];
        for (let skill of skills) {
            if (skill.sealed.currently) continue;
            if (!skill.yakuExpander) continue;
            if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
            let yakus = skill.yakuExpander(Object.assign({}, context, { seat }));
            if (yakus && yakus.length > 0) {
                expanders.push({
                    skillId: skill.id,
                    skill: skill,
                    yakus: yakus,
                    seat: seat,
                });
            }
        }
        return expanders;
    }

    /**
     * 查询所有玩家对 targetSeat 施加的和牌限制（huleRestrictor）。
     * 遍历所有其他座位的技能，评估其 huleRestrictor。
     *
     * @param {number} targetSeat - 被检查的潜在和牌家席位
     * @param {Object} context - 上下文（含 game, shoupai 等）
     * @returns {Array<{ seat: number, skillId, restriction: Object }>}
     *   restriction 结构：{ minFan?: number, forbidRon?: boolean, forbidTsumo?: boolean }
     */
    getHuleRestrictors(targetSeat, context = {}) {
        if (!this._enabled) return [];
        let restrictors = [];
        for (let s = 0; s < this._playerCount; s++) {
            if (s === targetSeat) continue;  // 不检查自己的限制
            let charId = this._activeCharacters[s];
            if (!charId) continue;
            let skills = this._registry.getCharacterSkills(charId);
            for (let skill of skills) {
                if (skill.sealed.currently) continue;
                if (!skill.huleRestrictor) continue;
                if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) continue;
                // 注入 mySeat 让技能知道限制施加者是谁
                let restriction = skill.huleRestrictor(
                    Object.assign({}, context, { mySeat: s, seat: targetSeat })
                );
                if (restriction) {
                    restrictors.push({
                        seat: s,
                        skillId: skill.id,
                        restriction: restriction,
                    });
                }
            }
        }
        return restrictors;
    }

    /* ================================================================
     * 技能触发（核心）
     * ================================================================ */

    /**
     * 在指定时机触发所有相关技能
     *
     * @param {string} timing - 触发时机
     * @param {Object} context - 上下文
     * @param {number} context.player - 当前回合玩家索引
     * @param {Object} context.data - 额外数据（如牌型、分数等）
     * @returns {Object} 触发结果
     *   {
     *     actions: SkillAction[],    // 需要玩家选择的动作（主动技能）
     *     effects: EffectResult[],   // 已自动执行的效果（被动技能）
     *     modified: boolean,         // 是否修改了游戏流程
     *     modifiedData: Object,      // 修改后的数据
     *   }
     */
    trigger(timing, context = {}) {
        if (!this._enabled) {
            return { actions: [], effects: [], modified: false };
        }

        let player = context.player !== undefined ? context.player : 0;

        /* 查询匹配的技能（player 是模型席位，传给 querySkills 用于座次排序） */
        let stp = context.tableCtx
            ? [0, 1, 2, 3].map(s => context.tableCtx.playerIndex(s))
            : [];
        let matches = this._registry.querySkills(
            player, timing, this._activeCharacters, stp
        );

        let actions = [];
        let effects = [];
        let modified = false;

        for (let match of matches) {
            let skill = match.skill;
            let part = match.part;

            /* 仅被动模式下跳过主动技能 */
            let effectiveType = part && part.type ? part.type : skill.type;
            if (this._passiveOnly && effectiveType !== SkillType.PASSIVE) {
                continue;
            }

            /* 检查条件：子技能优先使用 part.condition，否则用主技能 */
            let conditionFn = part && part.condition
                ? part.condition : skill.trigger.condition;
            if (conditionFn) {
                let condCtx = Object.assign(
                    {}, context, { seat: match.seat }
                );
                if (!conditionFn(condCtx)) {
                    continue;
                }
            }

            /* shouldAutoExecute：可选技能在满足条件时可自动执行（不询问玩家）
             * 技能定义中提供 shouldAutoExecute(context) → true 时，视为 PASSIVE */
            let autoExec = false;
            if (skill.isOptional && typeof skill.shouldAutoExecute === 'function') {
                let autoCtx = Object.assign(
                    {}, context, { seat: match.seat }
                );
                if (skill.shouldAutoExecute(autoCtx)) {
                    autoExec = true;
                }
            }

            /* 被动/条件触发/自动执行：
             * 当 match.part 存在时，子技能有自己的 effect 逻辑，不检查主技能的 expander；
             * 当 match.part 不存在时，跳过带 expander 的主技能（由 Game 异步执行 expander） */
            let hasExpander = !part && (
                skill.huleExpander || skill.tenpaiExpander ||
                skill.ponExpander || skill.kanExpander ||
                skill.chiExpander || skill.yakuExpander ||
                skill.huleRestrictor
            );
            if ((autoExec || effectiveType === SkillType.PASSIVE ||
                (effectiveType === SkillType.CONDITIONAL && !skill.isOptional)) &&
                !hasExpander) {
                let result = this._executeAutoSkill(skill, match.seat, context, part);
                effects.push(result);
                if (result.modified) modified = true;
            }

            /* 主动/可选条件触发：需要玩家确认（shouldAutoExecute 时跳过） */
            if (skill.isOptional && !autoExec) {
                actions.push({
                    seat: match.seat,          // 游戏席位 (0=东/1=南/2=西/3=北)
                    skill: skill,
                    type: 'prompt',
                    message: skill.description,
                    timing: timing,
                });
            }
        }

        return { actions, effects, modified };
    }

    /**
     * 记录本回合某个技能被触发及所选数据
     * @param {number} seat - 模型席位
     * @param {string} characterId - 角色ID
     * @param {number} skillIndex - 技能编号（从 1 开始）
     * @param {*} data - 技能执行时的关键数据（如选择的数量）
     */
    recordTrigger(seat, characterId, skillIndex, data) {
        if (!this._turnTriggerLog[seat]) {
            this._turnTriggerLog[seat] = {};
        }
        this._turnTriggerLog[seat][skillIndex] = {
            characterId,
            data,
            time: Date.now(),
        };
    }

    /**
     * 查询本回合某个技能是否被触发过
     * @param {number} seat - 模型席位
     * @param {string} characterId - 角色ID
     * @param {number} skillIndex - 技能编号（从 1 开始）
     * @returns {boolean}
     */
    wasTriggered(seat, characterId, skillIndex) {
        let seatLog = this._turnTriggerLog[seat];
        if (!seatLog) {
            return false;
        }
        let entry = seatLog[skillIndex];
        if (!entry) {
            return false;
        }
        return entry.characterId === characterId;
    }

    /**
     * 获取本回合某个技能触发的数据
     * @param {number} seat
     * @param {string} characterId
     * @param {number} skillIndex
     * @returns {*|null}
     */
    getTriggerData(seat, characterId, skillIndex) {
        let seatLog = this._turnTriggerLog[seat];
        if (!seatLog) return null;
        let entry = seatLog[skillIndex];
        if (!entry) return null;
        if (entry.characterId !== characterId) return null;
        return entry.data;
    }

    /**
     * 清除本回合触发记录（每次新摸牌回合调用）
     */
    clearTurnRecords() {
        this._turnTriggerLog = {};
    }

    /**
     * 存储技能持久数据（跨回合保留，每局清零）
     * @param {number} seat - 模型席位
     * @param {string} characterId - 角色ID
     * @param {number} skillIndex - 技能编号（从 1 开始）
     * @param {*} value - 技能自定义数据
     */
    setSkillData(seat, characterId, skillIndex, value) {
        if (!this._skillData[seat]) this._skillData[seat] = {};
        if (!this._skillData[seat][characterId]) this._skillData[seat][characterId] = {};
        this._skillData[seat][characterId][skillIndex] = value;
    }

    /**
     * 读取技能持久数据
     * @param {number} seat
     * @param {string} characterId
     * @param {number} skillIndex
     * @returns {*|undefined}
     */
    getSkillData(seat, characterId, skillIndex) {
        let seatData = this._skillData[seat];
        if (!seatData) return undefined;
        let charData = seatData[characterId];
        if (!charData) return undefined;
        return charData[skillIndex];
    }

    /**
     * 清除本局技能数据（每局开始时调用）
     */
    clearHandData() {
        this._skillData = {};
        this._turnTriggerLog = {};
    }

    /**
     * 标记技能已使用（不执行效果）
     * 用于技能内部控制执行流程时，外部仅标记使用次数
     * @param {string} skillId - 技能ID
     */
    markSkillUsed(skillId) {
        let skill = this._registry.getSkill(skillId);
        if (!skill) return;
        if (skill.usage.type !== UsageType.UNLIMITED) {
            skill.usage.current++;
        }
    }

    /**
     * 标记 BEFORE_DISCARD 技能在本巡已发动（每巡限一次）
     * @param {string} skillId - 技能ID
     */
    markBDSkillUsed(skillId) {
        this._bdUsedThisTurn[skillId] = true;
    }

    /**
     * 玩家响应技能选择
     *
     * @param {number} playerIdx - 做出选择的玩家
     * @param {string} skillId - 技能ID
     * @param {string} choice - 选择（'yes' | 'no' | 其他自定义值）
     * @param {Object} context - 上下文
     * @returns {Object} 执行结果
     */
    respondToSkill(playerIdx, skillId, choice, context = {}) {
        let skill = this._registry.getSkill(skillId);
        if (!skill) throw new Error(`未找到技能: ${skillId}`);

        if (choice === 'no' || choice === 'cancel') {
            return { executed: false };
        }

        /* 标记使用 */
        if (skill.usage.type !== UsageType.UNLIMITED) {
            skill.usage.current++;
        }

        /* 执行效果 */
        /* 若 this._game 未设置，回退到 context.game（调用者可手动传入游戏引用） */
        let gameRef = this._game || context.game;
        if (skill.effect.execute) {
                let execCtx = { ...context, game: gameRef };
            let result = skill.effect.execute(execCtx, choice);
            return result;
        }
        if (gameRef && gameRef._add_action_log) gameRef._add_action_log('[DEBUG] respondToSkill: execute is NULL for ' + skillId, context.seat || 0);
        return { executed: true, skill: skill };
    }

    /**
     * 应用效果链（多技能修改同一结果时）
     * 例如：CALC_DEFEN 时，狮子和原村的技能都需要修改打点
     *
     * @param {string} effectType - 效果类型
     * @param {*} baseValue - 基础值
     * @param {Object} context - 上下文
     * @returns {*} 修改后的值
     */
    applyEffectChain(effectType, baseValue, context = {}) {
        if (!this._enabled) return baseValue;

        let value = baseValue;

        /* 查询所有在 CALC_DEFEN / BEFORE_HULE_CHECK 等时机
         * 注册了该 effectType 的主动技能 */
        for (let pi = 0; pi < this._playerCount; pi++) {
            let charId = this._activeCharacters[pi];
            if (!charId) continue;

            let char = this._registry.getCharacter(charId);
            if (!char) continue;

            for (let skill of char.skills) {
                if (skill.sealed.currently) continue;
                if (skill.effect.type !== effectType) continue;
                if (skill.effect.execute) {
                    value = skill.effect.execute(value, { player: pi, ...context });
                }
            }
        }

        return value;
    }

    /* ================================================================
     * 内部方法
     * ================================================================ */

    /**
     * 激活角色的被动技能
     */
    _activatePassiveSkills(playerIdx, characterId) {
        let skills = this._registry.getCharacterSkills(characterId);
        for (let skill of skills) {
            if (skill.type === SkillType.PASSIVE || skill.trigger.timing === TimingPoints.CONTINUOUS) {
                skill.state.activated = true;
            }
        }
    }

    /**
     * 为角色初始化角色牌区域
     */
    _setupCharacterZones(playerIdx, characterId) {
        let char = this._registry.getCharacter(characterId);
        if (!char) return;

        /* 根据角色技能描述推断需要创建的区域 */
        for (let skill of char.skills) {
            let desc = skill.description;

            if (desc.includes('[卯]') || desc.includes('[未]')) {
                /* 上重漫：字牌区/数牌区 */
                this._zoneManager.createZone(playerIdx, {
                    id: 'choushi', label: '[卯]',
                    visibility: ZoneVisibility.PUBLIC, maxSize: 13,
                    canView: true, canDiscard: false,
                });
                this._zoneManager.createZone(playerIdx, {
                    id: 'mibi', label: '[未]',
                    visibility: ZoneVisibility.PUBLIC, maxSize: 13,
                    canView: true, canDiscard: false,
                });
            }

            if (desc.includes('(工口漫)画')) {
                this._zoneManager.createZone(playerIdx, {
                    id: 'ero_manga', label: '[(工口漫)画]',
                    visibility: ZoneVisibility.FACE_DOWN, maxSize: 2,
                    canView: false, canDiscard: true,
                });
            }

            if (desc.includes('双生')) {
                this._zoneManager.createZone(playerIdx, {
                    id: 'double', label: '[双生]',
                    visibility: ZoneVisibility.FACE_DOWN, maxSize: 1,
                    canView: true, canDiscard: false,
                });
            }

            if (desc.includes('四之弹') || desc.includes('八之弹')) {
                this._zoneManager.createZone(playerIdx, {
                    id: 'bullet', label: '[弹]',
                    visibility: ZoneVisibility.PUBLIC, maxSize: 8,
                    canView: true, canDiscard: false,
                });
            }

            if (desc.includes('备牌') || desc.includes('怜')) {
                this._zoneManager.createZone(playerIdx, {
                    id: 'reserve', label: '备牌',
                    visibility: ZoneVisibility.FACE_DOWN, maxSize: 2,
                    canView: true, canDiscard: false,
                });
            }

            if (desc.includes('兔子玩偶')) {
                this._zoneManager.createZone(playerIdx, {
                    id: 'doll', label: '[兔子玩偶]',
                    visibility: ZoneVisibility.PUBLIC, maxSize: 3,
                    canView: true, canDiscard: false,
                });
            }
        }
    }

    /**
     * 执行自动技能（playerIdx 就是 _activeCharacters 索引 = 模型席位 seat）
     */
    _executeAutoSkill(skill, playerIdx, context, part) {
        let seat = playerIdx;
        let executeFn = part && part.execute ? part.execute : skill.effect.execute;
        if (executeFn) {
            context.game = this._game;
            context.seat = seat;
            let result = executeFn(context);
            /* pending 表示效果尚未最终确定（如额外巡可能被副露取消），暂不增加使用次数 */
             if (result && result.pending) {
                 /* 存储技能引用到额外巡标记中，待实际执行时确认使用次数 */
                 if (this._game && this._game._extra_turn) {
                     this._game._extra_turn.pendingSkill = skill;
                 }
                 return { ...result, skillId: skill.id, playerIdx, pending: true, skill: skill };
             }
            /* 正常增加使用次数（子技能可设 consumeUsage: false 跳过） */
            if (skill.usage.type !== UsageType.UNLIMITED
                && (!part || part.consumeUsage !== false)) {
                skill.usage.current++;
            }
            return { ...result, skillId: skill.id, playerIdx };
        }

        /* 标记使用 */
        if (skill.usage.type !== UsageType.UNLIMITED
            && (!part || part.consumeUsage !== false)) {
            skill.usage.current++;
        }

        return {
            skillId: skill.id,
            playerIdx,
            executed: true,
            description: skill.description,
            modified: false,
        };
    }

    /**
     * 确认待定技能的使用次数（由 Game 在效果实际发生时调用）
     * @param {Object} pendingSkill - 来自 execute 返回的 skill 引用
     */
    finalizePendingUsage(pendingSkill) {
        if (!pendingSkill) return;
        if (pendingSkill.usage.type !== UsageType.UNLIMITED) {
            pendingSkill.usage.current++;
        }
    }

    /* ================================================================
     * 封印与解锁
     * ================================================================ */

    /**
     * 封印技能（狮子原爽①、臼泽塞③ 等）
     *
     * @param {number} targetPlayer - 目标玩家索引
     * @param {string} skillId - 要封印的技能ID。不传则封印整个角色
     * @param {string} until - 封印解除条件描述
     */
    sealSkill(targetPlayer, skillId, until = null) {
        if (skillId) {
            let skill = this._registry.getSkill(skillId);
            if (skill) {
                skill.sealed.currently = true;
                skill.sealed.until = until;
            }
        } else {
            /* 封印整个角色 */
            let charId = this._activeCharacters[targetPlayer];
            if (charId) {
                let skills = this._registry.getCharacterSkills(charId);
                for (let skill of skills) {
                    skill.sealed.currently = true;
                    skill.sealed.until = until;
                }
            }
        }
    }

    /**
     * 解封技能
     *
     * @param {number} targetPlayer - 目标玩家索引
     * @param {string} skillId - 要解封的技能ID
     */
    unsealSkill(targetPlayer, skillId) {
        if (skillId) {
            let skill = this._registry.getSkill(skillId);
            if (skill) {
                skill.sealed.currently = false;
                skill.sealed.until = null;
            }
        }
    }

    /**
     * 解封角色的所有技能
     * @param {number} targetPlayer
     */
    unsealAll(targetPlayer) {
        let charId = this._activeCharacters[targetPlayer];
        if (charId) {
            let skills = this._registry.getCharacterSkills(charId);
            for (let skill of skills) {
                skill.sealed.currently = false;
                skill.sealed.until = null;
            }
        }
    }

    /* ================================================================
     * 半庄管理
     * ================================================================ */

    /**
     * 每巡目开始，重置巡目限技能（指定座位）
     */
    onTurnStart(seat) {
        if (seat == null || seat < 0 || seat >= this._playerCount) return;
        let charId = this._activeCharacters[seat];
        if (!charId) return;
        let skills = this._registry.getCharacterSkills(charId);
        for (let skill of skills) {
            if (skill.usage.type === UsageType.ONCE_PER_TURN) {
                skill.usage.current = 0;
            }
        }
    }

    /**
     * 一局结束，重置局限技能
     */
    onHandEnd() {
        for (let charId of this._activeCharacters) {
            if (!charId) continue;
            let skills = this._registry.getCharacterSkills(charId);
            for (let skill of skills) {
                if (skill.usage.type === UsageType.ONCE_PER_HAND) {
                    skill.usage.current = 0;
                }
            }
        }

        /* 清空角色牌区域 */
        for (let pi = 0; pi < this._playerCount; pi++) {
            this._zoneManager.clearPlayerZones(pi);
        }
    }

    /**
     * 半庄结束
     */
    onHanchanEnd() {
        /* 加入冷却 */
        this._pool.onHanchanEnd(this._usedCharacters);
        this._usedCharacters = [];

        /* 重置角色 */
        this._activeCharacters = [null, null, null, null];
        this._zoneManager.clearAll();
    }

    /* ================================================================
     * 查询接口（UI使用）
     * ================================================================ */

    /**
     * 获取某玩家当前生效的技能列表
     * @param {number} playerIdx
     * @returns {Object[]}
     */
    getActiveSkills(playerIdx) {
        let charId = this._activeCharacters[playerIdx];
        if (!charId) return [];

        let skills = this._registry.getCharacterSkills(charId);
        return skills.map(s => ({
            id: s.id,
            description: s.description,
            type: s.type,
            timing: s.trigger.timing,
            sealed: s.sealed.currently,
            remaining: s.usage.type !== UsageType.UNLIMITED
                ? s.usage.max - s.usage.current : Infinity,
            cost: s.cost,
        }));
    }

    /**
     * 获取所有玩家的角色信息（用于UI显示）
     * @returns {Object[]}
     */
    getPlayerCharacters() {
        return this._activeCharacters.map((charId, pi) => {
            if (!charId) return { player: pi, character: null };
            let char = this._registry.getCharacter(charId);
            return {
                player: pi,
                character: {
                    id: char.id,
                    name: char.name,
                    card: char.card,
                    skillCount: char.skills.length,
                },
            };
        });
    }

    /**
     * 诊断用：打印角色-座位-玩家完整映射关系
     * @param {Object} opts - { qijia, jushu, seatToPlIdx, uid, viewpoint, label }
     */
    dumpCharacterMapping(opts = {}) {
        let { qijia, jushu, seatToPlIdx, uid, viewpoint, label } = opts;
        let sep = '═'.repeat(60);

        const FENG = ['東','南','西','北'];
        const DISPLAY = ['自家(下)','下家(右)','対面(上)','上家(左)'];
        const PL_NAME = ['Human', 'AI-1', 'AI-2', 'AI-3'];

        /* ── 文字表格辅助 ── */
        let logTable = (title, rows) => {
            let maxLen = {};
            for (let r of rows) for (let k in r) {
                maxLen[k] = Math.max((maxLen[k]||0), String(r[k] != null ? r[k] : '').length, String(k).length);
            }
            if (!rows.length) { console.log(title + ' (空)'); return; }
            let header = Object.keys(rows[0]).map(k => k.padEnd(maxLen[k])).join(' | ');
            let border = Object.keys(rows[0]).map(k => '─'.repeat(maxLen[k])).join('─┼─');
            console.log(title);
            console.log(header);
            console.log(border);
            for (let r of rows) {
                let line = Object.keys(r).map(k => String(r[k] != null ? r[k] : '').padEnd(maxLen[k])).join(' | ');
                console.log(line);
            }
        };

        console.log('[CHAR-MAP] ' + (label || '角色映射诊断'));
        console.log(sep);
        console.log('基础参数: qijia=' + (qijia ?? '?') + ' jushu=' + (jushu ?? '?')
            + ' viewpoint=' + (viewpoint ?? '?'));
        console.log('seatToPlIdx: ' + (seatToPlIdx ? JSON.stringify(seatToPlIdx) : '未设置'));

        /* ── 核心表：activeCharacters ── */
        let tableCore = [];
        for (let seat = 0; seat < 4; seat++) {
            let charId = this._activeCharacters[seat];
            let charData = charId ? this._registry.getCharacter(charId) : null;
            let pi = seatToPlIdx ? seatToPlIdx[seat] : seat;
            tableCore.push({
                'seat': seat,
                '风位': FENG[seat] + '家',
                'charId': charId || '(空)',
                '角色名': charData ? charData.name : '(空)',
                'plIdx': pi,
                '玩家': uid ? (uid[pi] || '?') : PL_NAME[pi],
                '技能': charData ? charData.skills.length : 0,
            });
        }
        logTable('【 _activeCharacters 】直读（按 seat 索引）:', tableCore);

        /* ── getAllCharacters ── */
        logTable('【 getAllCharacters() 】:', this.getAllCharacters().map((c, i) => ({
            'seat': i, '风位': FENG[i], 'id': c.id, 'name': c.name,
        })));

        /* ── getCharacterId / getCharacter / getCharacterSkills ── */
        let tableMethods = [];
        for (let seat = 0; seat < 4; seat++) {
            tableMethods.push({
                'seat': seat,
                'getCharacterId': this.getCharacterId(seat) || '(空)',
                'getCharacter': this.getCharacter(seat)?.name || '(空)',
                'skills': this.getCharacterSkills(seat)?.length || 0,
                'active': this.getActiveSkills(seat)?.length || 0,
            });
        }
        logTable('【 各方法查询 】:', tableMethods);

        /* ── 实际 UI 显示映射 ──
         * 头像用 humanSeat 旋转，手牌/牌河用 plIdx 旋转（plIdx=0 永远在自家）。
         * 两者在人类 plIdx=0 的前提下结果一致。 */
        {
            let humanSeat = seatToPlIdx ? seatToPlIdx.indexOf(0) : 0;
            let tableView = [];
            for (let disp = 0; disp < 4; disp++) {
                let seat = (disp + humanSeat) % 4;
                let charData = this.getCharacter(seat);
                let pi = seatToPlIdx ? seatToPlIdx[seat] : seat;
                tableView.push({
                    '显示': DISPLAY[disp],
                    'seat': seat,
                    '风位': FENG[seat],
                    '角色': charData ? charData.name : '(空)',
                    'plIdx': pi,
                    '玩家': uid ? (uid[pi] || '?') : PL_NAME[pi],
                });
            }
            logTable('【 humanSeat=' + humanSeat + ' UI 实际显示 】:', tableView);
        }

        /* ── getPlayerCharacters ── */
        logTable('【 getPlayerCharacters() 】:', this.getPlayerCharacters().map(p => ({
            'player': p.player,
            'character': p.character ? p.character.name : '(空)',
            'id': p.character?.id || '',
        })));

        console.log(sep);
    }

    /**
     * 获取角色牌区域公开信息（用于UI渲染）
     */
    getZonePublicInfo() {
        return this._zoneManager.getPublicInfo();
    }

    /**
     * 获取指定玩家的角色牌区域详情
     * @param {number} playerIdx
     */
    getZonePrivateInfo(playerIdx) {
        return this._zoneManager.getPrivateInfo(playerIdx);
    }

    /**
     * 获取区域管理器（供技能效果直接操作）
     */
    getZoneManager() {
        return this._zoneManager;
    }

    /**
     * 获取角色池
     */
    getPool() {
        return this._pool;
    }

    /**
     * 获取注册表
     */
    getRegistry() {
        return this._registry;
    }

    /**
     * 设置游戏引用
     * @param {Object} game
     */
    setGame(game) {
        this._game = game;
        /* 注入 tileOps._game（index bundle 独立副本），解决跨 bundle _game 分裂 */
        tileOps.setGame(game);
    }

    /**
     * 获取规则配置
     */
    getRule() {
        return this._rule;
    }
}

module.exports = {
    SkillManager,
    TimingPoints,
    SkillType,
    UsageType,
    EffectType,
    AssignmentMode,
    ZoneVisibility,
    ZoneManager,
    CharacterPool,
    SkillRegistry,
    mergeRule,
};
