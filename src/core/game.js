/*
 *  Majiang.Game
 */
"use strict";

const Majiang = {
    rule:    require('./rule'),
    Shoupai: require('./shoupai'),
    Shan:    require('./shan'),
    He:      require('./he'),
    Util:    Object.assign(require('./xiangting'),
                           require('./hule'))
};

const TableContext = require('../skill/table-context');
const { UsageType, EffectType } = require('../skill/skill-types');
const { TimingPoints, TurnType } = require('../skill/triggers');
const tileOps = require('../effect/tile-ops');

module.exports = class Game {

    constructor(players, callback, rule, title) {

        this._players  = players;
        this._callback = callback || (()=>{});
        this._rule     = rule || Majiang.rule();

        this._model = {
            title:      title || '電脳麻将\n' + new Date().toLocaleString(),
            /**
             * playerName: 玩家显示名称数组，按 plIdx 索引。
             * 注意与大多数模型数组不同（shoupai/he 等按 seat 索引），playerName 按 plIdx。
             * 联机模式中被 ServerGame 覆盖为用户真实昵称。
             */
            player:     ['自己','下家','对家','上家'],
            qijia:      0,
            zhuangfeng: 0,
            jushu:      0,
            changbang:  0,
            lizhibang:  0,
            /**
             * defen: 玩家得分/持ち点，按 plIdx 索引。
             * 联机模式下 ServerGame 可通过 plIdx 直接引用，单机模式下 seatToPlIdx ≡ [0,1,2,3]。
             */
            defen:      [0,0,0,0].map(x=>this._rule['配給原点']),
            shan:       null,
            /** shoupai: 各 seat 的手牌，shoupai[seat]（seat=0東/1南/2西/3北） */
            shoupai:    [],
            /** he: 各 seat 的牌河，he[seat]（seat=0東/1南/2西/3北） */
            he:         [],
            /**
             * seatToPlIdx: seat→plIdx 映射表。
             * seatToPlIdx[seat] = plIdx，即坐在席位 seat 的玩家在 _players 数组中的索引。
             * qipai() 时通过 (qijia + jushu + seat) % 4 计算。
             * 反向查询: seatToPlIdx.indexOf(plIdx) = seat
             */
            seatToPlIdx:  [ 0, 1, 2, 3 ]
        };

        this._skillManager = null;

        /** TableContext: 统一的座次/玩家/角色查询接口 */
        this._ctx = new TableContext(this);

        /** 巡目管理：全局递增巡目ID */
        this._turnId = 0;

        /** 巡目管理：各玩家同巡ID [seat0, seat1, seat2, seat3] */
        this._roundIds = [0, 0, 0, 0];

        /** 巡目管理：当前巡目所属玩家 seat */
        this._turnOwner = -1;

        /** 巡目管理：当前巡目类型 NORMAL | FULOU | KAN */
        this._turnType = TurnType.NORMAL;

        /** 技能系统：待处理的额外巡 */
        this._extra_turn = null;

        /** 技能系统：和牌资格由技能扩展（huleExpander）启用时记录 */
        this._huleExpanderUsed = null;

        /** 技能系统：起和资格由技能扩展（yakuExpander）启用时记录 */
        this._yakuExpanderUsed = null;

        /** 技能系统：听牌资格由技能扩展（tenpaiExpander）启用时记录 */
        this._tenpaiExpanderUsed = null;

        /** 技能系统：碰牌资格由技能扩展（ponExpander）启用时记录 */
        this._ponExpanderUsed = null;

        /** 技能系统：杠牌资格由技能扩展（kanExpander）启用时记录 */
        this._kanExpanderUsed = null;

        /** 技能系统：吃牌资格由技能扩展（chiExpander）启用时记录 */
        this._chiExpanderUsed = null;

        /** 技能系统：当前额外巡是否为暗切 */
        this._extra_hidden_discard = false;

        /** 技能提示 UI 引用 */
        this._skillPrompt = null;

        /** 角色选择暂停：qipai 后暂停，等待角色选择完成 */
        this._pauseBeforeZimo = false;
        this._onPauseComplete = null;

        /** 技能系统：记录每个玩家已触发额外巡的牌河排号 */
        this._skillExtraUsedRows = {};

        /** 技能系统：标记当前是否来自额外巡的舍牌（防止额外巡中的手切再次触发额外巡） */
        this._isExtraTurnDiscard = false;

        this._view;

        this._status;
        this._reply = [];

        this._sync  = false;
        this._stop  = null;
        this._speed = 3;
        this._wait  = 0;
        this._timeout_id;

        this._handler;
    }

    get model()      { return this._model  }
    set view(view) {
        this._view = view;
        /* 注入手牌变更刷新：使 tile-ops 操作后自动刷新手牌 UI */
        console.log('[game] set view called, view:', !!view, 'view._view:', !!(view && view._view), 'view._view.shoupai:', !!(view && view._view && view._view.shoupai));
        if (view && view._view && view._view.shoupai) {
            tileOps.setGame(this);
        }
    }
    get speed()      { return this._speed  }
    set speed(speed) { this._speed = speed }
    set wait(wait)   { this._wait = wait   }

    set handler(callback) { this._handler = callback }

    set skillManager(sm) {
        console.log('[expander-debug] Game.skillManager setter: value=' + !!sm + (sm ? ' enabled=' + sm._enabled : ''));
        this._skillManager = sm;
        if (sm) sm.setGame(this);
    }
    get skillManager() { return this._skillManager }

    /* ================================================================
     * 坐标系统：严格区分两种索引
     *   playerIdx — 玩家数组索引 (0-3)，_players[playerIdx]，不受 qijia 影响
     *   seat      — 模型席位 (0-3)，model.he[seat] / model.lunban 等，随 qijia 轮转
     *               单机模式下 seatToPlIdx = [0,1,2,3]，seat ≡ playerIdx
 *               联机模式下 seatToPlIdx 可能打乱，seat ≠ playerIdx，需通过转换访问
 * 转换关系：seat = seatToPlIdx.indexOf(playerIdx)
 *         playerIdx = seatToPlIdx[seat]
     *
     * 重要：SkillManager._activeCharacters 在联机模式按 seat 索引，
     *       其 trigger() 返回的 action.seat 就是模型席位（seat）。
     * ================================================================ */
    playerIdxToSeat(playerIdx) {
        return this._model.seatToPlIdx.indexOf(playerIdx);
    }
    seatToPlayerIdx(seat) {
        return this._model.seatToPlIdx[seat];
    }

    /**
     * 判断某玩家是否可以自主完成技能决策（无需 _skillPrompt UI 交互）。
     *
     * 单机模式：人类玩家返回 false（需要 UI），AI 玩家返回 true（自动决策）
     * 联机模式（ServerGame 覆写）：始终返回 false，所有玩家走 _skillPrompt → WebSocket 流程
     *
     * @param {number} playerIdx - 玩家数组索引 (0-3)
     * @returns {boolean}
     */
    _canAutoDecideSkill(playerIdx) {
        let playerObj = this._players[playerIdx];
        return !!(playerObj && typeof playerObj.decideSkillAction === 'function');
    }

    /**
     * 获取用于技能 AI 决策的玩家对象。
     *
     * 单机模式：返回 _players[playerIdx]（AI Player 或 Human Player）。
     * 联机模式（ServerGame 覆写）：对 bot 座位返回独立的 AI Player 实例。
     *
     * @param {number} playerIdx - 玩家数组索引 (0-3)
     * @returns {Object|null}
     */
    _getSkillDecisionPlayer(playerIdx) {
        return this._players[playerIdx];
    }

    /**
     * 设置当前技能提示的目标座位号。
     * MultiplayerSkillPrompt 依靠此值确定 WebSocket 发送目标；
     * 单机 SkillPrompt（DOM 版）不需要此值，设置后无副作用。
     *
     * @param {number} seat - 模型席位 (0-3)
     */
    _setSkillPromptTarget(seat) {
        if (this._skillPrompt) {
            this._skillPrompt._targetSeat = seat;
        }
    }

    _skill_trigger(timing, context) {
        if (!this._skillManager) return { actions: [], effects: [], modified: false };
        let result = this._skillManager.trigger(timing, {
            ...context,
            game: this,
            tableCtx: this._ctx,
            seat: context.player,
        });
        return result;
    }

    add_paipu(paipu) {
        this._paipu.log[this._paipu.log.length - 1].push(paipu);
    }

    _add_action_log(text, seat) {
        let roundLogs = this._paipu.action_log[this._paipu.action_log.length - 1];
        if (!roundLogs) {
            roundLogs = [];
            this._paipu.action_log[this._paipu.action_log.length - 1] = roundLogs;
        }
        roundLogs.push({
            text: text,
            seat: seat,
            ts: roundLogs.length
        });
    }

    _pai_name(p) {
        if (!p) return '';
        const base = p.slice(0, 2);
        const S = { m: '万', p: '筒', s: '索' };
        const Z = { '1': '東', '2': '南', '3': '西', '4': '北', '5': '白', '6': '發', '7': '中' };
        if (base[0] === 'z') return Z[base[1]] || base;
        return base[1] + S[base[0]];
    }

    /**
     * 获取玩家的显示名称（用于日志/UI）。
     *
     * model.player[] 按 plIdx 索引，存的是名称字符串（'自己'/'下家'/'对家'/'上家' 或 玩家名）。
     * 如果玩家选择了角色，格式为 "角色名（位置名）"；否则仅返回位置名。
     *
     * @param {number} plIdx - 玩家数组索引（0-3），即 _players[] 的索引
     * @returns {string} 玩家显示名称
     */
    _playerDisplayName(plIdx) {
        let seatName = this._model.player[plIdx];
        /* plIdx 需转为 seat 才能查询 _activeCharacters（该数组按 seat 索引） */
        let seat = this._ctx.seatOf(plIdx);
        let charId = seat >= 0 ? this._skillManager.getCharacterId(seat) : null;
        if (charId) {
            let charData = this._skillManager._registry.getCharacter(charId);
            if (charData && charData.name) {
                return charData.name + '（' + seatName + '）';
            }
        }
        return seatName;
    }

    delay(callback, timeout) {

        if (this._sync) return callback();

        timeout = this._speed == 0 ? 0
                : timeout == null  ? Math.max(500, this._speed * 200)
                :                    timeout;
        setTimeout(callback, timeout);
    }

    say(name, l) {
        if (this._view) this._view.say(name, l);
    }

    stop(callback = ()=>{}) {
        this._stop = callback;
    }

    start() {
        if (this._timeout_id) return;
        this._stop = null;
        this._timeout_id = setTimeout(()=>this.next(), 0);
    }

    notify_players(type, msg) {

        for (let l = 0; l < 4; l++) {
            let id = this._ctx.playerIndex(l);
            if (this._sync)
                    this._players[id].action(msg[l]);
            else    setTimeout(()=>{
                        this._players[id].action(msg[l]);
                    }, 0);
        }
    }

    call_players(type, msg, timeout) {

        timeout = this._speed == 0 ? 0
                : timeout == null  ? this._speed * 200
                :                    timeout;
        this._status = type;
        this._reply  = [];
        for (let l = 0; l < 4; l++) {
            let id = this._ctx.playerIndex(l);
            if (this._sync)
                    this._players[id].action(
                            msg[l], reply => this.reply(id, reply));
            else    setTimeout(()=>{
                        this._players[id].action(
                            msg[l], reply => this.reply(id, reply));
                    }, 0);
        }
        if (! this._sync)
                this._timeout_id = setTimeout(()=>this.next(), timeout);
    }

    reply(id, reply) {
        this._reply[id] = reply || {};
        if (this._sync) return;
        if (this._reply.filter(x=>x).length < 4) return;
        if (! this._timeout_id)
                this._timeout_id = setTimeout(()=>this.next(), 0);
    }

    next() {
        this._timeout_id = clearTimeout(this._timeout_id);
        if (this._reply.filter(x=>x).length < 4) return;
        if (this._stop) return this._stop();

        if      (this._status == 'kaiju')    this.reply_kaiju();
        else if (this._status == 'qipai')    this.reply_qipai();
        else if (this._status == 'zimo')     this.reply_zimo();
        else if (this._status == 'dapai')    this.reply_dapai();
        else if (this._status == 'fulou')    this.reply_fulou();
        else if (this._status == 'gang')     this.reply_gang();
        else if (this._status == 'gangzimo') this.reply_zimo();
        else if (this._status == 'hule')     this.reply_hule();
        else if (this._status == 'pingju')   this.reply_pingju();
        else                                 this._callback(this._paipu);
    }

    do_sync() {

        this._sync  = true;
        this._stepCount = 0;

        this.kaiju();

        for (;;) {
            this._stepCount++;
            if (this._gameLog) this._gameLog('STATUS', this._status + ' #' + this._stepCount);
            /* 安全阀：超过 100000 步判定为无限循环 */
            if (this._stepCount > 100000) {
                console.error('[FATAL] do_sync reached 100000 steps, aborting. last status: ' + this._status);
                break;
            }
            if      (this._status == 'kaiju')    this.reply_kaiju();
            else if (this._status == 'qipai')    this.reply_qipai();
            else if (this._status == 'zimo')     this.reply_zimo();
            else if (this._status == 'dapai')    this.reply_dapai();
            else if (this._status == 'fulou')    this.reply_fulou();
            else if (this._status == 'gang')     this.reply_gang();
            else if (this._status == 'gangzimo') this.reply_zimo();
            else if (this._status == 'hule')     this.reply_hule();
            else if (this._status == 'pingju')   this.reply_pingju();
            else                                 break;
        }

        this._callback(this._paipu);

        return this;
    }

    kaiju(qijia) {

        this._model.qijia = qijia ?? Math.floor(Math.random() * 4);

        this._max_jushu = this._rule['場数'] == 0 ? 0
                        : this._rule['場数'] * 4 - 1;

        this._paipu = {
            title:  this._model.title,
            player: this._model.player,
            qijia:  this._ctx.dealerSeat(),
            log:    [],
            action_log: [],
            character: [],
            defen:  this._model.defen.concat(),
            point:  [],
            rank:   []
        };

        /* 收集角色信息 */
        let character = [null, null, null, null];
        if (this._skillManager) {
            for (let l = 0; l < 4; l++) {
                let charId = this._skillManager.getCharacterId(l);
                let charData = this._skillManager.getCharacter(l);
                character[l] = {
                    id:   charId,
                    name: charData ? charData.name : '',
                    card: charData ? charData.card : '',
                    skills: charData ? charData.skills.map(s => s.description) : [],
                };
            }
        }
        this._model.character = character;
        this._paipu.character = character;

        let msg = [];
        for (let id = 0; id < 4; id++) {
            msg[id] = JSON.parse(JSON.stringify({
                kaiju: {
                    id:     id,
                    rule:   this._rule,
                    title:  this._paipu.title,
                    player: this._paipu.player,
                    qijia:  this._paipu.qijia,
                    character: character,
                    skill:  !!this._skillManager
                }
            }));
        }
        this.call_players('kaiju', msg, 0);

        if (this._view) this._view.kaiju();
    }

    qipai(shan) {

        let model = this._model;

        model.shan = shan || new Majiang.Shan(this._rule);
        for (let l = 0; l < 4; l++) {
            let qipai = [];
            for (let i = 0; i < 13; i++) {
                qipai.push(model.shan.zimo());
            }
            model.shoupai[l]   = new Majiang.Shoupai(qipai);
            model.he[l]        = new Majiang.He();
            model.seatToPlIdx[l] = (this._ctx.dealerSeat() + model.jushu + l) % 4;
        }
        model.lunban = -1;

        this._diyizimo = true;
        this._fengpai  = this._rule['途中流局あり'];

        /* 巡目管理重置 */
        this._turnId = 0;
        this._roundIds = [0, 0, 0, 0];
        this._turnOwner = -1;
        this._turnType = TurnType.NORMAL;

        this._isExtraTurnDiscard = false;
        this._skillExtraUsedRows = {};
        this._genericHuleSelectionDone = false;

        /* 清除上局技能持久数据 */
        if (this._skillManager) this._skillManager.clearHandData();
        this._dapai = null;
        this._dapaiHidden = false;
        this._gang  = null;
        /** 各 seat 最近一次舍牌（中断巡目时置空，暗切记空） */
        this._lastDiscard = [null, null, null, null];
        /** 各 seat 立直宣言牌（只记录宣言立直时打出的横置牌，后续摸切不算） */
        this._riichiDeclarationTiles = [null, null, null, null];
        /** 各 seat 是否尚未开始第一巡（true=该玩家未进行过任何巡目） */
        this._isFirstTurn = [true, true, true, true];
        /** 立直后所有玩家打出的牌（不含暗切），用于现物计算 */
        this._riichiDiscards = [];
        /** 技能标记：跳过当前墙摸（技能③追立摸牌河） */
        this._skillSkipZimo = -1;
        /** 技能标记：当前巡必须立直 */
        this._skillForceRiichi = -1;
        /** 技能标记：牌河来源定位（追立摸牌时记录） */
        this._skillRiverSource = null;
        /** 技能标记：涩谷尧深手切限制（不可切本巡摸入牌），{ seat } */
        this._skillHandDiscard = null;
        /** 神代小莳技能①：原始打点乘算系数（初始1），按 seat 索引 */
        this._pointMulCoeff = [1, 1, 1, 1];
        /** 神代小莳技能①：原始打点加算系数（初始0），按 seat 索引 */
        this._pointAddCoeff = [0, 0, 0, 0];
        /** 神代小莳技能①：已公开的手牌集合（Set of tile strings），按 seat 索引 */
        this._jindaiOpened = [new Set(), new Set(), new Set(), new Set()];

        /**
         * 各 seat 是否已立直（0=未立直/1=已立直）。
         * seat=0東/1南/2西/3北，通过 model.lunban（seat）索引。
         */
        this._lizhi     = [ 0, 0, 0, 0 ];
        /** 各 seat 是否处于一发巡（0=否/1=是），按 seat 索引 */
        this._yifa      = [ 0, 0, 0, 0 ];
        /** 各 seat 的总杠数，按 seat 索引 */
        this._n_gang    = [ 0, 0, 0, 0 ];
        /** 各 seat 是否允许荣和（0=禁止/1=允许），按 seat 索引 */
        this._neng_rong = [ 1, 1, 1, 1 ];

        this._hule        = [];
        this._hule_option = null;
        this._no_game     = false;
        this._lianzhuang  = false;
        this._changbang   = model.changbang;
        this._fenpei      = null;

        this._paipu.defen = model.defen.concat();
        this._paipu.log.push([]);
        this._paipu.action_log.push([]);
        let paipu = {
            qipai: {
                zhuangfeng: model.zhuangfeng,
                jushu:      model.jushu,
                changbang:  model.changbang,
                lizhibang:  model.lizhibang,
                defen:      model.seatToPlIdx.map(id => model.defen[id]),
                baopai:     model.shan.baopai[0],
                shoupai:    model.shoupai.map(shoupai => shoupai.toString())
            }
        };
        this.add_paipu(paipu);

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
            for (let i = 0; i < 4; i++) {
                if (i != l) msg[l].qipai.shoupai[i] = '';
            }
        }
        this.call_players('qipai', msg, 0);

        if (this._view) this._view.redraw();
    }

    zimo(opts = {}) {
        let { isExtraTurn = false } = opts;

        let model = this._model;

        let lunban;
        if (!isExtraTurn) {
            model.lunban = (this._ctx.currentSeat() + 1) % 4;
            lunban = model.lunban;
        } else {
            lunban = model.lunban;
        }

        /* 巡目管理 */
        this._turnId++;
        this._turnOwner = lunban;
        this._turnType = TurnType.NORMAL;
        this._roundIds[lunban]++;

        /* 技能管理器：重置巡目限技能 */
        if (this._skillManager) this._skillManager.onTurnStart(lunban);
        /* 清除手切限制（每巡重置） */
        this._skillHandDiscard = null;
        /* 清除杠类型标记 */
        this._kanType = null;

        /* 牌山见底 → 荒牌流局 */
        if (model.shan.paishu === 0) {
            if (isExtraTurn) this._extra_turn = null;
            return this.delay(() => this.pingju('', ['','','','']), 0);
        }

        /* 技能钩子：①摸牌前 */
        let beforeDrawResult = this._skill_trigger(TimingPoints.BEFORE_DRAW, {
            player: lunban,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: this._turnType,
            isExtraTurn: isExtraTurn, isRiichi: !!this._lizhi[lunban],
            isFirstTurn: this._isFirstTurn[lunban], isDealerFirst: this._isFirstTurn[lunban] && lunban === 0,
            turnNumber: this._roundIds[lunban],
            roundId: this._roundIds[lunban],
            lastDiscard: this._lastDiscard,
            genbutsu: (s) => this.getGenbutsu(s),
            getSuji: (genbutsu) => this.getSuji(genbutsu),
        });

        /* 技能③追立摸牌河：跳过墙摸 */
        if (this._skillSkipZimo === lunban) {
            this._skillSkipZimo = -1;
            let src = this._skillRiverSource;
            this._skillRiverSource = null;
            this._finish_zimo(lunban, '', {
                fromRiver: true, seat: src ? src.seat : undefined,
                index: src ? src.index : undefined, skipZimo: true
            });
            return;
        }

        /* 处理 BEFORE_DRAW 主动技能 */
        if (beforeDrawResult.actions && beforeDrawResult.actions.length > 0) {
            this._handleBeforeDrawSkillAction(beforeDrawResult.actions[0], lunban);
            return;
        }

        /* 技能钩子：②摸牌时（确定来源） */
        let skillResult = this._skill_trigger(TimingPoints.DRAW_SOURCE, {
            player: lunban,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: this._turnType,
            sourceType: 'shan',
            isExtraTurn: isExtraTurn,
            roundId: this._roundIds[lunban],
        });

        /* DRAW_SOURCE 技能触发完毕后清除额外巡标记（技能条件通过 _extra_turn 判断） */
        if (isExtraTurn) {
            this._extra_turn = null;
        }

        if (skillResult.actions && skillResult.actions.length > 0) {
            this._handleBeforeDrawSkillAction(skillResult.actions[0], lunban);
            return;
        }

        /* 牌山摸牌 */
        this._finish_zimo(lunban, model.shan.zimo());
    }

    dapai(dapai) {

        let model = this._model;
        let lunban = model.lunban;

        /* 兜底：若当前玩家手牌已被清空（如技能重评估时已和牌），跳过 */
        if (!model.shoupai[lunban]) return;

        this._yifa[lunban] = 0;

        if (! model.shoupai[lunban].lizhi)
                                    this._neng_rong[lunban] = true;

        /* 技能③追立自动立直 */
        if (this._skillForceRiichi === lunban && dapai.slice(-1) !== '*') {
            dapai = dapai + '*';
            this._skillForceRiichi = -1;
        }

        /* 技能钩子：③舍牌前（若 _doDapai 已触发则跳过，避免重复） */
        if (!this._beforeDiscardDone) {
            this._skill_trigger(TimingPoints.BEFORE_DISCARD, {
                player: lunban, dapai: dapai,
                turnId: this._turnId, turnOwner: this._turnOwner,
                turnType: this._turnType,
                roundId: this._roundIds[lunban],
                firstTurn: this._isFirstTurn[lunban],
                lastDiscard: this._lastDiscard,
                genbutsu: (s) => this.getGenbutsu(s),
                getSuji: (genbutsu) => this.getSuji(genbutsu),
            });
        }
        this._beforeDiscardDone = false;

        /* 技能钩子：④舍牌时 */
        if (!this._discardSelectedDone) {
            let discResult = this._skill_trigger(TimingPoints.DISCARD_SELECTED, {
                player: lunban, dapai: dapai,
                turnId: this._turnId, turnOwner: this._turnOwner,
                turnType: this._turnType,
                roundId: this._roundIds[lunban],
                lastDiscard: this._lastDiscard,
            });
            let discActions = discResult.actions;
            if (this._debugSkill) console.log('[DEBUG] dapai() DISCARD_SELECTED: discActions=' +
                JSON.stringify(discActions?.map(a => a.skill?.id)) +
                ', turnTriggerLog=' + JSON.stringify(this._skillManager?._turnTriggerLog));
            let isHuman = !this._canAutoDecideSkill(this._ctx.playerIndex(lunban));
            if (isHuman && discActions && discActions.length > 0) {
                /* 需要人类确认 DISCARD_SELECTED 技能 → 暂停舍牌，
                 * 确认后重新进入 dapai()，届时跳过此钩子 */
                this._debugSkill && console.log('[DEBUG] dapai() DISCARD_SELECTED: 人类需确认, discActions[0].skill.id=' +
                    discActions[0].skill.id);
                this._discardSelectedDone = true;
                this._beforeDiscardDone = true;
                this._executeOptionalSkill(discActions[0], {
                    player: lunban, dapai: dapai, seat: discActions[0].seat,
                }, () => {
                    this.delay(() => this.dapai(dapai), 0);
                });
                return;
            }
        }
        this._discardSelectedDone = false;

        /* 兜底：若打牌不在手牌中（技能已改变手牌），使用当前摸牌 */
        let shoupai = model.shoupai[lunban];
        let dapaiPai = dapai.replace(/[_*]$/, '');
        if (shoupai._zimo !== dapai && shoupai.toString().indexOf(dapaiPai) < 0) {
            dapai = shoupai._zimo;
        }

        model.shoupai[lunban].dapai(dapai);
        let isHiddenDiscard = this._extra_hidden_discard;
        model.he[lunban].dapai(dapai, isHiddenDiscard);
        this._extra_hidden_discard = false;

        if (this._diyizimo) {
            if (! dapai.match(/^z[1234]/))  this._fengpai = false;
            if (this._dapai && this._dapai.slice(0,2) != dapai.slice(0,2))
                                            this._fengpai = false;
        }
        else                                this._fengpai = false;

        /* 记录舍牌者的立直前状态，供 chiExpander 等辨别立直宣言牌/摸切 */
        this._dapaiDiscarderPreRiichi = !!this._lizhi[lunban];

        if (dapai.slice(-1) == '*') {
            this._lizhi[lunban] = this._diyizimo ? 2 : 1;
            this._yifa[lunban]  = this._rule['一発あり'];
            /* 记录立直宣言牌（去*的原始牌面） */
            this._riichiDeclarationTiles[lunban] = dapai.replace(/\*$/, '');
        }

        /* 振听判定：手牌听牌在牌河中有非暗切的牌 → 不能荣和 */
        if (Majiang.Util.xiangting(model.shoupai[lunban]) == 0) {
            let ting = Majiang.Util.tingpai(model.shoupai[lunban]);
            let he = model.he[lunban];
            let hasFuriten = ting && ting.find(p => {
                if (!he.find(p)) return false;
                let ps = p[0], pn = +p[1] || 5;
                for (let i = 0; i < he._pai.length; i++) {
                    let hp = he._pai[i];
                    let hs = hp[0], hn = +hp[1] || 5;
                    if (ps === hs && pn === hn) {
                        /* 暗切的牌不计入振听 */
                        if (!he._hidden || !he._hidden[i]) return true;
                    }
                }
                return false;
            });
            if (hasFuriten) {
                this._neng_rong[lunban] = false;
            }
        }

        this._dapai = dapai;
        this._dapaiHidden = isHiddenDiscard;
        this._lastDiscard[lunban] = isHiddenDiscard ? null : dapai.replace(/\*$/, '');  /* 记录舍牌（去立直标记），暗切记空 */

        /* 立直后舍牌记录（不含暗切） */
        if (this._lizhi.some(l => l) && !isHiddenDiscard) {
            let basePai = dapai.replace(/\*$/, '');
            basePai = basePai[0] + (+basePai[1] || 5);  /* 0→5 */
            this._riichiDiscards.push(basePai);
        }

        let paipu = { dapai: { l: lunban, p: dapai, hidden: isHiddenDiscard } };
        this.add_paipu(paipu);

        /* 操作日志 */
        let pname = this._playerDisplayName(this._ctx.currentPlayerIndex());
        let paiName = this._pai_name(dapai.replace(/\*$/, ''));
        let isRiichi = dapai.slice(-1) === '*';
        if (isRiichi) {
            this._add_action_log(pname + ' 打出了 ' + paiName + ' 并立直！', lunban);
        } else if (isHiddenDiscard) {
            this._add_action_log(pname + ' 暗切了', lunban);
        } else {
            this._add_action_log(pname + ' 打出了 ' + paiName, lunban);
        }

        if (this._gang) this.kaigang();

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
            if (isHiddenDiscard && l != lunban) {
                msg[l].dapai.p = '';  /* 暗切：不透露牌种给其他玩家（包括AI） */
            }
            /* 同步标记牌张（所有玩家都需要知道当前玩家的标记） */
            msg[l].dapai.markedTiles = model.shoupai[lunban].markedTiles;
            /* 技能扩展器预检：对手是否可通过扩展器荣和/吃/碰/杠 */
            if (l != lunban && this._skillManager) {
                let savedHule = this._huleExpanderUsed;
                if (this.allow_hule(l)) msg[l].dapai.canHule = true;
                this._huleExpanderUsed = savedHule;
                let savedChi = this._chiExpanderUsed;
                let chiM = this.get_chi_mianzi(l);
                this._chiExpanderUsed = savedChi;
                if (chiM.length > 0) msg[l].dapai.chiMianzi = chiM;
                let savedPon = this._ponExpanderUsed;
                let pengM = this.get_peng_mianzi(l);
                this._ponExpanderUsed = savedPon;
                if (pengM.length > 0) msg[l].dapai.pengMianzi = pengM;
                let savedKan = this._kanExpanderUsed;
                let gangM = this.get_gang_mianzi(l);
                this._kanExpanderUsed = savedKan;
                if (gangM.length > 0) msg[l].dapai.gangMianzi = gangM;
            }
        }
        this.call_players('dapai', msg);

        if (this._view) this._view.update(paipu);
    }

    fulou(fulou) {

        let model = this._model;

        /* 副露会取消待处理的额外巡 */
        this._extra_turn = null;

        this._diyizimo = false;
        this._yifa     = [0,0,0,0];

        model.he[this._ctx.currentSeat()].fulou(fulou);

        let d = fulou.match(/[\+\=\-]/);
        model.lunban = (this._ctx.currentSeat() + '_-=+'.indexOf(d)) % 4;

        model.shoupai[this._ctx.currentSeat()].fulou(fulou);

        if (fulou.match(/^[mpsz]\d{4}/)) {
            this._gang = fulou;
            this._n_gang[this._ctx.currentSeat()]++;
            this._kanType = 'daiminkan';
        }

        /* 巡目管理：副露/杠巡目开始 — 打断所有玩家同巡 */
        this._turnId++;
        this._turnOwner = this._ctx.currentSeat();
        this._turnType = fulou.match(/^[mpsz]\d{4}/) ? TurnType.KAN : TurnType.CHIPENG;
        this._roundIds = [0, 0, 0, 0];  /* 副露/杠重置所有玩家同巡 */
        this._roundIds[this._ctx.currentSeat()]++;
        this._lastDiscard = [null, null, null, null];  /* 中断巡目，清空舍牌记录 */

        /* 重置技能钩子标记，确保 dapai() 中 BEFORE_DISCARD/DISCARD_SELECTED 正常触发 */
        this._beforeDiscardDone = false;
        this._discardSelectedDone = false;

        /* 技能管理器：重置巡目限技能 */
        if (this._skillManager) this._skillManager.onTurnStart(this._ctx.currentSeat());

        /* 技能钩子：⑦副露时 */
        this._skill_trigger(TimingPoints.AFTER_FULOU, {
            player: this._ctx.currentSeat(), fulou: fulou,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: this._turnType,
            roundId: this._roundIds[this._ctx.currentSeat()],
        });

        let paipu = { fulou: { l: this._ctx.currentSeat(), m: fulou } };
        this.add_paipu(paipu);

        /* 操作日志 */
        let pname = this._playerDisplayName(this._ctx.currentPlayerIndex());
        /* 判断副露类型 */
        if (fulou.match(/^[mpsz]\d{4}$/)) {
            let allDigits = fulou.match(/\d/g);
            let handTiles = allDigits.slice(0, 3).map(d => this._pai_name(fulou[0] + d)).join('');
            let targetTile = this._pai_name(fulou[0] + allDigits[3]);
            this._add_action_log(pname + ' 用 ' + handTiles + ' 大明杠了 ' + targetTile, this._ctx.currentSeat());
        } else if (fulou.match(/[\+\=\-]$/)) {
            let digits = fulou.match(/\d(?![\+\=\-])/g);
            let target = fulou.match(/\d(?=[\+\=\-])/);
            let targetDigit = target ? target[0] : null;
            let isPeng = targetDigit && digits && digits.length >= 2
                      && digits.every(d => d === targetDigit);
            if (isPeng) {
                let tiles = digits.map(d => this._pai_name(fulou[0] + d)).join('');
                let targetTile = this._pai_name(fulou[0] + targetDigit);
                this._add_action_log(pname + ' 用 ' + tiles + ' 碰了 ' + targetTile, this._ctx.currentSeat());
            } else {
                let tiles = digits.map(d => this._pai_name(fulou[0] + d)).join('');
                let targetTile = targetDigit ? this._pai_name(fulou[0] + targetDigit) : '';
                this._add_action_log(pname + ' 用 ' + tiles + ' 吃了 ' + targetTile, this._ctx.currentSeat());
            }
        } else {
            this._add_action_log(pname + ' 副露了', this._ctx.currentSeat());
        }

        /* 保存当前副露数据（技能回调中重新进入 action_fulou 时需要） */
        let fulouSeat = this._ctx.currentSeat();
        this._currentFulou = { l: fulouSeat, m: fulou };

        /* 通用：BEFORE_DISCARD 可选技能（副露后舍牌前） */
        let fulouSkillActions = null;
        if (this._skillManager) {
            let beforeActions = this._skillManager.getOptionalSkillDescriptions(
                TimingPoints.BEFORE_DISCARD, fulouSeat,
                {
                    game: this, player: fulouSeat, seat: fulouSeat,
                    tableCtx: this._ctx,
                    turnId: this._turnId, turnOwner: this._turnOwner,
                    turnType: this._turnType,
                    roundId: this._roundIds[fulouSeat],
                    firstTurn: this._isFirstTurn[fulouSeat],
                    lastDiscard: this._lastDiscard,
                    genbutsu: (s) => this.getGenbutsu(s),
                    getSuji: (genbutsu) => this.getSuji(genbutsu),
                }
            );
            if (beforeActions.length > 0) {
                fulouSkillActions = beforeActions;
            }
        }

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
            /* 同步标记牌张 */
            msg[l].fulou.markedTiles = model.shoupai[fulouSeat].markedTiles;
            /* 副露玩家附加 BEFORE_DISCARD 技能按钮 */
            if (l === fulouSeat && fulouSkillActions) {
                msg[l].fulou.skillActions = fulouSkillActions;
            }
        }
        this.call_players('fulou', msg);

        if (this._view) this._view.update(paipu);
    }

    /**
     * 技能系统：额外巡摸牌
     * 通过 isExtraTurn 标记复用正常 zimo() 流程，不再有独立代码路径。
     */
    _extra_zimo() {
        this._isExtraTurnDiscard = true;
        this.zimo({ isExtraTurn: true });
    }

    _handleBeforeDrawSkillAction(action, lunban) {
        let model = this._model;
        let skill = action.skill;
        let seat = action.seat;
        let socksIdx = this._ctx.playerIndex(seat);
        this._setSkillPromptTarget(seat);

        /* AI 玩家：自动决策 */
        if (this._canAutoDecideSkill(socksIdx)) {
            let playerObj = this._getSkillDecisionPlayer(socksIdx);
            let decision = playerObj.decideSkillAction(action, {
                player: lunban,
            });
            if (decision.activate) {
                this._skillManager.respondToSkill(
                    seat, skill.id, 'yes',
                    { player: lunban });
                let spname = this._playerDisplayName(this._ctx.currentPlayerIndex());
                this._add_action_log(spname + ' 发动了技能「' + (skill.characterName || '') + '·' + skill.description + '」', lunban);
                if (decision.choice && decision.choice.pai && decision.choice.seat !== undefined) {
                    this._extra_hidden_discard = true;
                    if (skill.execute) {
                        skill.execute({ game: this, seat: seat });
                    }
                    this._finish_zimo(lunban, decision.choice.pai, { fromRiver: true, seat: decision.choice.seat, index: decision.choice.index });
                } else {
                    this._finish_zimo(lunban, model.shan.zimo());
                }
            } else {
                this._skillManager.respondToSkill(seat, skill.id, 'no');
                this._finish_zimo(lunban, model.shan.zimo());
            }
            return;
        }

        if (!this._skillPrompt) {
            this._finish_zimo(lunban, model.shan.zimo());
            return;
        }

        this._skillPrompt.askConfirm(
            skill.characterName || '',
            `发动技能「${skill.description}」？`,
            (response) => {
                if (response === 'yes') {
                    this._skillManager.respondToSkill(
                        seat, skill.id, 'yes',
                        { player: lunban });

                    let spname = this._playerDisplayName(this._ctx.currentPlayerIndex());
                    this._add_action_log(spname + ' 发动了技能「' + (skill.characterName || '') + '·' + skill.description + '」', lunban);

                    /* 检查技能是否有牌河过滤 */
                    let validTiles = null;
                    if (skill.riverTileFilter) {
                        validTiles = skill.riverTileFilter({
                            game: this, seat: seat, player: lunban
                        });
                        if (!validTiles || validTiles.size === 0) {
                            this._finish_zimo(lunban, model.shan.zimo());
                            return;
                        }
                    }

                    this._skillPrompt.askRiverTile(
                        '技能·从牌河摸牌：请点击牌河中的牌（点取消则从牌山摸牌）',
                        (paiStr, sourceSeat, index) => {
                            if (paiStr) {
                                this._extra_hidden_discard = true;
                                /* 执行技能标记（如追立标记） */
                                if (skill.execute) {
                                    skill.execute({ game: this, seat: seat });
                                }
                                this._finish_zimo(lunban, paiStr, { fromRiver: true, seat: sourceSeat, index });
                            } else {
                                this._finish_zimo(lunban, model.shan.zimo());
                            }
                        },
                        30000,
                        validTiles
                    );
                } else {
                    this._skillManager.respondToSkill(
                        seat, skill.id, 'no');
                    this._finish_zimo(lunban, model.shan.zimo());
                }
            }
        );
    }

    /**
     * 摸牌后的统一处理：到手牌 + 构建消息 + 通知玩家
     * 正常巡目和额外巡目共用此方法。
     * @param {number} lunban - 当前玩家席位
     * @param {string} pai - 摸入的牌
     * @param {Object} [opts] - 可选参数
     * @param {boolean} [opts.fromRiver] - 是否从牌河摸入
     * @param {number} [opts.seat] - 牌河来源玩家席位
     * @param {number} [opts.index] - 牌河中的位置
     */
    _finish_zimo(lunban, pai, opts = {}) {
        let { fromRiver = false, seat, index, isReentry = false, skipZimo = false } = opts;
        let model = this._model;

        /* 新摸牌回合 → 清除上回合的技能触发记录 */
        if (this._skillManager) {
            this._skillManager.clearTurnRecords();
            /* 非重入时才清除本巡已发动技能记录（重入 = 技能回调中再次调用 _finish_zimo） */
            if (!isReentry) {
                this._skillManager._bdUsedThisTurn = {};
            }
        }

        /* 重置技能钩子标记 */
        this._beforeDiscardDone = false;
        this._discardSelectedDone = false;

        /* 从牌河摸入：移除牌河中的牌 */
        if (fromRiver) {
            this._removeFromRiver(seat, index);
            if (this._view) this._view.redraw();
            let pname = this._playerDisplayName(this._ctx.currentPlayerIndex());
            let seatName = this._playerDisplayName(this._ctx.playerIndex(seat));
            let paiName = this._pai_name(pai);
            this._add_action_log(pname + ' 从' + seatName + '的牌河中拿走了 ' + paiName, lunban);
        }

        if (!skipZimo) {
            model.shoupai[lunban].zimo(pai);
        }

        let paipu = { zimo: { l: lunban, p: pai } };
        this.add_paipu(paipu);

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
            if (l != lunban) msg[l].zimo.p = '';
            /* 同步完整手牌给当前玩家（技能可能已修改手牌），客户端据此替换手牌 */
            if (l == lunban) {
                msg[l].zimo.shoupai = model.shoupai[lunban].toString();
            }
            /* 同步标记牌张（所有玩家都需要知道当前玩家的标记） */
            msg[l].zimo.markedTiles = model.shoupai[lunban].markedTiles;
            /* huleExpander: 预检是否可通过扩展器和牌（客户端 allow_hule 不感知扩展器） */
            if (l == lunban && this._skillManager) {
                let savedExpander = this._huleExpanderUsed;
                let canHule = this.allow_hule(null);
                if (canHule) {
                    msg[l].zimo.canHule = true;
                }
                this._huleExpanderUsed = savedExpander;
            }
            /* 通用：BEFORE_DISCARD + DECLARE_HULE 可选技能 */
            if (l == lunban && this._skillManager) {
                let skillCtx = {
                    game: this, player: l, seat: l,
                    tableCtx: this._ctx,
                    turnId: this._turnId, turnOwner: this._turnOwner,
                    turnType: this._turnType,
                    roundId: this._roundIds[l],
                    firstTurn: this._isFirstTurn[l],
                    lastDiscard: this._lastDiscard,
                    genbutsu: (s) => this.getGenbutsu(s),
                    getSuji: (genbutsu) => this.getSuji(genbutsu),
                };
                let beforeActions = this._skillManager.getOptionalSkillDescriptions(
                    TimingPoints.BEFORE_DISCARD, l, skillCtx
                );
                let huleActions = this._skillManager.getOptionalSkillDescriptions(
                    TimingPoints.DECLARE_HULE, l,
                    Object.assign({}, skillCtx, { shoupai: model.shoupai[l] })
                );
                let allActions = [...beforeActions];
                for (let a of huleActions) {
                    allActions.push({ skillId: 'hule_' + a.skillId, label: a.label, seat: a.seat });
                }
                if (allActions.length > 0) {
                    msg[l].zimo.skillActions = allActions;
                }
            }
        }
        this.call_players('zimo', msg);

        if (this._view) this._view.update(paipu);
    }

    /**
     * 从牌河中移除某张牌（用于牌河摸牌）
     * 在所有玩家的牌河中查找并移除第一张匹配的牌
     */
    _removeFromRiver(seat, index) {
        let model = this._model;
        if (seat !== undefined && index !== undefined) {
            let he = model.he[seat];
            he._pai.splice(index, 1);
            /* 同步清理暗牌标记 */
            if (he._hidden) {
                delete he._hidden[index];
                /* 将 index 之后的 hidden 标记左移一位 */
                let newHidden = {};
                for (let k in he._hidden) {
                    let ki = parseInt(k);
                    if (ki > index) newHidden[ki - 1] = true;
                    else if (ki < index) newHidden[ki] = true;
                }
                he._hidden = newHidden;
            }
        }

        /* 重新计算牌河振听 */
        this._recalculateFuriten();
    }

    /**
     * 翻转牌河中某张牌的暗切状态
     * 原本暗切的改为非暗切，非暗切的改为暗切
     * @param {number} seat — 牌河所属玩家
     * @param {number} index — _pai 数组中的位置
     * @returns {Object} { flipped: true/false, beforeHidden: bool, afterHidden: bool }
     */
    _flipRiverTile(seat, index) {
        let model = this._model;
        let he = model.he[seat];
        let tile = he._pai[index];

        /* 已副露牌（后缀 +/=/-）不参与翻转 */
        if (tile.match(/[\+\=\-]$/)) {
            return { flipped: false };
        }

        let wasHidden = !!(he._hidden && he._hidden[index]);

        /* 摸切牌（'_'）：仅翻转暗切标记，不影响 _find */
        if (tile === '_') {
            if (wasHidden) {
                delete he._hidden[index];
            } else {
                if (!he._hidden) he._hidden = {};
                he._hidden[index] = true;
            }
            this._skill_trigger(TimingPoints.AFTER_RIVER_FLIP, {
                player: seat, seat: seat, riverSeat: seat,
                riverIndex: index, tile: '_', wasHidden: wasHidden, isHidden: !wasHidden,
            });
            this._recalculateFuriten();
            return { flipped: true, beforeHidden: wasHidden, afterHidden: !wasHidden };
        }

        let color = tile[0];
        let num = +tile[1] || 5;

        if (wasHidden) {
            /* 暗切 → 非暗切：从 _hidden 移除，加入 _find */
            delete he._hidden[index];
            he._find[color + num] = true;
        } else {
            /* 非暗切 → 暗切：加入 _hidden，检查 _find 是否需要移除 */
            if (!he._hidden) he._hidden = {};
            he._hidden[index] = true;

            /* 检查牌河中是否还有其他同花色数字的非暗切牌 */
            let hasOtherNonHidden = false;
            for (let i = 0; i < he._pai.length; i++) {
                if (i === index) continue;
                if (he._hidden && he._hidden[i]) continue;
                let hp = he._pai[i];
                if (hp === '_' || hp.match(/[\+\=\-]$/)) continue;
                let hc = hp[0], hn = +hp[1] || 5;
                if (hc === color && hn === num) {
                    hasOtherNonHidden = true;
                    break;
                }
            }
            if (!hasOtherNonHidden) {
                delete he._find[color + num];
            }
        }

        /* 触发 AFTER_RIVER_FLIP 时点 */
        this._skill_trigger(TimingPoints.AFTER_RIVER_FLIP, {
            player: seat,
            seat: seat,
            riverSeat: seat,
            riverIndex: index,
            tile: tile,
            wasHidden: wasHidden,
            isHidden: !wasHidden,
        });

        /* 重新计算牌河振听 */
        this._recalculateFuriten();

        return { flipped: true, beforeHidden: wasHidden, afterHidden: !wasHidden };
    }

    /**
     * 重新计算所有玩家的牌河振听状态
     * 牌河操作（加牌、交换、取走、翻面）后调用
     */
    _recalculateFuriten() {
        let model = this._model;
        for (let l = 0; l < 4; l++) {
            if (Majiang.Util.xiangting(model.shoupai[l]) !== 0) continue;

            let ting = Majiang.Util.tingpai(model.shoupai[l]);
            let he = model.he[l];
            let hasFuriten = ting && ting.find(p => {
                if (!he.find(p)) return false;
                let ps = p[0], pn = +p[1] || 5;
                for (let i = 0; i < he._pai.length; i++) {
                    let hp = he._pai[i];
                    if (hp === '_' || hp.match(/[\+\=\-]$/)) continue;
                    let hs = hp[0], hn = +hp[1] || 5;
                    if (ps === hs && pn === hn) {
                        if (!he._hidden || !he._hidden[i]) return true;
                    }
                }
                return false;
            });
            this._neng_rong[l] = !hasFuriten;
        }
    }

    /**
     * 设置技能提示 UI 组件引用
     */
    setSkillPrompt(prompt) {
        this._skillPrompt = prompt;
    }

    /**
     * 设置轻量提示框 UI 组件引用
     */
    setToast(toast) {
        this._toast = toast;
    }

    /**
     * 在配牌完毕后暂停游戏，用于插入角色选择界面
     * @param {Function} callback - 暂停后回调（用于显示角色选择器）
     */
    pauseBeforeZimo(callback) {
        this._pauseBeforeZimo = true;
        this._onPauseComplete = callback || (() => {});
    }

    /**
     * 角色选择完成后恢复游戏（从 zimo 继续）
     */
    resumeFromCharacterSelect() {
        this._pauseBeforeZimo = false;
        this._onPauseComplete = null;
        this.delay(() => this.zimo(), 0);
    }

    /**
     * 设置每局开始时的回调（用于重新触发角色选择）
     * @param {Function} callback - 每局 qipai 后调用的回调
     */
    onHandStart(callback) {
        this._onHandStartCb = callback;
    }

    /**
     * 构建技能输入桥接（context.input）
     *
     * 每个 input 方法返回 Promise，技能通过 await 获取结果后继续执行。
     * 每个 input 方法接受 aiPicker 参数：
     * - AI 玩家：调用 aiPicker() 立即返回
     * - 人类玩家：委托给 skillPrompt UI，等待用户操作后 resolve
     *
     * @param {Object} skill - 技能对象
     * @param {boolean} isAI - 是否为 AI 玩家
     * @returns {Object} { askConfirm, askNumber, askTextOptions, askTileOptions }
     */
    _buildSkillInput(skill, isAI) {
        let skillPrompt = this._skillPrompt;
        let self = this;

        return {
            /** 展示轻量提示框（牌图 + 文字），返回 Promise */
            showToast: function(options) {
                return new Promise(function(resolve) {
                    if (self._toast && self._toast.show) {
                        /* 单机 UI：走 DOM toast */
                        let result = self._toast.show(options);
                        if (result && typeof result.then === 'function') {
                            result.then(resolve);
                        } else {
                            setTimeout(resolve, (options && options.duration) || 2000);
                        }
                    } else if (skillPrompt && typeof skillPrompt._broadcastData === 'function') {
                        /* 联机服务端：广播牌面给所有玩家，等待 duration 后 resolve，
                         * 确保 toast 显示完毕再继续后续提示（避免弹窗被覆盖）。 */
                        let duration = (options && options.duration) || 3000;
                        skillPrompt._broadcastData({
                            skill_prompt: {
                                promptType: 'tile_popup',
                                title: options.text || '',
                                tiles: options.tiles || [],
                                timeout: duration
                            }
                        });
                        setTimeout(resolve, duration + 200);
                    } else if (skillPrompt && skillPrompt.showTilePopup) {
                        /* 回退：用 showTilePopup（会等待玩家关闭） */
                        skillPrompt.showTilePopup(
                            options.text || '',
                            options.tiles || [],
                            resolve
                        );
                    } else {
                        resolve();
                    }
                });
            },

            /** 确认弹窗，返回 Promise<boolean> */
            askConfirm: function(desc, aiPicker) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.askConfirm) {
                        skillPrompt.askConfirm(skill.characterName || '', desc, function(reply) {
                            resolve(reply === 'yes');
                        });
                    } else {
                        resolve(false);
                    }
                });
            },

            /** 数字选择，返回 Promise<number|null> */
            askNumber: function(min, max, desc, aiPicker) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.pickNumber) {
                        let title = (skill.characterName || '') + '·' + desc;
                        skillPrompt.pickNumber(max, title, !isAI, null, 15000, resolve);
                    } else {
                        resolve(null);
                    }
                });
            },

            /** 文字选项，返回 Promise<string|null> */
            askTextOptions: function(options, values, desc, aiPicker) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.askTextOptions) {
                        let title = (skill.characterName || '') + '·' + desc;
                        let opts = options.map(function(label, i) {
                            return { label: label, value: values[i] };
                        });
                        skillPrompt.askTextOptions(title, opts, !isAI, null, 15000, resolve);
                    } else {
                        resolve(null);
                    }
                });
            },

            /** 牌选项，返回 Promise<string|null>
             * @param {boolean} [showCancel] - 是否显示取消按钮 */
            askTileOptions: function(candidates, desc, aiPicker, showCancel) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.askOptions) {
                        let opts = candidates.map(function(p) {
                            let pai = typeof p === 'string' ? p : (p.pai || p);
                            return { label: self._pai_name(pai), value: pai, image: pai };
                        });
                        skillPrompt.askOptions((skill.characterName || '') + '·' + desc, opts, resolve,
                            showCancel ? { showCancel: true } : undefined);
                    } else {
                        resolve(null);
                    }
                });
            },

            /** 从手牌中直接选择1张牌（高亮手牌点击），返回 Promise<string|null>
             * @param {string[]} [validTiles] - 可选牌过滤列表 */
            askHandTile: function(desc, aiPicker, validTiles) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.askHandTile) {
                        let title = (skill.characterName || '') + '·' + desc;
                        skillPrompt.askHandTile(title, resolve, validTiles);
                    } else {
                        resolve(null);
                    }
                });
            },

            /** 从牌河中直接选择1张牌（高亮牌河点击），返回 Promise<{pai, seat, index}|null>
             * @param {string[]} [validTiles] - 可选牌河过滤（"seat:index" 格式数组） */
            askRiverTile: function(desc, aiPicker, validTiles) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.askRiverTile) {
                        let title = (skill.characterName || '') + '·' + desc;
                        skillPrompt.askRiverTile(title, function(pai, seat, index) {
                            if (pai) {
                                resolve({ pai: pai, seat: seat, index: index });
                            } else {
                                resolve(null);
                            }
                        }, null, validTiles);
                    } else {
                        resolve(null);
                    }
                });
            },

            /** 从手牌中直接选择固定张数牌（高亮手牌点击，有序多选），返回 Promise<string[]|null>
             * @param {string[]} [validTiles] - 可选牌过滤列表
             * @param {Object} [opts] - 可选配置 */
            pickHandTiles: function(count, desc, aiPicker, validTiles, opts) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.pickHandTiles) {
                        let title = (skill.characterName || '') + '·' + desc;
                        skillPrompt.pickHandTiles(count, title, !isAI, null, 15000, resolve, validTiles, opts);
                    } else {
                        resolve(null);
                    }
                });
            },

            /** 从手牌中直接选择范围张数牌（高亮手牌点击，有序多选），返回 Promise<string[]|null>
             * @param {string[]} [validTiles] - 可选牌过滤列表 */
            pickHandTilesRange: function(minCount, maxCount, desc, aiPicker, validTiles) {
                return new Promise(function(resolve) {
                    if (isAI && typeof aiPicker === 'function') {
                        resolve(aiPicker());
                    } else if (skillPrompt && skillPrompt.pickHandTilesRange) {
                        let title = (skill.characterName || '') + '·' + desc;
                        skillPrompt.pickHandTilesRange(minCount, maxCount, title, !isAI, null, 15000, resolve, validTiles);
                    } else {
                        resolve(null);
                    }
                });
            },
        };
    }

    /**
     * 通用：执行可选技能
     *
     * 流程：
     *   1. 外部判定激活（AI 走 aiDecision，人类走 UI 确认）
     *   2. 激活后构建 context.input 桥接
     *   3. 调用 skill.effect.execute(context)（支持 async）
     *   4. 技能内部通过 await input.askXxx() 获取外部输入
     *   5. 输入收集完成后调用 context.done() → onComplete
     *
     * @param {Object} action - 技能动作 { seat, skill }
     * @param {Object} baseContext - 基础上下文（传给 skill.execute / aiDecision）
     * @param {Function} onComplete - 技能执行完成后的回调
     */
    _executeOptionalSkill(action, baseContext, onComplete, options) {
        let skipConfirm = options && options.skipConfirm;
        let skill = action.skill;
        let seat = action.seat;

        /* 使用次数已达上限，跳过 */
        if (skill.usage.type !== 'unlimited' && skill.usage.current >= skill.usage.max) {
            if (onComplete) onComplete();
            return;
        }

        let socksIdx = this._ctx.playerIndex(seat);
        let isAI = this._canAutoDecideSkill(socksIdx);
        let skillPrompt = this._skillPrompt;
        let self = this;

        /** 激活日志和标记 */
        function logAndMark() {
            let spname = self._playerDisplayName(socksIdx);
            self._add_action_log(spname + ' 发动了技能「' + (skill.characterName || '') + '·' + skill.description + '」', seat);
            self._skillManager.markSkillUsed(skill.id);
            /* 标记本巡已发动，阻止同巡目重复显示 */
            self._skillManager.markBDSkillUsed(skill.id);
        }

        /** 执行技能内部逻辑（同步优先，异步兜底） */
        function doExecute() {
            let input = self._buildSkillInput(skill, isAI);
            let _done = false;
            let fullContext = Object.assign(baseContext, {
                input: input,
                game: self,
                done: function() {
                    if (_done) return;
                    _done = true;
                    if (onComplete) {
                        try { onComplete(); } catch(e) { console.error(e); }
                    }
                }
            });

            let result = skill.effect.execute(fullContext);
            if (result && typeof result.then === 'function') {
                /* 异步技能：通过 .then 链完成时触发 onComplete */
                result.then(function() {
                    if (!_done && onComplete) onComplete();
                }).catch(function(e) {
                    console.error(e);
                    if (!_done && onComplete) onComplete();
                });
            } else {
                /* 同步技能：立即触发 onComplete */
                if (!_done && onComplete) {
                    onComplete();
                }
            }
        }

        /* ===== 激活判定 ===== */

        if (isAI) {
            /* AI：走 aiDecision 判定激活（返回 bool 或 { activate, choice }） */
            let activate = skill.aiDecision
                ? skill.aiDecision(Object.assign({}, baseContext, { game: self }))
                : false;
            if (activate) {
                logAndMark();
                doExecute();
            } else {
                if (onComplete) onComplete();
            }
        } else {
            /* 人类：若已通过按钮确认则直接执行，否则 UI 询问是否发动 */
            if (skipConfirm) {
                logAndMark();
                doExecute();
            } else if (skillPrompt && skillPrompt.askConfirm) {
                skillPrompt.askConfirm(skill.characterName || '', '发动技能「' + skill.description + '」？', function(response) {
                    if (response === 'yes') {
                        logAndMark();
                        doExecute();
                    } else {
                        if (onComplete) onComplete();
                    }
                });
            } else {
                if (onComplete) onComplete();
            }
        }
    }


    /**
     * 处理人类玩家从 UI 按钮触发的 BEFORE_DISCARD 可选技能
     * @param {string} skillAction - 技能 ID 字符串（如 "Amae_Koromo_skill_3"）
     */
    _executeBeforeDiscardFromButton(skillAction) {
        this._debugSkill && console.log('[DEBUG] _executeBeforeDiscardFromButton: skillAction=' + skillAction +
            ', turnTriggerLog=' + JSON.stringify(this._skillManager?._turnTriggerLog));
        let lunban = this._model.lunban;
        let triggerResult = this._skill_trigger(TimingPoints.BEFORE_DISCARD, {
            player: lunban,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: this._turnType,
            roundId: this._roundIds[lunban],
            firstTurn: this._isFirstTurn[lunban],
            lastDiscard: this._lastDiscard,
            genbutsu: (s) => this.getGenbutsu(s),
            getSuji: (genbutsu) => this.getSuji(genbutsu),
        });
        if (triggerResult.actions && triggerResult.actions.length > 0) {
            let action = triggerResult.actions.find(a => a.skill.id === skillAction);
            if (action) {
                let self = this;
                this._executeOptionalSkill(action, {
                    player: lunban, seat: action.seat,
                }, function() {
                    /* 技能执行完毕，人类仍需选择舍牌。
                     * 仅当前玩家需要更新手牌中的摸牌（技能可能替换了它），
                     * 其他玩家看不到摸牌无需更新。
                     * 避免 call_players('zimo') 导致 local-shan paishu 冗余递减。 */
                    this._debugSkill && console.log('[DEBUG] _executeBeforeDiscardFromButton 回调: 技能④执行完毕, turnTriggerLog=' +
                        JSON.stringify(self._skillManager?._turnTriggerLog));
                    let model = self._model;
                    let newP = model.shoupai[lunban]._zimo;
                    let player = self._players[self.seatToPlayerIdx(lunban)];
                    if (player) {
                        /* 同步 player model 到游戏 model（技能只改了游戏 model。
                         * 零碎的 dapai/zimo 无法还原技能的全部改动如手牌移除等，
                         * 用 clone 整体同步避免 player model 与游戏 model 不一致。
                         * 联网服务端 player 是 Socket（无 _model），跳过此步。 */
                        if (player._model && player._model.shoupai) {
                            player._model.shoupai[lunban] = model.shoupai[lunban].clone();
                        }
                        /* 刷新手牌视图（本地用 game._view，联网用 player._view） */
                        let view = player._view || self._view;
                        if (view) {
                            view.update({ zimo: { l: lunban, p: newP } });
                        }
                        /* 重新进入 action_zimo 让人类选择舍牌/和牌/杠
                         * 杠巡目中需传递 gangzimo=true 以保证和牌判定正确 */
                        let isGangzimo = self._turnType === TurnType.KAN;
                        if (typeof player.action_zimo === 'function') {
                            player.action_zimo({ l: lunban, p: newP }, isGangzimo);
                        } else {
                            /* 联网服务端：player 是 Socket，重新发送 zimo 消息到客户端。
                             * 先通过 removeFromHand 正确移除 _zimo（仅设 null 不会减少计数），
                             * 再走 _finish_zimo 正常流程（含技能按钮、canHule 等）。
                             * 同时保存并恢复 turnTriggerLog，避免 _finish_zimo 中的
                             * clearTurnRecords 过早清除 discard_selected 阶段需要的记录。 */
                            let oldZimo = model.shoupai[lunban]._zimo;
                            if (oldZimo && oldZimo.length <= 2) {
                                tileOps.removeFromHand(model.shoupai[lunban], oldZimo);
                            }
                            let savedTriggerLog = self._skillManager
                                ? JSON.parse(JSON.stringify(self._skillManager._turnTriggerLog))
                                : null;
                            self._finish_zimo(lunban, newP, { isReentry: true });
                            if (self._skillManager && savedTriggerLog) {
                                self._skillManager._turnTriggerLog = savedTriggerLog;
                            }
                        }
                    }
                }, { skipConfirm: true });
                return;
            }
        }
        /* 未找到匹配技能，重新发送 zimo */
        this.zimo();
    }

    gang(gang) {

        let model = this._model;

        /* 巡目管理：暗杠/加杠 → 杠巡目开始（打断所有同巡） */
        this._turnId++;
        this._turnOwner = this._ctx.currentSeat();
        this._turnType = TurnType.KAN;
        this._roundIds = [0, 0, 0, 0];
        this._roundIds[this._ctx.currentSeat()]++;
        this._lastDiscard = [null, null, null, null];  /* 中断巡目，清空舍牌记录 */
        /* 标记杠类型：暗杠 vs 加杠 */
        this._kanType = gang.match(/\d{4}$/) ? 'ankan' : 'kakan';

        /* 技能管理器：重置巡目限技能 */
        if (this._skillManager) this._skillManager.onTurnStart(this._ctx.currentSeat());

        model.shoupai[this._ctx.currentSeat()].gang(gang);

        let paipu = { gang: { l: this._ctx.currentSeat(), m: gang } };
        this.add_paipu(paipu);

        /* 操作日志 */
        let pname = this._playerDisplayName(this._ctx.currentPlayerIndex());
        let gangPai = this._pai_name(gang.slice(0, 2));
        let allDigits = gang.match(/\d(?![\+\=\-])/g) || gang.match(/\d/g);
        let allTiles = allDigits.map(d => this._pai_name(gang[0] + d)).join('');
        if (gang.match(/\d{3}[\+\=\-]\d$/)) {
            /* 加槓：从手牌加 1 张到已有副露 */
            let newTile = this._pai_name(gang[0] + gang.slice(-1));
            this._add_action_log(pname + ' 用 ' + newTile + ' 加杠了 ' + allTiles, this._ctx.currentSeat());
        } else {
            /* 暗杠：4 张均来自手牌 */
            this._add_action_log(pname + ' 暗杠了 ' + allTiles, this._ctx.currentSeat());
        }

        if (this._gang) this.kaigang();

        this._gang = gang;
        this._n_gang[this._ctx.currentSeat()]++;

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
            /* 同步标记牌张 */
            let gangSeat = this._ctx.currentSeat();
            msg[l].gang.markedTiles = model.shoupai[gangSeat].markedTiles;
        }
        this.call_players('gang', msg);

        if (this._view) this._view.update(paipu);
    }

    gangzimo() {

        let model = this._model;
        let lunban = model.lunban;

        this._diyizimo = false;
        this._yifa     = [0,0,0,0];

        /* 技能钩子：①摸牌前（岭上） */
        this._skill_trigger(TimingPoints.BEFORE_DRAW, {
            player: lunban,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: TurnType.KAN, sourceType: 'lingshang',
            roundId: this._roundIds[lunban],
            firstTurn: this._isFirstTurn[lunban],
            lastDiscard: this._lastDiscard,
            genbutsu: (s) => this.getGenbutsu(s),
            getSuji: (genbutsu) => this.getSuji(genbutsu),
        });

        /* 技能钩子：②摸牌时（岭上） */
        this._skill_trigger(TimingPoints.DRAW_SOURCE, {
            player: lunban,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: TurnType.KAN, sourceType: 'lingshang',
            roundId: this._roundIds[lunban],
        });

        let zimo = model.shan.gangzimo();
        model.shoupai[lunban].zimo(zimo);

        /* 技能钩子：⑨开杠后 */
        this._skill_trigger(TimingPoints.AFTER_KAN, {
            player: lunban, gang: this._gang,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: TurnType.KAN,
            roundId: this._roundIds[lunban],
        });

        let paipu = { gangzimo: { l: lunban, p: zimo } };
        this.add_paipu(paipu);

        if (! this._rule['カンドラ後乗せ'] ||
            this._gang.match(/^[mpsz]\d{4}$/)) this.kaigang();

        /* 杠后岭上摸牌进入新「舍牌前」阶段，清除上回合技能记录
         * 并加入 BEFORE_DISCARD / DECLARE_HULE 技能按钮 */
        if (this._skillManager) this._skillManager.clearTurnRecords();
        this._beforeDiscardDone = false;
        this._discardSelectedDone = false;

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
            if (l != lunban) msg[l].gangzimo.p = '';
            /* huleExpander：预检是否可通过扩展器和牌 */
            if (l == lunban && this._skillManager) {
                let savedExpander = this._huleExpanderUsed;
                let canHule = this.allow_hule(null);
                if (canHule) {
                    msg[l].gangzimo.canHule = true;
                }
                this._huleExpanderUsed = savedExpander;
            }
            /* BEFORE_DISCARD + DECLARE_HULE 可选技能按钮 */
            if (l == lunban && this._skillManager) {
                let skillCtx = {
                    game: this, player: l, seat: l,
                    tableCtx: this._ctx,
                    turnId: this._turnId, turnOwner: this._turnOwner,
                    turnType: this._turnType,
                    roundId: this._roundIds[l],
                    firstTurn: this._isFirstTurn[l],
                    lastDiscard: this._lastDiscard,
                    genbutsu: (s) => this.getGenbutsu(s),
                    getSuji: (genbutsu) => this.getSuji(genbutsu),
                };
                let beforeActions = this._skillManager.getOptionalSkillDescriptions(
                    TimingPoints.BEFORE_DISCARD, l, skillCtx
                );
                let huleActions = this._skillManager.getOptionalSkillDescriptions(
                    TimingPoints.DECLARE_HULE, l,
                    Object.assign({}, skillCtx, { shoupai: model.shoupai[l] })
                );
                let allActions = [...beforeActions];
                for (let a of huleActions) {
                    allActions.push({ skillId: 'hule_' + a.skillId, label: a.label, seat: a.seat });
                }
                if (allActions.length > 0) {
                    msg[l].gangzimo.skillActions = allActions;
                }
            }
        }
        this.call_players('gangzimo', msg);

        if (this._view) this._view.update(paipu);
    }

    kaigang() {

        this._gang = null;

        if (! this._rule['カンドラあり']) return;

        let model = this._model;

        model.shan.kaigang();
        let baopai = model.shan.baopai.pop();

        /* 技能钩子：⑨开杠后（翻开宝牌） */
        this._skill_trigger(TimingPoints.AFTER_KAN, {
            player: this._ctx.currentSeat(),
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: TurnType.KAN,
            roundId: this._roundIds[this._ctx.currentSeat()],
        });

        let paipu = { kaigang: { baopai: baopai } };
        this.add_paipu(paipu);

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
        }
        this.notify_players('kaigang', msg);

        if (this._view) this._view.update(paipu);
    }

    hule() {

        let model = this._model;

        /* 和牌会取消待处理的额外巡 */
        this._extra_turn = null;

        if (this._status != 'hule') {
            model.shan.close();
            this._hule_option = this._status == 'gang'     ? 'qianggang'
                              : this._status == 'gangzimo' ? 'lingshang'
                              :                              null;
        }

        let lunban  = model.lunban;
        let menfeng  = this._hule.length ? this._hule.shift() : lunban;
        let rongpai  = menfeng == lunban ? null
                     : (this._hule_option == 'qianggang'
                            ? this._gang[0] + this._gang.slice(-1)
                            : this._dapai.slice(0,2)
                       ) + '_+=-'[(4 + lunban - menfeng) % 4];
        let shoupai  = model.shoupai[menfeng].clone();
        let fubaopai = shoupai.lizhi ? model.shan.fubaopai : null;

        let param = {
            rule:           this._rule,
            zhuangfeng:     model.zhuangfeng,
            menfeng:        menfeng,
            hupai: {
                lizhi:      this._lizhi[menfeng],
                yifa:       this._yifa[menfeng],
                qianggang:  this._hule_option == 'qianggang',
                lingshang:  this._hule_option == 'lingshang',
                haidi:      model.shan.paishu > 0
                            || this._hule_option == 'lingshang' ? 0
                                : ! rongpai                     ? 1
                                :                                 2,
                tianhu:     ! (this._diyizimo && ! rongpai)     ? 0
                                : menfeng == 0                  ? 1
                                :                                 2
            },
            baopai:         model.shan.baopai,
            fubaopai:       fubaopai,
            jicun:          { changbang: model.changbang,
                              lizhibang: model.lizhibang }
        };

        /* 技能钩子：⑪宣言和牌时 */
        let huleCheck = this._skill_trigger(TimingPoints.DECLARE_HULE, {
            player: menfeng, shoupai: shoupai, rongpai: rongpai, param: param,
            roundId: this._roundIds[menfeng],
        });

        let _continueHule = (overrideRongpai, overrideShoupai) => {
            let finalRongpai = overrideRongpai != null ? overrideRongpai : rongpai;
            let finalShoupai = overrideShoupai || shoupai;

            console.log('[expander-debug] _continueHule: overrideRongpai=' + JSON.stringify(overrideRongpai)
                + ' rongpai=' + JSON.stringify(rongpai)
                + ' finalRongpai=' + JSON.stringify(finalRongpai)
                + ' finalShoupai=' + finalShoupai.toString());
            let hule = Majiang.Util.hule(finalShoupai, finalRongpai, param);
            console.log('[expander-debug] _continueHule: hule=' + JSON.stringify(hule));

            if (!hule) {
                console.log('[expander-debug] _continueHule: hule is undefined, aborting');
                return;
            }

            /* yakuExpander：将技能追加的虚拟役合并到 hule（在 HULE_SETTLE 之前，以便 FanModifier 可见） */
            if (this._yakuExpanderUsed && this._yakuExpanderUsed.yakus && hule
                && this._yakuExpanderUsed.seat === menfeng) {
                let yakus = this._yakuExpanderUsed.yakus;
                if (!hule.hupai) hule.hupai = [];
                for (let y of yakus) {
                    let exists = hule.hupai.some(h => h.name === y.name);
                    if (!exists) {
                        hule.hupai.push({ name: y.name, fanshu: y.fanshu, type: 'yaku' });
                        hule.fanshu = (hule.fanshu || 0) + y.fanshu;
                    }
                }
                console.log('[yakuExpander] 合并虚拟役后 hupai=' + JSON.stringify(hule.hupai));
                /* hule 无标准役时 Majiang.Util.hule 不计算 fu，补默认值确保点数计算正确 */
                if (hule.fu == null && hule.hupai && hule.hupai.length > 0) {
                    hule.fu = finalRongpai ? 30 : 20;
                }
                this._yakuExpanderUsed = null;
            }

            /* 技能钩子：⑫和牌时（和牌者先 → 放铳者后） */
            this._skill_trigger(TimingPoints.HULE_SETTLE, {
                player: menfeng,
                hule: hule,
                shoupai: finalShoupai,
                rongpai: finalRongpai,
                roundId: this._roundIds[menfeng],
            });
            /* 放铳者也在此时点触发 */
            if (finalRongpai) {
                let ronSeat = (lunban + 4 - menfeng) % 4 === 0 ? lunban :
                              (lunban + '_+=-'.indexOf(finalRongpai.slice(-2, -1)) + 1) % 4;
                /* 放铳者为模型席位 lunban（当前回合玩家） */
                this._skill_trigger(TimingPoints.HULE_SETTLE, {
                    player: lunban,
                    hule: hule, wasRonned: true,
                    ronBy: menfeng,
                    roundId: this._roundIds[lunban],
                });
            }

            /* 重新计算 defen/fenpei，反映 yakuExpander 和 FanModifier 的所有番数修改 */
            if (hule && hule.hupai && hule.hupai.length > 0) {
                let _fanshu = 0;
                for (let h of hule.hupai) {
                    if (typeof h.fanshu === 'number') _fanshu += h.fanshu;
                }
                let _base = (_fanshu >= 13) ? 8000
                          : (_fanshu >= 11) ? 6000
                          : (_fanshu >= 8)  ? 4000
                          : (_fanshu >= 6)  ? 3000
                          : Math.min(hule.fu << (2 + _fanshu), 2000);

                let _chang = param.jicun.changbang;
                let _lizhi = param.jicun.lizhibang;
                let _fp = [0, 0, 0, 0];

                if (finalRongpai) {
                    hule.defen = Math.ceil(_base * (menfeng == 0 ? 6 : 4) / 100) * 100;
                    _fp[menfeng] = hule.defen + _chang * 300 + _lizhi * 1000;
                    _fp[lunban] = -(hule.defen + _chang * 300);
                }
                else if (menfeng == 0) {
                    let _zhuangjia = Math.ceil(_base * 2 / 100) * 100;
                    hule.defen = _zhuangjia * 3;
                    for (let l = 0; l < 4; l++) {
                        if (l == menfeng)
                            _fp[l] = hule.defen + _chang * 300 + _lizhi * 1000;
                        else
                            _fp[l] = -(_zhuangjia + _chang * 100);
                    }
                }
                else {
                    let _zhuangjia = Math.ceil(_base * 2 / 100) * 100;
                    let _sanjia = Math.ceil(_base / 100) * 100;
                    hule.defen = _zhuangjia + _sanjia * 2;
                    for (let l = 0; l < 4; l++) {
                        if (l == menfeng)
                            _fp[l] = hule.defen + _chang * 300 + _lizhi * 1000;
                        else if (l == 0)
                            _fp[l] = -(_zhuangjia + _chang * 100);
                        else
                            _fp[l] = -(_sanjia + _chang * 100);
                    }
                }
                hule.fenpei = _fp;
                console.log('[hule-recalc] final defen=' + hule.defen + ' fanshu=' + _fanshu + ' base=' + _base + ' fenpei=' + JSON.stringify(hule.fenpei));
            }

            /* 技能钩子：⑫½ 和牌点数重算后 — 番数修改已反映到点数，点数调整在此触发 */
            if (this._skillManager) {
                /* 和牌者 */
                this._skill_trigger(TimingPoints.FENPEI_CALCULATED, {
                    player: menfeng,
                    hule: hule,
                    shoupai: finalShoupai,
                    rongpai: finalRongpai,
                    roundId: this._roundIds[menfeng],
                });
                /* 放铳者 */
                if (finalRongpai) {
                    this._skill_trigger(TimingPoints.FENPEI_CALCULATED, {
                        player: lunban,
                        hule: hule, wasRonned: true,
                        ronBy: menfeng,
                        roundId: this._roundIds[lunban],
                    });
                }
            }

            /* huleRestrictor minFan 精确校验（只计算有役番，排除无役奖励番） */
            if (this._skillManager && hule && hule.hupai && hule.fanshu > 0) {
                let restrictors = this._skillManager.getHuleRestrictors(menfeng, {
                    game: this, shoupai: finalShoupai,
                });
                for (let res of restrictors) {
                    let r = res.restriction;
                    if (r.minFan != null && r.minFan > 0) {
                        /* 只计算有役番（type === 'yaku'，排除宝牌 type:dora 和技能番 type:bonus） */
                        let yakuHan = 0;
                        for (let h of hule.hupai) {
                            if (h.type === 'yaku') yakuHan += h.fanshu;
                        }
                        if (yakuHan < r.minFan) {
                            console.log('[restrictor-debug] HULE_SETTLE: 番缚不满足 seat=' + menfeng
                                + ' yakuHan=' + yakuHan + ' < minFan=' + r.minFan
                                + ' (total=' + hule.fanshu + ') by seat=' + res.seat);
                            hule.hupai = null;
                            hule.fanshu = 0;
                            break;
                        }
                    }
                }
            }

            /* 技能钩子：⑬和牌后 */
            this._skill_trigger(TimingPoints.AFTER_HULE, {
                player: menfeng, hule: hule,
                roundId: this._roundIds[menfeng],
            });

            if (this._rule['連荘方式'] > 0 && menfeng == 0) this._lianzhuang = true;
            if (this._rule['場数'] == 0) this._lianzhuang = false;
            this._fenpei = hule.fenpei;

        this._isFirstTurn[menfeng] = false;  /* 和牌结束第一巡 */

            /* 技能追加的额外里宝指示牌合并到 paipu */
            if (hule._extraUraDoraIndicators && hule._extraUraDoraIndicators.length > 0) {
                if (!fubaopai) fubaopai = [];
                fubaopai = [...fubaopai, ...hule._extraUraDoraIndicators];
                /* 同步更新 shan 模型，使 UI 里宝牌区域能正确显示 */
                if (model.shan._fubaopai) {
                    model.shan._fubaopai.push(...hule._extraUraDoraIndicators);
                } else {
                    model.shan._fubaopai = [...hule._extraUraDoraIndicators];
                }
            }

            let paipu = {
                hule: {
                    l:          menfeng,
                    shoupai:    finalRongpai ? finalShoupai.zimo(finalRongpai).toString()
                                        : finalShoupai.toString(),
                    baojia:     finalRongpai ? lunban : null,
                    fubaopai:   fubaopai,
                    fu:         hule.fu,
                    fanshu:     hule.fanshu,
                    damanguan:  hule.damanguan,
                    defen:      hule.defen,
                    hupai:      hule.hupai,
                    fenpei:     hule.fenpei
                }
            };
            for (let key of ['fu','fanshu','damanguan']) {
                if (! paipu.hule[key]) delete paipu.hule[key];
            }
            this.add_paipu(paipu);

            /* 操作日志 */
            let hname = this._playerDisplayName(this._ctx.playerIndex(menfeng));
            let isZimo = !finalRongpai;
            if (isZimo) {
                this._add_action_log(hname + ' 自摸和了！(' + (hule.defen || '?') + '点)', menfeng);
            } else {
                let bname = this._playerDisplayName(this._ctx.playerIndex(lunban));
                this._add_action_log(hname + ' 荣和了 ' + bname + '！(' + (hule.defen || '?') + '点)', menfeng);
            }

            let msg = [];
            for (let l = 0; l < 4; l++) {
                msg[l] = JSON.parse(JSON.stringify(paipu));
            }
            this.call_players('hule', msg, this._wait);

            if (this._view) this._view.update(paipu);
        };

        /* _huleExpanderUsed 路径：技能被动扩展了和牌资格（无确认弹窗，直接选牌） */
        console.log('[expander-debug] hule(): _huleExpanderUsed=' + JSON.stringify(this._huleExpanderUsed)
            + ' _genericHuleSelectionDone=' + this._genericHuleSelectionDone);
        if (this._huleExpanderUsed && !this._genericHuleSelectionDone) {
            this._genericHuleSelectionDone = true;
            let expData = this._huleExpanderUsed;
            this._huleExpanderUsed = null;

            let skill = this._skillManager._registry.getSkill(expData.skillId);
            console.log('[expander-debug] _huleExpanderUsed: skillId=' + expData.skillId + ' skill=' + !!skill
                + ' sealed=' + (skill ? skill.sealed.currently : 'N/A')
                + ' hasExecute=' + (skill ? !!skill.effect.execute : 'N/A')
                + ' hasHuleExpander=' + (skill ? !!skill.huleExpander : 'N/A'));
            if (skill && !skill.sealed.currently && skill.effect.execute) {
                let pname = this._playerDisplayName(this._ctx.playerIndex(menfeng));
                this._add_action_log(pname + ' 发动了技能「' + (skill.characterName || '') + '·' + skill.description + '」', menfeng);
                this._skillManager.markSkillUsed(expData.skillId);

                let skillCtx = {
                    player: menfeng, seat: menfeng,
                    shoupai: shoupai, rongpai: rongpai, param: param,
                    lunban: lunban,
                    _overrideRongpai: null,
                    _overridePai: null,
                };
                let isAI = this._canAutoDecideSkill(this._ctx.playerIndex(menfeng));
                console.log('[expander-debug] _huleExpanderUsed: isAI=' + isAI + ' rongpai=' + rongpai + ' menfeng=' + menfeng);
                let input = this._buildSkillInput(skill, isAI);
                let _done = false;
                let ctx = Object.assign(skillCtx, {
                    input: input,
                    game: this,
                    done: function() {
                        if (_done) return;
                        _done = true;
                        /* 自摸：shoupai 已被 winTileOverrider.override 原地修改 */
                        /* 荣和：使用 _overrideRongpai */
                        _continueHule(skillCtx._overrideRongpai || null, shoupai);
                    },
                });
                let ret = skill.effect.execute(ctx);
                if (ret && typeof ret.then === 'function') {
                    ret.then(function() {}).catch(function(e) { console.error(e); });
                }
            } else if (skill && skill.huleExpander && rongpai) {
                console.log('[expander-debug] _huleExpanderUsed: falling back to else-if (no execute or sealed)');
                /* 技能无 execute 但有 huleExpander：
                   荣和时用听牌覆盖原始荣牌（原始舍牌非实际听牌，会致 Majiang.Util.hule 失败） */
                let hand13 = shoupai.clone();
                hand13._zimo = null;
                let ting = Majiang.Util.tingpai(hand13) || [];
                if (ting.length > 0) {
                    let suffix = rongpai.slice(-2);
                    _continueHule(ting[0] + suffix, shoupai);
                } else {
                    _continueHule();
                }
            } else {
                _continueHule();
            }
            return;
        }

        /* 通用：检查技能系统是否有和了牌覆写需求 */
        let genericActions = (huleCheck.actions || []).filter(function(a) {
            return a.skill && a.skill.effect && a.skill.effect.type === EffectType.VIEW_AS_WIN_TILE;
        });
        if (genericActions.length > 0 && !this._genericHuleSelectionDone) {
            this._genericHuleSelectionDone = true;
            let skillCtx = {
                player: menfeng, seat: menfeng,
                shoupai: shoupai, rongpai: rongpai, param: param,
                lunban: lunban,
                _overrideRongpai: null,
            };

            /* 按钮触发：跳过确认，直接执行技能 */
            if (this._pendingHuleSkillId) {
                let pendingId = this._pendingHuleSkillId;
                this._pendingHuleSkillId = null;
                let pendingAction = genericActions.find(function(a) {
                    return a.skill.id === pendingId;
                });
                if (pendingAction) {
                    let pname = this._playerDisplayName(this._ctx.playerIndex(menfeng));
                    this._add_action_log(pname + ' 发动了技能「' + (pendingAction.skill.characterName || '') + '·' + pendingAction.skill.description + '」', menfeng);
                    this._skillManager.markSkillUsed(pendingId);
                    let input = this._buildSkillInput(pendingAction.skill, false);
                    let _done = false;
                    let ctx = Object.assign(skillCtx, {
                        input: input,
                        done: function() {
                            if (_done) return;
                            _done = true;
                            _continueHule(skillCtx._overrideRongpai, shoupai);
                        },
                    });
                    let ret = pendingAction.skill.effect.execute(ctx);
                    if (ret && typeof ret.then === 'function') {
                        ret.then(function() {}).catch(function(e) { console.error(e); });
                    }
                } else {
                    _continueHule();
                }
                return;
            }

            this._executeOptionalSkill(genericActions[0], skillCtx, function() {
                _continueHule(skillCtx._overrideRongpai, shoupai);
            });
            return;
        }

        /* 正常和牌流程 */
        _continueHule();
    }

    pingju(name, shoupai = ['','','','']) {

        let model = this._model;

        let fenpei  = [0,0,0,0];

        if (! name) {

            let n_tingpai = 0;
            for (let l = 0; l < 4; l++) {
                if (this._rule['ノーテン宣言あり'] && ! shoupai[l]
                    && ! model.shoupai[l].lizhi) continue;
                if (! this._rule['ノーテン罰あり']
                    && (this._rule['連荘方式'] != 2 || l != 0)
                    && ! model.shoupai[l].lizhi)
                {
                    shoupai[l] = '';
                }
                else if (Majiang.Util.xiangting(model.shoupai[l]) == 0
                        && Majiang.Util.tingpai(model.shoupai[l]).length > 0)
                {
                    n_tingpai++;
                    shoupai[l] = model.shoupai[l].toString();
                    if (this._rule['連荘方式'] == 2 && l == 0)
                                                    this._lianzhuang = true;
                }
                else {
                    /* 正常听牌判定失败，尝试技能扩展 */
                    let expanded = false;
                    if (this._skillManager) {
                        let expanders = this._skillManager.getTenpaiExpanders(l, {
                            shoupai: model.shoupai[l], game: this, player: l,
                        });
                        for (let exp of expanders) {
                            for (let c of exp.candidates) {
                                let testShoupai = model.shoupai[l].clone();
                                try { testShoupai.zimo(c); } catch(e) { continue; }
                                if (Majiang.Util.xiangting(testShoupai) == 0
                                    && Majiang.Util.tingpai(testShoupai).length > 0) {
                                    n_tingpai++;
                                    shoupai[l] = model.shoupai[l].toString();
                                    this._tenpaiExpanderUsed = { skillId: exp.skillId, seat: l, candidate: c };
                                    if (this._rule['連荘方式'] == 2 && l == 0)
                                                                            this._lianzhuang = true;
                                    expanded = true;
                                    break;
                                }
                            }
                            if (expanded) break;
                        }
                    }
                    if (!expanded) {
                        shoupai[l] = '';
                    }
                }
            }
            if (this._rule['流し満貫あり']) {
                for (let l = 0; l < 4; l++) {
                    let all_yaojiu = true;
                    for (let p of model.he[l]._pai) {
                        if (p.match(/[\+\=\-]$/)) { all_yaojiu = false; break }
                        if (p.match(/^z/))          continue;
                        if (p.match(/^[mps][19]/))  continue;
                        all_yaojiu = false; break;
                    }
                    if (all_yaojiu) {
                        name = '流局满贯';
                        for (let i = 0; i < 4; i++) {
                            fenpei[i] += l == 0 && i == l ? 12000
                                       : l == 0           ? -4000
                                       : l != 0 && i == l ?  8000
                                       : l != 0 && i == 0 ? -4000
                                       :                    -2000;
                        }
                    }
                }
            }
            if (! name) {
                name = '荒牌平局';
                if (this._rule['ノーテン罰あり']
                    && 0 < n_tingpai && n_tingpai < 4)
                {
                    for (let l = 0; l < 4; l++) {
                        fenpei[l] = shoupai[l] ?  3000 / n_tingpai
                                               : -3000 / (4 - n_tingpai);
                    }
                }
            }
            if (this._rule['連荘方式'] == 3) this._lianzhuang = true;
        }
        else {
            this._no_game    = true;
            this._lianzhuang = true;
        }

        if (this._rule['場数'] == 0) this._lianzhuang = true;

        this._fenpei = fenpei;

        /* 技能钩子：⑭流局时 */
        this._skill_trigger(TimingPoints.RYUUKYOKU, {
            name: name, shoupai: shoupai, fenpei: fenpei
        });

        let paipu = {
            pingju: { name: name, shoupai: shoupai, fenpei: fenpei }
        };
        this.add_paipu(paipu);

        /* 操作日志 */
        if (name) {
            this._add_action_log(name, this._ctx.currentSeat());
        } else {
            this._add_action_log('流局', this._ctx.currentSeat());
        }

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
        }
        this.call_players('pingju', msg, this._wait);

        if (this._view) this._view.update(paipu);
    }

    last() {

        let model = this._model;

        model.lunban = -1;
        if (this._view) this._view.update();

        /* 技能管理器：局结束 */
        if (this._skillManager) this._skillManager.onHandEnd();

        if (! this._lianzhuang) {
            model.jushu++;
            model.zhuangfeng += (model.jushu / 4)|0;
            model.jushu = model.jushu % 4;
        }

        let jieju = false;
        let guanjun = -1;
        const defen = model.defen;
        for (let i = 0; i < 4; i++) {
            let id = (this._ctx.dealerSeat() + i) % 4;
            if (defen[id] < 0 && this._rule['トビ終了あり'])    jieju = true;
            if (defen[id] >= 30000
                && (guanjun < 0 || defen[id] > defen[guanjun])) guanjun = id;
        }

        let sum_jushu = model.zhuangfeng * 4 + model.jushu;

        if      (15 < sum_jushu)                                jieju = true;
        else if ((this._rule['場数'] + 1) * 4 - 1 < sum_jushu)  jieju = true;
        else if (this._max_jushu < sum_jushu) {
            if      (this._rule['延長戦方式'] == 0)             jieju = true;
            else if (this._rule['場数'] == 0)                   jieju = true;
            else if (guanjun >= 0)                              jieju = true;
            else {
                this._max_jushu += this._rule['延長戦方式'] == 3 ? 4
                                 : this._rule['延長戦方式'] == 2 ? 1
                                 :                                 0;
            }
        }
        else if (this._max_jushu == sum_jushu) {
            if (this._rule['オーラス止めあり'] && guanjun == this._ctx.playerIndex(0)
                && this._lianzhuang && ! this._no_game)         jieju = true;
        }

        /* 非最后一局：下一局开始前重新触发角色选择 */
        if (!jieju && this._onHandStartCb) {
            this.pauseBeforeZimo(this._onHandStartCb);
        }

        if (jieju)  this.delay(()=>this.jieju(), 0);
        else        this.delay(()=>this.qipai(), 0);
    }

    jieju() {

        let model = this._model;

        let paiming = [];
        const defen = model.defen;
        for (let i = 0; i < 4; i++) {
            let id = (this._ctx.dealerSeat() + i) % 4;
            for (let j = 0; j < 4; j++) {
                if (j == paiming.length || defen[id] > defen[paiming[j]]) {
                    paiming.splice(j, 0, id);
                    break;
                }
            }
        }
        defen[paiming[0]] += model.lizhibang * 1000;
        this._paipu.defen = defen;

        let rank = [0,0,0,0];
        for (let i = 0; i < 4; i++) {
            rank[paiming[i]] = i + 1;
        }
        this._paipu.rank = rank;

        const round = ! this._rule['順位点'].find(p=>p.match(/\.\d$/));
        let point = [0,0,0,0];
        for (let i = 1; i < 4; i++) {
            let id = paiming[i];
            point[id] = (defen[id] - 30000) / 1000
                      + + this._rule['順位点'][i];
            if (round) point[id] = Math.round(point[id]);
            point[paiming[0]] -= point[id];
        }
        this._paipu.point = point.map(p=> p.toFixed(round ? 0 : 1));

        let paipu = { jieju: this._paipu };

        let msg = [];
        for (let l = 0; l < 4; l++) {
            msg[l] = JSON.parse(JSON.stringify(paipu));
        }
        this.call_players('jieju', msg, this._wait);

        if (this._view) this._view.summary(this._paipu);

        /* 技能管理器：半庄结束 */
        if (this._skillManager) this._skillManager.onHanchanEnd();

        if (this._handler) this._handler();
    }

    /**
     * 计算指定 seat 在当前巡目的现物（安全牌）列表。
     * 现物 = 该玩家牌河所有牌（含被副露的）
     *      + 该玩家本巡目到当前巡目为止所有玩家的舍牌（暗切不计）
     *      + 若该玩家已立直，追加所有立直后舍牌
     * 牌张的0均转为5，结果去重。
     * @param {number} seat - 目标席位 (0東/1南/2西/3北)
     * @returns {string[]} 去重后的现物牌张数组，如 ['m1','m5','p9']
     */
    getGenbutsu(seat) {
        const resultSet = new Set();
        const model = this._model;

        /* (a) 该玩家牌河中的所有牌（包括被副露的） */
        const he = model.he[seat];
        for (const p of he._pai) {
            if (p === '_') continue;  /* 暗切占位符 */
            const s = p[0];
            const n = (+p[1] || 5);   /* 0→5 */
            resultSet.add(s + n);
        }

        /* (b) 该玩家本巡目到当前巡目为止所有玩家的舍牌 */
        const current = model.lunban;
        /* 确定起始席位：若目标玩家本巡已打过牌，从其开始；否则从巡主开始 */
        let start = this._lastDiscard[seat] !== null ? seat : this._turnOwner;
        for (let s = start; s !== current; s = (s + 1) % 4) {
            const dp = this._lastDiscard[s];
            if (dp !== null) {
                const suit = dp[0];
                const num = (+dp[1] || 5);  /* 0→5 */
                resultSet.add(suit + num);
            }
        }

        /* (c) 若该玩家已立直，追加立直后所有舍牌 */
        if (this._lizhi[seat]) {
            for (const p of this._riichiDiscards) {
                resultSet.add(p);  /* 已做过0→5转换 */
            }
        }

        return [...resultSet];
    }

    /**
     * 基于现物列表计算筋牌（外筋 + 两筋）。
     * 外筋：对每种花色，4在现物→1和7为外筋，5在现物→2和8，6在现物→3和9。
     * 两筋：对每种花色，1和7同时在现物→4为两筋，2和8同时在→5，3和9同时在→6。
     * 字牌（z）不参与筋牌计算。
     * @param {string[]} genbutsu - 现物牌张数组，如 ['m1','m5','p9']
     * @returns {string[]} 去重后的筋牌数组，如 ['m1','m7','m4']
     */
    getSuji(genbutsu) {
        const genbutsuSet = new Set(genbutsu);
        const sujiSet = new Set();
        const suits = ['m', 'p', 's'];

        for (const s of suits) {
            /* 外筋 */
            if (genbutsuSet.has(s + '4')) {
                sujiSet.add(s + '1');
                sujiSet.add(s + '7');
            }
            if (genbutsuSet.has(s + '5')) {
                sujiSet.add(s + '2');
                sujiSet.add(s + '8');
            }
            if (genbutsuSet.has(s + '6')) {
                sujiSet.add(s + '3');
                sujiSet.add(s + '9');
            }

            /* 两筋 */
            if (genbutsuSet.has(s + '1') && genbutsuSet.has(s + '7')) {
                sujiSet.add(s + '4');
            }
            if (genbutsuSet.has(s + '2') && genbutsuSet.has(s + '8')) {
                sujiSet.add(s + '5');
            }
            if (genbutsuSet.has(s + '3') && genbutsuSet.has(s + '9')) {
                sujiSet.add(s + '6');
            }
        }

        return [...sujiSet];
    }

    get_reply(l) {
        let model = this._model;
        return this._reply[this._ctx.playerIndex(l)];
    }

    reply_kaiju() { this.delay(()=>this.qipai(), 0) }

    reply_qipai() {
        /* 角色选择暂停：等待角色选定后再摸牌 */
        if (this._pauseBeforeZimo) {
            if (this._onPauseComplete) this._onPauseComplete();
            return;
        }
        this.delay(()=>this.zimo(), 0)
    }

    reply_zimo() {

        let model = this._model;
        let lunban = model.lunban;
        let isHuman = !this._canAutoDecideSkill(this._ctx.playerIndex(lunban));

        /* ── AI 路径：先触发 BEFORE_DISCARD，全部技能执行完毕后再让 AI 算牌 ── */
        if (!isHuman) {
            this._aiReplyZimo(lunban);
            return;
        }

        /* ── 人类路径：已通过 UI 选择打牌/和牌/杠牌 ── */
        /* 辅助：包装 dapai 调用，插入通用 BEFORE_DISCARD / DISCARD_SELECTED 处理 */
        let _doDapai = (dp) => {
            this._debugSkill && console.log('[DEBUG] _doDapai 开始: dp=' + dp +
                ', turnTriggerLog=' + JSON.stringify(this._skillManager?._turnTriggerLog));
            /* 通用：触发 BEFORE_DISCARD 并收集可选技能动作 */
            let beforeResult = this._skill_trigger(TimingPoints.BEFORE_DISCARD, {
                player: lunban, dapai: dp,
                turnId: this._turnId, turnOwner: this._turnOwner,
                turnType: this._turnType,
                roundId: this._roundIds[lunban],
                firstTurn: this._isFirstTurn[lunban],
                lastDiscard: this._lastDiscard,
                genbutsu: (s) => this.getGenbutsu(s),
                getSuji: (genbutsu) => this.getSuji(genbutsu),
            });
            let hasBeforeActions = beforeResult.actions && beforeResult.actions.length > 0;

            /* 标记 BEFORE_DISCARD 已触发，防止 dapai() 内重复触发 */
            this._beforeDiscardDone = true;

            let _doActualDapai = () => {
                /* 只重置 DISCARD_SELECTED，不重置 BEFORE_DISCARD（避免死循环） */
                this._discardSelectedDone = false;
                /* 技能可能要求重选打牌 */
                let actualDp = this._skillRedapai != null ? this._skillRedapai : dp;
                this._skillRedapai = null;
                this.delay(() => this._safeDapai(actualDp), 0);
            };

            /* 通用：触发 DISCARD_SELECTED 并收集可选技能动作 */
            let discardResult = this._skill_trigger(TimingPoints.DISCARD_SELECTED, {
                player: lunban, dapai: dp,
                turnId: this._turnId, turnOwner: this._turnOwner,
                turnType: this._turnType,
                roundId: this._roundIds[lunban],
                lastDiscard: this._lastDiscard,
            });
            let hasDiscardActions = discardResult.actions && discardResult.actions.length > 0;
            this._debugSkill && console.log('[DEBUG] _doDapai DISCARD_SELECTED: hasBeforeActions=' + hasBeforeActions +
                ', hasDiscardActions=' + hasDiscardActions +
                ', discardActions=' + JSON.stringify(discardResult.actions?.map(a => a.skill?.id)) +
                ', turnTriggerLog=' + JSON.stringify(this._skillManager?._turnTriggerLog));

            let isHuman = !this._canAutoDecideSkill(this._ctx.playerIndex(lunban));

            if (hasBeforeActions && !isHuman) {
                /* AI：先 BEFORE_DISCARD，完成后再 DISCARD_SELECTED。
                 * BEFORE_DISCARD 技能（如天江衣④）执行完毕后，
                 * shouldAutoExecute 能检测到触发记录，
                 * 自动执行关联的 DISCARD_SELECTED 技能（如天江衣②）。 */
                this._discardSelectedDone = true;

                /* 技能执行后手牌可能已变（天江衣④交换海底牌），
                 * AI 需要重新决定是否和牌、暗杠、或打哪张。 */
                let _reEvaluateAI = () => {
                    /* 防止重新评估引致的 _doActualDapai 重置 _beforeDiscardDone 造成 BEFORE_DISCARD 死循环 */
                    this._beforeDiscardDone = true;
                    try {
                    let shoupai = model.shoupai[lunban];
                    if (!shoupai) { _doActualDapai(); return; }

                    /* 验证打牌是否仍在手牌中（技能可能已修改手牌） */
                    let _tileValid = (tile) => {
                        if (!tile) return false;
                        let clean = tile.replace(/[_*]$/, '');
                        return shoupai._zimo === tile
                            || shoupai.toString().indexOf(clean) >= 0;
                    };

                    if (typeof this._players[lunban].action_zimo === 'function') {
                        let savedSync = this._sync;
                        this._sync = true;
                        this._players[lunban].action_zimo(
                            { l: lunban, p: shoupai._zimo }, false);
                        this._sync = savedSync;
                        let newReply = this.get_reply(lunban);
                        if (!newReply) { _doActualDapai(); return; }
                        if (newReply.hule) {
                            this.say('zimo', lunban);
                            return this.delay(() => this.hule(), 0);
                        } else if (newReply.gang
                                && this.get_gang_mianzi(lunban).find(m => m == newReply.gang)) {
                            this.say('gang', lunban);
                            return this.delay(() => this.gang(newReply.gang), 0);
                        } else if (newReply.daopai) {
                            return this.delay(() => {
                                let l = ['','','',''];
                                l[lunban] = shoupai.toString();
                                this.pingju('九種九牌', l);
                            }, 0);
                        } else if (newReply.dapai && _tileValid(newReply.dapai)) {
                            this.delay(() => this._safeDapai(newReply.dapai), 0);
                        } else if (_tileValid(shoupai._zimo)) {
                            /* 兜底：打出摸到的牌 */
                            this.delay(() => this._safeDapai(shoupai._zimo), 0);
                        } else {
                            _doActualDapai();
                        }
                    } else {
                        /* 服务端 AI 无法直接重评估：技能可能改变了手牌，
                         * 检查 dp 是否仍有效，无效则兜底打出摸到的牌 */
                        let shoupai = model.shoupai[lunban];
                        if (!shoupai) { _doActualDapai(); return; }
                        if (_tileValid(dp)) {
                            _doActualDapai();
                        } else if (_tileValid(shoupai._zimo)) {
                            this._beforeDiscardDone = false;
                            this._skillRedapai = null;
                            this.delay(() => this._safeDapai(shoupai._zimo), 0);
                        } else {
                            _doActualDapai();
                        }
                    }
                    } catch (ex) {
                        /* AI 重评估异常，兜底打出原牌 */
                        _doActualDapai();
                    }
                };

                let _afterBefore = () => {
                    /* 重新触发 DISCARD_SELECTED：
                     * BEFORE_DISCARD 技能（如天江衣④）执行完毕后，
                     * shouldAutoExecute 能检测到最新触发记录，
                     * 关联技能（如天江衣②）自动执行。 */
                    this._debugSkill && console.log('[DEBUG] _afterBefore: 重新触发 DISCARD_SELECTED, turnTriggerLog=' +
                        JSON.stringify(this._skillManager?._turnTriggerLog));
                    let freshDiscardResult = this._skill_trigger(TimingPoints.DISCARD_SELECTED, {
                        player: lunban, dapai: dp,
                        turnId: this._turnId, turnOwner: this._turnOwner,
                        turnType: this._turnType,
                        roundId: this._roundIds[lunban],
                        lastDiscard: this._lastDiscard,
                    });
                    let freshDiscActions = freshDiscardResult.actions
                        && freshDiscardResult.actions.length > 0;
                    this._debugSkill && console.log('[DEBUG] _afterBefore DISCARD_SELECTED 重新触发: freshDiscActions=' +
                        JSON.stringify(freshDiscardResult.actions?.map(a => a.skill?.id)));
                    if (freshDiscActions) {
                        this._executeOptionalSkill(freshDiscardResult.actions[0], {
                            player: lunban, dapai: dp,
                            seat: freshDiscardResult.actions[0].seat,
                        }, _reEvaluateAI);
                    } else {
                        _reEvaluateAI();
                    }
                };
                this._executeOptionalSkill(beforeResult.actions[0], {
                    player: lunban, dapai: dp, seat: beforeResult.actions[0].seat,
                }, _afterBefore);
            } else {
                /* 标记 DISCARD_SELECTED 已触发，防止 dapai() 内重复触发 */
                this._discardSelectedDone = true;
                if (hasDiscardActions) {
                    this._executeOptionalSkill(discardResult.actions[0], {
                        player: lunban, dapai: dp, seat: discardResult.actions[0].seat,
                    }, _doActualDapai);
                } else {
                    _doActualDapai();
                }
            }
        };

        let reply = this.get_reply(lunban);
        if (!reply) return;
        if (reply.daopai) {
            if (this.allow_pingju()) {
                let shoupai = ['','','',''];
                shoupai[lunban] = model.shoupai[lunban].toString();
                return this.delay(()=>this.pingju('九種九牌', shoupai), 0);
            }
        }
        else if (reply.hule) {
            if (this.allow_hule()) {
                this.say('zimo', lunban);
                return this.delay(()=>this.hule());
            }
        }
        else if (reply.gang) {
            if (this.get_gang_mianzi().find(m => m == reply.gang)) {
                this.say('gang', lunban);
                return this.delay(()=>this.gang(reply.gang));
            }
        }
        else if (reply.skillAction) {
            /* 通用：DECLARE_HULE 可选技能按钮触发 → 进入和牌流程 */
            if (typeof reply.skillAction === 'string' && reply.skillAction.startsWith('hule_')) {
                let skillId = reply.skillAction.substring(5);
                this._pendingHuleSkillId = skillId;
                /* 不经 allow_hule 检查，技能自身 condition 已验证可用；
                   牌型覆写由 _getHuleParam -> _pendingHuleSkillId 分支处理 */
                this.say('zimo', lunban);
                this.delay(() => this.hule(), 0);
                return;
            }
            /* 通用：BEFORE_DISCARD 可选技能按钮触发 */
            this._executeBeforeDiscardFromButton(reply.skillAction);
            return;
        }
        else if (reply.dapai) {
            let dapai = reply.dapai.replace(/\*$/,'');
            /* 庄家第一巡：根据规则书，初始手牌均视为手切，去掉 _ 后缀 */
            if (this._diyizimo) dapai = dapai.replace(/_$/,'');
            let dapais = this.get_dapai();
            if (dapais && dapais.find(p => p == dapai)) {
                if (reply.dapai.slice(-1) == '*' && this.allow_lizhi(dapai)) {
                    this.say('lizhi', lunban);
                    return _doDapai(reply.dapai);
                }
                return _doDapai(dapai);
            }
            /* 点击了摸入牌：匹配 tsumogiri 选项（带 _ 后缀） */
            if (dapais && dapais.find(p => p == dapai + '_')) {
                /* 庄家第一巡：根据规则书，初始手牌均视为手切，不添加 _ 后缀 */
                if (this._diyizimo) {
                    return _doDapai(dapai);
                }
                return _doDapai(dapai + '_');
            }
        }

        let p = this.get_dapai().pop();
        _doDapai(p);
    }

    reply_dapai() {

        let model = this._model;
        let lunban = model.lunban;
        let isHidden = this._dapaiHidden;
        this._dapaiHidden = false;

        /* 技能钩子：⑤询问副露时 — 向非舍牌玩家依次询问选择 */
        if (!isHidden) {
            for (let i = 1; i < 4; i++) {
                let l = (lunban + i) % 4;
                this._skill_trigger(TimingPoints.ASK_FULOU, {
                    player: l, dapai: this._dapai, discardBy: lunban,
                    turnId: this._turnId,
                    roundId: this._roundIds[l],
                });
            }
        }

        /* 荣和判断 */
        if (!isHidden) {
            for (let i = 1; i < 4; i++) {
                let l = (lunban + i) % 4;
                let reply = this.get_reply(l);
                if (!reply) continue;
                if (reply.hule && this.allow_hule(l)) {
                    if (this._rule['最大同時和了数'] == 1  && this._hule.length)
                                                                        continue;
                    this.say('rong', l);
                    this._hule.push(l);
                }
                else {
                    let shoupai = model.shoupai[l].clone().zimo(this._dapai);
                    if (Majiang.Util.xiangting(shoupai) == -1)
                                                    this._neng_rong[l] = false;
                }
            }
        }
        if (this._hule.length == 3 && this._rule['最大同時和了数'] == 2) {
            let shoupai = ['','','',''];
            for (let l of this._hule) {
                shoupai[l] = model.shoupai[l].toString();
            }
            return this.delay(()=>this.pingju('三家和', shoupai));
        }
        else if (this._hule.length) {
            return this.delay(()=>this.hule());
        }

        if (this._dapai.slice(-1) == '*') {
            model.defen[this._ctx.currentPlayerIndex()] -= 1000;
            model.lizhibang++;

            if (this._lizhi.filter(x=>x).length == 4
                && this._rule['途中流局あり'])
            {
                let shoupai = model.shoupai.map(s=>s.toString());
                return this.delay(()=>this.pingju('四家立直', shoupai));
            }
        }

        if (this._diyizimo && lunban == 3) {
            this._diyizimo = false;
            if (this._fengpai) {
                return this.delay(()=>this.pingju('四風連打'), 0);
            }
        }

        if (this._n_gang.reduce((x, y)=> x + y) == 4) {
            if (Math.max(...this._n_gang) < 4 && this._rule['途中流局あり']) {
                return this.delay(()=>this.pingju('四開槓'), 0);
            }
        }

        if (! model.shan.paishu) {
            let shoupai = ['','','',''];
            for (let l = 0; l < 4; l++) {
                let reply = this.get_reply(l);
                if (reply && reply.daopai) shoupai[l] = reply.daopai;
            }
            return this.delay(()=>this.pingju('', shoupai), 0);
        }

        /* 副露判断（碰/大明杠优先级） */
        if (!isHidden) {
            for (let i = 1; i < 4; i++) {
                let l = (lunban + i) % 4;
                let reply = this.get_reply(l);
                if (reply && reply.fulou) {
                    let m = reply.fulou.replace(/0/g,'5');
                    if (m.match(/^[mpsz](\d)\1\1\1/)) {
                        if (this.get_gang_mianzi(l).find(m => m == reply.fulou)) {
                            this.say('gang', l);
                            return this.delay(()=>this.fulou(reply.fulou));
                        }
                    }
                    else if (m.match(/^[mpsz](\d)\1\1/)) {
                        if (this.get_peng_mianzi(l).find(m => m == reply.fulou)) {
                            this.say('peng', l);
                            return this.delay(()=>this.fulou(reply.fulou));
                        }
                    }
                }
            }
            for (let i = 1; i < 4; i++) {
                let l = (lunban + i) % 4;
                let reply = this.get_reply(l);
                if (reply && reply.fulou) {
                    if (this.get_chi_mianzi(l).find(m => m == reply.fulou)) {
                        this.say('chi', l);
                        return this.delay(()=>this.fulou(reply.fulou));
                    }
                }
            }
        }

        /* 技能钩子：⑧舍牌后（无人鸣牌，巡目结束） */
        this._isExtraTurnDiscard = false;

        this._isFirstTurn[lunban] = false;  /* 巡目结束，不再视为第一巡 */

        let skillResult = this._skill_trigger(TimingPoints.AFTER_DISCARD, {
            player: lunban, dapai: this._dapai,
            turnId: this._turnId,
            roundId: this._roundIds[lunban],
        });

        if (skillResult.actions && skillResult.actions.length > 0) {
            try {
                this._executeOptionalSkill(skillResult.actions[0], {
                    player: lunban,
                    seat: skillResult.actions[0].seat,
                    dapai: this._dapai,
                }, () => {
                    /* 技能链执行完成，检查是否触发了额外巡 */
                    if (this._extra_turn && this._extra_turn.player === lunban) {
                        this.delay(() => this._extra_zimo(), 0);
                    } else {
                        this._extra_turn = null;
                        this.delay(() => this.zimo(), 0);
                    }
                });
            } catch(e) {
                console.error('_executeOptionalSkill ERROR:', e.message, e.stack);
                this._extra_turn = null;
                this.delay(() => this.zimo(), 0);
            }
            return;
        }

        /* 检查是否有待处理的额外巡 */
        if (this._extra_turn && this._extra_turn.player === this._ctx.currentSeat()) {
            this.delay(() => this._extra_zimo(), 0);
        }
        /* 通用额外巡链续：技能可通过设置 _extra_chain_remaining 实现多巡连续 */
        else if (this._extra_chain_remaining > 0) {
            this._extra_chain_remaining--;
            this._extra_turn = { player: lunban };
            this.delay(() => this._extra_zimo(), 0);
        }
        else {
            this._extra_turn = null;
            this._extra_chain_remaining = -1;
            this.delay(()=>this.zimo(), 0);
        }
    }

    /**
     * 同步 AI 玩家的 Board 手牌与游戏当前手牌。
     * 在 BEFORE_DISCARD 技能修改手牌后调用，确保 AI 重评估基于最新手牌。
     */
    _syncAiBoardHand(seat) {
        let model = this._model;
        let playerIdx = this._ctx.playerIndex(seat);
        let player = this._players[playerIdx];
        if (!player || !player._model) return;
        let gameHand = model.shoupai[seat];
        if (gameHand) {
            player._model.shoupai[seat] = gameHand.clone();
        }
    }

    /**
     * AI 专用：先触发并执行全部 BEFORE_DISCARD 技能，
     * 完毕后 AI 再计算打牌（避免重评估）。
     */
    _aiReplyZimo(lunban) {
        let model = this._model;
        this._beforeDiscardDone = true;

        let beforeResult = this._skill_trigger(TimingPoints.BEFORE_DISCARD, {
            player: lunban, dapai: null,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: this._turnType,
            roundId: this._roundIds[lunban],
            firstTurn: this._isFirstTurn[lunban],
            lastDiscard: this._lastDiscard,
            genbutsu: (s) => this.getGenbutsu(s),
            getSuji: (genbutsu) => this.getSuji(genbutsu),
        });
        let hasBeforeActions = beforeResult.actions && beforeResult.actions.length > 0;
        this._debugSkill && console.log('[DEBUG] _aiReplyZimo: hasBeforeActions=' + hasBeforeActions +
            ', beforeActions=' + JSON.stringify(beforeResult.actions?.map(a => a.skill?.id)));

        if (hasBeforeActions) {
            this._executeOptionalSkill(beforeResult.actions[0], {
                player: lunban, seat: beforeResult.actions[0].seat,
            }, () => {
                this._aiDecideAfterBefore(lunban);
            });
            return;
        }

        this._aiDecideAfterBefore(lunban);
    }

    /**
     * BEFORE_DISCARD 全部执行完毕，AI 计算打牌/和牌/杠牌，
     * 然后走 DISCARD_SELECTED 完成舍牌。
     * 若 BEFORE_DISCARD 技能修改了手牌（如天江衣④交换海底牌），
     * 先同步 AI Board 状态再重跑 AI 决策，避免基于旧手牌判断。
     */
    _aiDecideAfterBefore(lunban) {
        let model = this._model;

        /* 同步 AI Board 手牌（BEFORE_DISCARD 技能可能已改变手牌） */
        this._syncAiBoardHand(lunban);

        /* 重新评估 AI 决策（基于技能修改后的最新手牌） */
        let shoupai = model.shoupai[lunban];
        if (shoupai) {
            let playerIdx = this._ctx.playerIndex(lunban);
            let player = this._players[playerIdx];
            if (typeof player.action_zimo === 'function') {
                let savedSync = this._sync;
                this._sync = true;
                try {
                    player.action_zimo(
                        { l: lunban, p: shoupai._zimo }, false);
                } catch(e) {
                    /* AI 重评估异常，忽略 */
                }
                this._sync = savedSync;
            }
        }

        let reply = this.get_reply(lunban);
        if (!reply) return;

        if (reply.daopai) {
            if (this.allow_pingju() && shoupai) {
                let shoupaiArr = ['','','',''];
                shoupaiArr[lunban] = shoupai.toString();
                return this.delay(() => this.pingju('九種九牌', shoupaiArr), 0);
            }
        } else if (reply.hule) {
            if (shoupai && this.allow_hule()) {
                this.say('zimo', lunban);
                return this.delay(() => this.hule());
            }
        } else if (reply.gang) {
            if (shoupai && this.get_gang_mianzi(lunban).find(m => m == reply.gang)) {
                this.say('gang', lunban);
                return this.delay(() => this.gang(reply.gang));
            }
        } else if (reply.dapai) {
            let dapai = reply.dapai.replace(/\*$/,'');
            if (this._diyizimo) dapai = dapai.replace(/_$/,'');
            let dapais = this.get_dapai();
            if (dapais && dapais.find(p => p == dapai || p == dapai + '_')) {
                if (reply.dapai.slice(-1) == '*' && this.allow_lizhi(dapai)) {
                    this.say('lizhi', lunban);
                }
                this._doDapaiAi(lunban, dapai);
                return;
            }
            /* 兜底：AI 选的牌不在可选列表中（技能改变了手牌），
             * 尝试打出摸到的牌 */
            if (shoupai && shoupai._zimo && dapais
                && dapais.find(p => p == shoupai._zimo || p == shoupai._zimo + '_')) {
                this._doDapaiAi(lunban, shoupai._zimo);
                return;
            }
        }
        /* 最终兜底：打出任意可打牌 */
        if (shoupai && shoupai._zimo) {
            this._doDapaiAi(lunban, shoupai._zimo);
        }
    }

    /**
     * AI 专用：处理 DISCARD_SELECTED 并执行最终舍牌。
     * BEFORE_DISCARD 已在 _aiReplyZimo 中处理。
     */
    _doDapaiAi(lunban, dp) {
        let model = this._model;
        this._discardSelectedDone = true;

        let discResult = this._skill_trigger(TimingPoints.DISCARD_SELECTED, {
            player: lunban, dapai: dp,
            turnId: this._turnId, turnOwner: this._turnOwner,
            turnType: this._turnType,
            roundId: this._roundIds[lunban],
            lastDiscard: this._lastDiscard,
        });
        let discActions = discResult.actions;
        let hasDiscActions = discActions && discActions.length > 0;
        this._debugSkill && console.log('[DEBUG] _doDapaiAi DISCARD_SELECTED: discActions=' +
            JSON.stringify(discActions?.map(a => a.skill?.id)) +
            ', turnTriggerLog=' + JSON.stringify(this._skillManager?._turnTriggerLog));

        let _doActualDapai = () => {
            this._discardSelectedDone = false;
            let actualDp = this._skillRedapai != null ? this._skillRedapai : dp;
            this._skillRedapai = null;
            this.delay(() => this._safeDapai(actualDp), 0);
        };

        if (hasDiscActions) {
            this._executeOptionalSkill(discActions[0], {
                player: lunban, dapai: dp, seat: discActions[0].seat,
            }, _doActualDapai);
        } else {
            _doActualDapai();
        }
    }

    reply_fulou() {

        let model = this._model;
        let lunban = model.lunban;

        if (this._gang) {
            return this.delay(()=>this.gangzimo(), 0);
        }

        let reply = this.get_reply(lunban);
        if (!reply) return;

        /* 通用：BEFORE_DISCARD 可选技能按钮触发（副露后舍牌前） */
        if (reply.skillAction) {
            let self = this;
            let triggerResult = this._skill_trigger(TimingPoints.BEFORE_DISCARD, {
                player: lunban,
                turnId: this._turnId, turnOwner: this._turnOwner,
                turnType: this._turnType,
                roundId: this._roundIds[lunban],
                firstTurn: this._isFirstTurn[lunban],
                lastDiscard: this._lastDiscard,
                genbutsu: (s) => this.getGenbutsu(s),
                getSuji: (genbutsu) => this.getSuji(genbutsu),
            });
            if (triggerResult.actions && triggerResult.actions.length > 0) {
                let action = triggerResult.actions.find(a => a.skill.id === reply.skillAction);
                if (action) {
                    this._executeOptionalSkill(action, {
                        player: lunban, seat: action.seat,
                    }, function() {
                        /* 技能执行完毕，重新进入副露舍牌界面 */
                        let player = self._players[self.seatToPlayerIdx(lunban)];
                        if (player) {
                            if (player._model && player._model.shoupai) {
                                player._model.shoupai[lunban] = model.shoupai[lunban].clone();
                            }
                            let view = player._view || self._view;
                            if (view) {
                                view.redraw();
                            }
                            if (typeof player.action_fulou === 'function') {
                                player.action_fulou(self._currentFulou);
                            }
                        }
                    }, { skipConfirm: true });
                    return;
                }
            }
        }

        if (reply.dapai) {
            if (this.get_dapai().find(p => p == reply.dapai)) {
                return this.delay(() => this._safeDapai(reply.dapai), 0);
            }
        }

        let p = this.get_dapai().pop();
        this.delay(() => this._safeDapai(p), 0);
    }

    /**
     * 安全打牌：兜底处理 bingpai 不一致导致的异常。
     * 技能操作可能使 shoupai 的 bingpai 与字符串表示不同步，
     * 此方法在打牌失败时依次尝试 _zimo 和剩余有效手牌。
     */
    _safeDapai(dapai) {
        try {
            this.dapai(dapai);
        } catch (e) {
            let model = this._model;
            let lunban = model.lunban;
            let shoupai = model.shoupai[lunban];
            if (!shoupai) return;
            /* 尝试 _zimo */
            if (shoupai._zimo && shoupai._zimo !== dapai) {
                try { this.dapai(shoupai._zimo); return; } catch (e2) {}
            }
            /* 尝试 get_dapai 中任意合法牌 */
            let dapais = this.get_dapai();
            if (dapais && dapais.length > 0) {
                for (let dp of dapais) {
                    if (dp === dapai) continue;
                    let cleanDp = dp.replace(/[_*]$/, '');
                    try { this.dapai(cleanDp); return; } catch (e3) {}
                }
            }
            /* 最终兜底：bingpai 已损坏，从手牌字符串重建 shoupai 后重试 */
            try {
                let paiStr = shoupai.toString();
                let newShoupai = Majiang.Shoupai.fromString(paiStr);
                /* 继承旧 shoupai 的关键状态 */
                newShoupai._markedTiles = shoupai._markedTiles;
                model.shoupai[lunban] = newShoupai;
                /* 用新 shoupai 重试打牌 */
                try { this.dapai(dapai); return; } catch (e4) {}
                if (newShoupai._zimo) {
                    try { this.dapai(newShoupai._zimo); return; } catch (e5) {}
                }
            } catch (eRebuild) {}
        }
    }

    reply_gang() {

        let model = this._model;
        let lunban = model.lunban;

        if (this._gang.match(/^[mpsz]\d{4}$/)) {
            return this.delay(()=>this.gangzimo(), 0);
        }

        for (let i = 1; i < 4; i++) {
            let l = (lunban + i) % 4;
            let reply = this.get_reply(l);
            if (reply && reply.hule && this.allow_hule(l)) {
                if (this._rule['最大同時和了数'] == 1  && this._hule.length)
                                                                    continue;
                this.say('rong', l);
                this._hule.push(l);
            }
            else {
                let p = this._gang[0] + this._gang.slice(-1);
                let shoupai = model.shoupai[l].clone().zimo(p);
                if (Majiang.Util.xiangting(shoupai) == -1)
                                                this._neng_rong[l] = false;
            }
        }
        if (this._hule.length) {
            return this.delay(()=>this.hule());
        }

        this.delay(()=>this.gangzimo(), 0);
    }

    reply_hule() {

        let model = this._model;

        for (let l = 0; l < 4; l++) {
            model.defen[this._ctx.playerIndex(l)] += this._fenpei[l];
        }
        model.changbang = 0;
        model.lizhibang = 0;

        if (this._hule.length) {
            return this.delay(()=>this.hule());
        }
        else {
            if (this._lianzhuang) model.changbang = this._changbang + 1;
            return this.delay(()=>this.last(), 0);
        }
    }

    reply_pingju() {

        let model = this._model;

        for (let l = 0; l < 4; l++) {
            model.defen[this._ctx.playerIndex(l)] += this._fenpei[l];
        }
        model.changbang++;

        this.delay(()=>this.last(), 0);
    }

    get_dapai() {
        let model = this._model;
        let seat = this._ctx.currentSeat();
        let shoupai = model.shoupai[seat];
        if (!shoupai) return [];
        let dp = Game.get_dapai(this._rule, shoupai);
        /* 涩谷尧深手切限制：过滤本巡摸入牌 */
        if (this._skillHandDiscard && this._skillHandDiscard.seat === seat) {
            let zimoTile = shoupai._zimo;
            dp = dp.filter(p => p !== zimoTile && p !== zimoTile + '_');
        }
        return dp;
    }

    get_chi_mianzi(l) {
        let model = this._model;
        let d = '_+=-'[(4 + this._ctx.currentSeat() - l) % 4];
        let result = Game.get_chi_mianzi(this._rule, model.shoupai[l],
                                          this._dapai + d, model.shan.paishu) || [];

        if (!this._skillManager) return result;

        /* 技能扩展器：即使正常有结果也检查（如姊带丰音可选前面牌河的牌） */
        let expanders = this._skillManager.getChiExpanders(l, {
            shoupai: model.shoupai[l], game: this, player: l,
            dapai: this._dapai,
            dapaiDiscarderPreRiichi: this._dapaiDiscarderPreRiichi,
        });
        for (let exp of expanders) {
            for (let c of exp.candidates) {
                if (c === this._dapai.replace(/\*$/, '')) continue;
                let testResult = Game.get_chi_mianzi(this._rule, model.shoupai[l],
                                                     c + '-', model.shan.paishu);
                if (testResult.length > 0) {
                    this._chiExpanderUsed = { skillId: exp.skillId, seat: l, candidate: c };
                    for (let m of testResult) {
                        if (!result.includes(m)) result.push(m);
                    }
                }
            }
        }
        return result;
    }

    get_peng_mianzi(l) {
        let model = this._model;
        let d = '_+=-'[(4 + this._ctx.currentSeat() - l) % 4];
        let result = Game.get_peng_mianzi(this._rule, model.shoupai[l],
                                          this._dapai + d, model.shan.paishu) || [];

        if (!this._skillManager) return result;

        /* 技能扩展器：即使正常有结果也检查 */
        let expanders = this._skillManager.getPonExpanders(l, {
            shoupai: model.shoupai[l], game: this, player: l,
            dapai: this._dapai,
        });
        for (let exp of expanders) {
            for (let c of exp.candidates) {
                if (c === this._dapai.replace(/\*$/, '')) continue;
                let testResult = Game.get_peng_mianzi(this._rule, model.shoupai[l],
                                                      c + d, model.shan.paishu);
                if (testResult.length > 0) {
                    this._ponExpanderUsed = { skillId: exp.skillId, seat: l, candidate: c };
                    for (let m of testResult) {
                        if (!result.includes(m)) result.push(m);
                    }
                }
            }
        }
        return result;
    }

    get_gang_mianzi(l) {
        let model = this._model;
        if (l == null) {
            return Game.get_gang_mianzi(this._rule, model.shoupai[this._ctx.currentSeat()],
                                        null, model.shan.paishu,
                                        this._n_gang.reduce((x, y)=> x + y));
        }
        else {
            let d = '_+=-'[(4 + this._ctx.currentSeat() - l) % 4];
            let result = Game.get_gang_mianzi(this._rule, model.shoupai[l],
                                              this._dapai + d, model.shan.paishu,
                                              this._n_gang.reduce((x, y)=> x + y)) || [];

            if (!this._skillManager) return result;

            /* 技能扩展器：即使正常有结果也检查 */
            let expanders = this._skillManager.getKanExpanders(l, {
                shoupai: model.shoupai[l], game: this, player: l,
                dapai: this._dapai,
            });
            for (let exp of expanders) {
                for (let c of exp.candidates) {
                    if (c === this._dapai.replace(/\*$/, '')) continue;
                    let testResult = Game.get_gang_mianzi(this._rule, model.shoupai[l],
                                                          c + d, model.shan.paishu,
                                                          this._n_gang.reduce((x, y)=> x + y));
                    if (testResult.length > 0) {
                        this._kanExpanderUsed = { skillId: exp.skillId, seat: l, candidate: c };
                        for (let m of testResult) {
                            if (!result.includes(m)) result.push(m);
                        }
                    }
                }
            }
            return result;
        }
    }

    allow_lizhi(p) {
        let model = this._model;
        return Game.allow_lizhi(this._rule, model.shoupai[this._ctx.currentSeat()],
                                p, model.shan.paishu,
                                model.defen[this._ctx.currentPlayerIndex()]);
    }

    allow_hule(l) {
        let model = this._model;

        /** 用给定手牌和荣和牌做正常和牌判定 */
        let _check = (shoupai, p, seat, hupai) => {
            if (l == null) {
                return Game.allow_hule(this._rule, shoupai, null,
                                       model.zhuangfeng, seat, hupai);
            } else {
                return Game.allow_hule(this._rule, shoupai, p,
                                       model.zhuangfeng, seat, hupai,
                                       this._neng_rong[l]);
            }
        };

        /* 和牌限制检查辅助：在 return true 前检查其他玩家的 huleRestrictor */
        let _checkHuleRestriction = (targetSeat, isRon) => {
            if (!this._skillManager) return true;
            let restrictors = this._skillManager.getHuleRestrictors(targetSeat, {
                game: this, shoupai: model.shoupai[targetSeat],
            });
            for (let res of restrictors) {
                let r = res.restriction;
                if (r.forbidRon && isRon) {
                    console.log('[restrictor-debug] seat=' + targetSeat + ' forbidRon by seat=' + res.seat + ' skill=' + res.skillId);
                    return false;
                }
                if (r.forbidTsumo && !isRon) {
                    console.log('[restrictor-debug] seat=' + targetSeat + ' forbidTsumo by seat=' + res.seat + ' skill=' + res.skillId);
                    return false;
                }
                if (r.minFan != null && r.minFan > 0) {
                    /* minFan > 1 时需要实际番数判定，但 allow_hule 阶段
                     * _check 只返回 boolean。若手牌已通过标准役判定（hupai=true
                     * 或常规 hule.hupai != null），至少已有 1 番。
                     * 若 minFan === 1，标准判定通过即满足。
                     * 若 minFan > 1，保守允许（番数精确校验留到 HULE_SETTLE）。 */
                    if (r.minFan > 1) {
                        console.log('[restrictor-debug] seat=' + targetSeat + ' minFan=' + r.minFan
                            + ' → 保守允许，HULE_SETTLE 做精确校验');
                    }
                }
            }
            return true;
        };

        if (l == null) {
            let seat = this._ctx.currentSeat();
            let shoupai = model.shoupai[seat];
            if (!shoupai) {
                console.log('[expander-debug] allow_hule(null): shoupai is null for seat=' + seat);
                return false;
            }
            console.log('[expander-debug] allow_hule(null) entry: seat=' + seat
                + ' hand=' + shoupai.toString()
                + ' hasSkillManager=' + !!this._skillManager
                + ' _zimo=' + shoupai._zimo);

            /* yakuExpander：先检查技能要追加的役（不论手牌已有几番） */
            this._yakuExpanderUsed = null;  /* 每轮座次检查前清除 */
            if (this._skillManager) {
                let yakuExpanders = this._skillManager.getYakuExpanders(seat, {
                    shoupai: shoupai, game: this, player: seat,
                });
                for (let exp of yakuExpanders) {
                    if (exp.yakus && exp.yakus.length > 0 && exp.yakus[0].fanshu > 0) {
                        console.log('[expander-debug] yakuExpander(zimo) found: seat=' + seat
                            + ' yaku=' + JSON.stringify(exp.yakus));
                        this._yakuExpanderUsed = { skillId: exp.skillId, seat: seat, yakus: exp.yakus };
                        break;
                    }
                }
            }

            let hupai = shoupai.lizhi
                     || this._status == 'gangzimo'
                     || model.shan.paishu == 0;
            if (_check(shoupai, null, seat, hupai)) {
                if (_checkHuleRestriction(seat, false)) return true;
            }

            /* 正常判定失败，尝试技能扩展（自摸场景） */
            if (this._skillManager) {
                let expanders = this._skillManager.getHuleExpanders(seat, {
                    shoupai: shoupai, game: this, player: seat,
                });
                console.log('[expander-debug] zimo expanders count=' + expanders.length
                    + ' seat=' + seat + ' hand=' + shoupai.toString());
                for (let exp of expanders) {
                    let origZimo = shoupai._zimo;
                    let origZimoClean = origZimo && origZimo.length >= 2
                                        ? origZimo.slice(0, 2).replace('0','5') : null;
                    console.log('[expander-debug] expander skillId=' + exp.skillId
                        + ' candidates=' + JSON.stringify(exp.candidates)
                        + ' origZimoClean=' + origZimoClean);

                    /* 摸到的牌不在候选牌中，技能不适用 */
                    if (!origZimoClean || !exp.candidates.includes(origZimoClean)) {
                        console.log('[expander-debug] → skip (zimo not in candidates)');
                        continue;
                    }

                    /* 摸到的牌是候选牌（字牌）：
                     * 取13张手牌（去掉摸牌），用听牌反推实际在等什么牌，
                     * 然后把摸到的字牌替换成等的那张牌，检查能否和牌 */
                    console.log('[expander-debug] → check (zimo is candidate)');
                    let hand13 = shoupai.clone();
                    if (origZimo && origZimo.length <= 2) {
                        try { hand13.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                    }
                    hand13._zimo = null;  /* 关键：decrease不清_zimo，但tingpai检查_zimo */
                    let ting = Majiang.Util.tingpai(hand13);
                    console.log('[expander-debug] hand13=' + hand13.toString() + ' ting=' + JSON.stringify(ting));
                    if (!ting || ting.length === 0) continue;

                    for (let t of ting) {
                        let testShoupai = shoupai.clone();
                        if (origZimo && origZimo.length <= 2) {
                            try { testShoupai.decrease(origZimo[0], +origZimo[1]); } catch(e) {}
                        }
                        testShoupai._zimo = null;
                        try { testShoupai.zimo(t); } catch(e) { continue; }
                        if (Majiang.Util.xiangting(testShoupai) != -1) continue;
                        /* 检查整个和牌牌型（手牌 + 副露）每种牌不超过4张（0和5视为同牌） */
                        let tileCount = {};
                        for (let s of ['m','p','s','z']) {
                            let bp = testShoupai._bingpai[s];
                            let maxN = s === 'z' ? 7 : 9;
                            for (let n = 1; n <= maxN; n++) {
                                if (bp[n] > 0) {
                                    let key = s + (n === 5 ? 5 : n);
                                    tileCount[key] = (tileCount[key] || 0) + bp[n];
                                }
                            }
                            /* 红5单独算到5上 */
                            if (s !== 'z' && bp[0] > 0) {
                                tileCount[s + '5'] = (tileCount[s + '5'] || 0) + bp[0];
                            }
                        }
                        /* 副露中的牌 */
                        for (let m of testShoupai._fulou) {
                            let s = m[0];
                            let digits = m.match(/\d/g);
                            for (let d of digits) {
                                let n = +d;
                                let key = s + (n === 0 ? 5 : n);
                                tileCount[key] = (tileCount[key] || 0) + 1;
                            }
                        }
                        let over4 = Object.values(tileCount).some(c => c > 4);
                        if (over4) {
                            console.log('[expander-debug] t=' + t + ' over 4 limit tileCount=' + JSON.stringify(tileCount));
                            continue;
                        }
                        /* 去掉 hupai2=true 强跳，走完整役判定 */
                        if (_check(testShoupai, null, seat, hupai)) {
                            console.log('[expander-debug] ✅ success with t=' + t);
                            this._huleExpanderUsed = { skillId: exp.skillId, seat: seat };
                            if (_checkHuleRestriction(seat, false)) return true;
                        }
                        /* yakuExpander 兜底：手牌已完且存在虚拟役，视为能和 */
                        else if (this._yakuExpanderUsed && this._yakuExpanderUsed.yakus
                            && this._yakuExpanderUsed.seat === seat) {
                            console.log('[expander-debug] ✅ yakuExpander fallback with t=' + t);
                            this._huleExpanderUsed = { skillId: exp.skillId, seat: seat };
                            if (_checkHuleRestriction(seat, false)) return true;
                        }
                        console.log('[expander-debug] t=' + t + ' failed yaku check (hupai=' + hupai + ')');
                    }
                }
                console.log('[expander-debug] zimo expander: no path succeeded');
            }

            /* yakuExpander兜底：若早期已查得虚拟役且正常判定失败，视为起和（必须手牌完成） */
            if (this._yakuExpanderUsed && this._yakuExpanderUsed.yakus
                && this._yakuExpanderUsed.seat === seat) {
                if (Majiang.Util.xiangting(model.shoupai[seat]) === -1
                    && _checkHuleRestriction(seat, false)) return true;
            }

            return false;
        }
        else {
            let p = (this._status == 'gang'
                        ? this._gang[0] + this._gang.slice(-1)
                        : this._dapai
                    ) + '_+=-'[(4 + this._ctx.currentSeat() - l) % 4];

            /* yakuExpander：先检查技能要追加的役（不论手牌已有几番） */
            this._yakuExpanderUsed = null;  /* 每轮座次检查前清除，防止前一座位残留 */
            if (this._skillManager) {
                let yakuExpanders = this._skillManager.getYakuExpanders(l, {
                    shoupai: model.shoupai[l], game: this, player: l, rongpai: p,
                });
                for (let exp of yakuExpanders) {
                    if (exp.yakus && exp.yakus.length > 0 && exp.yakus[0].fanshu > 0) {
                        console.log('[expander-debug] yakuExpander(rong) found: seat=' + l
                            + ' yaku=' + JSON.stringify(exp.yakus));
                        this._yakuExpanderUsed = { skillId: exp.skillId, seat: l, yakus: exp.yakus };
                        break;
                    }
                }
            }

            let hupai = model.shoupai[l].lizhi
                     || this._status == 'gang'
                     || model.shan.paishu == 0;
            if (_check(model.shoupai[l], p, l, hupai)) {
                if (_checkHuleRestriction(l, true)) return true;
            }

            /* 正常判定失败，尝试技能扩展（荣和场景） */
            if (this._skillManager) {
                let expanders = this._skillManager.getHuleExpanders(l, {
                    shoupai: model.shoupai[l], game: this, player: l, rongpai: p,
                });
                console.log(`[expander-debug] rong: seat=${l} p=${p} cleanP=${p.slice(0,2)} expanders=${expanders.length} expanderCandidates=${expanders.map(e => e.candidates.join(',')).join('|')}`);
                let cleanP = p.slice(0, 2);
                let rongDir = p.slice(-1);  /* 方向后缀 +/=/-，_check 需要传给 hule */
                for (let exp of expanders) {
                    let candidatesStr = exp.candidates.join(',');
                    console.log(`[expander-debug] rong: checking expander candidateSet=[${candidatesStr}] includes=${exp.candidates.includes(cleanP)}`);
                    /* 弃牌不是候选牌，此扩展器不适用 */
                    if (!exp.candidates.includes(cleanP)) continue;

                    /* 取当前13张手牌的听牌列表，逐一替换尝试 */
                    let hand13 = model.shoupai[l];
                    let ting = Majiang.Util.tingpai(hand13);
                    console.log(`[expander-debug] rong: hand13=${hand13} ting=[${ting ? ting.join(',') : 'null'}]`);
                    if (!ting || ting.length === 0) continue;

                    for (let t of ting) {
                        console.log(`[expander-debug] rong: trying ting tile=${t}`);
                        let testShoupai = hand13.clone();
                        try { testShoupai.zimo(t); } catch(e) { console.log(`[expander-debug] rong: zimo(${t}) threw: ${e}`); continue; }
                        let xt = Majiang.Util.xiangting(testShoupai);
                        if (xt != -1) { console.log(`[expander-debug] rong: tile=${t} xiangting=${xt} (not -1), skip`); continue; }
                        /* 4张合法性检查 */
                        let tileCount = {};
                        for (let s of ['m','p','s','z']) {
                            let bp = testShoupai._bingpai[s];
                            let maxN = s === 'z' ? 7 : 9;
                            for (let n = 1; n <= maxN; n++) {
                                if (bp[n] > 0) {
                                    tileCount[s + n] = (tileCount[s + n] || 0) + bp[n];
                                }
                            }
                            if (s !== 'z' && bp[0] > 0) {
                                tileCount[s + '5'] = (tileCount[s + '5'] || 0) + bp[0];
                            }
                        }
                        for (let m of testShoupai._fulou) {
                            let s = m[0];
                            let digits = m.match(/\d/g);
                            for (let d of digits) {
                                let n = +d === 0 ? 5 : +d;
                                tileCount[s + n] = (tileCount[s + n] || 0) + 1;
                            }
                        }
                        let over4 = Object.values(tileCount).some(c => c > 4);
                        if (over4) { console.log(`[expander-debug] rong: tile=${t} over4=true, skip`); continue; }

                        let checkResult = _check(hand13, t + rongDir, l, hupai);
                        console.log(`[expander-debug] rong: tile=${t}${rongDir} hupai=${hupai} _check=${checkResult}`);
                        if (checkResult) {
                            this._huleExpanderUsed = { skillId: exp.skillId, seat: l };
                            if (_checkHuleRestriction(l, true)) return true;
                        }
                        /* yakuExpander 兜底：手牌已完且存在虚拟役，视为能和 */
                        else if (this._yakuExpanderUsed && this._yakuExpanderUsed.yakus
                            && this._yakuExpanderUsed.seat === l) {
                            console.log(`[expander-debug] rong: ✅ yakuExpander fallback with tile=${t}${rongDir}`);
                            this._huleExpanderUsed = { skillId: exp.skillId, seat: l };
                            if (_checkHuleRestriction(l, true)) return true;
                        }
                    }
                }
                console.log('[expander-debug] rong: no path succeeded');
            }

            /* yakuExpander兜底：若早期已查得虚拟役且正常判定失败，视为起和（必须手牌完成） */
            if (this._yakuExpanderUsed && this._yakuExpanderUsed.yakus
                && this._yakuExpanderUsed.seat === l) {
                let testShoupai = model.shoupai[l].clone();
                if (p) {
                    testShoupai._zimo = null;
                    try { testShoupai.zimo(p); } catch(e) {}
                }
                if (Majiang.Util.xiangting(testShoupai) === -1
                    && _checkHuleRestriction(l, true)) return true;
            }

            return false;
        }
    }

    allow_pingju() {
        let model = this._model;
        return Game.allow_pingju(this._rule, model.shoupai[this._ctx.currentSeat()],
                                 this._diyizimo);
    }

    static get_dapai(rule, shoupai) {

        if (rule['喰い替え許可レベル'] == 0) return shoupai.get_dapai(true);
        if (rule['喰い替え許可レベル'] == 1
            && shoupai._zimo && shoupai._zimo.length > 2)
        {
            let deny = shoupai._zimo[0]
                     + (+shoupai._zimo.match(/\d(?=[\+\=\-])/)||5);
            return shoupai.get_dapai(false)
                                .filter(p => p.replace(/0/,'5') != deny);
        }
        return shoupai.get_dapai(false);
    }

    static get_chi_mianzi(rule, shoupai, p, paishu) {

        let mianzi = shoupai.get_chi_mianzi(p, rule['喰い替え許可レベル'] == 0);
        if (! mianzi) return mianzi;
        if (rule['喰い替え許可レベル'] == 1
            && shoupai._fulou.length == 3
            && shoupai._bingpai[p[0]][p[1]] == 2) mianzi = [];
        return paishu == 0 ? [] : mianzi;
    }

    static get_peng_mianzi(rule, shoupai, p, paishu) {

        let mianzi = shoupai.get_peng_mianzi(p);
        if (! mianzi) return mianzi;
        return paishu == 0 ? [] : mianzi;
    }

    static get_gang_mianzi(rule, shoupai, p, paishu, n_gang) {

        let mianzi = shoupai.get_gang_mianzi(p);
        if (! mianzi || mianzi.length == 0) return mianzi;

        if (shoupai.lizhi) {
            if (rule['リーチ後暗槓許可レベル'] == 0) return [];
            else if (rule['リーチ後暗槓許可レベル'] == 1) {
                let new_shoupai, n_hule1 = 0, n_hule2 = 0;
                new_shoupai = shoupai.clone().dapai(shoupai._zimo);
                for (let p of Majiang.Util.tingpai(new_shoupai)) {
                    n_hule1 += Majiang.Util.hule_mianzi(new_shoupai, p).length;
                }
                new_shoupai = shoupai.clone().gang(mianzi[0]);
                for (let p of Majiang.Util.tingpai(new_shoupai)) {
                    n_hule2 += Majiang.Util.hule_mianzi(new_shoupai, p).length;
                }
                if (n_hule1 > n_hule2) return [];
            }
            else {
                let new_shoupai;
                new_shoupai = shoupai.clone().dapai(shoupai._zimo);
                let n_tingpai1 = Majiang.Util.tingpai(new_shoupai).length;
                new_shoupai = shoupai.clone().gang(mianzi[0]);
                if (Majiang.Util.xiangting(new_shoupai) > 0) return [];
                let n_tingpai2 = Majiang.Util.tingpai(new_shoupai).length;
                if (n_tingpai1 > n_tingpai2) return [];
            }
        }
        return paishu == 0 || n_gang == 4 ? [] : mianzi;
    }

    static allow_lizhi(rule, shoupai, p, paishu, defen) {

        if (! shoupai._zimo)   return false;
        if (shoupai.lizhi)     return false;
        if (! shoupai.menqian) return false;

        if (! rule['ツモ番なしリーチあり'] && paishu < 4) return false;
        if (rule['トビ終了あり'] && defen < 1000)         return false;

        if (Majiang.Util.xiangting(shoupai) > 0) return false;

        if (p) {
            let new_shoupai = shoupai.clone().dapai(p);
            return Majiang.Util.xiangting(new_shoupai) == 0
                    && Majiang.Util.tingpai(new_shoupai).length > 0;
        }
        else {
            let dapai = [];
            for (let p of Game.get_dapai(rule, shoupai)) {
                let new_shoupai = shoupai.clone().dapai(p);
                if (Majiang.Util.xiangting(new_shoupai) == 0
                    && Majiang.Util.tingpai(new_shoupai).length > 0)
                {
                    dapai.push(p);
                }
            }
            return dapai.length ? dapai : false;
        }
    }

    static allow_hule(rule, shoupai, p, zhuangfeng, menfeng, hupai, neng_rong) {

        let shoupaiStr = shoupai.toString();
        let dbg = Game._debugHule;

        if (p && ! neng_rong) {
            dbg && console.log('[debug] Game.allow_hule: FAIL (neng_rong=false) hand=' + shoupaiStr + ' p=' + p);
            return false;
        }

        /* 舍弃隐藏牌和非法牌（如 _-）时不能和牌 */
        if (p && !Majiang.Shoupai.valid_pai(p)) {
            dbg && console.log('[debug] Game.allow_hule: FAIL (invalid pai) hand=' + shoupaiStr + ' p=' + p);
            return false;
        }

        let new_shoupai = shoupai.clone();
        if (p) {
            new_shoupai._zimo = null;
            new_shoupai.zimo(p);
        }
        let xt = Majiang.Util.xiangting(new_shoupai);
        if (xt != -1) {
            dbg && console.log('[debug] Game.allow_hule: FAIL (xiangting=' + xt + ') hand=' + shoupaiStr + ' p=' + p + ' hupai=' + hupai);
            return false;
        }

        /* 合法性检查：整个手牌（含副露）每种牌不超过4张，红5与普通5合并计数 */
        let tileCount = {};
        for (let s of ['m','p','s','z']) {
            let bp = new_shoupai._bingpai[s];
            let maxN = s === 'z' ? 7 : 9;
            for (let n = 1; n <= maxN; n++) {
                if (bp[n] > 0) {
                    tileCount[s + n] = (tileCount[s + n] || 0) + bp[n];
                }
            }
            if (s !== 'z' && bp[0] > 0) {
                tileCount[s + '5'] = (tileCount[s + '5'] || 0) + bp[0];
            }
        }
        for (let m of new_shoupai._fulou) {
            let s = m[0];
            let digits = m.match(/\d/g);
            for (let d of digits) {
                let n = +d === 0 ? 5 : +d;
                tileCount[s + n] = (tileCount[s + n] || 0) + 1;
            }
        }
        for (let key of Object.keys(tileCount)) {
            if (tileCount[key] > 4) {
                dbg && console.log('[debug] Game.allow_hule: FAIL (tileCount>4) ' + key + '=' + tileCount[key] + ' hand=' + shoupaiStr + ' p=' + p);
                return false;
            }
        }

        if (hupai) {
            dbg && console.log('[debug] Game.allow_hule: OK (hupai=true) hand=' + shoupaiStr + ' p=' + p);
            return true;
        }

        let param = {
            rule:       rule,
            zhuangfeng: zhuangfeng,
            menfeng:    menfeng,
            hupai:      {},
            baopai:     [],
            jicun:      { changbang: 0, lizhibang: 0 }
        };
        let hule = Majiang.Util.hule(shoupai, p, param);

        dbg && console.log('[debug] Game.allow_hule: hule check hand=' + shoupaiStr + ' p=' + p + ' hule.hupai=' + JSON.stringify(hule.hupai));
        return hule.hupai != null;
    }

    static allow_pingju(rule, shoupai, diyizimo) {

        if (! (diyizimo && shoupai._zimo)) return false;
        if (! rule['途中流局あり']) return false;

        let n_yaojiu = 0;
        for (let s of ['m','p','s','z']) {
            let bingpai = shoupai._bingpai[s];
            let nn = (s == 'z') ? [1,2,3,4,5,6,7] : [1,9];
            for (let n of nn) {
                if (bingpai[n] > 0) n_yaojiu++;
            }
        }
        return n_yaojiu >= 9;
    }

    static allow_no_daopai(rule, shoupai, paishu) {

        if (paishu > 0 || shoupai._zimo) return false;
        if (! rule['ノーテン宣言あり']) return false;
        if (shoupai.lizhi) return false;

        return Majiang.Util.xiangting(shoupai) == 0
                && Majiang.Util.tingpai(shoupai).length > 0;
    }
}
