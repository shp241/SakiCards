/*
 *  Majiang.UI.InfoPanel — 信息面板（牌山 + 牌局日志切换）
 */
"use strict";

const $ = require('jquery');

module.exports = class InfoPanel {

    constructor(pai) {
        this._pai = pai;
        this._currentTab = 0; // 0=牌山, 1=日志
        this._tabs = ['牌山', '牌局日志'];
    }

    show(model, paipu, wallSnapshot, actionLog) {
        if (!model) return;

        this._model = model;
        this._paipu = paipu;
        this._wallSnapshot = wallSnapshot;
        this._actionLog = actionLog;

        $('.info-panel-overlay').remove();

        let overlay = $('<div>').addClass('info-panel-overlay');
        let modal   = $('<div>').addClass('info-panel-modal');

        /* 头部：左右箭头 + 标题 + 关闭 */
        let header = $('<div>').addClass('info-panel-header');
        let prevBtn = $('<button>').addClass('info-panel-nav info-panel-prev').html('&#9664;')
            .on('click', () => this._switchTab(-1));
        let nextBtn = $('<button>').addClass('info-panel-nav info-panel-next').html('&#9654;')
            .on('click', () => this._switchTab(1));
        let title = $('<span>').addClass('info-panel-tab-title')
            .text(this._tabs[this._currentTab]);
        let closeBtn = $('<button>').addClass('info-panel-close').html('&times;')
            .on('click', () => this.hide());

        header.append(prevBtn, title, nextBtn, closeBtn);
        modal.append(header);

        /* 内容区域 */
        this._content = $('<div>').addClass('info-panel-content');
        modal.append(this._content);

        /* 渲染当前 tab */
        this._render();

        /* 遮罩点击关闭 */
        overlay.on('click', e => { if (e.target === overlay[0]) this.hide(); });
        overlay.append(modal);
        $(document.body).append(overlay);
    }

    hide() {
        $('.info-panel-overlay').remove();
    }

    _switchTab(dir) {
        this._currentTab = (this._currentTab + dir + this._tabs.length) % this._tabs.length;
        $('.info-panel-tab-title').text(this._tabs[this._currentTab]);
        this._render();
    }

    _render() {
        this._content.empty();
        if (this._currentTab === 0) {
            this._renderWall();
        } else {
            this._renderLog();
        }
    }

    /* ── 牌山视图 ── */
    _renderWall() {
        let shan = this._model.shan;
        if (!shan) return;

        /* 优先使用服务端推送的脱敏快照（联机模式） */
        if (this._wallSnapshot && this._wallSnapshot.stacks) {
            this._renderFromSnapshot(this._wallSnapshot);
            return;
        }

        /* 单机模式：完整 Shan 对象，包含 _stacks */
        if (shan._stacks) {
            /* 标题 */
            $('<div>').addClass('info-panel-subtitle')
                .text(`剩余 ${shan.paishu} 枚`).appendTo(this._content);

            let wall = $('<div>').addClass('shan-wall');
            let is_landscape = $(window).height() < 500;
            if (is_landscape) {
                this._build_landscape_wall(wall, shan);
            } else {
                this._build_wall(wall, shan);
            }
            this._content.append(wall);

            if (!is_landscape) {
                let leg = $('<div>').addClass('shan-viewer-legend');
                leg.append($('<span>').addClass('leg-mark dw').text('王牌'));
                leg.append($('<span>').addClass('leg-mark cur').text('摸牌位'));
                leg.append($('<span>').addClass('leg-mark').text('暗色=半墩'));
                this._content.append(leg);
            }
            return;
        }

        /* 兜底：简单牌山视图（无 _stacks 且无快照） */
        this._renderSimpleWall(shan);
    }

    /* ── 快照牌山视图（联机模式，脱敏显示） ── */
    _renderFromSnapshot(snapshot) {
        let shan = snapshot;
        $('<div>').addClass('info-panel-subtitle')
            .text(`剩余 ${shan.paishu} 枚`).appendTo(this._content);

        let wall = $('<div>').addClass('shan-wall');
        let is_landscape = $(window).height() < 500;
        if (is_landscape) {
            this._build_landscape_snapshot_wall(wall, shan);
        } else {
            this._build_snapshot_wall(wall, shan);
        }
        this._content.append(wall);

        if (!is_landscape) {
            let leg = $('<div>').addClass('shan-viewer-legend');
            leg.append($('<span>').addClass('leg-mark dw').text('王牌'));
            leg.append($('<span>').addClass('leg-mark cur').text('摸牌位'));
            leg.append($('<span>').addClass('leg-mark').text('暗色=半墩'));
            this._content.append(leg);
        }
    }

    _build_snapshot_wall(wall, shan) {
        let n = shan.stacks.length;
        let s0 = 0;
        let s1 = Math.floor(n / 4);
        let s2 = Math.floor(n / 2);
        let s3 = Math.floor(n * 3 / 4);

        this._build_snapshot_side(wall, 'top',    shan,  s0,      s1,       1);
        this._build_snapshot_side(wall, 'right',  shan,  s1,      s2,       1);
        this._build_snapshot_side(wall, 'bottom', shan,  s3 - 1,  s2 - 1,  -1);
        this._build_snapshot_side(wall, 'left',   shan,  n - 1,   s3 - 1,  -1);
    }

    _build_snapshot_side(wall, cls, shan, start, end, step) {
        let side = $('<div>').addClass('shan-side side-' + cls);
        let dw_start = shan.dead_wall_start;

        let i = start;
        while ((step > 0 && i < end) || (step < 0 && i > end)) {
            let stackVal = shan.stacks[i];
            let cell = $('<div>').addClass('shan-cell');

            if (stackVal === 0) {
                cell.addClass('empty');
            } else if (stackVal === 1) {
                cell.addClass('half');
            }
            /* stackVal === 2 → 满墩，无额外 class */

            /* 王牌 */
            let dw_idx = -1;
            let total = shan.stacks.length;
            let dw_count = 7 + (shan.dw_inserted || 0);
            for (let d = 0; d < dw_count; d++) {
                if (i === (dw_start + d) % total) { dw_idx = d; break; }
            }
            if (dw_idx >= 0) cell.addClass('dead-wall');

            /* 游标 */
            if (i === shan.cursor) {
                cell.addClass(shan.half_consumed ? 'cursor-half' : 'cursor-full');
            }

            /* 牌面内容：宝牌指示牌翻开展示（公开信息），其余用牌背 */
            if (stackVal > 0) {
                let tile = '_'; // 默认牌背
                if (dw_idx >= 0) {
                    let rep = shan.dw_inserted || 0;
                    let adj = dw_idx - rep;
                    if (adj >= 0 && adj < 5) {
                        /* adj: 0=宝5, 1=宝4, 2=宝3, 3=宝2, 4=宝1 */
                        let need = 4 - adj + 1; // 宝1需翻1次, 宝5需翻5次
                        let doraFlipped = (shan.baopai && shan.baopai.length) || 0;
                        if (doraFlipped >= need) {
                            let bpidx = 4 - adj;
                            tile = (shan.baopai && shan.baopai[bpidx]) ? shan.baopai[bpidx] : '_';
                        }
                    }
                }
                cell.append(this._pai(tile));
            }

            side.append(cell);
            i += step;
        }
        wall.append(side);
    }

    _build_landscape_snapshot_wall(wall, shan) {
        wall.addClass('landscape-layout');
        let frame = $('<div>').addClass('shan-land-frame');
        let grid  = $('<div>').addClass('shan-wall');
        this._build_snapshot_wall(grid, shan);
        frame.append(grid);
        wall.append(frame);

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

    /* ── 简化版牌山视图（兜底） ── */
    _renderSimpleWall(shan) {
        let container = $('<div>').addClass('shan-simple-info');
        let model = this._model;
        const feng = ['東', '南', '西', '北'];

        /* 对局信息 */
        let info = $('<div>').addClass('shan-simple-stats');
        let jushuStr = feng[model.zhuangfeng || 0] + ((model.jushu || 0) % 4 + 1) + '局';
        info.append($('<div>').text('场况: ' + jushuStr + ' ' + (model.changbang || 0) + '本场'));
        info.append($('<div>').text('供托: ' + (model.lizhibang || 0) + '根'));

        /* 剩余牌数 */
        info.append($('<div>').addClass('shan-simple-paishu')
            .text('牌山剩余: ' + (shan.paishu || 0) + ' 枚'));

        /* 宝牌指示牌 */
        let doraDiv = $('<div>').addClass('shan-simple-dora');
        let doraLabel = $('<span>').text('宝牌: ');
        doraDiv.append(doraLabel);
        let baopai = shan.baopai || [];
        for (let i = 0; i < baopai.length; i++) {
            doraDiv.append(this._pai(baopai[i]));
        }
        if (baopai.length === 0) {
            doraDiv.append($('<span>').addClass('shan-simple-empty').text('(无)'));
        }
        info.append(doraDiv);

        /* 得分 */
        let scoresDiv = $('<div>').addClass('shan-simple-scores');
        scoresDiv.append($('<div>').addClass('shan-simple-scores-title').text('得分:'));
        for (let l = 0; l < 4; l++) {
            let id = (model.seatToPlIdx && model.seatToPlIdx[l] != null) ? model.seatToPlIdx[l] : l;
            let defen = model.defen && model.defen[id] != null ? '' + model.defen[id] : '0';
            let name = model.player && model.player[id] ? model.player[id].replace(/\n.*$/, '') : ('P' + id);
            scoresDiv.append($('<div>').addClass('shan-simple-score-row')
                .text(feng[l] + ' ' + name + ': ' + defen));
        }
        info.append(scoresDiv);

        container.append(info);
        this._content.append(container);
    }

    /* ── 单机完整牌山渲染（保留） ── */

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

    _build_side(wall, cls, shan, start, end, step) {
        let side = $('<div>').addClass('shan-side side-' + cls);
        let dw_start = shan._haitei;

        let i = start;
        while ((step > 0 && i < end) || (step < 0 && i > end)) {
            let stack  = shan._stacks[i];
            let cell   = $('<div>').addClass('shan-cell');

            let has_top  = stack.top != null;
            let has_bot  = stack.bottom != null;

            if (!has_top && !has_bot) {
                cell.addClass('empty');
            } else if (has_top && has_bot) {
                /* 满墩 */
            } else {
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

            if (has_top) {
                let tile = this._tile_for_dora(shan, dw_idx);
                cell.append(this._pai(tile));
            } else if (has_bot) {
                let tile = this._tile_for_dora(shan, dw_idx, true);
                cell.append(this._pai(tile));
            }

            side.append(cell);
            i += step;
        }
        wall.append(side);
    }

    _tile_for_dora(shan, dw_idx, half) {
        let rep = shan._dw_count - 7;
        if (dw_idx < 0) return '_';
        if (dw_idx < rep) return '_';
        let adj = dw_idx - rep;
        if (adj >= 5) return '_';
        let need = 4 - adj + 1;
        if (shan._dora_flipped >= need) {
            let bpidx = 4 - adj;
            return shan._baopai[bpidx] || '_';
        }
        return '_';
    }

    _build_landscape_wall(wall, shan) {
        wall.addClass('landscape-layout');
        let frame = $('<div>').addClass('shan-land-frame');
        let grid  = $('<div>').addClass('shan-wall');
        this._build_wall(grid, shan);
        frame.append(grid);
        wall.append(frame);

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

    /* ── 牌局日志视图 ── */
    _renderLog() {
        /* 优先使用客户端累积的动作日志（联机模式） */
        let entries = null;
        if (this._actionLog && this._actionLog.length > 0) {
            entries = this._actionLog;
        } else {
            /* 单机模式：从 paipu.action_log 中提取 */
            let paipu = this._paipu;
            if (!paipu || !paipu.action_log) {
                $('<div>').addClass('info-panel-empty')
                    .text('暂无日志').appendTo(this._content);
                return;
            }
            entries = [];
            for (let r = 0; r < paipu.action_log.length; r++) {
                let roundLogs = paipu.action_log[r];
                if (roundLogs) entries = entries.concat(roundLogs);
            }
        }

        if (!entries || entries.length === 0) {
            $('<div>').addClass('info-panel-empty')
                .text('暂无日志').appendTo(this._content);
            return;
        }

        let container = $('<div>').addClass('info-panel-log');
        for (let entry of entries) {
            let row = $('<div>').addClass('info-panel-log-entry');
            $('<span>').addClass('info-panel-log-text').text(entry.text)
                .appendTo(row);
            container.append(row);
        }

        this._content.append(container);

        /* 自动滚动到底部 */
        container.scrollTop(container[0].scrollHeight);
    }
};
