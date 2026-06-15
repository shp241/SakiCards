/*
 *  Majiang.UI.ShanViewer — 牌山方框窗口
 *
 *  参照手牌渲染方式，每墩一枚牌：
 *    - 满墩 → 牌背
 *    - 上半摸走 → 牌背 + 暗色覆盖（只剩半墩）
 *    - 空墩 → 空白位
 *    - 王牌已翻宝牌 → 牌面
 *    - 四边按方向旋转
 */
"use strict";

const $ = require('jquery');

module.exports = class ShanViewer {

    constructor(pai) {
        this._pai = pai;
    }

    show(shan) {
        if (!shan || !shan._stacks) return;
        if (!this._pai) return;

        $('.shan-viewer-overlay').remove();

        let overlay = $('<div>').addClass('shan-viewer-overlay');
        let modal   = $('<div>').addClass('shan-viewer-modal');

        /* 关闭 */
        $('<button>').addClass('shan-viewer-close').html('&times;')
            .on('click', () => this.hide()).appendTo(modal);

        /* 标题（含剩余张数） */
        $('<div>').addClass('shan-viewer-title')
            .text(`牌山（剩余 ${shan.paishu} 枚）`).appendTo(modal);

        /* 方框 */
        let wall = $('<div>').addClass('shan-wall');
        let is_landscape = $(window).height() < 500;
        if (is_landscape) {
            this._build_landscape_wall(wall, shan);
        } else {
            this._build_wall(wall, shan);
        }
        modal.append(wall);

        /* 图例：横屏下放在中间区域内部，这里只对竖屏追加 */
        if (!is_landscape) {
            let leg = $('<div>').addClass('shan-viewer-legend');
            leg.append($('<span>').addClass('leg-mark dw').text('王牌'));
            leg.append($('<span>').addClass('leg-mark cur').text('摸牌位'));
            leg.append($('<span>').addClass('leg-mark').text('暗色=半墩'));
            modal.append(leg);
        }

        /* 点遮罩关闭 */
        overlay.on('click', e => { if (e.target === overlay[0]) this.hide(); });
        overlay.append(modal);
        $(document.body).append(overlay);
    }

    hide() {
        $('.shan-viewer-overlay').remove();
    }

    /* ── 构建方框四边 ── */
    _build_wall(wall, shan) {
        let n = shan._stacks.length;
        let s0 = 0;
        let s1 = Math.floor(n / 4);
        let s2 = Math.floor(n / 2);
        let s3 = Math.floor(n * 3 / 4);

        this._build_side(wall, 'top',    shan,  s0,      s1,       1);
        this._build_side(wall, 'right',  shan,  s1,      s2,       1);
        this._build_side(wall, 'bottom', shan,  s3 - 1,  s2 - 1,  -1);
        this._build_side(wall, 'left',   shan,  n - 1,   s3 - 1,  -1);
    }

    /* ── 构建一边 ── */
    _build_side(wall, cls, shan, start, end, step) {
        let side = $('<div>').addClass('shan-side side-' + cls);
        let dw_start = shan._haitei;

        for (let i = start; step > 0 ? i < end : i > end; i += step) {
            let stack  = shan._stacks[i];
            let cell   = $('<div>').addClass('shan-cell');

            /* 墩状态 */
            let has_top  = stack.top != null;
            let has_bot  = stack.bottom != null;

            if (!has_top && !has_bot) {
                cell.addClass('empty');
            } else if (has_top && has_bot) {
                /* 满墩 */
            } else {
                /* 只有下层（上层已摸走） */
                cell.addClass('half');
            }

            /* 王牌 */
            let dw_idx = -1;
            let total = shan._stacks.length;
            let dw_count = shan._dw_count;
            for (let d = 0; d < dw_count; d++) {
                if (i === (dw_start + d) % total) { dw_idx = d; break; }
            }
            if (dw_idx >= 0) cell.addClass('dead-wall');

            /* 游标 */
            if (i === shan._cursor) {
                cell.addClass(shan._half_consumed ? 'cursor-half' : 'cursor-full');
            }

            /* 牌内容 */
            if (has_top) {
                let tile = this._tile_for_dora(shan, dw_idx);
                cell.append(this._pai(tile));
            } else if (has_bot) {
                /* 上层已摸，只剩下层（下层变为上层位置） */
                let tile = this._tile_for_dora(shan, dw_idx, true);
                cell.append(this._pai(tile));
            }

            side.append(cell);
        }

        wall.append(side);
    }

    /* ── 牌面 or 牌背 ── */
    _tile_for_dora(shan, dw_idx, half) {
        let rep = shan._dw_count - 7;
        if (dw_idx < 0) return '_';               /* 非王牌 */
        if (dw_idx < rep) return '_';             /* 补充墩，非宝牌 */
        let adj = dw_idx - rep;
        if (adj >= 5) return '_';                 /* 岭上牌始终背面 */

        /* adj: 0(宝5) 1(宝4) 2(宝3) 3(宝2) 4(宝1) */
        let need = 4 - adj + 1;                   /* 宝1→1 … 宝5→5 */
        if (shan._dora_flipped >= need) {
            let bpidx = 4 - adj;                  /* baopai[0]=宝1 … baopai[4]=宝5 */
            return shan._baopai[bpidx] || '_';
        }
        return '_';
    }

    /* ── 横屏围圈布局：标准四边 + 信息放右侧 ── */
    _build_landscape_wall(wall, shan) {
        wall.addClass('landscape-layout');
        /* 牌山圈 */
        let frame = $('<div>').addClass('shan-land-frame');
        let grid  = $('<div>').addClass('shan-wall');
        this._build_wall(grid, shan);
        frame.append(grid);
        wall.append(frame);

        /* 右侧信息 */
        let info = $('<div>').addClass('shan-land-info');
        $('<div>').addClass('shan-land-count')
            .text(`剩余 ${shan.paishu} 枚`).appendTo(info);
        let leg = $('<div>').addClass('shan-viewer-legend');
        leg.append($('<span>').addClass('leg-mark dw').text('王牌'));
        leg.append($('<span>').addClass('leg-mark cur').text('摸牌位'));
        leg.append($('<span>').addClass('leg-mark').text('暗色=半墩'));
        info.append(leg);
        wall.append(info);
    }
};
