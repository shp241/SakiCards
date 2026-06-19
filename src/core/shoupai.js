/*
 *  Majiang.Shoupai
 */
"use strict";

const meldParser = require('./meld-parser.js');

module.exports = class Shoupai {

    static valid_pai(p) {
        if (p.match(/^(?:[mps]\d|z[1-7])_?\*?[\+\=\-]?$/)) return p;
    }

    static valid_mianzi(m) {
        // 委托到 meld-parser：支持新旧两种格式，返回规范化新格式
        let meta = meldParser.parseMianzi(m);
        return meta ? meldParser.toMianziString(meta) : undefined;
    }

    constructor(qipai = []) {

        this._bingpai = {
            _:  0,
            m: [0,0,0,0,0,0,0,0,0,0],
            p: [0,0,0,0,0,0,0,0,0,0],
            s: [0,0,0,0,0,0,0,0,0,0],
            z: [0,0,0,0,0,0,0,0],
        };
        this._fulou     = [];
        this._fulouMeta = [];  /* 副露附加信息，与 _fulou 一一对应 */
        this._zimo      = null;
        this._lizhi     = false;
        this._markedTiles = new Map();  /* 被标记手牌牌张 → 数量（按值计数） */
        this._hiddenTiles = new Map();  /* 对自己也不可见的牌 → 数量 */
        this._lockedTiles = new Map();  /* 无法打出或副露的牌 → 数量 */

        for (let p of qipai) {
            if (p == '_') {
                this._bingpai._++;
                continue;
            }
            if (! (p = Shoupai.valid_pai(p)))       throw new Error(p);
            let s = p[0], n = +p[1];
            if (this._bingpai[s][n] == 4)           throw new Error([this, p]);
            this._bingpai[s][n]++;
            if (s != 'z' && n == 0) this._bingpai[s][5]++;
        }
    }

    static fromString(paistr = '') {

        let fulou   = paistr.split(',');
        let bingpai = fulou.shift();

        let qipai = bingpai.match(/^_*/)[0].match(/_/g) || [];
        for (let suitstr of bingpai.match(/[mpsz]\d+_*/g) || []) {
            let s = suitstr[0];
            for (let n of suitstr.match(/\d/g)) {
                if (s == 'z' && (n < 1 || 7 < n)) continue;
                qipai.push(s+n);
            }
            qipai = qipai.concat(suitstr.match(/_/g)||[]);
        }
        qipai = qipai.slice(0, 14 - fulou.filter(x=>x).length * 3);
        let zimo = qipai.length + fulou.length * 3 == 14 && qipai.slice(-1)[0];
        const shoupai = new Shoupai(qipai);

        let last;
        for (let m of fulou) {
            if (! m) { shoupai._zimo = last; break }
            let parsed = meldParser.parseMianzi(m);
            if (parsed) {
                let newMianzi = meldParser.toMianziString(parsed);
                shoupai._fulou.push(newMianzi);
                shoupai._fulouMeta.push({
                    type:  parsed.type,
                    tiles: parsed.tiles,
                    fromSeat: parsed.fromSeat,
                    calledTileIndex: parsed.calledTileIndex,
                });
                last = newMianzi;
            }
        }

        shoupai._zimo  = shoupai._zimo || zimo || null;
        shoupai._lizhi = bingpai.slice(-1) == '*';

        return shoupai;
    }

    toString() {

        let paistr = '';

        for (let s of ['m','p','s','z']) {
            let suitstr = s;
            let bingpai = this._bingpai[s];
            let n_hongpai = s == 'z' ? 0 : bingpai[0];
            for (let n = 1; n < bingpai.length; n++) {
                let n_pai = bingpai[n];
                if (this._zimo) {
                    if (s+n == this._zimo)           { n_pai--;             }
                    if (n == 5 && s+0 == this._zimo) { n_pai--; n_hongpai-- }
                }
                for (let i = 0; i < n_pai; i++) {
                    if (n ==5 && n_hongpai > 0) { suitstr += 0; n_hongpai-- }
                    else                        { suitstr += n;             }
                }
            }
            if (suitstr.length > 1) paistr += suitstr;
        }
        paistr += '_'.repeat(this._bingpai._ + (this._zimo == '_' ? -1 : 0));
        if (this._zimo && this._zimo.length <= 2) paistr += this._zimo;
        if (this._lizhi)                          paistr += '*';

        for (let m of this._fulou) {
            paistr += ',' + m;
        }
        if (this._zimo && this._zimo.length > 2) paistr += ',';

        return paistr;
    }

    clone() {

        const shoupai = new Shoupai();

        shoupai._bingpai = {
            _: this._bingpai._,
            m: this._bingpai.m.concat(),
            p: this._bingpai.p.concat(),
            s: this._bingpai.s.concat(),
            z: this._bingpai.z.concat(),
        };
        shoupai._fulou     = this._fulou.concat();
        shoupai._fulouMeta = this._fulouMeta.map(m => ({
            type: m.type, tiles: m.tiles.concat(),
            fromSeat: m.fromSeat, calledTileIndex: m.calledTileIndex,
        }));
        shoupai._zimo      = this._zimo;
        shoupai._lizhi     = this._lizhi;
        shoupai._markedTiles = new Map(this._markedTiles);
        shoupai._hiddenTiles = new Map(this._hiddenTiles);
        shoupai._lockedTiles = new Map(this._lockedTiles);

        return shoupai;
    }

    fromString(paistr) {
        const shoupai = Shoupai.fromString(paistr);
        this._bingpai = {
            _: shoupai._bingpai._,
            m: shoupai._bingpai.m.concat(),
            p: shoupai._bingpai.p.concat(),
            s: shoupai._bingpai.s.concat(),
            z: shoupai._bingpai.z.concat(),
        };
        this._fulou     = shoupai._fulou.concat();
        this._fulouMeta = shoupai._fulouMeta.map(m => ({
            type: m.type, tiles: m.tiles.concat(),
            fromSeat: m.fromSeat, calledTileIndex: m.calledTileIndex,
        }));
        this._zimo      = shoupai._zimo;
        this._lizhi     = shoupai._lizhi;
        this._markedTiles = new Map(shoupai._markedTiles);
        this._hiddenTiles = new Map(shoupai._hiddenTiles);
        this._lockedTiles = new Map(shoupai._lockedTiles);

        return this;
    }

    decrease(s, n) {
        let bingpai = this._bingpai[s]; n = + n;
        if (bingpai[n] == 0 || n == 5 && bingpai[0] == bingpai[5]) {
            if (this._bingpai._ == 0) {
                if (n == 5 && bingpai[0] > 0) {
                    bingpai[0]--;
                    bingpai[5]--;
                    return;
                }
                throw new Error([this,s+n]);
            }
            this._bingpai._--;
        }
        else {
            bingpai[n]--;
            if (n == 0) bingpai[5]--;
        }
    }

    zimo(p, check = true) {
        if (check && this._zimo) {
            throw new Error([this, p]);
        }
        if (p == '_') {
            this._bingpai._++;
            this._zimo = p;
        }
        else {
            if (! Shoupai.valid_pai(p))             throw new Error(p);
            let s = p[0], n = +p[1];
            let bingpai = this._bingpai[s];
            if (bingpai[n] == 4)                    throw new Error([this, p]);
            bingpai[n]++;
            if (n == 0) {
                if (bingpai[5] == 4)                throw new Error([this, p]);
                bingpai[5]++;
            }
            this._zimo = s+n;
        }
        return this;
    }

    dapai(p, check = true, discardMarked = true) {
        if (check && ! this._zimo)                  throw new Error([this, p]);
        if (p == '_') {
            this._bingpai._--;
            this._zimo = null;
            return this;
        }
        if (! Shoupai.valid_pai(p))                 throw new Error(p);
        let s = p[0], n = +p[1];
        this.decrease(s, n);
        this._zimo = null;
        if (p.slice(-1) == '*') this._lizhi = true;
        /* 打出的牌视 discardMarked 标记决定是否取消标记（减少计数） */
        if (discardMarked) {
            this._decrementMapCount(this._markedTiles, s + n);
        }
        /* 打出的牌同步减少隐藏/锁定牌的计数 */
        this._decrementMapCount(this._hiddenTiles, s + n);
        this._decrementMapCount(this._lockedTiles, s + n);
        return this;
    }

    fulou(m, check = true) {
        if (check && this._zimo)                    throw new Error([this, m]);
        let meta = meldParser.parseMianzi(m);
        if (!meta)                                  throw new Error(m);
        m = meldParser.toMianziString(meta);  // 规范化
        if (meta.type === 'ankan' || meta.type === 'kakan')
                                                    throw new Error([this, m]);
        for (let i = 0; i < meta.tiles.length; i++) {
            if (i === meta.calledTileIndex) continue;  // 被叫牌来自对手，不在手牌中
            let tile = meta.tiles[i];
            let s = tile[0], n = +tile[1] || 5;
            this.decrease(s, n);
            let _key = s + n;
            this._decrementMapCount(this._markedTiles, _key);
            this._decrementMapCount(this._hiddenTiles, _key);
            this._decrementMapCount(this._lockedTiles, _key);
        }
        this._fulou.push(m);
        this._fulouMeta.push({
            type:  meta.type,
            tiles: meta.tiles,
            fromSeat: meta.fromSeat,
            calledTileIndex: meta.calledTileIndex,
        });
        if (meta.type !== 'ankan') this._zimo = m;
        return this;
    }

    gang(m, check = true) {
        if (check && ! this._zimo)                  throw new Error([this, m]);
        if (check && this._zimo.length > 2)         throw new Error([this, m]);
        let meta = meldParser.parseMianzi(m);
        if (!meta)                                  throw new Error(m);
        m = meldParser.toMianziString(meta);  // 规范化

        if (meta.type === 'ankan') {
            for (let tile of meta.tiles) {
                let s = tile[0], n = +tile[1] || 5;
                this.decrease(s, n);
                let _key = s + n;
                this._decrementMapCount(this._markedTiles, _key);
                this._decrementMapCount(this._hiddenTiles, _key);
                this._decrementMapCount(this._lockedTiles, _key);
            }
            this._fulou.push(m);
            this._fulouMeta.push({
                type:  'ankan',
                tiles: meta.tiles,
                fromSeat: null,
                calledTileIndex: null,
            });
        }
        else if (meta.type === 'kakan') {
            // 找到对应的碰/明杠条目
            let i = this._fulou.findIndex(m2 => {
                let meta2 = meldParser.parseMianzi(m2);
                // 前三张是原副露的牌
                if (!meta2) return false;
                return meta2.tiles[0] === meta.tiles[0]
                    && meta2.tiles[1] === meta.tiles[1]
                    && meta2.tiles[2] === meta.tiles[2];
            });
            if (i < 0)                              throw new Error([this, m]);
            this._fulou[i] = m;
            this._fulouMeta[i] = {
                type:  'kakan',
                tiles: meta.tiles,
                fromSeat: meta.fromSeat,
                calledTileIndex: meta.calledTileIndex,
            };
            let lastTile = meta.tiles[meta.tiles.length - 1];
            this.decrease(lastTile[0], +lastTile[1] || 5);
            let _key = lastTile[0] + (+lastTile[1] || 5);
            this._decrementMapCount(this._markedTiles, _key);
            this._decrementMapCount(this._hiddenTiles, _key);
            this._decrementMapCount(this._lockedTiles, _key);
        }
        else                                        throw new Error([this, m]);
        this._zimo = null;
        return this;
    }

    static fulouType(m) {
        return meldParser.fulouType(m);
    }

    static fulouTiles(m) {
        return meldParser.fulouTiles(m);
    }

    /**
     * 从指定的计数 Map 中减少一张牌的计数
     * @param {Map} map - 计数 Map（如 _markedTiles / _hiddenTiles / _lockedTiles）
     * @param {string} key - 牌的关键字（如 "s8"）
     */
    _decrementMapCount(map, key) {
        if (map.has(key)) {
            let c = map.get(key);
            if (c <= 1) map.delete(key);
            else        map.set(key, c - 1);
        }
    }

    /**
     * 标记手牌中的牌张（使这些牌对所有玩家可见）
     * @param {string[]} tiles — 要标记的牌张数组，如 ['m1','p5','z7']
     */
    markTiles(tiles) {
        for (let p of tiles) {
            if (!Shoupai.valid_pai(p)) continue;
            let key = p[0] + p[1];
            this._markedTiles.set(key, (this._markedTiles.get(key) || 0) + 1);
        }
    }

    /**
     * 取消手牌中的牌张标记（减少计数）
     * @param {string[]} tiles — 要取消标记的牌张数组
     */
    unmarkTiles(tiles) {
        for (let p of tiles) {
            let key = p[0] + p[1];
            if (!this._markedTiles.has(key)) continue;
            let c = this._markedTiles.get(key);
            if (c <= 1) this._markedTiles.delete(key);
            else        this._markedTiles.set(key, c - 1);
        }
    }

    /** 清空所有牌张标记 */
    clearMarkedTiles() {
        this._markedTiles.clear();
    }

    /** 获取标记牌张列表（含重复，用于序列化/联机同步） */
    get markedTiles() {
        let result = [];
        for (let [key, count] of this._markedTiles) {
            for (let i = 0; i < count; i++) result.push(key);
        }
        return result;
    }

    /* ==================== 隐藏牌（对自己不可见） ==================== */

    /**
     * 标记手牌中的牌为自己不可见（背面展示）
     * @param {string[]} tiles — 要隐藏的牌张数组
     */
    markHidden(tiles) {
        for (let p of tiles) {
            if (!Shoupai.valid_pai(p)) continue;
            let key = p[0] + p[1];
            this._hiddenTiles.set(key, (this._hiddenTiles.get(key) || 0) + 1);
        }
    }

    /**
     * 取消手牌中的牌隐藏标记
     * @param {string[]} tiles — 要取消隐藏的牌张数组
     */
    unmarkHidden(tiles) {
        for (let p of tiles) {
            let key = p[0] + p[1];
            if (!this._hiddenTiles.has(key)) continue;
            let c = this._hiddenTiles.get(key);
            if (c <= 1) this._hiddenTiles.delete(key);
            else        this._hiddenTiles.set(key, c - 1);
        }
    }

    /** 清空所有隐藏牌标记 */
    clearHiddenTiles() {
        this._hiddenTiles.clear();
    }

    /** 获取隐藏牌张列表（含重复，用于序列化/联机同步） */
    get hiddenTiles() {
        let result = [];
        for (let [key, count] of this._hiddenTiles) {
            for (let i = 0; i < count; i++) result.push(key);
        }
        return result;
    }

    /* ==================== 锁定牌（无法打出/副露） ==================== */

    /**
     * 锁定手牌中的牌张（无法打出或副露，以黑框表示）
     * @param {string[]} tiles — 要锁定的牌张数组
     */
    lockTiles(tiles) {
        for (let p of tiles) {
            if (!Shoupai.valid_pai(p)) continue;
            let key = p[0] + p[1];
            this._lockedTiles.set(key, (this._lockedTiles.get(key) || 0) + 1);
        }
    }

    /**
     * 取消手牌中的牌张锁定
     * @param {string[]} tiles — 要取消锁定的牌张数组
     */
    unlockTiles(tiles) {
        for (let p of tiles) {
            let key = p[0] + p[1];
            if (!this._lockedTiles.has(key)) continue;
            let c = this._lockedTiles.get(key);
            if (c <= 1) this._lockedTiles.delete(key);
            else        this._lockedTiles.set(key, c - 1);
        }
    }

    /** 清空所有锁定牌标记 */
    clearLockedTiles() {
        this._lockedTiles.clear();
    }

    /** 获取锁定牌张列表（含重复，用于序列化/联机同步） */
    get lockedTiles() {
        let result = [];
        for (let [key, count] of this._lockedTiles) {
            for (let i = 0; i < count; i++) result.push(key);
        }
        return result;
    }

    get menqian() {
        for (let meta of this._fulouMeta) {
            if (meta.fromSeat != null) return false;
        }
        return true;
    }

    /** 副露元数据数组（与 _fulou 一一对应） */
    get meldMetas() {
        return this._fulouMeta;
    }

    get lizhi() { return this._lizhi }

    get_dapai(check = true) {

        if (! this._zimo) return null;

        let deny = {};
        if (check && this._zimo.length > 2) {
            // 副露巡目：解析 _zimo（新格式 mianzi）获取被叫牌
            let meta = meldParser.parseMianzi(this._zimo);
            if (meta && meta.calledTileIndex != null) {
                let calledTile = meta.tiles[meta.calledTileIndex];
                let s = calledTile[0];
                let n = +calledTile[1] || 5;
                deny[s+n] = true;
                if (meta.type === 'chi') {
                    if (meta.calledTileIndex === 0 && n < 7)      deny[s+(n+3)] = true;
                    if (meta.calledTileIndex === 2 && 3 < n)       deny[s+(n-3)] = true;
                }
            }
        }

        let dapai = [];
        if (! this._lizhi) {
            for (let s of ['m','p','s','z']) {
                let bingpai = this._bingpai[s];
                for (let n = 1; n < bingpai.length; n++) {
                    if (bingpai[n] == 0)  continue;
                    if (deny[s+n])        continue;
                    if (s+n == this._zimo && bingpai[n] == 1) continue;
                    /* 锁定牌排除：若该种牌全部被锁定，则不可打 */
                    let lockedCount = this._lockedTiles.get(s+n) || 0;
                    let availCount = bingpai[n] - (s+n == this._zimo ? 1 : 0);
                    if (lockedCount >= availCount) continue;
                    if (s == 'z' || n != 5)          dapai.push(s+n);
                    else {
                        if (bingpai[0] > 0
                            && s+0 != this._zimo || bingpai[0] > 1)
                                                     dapai.push(s+0);
                        if (bingpai[0] < bingpai[5]) dapai.push(s+n);
                    }
                }
            }
        }
        if (this._zimo.length == 2) dapai.push(this._zimo + '_');
        return dapai;
    }

    get_chi_mianzi(p, check = true) {

        if (this._zimo) return null;
        if (! Shoupai.valid_pai(p))                     throw new Error(p);

        let mianzi = [];
        let s = p[0], n = + p[1] || 5, d = p.match(/[\+\=\-]$/);
        if (! d)                                        throw new Error(p);
        if (s == 'z' || d != '-') return mianzi;
        if (this._lizhi) return mianzi;

        let bingpai = this._bingpai[s];

        let callDigit = p[1];  // '0' or '5' or normal

        // 模式1：被叫牌在末尾（sXXN-），n 是被叫牌点数
        if (3 <= n && bingpai[n-2] > 0 && bingpai[n-1] > 0) {
            if (! check
                || (3 < n ? bingpai[n-3] : 0) + bingpai[n]
                        < 14 - (this._fulou.length + 1) * 3)
            {
                let t0 = s + (n-2), t1 = s + (n-1), t2 = s + callDigit;
                if (n-2 == 5 && bingpai[0] > 0) {
                    let meta = {type:'chi', tiles:[s+'0',t1,t2], fromSeat:2, calledTileIndex:2};
                    mianzi.push(meldParser.toMianziString(meta));
                }
                if (n-1 == 5 && bingpai[0] > 0) {
                    let meta = {type:'chi', tiles:[t0,s+'0',t2], fromSeat:2, calledTileIndex:2};
                    mianzi.push(meldParser.toMianziString(meta));
                }
                if (n-2 != 5 && n-1 != 5 || bingpai[0] < bingpai[5]) {
                    let meta = {type:'chi', tiles:[t0,t1,t2], fromSeat:2, calledTileIndex:2};
                    mianzi.push(meldParser.toMianziString(meta));
                }
            }
        }
        // 模式2：被叫牌在中间（sXN-X），n 是被叫牌点数
        if (2 <= n && n <= 8 && bingpai[n-1] > 0 && bingpai[n+1] > 0) {
            if (! check || bingpai[n] < 14 - (this._fulou.length + 1) * 3) {
                let t0 = s + (n-1), t1 = s + callDigit, t2 = s + (n+1);
                if (n-1 == 5 && bingpai[0] > 0) {
                    let meta = {type:'chi', tiles:[s+'0',t1,t2], fromSeat:2, calledTileIndex:1};
                    mianzi.push(meldParser.toMianziString(meta));
                }
                if (n+1 == 5 && bingpai[0] > 0) {
                    let meta = {type:'chi', tiles:[t0,t1,s+'0'], fromSeat:2, calledTileIndex:1};
                    mianzi.push(meldParser.toMianziString(meta));
                }
                if (n-1 != 5 && n+1 != 5 || bingpai[0] < bingpai[5]) {
                    let meta = {type:'chi', tiles:[t0,t1,t2], fromSeat:2, calledTileIndex:1};
                    mianzi.push(meldParser.toMianziString(meta));
                }
            }
        }
        // 模式3：被叫牌在开头（sN-XX），n 是被叫牌点数
        if (n <= 7 && bingpai[n+1] > 0 && bingpai[n+2] > 0) {
            if (! check
                ||  bingpai[n] + (n < 7 ? bingpai[n+3] : 0)
                        < 14 - (this._fulou.length + 1) * 3)
            {
                let t0 = s + callDigit, t1 = s + (n+1), t2 = s + (n+2);
                if (n+1 == 5 && bingpai[0] > 0) {
                    let meta = {type:'chi', tiles:[t0,s+'0',t2], fromSeat:2, calledTileIndex:0};
                    mianzi.push(meldParser.toMianziString(meta));
                }
                if (n+2 == 5 && bingpai[0] > 0) {
                    let meta = {type:'chi', tiles:[t0,t1,s+'0'], fromSeat:2, calledTileIndex:0};
                    mianzi.push(meldParser.toMianziString(meta));
                }
                if (n+1 != 5 && n+2 != 5 || bingpai[0] < bingpai[5]) {
                    let meta = {type:'chi', tiles:[t0,t1,t2], fromSeat:2, calledTileIndex:0};
                    mianzi.push(meldParser.toMianziString(meta));
                }
            }
        }
        return mianzi;
    }

    get_peng_mianzi(p) {

        if (this._zimo) return null;
        if (! Shoupai.valid_pai(p))                     throw new Error(p);

        let mianzi = [];
        let s = p[0], n = + p[1] || 5, d = p.match(/[\+\=\-]$/);
        if (! d)                                        throw new Error(p);
        if (this._lizhi) return mianzi;

        let bingpai = this._bingpai[s];
        let callDigit = p[1];
        let dir = d[0];
        let fromSeat = dir === '+' ? 0 : dir === '=' ? 1 : 2;

        if (bingpai[n] >= 2) {
            if (n == 5 && bingpai[0] >= 2) {
                let meta = {type:'pon', tiles:[s+'0',s+'0',s+callDigit], fromSeat, calledTileIndex:2};
                mianzi.push(meldParser.toMianziString(meta));
            }
            if (n == 5 && bingpai[0] >= 1 && bingpai[5] - bingpai[0] >= 1) {
                let meta = {type:'pon', tiles:[s+'0',s+'5',s+callDigit], fromSeat, calledTileIndex:2};
                mianzi.push(meldParser.toMianziString(meta));
            }
            if (n != 5 || bingpai[5] - bingpai[0] >= 2) {
                let tile = s + (n == 5 ? '5' : n);
                let meta = {type:'pon', tiles:[tile,tile,s+callDigit], fromSeat, calledTileIndex:2};
                mianzi.push(meldParser.toMianziString(meta));
            }
        }
        return mianzi;
    }

    get_gang_mianzi(p) {

        let mianzi = [];
        if (p) {
            // 大明杠（叫的杠）
            if (this._zimo) return null;
            if (! Shoupai.valid_pai(p))                 throw new Error(p);

            let s = p[0], n = + p[1] || 5, d = p.match(/[\+\=\-]$/);
            if (! d)                                    throw new Error(p);
            if (this._lizhi) return mianzi;

            let bingpai = this._bingpai[s];
            if (bingpai[n] == 3) {
                let dir = d[0];
                let fromSeat = dir === '+' ? 0 : dir === '=' ? 1 : 2;
                let callDigit = p[1];
                let tiles = [];
                if (n == 5) {
                    let redCount = bingpai[0];
                    for (let i = 0; i < 3 - redCount; i++) tiles.push(s + '5');
                    for (let i = 0; i < redCount; i++)     tiles.push(s + '0');
                    tiles.push(s + callDigit);
                } else {
                    tiles = [s+n, s+n, s+n, s+callDigit];
                }
                let meta = {type: 'minkan', tiles, fromSeat, calledTileIndex: 3};
                mianzi.push(meldParser.toMianziString(meta));
            }
        }
        else {
            // 暗杠 / 加杠
            if (! this._zimo) return null;
            if (this._zimo.length > 2) return null;
            let zimoPai = this._zimo.replace(/0/,'5');

            for (let s of ['m','p','s','z']) {
                let bingpai = this._bingpai[s];
                for (let n = 1; n < bingpai.length; n++) {
                    if (bingpai[n] == 0) continue;
                    if (bingpai[n] == 4) {
                        // 暗杠
                        if (this._lizhi && s+n != zimoPai) continue;
                        let tiles = [];
                        if (n == 5) {
                            let redCount = bingpai[0];
                            for (let i = 0; i < 4 - redCount; i++) tiles.push(s + '5');
                            for (let i = 0; i < redCount; i++)     tiles.push(s + '0');
                        } else {
                            tiles = [s+n, s+n, s+n, s+n];
                        }
                        let meta = {type: 'ankan', tiles, fromSeat: null, calledTileIndex: null};
                        mianzi.push(meldParser.toMianziString(meta));
                    }
                    else {
                        // 加杠：查找已有的碰
                        if (this._lizhi) continue;
                        for (let m of this._fulou) {
                            let meta2 = meldParser.parseMianzi(m);
                            if (!meta2) continue;
                            let firstThree = meta2.tiles.slice(0, 3)
                                .map(t => t.replace(/0/g, '5'));
                            if (firstThree.every(t => t === s+n)) {
                                let newTile = s + (n == 5 && bingpai[0] > 0
                                    ? '0' : String(n));
                                let newTiles = meta2.tiles.concat([newTile]);
                                let meta = {
                                    type: 'kakan',
                                    tiles: newTiles,
                                    fromSeat: meta2.fromSeat,
                                    calledTileIndex: meta2.calledTileIndex
                                };
                                mianzi.push(meldParser.toMianziString(meta));
                            }
                        }
                    }
                }
            }
        }
        return mianzi;
    }
}
