/**
 * 超能力麻将 - 角色选择器
 */
'use strict';

const $ = require('jquery');

module.exports = class CharacterSelector {

    /**
     * @param {Object} skillManager - SkillManager 实例
     * @param {Object[]} dealResult - dealCharacters() 返回的结果
     * @param {number} humanPlayer - 人类玩家索引 (默认 0)
     * @param {Function} onComplete - 所有玩家选定后的回调
     * @param {number} qijia - 起家（庄家位置），决定顺序选择从谁开始
     * @param {Object} game - Game 实例（用于实时更新角色信息到牌桌）
     */
    constructor(skillManager, dealResult, humanPlayer, onComplete, qijia, game) {
        this._sm = skillManager;
        this._dealResult = dealResult;
        this._humanPlayer = humanPlayer || 0;
        this._onComplete = onComplete || (() => {});
        this._game = game || null;
        this._selectedIndex = -1;
        this._confirmed = false;
        this._node = {};

        /* 顺序选择模式相关 */
        this._sequential = dealResult.some(e => e.sequential);
        /* 注：qijia 参数实际值是 seatToPlayerIdx(qijia) 即庄家的 plIdx，
         * 由 index.js 预先转换。直接用作 deal 位置。 */
        this._currentPlayer = (qijia != null && qijia >= 0) ? qijia : 0;
        this._startPlayer = this._currentPlayer; // 记录起始玩家，用于判断是否轮完一圈
        this._pickedCount = 0;                   // 已选人数
        this._playerNames = ['自家','下家','对家','上家'];
    }

    /**
     * 显示角色选择界面
     */
    show() {
        let overlay = $('<div>').addClass('character-selector-overlay');
        let modal   = $('<div>').addClass('character-selector-modal');
        let title   = $('<div>').addClass('character-selector-title').text('选择角色');
        let grid    = $('<div>').addClass('character-selector-grid');
        let confirm = $('<div>').addClass('character-selector-confirm');
        let btn     = $('<button>').addClass('character-selector-btn')
                                  .attr('aria-label', '确定')
                                  .attr('disabled', true).text('确定');

        /* 隐藏/显示按钮：点击后收起面板以便观察手牌 */
        let toggleBtn = $('<button>').addClass('character-selector-toggle')
                                    .text('▽ 隐藏').attr('title', '收起面板观察手牌');

        let self = this;
        toggleBtn.on('click', function(e) {
            e.stopPropagation();
            if (modal.is(':visible')) {
                modal.hide();
                overlay.css('background', 'rgba(0,0,0,0.15)');
                $(this).text('△ 显示');
            } else {
                modal.show();
                overlay.css('background', 'rgba(0,0,0,0.85)');
                $(this).text('▽ 隐藏');
            }
        });

        confirm.append(btn);
        modal.append(title, grid, confirm);
        overlay.append(toggleBtn, modal);

        $('body').append(overlay);
        this._node.overlay = overlay;
        this._node.modal   = modal;
        this._node.grid    = grid;
        this._node.btn     = btn;
        this._node.title   = title;

        if (this._sequential) {
            this._showSequentialTurn();
        } else {
            this._showNormal();
        }
    }

    /* ================================================================
     * 普通模式（DRAW_4 / DRAW_2 / DRAFT / RANDOM）
     * ================================================================ */

    _showNormal() {
        let entry = this._dealResult.find(e => e.player === this._humanPlayer);
        if (!entry || !entry.options.length) {
            this._autoConfirmAll();
            return;
        }

        this._renderGrid(entry.options);
        if (entry.options.length < 4) {
            this._node.grid.addClass('few-cards');
        }

        let self = this;
        this._node.btn.on('click', () => self._confirm());
        this._aiAutoSelect();
    }

    /* ================================================================
     * 顺序选择模式（FREE）
     * ================================================================ */

    _showSequentialTurn() {
        this._selectedIndex = -1;
        this._confirmed = false;

        /* 已选满4人则结束 */
        if (this._pickedCount >= 4) {
            this._finish();
            return;
        }

        /* 找到当前玩家未选的条目，跳过已选的 */
        for (let count = 0; count < 4; count++) {
            let p = this._currentPlayer % 4;
            let entry = this._dealResult.find(e => e.player === p);
            if (entry && !entry.selected) {
                this._currentPlayer = p;
                break;
            }
            this._currentPlayer++;
        }

        if (this._pickedCount >= 4) {
            this._finish();
            return;
        }

        let entry = this._dealResult.find(e => e.player === this._currentPlayer);
        let name = this._playerNames[this._currentPlayer];

        this._node.title.text(`选择角色 - ${name}`);
        this._node.btn.attr('disabled', true).text('确定');
        this._node.grid.empty().removeClass('few-cards many-cards');

        if (!entry.options.length) {
            /* 无角色可选，跳过 */
            this._currentPlayer++;
            this._showSequentialTurn();
            return;
        }

        /* 超过4张时使用横向滚动 */
        if (entry.options.length > 4) {
            this._node.grid.addClass('many-cards');
        }

        this._renderGrid(entry.options);

        if (this._currentPlayer === this._humanPlayer) {
            /* 人类玩家手动选择 */
            let self = this;
            this._node.btn.off('click').on('click', () => self._sequentialConfirm());
        } else {
            /* AI 自动选择（后台执行，不显示选择界面） */
            this._sequentialAiSelect(entry);
        }
    }

    _sequentialConfirm() {
        if (this._confirmed || this._selectedIndex < 0) return;
        this._confirmed = true;

        let entry = this._dealResult.find(e => e.player === this._currentPlayer);
        let chosen = entry.options[this._selectedIndex];

        /* 通知 SkillManager：分别操作角色池和座位分配 */
        let character = this._sm.confirmChoiceFromPool(this._currentPlayer, this._selectedIndex, this._dealResult);
        this._sm.assignCharacterToSeat(this._toGameSeat(this._currentPlayer), character.id);

        /* 实时更新牌桌上的角色信息 */
        this._syncBoardCharacters();

        /* 从后续玩家的可选池中移除 */
        this._removeFromSubsequent(chosen);

        /* 禁用卡片、更新按钮 */
        $('.character-card', this._node.grid).css('pointer-events', 'none');
        this._node.btn.attr('disabled', true).text('已确认');

        /* 0.5秒后切换到下一玩家 */
        let self = this;
        setTimeout(() => {
            self._pickedCount++;
            self._currentPlayer = (self._currentPlayer + 1) % 4;
            self._showSequentialTurn();
        }, 500);
    }

    _sequentialAiSelect(entry) {
        /* AI 后台静默选择，显示短暂状态 */
        this._node.grid.empty().removeClass('few-cards many-cards');
        $('<div>').addClass('ai-choosing')
                  .text(`${this._playerNames[this._currentPlayer]} 选择中...`)
                  .appendTo(this._node.grid);
        this._node.btn.attr('disabled', true).text('...');

        let self = this;
        setTimeout(() => {
            let randomIdx = Math.floor(Math.random() * entry.options.length);
            let chosen = entry.options[randomIdx];

            let character = self._sm.confirmChoiceFromPool(self._currentPlayer, randomIdx, self._dealResult);
            self._sm.assignCharacterToSeat(self._toGameSeat(self._currentPlayer), character.id);

            /* 实时更新牌桌上的角色信息 */
            self._syncBoardCharacters();

            /* 从后续玩家的可选池中移除 */
            self._removeFromSubsequent(chosen);

            self._pickedCount++;
            self._currentPlayer = (self._currentPlayer + 1) % 4;
            self._showSequentialTurn();
        }, 200);
    }

    _removeFromSubsequent(chosen) {
        /* 从后续所有未选玩家中移除（按顺序轮圈） */
        for (let i = 0; i < 3; i++) {
            let p = (this._currentPlayer + 1 + i) % 4;
            let otherEntry = this._dealResult.find(e => e.player === p);
            if (otherEntry && !otherEntry.selected) {
                otherEntry.options = otherEntry.options.filter(c => c !== chosen);
            }
        }
    }

    /* ================================================================
     * 通用
     * ================================================================ */

    /**
     * 将 deal 位置（plIdx）转换为游戏席位（model seat）。
     * dealResult[].player = plIdx（0=human, 1=AI1, 2=AI2, 3=AI3）
     * 游戏席位 seat = 0=东, 1=南, 2=西, 3=北
     * seatToPlIdx[seat] = (qijia + jushu + seat) % 4
     * 反查: seat = seatToPlIdx.indexOf(plIdx)
     */
    _toGameSeat(dealPosition) {
        if (this._game && this._game._model && this._game._model.seatToPlIdx) {
            return this._game._model.seatToPlIdx.indexOf(dealPosition);
        }
        return dealPosition; // 回退：假设恒等映射
    }

    _renderGrid(options) {
        let grid = this._node.grid;
        let self = this;
        for (let i = 0; i < options.length; i++) {
            let card = this._createCard(options[i], i);
            grid.append(card);
        }
    }

    /**
     * 创建角色卡片
     */
    _createCard(char, index) {
        let self = this;
        let card = $('<div>').addClass('character-card').data('index', index);

        let avatar = $('<img>').addClass('avatar')
                               .attr('src', 'resources/头像/' + char.card)
                               .attr('alt', char.name);
        let name = $('<div>').addClass('char-name').text(char.name);
        let skills = $('<div>').addClass('char-skills');
        for (let s of (char.skills || [])) {
            let text = typeof s === 'string' ? s : (s.description || '');
            skills.append($('<div>').addClass('skill-line').text(text));
        }

        card.append(avatar, name, skills);

        card.on('click', function() {
            let idx = $(this).data('index');
            self._selectCard(idx);
        });

        return card;
    }

    /**
     * 选择一张卡片
     */
    _selectCard(index) {
        if (this._confirmed) return;

        this._selectedIndex = index;
        $('.character-card', this._node.grid).removeClass('selected');
        $(`.character-card:nth-child(${index + 1})`, this._node.grid).addClass('selected');
        this._node.btn.attr('disabled', false);
    }

    /**
     * 确认选择（普通模式）
     */
    _confirm() {
        if (this._confirmed || this._selectedIndex < 0) return;
        this._confirmed = true;

        /* 通知 SkillManager：分别操作角色池和座位分配 */
        let character = this._sm.confirmChoiceFromPool(this._humanPlayer, this._selectedIndex, this._dealResult);
        this._sm.assignCharacterToSeat(this._toGameSeat(this._humanPlayer), character.id);

        /* 实时更新牌桌上的角色信息 */
        this._syncBoardCharacters();

        /* 禁用所有卡片点击 */
        $('.character-card', this._node.grid).css('pointer-events', 'none');
        this._node.btn.attr('disabled', true).text('已确认');

        /* 等待 AI 全部选定 */
        this._checkAllReady();
    }

    /**
     * AI 自动选择角色
     */
    _aiAutoSelect() {
        for (let entry of this._dealResult) {
            if (entry.player === this._humanPlayer) continue;
            if (entry.autoConfirmed) continue;
            /* AI 随机选择 */
            setTimeout(() => {
                let randomIdx = Math.floor(Math.random() * entry.options.length);
                let character = this._sm.confirmChoiceFromPool(entry.player, randomIdx, this._dealResult);
                this._sm.assignCharacterToSeat(this._toGameSeat(entry.player), character.id);
                this._syncBoardCharacters();
            }, 300 + Math.random() * 400);
        }
    }

    /**
     * 所有 AI 都随机分配（无选项时）
     */
    _autoConfirmAll() {
        for (let entry of this._dealResult) {
            if (entry.autoConfirmed) continue;
            if (entry.player === this._humanPlayer) {
                /* 人类玩家也无选项，随机选 */
                let character = this._sm.confirmChoiceFromPool(this._humanPlayer, 0, this._dealResult);
                this._sm.assignCharacterToSeat(this._toGameSeat(this._humanPlayer), character.id);
            } else {
                let randomIdx = Math.floor(Math.random() * entry.options.length);
                let character = this._sm.confirmChoiceFromPool(entry.player, randomIdx, this._dealResult);
                this._sm.assignCharacterToSeat(this._toGameSeat(entry.player), character.id);
            }
        }
        setTimeout(() => this._finish(), 500);
    }

    /**
     * 检查是否所有人已选定
     */
    _checkAllReady() {
        let self = this;
        let checkInterval = setInterval(() => {
            let allDone = true;
            for (let entry of self._dealResult) {
                if (!entry.selected && !entry.autoConfirmed) {
                    allDone = false;
                    break;
                }
            }
            if (allDone) {
                clearInterval(checkInterval);
                setTimeout(() => self._finish(), 500);
            }
        }, 200);
    }

    /**
     * 完成，关闭界面并回调
     */
    /**
     * 同步牌桌上的角色信息（让玩家在隐藏选择面板时能看到已选角色）
     */
    _syncBoardCharacters() {
        if (!this._game || !this._game._model) return;
        this._game._model.character = this._sm.getAllCharacters();
        if (this._game._view) this._game._view.redraw();
    }

    _finish() {
        if (this._node.overlay) {
            this._node.overlay.remove();
            this._node.overlay = null;
        }
        this._onComplete();
    }

    /**
     * 关闭（用户取消）
     */
    _close() {
        /* 不允许取消，必须选择 */
    }
};
