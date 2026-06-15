/*
 *  Majiang.UI.Toast
 *  轻量提示框：展示牌张或文字信息，2 秒后自动关闭，也可手动关闭
 *
 *  用法:
 *    let toast = new Majiang.UI.Toast(pai);
 *    toast.show({ tiles: ['m1', 'p5'], text: '演示提示' });
 *    toast.show({ text: '这是一条纯文字提示' });
 *    toast.show({ tiles: ['z7'], text: '海底牌', duration: 3000 });
 */

"use strict";

const $ = require('jquery');

class Toast {

    constructor(pai) {
        this._pai = pai;
        this._overlay = null;
        this._timerId = null;
        this._closed = false;
    }

    /**
     * 显示提示框
     *
     * @param {Object} options
     * @param {string[]} [options.tiles]    - 牌名字数组（如 ['m1', 'p5']）
     * @param {string}   [options.text]     - 文字内容（纯文本或 HTML）
     * @param {number}   [options.duration] - 显示毫秒数（默认 2000）
     * @param {Function} [options.onClose]  - 关闭后回调
     */
    show(options) {
        let opts = options || {};
        let duration = opts.duration || 2000;

        /* 先清除旧的 */
        this.close();

        this._closed = false;

        let tilesHtml = '';
        if (opts.tiles && opts.tiles.length) {
            tilesHtml = opts.tiles.map(t => {
                let img = this._pai(t);
                return $('<span class="toast-tile">').append(img)[0].outerHTML;
            }).join('');
        }

        let textHtml = '';
        if (opts.text) {
            textHtml = `<div class="toast-text">${opts.text}</div>`;
        }

        let html = `
            <div class="toast-overlay">
                <div class="toast-modal">
                    <div class="toast-header">
                        <span class="toast-title">提示</span>
                        <button class="toast-close">&times;</button>
                    </div>
                    <div class="toast-body">
                        ${tilesHtml ? `<div class="toast-tiles">${tilesHtml}</div>` : ''}
                        ${textHtml}
                        <div class="toast-timer">${Math.ceil(duration / 1000)} 秒后自动关闭</div>
                    </div>
                </div>
            </div>
        `;

        $(document.body).append(html);

        let $overlay = $('.toast-overlay');
        let overlayEl = $overlay[0];
        let timerDisplay = $('.toast-timer');
        let startTime = Date.now();
        let self = this;

        let doClose = () => {
            if (self._closed) return;
            self._closed = true;
            clearInterval(self._timerId);
            $overlay.remove();
            $(document).off('keydown.toast');
            if (opts.onClose) opts.onClose();
        };

        /* X 按钮 */
        $('.toast-close').on('click', doClose);

        /* 点击遮罩 */
        $overlay.on('click', (e) => {
            if (e.target === overlayEl) doClose();
        });

        /* Esc 键 */
        $(document).on('keydown.toast', (ev) => {
            if (ev.key === 'Escape') doClose();
        });

        /* 倒计时 */
        this._timerId = setInterval(() => {
            let elapsed = Date.now() - startTime;
            let remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
            timerDisplay.text(remaining + ' 秒后自动关闭');
            if (elapsed >= duration) doClose();
        }, 200);
    }

    /**
     * 手动关闭提示框
     */
    close() {
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
        $('.toast-overlay').remove();
        $(document).off('keydown.toast');
        this._closed = false;
    }
}

module.exports = Toast;
