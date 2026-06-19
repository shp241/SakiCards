/**
 * MultiplayerExchangePrompt — 联机交换提示适配器
 *
 * 实现与 ExchangePrompt (src/ui/exchange_prompt.js) 完全相同的接口，
 * 但通过 WebSocket 与客户端通信，而不是直接操作 DOM。
 *
 * 这样父类 Game 中的交换逻辑无需任何修改，
 * 单机和联机共用同一套交换界面代码。
 */
"use strict";

class MultiplayerExchangePrompt {

    /**
     * @param {ServerGame} game - 联机 ServerGame 实例
     */
    constructor(game) {
        this._game = game;
        this._promptSeq = 0;

        /**
         * 当前提示的目标座位号（model 席位 0-3）。
         * 由父类 Game 在调用 prompt 方法前设置。
         */
        this._targetSeat = null;
    }

    /* ================================================================
     *  内部：发送提示并等待回复
     * ================================================================ */

    /**
     * 内部：发送数据到指定座位的玩家（仅一名玩家）
     */
    _sendToSeat(data, seat) {
        let id = this._game._plIdx(seat);
        let s = this._game._players[id];
        if (s) {
            console.log(`[MultiExchangePrompt] _sendToSeat seat=${seat} plIdx=${id}`);
            s.emit('GAME', data);
        }
    }

    /**
     * 通过 WebSocket 发送交换提示，等待 SKILL_REPLY
     */
    _sendPrompt(data, callback, timeout = 30000) {
        let seat = this._targetSeat;
        if (seat === null) {
            seat = this._game._model.lunban;
        }
        let socketId = this._game._plIdx(seat);
        let sock = this._game._players[socketId];

        if (!sock) {
            callback(null);
            return;
        }

        let promptId = ++this._promptSeq;
        let replyEvent = 'SKILL_REPLY_' + promptId;

        console.log(`[MultiExchangePrompt] _sendPrompt promptId=${promptId} type=${data.promptType} seat=${seat}`);

        sock.emit('GAME', {
            exchange_prompt: Object.assign({ promptId: promptId, timeout: timeout }, data)
        });

        let handled = false;
        let timerId = setTimeout(() => {
            if (handled) return;
            handled = true;
            console.log(`[MultiExchangePrompt] _sendPrompt TIMEOUT promptId=${promptId}`);
            sock.removeAllListeners(replyEvent);
            callback(null);
        }, timeout);

        sock.once(replyEvent, (reply) => {
            if (handled) return;
            handled = true;
            clearTimeout(timerId);
            console.log(`[MultiExchangePrompt] _sendPrompt REPLY promptId=${promptId} reply=`, reply);
            callback(reply || {});
        });
    }

    /* ================================================================
     *  公开接口（与 ExchangePrompt 一致）
     * ================================================================ */

    /**
     * 显示交换界面
     *
     * 全屏覆盖式布局，客户端自动读取自家手牌和四家牌河，
     * 服务器只需传入中间展示的交换牌。
     *
     * @param {object}   options
     * @param {string[]} options.offerTiles        - 中间展示的交换牌
     * @param {string}   [options.source]          - 初始来源 hand|river|both
     * @param {boolean}  [options.allowSourceSwitch]
     * @param {number}   [options.swapCount]       - 最多交换几组
     * @param {string}   [options.condition]       - 匹配条件
     * @param {string}   [options.description]     - 提示文字
     * @param {Function} callback(swapPairs|null)
     */
    showExchange(options, callback) {
        let seat = this._targetSeat;
        if (seat === null) {
            seat = this._game._model.lunban;
        }
        let socketId = this._game._plIdx(seat);
        let sock = this._game._players[socketId];

        if (!sock) {
            callback(null);
            return;
        }

        this._sendPrompt({
            promptType: 'exchange',
            offerTiles: options.offerTiles || [],
            source: options.source || 'hand',
            allowSourceSwitch: options.allowSourceSwitch !== false,
            swapCount: options.swapCount || 1,
            condition: options.condition || 'none',
            description: options.description || '',
        }, (reply) => {
            if (reply && reply.swapPairs && reply.swapPairs.length > 0) {
                callback(reply.swapPairs);
            } else {
                callback(null);
            }
        }, 30000);
    }

    /**
     * 清除交换界面
     */
    clear() {
        let seat = this._targetSeat;
        if (seat === null) {
            seat = this._game._model.lunban;
        }
        let socketId = this._game._plIdx(seat);
        let sock = this._game._players[socketId];
        if (sock) {
            sock.emit('GAME', {
                exchange_prompt: { promptType: 'clear' }
            });
        }
        this._targetSeat = null;
    }
}

module.exports = MultiplayerExchangePrompt;
