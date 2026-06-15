/*
 *  Majiang.Player
 */
"use strict";

const Majiang = {
    Shoupai: require('./shoupai'),
    He:      require('./he'),
    Game:    require('./game'),
    Board:   require('./board'),
    Util:    Object.assign(require('./xiangting'),
                           require('./hule'))
};

module.exports = class Player {

    constructor() {
        this._model = new Majiang.Board();
    }

    action(msg, callback) {

        this._callback = callback;

        if      (msg.kaiju)    this.kaiju  (msg.kaiju);
        else if (msg.qipai)    this.qipai  (msg.qipai);
        else if (msg.zimo)     this.zimo   (msg.zimo);
        else if (msg.dapai)    this.dapai  (msg.dapai);
        else if (msg.fulou)    this.fulou  (msg.fulou);
        else if (msg.gang)     this.gang   (msg.gang);
        else if (msg.gangzimo) this.zimo   (msg.gangzimo, true)
        else if (msg.kaigang)  this.kaigang(msg.kaigang);
        else if (msg.hule)     this.hule   (msg.hule);
        else if (msg.pingju)   this.pingju (msg.pingju);
        else if (msg.jieju)    this.jieju  (msg.jieju);
    }

    get shoupai() { return this._model.shoupai[this._menfeng] }
    get he()      { return this._model.he[this._menfeng]      }
    get shan()    { return this._model.shan                   }
    get hulepai() {
        return Majiang.Util.xiangting(this.shoupai) == 0
                && Majiang.Util.tingpai(this.shoupai)
            || [];
    }
    get model()    { return this._model  }
    set view(view) { this._view = view   }

    /** 设置技能管理器 */
    set skillManager(sm) { this._skill_manager = sm }
    get skillManager()   { return this._skill_manager }

    /** 设置/获取当前角色ID */
    set characterId(id)  { this._character_id = id }
    get characterId()    { return this._character_id }

    /** 获取所有玩家的角色ID列表 */
    get characterIds()   {
        return this._model._character || [null,null,null,null];
    }

    /**
     * 查询当前可发动的技能
     * @param {string} timing - 触发时机
     * @returns {Object[]}
     */
    getAvailableSkills(timing) {
        if (!this._skill_manager) return [];
        return this._skill_manager.getActiveSkills(this._menfeng)
            .filter(s => !s.sealed && s.timing === timing);
    }

    kaiju(kaiju) {
        this._id   = kaiju.id;
        this._rule = kaiju.rule;
        this._model.kaiju(kaiju);
        if (this._view) this._view.kaiju(kaiju.id);

        /* 记录角色信息 */
        if (kaiju.character) {
            let chars = kaiju.character;
            for (let i = 0; i < 4; i++) {
                this._model._character[i] = chars[i] || null;
            }
        }

        if (this._callback) this.action_kaiju(kaiju);
    }

    qipai(qipai) {
        this._model.qipai(qipai);
        this._menfeng   = this._model.menfeng(this._id);
        this._diyizimo  = true;
        this._n_gang    = 0;
        this._neng_rong = true;
        if (this._view) this._view.redraw();

        if (this._callback) this.action_qipai(qipai);
    }

    zimo(zimo, gangzimo) {
        this._model.zimo(zimo);
        if (gangzimo) this._n_gang++;
        if (this._view) {
            if (gangzimo) this._view.update({ gangzimo: zimo });
            else          this._view.update({ zimo: zimo });
        }

        console.log('[hand] zimo: menfeng=' + this._menfeng + ' p=' + zimo.p
            + ' shoupai=' + this.shoupai + ' paishu=' + this.shan.paishu);

        if (this._callback) this.action_zimo(zimo, gangzimo);
    }

    dapai(dapai) {

        if (dapai.l == this._menfeng) {
            if (! this.shoupai.lizhi) this._neng_rong = true;
        }

        this._model.dapai(dapai);
        if (this._view) this._view.update({ dapai: dapai });

        console.log('[hand] dapai: menfeng=' + this._menfeng + ' dapai_l=' + dapai.l
            + ' p=' + dapai.p + ' shoupai=' + this.shoupai + ' paishu=' + this.shan.paishu);

        if (this._callback) this.action_dapai(dapai);

        if (dapai.l == this._menfeng) {
            this._diyizimo = false;
            if (this.hulepai.find(p=> this.he.find(p))) this._neng_rong = false;
        }
        else if (dapai.p) {
            let s = dapai.p[0], n = +dapai.p[1]||5;
            if (this.hulepai.find(p=> p == s+n)) this._neng_rong = false;
        }
    }

    fulou(fulou) {
        this._model.fulou(fulou);
        if (this._view) this._view.update({ fulou: fulou });

        console.log('[hand] fulou: menfeng=' + this._menfeng + ' fulou_l=' + fulou.l
            + ' m=' + fulou.m + ' shoupai=' + this.shoupai + ' paishu=' + this.shan.paishu);

        if (this._callback) this.action_fulou(fulou);

        this._diyizimo = false;
    }

    gang(gang) {
        this._model.gang(gang);
        if (this._view) this._view.update({ gang: gang });

        console.log('[hand] gang: menfeng=' + this._menfeng + ' gang_l=' + gang.l
            + ' m=' + gang.m + ' shoupai=' + this.shoupai + ' paishu=' + this.shan.paishu);

        if (this._callback) this.action_gang(gang);

        this._diyizimo = false;
        if (gang.l != this._menfeng && ! gang.m.match(/^[mpsz]\d{4}$/)) {
            let s = gang.m[0], n = +gang.m.slice(-1)||5;
            if (this.hulepai.find(p=> p == s+n)) this._neng_rong = false;
        }
    }

    kaigang(kaigang) {
        this._model.kaigang(kaigang);
        if (this._view) this._view.update({ kaigang: kaigang });
    }

    hule(hule) {
        this._model.hule(hule);
        if (this._view) this._view.update({ hule: hule });
        if (this._callback) this.action_hule(hule);
    }

    pingju(pingju) {
        this._model.pingju(pingju);
        if (this._view) this._view.update({ pingju: pingju });
        if (this._callback) this.action_pingju(pingju);
    }

    jieju(paipu) {
        this._model.jieju(paipu);
        this._paipu = paipu;
        if (this._view) this._view.summary(paipu);
        if (this._callback) this.action_jieju(paipu);
    }

    get_dapai(shoupai) {
        return Majiang.Game.get_dapai(this._rule, shoupai);
    }
    get_chi_mianzi(shoupai, p) {
        return Majiang.Game.get_chi_mianzi(this._rule, shoupai, p,
                                           this.shan.paishu);
    }
    get_peng_mianzi(shoupai, p) {
        return Majiang.Game.get_peng_mianzi(this._rule, shoupai, p,
                                            this.shan.paishu);
    }
    get_gang_mianzi(shoupai, p) {
        return Majiang.Game.get_gang_mianzi(this._rule, shoupai, p,
                                            this.shan.paishu, this._n_gang);
    }
    allow_lizhi(shoupai, p) {
        return Majiang.Game.allow_lizhi(this._rule, shoupai, p,
                                        this.shan.paishu,
                                        this._model.defen[this._id]);
    }
    allow_hule(shoupai, p, hupai) {
        hupai = hupai || shoupai.lizhi || this.shan.paishu == 0;
        let shoupaiStr = shoupai.toString();
        let xiangtingVal = Majiang.Util.xiangting(shoupai);
        let result = Majiang.Game.allow_hule(this._rule, shoupai, p,
                                       this._model.zhuangfeng, this._menfeng,
                                       hupai, this._neng_rong);
        /* 静态检查失败 → 走 game 实例的扩展器（huleExpander，自摸+荣和） */
        if (!result && this._game && this._game.skillManager) {
            if (p == null) {
                result = this._game.allow_hule(null);
            } else {
                result = this._game.allow_hule(this._menfeng);
            }
        }
        console.log('[debug] Player.allow_hule: hand=' + shoupaiStr
            + ' p=' + p + ' hupai=' + hupai + ' neng_rong=' + this._neng_rong
            + ' xiangting=' + xiangtingVal + ' result=' + result);
        return result;
    }
    allow_pingju(shoupai) {
        return Majiang.Game.allow_pingju(this._rule, shoupai,
                                         this._diyizimo);
    }
    allow_no_daopai(shoupai) {
        return Majiang.Game.allow_no_daopai(this._rule, shoupai,
                                            this.shan.paishu);
    }
}
