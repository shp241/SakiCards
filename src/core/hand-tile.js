/*
 *  Majiang.HandTile / Majiang.HandTiles — 手牌牌张对象化表示
 *
 *  将 Shoupai._bingpai 计数数组展开为 HandTile 对象列表，
 *  每张牌可以独立携带状态（红宝牌、自摸牌、标记等），
 *  供技能系统（skill-registry）通过高层 API 操作。
 *
 *  HandTile {
 *      suit:     "m"|"p"|"s"|"z"
 *      num:      0-9 (红5的 num=5, isRed=true)
 *      isRed:    boolean
 *      isZimo:   boolean  — 是否为当前巡摸入牌
 *      isMarked: boolean  — 是否被技能标记为全局可见
 *      isHidden: boolean  — 是否为暗牌（未知牌 _）
 *      id:       number   — 唯一标识（技能精确操作）
 *  }
 */
"use strict";

const SUITS = ['m', 'p', 's', 'z'];
const SUITS_NUMBER = ['m', 'p', 's'];

let _nextId = 1;

class HandTile {

    constructor(suit, num, opts = {}) {
        this.suit    = suit;
        this.num     = num;
        this.isRed   = !!opts.isRed;
        this.isZimo  = !!opts.isZimo;
        this.isMarked = !!opts.isMarked;
        this.isHidden = !!opts.isHidden;
        this.id      = _nextId++;
    }

    /** "m1" / "m0"（红5） */
    toString() {
        if (this.isHidden) return '_';
        if (this.suit === 'z') return 'z' + this.num;
        return this.suit + (this.isRed ? 0 : this.num);
    }

    /** 点数等价（含红5=普通5） */
    number() {
        return this.num;
    }

    /** 等价判断（红5=普通5 视为相同点数） */
    equals(other) {
        if (!other) return false;
        return this.suit === other.suit && this.num === other.num;
    }

    /** 严格相等（红5≠普通5） */
    strictEquals(other) {
        if (!other) return false;
        return this.suit === other.suit
            && this.num === other.num
            && this.isRed === other.isRed;
    }
}


class HandTiles {

    /**
     * 从 Shoupai 构建 HandTiles
     * @param {object} shoupai — Majiang.Shoupai 实例
     * @returns {HandTiles}
     */
    static fromShoupai(shoupai) {
        let ht = new HandTiles();
        ht._lizhi = shoupai._lizhi;
        ht._markedTiles = new Set(shoupai._markedTiles || []);

        let zimoStr = shoupai._zimo;
        let isFulouTurn = zimoStr && zimoStr.length > 2;

        for (let s of SUITS) {
            let bp = shoupai._bingpai[s];
            if (!bp) continue;
            let maxN = s === 'z' ? 7 : 9;

            for (let n = 1; n <= maxN; n++) {
                let count = bp[n] || 0;
                // 红5（bp[0]）在 bp[5] 中重复计数，此处先减去
                if (n === 5 && s !== 'z') count -= (bp[0] || 0);
                for (let i = 0; i < count; i++) {
                    let isZimo = !isFulouTurn && zimoStr === s + n;
                    ht._list.push(new HandTile(s, n, {
                        isZimo,
                        isMarked: shoupai._markedTiles && shoupai._markedTiles.has(s + n)
                    }));
                }
            }

            // 红5（s !== 'z'）
            if (s !== 'z' && bp[0]) {
                for (let i = 0; i < bp[0]; i++) {
                    let isZimo = !isFulouTurn && zimoStr === s + '0';
                    ht._list.push(new HandTile(s, 5, {
                        isRed: true,
                        isZimo,
                        isMarked: shoupai._markedTiles && shoupai._markedTiles.has(s + '0')
                    }));
                }
            }
        }

        // 暗牌
        for (let i = 0; i < (shoupai._bingpai._ || 0); i++) {
            let isHiddenZimo = zimoStr === '_';
            ht._list.push(new HandTile('_', 0, { isHidden: true, isZimo: isHiddenZimo }));
        }

        // 副露巡目时不设 zimo tile（详见 Shoupai._zimo 的三种状态）
        ht._isFulouTurn = isFulouTurn;

        return ht;
    }

    constructor() {
        this._list = [];
        this._lizhi = false;
        this._markedTiles = new Set();
        this._isFulouTurn = false;
    }

    // ── 基本属性 ──

    /** 所有手牌对象列表（未排序，按构建顺序） */
    get list() {
        return this._list.slice();
    }

    /** 当前自摸牌对象，无则为 null */
    get zimoTile() {
        for (let t of this._list) {
            if (t.isZimo) return t;
        }
        return null;
    }

    /** 手牌总张数（含自摸牌） */
    get count() {
        return this._list.length;
    }

    /** 手牌张数（不含自摸牌） */
    get countNoZimo() {
        let c = 0;
        for (let t of this._list) {
            if (!t.isZimo) c++;
        }
        return c;
    }

    // ── 查询 ──

    /** 所有牌张（含自摸）展开为 HandTile[] */
    getAll() {
        return this._list.slice();
    }

    /** 按花色筛选 */
    getBySuit(suit) {
        return this._list.filter(t => t.suit === suit);
    }

    /** 按点数额外筛选（红5入5，合并计数） */
    getByNum(suit, num) {
        return this._list.filter(t => t.suit === suit && t.num === num);
    }

    /** 某花色某点数的张数（红5 + 普通5 合并） */
    countOf(suit, num) {
        num = num === 0 ? 5 : num;  // 红5 也按 5 查
        return this._list.filter(t => t.suit === suit && t.num === num).length;
    }

    /** 红5 张数 */
    countRed(suit) {
        return this._list.filter(t => t.suit === suit && t.isRed).length;
    }

    /** 是否有某花色的牌 */
    hasSuit(suit) {
        return this._list.some(t => t.suit === suit);
    }

    /** 是否有字牌 */
    hasZipai() {
        return this._list.some(t => t.suit === 'z');
    }

    /**
     * 是否有相邻牌（±2 范围内）
     * 仅对数牌有意义，字牌返回 false
     */
    hasNeighbor(suit, num) {
        if (suit === 'z') return false;
        num = num === 0 ? 5 : +num;
        let min = Math.max(1, num - 2);
        let max = Math.min(9, num + 2);
        for (let t of this._list) {
            if (t.suit === suit && t.num >= min && t.num <= max && !(t.num === num && t.num === num)) {
                return true;
            }
        }
        return false;
    }

    // ── 牌姿判断 ──

    isLizhi() {
        return this._lizhi;
    }

    isInFulouTurn() {
        return this._isFulouTurn;
    }

    // ── 统计 ──

    /** 数牌花色种类数（m/p/s 中哪些花色有牌） */
    countSuits() {
        let count = 0;
        for (let s of SUITS_NUMBER) {
            if (this.hasSuit(s)) count++;
        }
        return count;
    }

    /** 牌种类数：m/p/s → 各算一种，风牌 → 一种，三元牌 → 一种 */
    countCategories() {
        let hasM = false, hasP = false, hasS = false;
        let hasWind = false, hasDragon = false;

        for (let t of this._list) {
            if (t.suit === 'm') hasM = true;
            else if (t.suit === 'p') hasP = true;
            else if (t.suit === 's') hasS = true;
            else if (t.suit === 'z') {
                if (t.num >= 1 && t.num <= 4) hasWind = true;
                else if (t.num >= 5 && t.num <= 7) hasDragon = true;
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

    /** 是否全是中张数牌（3-7，无字牌，无1/2/8/9） */
    isAllChunchan() {
        let hasTiles = false;
        for (let t of this._list) {
            if (t.suit === 'z') return false;
            if (t.suit === '_') continue;
            if (t.num < 3 || t.num > 7) return false;
            hasTiles = true;
        }
        return hasTiles;
    }

    // ── 顺子/刻子分析 ──

    /** 对子数（同牌两张为一对） */
    countPairs() {
        let counts = {};
        for (let t of this._list) {
            if (t.suit === '_' || t.suit === 'z' && t.num === 0) continue;
            let key = t.suit + t.num;
            counts[key] = (counts[key] || 0) + 1;
        }
        let pairs = 0;
        for (let k in counts) {
            pairs += (counts[k] >> 1);
        }
        return pairs;
    }

    /** 刻子数（同牌三张为一刻） */
    countTriplets() {
        let counts = {};
        for (let t of this._list) {
            if (t.suit === '_' || t.suit === 'z' && t.num === 0) continue;
            let key = t.suit + t.num;
            counts[key] = (counts[key] || 0) + 1;
        }
        let triplets = 0;
        for (let k in counts) {
            triplets += Math.floor(counts[k] / 3);
        }
        return triplets;
    }

    /**
     * 宽松一杯口/两杯口判定
     * 仅需顺子点数相同（不需同花色），允许副露中的顺子
     * @returns {number} 0/1/2
     */
    countRelaxedIipeikou() {
        let shunziByNum = {};
        for (let n = 1; n <= 7; n++) shunziByNum[n] = 0;

        for (let s of SUITS_NUMBER) {
            let c = {};
            for (let n = 1; n <= 9; n++) c[n] = 0;
            for (let t of this._list) {
                if (t.suit === s) c[t.num] = (c[t.num] || 0) + 1;
            }
            // 贪心提取顺子
            for (let n = 1; n <= 7; n++) {
                let count = Math.min(c[n] || 0, c[n + 1] || 0, c[n + 2] || 0);
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

    // ── 自摸牌操作 ──

    /**
     * 清除所有牌的自摸标记
     */
    clearZimo() {
        for (let t of this._list) {
            t.isZimo = false;
        }
    }

    /**
     * 设置自摸牌（将匹配 tileStr 的牌标记为 isZimo）
     * @param {string} tileStr — 牌面字符串如 "m1" / "p0" / "z7"
     * @returns {boolean} — 是否成功匹配并设置
     */
    setZimo(tileStr) {
        if (!tileStr || tileStr.length < 2) return false;
        for (let t of this._list) {
            if (!t.isHidden && t.toString() === tileStr) {
                t.isZimo = true;
                return true;
            }
        }
        return false;
    }

    // ── 同步 ──

    /**
     * 将 HandTiles 状态写回 Shoupai._bingpai 和 _zimo
     * @param {object} shoupai
     */
    syncTo(shoupai) {
        // 重置 _bingpai
        shoupai._bingpai = {
            _: 0,
            m: [0,0,0,0,0,0,0,0,0,0],
            p: [0,0,0,0,0,0,0,0,0,0],
            s: [0,0,0,0,0,0,0,0,0,0],
            z: [0,0,0,0,0,0,0,0],
        };

        let zimoStr = null;

        for (let t of this._list) {
            if (t.isHidden) {
                shoupai._bingpai._++;
                if (t.isZimo) zimoStr = '_';
                continue;
            }
            let bp = shoupai._bingpai[t.suit];
            bp[t.num]++;
            if (t.suit !== 'z' && t.isRed) bp[0]++;
            if (t.isZimo) zimoStr = t.toString();
        }

        shoupai._zimo = this._isFulouTurn ? (shoupai._zimo || '') : zimoStr;
        shoupai._lizhi = this._lizhi;
    }
}

module.exports = { HandTile, HandTiles };
