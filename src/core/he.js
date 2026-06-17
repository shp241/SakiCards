/*
 *  Majiang.He
 */
"use strict";

const Majiang = { Shoupai: require('./shoupai') };
const meldParser = require('./meld-parser.js');

module.exports = class He {

    constructor() {
        this._pai    = [];
        this._find   = {};
        this._hidden = {};       /* { index: true } 暗牌位置 */
        this._fuloued = [];      /* 被副露移走的舍牌: { tile, wasHidden } */
    }

    dapai(p, hidden = false) {
        if (p == '_') {
            this._pai.push(p);
            if (hidden) this._hidden[this._pai.length - 1] = true;
            return this;
        }
        if (! Majiang.Shoupai.valid_pai(p))         throw new Error(p);
        this._pai.push(p.replace(/[\+\=\-]$/,''));
        if (hidden) this._hidden[this._pai.length - 1] = true;
        /* 按切不计入 _find，以免影响振听和 AI 牌探 */
        if (!hidden) this._find[p[0]+(+p[1]||5)] = true;
        return this;
    }

    fulou(m) {
        if (! Majiang.Shoupai.valid_mianzi(m))      throw new Error(m);
        let meta = meldParser.parseMianzi(m);
        if (!meta || meta.calledTileIndex == null) throw new Error(m);
        let calledTile = meta.tiles[meta.calledTileIndex];
        /* 向前搜索匹配的牌（支持技能扩展器从牌河前面副露） */
        for (let i = this._pai.length - 1; i >= 0; i--) {
            if (this._pai[i].slice(0, 2) === calledTile) {
                /* 从牌河移除该牌，记录到 _fuloued */
                let wasHidden = !!(this._hidden && this._hidden[i]);
                this._fuloued.push({ tile: calledTile, wasHidden });
                this._pai.splice(i, 1);
                /* 清理并左移 _hidden 索引 */
                if (this._hidden) {
                    let newHidden = {};
                    for (let k in this._hidden) {
                        let ki = parseInt(k);
                        if (ki > i) newHidden[ki - 1] = true;
                        else if (ki < i) newHidden[ki] = true;
                    }
                    this._hidden = newHidden;
                }
                /* 保留 _find（振听/现物依赖），不删除 */
                return this;
            }
        }
        /* 找不到牌时仅警告（可能被技能/额外巡从牌河取走），不阻塞游戏 */
        console.warn('[He.fulou] tile not found in river:', calledTile,
            'mianzi:', m, 'pai:', JSON.stringify(this._pai));
        return this;
    }

    find(p) {
        return this._find[p[0]+(+p[1]||5)];
    }

    /**
     * 遍历所有非暗切的曾舍牌（牌河现存 + 被副露移走的）。
     * 用于振听判定和现物计算。
     */
    *iterVisibleDiscards() {
        for (let i = 0; i < this._pai.length; i++) {
            let p = this._pai[i];
            if (p === '_') continue;
            if (this._hidden && this._hidden[i]) continue;
            yield p;
        }
        for (let f of this._fuloued) {
            if (!f.wasHidden) yield f.tile;
        }
    }
}
