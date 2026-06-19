/*
 *  Majiang.UI.Player
 */
"use strict";

const $ = require('jquery');
const Majiang = require('@kobalab/majiang-core');

const { hide, show, fadeIn }         = require('./fadein');
const { setSelector, clearSelector } = require('./selector');

const mianzi = require('./mianzi');
const meldParser = require('../core/meld-parser.js');

/** 面子上报数组去重 */
function uniqueMianzi(arr) {
    let seen = {};
    return arr.filter(m => {
        let key = typeof m === 'string' ? m : JSON.stringify(m);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

module.exports = class Player extends Majiang.Player {

    constructor(root, pai, audio) {
        super();
        this._node = {
            root:   root,
            timer:  $('.timer', root),
            button: $('.player-button', root),
            mianzi: $('.select-mianzi', root),
            dapai:  $('.shoupai.main .bingpai', root),
        };
        this._mianzi = mianzi(pai);

        this.sound_on = true;
        this._audio   = { beep: audio('beep') };

        this.clear_handler();
    }

    clear_handler() {
        this.clear_button();
        this.clear_mianzi();
        this.clear_dapai();
        clearSelector('kaiju');
        clearSelector('dialog');
        clearSelector('summary');
    }

    callback(reply) {
        console.log('[debug] callback called: reply=', JSON.stringify(reply));
        this.clear_timer();
        this.clear_handler();
        this._callback(reply);
        return false;
    }

    set_button(type, callback) {
        show($(`.${type}`, this._node.button)
                .attr('tabindex', 0)
                .on('click.button', callback));
        this._show_button = true;
    }

    show_button(callback = ()=>{}, options = {}) {
        this.show_timer();
        if (! this._show_button) return callback();
        const handler = ()=>{ this.clear_button(); callback() };

        /* X 按钮（cancelable 默认 true） */
        if (options.cancelable !== false) {
            this.set_button('cansel', handler);
        }

        /* 点击按钮外部关闭（默认关闭，需显式开启） */
        if (options.closeOnOutsideClick) {
            this._node.root.on('click.button', handler);
        }

        let dapaiWidth = $(this._node.dapai).width();
        show(this._node.button.width(dapaiWidth));
        setSelector($('.button[tabindex]', this._node.button),
                    'button', {focus: -1, touch: false});
    }

    clear_button() {
        hide($('.button', this._node.button));
        clearSelector('button');
        hide(this._node.button);
        this._node.root.off('.button');
        this._show_button = false;
    }

    select_mianzi(mianzi) {
        this.clear_button();
        this._node.mianzi.empty();
        for (let m of mianzi) {
            let meta = meldParser.parseMianzi(m);
            let isGang = meta && (meta.type === 'ankan'
                               || meta.type === 'minkan'
                               || meta.type === 'kakan');
            let msg = isGang ? {gang: m} : {fulou: m};
            if (! this._default_reply) this._default_reply = msg;
            this._node.mianzi.append(
                    this._mianzi(m, meta)
                        .on('click.mianzi',()=>this.callback(msg)));
        }
        show(this._node.mianzi.width($(this._node.dapai).width()));
        setSelector($('.mianzi', this._node.mianzi), 'mianzi',
                    {touch: false, focus: null});
        return false;
    }

    clear_mianzi() {
        setTimeout(()=>hide(this._node.mianzi), 400);
        clearSelector('mianzi');
    }

    select_dapai(lizhi) {

        if (lizhi) this._default_reply = { dapai: lizhi[0] + '*' };

        let dapai_list = lizhi || this.get_dapai(this.shoupai);
        console.log('[debug] select_dapai: dapai_list=', JSON.stringify(dapai_list), '_node.dapai.length=', this._node.dapai.length);
        for (let p of dapai_list) {
            let pai = $(p.slice(-1) == '_'
                            ? `.zimo .pai[data-pai="${p.slice(0,2)}"]`
                            : `> .pai[data-pai="${p}"]`,
                        this._node.dapai);
            if (lizhi) {
                pai.addClass('blink');
                p += '*';
            }
            pai.attr('tabindex', 0).attr('role','button')
                .on('click.dapai', (ev)=>{
                    /* 锁定牌不可打出 */
                    if ($(ev.target).hasClass('locked')) return;
                    $(ev.target).addClass('dapai');
                    let isMarked = !!$(ev.target).attr('data-marked');
                    this.callback({dapai: p, discardMarked: isMarked});
                });
        }

        setSelector($('.pai[tabindex]', this._node.dapai),
                    'dapai', {focus: -1});
    }

    clear_dapai() {
        $('.pai', this._node.dapai).removeClass('blink');
        clearSelector('dapai');
    }

    set_timer(limit, allowed = 0, audio) {

        delete this._default_reply;

        let time_limit = Date.now() + (limit + allowed) * 1000;

        if (this._timer_id) clearInterval(this._timer_id);
        this._timer_id = setInterval(()=>{
            if (time_limit <= Date.now()) {
                this.callback(this._default_reply);
                return;
            }
            let time = Math.ceil((time_limit - Date.now()) / 1000);
            if (time <= limit || time <= allowed) {
                if (time != this._node.timer.text()) {
                    if (this.sound_on && audio && time <= 5) {
                        audio.currentTime = 0;
                        audio.play();
                    }
                    this._node.timer.text(time);
                }
            }
        }, 200);
    }

    show_timer() {
        show(this._node.timer.width($(this._node.dapai).width() + 20));
    }

    clear_timer() {
        this._timer_id = clearInterval(this._timer_id);
        hide(this._node.timer.text(''));
    }

    action(msg, callback) {
        let limit, allowed;
        if (msg.timer) [ limit, allowed ] = msg.timer;
        let audio = ! (msg.kaiju || msg.hule || msg.pingju) && this._audio.beep;
        if (limit) this.set_timer(limit, allowed, audio);

        super.action(msg, callback);
    }

    action_kaiju(kaiju) {
        if (! this._view) this.callback();
        $('.kaiju', this._node.root).off('click')
                                    .on('click.kaiju', ()=>this.callback());
        setTimeout(()=>{
            setSelector($('.kaiju', this._node.root), 'kaiju',
                        { touch: false });
        }, 800);
    }

    action_qipai(qipai) { this.callback() }

    action_zimo(zimo, gangzimo) {
        if (zimo.l != this._menfeng) return this.callback();

        console.log('[debug] action_zimo: zimo.p=' + zimo.p + ' menfeng=' + this._menfeng);
        console.log('[debug] action_zimo: hand=' + this.shoupai.toString() + ' paishu=' + this.shan.paishu);
        console.log('[debug] action_zimo: canHule=' + !!zimo.canHule + ' gangzimo=' + !!gangzimo);

        let canHule = this.allow_hule(this.shoupai, null, gangzimo);
        console.log('[debug] action_zimo: allow_hule result=' + canHule + ' lizhi=' + !!this.shoupai.lizhi + ' neng_rong=' + this._neng_rong);

        if (canHule) {
            this.set_button('zimo', ()=>this.callback({hule: '-'}));
        }
        /* huleExpander：客户端不感知扩展器，由服务端预检标志位决定 */
        else if (zimo.canHule) {
            this.set_button('zimo', ()=>this.callback({hule: '-'}));
        }

        if (this.allow_pingju(this.shoupai)) {
            this.set_button('pingju', ()=>this.callback({daopai: '-'}));
        }

        let gang_mianzi = this.get_gang_mianzi(this.shoupai) || [];
        if (gang_mianzi.length == 1) {
            this.set_button('gang', ()=>this.callback({gang: gang_mianzi[0]}));
        }
        else if (gang_mianzi.length > 1) {
            this.set_button('gang', ()=>this.select_mianzi(gang_mianzi));
        }

        /* 通用：BEFORE_DISCARD 可选技能按钮 */
        if (zimo.skillActions && zimo.skillActions.length > 0) {
            let btnContainer = $(this._node.button);
            for (let action of zimo.skillActions) {
                let btnClass = 'skill_' + action.skillId;
                if (!btnContainer.find('.' + btnClass).length) {
                    btnContainer.append(
                        $('<span>').addClass('button ' + btnClass)
                            .text(action.label)
                    );
                }
                this.set_button(btnClass,
                    (() => this.callback({skillAction: action.skillId})));
            }
        }

        if (this.shoupai.lizhi) {
            this.show_button(()=>this.callback({dapai: zimo.p + '_'}), { closeOnOutsideClick: true });
            return;
        }

        let lizhi_dapai = this.allow_lizhi(this.shoupai);
        if (lizhi_dapai.length) {
            this.set_button('lizhi', ()=>{
                this.clear_handler();
                this.select_dapai(lizhi_dapai);
            });
        }

        if (this._show_button) {
            this.show_button(()=>this.select_dapai(), { cancelable: false });
        }
        this.select_dapai();
    }

    action_dapai(dapai) {

        let isLiuju = this.allow_no_daopai(this.shoupai);
        if (isLiuju) {
            this.set_button('tingpai', ()=>this.callback());
            this.set_button('daopai', ()=>this.callback({daopai: '-'}));
        }

        if (dapai.l == this._menfeng) {

            if (! this._show_button) return this.callback();

            if (!isLiuju) {
                setTimeout(()=>{
                    this.show_button(()=>this.callback({daopai: '-'}), { closeOnOutsideClick: true })
                }, 500);
            }
            return;
        }

        /* 暗切牌不可见，无法荣和或副露 */
        if (!dapai.p) {
            this.show_button(()=>this.callback());
            return;
        }

        let d = ['','+','=','-'][(4 + this._model.lunban - this._menfeng) % 4];
        let p = dapai.p + d;

        console.log('[debug] action_dapai: hand=' + this.shoupai.toString() + ' opponent_discard=' + p + ' paishu=' + this.shan.paishu);

        if (this.allow_hule(this.shoupai, p) || dapai.canHule) {
            this.set_button('rong', ()=>this.callback({hule: '-'}));
        }

        let gang_mianzi = this.get_gang_mianzi(this.shoupai, p) || [];
        /* 合并服务端预检的扩展器杠牌面 */
        if (dapai.gangMianzi && dapai.gangMianzi.length > 0) {
            gang_mianzi = uniqueMianzi(gang_mianzi.concat(dapai.gangMianzi));
        }
        if (gang_mianzi.length == 1) {
            this.set_button('gang', ()=>this.callback({fulou: gang_mianzi[0]}));
        }

        let peng_mianzi = this.get_peng_mianzi(this.shoupai, p) || [];
        if (dapai.pengMianzi && dapai.pengMianzi.length > 0) {
            peng_mianzi = uniqueMianzi(peng_mianzi.concat(dapai.pengMianzi));
        }
        if (peng_mianzi.length == 1) {
            this.set_button('peng', ()=>this.callback({fulou: peng_mianzi[0]}));
        }
        else if (peng_mianzi.length > 1) {
            this.set_button('peng', ()=>this.select_mianzi(peng_mianzi));
        }

        let chi_mianzi = this.get_chi_mianzi(this.shoupai, p) || [];
        if (dapai.chiMianzi && dapai.chiMianzi.length > 0) {
            chi_mianzi = uniqueMianzi(chi_mianzi.concat(dapai.chiMianzi));
        }
        if (chi_mianzi.length == 1) {
            this.set_button('chi', ()=>this.callback({fulou: chi_mianzi[0]}));
        }
        else if (chi_mianzi.length > 1) {
            this.set_button('chi', ()=>this.select_mianzi(chi_mianzi));
        }

        this.show_button(()=>{
            if (this._model.shan.paishu == 0
                && Majiang.Util.xiangting(this.shoupai) == 0)
                    this.callback({daopai: '-'});
            else    this.callback();
        });
    }

    action_fulou(fulou) {
        if (fulou.l != this._menfeng) return this.callback();
        if (meldParser.parseMianzi(fulou.m)?.type === 'kakan') return this.callback();

        /* 通用：BEFORE_DISCARD 可选技能按钮（副露后舍牌前） */
        if (fulou.skillActions && fulou.skillActions.length > 0) {
            let btnContainer = $(this._node.button);
            for (let action of fulou.skillActions) {
                let btnClass = 'skill_' + action.skillId;
                if (!btnContainer.find('.' + btnClass).length) {
                    btnContainer.append(
                        $('<span>').addClass('button ' + btnClass)
                            .text(action.label)
                    );
                }
                this.set_button(btnClass,
                    (() => this.callback({skillAction: action.skillId})));
            }
        }

        this.show_button(()=>this.select_dapai(), { closeOnOutsideClick: true });
    }

    action_gang(gang) {
        if (gang.l == this._menfeng) return this.callback();
        if (meldParser.parseMianzi(gang.m)?.type === 'ankan') return this.callback();

        let d = ['','+','=','-'][(4 + this._model.lunban - this._menfeng) % 4];
        let p = gang.m[0] + gang.m.slice(-1) + d;

        if (this.allow_hule(this.shoupai, p, true)) {
            this.set_button('rong', ()=>this.callback({hule: '-'}));
        }

        this.show_button(()=>this.callback(), { closeOnOutsideClick: true });
    }

    action_hule() {
        $('.hule-dialog', this._node.root).off('click')
                                    .on('click.dialog', ()=>this.callback());
        setTimeout(()=>{
            setSelector($('.hule-dialog', this._node.root), 'dialog',
                        { touch: false });
        }, 800);
    }

    action_pingju() {
        this.action_hule();
    }

    action_jieju(jieju) {
        $('.summary', this._node.root).off('click')
                                    .on('click.summary', ()=>this.callback());
        setTimeout(()=>{
            setSelector($('.summary', this._node.root), 'summary',
                        { touch: false });
        }, 800);
    }
}
