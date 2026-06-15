/*
 *  Majiang.UI.He
 */
"use strict";

const $ = require('jquery');

module.exports = class He {

    constructor(root, pai, he, open) {

        this._node = {
            root:   root,
            chouma: $('.chouma', root),
            dapai:  $('.dapai',  root)
        };
        this._pai  = pai;
        this._he   = he;
        this._open = open;
        this._node.chouma.addClass('hide');
    }

    redraw(open) {

        if (open != null) this._open = open;

        this._node.root.attr('aria-label', '捨て牌');
        this._node.chouma.attr('aria-label', 'リーチ');
        this._node.dapai.empty();
        let lizhi = false;
        let visIdx = 0;
        for (let i = 0; i < this._he._pai.length; i++) {
            let p = this._he._pai[i];
            if (p.match(/\*/)) {
                lizhi = true;
                this._node.chouma.removeClass('hide');
            }
            if (p.match(/[\+\=\-]/)) continue;

            let pai;
            if (this._he._hidden && this._he._hidden[i]) {
                /* 暗牌：渲染为牌背，但仍保留真实牌数据供程序读取 */
                pai = this._pai('_').attr('data-pai', p).attr('data-index', i);
            } else {
                pai = this._pai(p).attr('data-index', i);
                if (this._open && p[2] == '_') {
                    pai.addClass('mopai');
                }
            }
            if (lizhi) {
                pai = $('<span class="lizhi">').attr('aria-label', 'リーチ')
                                               .append(pai);
                lizhi = false;
            }
            this._node.dapai.append(pai);

            visIdx++;
            if (visIdx < 6 * 3 && visIdx % 6 == 0) {
                this._node.dapai.append($('<span class="break">'));
            }
        }
        return this;
    }

    dapai(p, hidden = false) {

        let pai;
        if (hidden) {
            pai = this._pai('_').addClass('dapai').attr('aria-live','assertive')
                               .attr('data-pai', p);
        } else {
            pai = this._pai(p).addClass('dapai').attr('aria-live','assertive');
            if (p[2] == '_') pai.addClass('mopai');
        }
        if (p.match(/\*/)) pai = $('<span class="lizhi">').append(pai);
        pai.attr('data-index', this._he._pai.length - 1);
        this._node.dapai.append(pai);
        return this;
    }
}
