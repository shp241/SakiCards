/**
 * 超能力麻将 - 角色池管理
 * 负责角色分配、抽取、冷却管理
 */
'use strict';

const { AssignmentMode } = require('./skill-types');

class CharacterPool {

    /**
     * @param {Object[]} allCharacters - 全部角色数据（来自 characters_skills.js）
     * @param {Object} options - 配置
     * @param {string} options.poolLimit - '全部可用' | '仅基本角色' | '仅联动角色'
     * @param {boolean} options.cooldown - 是否启用半庄冷却
     */
    constructor(allCharacters, options = {}) {
        this._roster = allCharacters;

        /* 根据池限制过滤角色 */
        if (options.poolLimit === '仅基本角色') {
            this._roster = allCharacters.filter(
                c => c.id && !c.id.startsWith('char_') &&
                     !['Celestia_Ludenberg','Emilia','Hoshino_Ai',
                       'Ichihime','Izumi_Sagiri','Misaka_Mikoto',
                       'Seele_Vollerei','Sora_Kasugano','Takanashi_Rikka',
                       'Tokisaki_Kurumi'
                      ].includes(c.id) &&
                     /* 标准选将模式：仅筛选有技能角色，测试角色除外 */
                     c.id !== 'Test_Character' &&
                     c.skills && c.skills.length > 0
            );
        } else if (options.poolLimit === '仅联动角色') {
            this._roster = allCharacters.filter(
                c => c.id && ['Celestia_Ludenberg','Emilia','Hoshino_Ai',
                              'Ichihime','Izumi_Sagiri','Misaka_Mikoto',
                              'Seele_Vollerei','Sora_Kasugano','Takanashi_Rikka',
                              'Tokisaki_Kurumi'
                             ].includes(c.id)
            );
        }

        /** 当前可用角色 */
        this._available = [...this._roster];

        /** 半庄冷却中的角色 */
        this._cooldown = [];

        /** 是否启用冷却 */
        this._cooldownEnabled = options.cooldown !== false;
    }

    /**
     * 获取全部角色数量
     */
    get totalCount() {
        return this._roster.length;
    }

    /**
     * 获取可用角色数量
     */
    get availableCount() {
        return this._available.length;
    }

    /**
     * 为玩家分配可选角色卡
     *
     * @param {string} mode - 分配模式
     * @param {number} playerCount - 对局人数
     * @returns {Object[]} 每位玩家的可选角色列表
     *   [{ player: 0, options: [Character, ...] }, ...]
     */
    deal(mode, playerCount = 4) {
        let effectiveMode = mode;

        /* 池不足时自动降级每人可选项 */
        if (mode === AssignmentMode.DRAW_4) {
            if (this._available.length < 4 * playerCount) {
                if (this._available.length >= 2 * playerCount) {
                    console.log(`[选将] 角色池仅剩${this._available.length}名，抽4降级为抽2`);
                    effectiveMode = AssignmentMode.DRAW_2;
                }
                else {
                    console.log(`[选将] 角色池仅剩${this._available.length}名，降级为随机分配`);
                    effectiveMode = AssignmentMode.RANDOM;
                }
            }
        }
        else if (mode === AssignmentMode.DRAW_2) {
            if (this._available.length < 2 * playerCount) {
                console.log(`[选将] 角色池仅剩${this._available.length}名，降级为随机分配`);
                effectiveMode = AssignmentMode.RANDOM;
            }
        }
        /* DRAFT / FREE 展示全部池，不受数量限制；RANDOM 只需每人1个 */

        switch (effectiveMode) {
            case AssignmentMode.DRAW_4:
                return this._dealDrawN(4, playerCount);
            case AssignmentMode.DRAW_2:
                return this._dealDrawN(2, playerCount);
            case AssignmentMode.DRAFT:
                return this._dealDraft(playerCount);
            case AssignmentMode.RANDOM:
                return this._dealRandom(playerCount);
            case AssignmentMode.FREE:
                return this._dealFree(playerCount);
            default:
                return this._dealDrawN(4, playerCount);
        }
    }

    /**
     * 抽N选1
     * @param {number} n - 每位玩家抽取的角色数量
     * @param {number} playerCount - 对局人数
     */
    _dealDrawN(n, playerCount) {
        let pool = this._shuffle([...this._available]);
        let result = [];

        for (let i = 0; i < playerCount; i++) {
            let options = pool.splice(0, n);
            /* 从可用池中暂时移除 */
            options.forEach(c => {
                let idx = this._available.indexOf(c);
                if (idx >= 0) this._available.splice(idx, 1);
            });
            result.push({ player: i, options });
        }

        return result;
    }

    /**
     * 轮抽模式（蛇形选人）
     * 顺序: 0→1→2→3→3→2→1→0
     */
    _dealDraft(playerCount) {
        let pool = this._shuffle([...this._available]);
        let pickOrder = [];
        for (let i = 0; i < playerCount; i++) pickOrder.push(i);
        for (let i = playerCount - 1; i >= 0; i--) pickOrder.push(i);

        let result = [];
        for (let i = 0; i < playerCount; i++) {
            result.push({ player: i, options: [] });
        }

        /* 每位玩家从池中选 2 次 */
        for (let round = 0; round < 2; round++) {
            for (let pi of pickOrder) {
                /* 展示该玩家剩余可选的 */
                let entry = result.find(e => e.player === pi);
                /* 第一次轮抽时 options 是空数组，需要填充 */
                if (round === 0) {
                    entry.options = [...pool];
                }
            }
        }

        return result;
    }

    /**
     * 随机分配模式（每位玩家直接获得 1 名角色）
     */
    _dealRandom(playerCount) {
        let pool = this._shuffle([...this._available]);
        let result = [];

        for (let i = 0; i < playerCount; i++) {
            let picked = pool.splice(0, 1);
            picked.forEach(c => {
                let idx = this._available.indexOf(c);
                if (idx >= 0) this._available.splice(idx, 1);
            });
            result.push({
                player: i,
                options: picked,       // 直接就是选定角色
                autoConfirmed: true,   // 无需玩家确认
            });
        }

        return result;
    }

    /**
     * 自由选择模式（从庄家开始，每人轮流从全角色中选 1 名）
     * 每位玩家选择后，该角色从后续玩家的可选池中移除
     */
    _dealFree(playerCount) {
        let result = [];
        for (let i = 0; i < playerCount; i++) {
            result.push({
                player: i,
                options: [...this._available],  // 初始全部可选，后续会被过滤
                sequential: true,               // 标记为顺序选择模式
            });
        }
        return result;
    }

    /**
     * 玩家确认选择角色
     *
     * @param {number} playerIdx - 玩家数组索引 (0-3)
     * @param {number} characterIndex - 选择的角色在 options 中的索引
     * @param {Object[]} dealResult - deal() 的返回结果
     * @returns {Object} 被选中的角色对象
     */
    confirmChoice(playerIdx, characterIndex, dealResult) {
        let entry = dealResult.find(e => e.player === playerIdx);
        if (!entry) throw new Error(`Invalid player index: ${playerIdx}`);

        let chosen = entry.options[characterIndex];
        if (!chosen) throw new Error(`Invalid character index: ${characterIndex}`);

        /* 将未被选中的角色返还可用池 */
        entry.options.forEach((c, i) => {
            if (i !== characterIndex && !this._cooldown.includes(c)) {
                if (!this._available.includes(c)) {
                    this._available.push(c);
                }
            }
        });

        /* 将选中的角色记录 */
        entry.selected = chosen;

        return chosen;
    }

    /**
     * 半庄结束时调用，将本局角色加入冷却
     *
     * @param {Object[]} selectedCharacters - 本局 4 名玩家选择的角色
     */
    onHanchanEnd(selectedCharacters) {
        if (!this._cooldownEnabled) return;

        this._cooldown = selectedCharacters.filter(c => c != null);

        /* 将冷却角色从可用池移除，将之前冷却的角色恢复 */
        this._available = this._roster.filter(
            c => !this._cooldown.includes(c)
        );
    }

    /**
     * 保留角色（宫永照③ 效果）
     * 该角色不进入冷却，下局可继续使用
     *
     * @param {Object} character - 要保留的角色
     */
    keepCharacter(character) {
        if (!this._cooldownEnabled) return;
        this._cooldown = this._cooldown.filter(c => c !== character);
        if (!this._available.includes(character)) {
            this._available.push(character);
        }
    }

    /**
     * 重置冷却（用于测试或设置变更）
     */
    resetCooldown() {
        this._cooldown = [];
        this._available = [...this._roster];
    }

    /**
     * 每局重置可用池（排除冷却角色）
     * 每小局开始前调用，让玩家可以重新选择角色
     */
    resetForHand() {
        this._available = this._roster.filter(c => !this._cooldown.includes(c));
    }

    /**
     * Fisher-Yates 洗牌
     */
    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

module.exports = CharacterPool;
