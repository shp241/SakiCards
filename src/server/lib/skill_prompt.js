/**
 * MultiplayerSkillPrompt — 联机技能提示适配器
 *
 * 实现与 SkillPrompt (src/ui/skill_prompt.js) 完全相同的接口，
 * 但通过 WebSocket 与客户端通信，而不是直接操作 DOM。
 *
 * 这样父类 Game 中的 5 个技能交互方法无需任何修改，
 * 单机和联机共用同一套技能逻辑。
 */
"use strict";

class MultiplayerSkillPrompt {

    /**
     * @param {ServerGame} game - 联机 ServerGame 实例
     */
    constructor(game) {
        this._game = game;
        this._promptSeq = 0;

        /**
         * 当前提示的目标座位号（model 席位 0-3）。
         * 由父类 Game 在调用 skillPrompt 方法前设置。
         */
        this._targetSeat = null;
    }

    /* ================================================================
     *  内部：发送提示并等待回复
     * ================================================================ */

    /**
     * 内部：广播数据到所有已连接玩家（fire-and-forget，不等待回复）
     * @param {object} data — 发送到客户端的数据
     */
    _broadcastData(data) {
        for (let l = 0; l < 4; l++) {
            let id = this._game._plIdx(l);  // seat l → plIdx
            let s = this._game._players[id];
            if (s) {
                s.emit('GAME', data);
            }
        }
    }

    /**
     * 内部：发送数据到指定座位的玩家（仅一名玩家）
     * @param {object} data — 发送到客户端的数据
     * @param {number} seat — 目标座号（0-3）
     */
    _sendToSeat(data, seat) {
        let id = this._game._plIdx(seat);
        let s = this._game._players[id];
        if (s) {
            console.log(`[MultiSkillPrompt] _sendToSeat seat=${seat} plIdx=${id} data=`, Object.keys(data));
            s.emit('GAME', data);
        } else {
            console.log(`[MultiSkillPrompt] _sendToSeat seat=${seat} plIdx=${id} NO SOCKET`);
        }
    }

    /* ================================================================
     *  内部：发送提示并等待回复
     * ================================================================ */

    /**
     * 通过 WebSocket 发送技能提示，等待 SKILL_REPLY
     * @param {object} data   — 提示数据
     * @param {function} callback(reply) — 收到回复后的回调
     * @param {number} timeout — 超时毫秒数
     */
    _sendPrompt(data, callback, timeout = 15000) {
        let seat = this._targetSeat;
        if (seat === null) {
            seat = this._game._model.lunban;
        }
        let socketId = this._game._plIdx(seat);  // seat → plIdx → socket
        let sock = this._game._players[socketId];

        if (!sock) {
            /* 无客户端连接（AI 或断线），由父类 AI 分支处理 */
            callback(null);
            return;
        }

        let promptId = ++this._promptSeq;
        /* 使用 per-prompt 唯一事件名，避免 removeAllListeners 误删其它 prompt 的监听器 */
        let replyEvent = 'SKILL_REPLY_' + promptId;

        console.log(`[MultiSkillPrompt] _sendPrompt promptId=${promptId} type=${data.promptType} seat=${seat} socketId=${socketId}`);
        sock.emit('GAME', {
            skill_prompt: Object.assign({ promptId: promptId, timeout: timeout }, data)
        });

        let handled = false;
        let timerId = setTimeout(() => {
            if (handled) return;
            handled = true;
            console.log(`[MultiSkillPrompt] _sendPrompt TIMEOUT promptId=${promptId} type=${data.promptType}`);
            sock.removeAllListeners(replyEvent);
            callback(null);
        }, timeout);

        sock.once(replyEvent, (reply) => {
            if (handled) return;
            handled = true;
            clearTimeout(timerId);
            console.log(`[MultiSkillPrompt] _sendPrompt REPLY promptId=${promptId} type=${data.promptType} reply=`, reply);
            callback(reply || {});
        });
    }

    /* ================================================================
     *  公开接口（与 SkillPrompt 完全一致）
     * ================================================================ */

    /**
     * 是/否确认提示
     * @param {string} skillName   — 技能名称
     * @param {string} description — 提示文字
     * @param {function} callback('yes'|'no')
     */
    askConfirm(skillName, description, callback) {
        this._sendPrompt({
            promptType: 'confirm',
            description: description,
            choices: ['发动', '不发动']
        }, (reply) => {
            if (reply && reply.choice === 0) callback('yes');
            else callback('no');
        });
    }

    /**
     * 多选项提示
     * @param {string} description          — 提示文字
     * @param {object[]} options            — [{label, value}, ...]
     * @param {function} callback(valueStr) — 返回所选 value
     */
    askOptions(description, options, callback) {
        this._sendPrompt({
            promptType: 'options',
            description: description,
            choices: options
        }, (reply) => {
            if (reply && reply.choice !== undefined && reply.choice !== null) {
                callback(String(reply.choice));
            } else {
                /* 超时默认选最后一项（通常为"不交换/取消"） */
                let defaultValue = (options && options.length > 0)
                    ? String(options[options.length - 1].value)
                    : '0';
                callback(defaultValue);
            }
        });
    }

    /**
     * 牌河选牌提示
     * @param {string} description                    — 提示文字
     * @param {function} callback(paiStr, seat, index) — 选中牌或 null
     */
    askRiverTile(description, callback) {
        let riverTiles = this._game._getAllRiverTiles();
        this._sendPrompt({
            promptType: 'river_tile',
            description: description,
            choices: riverTiles
        }, (reply) => {
            if (reply && reply.paiStr) {
                callback(reply.paiStr, reply.seat, reply.index);
            } else {
                callback(null);
            }
        });
    }

    /**
     * 手牌选牌提示
     * @param {string} description             — 提示文字
     * @param {function} callback(paiStr|null)
     * @param {string[]} [validTiles]          — 可选牌过滤列表
     */
    askHandTile(description, callback, validTiles) {
        this._sendPrompt({
            promptType: 'hand_tile',
            description: description,
            validTiles: validTiles || null
        }, (reply) => {
            callback(reply && reply.paiStr ? reply.paiStr : null);
        });
    }

    /**
     * 从手牌中选择固定数量张牌（有序多选），与 DOM SkillPrompt.pickHandTiles 同签名
     * @param {number} count
     * @param {string} description
     * @param {boolean} isHuman
     * @param {string[]} [preChoice]
     * @param {number} [timeoutMs]
     * @param {function} callback(tiles|null) — 返回牌名数组或 null
     * @param {string[]} [validTiles]
     * @param {object} [opts]
     */
    pickHandTiles(count, description, isHuman, preChoice, timeoutMs, callback, validTiles, opts) {
        if (!isHuman) {
            callback(preChoice || []);
            return;
        }
        this._sendPrompt({
            promptType: 'hand_tiles',
            description: description,
            count: count,
            validTiles: validTiles || null,
            opts: opts || null
        }, (reply) => {
            callback(reply && reply.tiles ? reply.tiles : null);
        }, timeoutMs || 15000);
    }

    /**
     * 从手牌中选择范围数量张牌（有序多选），与 DOM SkillPrompt.pickHandTilesRange 同签名
     * @param {number} minCount
     * @param {number} maxCount
     * @param {string} description
     * @param {boolean} isHuman
     * @param {string[]} [preChoice]
     * @param {number} [timeoutMs]
     * @param {function} callback(tiles|null)
     * @param {string[]} [validTiles]
     */
    pickHandTilesRange(minCount, maxCount, description, isHuman, preChoice, timeoutMs, callback, validTiles) {
        if (!isHuman) {
            callback(preChoice || []);
            return;
        }
        this._sendPrompt({
            promptType: 'hand_tiles_range',
            description: description,
            minCount: minCount,
            maxCount: maxCount,
            validTiles: validTiles || null
        }, (reply) => {
            callback(reply && reply.tiles ? reply.tiles : null);
        }, timeoutMs || 15000);
    }

    /**
     * 浮窗展示牌信息（广播给所有玩家，包括 bot 座位）
     * 等待目标玩家关闭弹窗（SKILL_REPLY）后才触发回调，
     * 避免竞态条件干扰后续的 askOptions 等交互式提示。
     * @param {string} title           — 标题
     * @param {string[]} rawTiles      — 牌名字数组
     * @param {function} callback      — 关闭后回调
     */
    showTilePopup(title, rawTiles, callback) {
        let seat = this._targetSeat;
        if (seat === null) {
            seat = this._game._model.lunban;
        }
        let socketId = this._game._plIdx(seat);  // seat → plIdx → socket
        let sock = this._game._players[socketId];

        let promptId = ++this._promptSeq;
        let data = {
            skill_prompt: {
                promptId: promptId,
                promptType: 'tile_popup',
                title: title,
                tiles: rawTiles,
                timeout: 5000
            }
        };

        console.log(`[MultiSkillPrompt] showTilePopup promptId=${promptId} seat=${seat} socketId=${socketId}`);
        /* 广播给所有已连接的玩家 */
        this._broadcastData(data);

        /* 等待目标玩家关闭弹窗（或超时回退） */
        if (sock) {
            let replyEvent = 'SKILL_REPLY_' + promptId;
            let handled = false;
            let timerId = setTimeout(() => {
                if (handled) return;
                handled = true;
                console.log(`[MultiSkillPrompt] showTilePopup TIMEOUT promptId=${promptId}`);
                sock.removeAllListeners(replyEvent);
                if (callback) callback();
            }, 5000);

            sock.once(replyEvent, (reply) => {
                if (handled) return;
                handled = true;
                clearTimeout(timerId);
                console.log(`[MultiSkillPrompt] showTilePopup REPLY promptId=${promptId}`);
                if (callback) callback();
            });
        } else {
            /* 无目标 socket（bot 座位）：2 秒后自动回调 */
            setTimeout(() => {
                if (callback) callback();
            }, 2000);
        }
    }

    /**
     * 数字选择提示（服务器专用）
     * @param {number} max          — 最大可选数字（从 1 开始）
     * @param {string} title        — 提示标题
     * @param {boolean} modal       — 是否模态（服务器忽略，由客户端决定）
     * @param {*} placeholder       — 占位符（服务器忽略）
     * @param {number} timeout      — 超时毫秒数
     * @param {function} callback   — 回调(choiceNumber|null)
     */
    pickNumber(max, title, modal, placeholder, timeout, callback) {
        let opts = [];
        for (let i = 1; i <= max; i++) {
            opts.push({ label: String(i), value: i });
        }
        this._sendPrompt({
            promptType: 'options',
            description: title,
            choices: opts
        }, (reply) => {
            if (reply && reply.choice !== undefined && reply.choice !== null) {
                callback(Number(reply.choice));
            } else {
                callback(null);
            }
        }, timeout);
    }

    /**
     * 文字选项提示（服务器专用）
     * @param {string} title        — 提示标题
     * @param {object[]} opts       — [{label, value}, ...]
     * @param {boolean} modal       — 是否模态（服务器忽略）
     * @param {*} placeholder       — 占位符（服务器忽略）
     * @param {number} timeout      — 超时毫秒数
     * @param {function} callback   — 回调(value|null)
     */
    askTextOptions(title, opts, modal, placeholder, timeout, callback) {
        this._sendPrompt({
            promptType: 'options',
            description: title,
            choices: opts
        }, (reply) => {
            if (reply && reply.choice !== undefined && reply.choice !== null) {
                /* reply.choice 可能是 value 或索引，优先用 value */
                let choice = reply.choice;
                for (let o of opts) {
                    if (o.value === choice) {
                        callback(String(choice));
                        return;
                    }
                }
                /* 回退：按索引取 value */
                if (opts[choice] && opts[choice].value !== undefined) {
                    callback(String(opts[choice].value));
                } else {
                    callback(null);
                }
            } else {
                callback(null);
            }
        }, timeout);
    }

    /**
     * 清除所有提示
     * 联机模式下发送清除信号给客户端（客户端自行清理）
     */
    clear() {
        let seat = this._targetSeat;
        if (seat === null) {
            seat = this._game._model.lunban;
        }
        let socketId = this._game._plIdx(seat);  // seat → plIdx → socket
        let sock = this._game._players[socketId];
        if (sock) {
            sock.emit('GAME', {
                skill_prompt: { promptType: 'clear' }
            });
        }
        this._targetSeat = null;
    }
}

module.exports = MultiplayerSkillPrompt;
