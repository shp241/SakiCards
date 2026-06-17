/*
 *  Majiang.UI.mianzi
 */
"use strict";

const $ = require('jquery');

const fulouTypeLabel = {
    chi:    '順子',
    pon:    '刻子',
    minkan: '大明槓',
    kakan:  '加槓',
    ankan:  '暗槓',
};

const FROM_SEAT_LABEL = ['シモチャから', 'トイメンから', 'カミチャから'];

module.exports = function(pai) {

    return function(m, meta) {

        let mianzi = $('<span class="mianzi">');

        /* 尝试从 meta 获取数据 */
        let type     = meta && meta.type;
        let tiles    = meta && meta.tiles;
        let fromSeat = meta && meta.fromSeat;
        let calledIdx = meta && meta.calledTileIndex;

        /* 设置 data 属性 */
        if (type) {
            mianzi.attr('data-fulou-type', type);
            mianzi.attr('aria-label', fulouTypeLabel[type] || '');
        }
        if (tiles) {
            mianzi.attr('data-fulou-tiles', tiles.join(','));
        }

        /* ── 无 meta → 回退旧正则逻辑 ── */
        if (!type) {
            let s = m[0];

            if (m.replace(/0/g,'5').match(/^[mpsz](\d)\1\1\1$/)) {
                let nn = m.match(/\d/g);
                if (!fulouType) mianzi.attr('aria-label','アンカン');
                mianzi.append(pai('_'))
                      .append(pai(s+nn[2]))
                      .append(pai(s+nn[3]))
                      .append(pai('_'));
            }
            else if (m.replace(/0/g,'5').match(/^[mpsz](\d)\1\1/)) {
                let jiagang = m.match(/[\+\=\-]\d$/);
                let d       = m.match(/[\+\=\-]/);
                let nn      = m.match(/\d/g);
                let pai_s   = pai(s+nn[0]);
                let pai_r   = $('<span class="rotate">')
                                .append(jiagang ? nn.slice(-2).map(n=>pai(s+n))
                                                : nn.slice(-1).map(n=>pai(s+n)));
                let pai_l   = (! jiagang && nn.length == 4)
                                                ? nn.slice(1, 3).map(n=>pai(s+n))
                                                : nn.slice(1, 2).map(n=>pai(s+n));
                if (!fulouType) {
                    let label = (  d == '+' ? 'シモチャから'
                                   : d == '=' ? 'トイメンから'
                                   :            'カミチャから' )
                                + (  jiagang        ? 'カカン'
                                   : nn.length == 4 ? 'カン'
                                   :                  'ポン' );
                    mianzi.attr('aria-label', label);
                }
                if (d == '+') mianzi.append(pai_s).append(pai_l).append(pai_r);
                if (d == '=') mianzi.append(pai_s).append(pai_r).append(pai_l);
                if (d == '-') mianzi.append(pai_r).append(pai_s).append(pai_l);
            }
            else {
                let nn = m.match(/\d(?=\-)/).concat(m.match(/\d(?!\-)/g));
                if (!fulouType) mianzi.attr('aria-label','チー');
                mianzi.append($('<span class="rotate">')
                                .append(pai(s+nn[0])))
                      .append(pai(s+nn [1]))
                      .append(pai(s+nn [2]));
            }
            return mianzi;
        }

        /* ── 有 meta → meta 驱动渲染 ── */

        if (type === 'ankan') {
            mianzi.append(pai('_'))
                  .append(pai(tiles[1]))
                  .append(pai(tiles[2]))
                  .append(pai('_'));
        }
        else if (type === 'chi') {
            let called = tiles[calledIdx];
            let others = tiles.filter((_,i) => i !== calledIdx);
            mianzi.append($('<span class="rotate">').append(pai(called)))
                  .append(pai(others[0]))
                  .append(pai(others[1]));
        }
        else {
            /* pon / minkan / kakan */
            let isJiagang = type === 'kakan';
            let isMinkan  = type === 'minkan';

            let pai_s = pai(tiles[calledIdx]);
            let otherTiles = tiles.filter((_,i) => i !== calledIdx);

            let lTiles, rTiles;
            if (isJiagang) {
                lTiles = otherTiles.slice(0, 1);
                rTiles = otherTiles.slice(1, 3);
            } else if (isMinkan) {
                lTiles = otherTiles.slice(0, 2);
                rTiles = otherTiles.slice(2, 3);
            } else {
                /* pon */
                lTiles = otherTiles.slice(0, 1);
                rTiles = otherTiles.slice(1, 2);
            }

            let pai_l = lTiles.map(t => pai(t));
            let pai_r = $('<span class="rotate">').append(rTiles.map(t => pai(t)));

            if (fromSeat === 0) mianzi.append(pai_s).append(pai_l).append(pai_r);
            if (fromSeat === 1) mianzi.append(pai_s).append(pai_r).append(pai_l);
            if (fromSeat === 2) mianzi.append(pai_r).append(pai_s).append(pai_l);
        }

        return mianzi;
    }
}
