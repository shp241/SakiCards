/**
 * 超能力麻将 - 技能提示 UI 组件
 * 在手牌上方显示提示文字和是/否选项，支持牌河选牌
 * 可复用于所有需要玩家确认的技能
 */
"use strict";

const $ = require('jquery');

module.exports = class SkillPrompt {

    /**
     * @param {jQuery} root - 对局面板的根元素（#board）
     * @param {Function} pai - 牌图片生成函数 (tileStr) => jQuery
     */
    constructor(root, pai) {
        this._root = root;
        this._pai = pai || ((t) => $(`<span>${t}</span>`));
        this._visible = false;
        this._callback = null;

        /* 创建提示容器 */
        this._node = $('<div class="skill-prompt-container"></div>');
        root.append(this._node);
    }

    /* ================================================================
     * 基础确认提示（是/否）
     * ================================================================ */

    /**
     * 显示是/否确认提示
     *
     * @param {string} skillName - 技能名称
     * @param {string} description - 提示描述文字
     * @param {Function} callback(playerChoice) - 回调
     *   playerChoice: 'yes' | 'no'
     */
    askConfirm(skillName, description, callback, timeoutMs) {
        this.clear();
        this._callback = callback;
        let isMulti = typeof this._broadcastData === 'function';

        let timeoutSpan = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';

        let html = `
            <div class="skill-prompt-text">${description}${timeoutSpan}</div>
            <div class="skill-prompt-buttons">
                <button class="skill-prompt-yes">是</button>
                <button class="skill-prompt-no">否</button>
            </div>
        `;

        this._node.html(html).addClass('show');

        /* 是 */
        this._node.find('.skill-prompt-yes').on('click.skill', () => {
            this._clearTimer();
            this.clear();
            callback('yes');
        });

        /* 否 */
        this._node.find('.skill-prompt-no').on('click.skill', () => {
            this._clearTimer();
            this.clear();
            callback('no');
        });

        /* 键盘操作：Y=是, N=否 */
        let keyHandler = (ev) => {
            if (ev.key === 'y' || ev.key === 'Y') {
                $(document).off('keydown.skillprompt');
                this._clearTimer();
                this.clear();
                callback('yes');
            } else if (ev.key === 'n' || ev.key === 'N') {
                $(document).off('keydown.skillprompt');
                this._clearTimer();
                this.clear();
                callback('no');
            }
        };
        $(document).on('keydown.skillprompt', keyHandler);

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            this._startCountdown(timeoutMs, isMulti, () => {
                if (this._callback === callback && this._node.hasClass('show')) {
                    this.clear();
                    callback('no');
                }
            });
        }
    }

    /* ================================================================
     * 牌河选牌（从所有玩家牌河中选择一张）
     * ================================================================ */

    /**
     * 显示牌河选牌界面，玩家点击任意牌河的牌来选择
     *
     * @param {string} description - 提示文字
     * @param {Object} heData - 牌河数据 { playerIndex: [pai_string, ...], ... }
     * @param {Function} callback(paiString | null) - 选中牌或取消
     */
    askRiverTile(description, callback, timeoutMs, validTiles) {
        this.clear();
        this._callback = callback;
        let isMulti = typeof this._broadcastData === 'function';
        let timeoutSpan = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';

        /* 先显示取消按钮 */
        let html = `
            <div class="skill-prompt-text">${description}${timeoutSpan}</div>
            <div class="skill-prompt-buttons">
                <button class="skill-prompt-no">取消</button>
            </div>
        `;
        this._node.html(html).addClass('show');

        let self = this;
        this._node.find('.skill-prompt-no').on('click.skill', () => {
            self._clearTimer();
            self._unhighlightRiver();
            self.clear();
            callback(null);
        });

        /* 键盘取消 */
        $(document).on('keydown.skillprompt', (ev) => {
            if (ev.key === 'Escape') {
                $(document).off('keydown.skillprompt');
                self._clearTimer();
                self._unhighlightRiver();
                self.clear();
                callback(null);
            }
        });

        /* 高亮牌河牌供选择（validTiles 限制可选范围） */
        this._highlightRiver((paiStr, seat, index) => {
            $(document).off('keydown.skillprompt');
            self._clearTimer();
            self._unhighlightRiver();
            self.clear();
            callback(paiStr, seat, index);
        }, validTiles);

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            this._startCountdown(timeoutMs, isMulti, () => {
                if (self._callback === callback && self._node.hasClass('show')) {
                    self._unhighlightRiver();
                    self.clear();
                    callback(null);
                }
            });
        }
    }

    /**
     * 高亮所有牌河牌，允许点击选择
     */
    _highlightRiver(onSelect, validTiles) {
        let self = this;
        let validSet = validTiles ? new Set(validTiles) : null;
        $('.he .pai').each(function() {
            let $pai = $(this);
            /* 跳过已被副露的牌（有+=−标记的）和暗牌 */
            if ($pai.closest('.fulou').length) return;
            if ($pai.hasClass('hide')) return;

            let seat = parseInt($pai.closest('.he').attr('data-seat'));
            let index = parseInt($pai.attr('data-index'));

            /* validTiles 限制可选范围：格式 "seat:index" */
            if (validSet && !validSet.has(seat + ':' + index)) return;

            $pai.addClass('skill-selectable');
            $pai.off('click.skillpai').on('click.skillpai', function(ev) {
                ev.stopPropagation();
                let paiStr = $pai.data('pai') || $pai.attr('data-pai');
                if (paiStr) {
                    onSelect(paiStr, seat, index);
                }
            });
        });
    }

    /**
     * 取消牌河高亮
     */
    _unhighlightRiver() {
        $('.he .pai').removeClass('skill-selectable').off('click.skillpai');
    }

    /* ================================================================
     * 手牌选牌（用于暗切等需要从手牌选牌的操作）
     * ================================================================ */

    /**
     * 显示手牌选牌界面
     *
     * @param {string} description - 提示文字
     * @param {Function} callback(paiString | null)
     */
    /**
     * 显示手牌选牌界面
     *
     * @param {string} description - 提示文字
     * @param {Function} callback(paiString | null)
     * @param {string[]} [validTiles] - 可选牌列表（过滤），不传则所有手牌可选
     */
    askHandTile(description, callback, validTiles, timeoutMs) {
        this.clear();
        this._callback = callback;
        let isMulti = typeof this._broadcastData === 'function';
        let timeoutSpan = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';

        let html = `
            <div class="skill-prompt-text">${description}${timeoutSpan}</div>
            <div class="skill-prompt-buttons">
                <button class="skill-prompt-no">取消</button>
            </div>
        `;
        this._node.html(html).addClass('show');

        let self = this;

        this._node.find('.skill-prompt-no').on('click.skill', () => {
            self._clearTimer();
            self._unhighlightHand();
            self.clear();
            callback(null);
        });

        /* 键盘取消 */
        $(document).on('keydown.skillprompt', (ev) => {
            if (ev.key === 'Escape') {
                $(document).off('keydown.skillprompt');
                self._clearTimer();
                self._unhighlightHand();
                self.clear();
                callback(null);
            }
        });

        /* 高亮手牌供选择 */
        this._highlightHand((entry) => {
            $(document).off('keydown.skillprompt');
            self._clearTimer();
            self._unhighlightHand();
            self.clear();
            callback(entry ? entry.pai : null);
        }, validTiles);

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            this._startCountdown(timeoutMs, isMulti, () => {
                if (self._callback === callback && self._node.hasClass('show')) {
                    self._unhighlightHand();
                    self.clear();
                    callback(null);
                }
            });
        }
    }

    /**
     * 高亮自家手牌，允许点击选择
     * @param {Function} onSelect - 选择回调
     * @param {string[]} [validTiles] - 可选牌列表（过滤）
     */
    _highlightHand(onSelect, validTiles) {
        let idx = 0;
        $('.shoupai.main .bingpai > .pai, .shoupai.main .zimo > .pai').each(function() {
            let $pai = $(this);
            let paiStr = $pai.data('pai') || $pai.attr('data-pai');
            /* 过滤：只高亮 validTiles 中的牌 */
            if (validTiles && (!paiStr || !validTiles.includes(paiStr))) return;
            $pai.addClass('skill-selectable');
            let capturedIdx = idx;
            let capturedPai = paiStr;
            $pai.off('click.skillpai').on('click.skillpai', function(ev) {
                ev.stopPropagation();
                if (capturedPai) {
                    onSelect({pai: capturedPai, idx: capturedIdx});
                }
            });
            idx++;
        });
        /* 防止 badge 被 overflow:hidden 裁剪 */
        if (idx > 0) {
            $('.shoupai.main .bingpai').css('overflow', 'visible');
            $('.shoupai.main').closest('.player').css('overflow', 'visible');
        }
    }

    /* ================================================================
     * 多选项提示
     * ================================================================ */

    /**
     * 显示多选项按钮
     *
     * @param {string} description - 提示文字
     * @param {Object[]} options - 选项列表 [{label: '2张', value: '2'}, ...]
     * @param {Function} callback(value) - 回调，返回所选的值
     */
    askOptions(description, options, callback, config, timeoutMs) {
        this.clear();
        this._callback = callback;
        let isMulti = typeof this._broadcastData === 'function';

        let showCancel = config && config.showCancel;
        let timeoutSpan = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';

        let buttonsHtml = options.map((opt, i) => {
            if (opt.image) {
                let tileImg = $('<span>').append(this._pai(opt.image).clone())[0].outerHTML;
                return `<button class="skill-prompt-opt skill-prompt-tile-opt" data-value="${opt.value}">${tileImg}</button>`;
            }
            return `<button class="skill-prompt-opt" data-value="${opt.value}">${opt.label}</button>`;
        }).join('');

        let html = `
            <div class="skill-prompt-text">${description}${timeoutSpan}</div>
            <div class="skill-prompt-buttons">${buttonsHtml}</div>
            ${showCancel ? '<div class="skill-prompt-cancel-row"><button class="skill-prompt-opt skill-prompt-cancel-btn" data-value="__cancel__">取消</button></div>' : ''}
        `;

        this._node.html(html).addClass('show');

        let self = this;
        this._node.find('.skill-prompt-opt').on('click.skill', (ev) => {
            let value = $(ev.currentTarget).data('value');
            if (value === '__cancel__') {
                self._clearTimer();
                self.clear();
                callback(null);
                return;
            }
            self._clearTimer();
            self.clear();
            callback(value);
        });

        /* 键盘取消（始终可用） */
        $(document).on('keydown.skillprompt', (ev) => {
            if (ev.key === 'Escape') {
                $(document).off('keydown.skillprompt');
                self._clearTimer();
                self.clear();
                callback(null);
            }
            /* 数字键快捷选择 */
            for (let i = 0; i < options.length; i++) {
                if (ev.key === String(i + 1)) {
                    $(document).off('keydown.skillprompt');
                    self._clearTimer();
                    self.clear();
                    callback(options[i].value);
                    return;
                }
            }
        });

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            this._startCountdown(timeoutMs, isMulti, () => {
                if (self._callback === callback && self._node.hasClass('show')) {
                    self.clear();
                    callback(null);
                }
            });
        }
    }

    /* ================================================================
     * 浮窗展示
     * ================================================================ */

    /**
     * 显示浮窗展示牌信息（所有玩家可见），2 秒后自动关闭或按 X 提前关闭
     *
     * @param {string} title - 标题文字
     * @param {string[]} tiles - 牌名字数组
     * @param {Function} callback - 关闭后回调
     */
    showTilePopup(title, rawTiles, callback) {
        this.clear();

        let tilesHtml = rawTiles.map(t => {
            return $('<span>').append(this._pai(t).clone())[0].outerHTML;
        }).join('');

        let html = `
            <div class="tile-popup-overlay">
                <div class="tile-popup-modal">
                    <div class="tile-popup-header">
                        <span class="tile-popup-title">${title}</span>
                        <button class="tile-popup-close">&times;</button>
                    </div>
                    <div class="tile-popup-body">
                        <div class="tile-popup-tiles">${tilesHtml}</div>
                        <div class="tile-popup-timer">2 秒后自动关闭</div>
                    </div>
                </div>
            </div>
        `;

        $(document.body).append(html);

        let overlay = $('.tile-popup-overlay');
        let timerDisplay = $('.tile-popup-timer');
        let startTime = Date.now();
        let closed = false;

        let close = () => {
            if (closed) return;
            closed = true;
            clearInterval(intervalId);
            $('.tile-popup-overlay').remove();
            $(document).off('keydown.tilepopup');
            if (callback) callback();
        };

        /* X 按钮关闭 */
        $('.tile-popup-close').on('click', close);

        /* 点击遮罩关闭 */
        overlay.on('click', (e) => {
            if (e.target === overlay[0]) close();
        });

        /* Esc 键关闭 */
        $(document).on('keydown.tilepopup', (ev) => {
            if (ev.key === 'Escape') close();
        });

        /* 倒计时显示 + 2秒自动关闭 */
        let intervalId = setInterval(() => {
            let elapsed = Date.now() - startTime;
            let remaining = Math.max(0, Math.ceil((2000 - elapsed) / 1000));
            timerDisplay.text(remaining + ' 秒后自动关闭');
            if (elapsed >= 2000) close();
        }, 200);
    }

    /* ================================================================
     * Human/AI 分支 UI helper
     *
     * 每个方法接受 isHuman 和 preChoice 参数：
     *   - isHuman=false：立即 callback(preChoice)，无 UI
     *   - isHuman=true：弹出 UI，超时后自动 fallback 到 preChoice
     *
     * preChoice 应始终由调用方先通过 AI 决策计算好。
     * ================================================================ */

    /**
     * 技能确认提示（是/否），带 Human/AI 分支。
     *
     * @param {string}   skillName   - 技能名称
     * @param {string}   description - 描述文字
     * @param {boolean}  isHuman     - 是否为人类玩家
     * @param {string}   preChoice   - AI 预选结果 ('yes' | 'no')，超时回退用
     * @param {number}   timeoutMs   - 超时毫秒数（默认 15000）
     * @param {Function} callback    - 回调 (choice)  choice: 'yes' | 'no'
     */
    askConfirmSkill(skillName, description, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice || 'no');
            return;
        }
        this.askConfirm(skillName, description, callback);
        /* 添加倒计时显示并启动倒计时 */
        let isMulti = typeof this._broadcastData === 'function';
        if (timeoutMs && isMulti) {
            this._node.find('.skill-prompt-text').append('<span class="skill-timeout"></span>');
            this._startCountdown(timeoutMs, isMulti, () => {
                if (this._callback === callback && this._node.hasClass('show')) {
                    this.clear();
                    callback(preChoice || 'no');
                }
            });
        }
    }

    /**
     * 多技能选择提示，带 Human/AI 分支。
     * 当同一时点有多个技能可触发时，让玩家选择先发动哪个。
     *
     * @param {Object[]} skills    - 技能列表 [{ id, name, description }, ...]
     * @param {boolean}  isHuman   - 是否为人类玩家
     * @param {Object}   preChoice - AI 预选结果 { id, name }，超时回退用
     * @param {number}   timeoutMs - 超时毫秒数（默认 15000）
     * @param {Function} callback  - 回调 (selectedSkill | null)
     */
    askWhichSkill(skills, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice || null);
            return;
        }
        if (!skills || skills.length === 0) {
            callback(null);
            return;
        }
        if (skills.length === 1) {
            callback(skills[0]);
            return;
        }
        let options = skills.map(s => ({
            label: s.name + (s.description ? ': ' + s.description : ''),
            value: s.id,
        }));
        let that = this;
        this.askOptions('选择要发动的技能', options, function(value) {
            let skill = skills.find(s => s.id == value);
            callback(skill || null);
        });
        /* 添加倒计时显示并启动倒计时 */
        let isMulti = typeof that._broadcastData === 'function';
        if (timeoutMs && isMulti) {
            that._node.find('.skill-prompt-text').append('<span class="skill-timeout"></span>');
            that._startCountdown(timeoutMs, isMulti, () => {
                if (that._callback === callback && that._node.hasClass('show')) {
                    that.clear();
                    callback(preChoice || null);
                }
            });
        }
    }

    /**
     * 从若干张牌中选择一张，带 Human/AI 分支。
     *
     * @param {string[]} tiles     - 候选牌列表，如 ['m1', 'p0', 's5']
     * @param {string}   description - 提示文字
     * @param {boolean}  isHuman   - 是否为人类玩家
     * @param {string}   preChoice - AI 预选牌，超时回退用
     * @param {number}   timeoutMs - 超时毫秒数（默认 15000）
     * @param {Function} callback  - 回调 (paiString | null)
     */
    pickOneTile(tiles, description, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice || null);
            return;
        }
        if (!tiles || tiles.length === 0) {
            callback(null);
            return;
        }
        if (tiles.length === 1) {
            callback(tiles[0]);
            return;
        }

        /* 显示牌选界面：用牌图片作为选项 */
        this.clear();
        this._callback = callback;
        let isMulti = typeof this._broadcastData === 'function';

        let timeoutSpan = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';
        let tilesHtml = tiles.map(t =>
            $('<span>').append(this._pai(t).clone().addClass('skill-prompt-tile-option'))[0].outerHTML
        ).join('');

        let html = `
            <div class="skill-prompt-text">${description || '选择一张牌'}${timeoutSpan}</div>
            <div class="skill-prompt-tiles">${tilesHtml}</div>
            <div class="skill-prompt-buttons">
                <button class="skill-prompt-no">取消</button>
            </div>
        `;
        this._node.html(html).addClass('show');

        /* 取消按钮 */
        let that = this;
        this._node.find('.skill-prompt-no').on('click.skill', () => {
            that._clearTimer();
            that.clear();
            callback(null);
        });

        /* 牌点击选择 */
        this._node.find('.skill-prompt-tile-option').on('click.skill', function() {
            let paiStr = $(this).data('pai') || $(this).attr('data-pai');
            that._clearTimer();
            that.clear();
            callback(paiStr || null);
        });

        /* 键盘取消 */
        $(document).on('keydown.skillprompt', (ev) => {
            if (ev.key === 'Escape') {
                $(document).off('keydown.skillprompt');
                that._clearTimer();
                that.clear();
                callback(null);
            }
        });

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            that._startCountdown(timeoutMs, isMulti, () => {
                if (that._callback === callback && that._node.hasClass('show')) {
                    that.clear();
                    callback(preChoice || null);
                }
            });
        }
    }

    /**
     * 数字选择（1~N），带 Human/AI 分支。
     *
     * @param {number}   max        - 最大可选数字（1～max）
     * @param {string}   description - 提示文字，如 '选择移动的张数'
     * @param {boolean}  isHuman   - 是否为人类玩家
     * @param {number}   preChoice - AI 预选数字，超时回退用
     * @param {number}   timeoutMs - 超时毫秒数（默认 15000）
     * @param {Function} callback  - 回调 (number)
     */
    pickNumber(max, description, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice || 1);
            return;
        }
        let options = [];
        for (let i = 1; i <= max; i++) {
            options.push({ label: String(i), value: i });
        }
        this.askOptions(description || '选择数量', options, function(value) {
            callback(parseInt(value) || 1);
        });

        /* 添加倒计时显示并启动倒计时 */
        let isMulti = typeof this._broadcastData === 'function';
        if (timeoutMs && isMulti) {
            let that = this;
            this._node.find('.skill-prompt-text').append('<span class="skill-timeout"></span>');
            this._startCountdown(timeoutMs, isMulti, () => {
                if (that._callback === callback && that._node.hasClass('show')) {
                    that.clear();
                    callback(preChoice || 1);
                }
            });
        }
    }

    /* ================================================================
     * 多张牌选择（有顺序）— 从展示的牌列表中选择指定数量
     * ================================================================ */

    /**
     * 从展示的牌中选择指定数量的牌（有顺序），带 Human/AI 分支。
     *
     * @param {string[]} tiles       - 候选牌列表
     * @param {number}   count       - 需选择的张数
     * @param {string}   description - 提示文字
     * @param {boolean}  isHuman     - 是否为人类玩家
     * @param {string[]} preChoice   - AI 预选结果（顺序数组），超时回退用
     * @param {number}   timeoutMs   - 超时毫秒数（默认 30000）
     * @param {Function} callback    - 回调 (selectedTiles[])  selectedTiles 为按选择顺序排列的牌数组
     */
    pickMultipleTiles(tiles, count, description, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice || []);
            return;
        }
        if (!tiles || tiles.length === 0 || count <= 0) {
            callback([]);
            return;
        }
        if (tiles.length <= count) {
            callback(tiles.slice());
            return;
        }

        this.clear();
        let selected = [];
        let that = this;
        let isMulti = typeof this._broadcastData === 'function';
        let timeoutSpanHtml = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';

        function buildHtml() {
            let statusText = description || '选择牌';
            if (count > 0) {
                statusText += ' （已选 ' + selected.length + '/' + count + ' 张）';
            }
            let tilesHtml = tiles.map((t, i) => {
                let isSel = selected.includes(t);
                let selNum = selected.indexOf(t);
                let cls = 'skill-prompt-tile-option' + (isSel ? ' selected' : '');
                let badge = isSel ? '<span class="tile-sel-badge">' + (selNum + 1) + '</span>' : '';
                return $('<span>').append(
                    that._pai(t).clone().addClass(cls).attr('data-index', i)
                )[0].outerHTML + badge;
            }).join('');

            let btnHtml = '<button class="skill-prompt-no">取消</button>';
            if (selected.length >= count) {
                btnHtml = '<button class="skill-prompt-done">确定</button>' + btnHtml;
            }

            return `
                <div class="skill-prompt-text">${statusText}${timeoutSpanHtml}</div>
                <div class="skill-prompt-tiles">${tilesHtml}</div>
                <div class="skill-prompt-buttons">${btnHtml}</div>
            `;
        }

        function refresh() {
            that._node.html(buildHtml());
            /* 绑定事件 */
            that._node.find('.skill-prompt-tile-option').on('click.skill', function() {
                let idx = parseInt($(this).attr('data-index'));
                let tile = tiles[idx];
                let pos = selected.indexOf(tile);
                if (pos >= 0) {
                    selected.splice(pos, 1);
                } else if (selected.length < count) {
                    selected.push(tile);
                }
                refresh();
            });
            that._node.find('.skill-prompt-done').on('click.skill', () => {
                that._clearTimer();
                that.clear();
                callback(selected.slice());
            });
            that._node.find('.skill-prompt-no').on('click.skill', () => {
                that._clearTimer();
                that.clear();
                callback(null);
            });
        }

        this._node.html(buildHtml()).addClass('show');
        this._callback = callback;
        /* 绑定初始事件 */
        this._node.find('.skill-prompt-tile-option').on('click.skill', function() {
            let idx = parseInt($(this).attr('data-index'));
            let tile = tiles[idx];
            let pos = selected.indexOf(tile);
            if (pos >= 0) {
                selected.splice(pos, 1);
            } else if (selected.length < count) {
                selected.push(tile);
            }
            refresh();
        });
        this._node.find('.skill-prompt-no').on('click.skill', () => {
            that._clearTimer();
            that.clear();
            callback(null);
        });

        /* 键盘 */
        $(document).on('keydown.skillprompt', (ev) => {
            if (ev.key === 'Escape') {
                $(document).off('keydown.skillprompt');
                that._clearTimer();
                that.clear();
                callback(null);
            } else if (ev.key === 'Enter' && selected.length >= count) {
                $(document).off('keydown.skillprompt');
                that._clearTimer();
                that.clear();
                callback(selected.slice());
            }
        });

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            that._startCountdown(timeoutMs, isMulti, () => {
                if (that._callback === callback && that._node.hasClass('show')) {
                    that.clear();
                    callback(preChoice || []);
                }
            });
        }
    }

    /**
     * 从展示的牌中选择数量范围内的牌（有顺序），带 Human/AI 分支。
     *
     * @param {string[]} tiles       - 候选牌列表
     * @param {number}   minCount    - 最少选择张数
     * @param {number}   maxCount    - 最多选择张数
     * @param {string}   description - 提示文字
     * @param {boolean}  isHuman     - 是否为人类玩家
     * @param {string[]} preChoice   - AI 预选结果，超时回退用
     * @param {number}   timeoutMs   - 超时毫秒数
     * @param {Function} callback    - 回调 (selectedTiles[])
     */
    pickMultipleTilesRange(tiles, minCount, maxCount, description, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice || []);
            return;
        }
        if (!tiles || tiles.length === 0) {
            callback([]);
            return;
        }

        this.clear();
        let selected = [];
        let that = this;
        let isMulti = typeof this._broadcastData === 'function';
        let timeoutSpanHtml = (timeoutMs && isMulti) ? '<span class="skill-timeout"></span>' : '';

        function buildHtml() {
            let statusText = description || '选择牌';
            statusText += ' （已选 ' + selected.length + ' 张，需 ' + minCount + '~' + maxCount + ' 张）';
            let tilesHtml = tiles.map((t, i) => {
                let isSel = selected.includes(t);
                let selNum = selected.indexOf(t);
                let cls = 'skill-prompt-tile-option' + (isSel ? ' selected' : '');
                let badge = isSel ? '<span class="tile-sel-badge">' + (selNum + 1) + '</span>' : '';
                return $('<span>').append(
                    that._pai(t).clone().addClass(cls).attr('data-index', i)
                )[0].outerHTML + badge;
            }).join('');

            let btnHtml = '<button class="skill-prompt-no">取消</button>';
            if (selected.length >= minCount) {
                btnHtml = '<button class="skill-prompt-done">确定</button>' + btnHtml;
            }

            return `
                <div class="skill-prompt-text">${statusText}${timeoutSpanHtml}</div>
                <div class="skill-prompt-tiles">${tilesHtml}</div>
                <div class="skill-prompt-buttons">${btnHtml}</div>
            `;
        }

        function refresh() {
            that._node.html(buildHtml());
            that._node.find('.skill-prompt-tile-option').on('click.skill', function() {
                let idx = parseInt($(this).attr('data-index'));
                let tile = tiles[idx];
                let pos = selected.indexOf(tile);
                if (pos >= 0) {
                    selected.splice(pos, 1);
                } else if (selected.length < maxCount) {
                    selected.push(tile);
                }
                refresh();
            });
            that._node.find('.skill-prompt-done').on('click.skill', () => {
                that._clearTimer();
                that.clear();
                callback(selected.slice());
            });
            that._node.find('.skill-prompt-no').on('click.skill', () => {
                that._clearTimer();
                that.clear();
                callback(null);
            });
        }

        this._node.html(buildHtml()).addClass('show');
        this._callback = callback;
        this._node.find('.skill-prompt-tile-option').on('click.skill', function() {
            let idx = parseInt($(this).attr('data-index'));
            let tile = tiles[idx];
            let pos = selected.indexOf(tile);
            if (pos >= 0) {
                selected.splice(pos, 1);
            } else if (selected.length < maxCount) {
                selected.push(tile);
            }
            refresh();
        });
        this._node.find('.skill-prompt-no').on('click.skill', () => {
            that._clearTimer();
            that.clear();
            callback(null);
        });

        $(document).on('keydown.skillprompt', (ev) => {
            if (ev.key === 'Escape') {
                $(document).off('keydown.skillprompt');
                that._clearTimer();
                that.clear();
                callback(null);
            } else if (ev.key === 'Enter' && selected.length >= minCount) {
                $(document).off('keydown.skillprompt');
                that._clearTimer();
                that.clear();
                callback(selected.slice());
            }
        });

        /* 倒计时 */
        if (timeoutMs && isMulti) {
            that._startCountdown(timeoutMs, isMulti, () => {
                if (that._callback === callback && that._node.hasClass('show')) {
                    that.clear();
                    callback(preChoice || []);
                }
            });
        }
    }

    /* ================================================================
     * 文字选项 — 提供多个文字选项供玩家选择
     * ================================================================ */

    /**
     * 提供多个文字选项，带 Human/AI 分支。
     * 底层调用 askOptions，外层做 Human/AI + 超时回退。
     *
     * @param {string}   title       - 提示标题
     * @param {Object[]} options     - 选项列表 [{ label: '显示文字', value: any }, ...]
     * @param {boolean}  isHuman     - 是否为人类玩家
     * @param {*}        preChoice   - AI 预选值，超时回退用
     * @param {number}   timeoutMs   - 超时毫秒数（默认 15000）
     * @param {Function} callback    - 回调 (value | null)
     */
    askTextOptions(title, options, isHuman, preChoice, timeoutMs, callback) {
        if (!isHuman) {
            callback(preChoice !== undefined ? preChoice : null);
            return;
        }
        if (!options || options.length === 0) {
            callback(null);
            return;
        }
        if (options.length === 1) {
            callback(options[0].value);
            return;
        }

        this.askOptions(title, options, (value) => {
            callback(value);
        });

        /* 添加倒计时显示并启动倒计时 */
        let isMulti = typeof this._broadcastData === 'function';
        if (timeoutMs && isMulti) {
            let that = this;
            this._node.find('.skill-prompt-text').append('<span class="skill-timeout"></span>');
            this._startCountdown(timeoutMs, isMulti, () => {
                if (that._callback === callback && that._node.hasClass('show')) {
                    that.clear();
                    callback(preChoice !== undefined ? preChoice : null);
                }
            });
        }
    }

    /* ================================================================
     * 手牌多选（有顺序）— 从手牌中选择指定数量的牌
     * ================================================================ */

    /**
     * 从手牌中选择指定数量的牌（有顺序），带 Human/AI 分支。
     *
     * @param {number}   count       - 需选择的张数
     * @param {string}   description - 提示文字
     * @param {boolean}  isHuman     - 是否为人类玩家
     * @param {string[]} preChoice   - AI 预选结果（顺序数组），超时回退用
     * @param {number}   timeoutMs   - 超时毫秒数（默认 30000）
     * @param {Function} callback    - 回调 (selectedTiles[])
     * @param {string[]} [validTiles] - 可选牌列表（过滤）
     */
    pickHandTiles(count, description, isHuman, preChoice, timeoutMs, callback, validTiles, opts) {
        if (!isHuman) {
            callback(preChoice || []);
            return;
        }
        opts = opts || {};
        this.clear();
        let selected = {};
        let selectedOrder = [];
        let that = this;
        let isMulti = typeof this._broadcastData === 'function';

        let confirmTextDefault = opts.confirmText || ('确定（0/' + count + '张）');
        let confirmTextFn = opts.confirmText
            ? () => opts.confirmText
            : () => '确定（' + selectedOrder.length + '/' + count + '张）';
        let descSuffix = opts.hideCount ? '' : ' （已选 0/' + count + '）';
        let descSuffixFn = opts.hideCount
            ? () => ''
            : () => ' （已选 ' + selectedOrder.length + '/' + count + '）';

        let btns = `<button class="skill-prompt-yes" disabled>${confirmTextDefault}</button>`;
        if (!opts.noCancel) {
            btns += '\n            <button class="skill-prompt-no">取消</button>';
        }
        let html = `
            <div class="skill-prompt-text">
                ${description || '选择手牌'}${descSuffix}
                ${isMulti ? '<span class="skill-timeout"></span>' : ''}
            </div>
            <div class="skill-prompt-buttons">${btns}</div>
        `;
        this._node.html(html).addClass('show');
        this._callback = callback;

        let updateUI = () => {
            that._refreshHandPrompt(selectedOrder,
                (description || '选择手牌') + descSuffixFn()
                    + (isMulti ? '<span class="skill-timeout"></span>' : ''),
                confirmTextFn(),
                selectedOrder.length === count
            );
        };

        this._highlightHandOrdered((entry) => {
            let {pai, idx} = entry;
            if (selected[idx]) {
                delete selected[idx];
                selectedOrder = selectedOrder.filter(s => s.idx !== idx);
            } else if (Object.keys(selected).length < count) {
                selected[idx] = {pai, idx};
                selectedOrder.push({pai, idx});
            }
            updateUI();
        }, validTiles);

        this._node.find('.skill-prompt-yes').on('click', () => {
            if (selectedOrder.length !== count) return;
            that._clearTimer();
            that._unhighlightHand();
            that.clear();
            that._clearHandBadges();
            callback(selectedOrder.map(s => s.pai));
        });
        this._node.find('.skill-prompt-no').on('click', () => {
            that._clearTimer();
            that._unhighlightHand();
            that.clear();
            that._clearHandBadges();
            callback(null);
        });

        this._startCountdown(timeoutMs, isMulti, () => {
            if (that._callback === callback && that._node.hasClass('show')) {
                that._unhighlightHand();
                that.clear();
                that._clearHandBadges();
                callback(preChoice || []);
            }
        });
    }

    /**
     * 从手牌中选择数量范围内的牌（有顺序），带 Human/AI 分支。
     */
    pickHandTilesRange(minCount, maxCount, description, isHuman, preChoice, timeoutMs, callback, validTiles) {
        if (!isHuman) {
            callback(preChoice || []);
            return;
        }
        this.clear();
        let selected = {};
        let selectedOrder = [];
        let that = this;
        let isMulti = typeof this._broadcastData === 'function';

        let rangeText = minCount === maxCount ? `${minCount}张` : `${minCount}~${maxCount}张`;
        let btnLabel = minCount > 0 ? `确定（0/${rangeText}）` : '确定（0张）';
        let btns = `
            <button class="skill-prompt-yes" ${minCount > 0 ? 'disabled' : ''}>${btnLabel}</button>
            <button class="skill-prompt-no">取消</button>`;
        let html = `
            <div class="skill-prompt-text">
                ${description || '选择手牌'} （${minCount === 0 ? '可不选' : '需选' + minCount}~${maxCount}张，已选0张）
                ${isMulti ? '<span class="skill-timeout"></span>' : ''}
            </div>
            <div class="skill-prompt-buttons">${btns}</div>
        `;
        this._node.html(html).addClass('show');
        this._callback = callback;

        let updateUI = () => {
            that._refreshHandPrompt(selectedOrder,
                (description || '选择手牌') + ' （' + (minCount === 0 ? '可不选' : '需选' + minCount) + '~' + maxCount + '张，已选' + selectedOrder.length + '张）'
                    + (isMulti ? '<span class="skill-timeout"></span>' : ''),
                '确定（' + selectedOrder.length + '张）',
                selectedOrder.length >= minCount
            );
        };

        this._highlightHandOrdered((entry) => {
            let {pai, idx} = entry;
            if (selected[idx]) {
                delete selected[idx];
                selectedOrder = selectedOrder.filter(s => s.idx !== idx);
            } else if (Object.keys(selected).length < maxCount) {
                selected[idx] = {pai, idx};
                selectedOrder.push({pai, idx});
            }
            updateUI();
        }, validTiles);

        this._node.find('.skill-prompt-yes').on('click', () => {
            if (selectedOrder.length < minCount) return;
            that._clearTimer();
            that._unhighlightHand();
            that.clear();
            that._clearHandBadges();
            callback(selectedOrder.map(s => s.pai));
        });
        this._node.find('.skill-prompt-no').on('click', () => {
            that._clearTimer();
            that._unhighlightHand();
            that.clear();
            that._clearHandBadges();
            callback(null);
        });

        this._startCountdown(timeoutMs, isMulti, () => {
            if (that._callback === callback && that._node.hasClass('show')) {
                that._unhighlightHand();
                that.clear();
                that._clearHandBadges();
                callback(preChoice || []);
            }
        });
    }

    /**
     * 高亮自家手牌（有顺序多选模式）。
     * @param {Function} onToggle - 切换选择回调 ({pai, idx})
     * @param {string[]} [validTiles] - 可选牌列表
     */
    _highlightHandOrdered(onToggle, validTiles) {
        let idx = 0;
        $('.shoupai.main .bingpai > .pai, .shoupai.main .zimo > .pai').each(function() {
            let $pai = $(this);
            let paiStr = $pai.data('pai') || $pai.attr('data-pai');
            if (validTiles && (!paiStr || !validTiles.includes(paiStr))) {
                $pai.removeAttr('data-hand-idx');
                return;
            }
            /* wrap <img class="pai"> in <span class="pai-badge-wrap"> for badge positioning */
            if (!$pai.parent().hasClass('pai-badge-wrap')) {
                $pai.wrap('<span class="pai-badge-wrap"></span>');
            }
            $pai.attr('data-hand-idx', idx);
            $pai.addClass('skill-selectable');
            let capturedIdx = idx;
            let capturedPai = paiStr;
            $pai.off('click.skillpai').on('click.skillpai', function(ev) {
                ev.stopPropagation();
                if (capturedPai) onToggle({pai: capturedPai, idx: capturedIdx});
            });
            idx++;
        });
        /* 防止 badge 被 overflow:hidden 裁剪 */
        if (idx > 0) {
            $('.shoupai.main .bingpai').css('overflow', 'visible');
            $('.shoupai.main').closest('.player').css('overflow', 'visible');
        }
    }

    /**
     * 同时刷新手牌 badge 和技能提示 UI（文字 + 按钮状态）。
     *
     * pickHandTiles / pickHandTilesRange 中的 updateUI 必须通过此方法执行，
     * 不可单独调用 _updateHandBadges，否则提示文字和按钮状态不会同步刷新，
     * 会导致两个 view（手牌 badge + 提示面板）不一致的问题。
     *
     * @param {Object[]} selectedOrder - 已选列表 [{pai, idx}]
     * @param {string}   textHtml      - skill-prompt-text 的 innerHTML
     * @param {string}   btnText       - 确定按钮文字
     * @param {boolean}  btnEnabled    - 确定按钮是否可用
     */
    _refreshHandPrompt(selectedOrder, textHtml, btnText, btnEnabled) {
        this._updateHandBadges(selectedOrder);
        this._node.find('.skill-prompt-text').html(textHtml);
        let $yes = this._node.find('.skill-prompt-yes');
        $yes.text(btnText);
        if (btnEnabled) $yes.removeAttr('disabled');
        else $yes.attr('disabled', 'disabled');
    }

    /**
     * 更新手牌上的选择序号 badge。
     * @param {Object[]} selectedOrder - 已选列表 [{pai, idx}]
     */
    _updateHandBadges(selectedOrder) {
        const CIRCLE = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭'];
        $('.pai-badge-wrap').find('.tile-sel-badge').remove()
            .end().removeClass('hand-selected');
        for (let i = 0; i < selectedOrder.length; i++) {
            let idx = selectedOrder[i].idx;
            let label = CIRCLE[i] || '(' + (i + 1) + ')';
            let $wrap = $('.pai-badge-wrap').has('[data-hand-idx="' + idx + '"]').first();
            $wrap.addClass('hand-selected')
                .append('<span class="tile-sel-badge">' + label + '</span>');
        }
    }

    /**
     * 清除手牌上的选择序号 badge。
     */
    _clearHandBadges() {
        $('.pai-badge-wrap').find('.tile-sel-badge').remove()
            .end().removeClass('hand-selected');
    }

    /**
     * 取消手牌高亮，并恢复原始 DOM 结构
     */
    _unhighlightHand() {
        $('.pai-badge-wrap').removeClass('hand-selected')
            .find('.tile-sel-badge').remove();
        $('.pai-badge-wrap > .pai')
            .removeClass('skill-selectable')
            .removeAttr('data-hand-idx')
            .off('click.skillpai')
            .unwrap();
        $('.shoupai.main .bingpai').css('overflow', '');
        $('.shoupai.main').closest('.player').css('overflow', '');
    }

    /**
     * 启动倒计时（仅联机模式），并显示在 .skill-timeout 中。
     * @param {number}   timeoutMs - 超时毫秒，0 或不传则跳过
     * @param {boolean}  isMulti   - 联机模式
     * @param {Function} onTimeout - 超时回调
     */
    _startCountdown(timeoutMs, isMulti, onTimeout) {
        if (!timeoutMs || !isMulti) return;
        let remaining = Math.ceil(timeoutMs / 1000);
        let self = this;
        let updateDisplay = () => {
            let $el = self._node.find('.skill-timeout');
            if ($el.length) $el.text('（' + remaining + 's）');
        };
        updateDisplay();
        this._timerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                this._clearTimer();
                onTimeout();
            } else {
                updateDisplay();
            }
        }, 1000);
    }

    /**
     * 清除倒计时定时器
     */
    _clearTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    /* ================================================================
     * 通用
     * ================================================================ */

    /**
     * 清除所有提示
     */
    clear() {
        this._visible = false;
        this._callback = null;
        this._node.empty().removeClass('show');
        $(document).off('keydown.skillprompt');
        this._unhighlightRiver();
        this._unhighlightHand();
        this._clearHandBadges();
    }

    /**
     * 是否正在显示
     */
    get visible() {
        return this._visible;
    }
};
