/**
 * ExchangePrompt — 交换界面 UI 组件
 *
 * 纯浮动面板 + 原位可点击牌，无遮罩。
 * 所有交互直接在原始手牌和四家牌河的 DOM 元素上完成。
 * 支持两种模式：
 *   A) 有展示区：从展示区选一张 + 从手牌/牌河选一张 → 交换
 *   B) 无展示区：从手牌和牌河各选一张 → 直接交换
 */
"use strict";

const $ = require('jquery');
require('jquery-ui/ui/widgets/draggable');

/* ================================================================
 *  工具函数
 * ================================================================ */

function _checkCondition(tileA, tileB, condition) {
    if (condition === 'none') return true;
    if (!tileA || !tileB) return false;
    const aSuit = tileA[0], bSuit = tileB[0];
    const aNum  = tileA[1], bNum  = tileB[1];
    switch (condition) {
        case 'suit':            return aSuit === bSuit;
        case 'number':          return aNum  === bNum;
        case 'suit_or_number':  return aSuit === bSuit || aNum === bNum;
        default:                return true;
    }
}

const CONDITION_LABELS = {
    'none': '无条件', 'suit': '同花色',
    'number': '同数字', 'suit_or_number': '同花色或同数字',
};

/* ================================================================
 *  ExchangePrompt
 * ================================================================ */

module.exports = class ExchangePrompt {

    constructor(root, pai) {
        this._root = root;
        this._pai = pai || (t => $(`<span>${t}</span>`));
        this._visible = false;
        this._callback = null;

        /* 纯浮动面板，无遮罩 */
        this._node = $('<div class="ex-panel"></div>');
        root.append(this._node);

        /* 用于清理原始牌状态 */
        this._origSelector = [
            '.shoupai.main .bingpai > .pai',
            '.shoupai.main .zimo > .pai',
            '.he.main .pai',
            '.he.xiajia .pai',
            '.he.duimian .pai',
            '.he.shangjia .pai',
        ].join(', ');
    }

    /* ---- 公开接口 ---- */

    /**
     * 显示交换界面
     * @param {object} opts
     * @param {string[]} [opts.offerTiles]   - 展示区牌（有 = 模式A / 无 = 模式B）
     * @param {number}   [opts.swapCount]    - 最多交换几组
     * @param {string}   [opts.condition]    - 匹配条件 none|suit|number|suit_or_number
     * @param {string}   [opts.pairing]      - 模式B配对规则 hand_river|any|river_river
     * @param {string}   [opts.description]
     * @param {Function} callback(swapPairs)
     *
     *   模式A：callback([{ offerTile, offerIdx, sideTile, sidePlayer, sideIdx }, …])
     *   模式B：callback([{ a: { tile, player, idx }, b: { tile, player, idx } }, …])
     */
    showExchange(opts, callback) {
        this.clear();
        this._callback = callback;

        this._maxSwapCount = opts.swapCount || 1;
        this._condition    = opts.condition || 'none';
        this._pairing      = opts.pairing || 'hand_river';
        this._description  = opts.description || '';
        this._tileFilter   = opts.tileFilter || null;
        this._cancellable  = opts.cancellable || false;

        this._hasOffer = !!(opts.offerTiles && opts.offerTiles.length);
        this._offerTiles = this._hasOffer ? (opts.offerTiles || []).slice() : [];

        this._swapPairs       = [];
        this._currentSwapCount = 0;

        if (this._hasOffer) {
            this._selectedOffer = -1;
            this._selectedSide  = { idx: -1, player: null, tile: null };
        } else {
            this._selectionA = { idx: -1, player: null, tile: null };
            this._selectionB = { idx: -1, player: null, tile: null };
        }

        this._render();
        this._bindOriginalTiles();
        this._visible = true;
    }

    clear() {
        this._visible = false;
        this._callback = null;
        if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
        this._clearOriginalState();
        this._node.empty().removeClass('show');
        $(document).off('keydown.exchangeprompt');
    }

    get visible() { return this._visible; }

    /* ================================================================
     *  绑定原始 DOM 牌 — 所有交互在原位完成
     * ================================================================ */

    _bindOriginalTiles() {
        const self = this;
        const CLS = 'ex-selectable';

        /* 手牌（自家）— 用 each(i) 的 i 做合并集索引，写入手牌独有的 data-ex-idx */
        $('.shoupai.main .bingpai > .pai, .shoupai.main .zimo > .pai').each(function(i) {
            const $el = $(this);
            const tile = $el.data('pai') || $el.attr('data-pai');
            if (tile && !$el.hasClass('ex-swapped')) {
                if (self._tileFilter && !self._tileFilter(tile, 'hand')) return;
                $el.addClass(CLS).data('ex-idx', i);
                $el.on('click.exchangeTile', function(e) {
                    e.stopPropagation();
                    self._onOrigClick('hand', $(this).data('ex-idx'), tile);
                });
            }
        });

        /* 各家牌河 */
        const riverTiles = this._getRiverTiles(this._condition);
        for (const t of riverTiles) {
            const $el = t.$el;
            if (!$el.hasClass('ex-swapped')) {
                $el.addClass(CLS);
                $el.on('click.exchangeTile', function(e) {
                    e.stopPropagation();
                    self._onOrigClick(t.player, t.idx, t.tile);
                });
            }
        }
    }

    _getRiverTiles(condition) {
        const result = [];
        const filter = this._tileFilter;
        for (const cls of ['main', 'xiajia', 'duimian', 'shangjia']) {
            $(`.he.${cls} .pai`).each(function() {
                const $el = $(this);
                if ($el.hasClass('hide') && condition !== 'none') return;
                const tile = $el.data('pai') || $el.attr('data-pai');
                if (!tile) return;
                if (filter && !filter(tile, 'river')) return;
                /* data-index 可能在直接父元素 .lizhi 上（立直牌） */
                let idx = $el.data('index');
                if (idx == null) idx = $el.parent('.lizhi').data('index');
                if (idx == null) idx = $el.parent('.lizhi').attr('data-index');
                if (idx == null) return;
                result.push({ $el, player: cls, idx: +idx, tile });
            });
        }
        return result;
    }

    _clearOriginalState() {
        $(this._origSelector)
            .removeClass('ex-selectable ex-selected ex-swapped')
            .off('.exchangeTile');
    }

    /* ---- 原始牌点击处理 ---- */

    _onOrigClick(player, idx, tile) {
        if (idx == null || idx < 0) return;
        if (this._currentSwapCount >= this._maxSwapCount) return;
        if (this._isSideSwapped(player, idx)) return;

        if (this._hasOffer) {
            /* 模式A */
            if (this._selectedSide.idx >= 0) {
                this._removeOrigClass(this._selectedSide.player, this._selectedSide.idx, 'ex-selected');
            }
            this._selectedSide = { idx, player, tile };
            this._addOrigClass(player, idx, 'ex-selected');
            this._trySwapWithOffer();
        } else {
            /* 模式B */
            const isRiver = player !== 'hand';
            if (this._selectionA.idx < 0) {
                this._selectionA = { idx, player, tile };
                this._addOrigClass(player, idx, 'ex-selected');
                this._showToast('再选择一张牌');
                return;
            }
            if (this._selectionB.idx >= 0) return;

            const aIsRiver = this._selectionA.player !== 'hand';
            let allow = false;
            if (this._pairing === 'any') {
                allow = true;
            } else if (this._pairing === 'river_river') {
                allow = aIsRiver && isRiver;
            } else {
                allow = aIsRiver !== isRiver;
            }

            if (!allow) {
                this._removeOrigClass(this._selectionA.player, this._selectionA.idx, 'ex-selected');
                this._selectionA = { idx, player, tile };
                this._addOrigClass(player, idx, 'ex-selected');
                const hints = {
                    hand_river: '请从另一侧选择（手牌↔牌河）',
                    river_river: '请选择牌河中的牌',
                };
                this._showToast(hints[this._pairing] || '请选择其他牌');
                return;
            }

            if (this._selectionA.player === player && this._selectionA.idx === idx) {
                this._showToast('请选择另一张牌');
                return;
            }

            this._selectionB = { idx, player, tile };
            this._addOrigClass(player, idx, 'ex-selected');
            this._trySwapNoOffer();
        }
    }

    /* ---- CSS 类操作辅助 ---- */

    _addOrigClass(player, idx, cls) {
        if (player === 'hand') {
            $('.shoupai.main .bingpai > .pai, .shoupai.main .zimo > .pai').eq(idx).addClass(cls);
        } else {
            $(`.he.${player} .pai`).eq(idx).addClass(cls);
        }
    }

    _removeOrigClass(player, idx, cls) {
        if (player === 'hand') {
            $('.shoupai.main .bingpai > .pai, .shoupai.main .zimo > .pai').eq(idx).removeClass(cls);
        } else {
            $(`.he.${player} .pai`).eq(idx).removeClass(cls);
        }
    }

    /* ---- 更新原始 DOM 牌面图片 ---- */

    _setOrigTileImage(player, idx, tile) {
        const newEl = this._pai(tile);
        const newSrc = newEl.attr('src');
        const newDataPai = newEl.attr('data-pai') || tile.slice(0,2);
        if (player === 'hand') {
            $('.shoupai.main .bingpai > .pai, .shoupai.main .zimo > .pai').eq(idx)
                .attr('src', newSrc).attr('data-pai', newDataPai);
        } else {
            $(`.he.${player} .pai`).eq(idx)
                .attr('src', newSrc).attr('data-pai', newDataPai);
        }
    }

    /* ---- 状态查询 ---- */

    _isSideSwapped(player, idx) {
        return this._swapPairs.some(p => {
            if (this._hasOffer) return p.sidePlayer === player && p.sideIdx === idx;
            return (p.a && p.a.player === player && p.a.idx === idx)
                || (p.b && p.b.player === player && p.b.idx === idx);
        });
    }

    _isOfferSwapped(idx) {
        if (!this._hasOffer) return false;
        return this._swapPairs.some(p => p.offerIdx === idx);
    }

    /* ================================================================
     *  渲染 — 纯浮动面板
     * ================================================================ */

    _render() {
        const self = this;
        const remaining = this._maxSwapCount - this._currentSwapCount;

        const statusText = this._currentSwapCount > 0
            ? `已交换 ${this._currentSwapCount}/${this._maxSwapCount} 组`
            : `选择要交换的牌（还需 ${remaining} 组）`;

        const condLabel = CONDITION_LABELS[this._condition] || '无条件';

        /* 展示区（仅模式A） */
        const offerSection = this._hasOffer ? `
            <div class="ex-offer-label">交换区</div>
            <div class="ex-offer-tiles">${this._renderOfferTiles()}</div>
        ` : '';

        const html = `
            <div class="ex-center">
                <div class="ex-drag-handle">⠿</div>
                ${this._description ? `<div class="ex-desc">${this._description}</div>` : ''}
                <div class="ex-center-status">
                    <span class="ex-status-text">${statusText}</span>
                    <span class="ex-cond-badge">${condLabel}</span>
                </div>
                ${offerSection}
                <div class="ex-btns">
                    ${this._cancellable ? '<button class="ex-btn ex-btn-cancel">取消</button>' : ''}
                    <button class="ex-btn ex-btn-reset" ${this._currentSwapCount === 0 ? 'disabled' : ''}>重置</button>
                    <button class="ex-btn ex-btn-confirm" ${this._currentSwapCount === 0 ? 'disabled' : ''}>确定</button>
                </div>
            </div>
        `;

        this._node.html(html).addClass('show');

        /* 拖拽 — 自由移动 */
        this._node.find('.ex-center').draggable({
            handle: '.ex-drag-handle',
        });

        /* 展示区点击 */
        if (this._hasOffer) {
            this._node.find('.ex-offer-tile').on('click.ex', function() {
                const idx = parseInt($(this).data('idx'));
                self._selectOffer(idx);
            });
        }

        /* 按钮 */
        if (this._cancellable) {
            this._node.find('.ex-btn-cancel').on('click.ex', () => this._doCancel());
        }
        this._node.find('.ex-btn-reset').on('click.ex', () => this._resetAll());
        this._node.find('.ex-btn-confirm').on('click.ex', () => this._doConfirm());

        /* 键盘退出 */
        $(document).on('keydown.exchangeprompt', ev => {
            if (ev.key === 'Escape') {
                if (this._cancellable) this._doCancel();
            }
        });
    }

    _renderOfferTiles() {
        if (!this._hasOffer) return '';
        const tiles = this._offerTiles;
        if (!tiles || !tiles.length) return '<div class="ex-empty">（无牌）</div>';
        return tiles.map((t, i) => {
            const cls = ['ex-tile', 'ex-offer-tile'];
            if (i === this._selectedOffer) cls.push('selected');
            if (this._isOfferSwapped(i)) cls.push('swapped');
            return $('<span>').append(
                this._pai(t).clone().addClass(cls.join(' ')).attr('data-idx', i)
            )[0].outerHTML;
        }).join('');
    }

    /* ================================================================
     *  选择 & 交换
     * ================================================================ */

    _selectOffer(idx) {
        if (!this._hasOffer) return;
        if (idx < 0 || idx >= this._offerTiles.length) return;
        if (this._isOfferSwapped(idx)) return;
        if (this._currentSwapCount >= this._maxSwapCount) return;

        this._selectedOffer = idx;
        this._trySwapWithOffer();
    }

    /* ---- 模式A ---- */

    _trySwapWithOffer() {
        if (this._selectedOffer < 0 || this._selectedSide.idx < 0) {
            this._refreshCenterPanel();
            return;
        }

        const offerTile = this._offerTiles[this._selectedOffer];
        const sideTile  = this._selectedSide.tile;

        if (!_checkCondition(offerTile, sideTile, this._condition)) {
            this._showToast('条件不满足：' + (CONDITION_LABELS[this._condition] || '无条件'));
            this._removeOrigClass(this._selectedSide.player, this._selectedSide.idx, 'ex-selected');
            this._selectedOffer = -1;
            this._selectedSide  = { idx: -1, player: null, tile: null };
            this._refreshCenterPanel();
            return;
        }

        const oIdx = this._selectedOffer;
        const sPlayer = this._selectedSide.player;
        const sIdx = this._selectedSide.idx;

        this._swapPairs.push({
            offerIdx: oIdx, offerTile: offerTile,
            sidePlayer: sPlayer, sideIdx: sIdx, sideTile: sideTile,
        });

        /* 视觉标记 */
        this._offerTiles[oIdx] = sideTile;
        this._removeOrigClass(sPlayer, sIdx, 'ex-selected');
        this._addOrigClass(sPlayer, sIdx, 'ex-swapped');
        this._setOrigTileImage(sPlayer, sIdx, offerTile);
        this._currentSwapCount++;

        this._selectedOffer = -1;
        this._selectedSide  = { idx: -1, player: null, tile: null };

        this._refreshCenterPanel();
        this._updateButtons();

        if (this._currentSwapCount >= this._maxSwapCount) {
            this._showToast('已完成所有交换，点击「确定」提交');
        }
    }

    /* ---- 模式B ---- */

    _trySwapNoOffer() {
        if (this._selectionA.idx < 0 || this._selectionB.idx < 0) return;

        const tileA = this._selectionA.tile;
        const tileB = this._selectionB.tile;

        if (!_checkCondition(tileA, tileB, this._condition)) {
            this._showToast('条件不满足：' + (CONDITION_LABELS[this._condition] || '无条件'));
            this._removeOrigClass(this._selectionA.player, this._selectionA.idx, 'ex-selected');
            this._removeOrigClass(this._selectionB.player, this._selectionB.idx, 'ex-selected');
            this._selectionA = { idx: -1, player: null, tile: null };
            this._selectionB = { idx: -1, player: null, tile: null };
            return;
        }

        const aPlayer = this._selectionA.player;
        const aIdx = this._selectionA.idx;
        const bPlayer = this._selectionB.player;
        const bIdx = this._selectionB.idx;

        this._swapPairs.push({
            a: { tile: tileA, player: aPlayer, idx: aIdx },
            b: { tile: tileB, player: bPlayer, idx: bIdx },
        });

        this._removeOrigClass(aPlayer, aIdx, 'ex-selected');
        this._removeOrigClass(bPlayer, bIdx, 'ex-selected');
        this._addOrigClass(aPlayer, aIdx, 'ex-swapped');
        this._addOrigClass(bPlayer, bIdx, 'ex-swapped');
        this._setOrigTileImage(aPlayer, aIdx, tileB);
        this._setOrigTileImage(bPlayer, bIdx, tileA);
        this._currentSwapCount++;

        this._selectionA = { idx: -1, player: null, tile: null };
        this._selectionB = { idx: -1, player: null, tile: null };

        this._refreshCenterPanel();
        this._updateButtons();

        if (this._currentSwapCount >= this._maxSwapCount) {
            this._showToast('已完成所有交换，点击「确定」提交');
        }
    }

    /* ================================================================
     *  重置 & 确定
     * ================================================================ */

    _resetAll() {
        if (this._currentSwapCount === 0) return;

        if (this._hasOffer) {
            for (const p of this._swapPairs) {
                this._offerTiles[p.offerIdx] = p.offerTile;
                /* 恢复侧边牌的原始图片 */
                this._setOrigTileImage(p.sidePlayer, p.sideIdx, p.sideTile);
            }
            this._selectedOffer = -1;
            this._selectedSide  = { idx: -1, player: null, tile: null };
        } else {
            for (const p of this._swapPairs) {
                this._setOrigTileImage(p.a.player, p.a.idx, p.a.tile);
                this._setOrigTileImage(p.b.player, p.b.idx, p.b.tile);
            }
            this._selectionA = { idx: -1, player: null, tile: null };
            this._selectionB = { idx: -1, player: null, tile: null };
        }

        this._clearOriginalState();
        this._swapPairs       = [];
        this._currentSwapCount = 0;

        this._bindOriginalTiles();
        this._refreshCenterPanel();
        this._updateButtons();
        this._showToast('已重置');
    }

    _doConfirm() {
        if (this._currentSwapCount === 0) {
            this._doCancel();
            return;
        }
        const cb = this._callback;
        let pairs;

        if (this._hasOffer) {
            pairs = this._swapPairs.map(p => ({
                offerTile: p.offerTile, offerIdx: p.offerIdx,
                sideTile: p.sideTile, sidePlayer: p.sidePlayer, sideIdx: p.sideIdx,
            }));
        } else {
            pairs = this._swapPairs.map(p => ({
                a: { tile: p.a.tile, player: p.a.player, idx: p.a.idx },
                b: { tile: p.b.tile, player: p.b.player, idx: p.b.idx },
            }));
        }

        this.clear();
        if (cb) cb(pairs);
    }

    _doCancel() {
        const cb = this._callback;
        this.clear();
        if (cb) cb(null);
    }

    /* ================================================================
     *  UI 刷新
     * ================================================================ */

    _refreshCenterPanel() {
        if (this._hasOffer) {
            this._node.find('.ex-offer-tiles').html(this._renderOfferTiles());
            const self = this;
            this._node.find('.ex-offer-tile').on('click.ex', function() {
                const idx = parseInt($(this).data('idx'));
                self._selectOffer(idx);
            });
        }

        const rem = this._maxSwapCount - this._currentSwapCount;
        const st = this._currentSwapCount > 0
            ? `已交换 ${this._currentSwapCount}/${this._maxSwapCount} 组`
            : `选择要交换的牌（还需 ${rem} 组）`;
        this._node.find('.ex-status-text').text(st);
    }

    _updateButtons() {
        const dis = this._currentSwapCount === 0;
        this._node.find('.ex-btn-reset').prop('disabled', dis);
        this._node.find('.ex-btn-confirm').prop('disabled', dis);
    }

    _showToast(msg) {
        const $el = this._node.find('.ex-status-text');
        $el.text(msg);
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            const rem = this._maxSwapCount - this._currentSwapCount;
            const st = this._currentSwapCount > 0
                ? `已交换 ${this._currentSwapCount}/${this._maxSwapCount} 组`
                : `选择要交换的牌（还需 ${rem} 组）`;
            $el.text(st);
            this._toastTimer = null;
        }, 2000);
    }
};
