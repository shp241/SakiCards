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

        if (! this._open && marked.size > 0) {
            /* 对手视角：标记牌（明牌，左侧）→ 剩余牌（暗牌，右侧） */
            let markedTiles = tiles.filter(p => p != '_' && marked.has(p));
            let unmarked    = tiles.filter(p => p == '_' || ! marked.has(p));
            if (markedTiles.length > 0) {
                let mc = $('<span class="marked-tiles">');
                markedTiles.forEach(p => mc.append(this._pai(p)));
                this._node.bingpai.append(mc);
            }
            unmarked.forEach(p => this._node.bingpai.append(this._pai('_')));
        }
        else {
            /* 自家视角：所有牌正面，被标记牌加 marked 类 */
            tiles.forEach(p => {
                let el = this._pai(p == '_' ? '_' : p);
                if (p != '_' && marked.has(p)) el.addClass('marked');
                this._node.bingpai.append(el);
            });
        }

        /* 自摸牌在最右侧 */
        if (zimo && zimo.length <= 2) {
            let zimoEl = this._pai(this._open ? zimo : '_');
            if (this._open && marked.has(zimo)) zimoEl.addClass('marked');
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
