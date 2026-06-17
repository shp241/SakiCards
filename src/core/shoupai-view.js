/*
 *  Majiang.ShoupaiView — 手牌 & 副露统一视图
 *
 *  将 Shoupai 的 _bingpai / _fulou / _zimo / _lizhi 整合为：
 *    - handTiles:  HandTiles 实例（对象化手牌）
 *    - melds:      MeldMeta[]（对象化副露）
 *
 *  技能系统（skill-registry）通过本层操作，不直接访问 Shoupai 内部字段。
 */
"use strict";

const { HandTiles } = require('./hand-tile.js');
const meldParser = require('./meld-parser.js');

const SUITS_NUMBER = ['m', 'p', 's'];

class ShoupaiView {

    /**
     * 从 Shoupai 实例构建 ShoupaiView
     * @param {object} shoupai — Majiang.Shoupai
     * @returns {ShoupaiView}
     */
    static fromShoupai(shoupai) {
        let handTiles = HandTiles.fromShoupai(shoupai);

        let melds = [];
        for (let i = 0; i < shoupai._fulou.length; i++) {
            let meta = meldParser.parseMianzi(shoupai._fulou[i]);
            if (meta) melds.push(meta);
        }

        return new ShoupaiView(handTiles, melds);
    }

    /**
     * @param {HandTiles} handTiles
     * @param {MeldMeta[]} melds
     */
    constructor(handTiles, melds = []) {
        this.handTiles = handTiles;
        this.melds = melds;
    }

    // ── 状态查询 ──

    /** 门前清（暗杠不算破门） */
    isMenzen() {
        for (let m of this.melds) {
            if (m.type !== 'ankan') return false;
        }
        return true;
    }

    /** 是否立直 */
    isRiichi() {
        return this.handTiles.isLizhi();
    }

    /** 是否有字牌（手牌 + 副露） */
    hasZipai() {
        if (this.handTiles.hasZipai()) return true;
        for (let m of this.melds) {
            for (let t of m.tiles) {
                if (t[0] === 'z') return true;
            }
        }
        return false;
    }

    // ── 牌面展开 ──

    /** 手牌 + 副露 所有牌面字符串 */
    getAllTiles() {
        let all = this.handTiles.getAll().map(t => t.toString());
        for (let m of this.melds) {
            for (let t of m.tiles) all.push(t);
        }
        return all;
    }

    /** 所有可见牌面（排除暗牌 _ ） */
    getAllVisibleTiles() {
        return this.getAllTiles().filter(t => t !== '_');
    }

    // ── 花色/种类统计（含副露） ──

    /** 数牌花色种类数（m/p/s） */
    countSuits() {
        let has = {};
        for (let s of SUITS_NUMBER) has[s] = false;

        for (let t of this.handTiles.getAll()) {
            if (SUITS_NUMBER.includes(t.suit)) has[t.suit] = true;
        }
        for (let m of this.melds) {
            for (let t of m.tiles) {
                let s = t[0];
                if (SUITS_NUMBER.includes(s)) has[s] = true;
            }
        }

        let count = 0;
        for (let s of SUITS_NUMBER) {
            if (has[s]) count++;
        }
        return count;
    }

    /** 牌种类数：m/p/s → 各1种，风牌 → 1种，三元牌 → 1种 */
    countCategories() {
        let hasM = false, hasP = false, hasS = false;
        let hasWind = false, hasDragon = false;

        for (let t of this.handTiles.getAll()) {
            if (t.suit === 'm') hasM = true;
            else if (t.suit === 'p') hasP = true;
            else if (t.suit === 's') hasS = true;
            else if (t.suit === 'z') {
                if (t.num >= 1 && t.num <= 4) hasWind = true;
                else if (t.num >= 5 && t.num <= 7) hasDragon = true;
            }
        }
        for (let m of this.melds) {
            for (let tStr of m.tiles) {
                let s = tStr[0], n = +tStr[1];
                if (n === 0) n = 5;  // 红5 → 5
                if (s === 'm') hasM = true;
                else if (s === 'p') hasP = true;
                else if (s === 's') hasS = true;
                else if (s === 'z') {
                    if (n >= 1 && n <= 4) hasWind = true;
                    else if (n >= 5 && n <= 7) hasDragon = true;
                }
            }
        }

        let count = 0;
        if (hasM) count++;
        if (hasP) count++;
        if (hasS) count++;
        if (hasWind) count++;
        if (hasDragon) count++;
        return count;
    }

    /** 副露中的花色种类数 */
    countMeldSuits() {
        let has = {};
        for (let m of this.melds) {
            for (let t of m.tiles) {
                let s = t[0];
                if (SUITS_NUMBER.includes(s)) has[s] = true;
            }
        }
        let count = 0;
        for (let s of SUITS_NUMBER) {
            if (has[s]) count++;
        }
        return count;
    }

    // ── 同步 ──

    /**
     * 将 ShoupaiView 状态写回 Shoupai
     * @param {object} shoupai
     */
    syncTo(shoupai) {
        this.handTiles.syncTo(shoupai);

        shoupai._fulou = [];
        shoupai._fulouMeta = [];
        for (let meta of this.melds) {
            let mianzi = meldParser.toMianziString(meta);
            shoupai._fulou.push(mianzi);
            shoupai._fulouMeta.push({
                type:  meta.type,
                tiles: meta.tiles.slice(),
                fromSeat: meta.fromSeat,
                calledTileIndex: meta.calledTileIndex,
            });
        }
    }
}

module.exports = ShoupaiView;
