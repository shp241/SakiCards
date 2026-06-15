/**
 * 牌桌上下文 (TableContext)
 *
 * 统一封装所有座次 ↔ 玩家/角色/技能的查询，消除散落在 game.js、skill/index.js、
 * skill-registry.js 中的 getter/转换 ad-hoc 代码。
 *
 * 坐标体系：
 *   seat   (0-3) — 模型席位（随庄家轮转），用于 shoupai[seat]、lunban
 *   plIdx  (0-3) — 玩家在 _players[] 中的位置，运行期间不变
 *
 * 使用方式：
 *   // game.js 构造函数中：
 *   this._ctx = new TableContext(this);
 *
 *   // 任意地方使用：
 *   ctx.seatOf(plIdx)          // 玩家 ID → 座次
 *   ctx.characterId(seat)      // 座次 → 角色 ID
 *   ctx.skillsOf(seat)         // 座次 → 技能数组
 *   ctx.isCurrent(seat)        // 是否为当前巡目玩家
 */
'use strict';

class TableContext {

    /**
     * @param {Object} game — Game 实例引用
     */
    constructor(game) {
        this._game = game;
    }

    /* ================================================================
     * 内部快捷引用
     * ================================================================ */

    /** @returns {Object} Game._model */
    _model() {
        return this._game._model;
    }

    /** @returns {Object} SkillManager */
    _skillMgr() {
        return this._game._skillManager;
    }

    /** @returns {Object} SkillRegistry */
    _registry() {
        let mgr = this._skillMgr();
        return mgr && mgr._registry;
    }

    /** @returns {string[]} 四个座位的角色ID映射 (seat→characterId) */
    _chars() {
        let mgr = this._skillMgr();
        return mgr && mgr._activeCharacters || [null, null, null, null];
    }

    /* ================================================================
     * 座次 ↔ 玩家
     * ================================================================ */

    /**
     * 座次 → 玩家索引。
     * @param {number} seat
     * @returns {number} plIdx
     */
    playerIndex(seat) {
        return this._model().seatToPlIdx[seat];
    }

    /**
     * 玩家索引 → 座次。
     * @param {number} plIdx
     * @returns {number} seat
     */
    seatOf(plIdx) {
        return this._model().seatToPlIdx.indexOf(plIdx);
    }

    /**
     * 座次 → 玩家名称。
     * @param {number} seat
     * @returns {string}
     */
    playerName(seat) {
        return this._model().player[this.playerIndex(seat)];
    }

    /**
     * 座次是否为 AI。
     * @param {number} seat
     * @returns {boolean}
     */
    isAI(seat) {
        let plIdx = this.playerIndex(seat);
        let player = this._game._players[plIdx];
        return player && player._isAI === true;
    }

    /**
     * 是否为人类玩家（非 AI）。
     * @param {number} seat
     * @returns {boolean}
     */
    isHuman(seat) {
        return !this.isAI(seat);
    }

    /* ================================================================
     * 座次 ↔ 角色
     * ================================================================ */

    /**
     * 座次 → 角色ID。
     * @param {number} seat
     * @returns {string|null}
     */
    characterId(seat) {
        return this._chars()[seat] || null;
    }

    /**
     * 座次 → 角色名。
     * @param {number} seat
     * @returns {string}
     */
    characterName(seat) {
        let charId = this.characterId(seat);
        if (!charId) return '';
        let reg = this._registry();
        if (!reg) return '';
        let char = reg._characters && reg._characters[charId];
        return char ? char.characterName : '';
    }

    /**
     * 座次是否分配了角色。
     * @param {number} seat
     * @returns {boolean}
     */
    hasCharacter(seat) {
        return this.characterId(seat) !== null;
    }

    /* ================================================================
     * 座次 ↔ 技能
     * ================================================================ */

    /**
     * 座次 → 技能数组。
     * @param {number} seat
     * @returns {Object[]} Skill 对象数组，未分配角色或角色无技能实现返回 []
     */
    skillsOf(seat) {
        let charId = this.characterId(seat);
        if (!charId) return [];
        let reg = this._registry();
        if (!reg) return [];
        let char = reg._characters && reg._characters[charId];
        return char && char.skills || [];
    }

    /**
     * 座次是否拥有某个技能。
     * @param {number} seat
     * @param {string} skillId — 如 'Test_Character_skill_0'
     * @returns {boolean}
     */
    hasSkill(seat, skillId) {
        return this.skillsOf(seat).some(s => s.id === skillId);
    }

    /**
     * 座次是否拥有该角色的任意技能（即是否分配了角色且有可用技能）。
     * @param {number} seat
     * @param {string} characterId — 可选，指定角色；不传则检查当前角色
     * @returns {boolean}
     */
    hasAnySkill(seat, characterId) {
        if (characterId) {
            let currentId = this.characterId(seat);
            if (currentId !== characterId) return false;
        }
        return this.skillsOf(seat).length > 0;
    }

    /**
     * 获取座次的指定技能对象。
     * @param {number} seat
     * @param {string} skillId
     * @returns {Object|null}
     */
    getSkill(seat, skillId) {
        return this.skillsOf(seat).find(s => s.id === skillId) || null;
    }

    /* ================================================================
     * 当前巡目
     * ================================================================ */

    /**
     * 当前巡目玩家座次。
     * @returns {number} seat
     */
    currentSeat() {
        return this._model().lunban;
    }

    /**
     * 是否为本巡玩家。
     * @param {number} seat
     * @returns {boolean}
     */
    isCurrent(seat) {
        return seat === this.currentSeat();
    }

    /**
     * 庄家座次。
     * @returns {number} seat
     */
    dealerSeat() {
        return this._model().qijia;
    }

    /**
     * 是否为庄家。
     * @param {number} seat
     * @returns {boolean}
     */
    isDealer(seat) {
        return seat === this.dealerSeat();
    }

    /* ================================================================
     * 当前巡目玩家便捷方法（组合上述查询）
     * ================================================================ */

    /** @returns {number} 当前巡目玩家索引 */
    currentPlayerIndex() {
        return this.playerIndex(this.currentSeat());
    }

    /** @returns {string} 当前巡目玩家名 */
    currentPlayerName() {
        return this.playerName(this.currentSeat());
    }

    /** @returns {string|null} 当前巡目玩家角色ID */
    currentCharacterId() {
        return this.characterId(this.currentSeat());
    }

    /** @returns {string} 当前巡目玩家角色名 */
    currentCharacterName() {
        return this.characterName(this.currentSeat());
    }

    /** @returns {boolean} 当前巡目玩家是否为 AI */
    currentIsAI() {
        return this.isAI(this.currentSeat());
    }

    /** @returns {Object[]} 当前巡目玩家的技能数组 */
    currentSkills() {
        return this.skillsOf(this.currentSeat());
    }

    /** @returns {boolean} 当前巡目玩家是否拥有指定技能 */
    currentHasSkill(skillId) {
        return this.hasSkill(this.currentSeat(), skillId);
    }

    /** @returns {boolean} 当前巡目玩家是否有角色 */
    currentHasCharacter() {
        return this.hasCharacter(this.currentSeat());
    }

    /* ================================================================
     * 座次数组遍历
     * ================================================================ */

    /**
     * 从指定座次开始顺时针遍历四个座次。
     * @param {number} start — 起始座次
     * @returns {number[]} 如 start=1 → [1, 2, 3, 0]
     */
    seatsFrom(start) {
        let seats = [];
        for (let i = 0; i < 4; i++) {
            seats.push((start + i) % 4);
        }
        return seats;
    }

    /**
     * 从当前巡目玩家开始顺时针遍历。
     * @returns {number[]}
     */
    seatsFromCurrent() {
        return this.seatsFrom(this.currentSeat());
    }

    /**
     * 遍历每个座位。
     * @param {Function} fn — fn(seat)
     */
    eachSeat(fn) {
        for (let s = 0; s < 4; s++) fn(s);
    }

    /**
     * 获取拥有角色的所有座次。
     * @returns {number[]}
     */
    seatedPlayers() {
        let seats = [];
        this.eachSeat(s => {
            if (this.hasCharacter(s)) seats.push(s);
        });
        return seats;
    }

    /* ================================================================
     * 牌访问（便捷封装）
     * ================================================================ */

    /**
     * 座次 → 手牌。
     * @param {number} seat
     * @returns {Object} Majiang.Shoupai
     */
    hand(seat) {
        return this._model().shoupai[seat];
    }

    /**
     * 座次 → 牌河。
     * @param {number} seat
     * @returns {Object} Majiang.He
     */
    river(seat) {
        return this._model().he[seat];
    }

    /**
     * 牌山。
     * @returns {Object} Majiang.Shan
     */
    wall() {
        return this._model().shan;
    }
}

module.exports = TableContext;
