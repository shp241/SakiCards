/**
 * 超能力麻将 - 角色牌区域管理
 * 管理角色牌上的特殊区域（卯/未/画/双生/弹/备牌/兔子玩偶 等）
 */
'use strict';

const { ZoneVisibility } = require('./skill-types');

/**
 * 单个区域
 */
class Zone {

    /**
     * @param {Object} config
     * @param {string} config.id - 区域ID（如 'choushi', 'mibi', 'double'）
     * @param {string} config.label - 显示标签（如 '[卯]', '[未]', '[(工口漫)画]'）
     * @param {string} config.visibility - 可见性
     * @param {number} config.maxSize - 最大容量
     * @param {Object} config.options
     * @param {boolean} config.options.canView - 自己能否查看
     * @param {boolean} config.options.canDiscard - 能否舍出
     * @param {boolean} config.options.canFulou - 能否副露
     * @param {boolean} config.options.canBePeeked - 能否被别家技能观看
     */
    constructor(config = {}) {
        this.id         = config.id || '';
        this.label      = config.label || '';
        this.visibility = config.visibility || ZoneVisibility.PRIVATE;
        this.maxSize    = config.maxSize || 14;
        this.canView    = config.canView !== undefined ? config.canView : true;
        this.canDiscard = config.canDiscard !== undefined ? config.canDiscard : false;
        this.canFulou   = config.canFulou !== undefined ? config.canFulou : false;
        this.canBePeeked= config.canBePeeked !== undefined ? config.canBePeeked : true;

        /** 存放的牌（每张牌有 { tile, state }） */
        this._tiles = [];
    }

    /** 区域中的牌数 */
    get size() {
        return this._tiles.length;
    }

    /** 是否已满 */
    get isFull() {
        return this._tiles.length >= this.maxSize;
    }

    /**
     * 添加牌到区域
     * @param {string|string[]} tiles - 牌字符串（如 '1m', '5p'）
     * @param {string} state - 'face_up' | 'face_down' | 'hidden'
     */
    add(tiles, state = 'face_up') {
        if (!Array.isArray(tiles)) tiles = [tiles];
        let added = [];
        for (let t of tiles) {
            if (this.isFull) break;
            let entry = { tile: t, state };
            this._tiles.push(entry);
            added.push(entry);
        }
        return added;
    }

    /**
     * 从区域移除牌
     * @param {string|string[]} tiles - 要移除的牌
     * @returns {Object[]} 被移除的牌
     */
    remove(tiles) {
        if (!Array.isArray(tiles)) tiles = [tiles];
        let removed = [];
        for (let t of tiles) {
            let idx = this._tiles.findIndex(e => e.tile === t);
            if (idx >= 0) {
                removed.push(this._tiles.splice(idx, 1)[0]);
            }
        }
        return removed;
    }

    /**
     * 查看区域中的牌（受 visibility 限制）
     * @param {number} viewerIndex - 查看者索引（-1 为所有者自己）
     */
    view(viewerIndex) {
        if (viewerIndex === -1) {
            /* 自己查看 */
            if (this.visibility === ZoneVisibility.HIDDEN) return [];
            return [...this._tiles];
        }

        /* 他人查看 */
        if (this.visibility === ZoneVisibility.PUBLIC) {
            return [...this._tiles];
        }
        if (this.visibility === ZoneVisibility.FACE_DOWN) {
            return this._tiles.map(e => ({ tile: '?', state: 'face_down' }));
        }
        return [];
    }

    /** 获取仅 tile 字符串的数组 */
    getTiles() {
        return this._tiles.map(e => e.tile);
    }

    /** 清空区域 */
    clear() {
        this._tiles = [];
    }

    /** 获取公开信息（用于 UI） */
    getPublicInfo() {
        return {
            id: this.id,
            label: this.label,
            size: this._tiles.length,
            maxSize: this.maxSize,
            visibility: this.visibility,
            tiles: this.visibility === ZoneVisibility.PUBLIC
                ? [...this._tiles]
                : this._tiles.map(() => ({ tile: '?', state: 'face_down' })),
        };
    }

    /** 获取私有信息（仅自己和技能系统可用） */
    getPrivateInfo() {
        return {
            id: this.id,
            label: this.label,
            size: this._tiles.length,
            maxSize: this.maxSize,
            visibility: this.visibility,
            tiles: [...this._tiles],
            canView: this.canView,
            canDiscard: this.canDiscard,
            canFulou: this.canFulou,
        };
    }
}

/**
 * 区域管理器
 * 管理 4 名玩家的所有角色牌区域
 */
class ZoneManager {

    constructor(playerCount = 4) {
        /** zones[playerIdx] = { zoneId: Zone } */
        this._zones = [];
        for (let i = 0; i < playerCount; i++) {
            this._zones[i] = {};
        }
    }

    /**
     * 为玩家创建新区域
     *
     * @param {number} playerIdx - 玩家数组索引 (0-3)
     * @param {Object} config - 区域配置（见 Zone 构造函数）
     * @returns {Zone} 创建的区域
     */
    createZone(playerIdx, config) {
        let zone = new Zone(config);
        this._zones[playerIdx][config.id] = zone;
        return zone;
    }

    /**
     * 获取玩家的某个区域
     *
     * @param {number} playerIdx
     * @param {string} zoneId
     * @returns {Zone|null}
     */
    getZone(playerIdx, zoneId) {
        if (!this._zones[playerIdx]) return null;
        return this._zones[playerIdx][zoneId] || null;
    }

    /**
     * 获取玩家的所有区域
     * @param {number} playerIdx
     * @returns {Object} { zoneId: Zone }
     */
    getPlayerZones(playerIdx) {
        return this._zones[playerIdx] || {};
    }

    /**
     * 移除玩家的某个区域
     * @param {number} playerIdx
     * @param {string} zoneId
     */
    removeZone(playerIdx, zoneId) {
        if (this._zones[playerIdx]) {
            delete this._zones[playerIdx][zoneId];
        }
    }

    /**
     * 清空玩家的所有区域（角色切换/局结束时调用）
     * @param {number} playerIdx
     */
    clearPlayerZones(playerIdx) {
        this._zones[playerIdx] = {};
    }

    /**
     * 清空所有区域
     */
    clearAll() {
        for (let i = 0; i < this._zones.length; i++) {
            this._zones[i] = {};
        }
    }

    /**
     * 获取所有玩家的公开区域信息（用于 UI 渲染）
     * @returns {Object[]} 每位玩家的公开区域
     */
    getPublicInfo() {
        return this._zones.map((zones, pi) => ({
            player: pi,
            zones: Object.values(zones).map(z => z.getPublicInfo()),
        }));
    }

    /**
     * 获取指定玩家的私有区域信息
     * @param {number} playerIdx
     */
    getPrivateInfo(playerIdx) {
        let zones = this._zones[playerIdx] || {};
        return Object.values(zones).map(z => z.getPrivateInfo());
    }
}

module.exports = {
    Zone,
    ZoneManager,
};
