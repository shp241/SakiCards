/*
 *  Majiang.He
 */
"use strict";

const Majiang = { Shoupai: require('./shoupai') };

module.exports = class He {

    constructor() {
        this._pai    = [];
        this._find   = {};
        this._hidden = {};       /* { index: true } 暗牌位置 */
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
        /* 暗切不计入 _find，以免影响振听和 AI 牌探 */
        if (!hidden) this._find[p[0]+(+p[1]||5)] = true;
        return this;
    }

    fulou(m) {
        if (! Majiang.Shoupai.valid_mianzi(m))      throw new Error(m);
        let p = m[0] + m.match(/\d(?=[\+\=\-])/), d = m.match(/[\+\=\-]/);
        if (! d)                                    throw new Error(m);
        if (this._pai[this._pai.length - 1].slice(0,2) != p)
                                                    throw new Error(m);
        this._pai[this._pai.length - 1] += d;
        return this;
    }

    find(p) {
        return this._find[p[0]+(+p[1]||5)];
    }
}
