/*
 *  Majiang.Board
 */
"use strict";

const Majiang = {
    Shoupai: require('./shoupai'),
    He:      require('./he')
};

class Shan {
    constructor(baopai) {
        this.paishu = 136 - 13 * 4 - 14;
        this.baopai = [].concat(baopai||[]);
        this.fubaopai;
    }
    zimo(p)         { this.paishu--; console.log('[local-shan] zimo: p=' + p + ' paishu=' + this.paishu); return p || '_' }
    kaigang(baopai) { this.baopai.push(baopai);      }
}

module.exports = class Board {

    constructor(kaiju) {
        if (kaiju) this.kaiju(kaiju);
    }

    kaiju(kaiju) {

        this.title  = kaiju.title;
        this.player = kaiju.player;
        this.qijia  = kaiju.qijia;

        this.zhuangfeng = 0;
        this.jushu      = 0;
        this.changbang  = 0;
        this.lizhibang  = 0;
        this.defen      = [];
        this.shan       = null;
        this.shoupai    = [];
        this.he         = [];
        this.seatToPlIdx  = [0,1,2,3];
        this.lunban     = -1;

        this._character = kaiju.character || [null,null,null,null];
        this._skill     = kaiju.skill != null ? kaiju.skill : true;

        this._lizhi;
        this._fenpei;
        this._lianzhuang;
        this._changbang;
        this._lizhibang;
    }

    menfeng(id) {
        return (id + 4 - this.qijia + 4 - this.jushu) % 4;
    }

    qipai(qipai) {
        this.zhuangfeng = qipai.zhuangfeng;
        this.jushu      = qipai.jushu;
        this.changbang  = qipai.changbang;
        this.lizhibang  = qipai.lizhibang;
        this.shan       = new Shan(qipai.baopai);
        for (let l = 0; l < 4; l++) {
            let paistr = qipai.shoupai[l] || '_'.repeat(13);
            this.shoupai[l] = Majiang.Shoupai.fromString(paistr);
            this.he[l]      = new Majiang.He();
            this.seatToPlIdx[l] = (this.qijia + this.jushu + l) % 4;
            this.defen[this.seatToPlIdx[l]] = qipai.defen[l];
        }
        this.lunban     = -1;

        this._lizhi     = false;
        this._fenpei    = null;
        this._changbang = qipai.changbang;
        this._lizhibang = qipai.lizhibang;
    }

    lizhi() {
        if (this._lizhi) {
            this.defen[this.seatToPlIdx[this.lunban]] -= 1000;
            this.lizhibang++;
            this._lizhi = false;
        }
    }

    zimo(zimo) {
        this.lizhi();
        this.lunban = zimo.l;
        /* 服务端提供了完整手牌（技能可能已修改手牌），同步更新。
         * 注意：不能替换整个 Shoupai 对象（UI 持有原对象引用），
         * 必须复制 _bingpai / _zimo 到现有对象上。 */
        let shoupai = this.shoupai[zimo.l];
        if (zimo.shoupai) {
            let updated = Majiang.Shoupai.fromString(zimo.shoupai);
            shoupai._bingpai._ = updated._bingpai._;
            for (let s of ['m','p','s','z']) {
                for (let n = 0; n < updated._bingpai[s].length; n++) {
                    shoupai._bingpai[s][n] = updated._bingpai[s][n];
                }
            }
            shoupai._zimo = updated._zimo;
            shoupai._fulou     = updated._fulou.concat();
            shoupai._fulouMeta = updated._fulouMeta.map(m => ({
                type: m.type, tiles: m.tiles.concat(),
                fromSeat: m.fromSeat, calledTileIndex: m.calledTileIndex
            }));
            /* fromString 可能已正确识别 _zimo（短字符串），此时 bingpai 已含该牌，
             * 不应再次 zimo()；仅当 _zimo 为 null 或副露面字时，需补充摸牌。 */
            let pai = this.shan.zimo(zimo.p);
            if (!shoupai._zimo || shoupai._zimo.length > 2) {
                shoupai.zimo(pai, false);
            }
        }
        else {
            /* 如果手牌已有 _zimo（如技能 restart 重复发送 zimo），先移除旧牌 */
            if (shoupai._zimo && shoupai._zimo.length <= 2) {
                try { shoupai.dapai(shoupai._zimo, false); } catch(e) {}
            }
            shoupai.zimo(this.shan.zimo(zimo.p), false);
        }
        /* 同步标记牌张 */
        if (zimo.markedTiles) {
            shoupai._markedTiles = new Set(zimo.markedTiles);
        }
    }

    dapai(dapai) {
        this.lunban = dapai.l;
        let p = dapai.p || '_';
        this.shoupai[dapai.l].dapai(p, false);
        this.he[dapai.l].dapai(p, dapai.hidden);
        this._lizhi = p != '_' && p.slice(-1) == '*';
        if (dapai.markedTiles) {
            this.shoupai[dapai.l]._markedTiles = new Set(dapai.markedTiles);
        }
    }

    fulou(fulou) {
        this.lizhi();
        this.he[this.lunban].fulou(fulou.m);
        this.lunban = fulou.l;
        this.shoupai[fulou.l].fulou(fulou.m, false);
        if (fulou.markedTiles) {
            this.shoupai[fulou.l]._markedTiles = new Set(fulou.markedTiles);
        }
    }

    gang(gang) {
        this.lunban = gang.l;
        this.shoupai[gang.l].gang(gang.m, false);
        if (gang.markedTiles) {
            this.shoupai[gang.l]._markedTiles = new Set(gang.markedTiles);
        }
    }

    kaigang(kaigang) {
        this.shan.kaigang(kaigang.baopai);
    }

    hule(hule) {
        let shoupai = this.shoupai[hule.l];
        shoupai.fromString(hule.shoupai);
        if (hule.baojia != null) shoupai.dapai(shoupai.get_dapai().pop());
        if (this._fenpei) {
            this.changbang = 0;
            this.lizhibang = 0;
            for (let l = 0; l < 4; l++) {
                this.defen[this.seatToPlIdx[l]] += this._fenpei[l];
            }
        }
        this.shan.fubaopai = hule.fubaopai;
        this._fenpei = hule.fenpei;
        this._lizhibang = 0;
        if (hule.l == 0) this._lianzhuang = true;
    }

    pingju(pingju) {
        if (! pingju.name.match(/^三家和/)) this.lizhi();
        for (let l = 0; l < 4; l++) {
            if (pingju.shoupai[l])
                this.shoupai[l].fromString(pingju.shoupai[l]);
        }
        this._fenpei = pingju.fenpei;
        this._lizhibang = this.lizhibang;
        this._lianzhuang = true;
    }

    last() {
        if (! this._fenpei) return;
        this.changbang = this._lianzhuang ? this._changbang + 1 : 0;
        this.lizhibang = this._lizhibang;
        for (let l = 0; l < 4; l++) {
            this.defen[this.seatToPlIdx[l]] += this._fenpei[l];
        }
    }

    jieju(paipu) {
        for (let id = 0; id < 4; id++) {
            this.defen[id] = paipu.defen[id];
        }
        this.lunban = -1;
    }
}
