/*
 *  game - 超能力麻将联机对局
 *
 *  继承 src/core/game.js（已含技能钩子），
 *  重写 call_players/notify_players 以通过 Socket.IO 通信。
 *
 *  基于 kobalab/majiang-server (https://github.com/kobalab/majiang-server)
 */
"use strict";

const Majiang = require('../../core');
const AI = require('../../ai');

/* 技能系统 */
const characters = require('../../skill/characters_skills');
const { SkillManager, AssignmentMode } = require('../../skill/index');
const MultiplayerSkillPrompt = require('./skill_prompt');
const MultiplayerExchangePrompt = require('./exchange_prompt');

function get_timer(type, limit, allowed = 0, wait) {
    if (type == 'jieju')                       return;
    if (type.match(/^(kaiju|hule|pingju)$/))    return  wait ? [ wait ] : null;
    else                                         return [ limit, allowed ];
}

function fakelag(type) {
    if (type != 'dapai') return 0;
    return Math.pow(Math.random(), 24) * 1600;
}

module.exports = class ServerGame extends Majiang.Game {

    constructor(socks, callback, rule, title, timer) {

        super(socks, callback, rule, title);

        this._model.title  = this._model.title.replace(/\n/, ': ネット対戦\n');
        this._model.player = socks.map(s=>s ? s.request.user.name : '(NOP)');
        this._uid          = socks.map(s=>s ? s.request.user.uid : null);
        this._socks        = socks;   // Socket.IO sockets
        this._seq = 0;
        this._timer = timer;
        this._time_allowed = [];
        this._time_limit   = [];
        this._timer_id     = [];

        /* ---- 超能力技能系统 ---- */
        this._skillEnabled = rule['技能模式'] !== '关闭';
        if (this._skillEnabled) {
            this._sm = new SkillManager({
                characters: characters,
                rule: rule,
            });
            this._skillManager = this._sm;  // 注入到父类
            this._sm.setGame(this);      // 设置游戏引用（供技能执行时使用）
            /* 注入联机技能提示适配器：所有玩家通过 WebSocket 交互，统一走父类逻辑 */
            this._skillPrompt = new MultiplayerSkillPrompt(this);
            /* 注入联机交换界面适配器 */
            this._exchangePrompt = new MultiplayerExchangePrompt(this);
        }

        /* 角色选择状态 */
        this._characterPhase = false;
        this._characterReplies = [];
        /**
         * _characterChoices[selectSeat]: 各 seat 的角色选择结果。
         * 按 seat 索引（0-3），在联机选择流程中由客户端回调填充。
         * seat 值与 character_pool 消息中的 seat 字段一一对应。
         */
        this._characterChoices = {};

        /* ================================================================
         * 索引体系 — 防止 seat / plIdx 混淆导致的 bug
         * ================================================================
         *
         * 联机模式中有两套独立的玩家索引：
         *
         *   seat  (0-3): 模型席位，玩家在"桌子"上的东南西北方向
         *                _activeCharacters 按 seat 索引
         *                model.shoupai[seat], model.he[seat], model.lunban 等都用 seat
         *                seat=0: 东家, seat=1: 南家, seat=2: 西家, seat=3: 北家
         *
         *   plIdx (0-3): _players[] / _uid[] / _aiPlayers[] 数组中的索引
         *                由 get_socks() 随机洗牌决定，运行期间不变
         *                seatToPlIdx[seat] = (qijia + seat + jushu) % 4 的返回值就是 plIdx
 *
 *   桥梁: model.seatToPlIdx[seat] = plIdx
 *         model.seatToPlIdx.indexOf(plIdx) = seat
         *
         * 命名约定（避免混淆）:
         *   - 循环变量 s / seat → 模型席位
         *   - 循环变量 p / plIdx → 玩家数组索引
         *   - 辅助方法 _plIdx(seat) → 将 seat 转为 plIdx
         *
         * 使用规则:
         *   - 模型层面（SkillManager, shoupai, he 等）→ 用 seat
         *   - 网络/AI 层面（_players, _aiPlayers, 发消息）→ 用 plIdx
         *   - 辅助方法 _plIdx(seat) / _isAI(seat) 负责转换，严禁直接索引 _aiPlayers
         * ================================================================ */

        /* ---- AI 玩家实例（bot 玩家：按 plIdx 索引，与 _players 一致）---- */
        this._aiPlayers = {};
        for (let i = 0; i < 4; i++) {
            let sock = socks[i];
            let isBot = sock && sock.request && sock.request.user
                && (sock.request.user.name || '').startsWith('机器人');
            if (isBot) {
                this._aiPlayers[i] = new AI();
            }
        }

        /* 语音角色分配（暂存，连接时发送）
         * _voiceChars[plIdx] = voiceCharKey | null，与 _players 同索引 */
        this._voiceChars = [null, null, null, null];

        /* 动作日志已发送计数（用于增量推送到客户端） */
        this._lastSentActionLogCount = 0;

        /* 牌局重开时重置日志计数 */
        this._onKaijuReset = () => {
            this._lastSentActionLogCount = 0;
        };

        socks.forEach(s=>this.connect(s));
    }

    /* ================================================================
     *  连接管理
     * ================================================================ */

    connect(sock) {
        if (! sock) return;
        let id = this._uid.indexOf(sock.request.user.uid);
        this._players[id] = sock;   // 父类的 _players 存 Socket
        /* 清除断线标记 */
        if (this._disconnectTime) delete this._disconnectTime[id];
        sock.emit('START');

        /* 发送对局状态 */
        if (this._seq) {
            let msg = { kaiju: {
                id: id,
                rule:      this._rule,
                title:     this._model.title,
                player:    this._model.player,
                qijia:     this._model.qijia,
                jushu:     this._model.jushu || 0,
                character: this._model.character || [],
                skill:     !!this._skillManager,
                log:       this._paipu.log
            } };
            sock.emit('GAME', msg);
        }

        /* 发送语音角色 */
        if (this._voiceChars[id]) {
            sock.emit('GAME', { voice_char: this._voiceChars[id] });
        }

        sock.on('GAME', (reply)=>this.reply(id, reply));
        sock.on('CHARACTER', (choice)=>this._onCharacterChoice(id, choice));

        let msg = { players: this._players.map(s => s && s.request.user ) };
        this.notify_players('players', [ msg, msg, msg, msg ]);
    }

    disconnect(sock, reason) {
        if (! sock) return;
        let id = this._uid.indexOf(sock.request.user.uid);
        if (id < 0) return;
        /* 防止旧 socket 的延迟断线覆盖新连接 */
        if (this._players[id] !== sock) return;
        let name = sock.request.user?.name || '?';
        console.log(`[断线] ${new Date().toLocaleString()} | ` +
                    `${name} 座席:${id}(${['東','南','西','北'][id]}) ` +
                    `原因:${reason}`);
        this._players[id] = null;
        /* 给予 45 秒重连宽限期（匹配 pingInterval 10s + pingTimeout 15s + 重连延迟），
         * 避免短暂心跳超时就终止整局。客户端已启用自动重连，通常可在 5-20 秒内恢复。 */
        this._disconnectTime = this._disconnectTime || {};
        this._disconnectTime[id] = Date.now();
        const GRACE_PERIOD = 45000;  /* 45 秒重连宽限期 */
        /* 检查是否还有人类玩家在线（bot 有真实 socket，不能用 _players.find 判断） */
        let humanOnline = this._players.some((s, i) => s && !this._aiPlayers[i]);
        if (! humanOnline) {
            /* 主动离开时跳过宽限期，立即终止対局 */
            if (reason === 'leave_game') {
                console.log(`[断线] 玩家主动离开，无人类玩家在线，终止対局`);
                this._stopGameLoop();
                this._callback(this._paipu);
                return;  /* 已终止，跳过后续 reply/notify */
            }
            else {
                /* 检查是否有玩家在宽限期内刚断线 */
                let now = Date.now();
                let allRecent = Object.values(this._disconnectTime)
                    .every(t => (now - t) < GRACE_PERIOD);
                if (! allRecent) {
                    console.log(`[断线] 所有人类玩家超过 ${GRACE_PERIOD/1000} 秒未重连，终止対局`);
                    this._stopGameLoop();
                    this._callback(this._paipu);
                    return;  /* 已终止，跳过后续 reply/notify */
                }
                else {
                    console.log(`[断线] 人类玩家断线，${GRACE_PERIOD/1000} 秒内等待重连...`);
                }
            }
        }
        if (! this._reply[id]) {
            this.reply(id, { seq: this._seq });
        }
        let msg = { players: this._players.map(s => s && s.request.user ) };
        this.notify_players('players', [ msg, msg, msg, msg ]);
    }

    /* ================================================================
     *  通信层（重写父类方法）
     * ================================================================ */

    notify_players(type, msg) {
        for (let l = 0; l < 4; l++) {
            let id = this._plIdx(l);  // seat l → plIdx
            if (this._players[id])
                    this._players[id].emit('GAME', msg[l]);
            /* 同步 bot AI 玩家模型 */
            if (this._aiPlayers[id]) {
                this._aiPlayers[id].action(msg[l], () => {});
            }
        }
    }

    call_players(type, msg, timeout) {

        /* 在角色选择阶段拦截，走特殊流程 */
        if (this._characterPhase) {
            this._characterPhaseType = type;
            this._characterPhaseMsg = msg;
            return;
        }

        /* 注入牌山快照 + 动作日志 */
        let wallSnapshot = this._getWallSnapshot();
        let newLogEntries = this._getNewActionLogEntries();

        timeout = this._speed == 0 ? 0
                : timeout == null  ? this._speed * 200 + fakelag(type)
                :                    timeout;
        this._status = type;
        this._reply  = [];
        this._seq++;
        for (let l = 0; l < 4; l++) {
            let id = this._plIdx(l);  // seat l → plIdx
            if (wallSnapshot) msg[l].wall_snapshot = wallSnapshot;
            if (newLogEntries && newLogEntries.length > 0)
                msg[l].action_log_entries = newLogEntries;
            msg[l].seq = this._seq;
            this._time_limit[id] = null;
            if (this._players[id] && this._timer) {
                msg[l].timer = get_timer(type, this._timer[0],
                                            this._time_allowed[id],
                                            this._timer[2]);
                if (msg[l].timer) {
                    let timer = msg[l].timer.reduce((x, y) => x + y) * 1000
                                    + 500;
                    this._time_limit[id] = Date.now() + timer;
                    this._timer_id[id] = setTimeout(()=>{
                        this.reply(id, { seq: this._seq });
                    }, timer);
                }
            }
            let hasSocket = !!this._players[id];
            if (this._players[id])
                    this._players[id].emit('GAME', msg[l]);
            else    { this._reply[id] = {}; }
            /* ---- 同步 bot AI 玩家模型 ---- */
            if (this._aiPlayers[id]) {
                try {
                    this._aiPlayers[id].action(msg[l], () => {});
                } catch(e) {
                    process.stderr.write(`[SRV]   seat=${l} _aiPlayers.action CRASH: ${e?.message || e}\n`);
                }
            }
        }
        if (type == 'jieju') {
            if (this._skillManager) this._skillManager.onHanchanEnd();
            this._callback(this._paipu);
            return;
        }
        this._timeout_id = setTimeout(()=>this.next(), timeout);
    }

    reply(id, reply) {
        if (reply.seq != this._seq) return;
        if (this._reply[id]) return;
        this._timer_id[id] = clearTimeout(this._timer_id[id]);
        if (this._time_limit[id]) {
            let allowed = (this._time_limit[id] - Date.now()) / 1000;
            if (! this._status.match(/^(kaiju|hule|pingju)$/)
                && this._time_allowed[id])
            {
                this._time_allowed[id]
                        = Math.ceil(Math.min(Math.max(allowed, 0),
                                                this._time_allowed[id]));
            }
        }
        this._reply[id] = reply;
        if (this._status == 'jieju') {
            if (this._players[id]) {
                this._players[id].removeAllListeners('GAME');
                this._players[id].emit('END', this._paipu);
            }
            return;
        }
        if (this._reply.filter(x=>x).length < 4) return;
        if (! this._timeout_id)
                this._timeout_id = setTimeout(()=>this.next(), 0);
    }

    say(name, l) {
        let msg = [];
        for (let id = 0; id < 4; id++) {
            msg[id] = { say: { l: l, name: name } };
        }
        this.notify_players('say', msg);
    }

    delay(callback, timeout) {
        super.delay(()=>{
            try {
                callback();
            }
            catch(e) {
                console.error(e.stack);
                this._timeout_id = clearTimeout(this._timeout_id);
                this._players.forEach(s=>s && s.emit('END'));
                this._callback();
            }
        }, timeout);
    }

    next() {
        try {
            super.next();
        }
        catch(e) {
            console.error(e.stack);
            this._timeout_id = clearTimeout(this._timeout_id);
            this._players.forEach(s=>s && s.emit('END'));
            this._callback();
        }
    }

    qipai(shan) {
        if (this._timer)
                this._time_allowed = [ this._timer[1], this._timer[1],
                                          this._timer[1], this._timer[1] ];
        super.qipai(shan);
    }

    /* ================================================================
     *  超能力角色选择流程
     * ================================================================ */

    /**
     * 开始角色选择阶段
     * 在 kaiju 之后、qipai 之前插入
     */
    _startCharacterSelect() {
        if (!this._skillManager) return false;

        let mode = this._rule['角色分配方式'] || 'random';
        const modeMap = {
            'draw4': AssignmentMode.DRAW_4, 'draw2': AssignmentMode.DRAW_2,
            'draft': AssignmentMode.DRAFT, 'random': AssignmentMode.RANDOM,
            'free': AssignmentMode.FREE
        };
        let amode = modeMap[mode] || AssignmentMode.RANDOM;

        this._sm.getPool().resetForHand();
        let dealResult = this._sm.dealCharacters(amode);
        this._characterDealResult = dealResult;  // 保存以便后续修改

        /* RANDOM 模式：服务端直接分配，不需要客户端交互 */
        if (amode === AssignmentMode.RANDOM) {
            for (let l = 0; l < 4; l++) {
                let entry = dealResult.find && dealResult.find(e => e.player === l);
                if (entry && entry.options.length > 0) {
                    let character = this._sm.confirmChoiceFromPool(l, 0);
                    this._sm.assignCharacterToSeat(l, character.id);
                }
            }
            this._model.character = this._sm.getAllCharacters();
            return false;  // 不需要暂停
        }

        this._characterPhase = true;
        this._characterChoices = {};

        /* FREE 模式：顺序选择，从庄家开始每人轮流选，选过的角色从后续玩家池移除 */
        if (amode === AssignmentMode.FREE) {
            this._freeSelectionOrder = [];
            for (let i = 0; i < 4; i++) {
                this._freeSelectionOrder.push((this._model.qijia + i) % 4);
            }
            this._freeSelectionIndex = 0;
            this._sendFreeOptionsToNext();
        } else {
            /* DRAW_4 / DRAW_2 / DRAFT：所有玩家同时收到各自独立的选项 */
            for (let l = 0; l < 4; l++) {
                this._sendCharacterOptionsToSeat(l);
            }
        }

        /* 超时 30 秒后自动随机选择 */
        this._characterTimeoutId = setTimeout(()=>{
            this._finalizeCharacterSelect();
        }, 30000);

        return true;
    }

    /** 向指定座席发送角色选项（非 FREE 模式） */
    _sendCharacterOptionsToSeat(l) {
        let id = this._plIdx(l);  // seat l → plIdx
        let entry = this._characterDealResult.find(e => e.player === l);
        let options = entry ? entry.options : [];
        console.log('[CHAR-DEBUG] _sendCharacterOptionsToSeat: seat=' + l
            + ' plIdx=' + id + ' hasPlayer=' + !!this._players[id]
            + ' options=' + JSON.stringify(options));
        if (this._players[id]) {
            this._players[id].emit('GAME', {
                character_select: {
                    options: options,
                    playerIdx: l,
                    qijia: this._model.qijia,
                    jushu: this._model.jushu || 0,
                    timeout: 30
                }
            });
        } else {
            /* 空缺座席随机选 */
            this._characterChoices[l] = options.length > 0 ? 0 : -1;
        }
    }

    /** FREE 模式：按座位顺序发送给下一个需要选的玩家 */
    _sendFreeOptionsToNext() {
        while (this._freeSelectionIndex < 4) {
            let l = this._freeSelectionOrder[this._freeSelectionIndex];
            let id = this._plIdx(l);  // seat l → plIdx
            if (this._players[id]) {
                /* 人类玩家 — 发送当前可选角色 */
                let entry = this._characterDealResult.find(e => e.player === l);
                let options = entry ? entry.options : [];
                this._players[id].emit('GAME', {
                    character_select: {
                        options: options,
                        playerIdx: l,
                        qijia: this._model.qijia,
                        jushu: this._model.jushu || 0,
                        timeout: 30
                    }
                });
                return;  // 等待人类玩家选择
            } else {
                /* 空缺座席 / AI — 自动随机选 */
                let entry = this._characterDealResult.find(e => e.player === l);
                if (entry && entry.options.length > 0) {
                    let choice = Math.floor(Math.random() * entry.options.length);
                    this._characterChoices[l] = choice;
                    this._removeCharacterFromRemaining(l, choice);
                } else {
                    this._characterChoices[l] = -1;
                }
                this._freeSelectionIndex++;
            }
        }
        /* 全部选完 */
        this._checkCharacterComplete();
    }

    /** FREE 模式：从后续玩家的可选池中移除已选角色 */
    _removeCharacterFromRemaining(l, choice) {
        if (!this._freeSelectionOrder) return;
        let entry = this._characterDealResult.find(e => e.player === l);
        let chosen = entry ? entry.options[choice] : null;
        if (!chosen) return;

        for (let i = this._freeSelectionIndex + 1; i < 4; i++) {
            let nextL = this._freeSelectionOrder[i];
            let nextEntry = this._characterDealResult.find(e => e.player === nextL);
            if (nextEntry) {
                let idx = nextEntry.options.indexOf(chosen);
                if (idx >= 0) nextEntry.options.splice(idx, 1);
            }
        }
    }

    /**
     * 玩家选择了角色（playerId 即为 seat 索引 0-3）
     */
    _onCharacterChoice(playerId, choice) {
        if (!this._characterPhase) return;
        /* playerId 是 connect() 传入的 _uid 数组索引（即 plIdx，非 seat）。
           需通过 seatToPlIdx 反向映射为模型席位 l */
        let l = this._model.seatToPlIdx
            ? this._model.seatToPlIdx.indexOf(playerId)
            : playerId;
        console.log('[CHAR-DEBUG] _onCharacterChoice: playerId=' + playerId
            + ' seatToPlIdx=' + JSON.stringify(this._model.seatToPlIdx)
            + ' → seat=' + l + ' choice=' + choice
            + ' uid=' + (this._uid[playerId] || 'null')
            + ' _uid=' + JSON.stringify(this._uid));
        if (l < 0 || l >= 4) return;
        this._characterChoices[l] = choice;

        /* FREE 模式：移除已选角色，推进到下一位 */
        if (this._freeSelectionOrder) {
            this._removeCharacterFromRemaining(l, choice);
            this._freeSelectionIndex++;
            this._sendFreeOptionsToNext();
        }

        this._checkCharacterComplete();
    }

    _checkCharacterComplete() {
        if (!this._characterPhase) return;
        let allReady = true;
        for (let l = 0; l < 4; l++) {
            if (this._characterChoices[l] === undefined) {
                allReady = false;
                break;
            }
        }
        if (allReady) this._finalizeCharacterSelect();
    }

    _finalizeCharacterSelect() {
        if (!this._characterPhase) return;
        this._characterPhase = false;
        clearTimeout(this._characterTimeoutId);

        console.log('[CHAR-DEBUG] _finalizeCharacterSelect: _characterChoices='
            + JSON.stringify(this._characterChoices)
            + ' seatToPlIdx=' + JSON.stringify(this._model.seatToPlIdx));

        /* 未选的自动随机选 */
        for (let l = 0; l < 4; l++) {
            if (this._characterChoices[l] === undefined) {
                this._characterChoices[l] = 0;
            }
        }

        let qijia = this._model.qijia;
        let jushu = this._model.jushu || 0;

        /*
         * 角色确认分两步，消除 confirmCharacter 的双重用途陷阱：
         *   步骤1: confirmChoiceFromPool(selectSeat) → 操作角色池（按 selectSeat 索引 dealResult）
         *   步骤2: assignCharacterToSeat(gameSeat) → 写入 _activeCharacters（按 gameSeat 索引）
         * 无需再手动 remap _activeCharacters 和 _zones！
         */
        for (let selectSeat = 0; selectSeat < 4; selectSeat++) {
            let choice = this._characterChoices[selectSeat] !== undefined
                            && this._characterChoices[selectSeat] >= 0
                            ? this._characterChoices[selectSeat] : 0;
            let gameSeat = (selectSeat - qijia - jushu + 8) % 4;
            try {
                console.log('[CHAR-DEBUG] confirmChoice: selectSeat=' + selectSeat
                    + ' → gameSeat=' + gameSeat + ' choice=' + choice);
                let character = this._sm.confirmChoiceFromPool(selectSeat, choice);
                this._sm.assignCharacterToSeat(gameSeat, character.id);
            } catch(e) {
                console.error('角色确认失败:', e.message);
            }
        }

        this._model.character = this._sm.getAllCharacters();

        /* 诊断：打印角色-座位完整映射 */
        this._sm.dumpCharacterMapping({
            qijia, jushu,
            seatToPlIdx: this._model.seatToPlIdx,
            uid: this._uid,
            label: '联机-角色选择完成',
        });

        /* 通知所有客户端角色选择结果 */
        for (let l = 0; l < 4; l++) {
            let id = this._plIdx(l);  // seat l → plIdx
            if (this._players[id]) {
                this._players[id].emit('GAME', {
                    character_confirmed: {
                        characters: this._model.character
                    }
                });
            }
        }

        /* 继续游戏：首局 → qipai；后续局 → resumeFromCharacterSelect */
        if (this._isPerRoundSelect) {
            this._isPerRoundSelect = false;
            this.resumeFromCharacterSelect();
        } else {
            this.delay(()=>this.qipai(), 0);
        }
    }

    /**
     * 每局重新选角色（在 pauseBeforeZimo 回调中调用）
     * 此时 qipai 已完成，选完后直接 zimo
     */
    startPerRoundCharacterSelect() {
        this._isPerRoundSelect = true;
        return this._startCharacterSelect();
    }

    /* ================================================================
     *  牌山快照 + 动作日志推送
     * ================================================================ */

    /**
     * 生成脱敏牌山快照（不含具体牌张内容，只含结构信息）
     * 用于客户端牌山显示，防止透视作弊
     */
    _getWallSnapshot() {
        let shan = this._model.shan;
        if (!shan || !shan._stacks) return null;

        let stacks = shan._stacks.map(s => {
            if (!s.top && !s.bottom) return 0;  // 空墩
            if (s.top && s.bottom) return 2;    // 满墩
            return 1;                            // 半墩
        });

        return {
            stacks: stacks,
            dead_wall_start: shan._haitei,
            cursor: shan._cursor,
            half_consumed: !!shan._half_consumed,
            dw_count: shan._dw_count,
            baopai: shan.baopai || [],
            paishu: shan.paishu
        };
    }

    /**
     * 获取上次推送后新增的动作日志条目
     */
    _getNewActionLogEntries() {
        let actionLog = this._paipu.action_log;
        if (!actionLog) return [];

        /* 收集所有回合的所有日志到一维数组 */
        let allEntries = [];
        for (let r = 0; r < actionLog.length; r++) {
            let roundLogs = actionLog[r] || [];
            allEntries = allEntries.concat(roundLogs.map(e => ({
                text: e.text,
                seat: e.seat
            })));
        }

        let totalCount = allEntries.length;
        let lastCount = this._lastSentActionLogCount || 0;
        if (totalCount <= lastCount) return [];

        let newEntries = allEntries.slice(lastCount);
        this._lastSentActionLogCount = totalCount;
        return newEntries;
    }

    /* ================================================================
     *  索引辅助方法
     * ================================================================
     *  所有对 _aiPlayers 和 _players 的索引都必须通过以下方法，严禁直接访问。
     * ================================================================ */

    /**
     * seat → plIdx: 模型席位转玩家索引
     * @param {number} seat - 模型席位 (0-3)
     * @returns {number} _aiPlayers/_players 中的索引
     */
    _plIdx(seat) { return this._model.seatToPlIdx[seat]; }

    /**
     * 判断指定 seat 是否为 AI（bot）玩家
     * @param {number} seat - 模型席位 (0-3)
     */
    _isAI(seat) { return !!this._aiPlayers[this._model.seatToPlIdx[seat]]; }

    /**
     * 获取指定 seat 的玩家对象（AI 实例或 socket）
     * 用于技能决策：bot 返回 AI Player，人类返回 socket
     * @param {number} seat - 模型席位 (0-3)
     */
    _playerObj(seat) {
        let pi = this._model.seatToPlIdx[seat];
        return this._aiPlayers[pi] || this._players[pi];
    }

    /* ================================================================
     *  技能交互 — 联机模式：所有玩家走 WebSocket，不自动决策
     * ================================================================ */

    /**
     * 覆写父类方法。
     * @param {number} plIdx - _players/_aiPlayers 中的玩家索引（= model.seatToPlIdx[seat]）
     */
    _canAutoDecideSkill(plIdx) {
        return !!this._aiPlayers[plIdx];
    }

    /**
     * 覆写父类方法：返回用于技能 AI 决策的玩家对象。
     * bot 返回独立 AI Player 实例，人类返回 socket（不使用）。
     * @param {number} plIdx - _players/_aiPlayers 中的玩家索引（= model.seatToPlIdx[seat]）
     */
    _getSkillDecisionPlayer(plIdx) {
        return this._aiPlayers[plIdx] || this._players[plIdx];
    }

    /**
     * 收集全局牌河中所有可见的牌（排除暗切牌）
     * MultiplayerSkillPrompt.askRiverTile 依赖此方法
     * @returns {Array} [{label: 'm1 (東家)', seat, index, paiStr}, ...]
     */
    _getAllRiverTiles() {
        let model = this._model;
        let names = ['東家', '南家', '西家', '北家'];
        let tiles = [];
        for (let l = 0; l < 4; l++) {
            let he = model.he[l];
            if (!he || !he._pai) continue;
            for (let i = 0; i < he._pai.length; i++) {
                let p = he._pai[i];
                /* 排除暗切牌 */
                if (he._hidden && he._hidden[i]) continue;
                if (p && p !== '_') {
                    tiles.push({
                        label: p + ' (' + names[l] + ')',
                        seat: l,
                        index: i,
                        paiStr: p
                    });
                }
            }
        }
        return tiles;
    }

    /* ================================================================
     *  重写 kaiju 以支持角色选择
     * ================================================================ */

    kaiju(qijia) {

        this._model.qijia = qijia ?? Math.floor(Math.random() * 4);

        this._max_jushu = this._rule['場数'] == 0 ? 0
                        : this._rule['場数'] * 4 - 1;

        this._paipu = {
            title:     this._model.title,
            player:    this._model.player,
            qijia:     this._model.qijia,
            log:       [],
            action_log: [],
            character: [],
            defen:     this._model.defen.concat(),
            point:     [],
            rank:      []
        };

        /* 重置日志推送计数 */
        this._lastSentActionLogCount = 0;

        /* 收集角色信息 */
        let character = [null, null, null, null];
        if (this._skillManager) {
            for (let l = 0; l < 4; l++) {
                let charId = this._skillManager.getCharacterId(l);
                let charData = this._skillManager.getCharacter(l);
                character[l] = {
                    id:     charId,
                    name:   charData ? charData.name : '',
                    card:   charData ? charData.card : '',
                    skills: charData ? charData.skills.map(s => s.description) : [],
                };
            }
        }
        this._model.character = character;
        this._paipu.character = character;

        /* 分配语音：房主（plIdx=0）使用规则设定的语音，其他玩家/AI 避免重复 */
        const VOICE_CHAR_LIST = ['gongyongxiao', 'yiji', 'tianjiangyi', 'yuancunhe', 'gongyongzhao'];
        let voiceRule = this._rule['音声キャラ'];
        let humanChar = voiceRule === 'none' ? null : voiceRule;

        let available = VOICE_CHAR_LIST.filter(c => c !== humanChar);
        for (let i = available.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }
        let aiIdx = 0;

        for (let l = 0; l < 4; l++) {
            let id = this._plIdx(l);  // seat l → plIdx
            if (id === 0) {
                this._voiceChars[id] = humanChar;
            } else {
                this._voiceChars[id] = available[aiIdx % available.length];
                aiIdx++;
            }
        }

        /* 发送 kaiju 消息 */
        let msg = [];
        for (let id = 0; id < 4; id++) {
            msg[id] = JSON.parse(JSON.stringify({
                kaiju: {
                    id:        id,
                    rule:      this._rule,
                    title:     this._paipu.title,
                    player:    this._paipu.player,
                    qijia:     this._paipu.qijia,
                    jushu:     this._model.jushu || 0,
                    character: character,
                    skill:     !!this._skillManager,
                    bgm:       this._rule['BGM'] || '',
                    voice_char: this._voiceChars[id]
                }
            }));
        }
        this.call_players('kaiju', msg, 0);

        if (this._view) this._view.kaiju();
    }

    /* ================================================================
     *  onHandStart 回调（每局重新选角色）
     * ================================================================ */

    onHandStart(callback) {
        this._onHandStartCb = callback || (() => {});
    }

    /* ================================================================
     *  强制终止游戏循环
     * ================================================================ */
    _stopGameLoop() {
        /* 清除主定时器 */
        clearTimeout(this._timeout_id);
        this._timeout_id = null;
        /* 清除所有玩家的超时定时器 */
        for (let i = 0; i < 4; i++) {
            clearTimeout(this._timer_id[i]);
            this._timer_id[i] = null;
        }
        /* 断开所有玩家（含 bot）的 GAME 监听，防止后续回复触发 next() */
        for (let i = 0; i < 4; i++) {
            if (this._players[i]) {
                this._players[i].removeAllListeners('GAME');
            }
        }
    }
};
