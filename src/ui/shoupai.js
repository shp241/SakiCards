/*
 *  Majiang.UI.Shoupai
 */
"use strict";

const $ = require('jquery');

const mianzi = require('./mianzi');

module.exports = class Shoupai {

    constructor(root, pai, shoupai, open) {

        this._node = {
            root:    root,
            bingpai: $('.bingpai', root),
            fulou:   $('.fulou',   root)
        };
        this._pai     = pai;
        this._mianzi  = mianzi(pai);
        this._shoupai = shoupai;
        this._open    = open;
    }

    redraw(open) {

        if (open != null) this._open = open;

        this._node.bingpai.attr('aria-label', '手牌');
        this._node.bingpai.empty();
        let zimo   = this._shoupai._zimo;
        let bingpai = this._shoupai._bingpai;
        let marked = this._shoupai._markedTiles;
        let hidden = this._shoupai._hiddenTiles;
        let locked = this._shoupai._lockedTiles;
        let hiddenRem = new Map(hidden);
        let lockedRem = new Map(locked);
        let markedRem = new Map(marked);

        /* 构建手牌牌张列表（按花色/点数排序，不含自摸牌） */
        let tiles = [];
        for (let s of ['m','p','s','z']) {
            let bp = bingpai[s];
            let n_hongpai = bp[0];
            for (let n = 1; n < bp.length; n++) {
                let n_pai = bp[n];
                if      (s+n == zimo)           { n_pai--              }
                else if (n == 5 && s+0 == zimo) { n_pai--; n_hongpai-- }
                for (let i = 0; i < n_pai; i++) {
                    tiles.push((n == 5 && n_hongpai > i) ? s+0 : s+n);
                }
            }
        }
        for (let i = 0; i < (bingpai._ + (zimo == '_' ? -1 : 0)); i++) {
            tiles.push('_');
        }

        if (! this._open) {
            /* 对手视角 */
            if (marked.size > 0) {
                /* 有标记牌：按 count 取前 N 张明牌 */
                let remainingCounts = new Map(marked);
                let markedEls = [];
                let unmarkedEls = [];
                tiles.forEach(p => {
                    if (p == '_') { unmarkedEls.push(this._pai('_')); return; }
                    let c = remainingCounts.get(p);
                    if (c && c > 0) {
                        markedEls.push(this._pai(p));
                        if (c <= 1) remainingCounts.delete(p);
                        else        remainingCounts.set(p, c - 1);
                    } else {
                        unmarkedEls.push(this._pai('_'));
                    }
                });
                if (markedEls.length > 0) {
                    let mc = $('<span class="marked-tiles">');
                    markedEls.forEach(el => mc.append(el));
                    this._node.bingpai.append(mc);
                }
                unmarkedEls.forEach(el => this._node.bingpai.append(el));
            }
            else {
                /* 无标记牌：全部暗牌 */
                tiles.forEach(p => this._node.bingpai.append(this._pai('_')));
            }
        }
        else {
            /* 自家视角：按 hidden > marked > locked 优先级分组 */
            hiddenRem = new Map(hidden);
            lockedRem = new Map(locked);
            markedRem = new Map(marked);
            let hiddenEls = [];
            let normalEls = [];
            let lockedEls = [];

            tiles.forEach(p => {
                if (p == '_') { normalEls.push(this._pai('_')); return; }
                /* 优先判断隐藏牌 */
                let hc = hiddenRem.get(p);
                if (hc && hc > 0) {
                    if (hc <= 1) hiddenRem.delete(p);
                    else         hiddenRem.set(p, hc - 1);
                    hiddenEls.push(this._pai('_'));  /* 以背面形式展示 */
                } else {
                    /* 再判断锁定牌 */
                    let lc = lockedRem.get(p);
                    if (lc && lc > 0) {
                        if (lc <= 1) lockedRem.delete(p);
                        else         lockedRem.set(p, lc - 1);
                        let el = this._pai(p);
                        el.addClass('locked');
                        lockedEls.push(el);
                    } else {
                        /* 普通牌或标记牌 */
                        let el = this._pai(p);
                        let mc = markedRem.get(p);
                        if (mc && mc > 0) {
                            el.addClass('marked').attr('data-marked', '1');
                            if (mc <= 1) markedRem.delete(p);
                            else         markedRem.set(p, mc - 1);
                        }
                        normalEls.push(el);
                    }
                }
            });

            /* 渲染顺序：隐藏牌 → 普通牌/标记牌 → 锁定牌 */
            hiddenEls.forEach(el => this._node.bingpai.append(el));
            normalEls.forEach(el => this._node.bingpai.append(el));
            lockedEls.forEach(el => this._node.bingpai.append(el));
        }

        /* 自摸牌在最右侧，被标记的摸牌对对手也明牌 */
        if (zimo && zimo.length <= 2) {
            let c = markedRem.get(zimo);
            let zimomarked = !!(c && c > 0);
            let zimohidden = hiddenRem.has(zimo) && (hiddenRem.get(zimo) || 0) > 0;
            let zimolocked = lockedRem.has(zimo) && (lockedRem.get(zimo) || 0) > 0;
            /* 隐藏覆盖明置 */
            let showFace = this._open && !zimohidden || zimomarked;
            let zimoEl = this._pai(showFace ? zimo : '_');
            if (this._open && zimomarked && !zimohidden) zimoEl.addClass('marked');
            if (this._open && zimolocked)                zimoEl.addClass('locked');
            this._node.bingpai.append(
                    $('<span class="zimo">').append(zimoEl));
        }

        /* 副露（含元数据） */
        this._node.fulou.empty();
        for (let i = 0; i < this._shoupai._fulou.length; i++) {
            this._node.fulou.append(
                this._mianzi(this._shoupai._fulou[i],
                             this._shoupai._fulouMeta[i]));
        }

        return this;
    }

    adjust() {
        let shoupai = this._node.root.width();
        let bingpai = this._node.bingpai.width();
        let fulou   = this._node.fulou.width();
        if (fulou < shoupai) {
            let overflow = bingpai + fulou - shoupai;
            if (overflow > 0)
                    this._node.bingpai.css('margin-left', `${- overflow}px`);
            else    this._node.bingpai.css('margin-left', '');
        }
        else {
            this._node.bingpai.css('margin-left', '');
        }
        return this;
    }

    dapai(p) {

        let dapai = $('.pai.dapai', this._node.bingpai);
        if (! dapai.length) {
            if (p[2] == '_') dapai = $('.zimo .pai', this._node.bingpai);
        }
        if (! dapai.length) {
            if (this._open) {
                dapai = $(`.pai[data-pai="${p.slice(0,2)}"]`,
                          this._node.bingpai).eq(0);
            }
            else {
                dapai = $('.pai', this._node.bingpai);
                dapai = dapai.eq(Math.random()*(dapai.length-1)|0);
            }
        }
        dapai.addClass('deleted');

        return this;
    }
}
