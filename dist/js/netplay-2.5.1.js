/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/js/conf/rule.json"
/*!*******************************!*\
  !*** ./src/js/conf/rule.json ***!
  \*******************************/
(module) {

module.exports = /*#__PURE__*/JSON.parse('{"超能力麻将":{"配給原点":30000,"順位点":["+20.0","+10.0","-10.0","-20.0"],"赤牌":{"m":1,"p":1,"s":1},"連風牌は2符":false,"クイタンあり":true,"喰い替え許可レベル":0,"場数":2,"途中流局あり":false,"流し満貫あり":false,"ノーテン宣言あり":true,"ノーテン罰あり":true,"最大同時和了数":1,"連荘方式":1,"トビ終了あり":false,"オーラス止めあり":false,"延長戦方式":0,"一発あり":true,"裏ドラあり":true,"カンドラあり":true,"カン裏あり":true,"カンドラ後乗せ":false,"ツモ番なしリーチあり":true,"リーチ後暗槓許可レベル":1,"ダブル役満あり":false,"役満の複合あり":true,"数え役満あり":false,"役満パオあり":true,"切り上げ満貫あり":true,"音声キャラ":"yiji","BGM":"竹取之语.mp3"},"Mリーグルール":{"配給原点":25000,"順位点":["+30.0","+10.0","-10.0","-30.0"],"赤牌":{"m":1,"p":1,"s":1},"連風牌は2符":true,"クイタンあり":true,"喰い替え許可レベル":0,"場数":2,"途中流局あり":false,"流し満貫あり":false,"ノーテン宣言あり":true,"ノーテン罰あり":true,"最大同時和了数":1,"連荘方式":2,"トビ終了あり":false,"オーラス止めあり":false,"延長戦方式":0,"一発あり":true,"裏ドラあり":true,"カンドラあり":true,"カン裏あり":true,"カンドラ後乗せ":false,"ツモ番なしリーチあり":true,"リーチ後暗槓許可レベル":1,"ダブル役満あり":false,"役満の複合あり":true,"数え役満あり":false,"役満パオあり":true,"切り上げ満貫あり":true},"Classicルール":{"配給原点":30000,"順位点":["+12.0","+4.0","-4.0","-12.0"],"赤牌":{"m":0,"p":0,"s":0},"連風牌は2符":false,"クイタンあり":true,"喰い替え許可レベル":2,"場数":2,"途中流局あり":false,"流し満貫あり":false,"ノーテン宣言あり":false,"ノーテン罰あり":false,"最大同時和了数":1,"連荘方式":1,"トビ終了あり":false,"オーラス止めあり":false,"延長戦方式":0,"一発あり":false,"裏ドラあり":false,"カンドラあり":false,"カン裏あり":false,"カンドラ後乗せ":false,"ツモ番なしリーチあり":true,"リーチ後暗槓許可レベル":0,"ダブル役満あり":false,"役満の複合あり":false,"数え役満あり":false,"役満パオあり":false,"切り上げ満貫あり":false}}');

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!***************************!*\
  !*** ./src/js/netplay.js ***!
  \***************************/
/*!
 *  電脳麻将: ネット対戦 v2.5.1
 *  + 超能力技能系统支持
 *
 *  Copyright(C) 2017 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/Majiang/blob/master/LICENSE
 */


const { hide, show, fadeIn, scale,
        setSelector, clearSelector  } = Majiang.UI.Util;

const preset = __webpack_require__(/*! ./conf/rule.json */ "./src/js/conf/rule.json");

const base = location.pathname.replace(/\/[^\/]*?$/,'');

let loaded;

$(function(){

    const pai   = Majiang.UI.pai($('#loaddata'));
    const audio = Majiang.UI.audio($('#loaddata'));

    /* BGM 播放器 */
    const bgmPlayer = new Majiang.UI.BgmPlayer();

    /* 语音角色列表 */
    const VOICE_CHAR_LIST = ['gongyongxiao', 'yiji', 'tianjiangyi', 'yuancunhe', 'gongyongzhao'];

    const analyzer = (kaiju)=>{
        $('body').addClass('analyzer');
        return new Majiang.UI.Analyzer($('#board > .analyzer'), kaiju, pai,
                                        ()=>$('body').removeClass('analyzer'));
    };
    const viewer = (paipu)=>{
        $('#board .controller').addClass('paipu')
        $('body').attr('class','board');
        scale($('#board'), $('#space'));
        return new Majiang.UI.Paipu(
                        $('#board'), paipu, pai, audio, 'Majiang.pref',
                        ()=>show($('#file')) && fadeIn($('body').attr('class','file')),
                        analyzer);
    };
    const stat = (paipu_list)=>{
        fadeIn($('body').attr('class','stat'));
        return new Majiang.UI.PaipuStat($('#stat'), paipu_list,
                        ()=>show($('#file')) && fadeIn($('body').attr('class','file')));
    };
    const file = new Majiang.UI.PaipuFile($('#file'), 'Majiang.netplay',
                                            viewer, stat);
    let sock, myuid;
    /* 对局中的引用 */
    let boardView, player, bgmTrack,
        /** 当前客户端玩家在模型中的 gameSeat（qipai 后的席位，0=东/1=南/2=西/3=北）。
         *  用于旋转服务端发来的角色数组（按 seat 索引），使自己的角色始终显示在屏幕下方。
         *  计算公式: (plIdx - qijia - jushu + 8) % 4 */
        myGameSeat = 0;
    /** 技能提示 UI 组件引用（联机模式复用单人版 SkillPrompt） */
    let skillPromptUI = null;
    /** 语音角色缓存，重连时保留已选择的语音 */
    let voiceChars = [null, null, null, null];
    /** 断线重连相关 */
    let _$disconnectOverlay = null;

    function _showDisconnectOverlay() {
        if (_$disconnectOverlay) return;
        let overlay = $('<div>').addClass('disconnect-overlay');
        let box = $('<div>').addClass('disconnect-box');
        let icon = $('<div>').addClass('disconnect-icon').text('⚠');
        let msg = $('<div>').addClass('disconnect-msg')
            .text('连接中断');
        let btn = $('<button>').addClass('disconnect-retry-btn')
            .text('手动重连').on('click', () => {
                console.log('[重连] 手动重连...');
                sock.connect();
            });
        box.append(icon, msg, btn);
        overlay.append(box);
        $('body').append(overlay);
        _$disconnectOverlay = overlay;
    }

    function _hideDisconnectOverlay() {
        if (_$disconnectOverlay) {
            _$disconnectOverlay.remove();
            _$disconnectOverlay = null;
        }
    }

    function _isReconnecting() {
        return !!_$disconnectOverlay;
    }

    function init() {

        /* 先隐藏加载动画并显示默认界面（未登录状态），避免 Socket.IO 故障时卡死 */
        hide($('#title .loading'));
        $('body').attr('class','title');
        show($('#title .login'));

        try {
            sock = io('/', {
                path: `${base}/server/socket.io/`,
                transports: ['websocket', 'polling'],
                reconnection: false            /* 禁用自动重连，改为手动 */
            });
        } catch(e) {
            console.error('Socket.IO 初始化失败，请检查服务器是否在线', e);
            return;
        }

        sock.on('HELLO', hello);
        sock.on('ROOM', room);
        sock.on('START', start);
        sock.on('END', end);
        sock.on('ERROR', file.error);

        /* 断线处理：不切换页面，弹出遮罩，手动重连 */
        sock.on('disconnect', (reason) => {
            console.log(`[断线] 连接中断: ${reason}`);
            _showDisconnectOverlay();
        });
        /* 重连成功：关闭遮罩 */
        sock.on('connect', () => {
            console.log('[重连] 连接成功');
            _hideDisconnectOverlay();
        });
    }

    function hello(user) {
        if (! user) return;  // 未登录，注册表单已显示
        myuid = user.uid;
        /* 重连期间不切换页面，避免 body class 变更导致跳转大厅 */
        if (_isReconnecting()) return;
        /* 重连时如果已在対局中（body class=board），不要切回 file 界面，
         * 避免破坏対局 UI。服务端会随后发送 START 重新初始化 Board。 */
        if ($('body').attr('class') !== 'board') {
            show($('#file'));
            fadeIn($('body').attr('class','file'));
            show($('#file .netplay form'));
        }
        if (user.icon)
            $('#file .netplay img').attr('src', user.icon)
                                   .attr('title', user.uid);
        $('#file .netplay .name').text(user.name);
        file.redraw();
    }

    let row, src;

    function room(msg) {
        if (! row) {
            row = $('#room .user').eq(0);
            src = $('img', row).attr('src');
        }
        $('body').attr('class','room');
        $('#room input[name="room_no"]').val(msg.room_no);
        $('#room .room').empty();
        for (let user of msg.user) {
            let r = row.clone();
            if (user.icon) $('img', r).attr('src', user.icon)
                                      .attr('title', user.uid);
            else           $('img', r).attr('src', src);
            $('.name', r).text(user.name);
            if (msg.user[0].uid == myuid || user.uid == myuid )
                show($('input[name="quit"]', r).on('click', ()=> {
                        sock.emit('ROOM', msg.room_no, user.uid);
                        return false;
                    }));
            if (user.offline) r.addClass('offline');
            else              r.removeClass('offline');
            $('#room .room').append(r);
        }
        if (msg.user[0].uid == myuid) {
            show($('#room select[name="rule"]'));
            show($('#room input[name="timer"]'));
            show($('#room input[type="submit"]'));
            show($('#room input[name="bot"]'));
        }
        else {
            hide($('#room select[name="rule"]'));
            hide($('#room input[name="timer"]'));
            hide($('#room input[type="submit"]'));
            hide($('#room input[name="bot"]'));
        }
    }

    function start() {

        /* 重连时清理旧对象，避免句柄泄漏和设置丢失 */
        if (player) {
            player.clear_handler();
            player.clear_timer();
        }
        if (boardView) {
            $(window).off('resize');           // Board 构造函数中绑定的 resize
            $('#board .info-btn').off('click'); // Board 构造函数中绑定的 info-btn
            boardView._voice.forEach(v => v.stop && v.stop());
        }
        /* 清理上一个 GameCtl 的事件句柄（keyup、按钮 click） */
        $(window).off('keyup.controler');
        $('.sound', $('#board .controller')).off('click');
        $('.minus', $('#board .controller')).off('click');
        $('.plus',  $('#board .controller')).off('click');

        /* 保存 BGM 播放状态，重连后恢复 */
        let bgmWasPlaying = bgmPlayer._audio && !bgmPlayer._audio.paused;

        player = new Majiang.UI.Player($('#board'), pai, audio);
        boardView = new Majiang.UI.Board($('#board .board'), pai, audio,
                                                player.model, {});
        player.view = boardView;

        /* 初始化技能提示 UI（联机复用单人版 SkillPrompt） */
        skillPromptUI = new Majiang.UI.SkillPrompt($('#board'), pai);

        const gameCtl = new Majiang.UI.GameCtl($('#board'), 'Majiang.pref',
                                                null, player, player._view);
        gameCtl._view.no_player_name = false;

        /* 返回/信息按钮：移到 #board 下（脱离 .board 的 overflow:hidden） */
        let $btnBack = $('.shan-back-btn');
        let $btnInfo = $('.info-btn');
        $btnBack.off('click').on('click', (e) => {
            e.preventDefault();
            if (confirm('确定要返回主界面吗？')) {
                /* 通知服务端离开对局，然后直接跳转 URL。
                 * URL 跳转比操作 CSS/body class 可靠，彻底避免
                 * netplay 表单残留显示的问题。 */
                sock.emit('LEAVE_GAME');
                window.location.href = location.origin + base;
            }
        }).removeAttr('href')
            .css({'display':'block','position':'absolute','top':'10px','left':'10px','z-index':'1000','transform':'none','cursor':'pointer'})
            .appendTo($('#board'));
        $btnInfo.css({'display':'block','position':'absolute','top':'42px','left':'10px','z-index':'1000','transform':'none'})
            .appendTo($('#board'));

        /* 退出按钮：离开对局回到主页 */
        $('.exit', $('#board .controller')).off('click').on('click', ()=>{
            if (confirm('确定要离开对局吗？')) {
                sock.emit('LEAVE_GAME');
                window.location.href = location.origin + base;
            }
        });

        let players = [];

        $('#board .controller').removeClass('paipu')
        $('body').attr('class','board');
        hide($('#file'));
        scale($('#board'), $('#space'));
        let seq = 0;
        sock.removeAllListeners('GAME');
        sock.on('GAME', (msg)=>{

            /* ---- 玩家信息同步 ---- */
            if (msg.players) {
                players = msg.players;
            }

            /* ---- 服务器语音播放指令 ---- */
            else if (msg.say) {
                player._view.say(msg.say.name, msg.say.l);
            }

            /* ---- 角色选择 ---- */
            else if (msg.character_select) {
                /* playerIdx 是选择时的席位（qipai 前 = plIdx），需转为 qipai 后的 gameSeat */
                let plIdx = msg.character_select.playerIdx;
                let qijia = msg.character_select.qijia || 0;
                let jushu = msg.character_select.jushu || 0;
                myGameSeat = (plIdx - qijia - jushu + 8) % 4;
                _showCharacterSelect(msg.character_select);
            }

            /* ---- 角色确认结果 ---- */
            else if (msg.character_confirmed) {
                _onCharacterConfirmed(msg.character_confirmed);
            }

            /* ---- 技能交互提示 ---- */
            else if (msg.skill_prompt) {
                _showSkillPrompt(msg.skill_prompt);
            }

            /* ---- 技能阶段间手牌同步（服务器已定向发送，直接处理） ---- */
            else if (msg.hand_sync) {
                let hs = msg.hand_sync;
                console.log(`[netplay] hand_sync RECEIVED seat=${hs.seat} bingpai=`, hs.bingpai, `zimo=${hs.zimo} myGameSeat=${myGameSeat}`);
                let model_shoupai = player._model.shoupai[hs.seat];
                console.log(`[netplay] hand_sync model_shoupai found=${!!model_shoupai}`);
                if (model_shoupai && hs.bingpai) {
                    let bp = hs.bingpai;
                    /* 直接拷贝 _bingpai 数组，支持超过 14 张的中间状态手牌 */
                    for (let s of ['m','p','s','z']) {
                        let arr = bp[s];
                        if (arr) {
                            for (let n = 0; n < arr.length; n++) {
                                model_shoupai._bingpai[s][n] = arr[n];
                            }
                        }
                    }
                    model_shoupai._bingpai._ = bp._;
                    model_shoupai._zimo = hs.zimo || null;
                    console.log(`[netplay] hand_sync model updated, now: ${model_shoupai.toString()}`);
                    if (player._view && player._view._view) {
                        let handUI = player._view._view.shoupai[hs.seat];
                        console.log(`[netplay] hand_sync handUI found=${!!handUI}`);
                        if (handUI) {
                            handUI.redraw(true);
                            handUI.adjust();
                            console.log(`[netplay] hand_sync redraw done, DOM pai count=${$('.shoupai.main .bingpai > .pai').length}`);
                        }
                    }
                }
            }

            /* ---- 存储牌山快照 + 累积动作日志 ---- */
            if (boardView) {
                if (msg.wall_snapshot) {
                    boardView._wallSnapshot = msg.wall_snapshot;
                }
                if (msg.action_log_entries && msg.action_log_entries.length) {
                    if (!boardView._actionLog) boardView._actionLog = [];
                    let ts = Date.now();
                    for (let entry of msg.action_log_entries) {
                        boardView._actionLog.push({
                            text: entry.text,
                            seat: entry.seat,
                            ts: ts++
                        });
                    }
                }
            }

            /* ---- 处理 kaiju 消息中的 BGM + 语音 + 角色显示（需在 player.action 之前，但不阻止后续处理） ---- */
            if (msg.kaiju) {
                _handleKaiju(msg.kaiju, voiceChars, bgmWasPlaying);
            }

            /* 新回合开始：关闭遗留的技能/角色弹窗 */
            if (msg.seq) {
                _dismissAllOverlays();
            }

            /* ---- 需要回复的游戏消息 (seq > 0) ---- */
            if (msg.seq) {
                if (seq && msg.seq != seq) location.reload();
                player.action(msg, (reply = {})=>{
                    reply.seq = msg.seq;
                    sock.emit('GAME', reply);
                    seq = msg.seq + 1;
                });
            }

            /* ---- 单向通知消息 (seq === 0 / undefined) ---- */
            else {
                player.action(msg);
                if (msg.kaiju && msg.kaiju.log) {
                    let log = msg.kaiju.log.pop();
                    for (let data of log) {
                        player.action(data);
                    }
                }
            }

            player._view.players(players);
        });
    }

    /** 关闭所有技能/角色选择弹窗 */
    function _dismissAllOverlays() {
        $('.netplay-skill-prompt-overlay').remove();
        if (skillPromptUI) skillPromptUI.clear();
        /* 角色选择弹窗由倒计时自行管理，不强制关闭 */
    }

    /* ================================================================
     *  kaiju 消息处理：BGM + 语音角色 + 角色显示
     * ================================================================ */

    function _handleKaiju(kaiju, voiceChars, wasPlaying) {
        /* 根据当前局的 qijia/jushu 更新自己的游戏席位（用于旋转角色头像等） */
        if (kaiju.id !== undefined && kaiju.qijia !== undefined) {
            myGameSeat = (kaiju.id - kaiju.qijia - (kaiju.jushu || 0) + 8) % 4;
        }

        /* BGM — 只有初次対局或之前正在播放时才启动，避免重连时覆盖暂停状态 */
        if (kaiju.bgm) {
            bgmPlayer.setTrack(kaiju.bgm);
            if (wasPlaying !== false) {
                bgmPlayer.play();
            }
        }

        /* 语音角色 */
        if (kaiju.voice_char) {
            /* 只在初次连接时为其他座位随机分配语音，重连时保留已设置的角色 */
            let isFirstTime = voiceChars[0] === null;
            voiceChars[0] = kaiju.voice_char === 'none' ? null : kaiju.voice_char;
            if (isFirstTime) {
                for (let i = 1; i < 4; i++) {
                    voiceChars[i] = VOICE_CHAR_LIST[Math.floor(Math.random() * VOICE_CHAR_LIST.length)];
                }
            }
            boardView.setVoiceChars(voiceChars);
        }

        /* 角色显示 */
        if (kaiju.character && kaiju.character.length) {
            _updateBoardCharacters(kaiju.character);
        }
    }

    /* ================================================================
     *  角色选择 UI
     * ================================================================ */

    function _showCharacterSelect(data) {
        /* data: { options: [Character, ...], playerIdx: number, timeout: number } */
        if (!data.options || !data.options.length) return;

        /* 关闭已有的选择器 */
        let existing = $('.character-selector-overlay');
        if (existing.length) existing.remove();

        let overlay = $('<div>').addClass('character-selector-overlay');
        let modal   = $('<div>').addClass('character-selector-modal');
        let title   = $('<div>').addClass('character-selector-title');
        let grid    = $('<div>').addClass('character-selector-grid');
        let confirm = $('<div>').addClass('character-selector-confirm');
        let btn     = $('<button>').addClass('character-selector-btn')
                                  .attr('aria-label', '确定')
                                  .attr('disabled', true).text('确定');

        let toggleBtn = $('<button>').addClass('character-selector-toggle')
                                    .text('▽ 隐藏').attr('title', '收起面板观察手牌');

        let selected = -1;
        let confirmed = false;
        let timerCountdown = (data.timeout || 30);
        title.text('选择角色 (' + timerCountdown + 's)');

        /* 倒计时 */
        let timerId = setInterval(function() {
            timerCountdown--;
            if (timerCountdown <= 0) {
                clearInterval(timerId);
                title.text('选择角色 (0s)');
                /* 超时自动选择 */
                if (!confirmed) {
                    if (selected < 0) selected = Math.floor(Math.random() * data.options.length);
                    confirmed = true;
                    btn.attr('disabled', true).text('已超时');
                    grid.find('.character-card').css('pointer-events', 'none');
                    overlay.fadeOut(300, function() { overlay.remove(); });
                    sock.emit('CHARACTER', selected);
                }
            } else {
                title.text('选择角色 (' + timerCountdown + 's)');
            }
        }, 1000);

        /* 隐藏/显示切换 */
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

        /* 卡片渲染 — 与单人模式 CharacterSelector._createCard 完全一致 */
        for (let i = 0; i < data.options.length; i++) {
            let char = data.options[i];
            let card = $('<div>').addClass('character-card').data('index', i);
            let avatar = $('<img>').addClass('avatar')
                                   .attr('src', 'resources/头像/' + (char.card || ''))
                                   .attr('alt', char.name || '');
            let nameDiv = $('<div>').addClass('char-name').text(char.name || '');
            let skillsDiv = $('<div>').addClass('char-skills');
            for (let s of (char.skills || [])) {
                let text = typeof s === 'string' ? s : (s.description || '');
                skillsDiv.append($('<div>').addClass('skill-line').text(text));
            }
            card.append(avatar, nameDiv, skillsDiv);
            card.on('click', function() {
                if (confirmed) return;
                let idx = $(this).data('index');
                selected = idx;
                grid.find('.character-card').removeClass('selected');
                $(this).addClass('selected');
                btn.attr('disabled', false);
            });
            grid.append(card);
        }

        /* 卡片较少时 */
        if (data.options.length < 4) {
            grid.addClass('few-cards');
        }
        if (data.options.length > 4) {
            grid.addClass('many-cards');
        }

        confirm.append(btn);
        modal.append(title, grid, confirm);
        overlay.append(toggleBtn, modal);
        $('body').append(overlay);

        /* 确定按钮 */
        btn.on('click', function() {
            if (confirmed || selected < 0) return;
            confirmed = true;
            clearInterval(timerId);
            grid.find('.character-card').css('pointer-events', 'none');
            btn.attr('disabled', true).text('已确认');
            setTimeout(function() {
                overlay.fadeOut(200, function() { overlay.remove(); });
            }, 300);
            sock.emit('CHARACTER', selected);
        });
    }

    function _onCharacterConfirmed(data) {
        /* data: { characters: [{id, name, card, skills}, ...] } */
        if (data.characters && boardView) {
            _updateBoardCharacters(data.characters);
        }
    }

    function _updateBoardCharacters(character) {
        if (!boardView || !boardView._model) return;
        /* 根据玩家座位旋转角色数组，使自己在下方（位置0） */
        let rotated = _rotateCharacterArray(character, myGameSeat);
        boardView._model._character = rotated;
        boardView._model.character = rotated;
        /* 标记已预旋转，board._renderCharacterDisplay 不再二次旋转 */
        boardView._model._netplayRotated = true;
    }

    /**
     * 旋转角色数组：将指定 gameSeat 位置的元素旋转到数组索引 0。
     * 
     * 服务端发来的 character 数组按 gameSeat 索引（[0]=东家角色, [1]=南家角色...），
     * 但客户端 UI 期望 [0]=自己（屏幕下方）。此函数通过偏移旋转实现：
     *   rotated[i] = chars[(i + offset) % 4]
     * 当 offset = 当前玩家的 gameSeat 时，rotated[0] = chars[自己]。
     *
     * @param {Object[]} chars - 按 gameSeat 索引的角色数组
     * @param {number} offset - 偏移量（当前玩家的 gameSeat，即 myGameSeat）
     * @returns {Object[]} 旋转后的数组，[0]=当前玩家角色
     */
    function _rotateCharacterArray(chars, offset) {
        if (!chars || !offset || offset === 0) return chars;
        let rotated = [];
        for (let i = 0; i < chars.length; i++) {
            rotated[i] = chars[(i + offset) % chars.length];
        }
        return rotated;
    }

    /* ================================================================
     *  技能交互提示 — 统一框架：委托给 SkillPrompt UI
     *  服务端通过 MultiplayerSkillPrompt 发送统一协议，
     *  客户端直接调用 SkillPrompt 方法，无需自定义 HTML。
     * ================================================================ */

    function _showSkillPrompt(data) {
        /* data: { promptId, promptType, description, choices, validTiles, title, tiles, timeout } */

        console.log(`[netplay] _showSkillPrompt promptId=${data.promptId} type=${data.promptType} choices=`, data.choices);

        if (!skillPromptUI) {
            console.log('[netplay] _showSkillPrompt: skillPromptUI is null!');
            return;
        }

        let promptType = data.promptType;
        let emitReply = (reply) => {
            reply = reply || {};
            reply.promptId = data.promptId;
            sock.emit('SKILL_REPLY_' + data.promptId, reply);
        };

        switch (promptType) {

            case 'confirm':
                skillPromptUI.askConfirm('', data.description || '', (response) => {
                    emitReply({ choice: response === 'yes' ? 0 : 1 });
                }, data.timeout || 0);
                break;

            case 'options':
                skillPromptUI.askOptions(data.description || '', data.choices || [], (value) => {
                    emitReply({ choice: value });
                }, null, data.timeout || 0);
                break;

            case 'river_tile':
                skillPromptUI.askRiverTile(data.description || '', (paiStr, seat, index) => {
                    if (paiStr) {
                        emitReply({ choice: 0, paiStr: paiStr, seat: seat, index: index });
                    } else {
                        emitReply({ choice: -1, paiStr: null });
                    }
                }, data.timeout || 0);
                break;

            case 'hand_tile':
                skillPromptUI.askHandTile(data.description || '', (paiStr) => {
                    emitReply({ paiStr: paiStr || null });
                }, data.validTiles || null, data.timeout || 0);
                break;

            case 'hand_tiles':
                skillPromptUI.pickHandTiles(
                    data.count || 1,
                    data.description || '',
                    true,
                    null,
                    data.timeout || 15000,
                    (tiles) => {
                        emitReply({ tiles: tiles || null });
                    },
                    data.validTiles || null,
                    data.opts || null
                );
                break;

            case 'hand_tiles_range':
                skillPromptUI.pickHandTilesRange(
                    data.minCount || 0,
                    data.maxCount || 1,
                    data.description || '',
                    true,
                    null,
                    data.timeout || 15000,
                    (tiles) => {
                        emitReply({ tiles: tiles || null });
                    },
                    data.validTiles || null
                );
                break;

            case 'tile_popup':
                skillPromptUI.showTilePopup(data.title || '', data.tiles || [], () => {
                    emitReply({});
                });
                break;

            case 'clear':
                skillPromptUI.clear();
                break;

            default:
                /* 向后兼容旧版自定义类型 */
                _showLegacySkillPrompt(data);
                break;
        }
    }

    /**
     * 向后兼容：旧版自定义 prompt 类型（过渡期保留）
     */
    function _showLegacySkillPrompt(data) {
        if (!skillPromptUI) return;

        let emitReply = (reply) => {
            reply = reply || {};
            reply.promptId = data.promptId;
            reply.skillId = data.skillId;
            sock.emit('SKILL_REPLY_' + data.promptId, reply);
        };

        /* 临时覆层：关闭旧弹窗 */
        skillPromptUI.clear();

        /* 兜底：作为 options 处理 */
        if (data.choices && data.choices.length) {
            let options = data.choices.map((c, i) => {
                if (typeof c === 'string') return { label: c, value: String(i) };
                return { label: c.label || String(c), value: String(c.value !== undefined ? c.value : i) };
            });
            skillPromptUI.askOptions(data.description || '', options, (value) => {
                if (data.promptType === 'river_tile' && value === '-1') {
                    emitReply({ choice: -1, paiStr: null });
                } else {
                    emitReply({ choice: value });
                }
            });
        }
    }

    /* ================================================================
     *  结束
     * ================================================================ */

    function end(paipu) {
        /* 重连期间不处理 END，避免切换到 file 界面 */
        if (_isReconnecting()) return;
        sock.removeAllListeners('GAME');
        bgmPlayer.stop();
        if (paipu) file.add(paipu, 10);
        show($('#file'));
        fadeIn($('body').attr('class','file'));
        file.redraw();
        $('#file input[name="room_no"]').val('');
    }

    /* ================================================================
     *  规则选择
     * ================================================================ */

    for (let key of Object.keys(preset)) {
        let opt = $('<option>').val(key).text(key);
        if (key === '超能力麻将') opt.attr('selected', true);
        $('select[name="rule"]').append(opt);
    }
    if (localStorage.getItem('Majiang.rule')) {
        $('select[name="rule"]').append($('<option>')
                                .val('-').text('自定义规则'));
    }

    $('#file form.room').on('submit', (ev)=>{
        let room = $('input[name="room_no"]', $(ev.target)).val();
        sock.emit('ROOM', room);
        return false;
    });
    $('#room form').on('submit', (ev)=>{
        let room = $('input[name="room_no"]', $(ev.target)).val();

        let rule = $('select[name="rule"]', $(ev.target)).val();
        rule = ! rule      ? preset['超能力麻将'] || {}
             : rule == '-' ? JSON.parse(
                                localStorage.getItem('Majiang.rule')||'{}')
             :               preset[rule];
        rule = Majiang.rule(rule);

        let timer = $('input[name="timer"]', $(ev.target)).val();
        timer = timer.match(/(\d+)/g);
        if (timer) timer = timer.map(t=>+t);

        sock.emit('START', room, rule, timer);
        return false;
    });
    $('#room input[name="bot"]').on('click', (ev)=>{
        let room = $('input[name="room_no"]', $(ev.target).closest('form')).val();
        sock.emit('BOT', room);
        return false;
    });

    $(window).on('resize', ()=>scale($('#board'), $('#space')));

    $(window).on('load', ()=>setTimeout(init, 500));
    if (loaded) $(window).trigger('load');
    /* 兜底：图片即使没加载完，最多等 3 秒强制启动，避免卡死 */
    setTimeout(()=>{ if (!sock) init(); }, 3000);

    $('#title .login form').each(function(){
        let method = $(this).attr('method')
        let url    = $(this).attr('action');
        fetch(url, { method: method, redirect: 'manual' }).then(res =>{
            if (res.status == 404) hide($(this));
        });
    });
});
$(window).on('load', ()=> loaded = true);

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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b0M7QUFDekQ7QUFDQSxTQUFTO0FBQ1QsS0FBSztBQUNMLENBQUM7QUFDRCIsInNvdXJjZXMiOlsid2VicGFjazovL21hamlhbmcvd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vbWFqaWFuZy8uL3NyYy9qcy9uZXRwbGF5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0aWYgKCEobW9kdWxlSWQgaW4gX193ZWJwYWNrX21vZHVsZXNfXykpIHtcblx0XHRkZWxldGUgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0XHR2YXIgZSA9IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIgKyBtb2R1bGVJZCArIFwiJ1wiKTtcblx0XHRlLmNvZGUgPSAnTU9EVUxFX05PVF9GT1VORCc7XG5cdFx0dGhyb3cgZTtcblx0fVxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8qIVxuICogIOmbu+iEs+m6u+Wwhjog44ON44OD44OI5a++5oimIHYyLjUuMVxuICogICsg6LaF6IO95Yqb5oqA6IO957O757uf5pSv5oyBXG4gKlxuICogIENvcHlyaWdodChDKSAyMDE3IFNhdG9zaGkgS29iYXlhc2hpXG4gKiAgUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKiAgaHR0cHM6Ly9naXRodWIuY29tL2tvYmFsYWIvTWFqaWFuZy9ibG9iL21hc3Rlci9MSUNFTlNFXG4gKi9cblwidXNlIHN0cmljdFwiO1xuXG5jb25zdCB7IGhpZGUsIHNob3csIGZhZGVJbiwgc2NhbGUsXG4gICAgICAgIHNldFNlbGVjdG9yLCBjbGVhclNlbGVjdG9yICB9ID0gTWFqaWFuZy5VSS5VdGlsO1xuXG5jb25zdCBwcmVzZXQgPSByZXF1aXJlKCcuL2NvbmYvcnVsZS5qc29uJyk7XG5cbmNvbnN0IGJhc2UgPSBsb2NhdGlvbi5wYXRobmFtZS5yZXBsYWNlKC9cXC9bXlxcL10qPyQvLCcnKTtcblxubGV0IGxvYWRlZDtcblxuJChmdW5jdGlvbigpe1xuXG4gICAgY29uc3QgcGFpICAgPSBNYWppYW5nLlVJLnBhaSgkKCcjbG9hZGRhdGEnKSk7XG4gICAgY29uc3QgYXVkaW8gPSBNYWppYW5nLlVJLmF1ZGlvKCQoJyNsb2FkZGF0YScpKTtcblxuICAgIC8qIEJHTSDmkq3mlL7lmaggKi9cbiAgICBjb25zdCBiZ21QbGF5ZXIgPSBuZXcgTWFqaWFuZy5VSS5CZ21QbGF5ZXIoKTtcblxuICAgIC8qIOivremfs+inkuiJsuWIl+ihqCAqL1xuICAgIGNvbnN0IFZPSUNFX0NIQVJfTElTVCA9IFsnZ29uZ3lvbmd4aWFvJywgJ3lpamknLCAndGlhbmppYW5neWknLCAneXVhbmN1bmhlJywgJ2dvbmd5b25nemhhbyddO1xuXG4gICAgY29uc3QgYW5hbHl6ZXIgPSAoa2FpanUpPT57XG4gICAgICAgICQoJ2JvZHknKS5hZGRDbGFzcygnYW5hbHl6ZXInKTtcbiAgICAgICAgcmV0dXJuIG5ldyBNYWppYW5nLlVJLkFuYWx5emVyKCQoJyNib2FyZCA+IC5hbmFseXplcicpLCBrYWlqdSwgcGFpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICgpPT4kKCdib2R5JykucmVtb3ZlQ2xhc3MoJ2FuYWx5emVyJykpO1xuICAgIH07XG4gICAgY29uc3Qgdmlld2VyID0gKHBhaXB1KT0+e1xuICAgICAgICAkKCcjYm9hcmQgLmNvbnRyb2xsZXInKS5hZGRDbGFzcygncGFpcHUnKVxuICAgICAgICAkKCdib2R5JykuYXR0cignY2xhc3MnLCdib2FyZCcpO1xuICAgICAgICBzY2FsZSgkKCcjYm9hcmQnKSwgJCgnI3NwYWNlJykpO1xuICAgICAgICByZXR1cm4gbmV3IE1hamlhbmcuVUkuUGFpcHUoXG4gICAgICAgICAgICAgICAgICAgICAgICAkKCcjYm9hcmQnKSwgcGFpcHUsIHBhaSwgYXVkaW8sICdNYWppYW5nLnByZWYnLFxuICAgICAgICAgICAgICAgICAgICAgICAgKCk9PnNob3coJCgnI2ZpbGUnKSkgJiYgZmFkZUluKCQoJ2JvZHknKS5hdHRyKCdjbGFzcycsJ2ZpbGUnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBhbmFseXplcik7XG4gICAgfTtcbiAgICBjb25zdCBzdGF0ID0gKHBhaXB1X2xpc3QpPT57XG4gICAgICAgIGZhZGVJbigkKCdib2R5JykuYXR0cignY2xhc3MnLCdzdGF0JykpO1xuICAgICAgICByZXR1cm4gbmV3IE1hamlhbmcuVUkuUGFpcHVTdGF0KCQoJyNzdGF0JyksIHBhaXB1X2xpc3QsXG4gICAgICAgICAgICAgICAgICAgICAgICAoKT0+c2hvdygkKCcjZmlsZScpKSAmJiBmYWRlSW4oJCgnYm9keScpLmF0dHIoJ2NsYXNzJywnZmlsZScpKSk7XG4gICAgfTtcbiAgICBjb25zdCBmaWxlID0gbmV3IE1hamlhbmcuVUkuUGFpcHVGaWxlKCQoJyNmaWxlJyksICdNYWppYW5nLm5ldHBsYXknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aWV3ZXIsIHN0YXQpO1xuICAgIGxldCBzb2NrLCBteXVpZDtcbiAgICAvKiDlr7nlsYDkuK3nmoTlvJXnlKggKi9cbiAgICBsZXQgYm9hcmRWaWV3LCBwbGF5ZXIsIGJnbVRyYWNrLFxuICAgICAgICAvKiog5b2T5YmN5a6i5oi356uv546p5a625Zyo5qih5Z6L5Lit55qEIGdhbWVTZWF077yIcWlwYWkg5ZCO55qE5bit5L2N77yMMD3kuJwvMT3ljZcvMj3opb8vMz3ljJfvvInjgIJcbiAgICAgICAgICogIOeUqOS6juaXi+i9rOacjeWKoeerr+WPkeadpeeahOinkuiJsuaVsOe7hO+8iOaMiSBzZWF0IOe0ouW8le+8ie+8jOS9v+iHquW3seeahOinkuiJsuWni+e7iOaYvuekuuWcqOWxj+W5leS4i+aWueOAglxuICAgICAgICAgKiAg6K6h566X5YWs5byPOiAocGxJZHggLSBxaWppYSAtIGp1c2h1ICsgOCkgJSA0ICovXG4gICAgICAgIG15R2FtZVNlYXQgPSAwO1xuICAgIC8qKiDmioDog73mj5DnpLogVUkg57uE5Lu25byV55So77yI6IGU5py65qih5byP5aSN55So5Y2V5Lq654mIIFNraWxsUHJvbXB077yJICovXG4gICAgbGV0IHNraWxsUHJvbXB0VUkgPSBudWxsO1xuICAgIC8qKiDor63pn7Pop5LoibLnvJPlrZjvvIzph43ov57ml7bkv53nlZnlt7LpgInmi6nnmoTor63pn7MgKi9cbiAgICBsZXQgdm9pY2VDaGFycyA9IFtudWxsLCBudWxsLCBudWxsLCBudWxsXTtcbiAgICAvKiog5pat57q/6YeN6L+e55u45YWzICovXG4gICAgbGV0IF8kZGlzY29ubmVjdE92ZXJsYXkgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gX3Nob3dEaXNjb25uZWN0T3ZlcmxheSgpIHtcbiAgICAgICAgaWYgKF8kZGlzY29ubmVjdE92ZXJsYXkpIHJldHVybjtcbiAgICAgICAgbGV0IG92ZXJsYXkgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdkaXNjb25uZWN0LW92ZXJsYXknKTtcbiAgICAgICAgbGV0IGJveCA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2Rpc2Nvbm5lY3QtYm94Jyk7XG4gICAgICAgIGxldCBpY29uID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZGlzY29ubmVjdC1pY29uJykudGV4dCgn4pqgJyk7XG4gICAgICAgIGxldCBtc2cgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdkaXNjb25uZWN0LW1zZycpXG4gICAgICAgICAgICAudGV4dCgn6L+e5o6l5Lit5patJyk7XG4gICAgICAgIGxldCBidG4gPSAkKCc8YnV0dG9uPicpLmFkZENsYXNzKCdkaXNjb25uZWN0LXJldHJ5LWJ0bicpXG4gICAgICAgICAgICAudGV4dCgn5omL5Yqo6YeN6L+eJykub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdb6YeN6L+eXSDmiYvliqjph43ov54uLi4nKTtcbiAgICAgICAgICAgICAgICBzb2NrLmNvbm5lY3QoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICBib3guYXBwZW5kKGljb24sIG1zZywgYnRuKTtcbiAgICAgICAgb3ZlcmxheS5hcHBlbmQoYm94KTtcbiAgICAgICAgJCgnYm9keScpLmFwcGVuZChvdmVybGF5KTtcbiAgICAgICAgXyRkaXNjb25uZWN0T3ZlcmxheSA9IG92ZXJsYXk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2hpZGVEaXNjb25uZWN0T3ZlcmxheSgpIHtcbiAgICAgICAgaWYgKF8kZGlzY29ubmVjdE92ZXJsYXkpIHtcbiAgICAgICAgICAgIF8kZGlzY29ubmVjdE92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgICAgICBfJGRpc2Nvbm5lY3RPdmVybGF5ID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc1JlY29ubmVjdGluZygpIHtcbiAgICAgICAgcmV0dXJuICEhXyRkaXNjb25uZWN0T3ZlcmxheTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbml0KCkge1xuXG4gICAgICAgIC8qIOWFiOmakOiXj+WKoOi9veWKqOeUu+W5tuaYvuekuum7mOiupOeVjOmdou+8iOacqueZu+W9leeKtuaAge+8ie+8jOmBv+WFjSBTb2NrZXQuSU8g5pWF6Zqc5pe25Y2h5q27ICovXG4gICAgICAgIGhpZGUoJCgnI3RpdGxlIC5sb2FkaW5nJykpO1xuICAgICAgICAkKCdib2R5JykuYXR0cignY2xhc3MnLCd0aXRsZScpO1xuICAgICAgICBzaG93KCQoJyN0aXRsZSAubG9naW4nKSk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHNvY2sgPSBpbygnLycsIHtcbiAgICAgICAgICAgICAgICBwYXRoOiBgJHtiYXNlfS9zZXJ2ZXIvc29ja2V0LmlvL2AsXG4gICAgICAgICAgICAgICAgdHJhbnNwb3J0czogWyd3ZWJzb2NrZXQnLCAncG9sbGluZyddLFxuICAgICAgICAgICAgICAgIHJlY29ubmVjdGlvbjogZmFsc2UgICAgICAgICAgICAvKiDnpoHnlKjoh6rliqjph43ov57vvIzmlLnkuLrmiYvliqggKi9cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1NvY2tldC5JTyDliJ3lp4vljJblpLHotKXvvIzor7fmo4Dmn6XmnI3liqHlmajmmK/lkKblnKjnur8nLCBlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHNvY2sub24oJ0hFTExPJywgaGVsbG8pO1xuICAgICAgICBzb2NrLm9uKCdST09NJywgcm9vbSk7XG4gICAgICAgIHNvY2sub24oJ1NUQVJUJywgc3RhcnQpO1xuICAgICAgICBzb2NrLm9uKCdFTkQnLCBlbmQpO1xuICAgICAgICBzb2NrLm9uKCdFUlJPUicsIGZpbGUuZXJyb3IpO1xuXG4gICAgICAgIC8qIOaWree6v+WkhOeQhu+8muS4jeWIh+aNoumhtemdou+8jOW8ueWHuumBrue9qe+8jOaJi+WKqOmHjei/niAqL1xuICAgICAgICBzb2NrLm9uKCdkaXNjb25uZWN0JywgKHJlYXNvbikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFvmlq3nur9dIOi/nuaOpeS4reaWrTogJHtyZWFzb259YCk7XG4gICAgICAgICAgICBfc2hvd0Rpc2Nvbm5lY3RPdmVybGF5KCk7XG4gICAgICAgIH0pO1xuICAgICAgICAvKiDph43ov57miJDlip/vvJrlhbPpl63pga7nvakgKi9cbiAgICAgICAgc29jay5vbignY29ubmVjdCcsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdb6YeN6L+eXSDov57mjqXmiJDlip8nKTtcbiAgICAgICAgICAgIF9oaWRlRGlzY29ubmVjdE92ZXJsYXkoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGVsbG8odXNlcikge1xuICAgICAgICBpZiAoISB1c2VyKSByZXR1cm47ICAvLyDmnKrnmbvlvZXvvIzms6jlhozooajljZXlt7LmmL7npLpcbiAgICAgICAgbXl1aWQgPSB1c2VyLnVpZDtcbiAgICAgICAgLyog6YeN6L+e5pyf6Ze05LiN5YiH5o2i6aG16Z2i77yM6YG/5YWNIGJvZHkgY2xhc3Mg5Y+Y5pu05a+86Ie06Lez6L2s5aSn5Y6FICovXG4gICAgICAgIGlmIChfaXNSZWNvbm5lY3RpbmcoKSkgcmV0dXJuO1xuICAgICAgICAvKiDph43ov57ml7blpoLmnpzlt7LlnKjlr77lsYDkuK3vvIhib2R5IGNsYXNzPWJvYXJk77yJ77yM5LiN6KaB5YiH5ZueIGZpbGUg55WM6Z2i77yMXG4gICAgICAgICAqIOmBv+WFjeegtOWdj+WvvuWxgCBVSeOAguacjeWKoeerr+S8mumaj+WQjuWPkemAgSBTVEFSVCDph43mlrDliJ3lp4vljJYgQm9hcmTjgIIgKi9cbiAgICAgICAgaWYgKCQoJ2JvZHknKS5hdHRyKCdjbGFzcycpICE9PSAnYm9hcmQnKSB7XG4gICAgICAgICAgICBzaG93KCQoJyNmaWxlJykpO1xuICAgICAgICAgICAgZmFkZUluKCQoJ2JvZHknKS5hdHRyKCdjbGFzcycsJ2ZpbGUnKSk7XG4gICAgICAgICAgICBzaG93KCQoJyNmaWxlIC5uZXRwbGF5IGZvcm0nKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVzZXIuaWNvbilcbiAgICAgICAgICAgICQoJyNmaWxlIC5uZXRwbGF5IGltZycpLmF0dHIoJ3NyYycsIHVzZXIuaWNvbilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ3RpdGxlJywgdXNlci51aWQpO1xuICAgICAgICAkKCcjZmlsZSAubmV0cGxheSAubmFtZScpLnRleHQodXNlci5uYW1lKTtcbiAgICAgICAgZmlsZS5yZWRyYXcoKTtcbiAgICB9XG5cbiAgICBsZXQgcm93LCBzcmM7XG5cbiAgICBmdW5jdGlvbiByb29tKG1zZykge1xuICAgICAgICBpZiAoISByb3cpIHtcbiAgICAgICAgICAgIHJvdyA9ICQoJyNyb29tIC51c2VyJykuZXEoMCk7XG4gICAgICAgICAgICBzcmMgPSAkKCdpbWcnLCByb3cpLmF0dHIoJ3NyYycpO1xuICAgICAgICB9XG4gICAgICAgICQoJ2JvZHknKS5hdHRyKCdjbGFzcycsJ3Jvb20nKTtcbiAgICAgICAgJCgnI3Jvb20gaW5wdXRbbmFtZT1cInJvb21fbm9cIl0nKS52YWwobXNnLnJvb21fbm8pO1xuICAgICAgICAkKCcjcm9vbSAucm9vbScpLmVtcHR5KCk7XG4gICAgICAgIGZvciAobGV0IHVzZXIgb2YgbXNnLnVzZXIpIHtcbiAgICAgICAgICAgIGxldCByID0gcm93LmNsb25lKCk7XG4gICAgICAgICAgICBpZiAodXNlci5pY29uKSAkKCdpbWcnLCByKS5hdHRyKCdzcmMnLCB1c2VyLmljb24pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKCd0aXRsZScsIHVzZXIudWlkKTtcbiAgICAgICAgICAgIGVsc2UgICAgICAgICAgICQoJ2ltZycsIHIpLmF0dHIoJ3NyYycsIHNyYyk7XG4gICAgICAgICAgICAkKCcubmFtZScsIHIpLnRleHQodXNlci5uYW1lKTtcbiAgICAgICAgICAgIGlmIChtc2cudXNlclswXS51aWQgPT0gbXl1aWQgfHwgdXNlci51aWQgPT0gbXl1aWQgKVxuICAgICAgICAgICAgICAgIHNob3coJCgnaW5wdXRbbmFtZT1cInF1aXRcIl0nLCByKS5vbignY2xpY2snLCAoKT0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvY2suZW1pdCgnUk9PTScsIG1zZy5yb29tX25vLCB1c2VyLnVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIGlmICh1c2VyLm9mZmxpbmUpIHIuYWRkQ2xhc3MoJ29mZmxpbmUnKTtcbiAgICAgICAgICAgIGVsc2UgICAgICAgICAgICAgIHIucmVtb3ZlQ2xhc3MoJ29mZmxpbmUnKTtcbiAgICAgICAgICAgICQoJyNyb29tIC5yb29tJykuYXBwZW5kKHIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtc2cudXNlclswXS51aWQgPT0gbXl1aWQpIHtcbiAgICAgICAgICAgIHNob3coJCgnI3Jvb20gc2VsZWN0W25hbWU9XCJydWxlXCJdJykpO1xuICAgICAgICAgICAgc2hvdygkKCcjcm9vbSBpbnB1dFtuYW1lPVwidGltZXJcIl0nKSk7XG4gICAgICAgICAgICBzaG93KCQoJyNyb29tIGlucHV0W3R5cGU9XCJzdWJtaXRcIl0nKSk7XG4gICAgICAgICAgICBzaG93KCQoJyNyb29tIGlucHV0W25hbWU9XCJib3RcIl0nKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoaWRlKCQoJyNyb29tIHNlbGVjdFtuYW1lPVwicnVsZVwiXScpKTtcbiAgICAgICAgICAgIGhpZGUoJCgnI3Jvb20gaW5wdXRbbmFtZT1cInRpbWVyXCJdJykpO1xuICAgICAgICAgICAgaGlkZSgkKCcjcm9vbSBpbnB1dFt0eXBlPVwic3VibWl0XCJdJykpO1xuICAgICAgICAgICAgaGlkZSgkKCcjcm9vbSBpbnB1dFtuYW1lPVwiYm90XCJdJykpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnQoKSB7XG5cbiAgICAgICAgLyog6YeN6L+e5pe25riF55CG5pen5a+56LGh77yM6YG/5YWN5Y+l5p+E5rOE5ryP5ZKM6K6+572u5Lii5aSxICovXG4gICAgICAgIGlmIChwbGF5ZXIpIHtcbiAgICAgICAgICAgIHBsYXllci5jbGVhcl9oYW5kbGVyKCk7XG4gICAgICAgICAgICBwbGF5ZXIuY2xlYXJfdGltZXIoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYm9hcmRWaWV3KSB7XG4gICAgICAgICAgICAkKHdpbmRvdykub2ZmKCdyZXNpemUnKTsgICAgICAgICAgIC8vIEJvYXJkIOaehOmAoOWHveaVsOS4ree7keWumueahCByZXNpemVcbiAgICAgICAgICAgICQoJyNib2FyZCAuaW5mby1idG4nKS5vZmYoJ2NsaWNrJyk7IC8vIEJvYXJkIOaehOmAoOWHveaVsOS4ree7keWumueahCBpbmZvLWJ0blxuICAgICAgICAgICAgYm9hcmRWaWV3Ll92b2ljZS5mb3JFYWNoKHYgPT4gdi5zdG9wICYmIHYuc3RvcCgpKTtcbiAgICAgICAgfVxuICAgICAgICAvKiDmuIXnkIbkuIrkuIDkuKogR2FtZUN0bCDnmoTkuovku7blj6Xmn4TvvIhrZXl1cOOAgeaMiemSriBjbGlja++8iSAqL1xuICAgICAgICAkKHdpbmRvdykub2ZmKCdrZXl1cC5jb250cm9sZXInKTtcbiAgICAgICAgJCgnLnNvdW5kJywgJCgnI2JvYXJkIC5jb250cm9sbGVyJykpLm9mZignY2xpY2snKTtcbiAgICAgICAgJCgnLm1pbnVzJywgJCgnI2JvYXJkIC5jb250cm9sbGVyJykpLm9mZignY2xpY2snKTtcbiAgICAgICAgJCgnLnBsdXMnLCAgJCgnI2JvYXJkIC5jb250cm9sbGVyJykpLm9mZignY2xpY2snKTtcblxuICAgICAgICAvKiDkv53lrZggQkdNIOaSreaUvueKtuaAge+8jOmHjei/nuWQjuaBouWkjSAqL1xuICAgICAgICBsZXQgYmdtV2FzUGxheWluZyA9IGJnbVBsYXllci5fYXVkaW8gJiYgIWJnbVBsYXllci5fYXVkaW8ucGF1c2VkO1xuXG4gICAgICAgIHBsYXllciA9IG5ldyBNYWppYW5nLlVJLlBsYXllcigkKCcjYm9hcmQnKSwgcGFpLCBhdWRpbyk7XG4gICAgICAgIGJvYXJkVmlldyA9IG5ldyBNYWppYW5nLlVJLkJvYXJkKCQoJyNib2FyZCAuYm9hcmQnKSwgcGFpLCBhdWRpbyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYXllci5tb2RlbCwge30pO1xuICAgICAgICBwbGF5ZXIudmlldyA9IGJvYXJkVmlldztcblxuICAgICAgICAvKiDliJ3lp4vljJbmioDog73mj5DnpLogVUnvvIjogZTmnLrlpI3nlKjljZXkurrniYggU2tpbGxQcm9tcHTvvIkgKi9cbiAgICAgICAgc2tpbGxQcm9tcHRVSSA9IG5ldyBNYWppYW5nLlVJLlNraWxsUHJvbXB0KCQoJyNib2FyZCcpLCBwYWkpO1xuXG4gICAgICAgIGNvbnN0IGdhbWVDdGwgPSBuZXcgTWFqaWFuZy5VSS5HYW1lQ3RsKCQoJyNib2FyZCcpLCAnTWFqaWFuZy5wcmVmJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bGwsIHBsYXllciwgcGxheWVyLl92aWV3KTtcbiAgICAgICAgZ2FtZUN0bC5fdmlldy5ub19wbGF5ZXJfbmFtZSA9IGZhbHNlO1xuXG4gICAgICAgIC8qIOi/lOWbni/kv6Hmga/mjInpkq7vvJrnp7vliLAgI2JvYXJkIOS4i++8iOiEseemuyAuYm9hcmQg55qEIG92ZXJmbG93OmhpZGRlbu+8iSAqL1xuICAgICAgICBsZXQgJGJ0bkJhY2sgPSAkKCcuc2hhbi1iYWNrLWJ0bicpO1xuICAgICAgICBsZXQgJGJ0bkluZm8gPSAkKCcuaW5mby1idG4nKTtcbiAgICAgICAgJGJ0bkJhY2sub2ZmKCdjbGljaycpLm9uKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBpZiAoY29uZmlybSgn56Gu5a6a6KaB6L+U5Zue5Li755WM6Z2i5ZCX77yfJykpIHtcbiAgICAgICAgICAgICAgICAvKiDpgJrnn6XmnI3liqHnq6/nprvlvIDlr7nlsYDvvIznhLblkI7nm7TmjqXot7PovawgVVJM44CCXG4gICAgICAgICAgICAgICAgICogVVJMIOi3s+i9rOavlOaTjeS9nCBDU1MvYm9keSBjbGFzcyDlj6/pnaDvvIzlvbvlupXpgb/lhY1cbiAgICAgICAgICAgICAgICAgKiBuZXRwbGF5IOihqOWNleaui+eVmeaYvuekuueahOmXrumimOOAgiAqL1xuICAgICAgICAgICAgICAgIHNvY2suZW1pdCgnTEVBVkVfR0FNRScpO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gbG9jYXRpb24ub3JpZ2luICsgYmFzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkucmVtb3ZlQXR0cignaHJlZicpXG4gICAgICAgICAgICAuY3NzKHsnZGlzcGxheSc6J2Jsb2NrJywncG9zaXRpb24nOidhYnNvbHV0ZScsJ3RvcCc6JzEwcHgnLCdsZWZ0JzonMTBweCcsJ3otaW5kZXgnOicxMDAwJywndHJhbnNmb3JtJzonbm9uZScsJ2N1cnNvcic6J3BvaW50ZXInfSlcbiAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjYm9hcmQnKSk7XG4gICAgICAgICRidG5JbmZvLmNzcyh7J2Rpc3BsYXknOidibG9jaycsJ3Bvc2l0aW9uJzonYWJzb2x1dGUnLCd0b3AnOic0MnB4JywnbGVmdCc6JzEwcHgnLCd6LWluZGV4JzonMTAwMCcsJ3RyYW5zZm9ybSc6J25vbmUnfSlcbiAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjYm9hcmQnKSk7XG5cbiAgICAgICAgLyog6YCA5Ye65oyJ6ZKu77ya56a75byA5a+55bGA5Zue5Yiw5Li76aG1ICovXG4gICAgICAgICQoJy5leGl0JywgJCgnI2JvYXJkIC5jb250cm9sbGVyJykpLm9mZignY2xpY2snKS5vbignY2xpY2snLCAoKT0+e1xuICAgICAgICAgICAgaWYgKGNvbmZpcm0oJ+ehruWumuimgeemu+W8gOWvueWxgOWQl++8nycpKSB7XG4gICAgICAgICAgICAgICAgc29jay5lbWl0KCdMRUFWRV9HQU1FJyk7XG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSBsb2NhdGlvbi5vcmlnaW4gKyBiYXNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgcGxheWVycyA9IFtdO1xuXG4gICAgICAgICQoJyNib2FyZCAuY29udHJvbGxlcicpLnJlbW92ZUNsYXNzKCdwYWlwdScpXG4gICAgICAgICQoJ2JvZHknKS5hdHRyKCdjbGFzcycsJ2JvYXJkJyk7XG4gICAgICAgIGhpZGUoJCgnI2ZpbGUnKSk7XG4gICAgICAgIHNjYWxlKCQoJyNib2FyZCcpLCAkKCcjc3BhY2UnKSk7XG4gICAgICAgIGxldCBzZXEgPSAwO1xuICAgICAgICBzb2NrLnJlbW92ZUFsbExpc3RlbmVycygnR0FNRScpO1xuICAgICAgICBzb2NrLm9uKCdHQU1FJywgKG1zZyk9PntcblxuICAgICAgICAgICAgLyogLS0tLSDnjqnlrrbkv6Hmga/lkIzmraUgLS0tLSAqL1xuICAgICAgICAgICAgaWYgKG1zZy5wbGF5ZXJzKSB7XG4gICAgICAgICAgICAgICAgcGxheWVycyA9IG1zZy5wbGF5ZXJzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiAtLS0tIOacjeWKoeWZqOivremfs+aSreaUvuaMh+S7pCAtLS0tICovXG4gICAgICAgICAgICBlbHNlIGlmIChtc2cuc2F5KSB7XG4gICAgICAgICAgICAgICAgcGxheWVyLl92aWV3LnNheShtc2cuc2F5Lm5hbWUsIG1zZy5zYXkubCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIC0tLS0g6KeS6Imy6YCJ5oupIC0tLS0gKi9cbiAgICAgICAgICAgIGVsc2UgaWYgKG1zZy5jaGFyYWN0ZXJfc2VsZWN0KSB7XG4gICAgICAgICAgICAgICAgLyogcGxheWVySWR4IOaYr+mAieaLqeaXtueahOW4reS9je+8iHFpcGFpIOWJjSA9IHBsSWR477yJ77yM6ZyA6L2s5Li6IHFpcGFpIOWQjueahCBnYW1lU2VhdCAqL1xuICAgICAgICAgICAgICAgIGxldCBwbElkeCA9IG1zZy5jaGFyYWN0ZXJfc2VsZWN0LnBsYXllcklkeDtcbiAgICAgICAgICAgICAgICBsZXQgcWlqaWEgPSBtc2cuY2hhcmFjdGVyX3NlbGVjdC5xaWppYSB8fCAwO1xuICAgICAgICAgICAgICAgIGxldCBqdXNodSA9IG1zZy5jaGFyYWN0ZXJfc2VsZWN0Lmp1c2h1IHx8IDA7XG4gICAgICAgICAgICAgICAgbXlHYW1lU2VhdCA9IChwbElkeCAtIHFpamlhIC0ganVzaHUgKyA4KSAlIDQ7XG4gICAgICAgICAgICAgICAgX3Nob3dDaGFyYWN0ZXJTZWxlY3QobXNnLmNoYXJhY3Rlcl9zZWxlY3QpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiAtLS0tIOinkuiJsuehruiupOe7k+aenCAtLS0tICovXG4gICAgICAgICAgICBlbHNlIGlmIChtc2cuY2hhcmFjdGVyX2NvbmZpcm1lZCkge1xuICAgICAgICAgICAgICAgIF9vbkNoYXJhY3RlckNvbmZpcm1lZChtc2cuY2hhcmFjdGVyX2NvbmZpcm1lZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIC0tLS0g5oqA6IO95Lqk5LqS5o+Q56S6IC0tLS0gKi9cbiAgICAgICAgICAgIGVsc2UgaWYgKG1zZy5za2lsbF9wcm9tcHQpIHtcbiAgICAgICAgICAgICAgICBfc2hvd1NraWxsUHJvbXB0KG1zZy5za2lsbF9wcm9tcHQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiAtLS0tIOaKgOiDvemYtuautemXtOaJi+eJjOWQjOatpe+8iOacjeWKoeWZqOW3suWumuWQkeWPkemAge+8jOebtOaOpeWkhOeQhu+8iSAtLS0tICovXG4gICAgICAgICAgICBlbHNlIGlmIChtc2cuaGFuZF9zeW5jKSB7XG4gICAgICAgICAgICAgICAgbGV0IGhzID0gbXNnLmhhbmRfc3luYztcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW25ldHBsYXldIGhhbmRfc3luYyBSRUNFSVZFRCBzZWF0PSR7aHMuc2VhdH0gYmluZ3BhaT1gLCBocy5iaW5ncGFpLCBgemltbz0ke2hzLnppbW99IG15R2FtZVNlYXQ9JHtteUdhbWVTZWF0fWApO1xuICAgICAgICAgICAgICAgIGxldCBtb2RlbF9zaG91cGFpID0gcGxheWVyLl9tb2RlbC5zaG91cGFpW2hzLnNlYXRdO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbbmV0cGxheV0gaGFuZF9zeW5jIG1vZGVsX3Nob3VwYWkgZm91bmQ9JHshIW1vZGVsX3Nob3VwYWl9YCk7XG4gICAgICAgICAgICAgICAgaWYgKG1vZGVsX3Nob3VwYWkgJiYgaHMuYmluZ3BhaSkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgYnAgPSBocy5iaW5ncGFpO1xuICAgICAgICAgICAgICAgICAgICAvKiDnm7TmjqXmi7fotJ0gX2JpbmdwYWkg5pWw57uE77yM5pSv5oyB6LaF6L+HIDE0IOW8oOeahOS4remXtOeKtuaAgeaJi+eJjCAqL1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBzIG9mIFsnbScsJ3AnLCdzJywneiddKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYXJyID0gYnBbc107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgbiA9IDA7IG4gPCBhcnIubGVuZ3RoOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxfc2hvdXBhaS5fYmluZ3BhaVtzXVtuXSA9IGFycltuXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbW9kZWxfc2hvdXBhaS5fYmluZ3BhaS5fID0gYnAuXztcbiAgICAgICAgICAgICAgICAgICAgbW9kZWxfc2hvdXBhaS5femltbyA9IGhzLnppbW8gfHwgbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFtuZXRwbGF5XSBoYW5kX3N5bmMgbW9kZWwgdXBkYXRlZCwgbm93OiAke21vZGVsX3Nob3VwYWkudG9TdHJpbmcoKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBsYXllci5fdmlldyAmJiBwbGF5ZXIuX3ZpZXcuX3ZpZXcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBoYW5kVUkgPSBwbGF5ZXIuX3ZpZXcuX3ZpZXcuc2hvdXBhaVtocy5zZWF0XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbbmV0cGxheV0gaGFuZF9zeW5jIGhhbmRVSSBmb3VuZD0keyEhaGFuZFVJfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRVSSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRVSS5yZWRyYXcodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFuZFVJLmFkanVzdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbbmV0cGxheV0gaGFuZF9zeW5jIHJlZHJhdyBkb25lLCBET00gcGFpIGNvdW50PSR7JCgnLnNob3VwYWkubWFpbiAuYmluZ3BhaSA+IC5wYWknKS5sZW5ndGh9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIC0tLS0g5a2Y5YKo54mM5bGx5b+r54WnICsg57Sv56ev5Yqo5L2c5pel5b+XIC0tLS0gKi9cbiAgICAgICAgICAgIGlmIChib2FyZFZpZXcpIHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLndhbGxfc25hcHNob3QpIHtcbiAgICAgICAgICAgICAgICAgICAgYm9hcmRWaWV3Ll93YWxsU25hcHNob3QgPSBtc2cud2FsbF9zbmFwc2hvdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5hY3Rpb25fbG9nX2VudHJpZXMgJiYgbXNnLmFjdGlvbl9sb2dfZW50cmllcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFib2FyZFZpZXcuX2FjdGlvbkxvZykgYm9hcmRWaWV3Ll9hY3Rpb25Mb2cgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHRzID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgZW50cnkgb2YgbXNnLmFjdGlvbl9sb2dfZW50cmllcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9hcmRWaWV3Ll9hY3Rpb25Mb2cucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogZW50cnkudGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWF0OiBlbnRyeS5zZWF0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRzOiB0cysrXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyogLS0tLSDlpITnkIYga2FpanUg5raI5oGv5Lit55qEIEJHTSArIOivremfsyArIOinkuiJsuaYvuekuu+8iOmcgOWcqCBwbGF5ZXIuYWN0aW9uIOS5i+WJje+8jOS9huS4jemYu+atouWQjue7reWkhOeQhu+8iSAtLS0tICovXG4gICAgICAgICAgICBpZiAobXNnLmthaWp1KSB7XG4gICAgICAgICAgICAgICAgX2hhbmRsZUthaWp1KG1zZy5rYWlqdSwgdm9pY2VDaGFycywgYmdtV2FzUGxheWluZyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIOaWsOWbnuWQiOW8gOWni++8muWFs+mXremBl+eVmeeahOaKgOiDvS/op5LoibLlvLnnqpcgKi9cbiAgICAgICAgICAgIGlmIChtc2cuc2VxKSB7XG4gICAgICAgICAgICAgICAgX2Rpc21pc3NBbGxPdmVybGF5cygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiAtLS0tIOmcgOimgeWbnuWkjeeahOa4uOaIj+a2iOaBryAoc2VxID4gMCkgLS0tLSAqL1xuICAgICAgICAgICAgaWYgKG1zZy5zZXEpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2VxICYmIG1zZy5zZXEgIT0gc2VxKSBsb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgICAgICAgICAgICBwbGF5ZXIuYWN0aW9uKG1zZywgKHJlcGx5ID0ge30pPT57XG4gICAgICAgICAgICAgICAgICAgIHJlcGx5LnNlcSA9IG1zZy5zZXE7XG4gICAgICAgICAgICAgICAgICAgIHNvY2suZW1pdCgnR0FNRScsIHJlcGx5KTtcbiAgICAgICAgICAgICAgICAgICAgc2VxID0gbXNnLnNlcSArIDE7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIC0tLS0g5Y2V5ZCR6YCa55+l5raI5oGvIChzZXEgPT09IDAgLyB1bmRlZmluZWQpIC0tLS0gKi9cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBsYXllci5hY3Rpb24obXNnKTtcbiAgICAgICAgICAgICAgICBpZiAobXNnLmthaWp1ICYmIG1zZy5rYWlqdS5sb2cpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGxvZyA9IG1zZy5rYWlqdS5sb2cucG9wKCk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGRhdGEgb2YgbG9nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwbGF5ZXIuYWN0aW9uKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwbGF5ZXIuX3ZpZXcucGxheWVycyhwbGF5ZXJzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqIOWFs+mXreaJgOacieaKgOiDvS/op5LoibLpgInmi6nlvLnnqpcgKi9cbiAgICBmdW5jdGlvbiBfZGlzbWlzc0FsbE92ZXJsYXlzKCkge1xuICAgICAgICAkKCcubmV0cGxheS1za2lsbC1wcm9tcHQtb3ZlcmxheScpLnJlbW92ZSgpO1xuICAgICAgICBpZiAoc2tpbGxQcm9tcHRVSSkgc2tpbGxQcm9tcHRVSS5jbGVhcigpO1xuICAgICAgICAvKiDop5LoibLpgInmi6nlvLnnqpfnlLHlgJLorqHml7boh6rooYznrqHnkIbvvIzkuI3lvLrliLblhbPpl60gKi9cbiAgICB9XG5cbiAgICAvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICogIGthaWp1IOa2iOaBr+WkhOeQhu+8mkJHTSArIOivremfs+inkuiJsiArIOinkuiJsuaYvuekulxuICAgICAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cblxuICAgIGZ1bmN0aW9uIF9oYW5kbGVLYWlqdShrYWlqdSwgdm9pY2VDaGFycywgd2FzUGxheWluZykge1xuICAgICAgICAvKiDmoLnmja7lvZPliY3lsYDnmoQgcWlqaWEvanVzaHUg5pu05paw6Ieq5bex55qE5ri45oiP5bit5L2N77yI55So5LqO5peL6L2s6KeS6Imy5aS05YOP562J77yJICovXG4gICAgICAgIGlmIChrYWlqdS5pZCAhPT0gdW5kZWZpbmVkICYmIGthaWp1LnFpamlhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG15R2FtZVNlYXQgPSAoa2FpanUuaWQgLSBrYWlqdS5xaWppYSAtIChrYWlqdS5qdXNodSB8fCAwKSArIDgpICUgNDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIEJHTSDigJQg5Y+q5pyJ5Yid5qyh5a++5bGA5oiW5LmL5YmN5q2j5Zyo5pKt5pS+5pe25omN5ZCv5Yqo77yM6YG/5YWN6YeN6L+e5pe26KaG55uW5pqC5YGc54q25oCBICovXG4gICAgICAgIGlmIChrYWlqdS5iZ20pIHtcbiAgICAgICAgICAgIGJnbVBsYXllci5zZXRUcmFjayhrYWlqdS5iZ20pO1xuICAgICAgICAgICAgaWYgKHdhc1BsYXlpbmcgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgYmdtUGxheWVyLnBsYXkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qIOivremfs+inkuiJsiAqL1xuICAgICAgICBpZiAoa2FpanUudm9pY2VfY2hhcikge1xuICAgICAgICAgICAgLyog5Y+q5Zyo5Yid5qyh6L+e5o6l5pe25Li65YW25LuW5bqn5L2N6ZqP5py65YiG6YWN6K+t6Z+z77yM6YeN6L+e5pe25L+d55WZ5bey6K6+572u55qE6KeS6ImyICovXG4gICAgICAgICAgICBsZXQgaXNGaXJzdFRpbWUgPSB2b2ljZUNoYXJzWzBdID09PSBudWxsO1xuICAgICAgICAgICAgdm9pY2VDaGFyc1swXSA9IGthaWp1LnZvaWNlX2NoYXIgPT09ICdub25lJyA/IG51bGwgOiBrYWlqdS52b2ljZV9jaGFyO1xuICAgICAgICAgICAgaWYgKGlzRmlyc3RUaW1lKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdm9pY2VDaGFyc1tpXSA9IFZPSUNFX0NIQVJfTElTVFtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBWT0lDRV9DSEFSX0xJU1QubGVuZ3RoKV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYm9hcmRWaWV3LnNldFZvaWNlQ2hhcnModm9pY2VDaGFycyk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiDop5LoibLmmL7npLogKi9cbiAgICAgICAgaWYgKGthaWp1LmNoYXJhY3RlciAmJiBrYWlqdS5jaGFyYWN0ZXIubGVuZ3RoKSB7XG4gICAgICAgICAgICBfdXBkYXRlQm9hcmRDaGFyYWN0ZXJzKGthaWp1LmNoYXJhY3Rlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICogIOinkuiJsumAieaLqSBVSVxuICAgICAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cblxuICAgIGZ1bmN0aW9uIF9zaG93Q2hhcmFjdGVyU2VsZWN0KGRhdGEpIHtcbiAgICAgICAgLyogZGF0YTogeyBvcHRpb25zOiBbQ2hhcmFjdGVyLCAuLi5dLCBwbGF5ZXJJZHg6IG51bWJlciwgdGltZW91dDogbnVtYmVyIH0gKi9cbiAgICAgICAgaWYgKCFkYXRhLm9wdGlvbnMgfHwgIWRhdGEub3B0aW9ucy5sZW5ndGgpIHJldHVybjtcblxuICAgICAgICAvKiDlhbPpl63lt7LmnInnmoTpgInmi6nlmaggKi9cbiAgICAgICAgbGV0IGV4aXN0aW5nID0gJCgnLmNoYXJhY3Rlci1zZWxlY3Rvci1vdmVybGF5Jyk7XG4gICAgICAgIGlmIChleGlzdGluZy5sZW5ndGgpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gICAgICAgIGxldCBvdmVybGF5ID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnY2hhcmFjdGVyLXNlbGVjdG9yLW92ZXJsYXknKTtcbiAgICAgICAgbGV0IG1vZGFsICAgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdjaGFyYWN0ZXItc2VsZWN0b3ItbW9kYWwnKTtcbiAgICAgICAgbGV0IHRpdGxlICAgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdjaGFyYWN0ZXItc2VsZWN0b3ItdGl0bGUnKTtcbiAgICAgICAgbGV0IGdyaWQgICAgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdjaGFyYWN0ZXItc2VsZWN0b3ItZ3JpZCcpO1xuICAgICAgICBsZXQgY29uZmlybSA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2NoYXJhY3Rlci1zZWxlY3Rvci1jb25maXJtJyk7XG4gICAgICAgIGxldCBidG4gICAgID0gJCgnPGJ1dHRvbj4nKS5hZGRDbGFzcygnY2hhcmFjdGVyLXNlbGVjdG9yLWJ0bicpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2FyaWEtbGFiZWwnLCAn56Gu5a6aJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignZGlzYWJsZWQnLCB0cnVlKS50ZXh0KCfnoa7lrponKTtcblxuICAgICAgICBsZXQgdG9nZ2xlQnRuID0gJCgnPGJ1dHRvbj4nKS5hZGRDbGFzcygnY2hhcmFjdGVyLXNlbGVjdG9yLXRvZ2dsZScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGV4dCgn4pa9IOmakOiXjycpLmF0dHIoJ3RpdGxlJywgJ+aUtui1t+mdouadv+inguWvn+aJi+eJjCcpO1xuXG4gICAgICAgIGxldCBzZWxlY3RlZCA9IC0xO1xuICAgICAgICBsZXQgY29uZmlybWVkID0gZmFsc2U7XG4gICAgICAgIGxldCB0aW1lckNvdW50ZG93biA9IChkYXRhLnRpbWVvdXQgfHwgMzApO1xuICAgICAgICB0aXRsZS50ZXh0KCfpgInmi6nop5LoibIgKCcgKyB0aW1lckNvdW50ZG93biArICdzKScpO1xuXG4gICAgICAgIC8qIOWAkuiuoeaXtiAqL1xuICAgICAgICBsZXQgdGltZXJJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGltZXJDb3VudGRvd24tLTtcbiAgICAgICAgICAgIGlmICh0aW1lckNvdW50ZG93biA8PSAwKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcklkKTtcbiAgICAgICAgICAgICAgICB0aXRsZS50ZXh0KCfpgInmi6nop5LoibIgKDBzKScpO1xuICAgICAgICAgICAgICAgIC8qIOi2heaXtuiHquWKqOmAieaLqSAqL1xuICAgICAgICAgICAgICAgIGlmICghY29uZmlybWVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWxlY3RlZCA8IDApIHNlbGVjdGVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZGF0YS5vcHRpb25zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbmZpcm1lZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5hdHRyKCdkaXNhYmxlZCcsIHRydWUpLnRleHQoJ+W3sui2heaXticpO1xuICAgICAgICAgICAgICAgICAgICBncmlkLmZpbmQoJy5jaGFyYWN0ZXItY2FyZCcpLmNzcygncG9pbnRlci1ldmVudHMnLCAnbm9uZScpO1xuICAgICAgICAgICAgICAgICAgICBvdmVybGF5LmZhZGVPdXQoMzAwLCBmdW5jdGlvbigpIHsgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNvY2suZW1pdCgnQ0hBUkFDVEVSJywgc2VsZWN0ZWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGl0bGUudGV4dCgn6YCJ5oup6KeS6ImyICgnICsgdGltZXJDb3VudGRvd24gKyAncyknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTAwMCk7XG5cbiAgICAgICAgLyog6ZqQ6JePL+aYvuekuuWIh+aNoiAqL1xuICAgICAgICB0b2dnbGVCdG4ub24oJ2NsaWNrJywgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChtb2RhbC5pcygnOnZpc2libGUnKSkge1xuICAgICAgICAgICAgICAgIG1vZGFsLmhpZGUoKTtcbiAgICAgICAgICAgICAgICBvdmVybGF5LmNzcygnYmFja2dyb3VuZCcsICdyZ2JhKDAsMCwwLDAuMTUpJyk7XG4gICAgICAgICAgICAgICAgJCh0aGlzKS50ZXh0KCfilrMg5pi+56S6Jyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1vZGFsLnNob3coKTtcbiAgICAgICAgICAgICAgICBvdmVybGF5LmNzcygnYmFja2dyb3VuZCcsICdyZ2JhKDAsMCwwLDAuODUpJyk7XG4gICAgICAgICAgICAgICAgJCh0aGlzKS50ZXh0KCfilr0g6ZqQ6JePJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8qIOWNoeeJh+a4suafkyDigJQg5LiO5Y2V5Lq65qih5byPIENoYXJhY3RlclNlbGVjdG9yLl9jcmVhdGVDYXJkIOWujOWFqOS4gOiHtCAqL1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEub3B0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGNoYXIgPSBkYXRhLm9wdGlvbnNbaV07XG4gICAgICAgICAgICBsZXQgY2FyZCA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2NoYXJhY3Rlci1jYXJkJykuZGF0YSgnaW5kZXgnLCBpKTtcbiAgICAgICAgICAgIGxldCBhdmF0YXIgPSAkKCc8aW1nPicpLmFkZENsYXNzKCdhdmF0YXInKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignc3JjJywgJ3Jlc291cmNlcy/lpLTlg48vJyArIChjaGFyLmNhcmQgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignYWx0JywgY2hhci5uYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGxldCBuYW1lRGl2ID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnY2hhci1uYW1lJykudGV4dChjaGFyLm5hbWUgfHwgJycpO1xuICAgICAgICAgICAgbGV0IHNraWxsc0RpdiA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2NoYXItc2tpbGxzJyk7XG4gICAgICAgICAgICBmb3IgKGxldCBzIG9mIChjaGFyLnNraWxscyB8fCBbXSkpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGV4dCA9IHR5cGVvZiBzID09PSAnc3RyaW5nJyA/IHMgOiAocy5kZXNjcmlwdGlvbiB8fCAnJyk7XG4gICAgICAgICAgICAgICAgc2tpbGxzRGl2LmFwcGVuZCgkKCc8ZGl2PicpLmFkZENsYXNzKCdza2lsbC1saW5lJykudGV4dCh0ZXh0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXJkLmFwcGVuZChhdmF0YXIsIG5hbWVEaXYsIHNraWxsc0Rpdik7XG4gICAgICAgICAgICBjYXJkLm9uKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmIChjb25maXJtZWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICBsZXQgaWR4ID0gJCh0aGlzKS5kYXRhKCdpbmRleCcpO1xuICAgICAgICAgICAgICAgIHNlbGVjdGVkID0gaWR4O1xuICAgICAgICAgICAgICAgIGdyaWQuZmluZCgnLmNoYXJhY3Rlci1jYXJkJykucmVtb3ZlQ2xhc3MoJ3NlbGVjdGVkJyk7XG4gICAgICAgICAgICAgICAgJCh0aGlzKS5hZGRDbGFzcygnc2VsZWN0ZWQnKTtcbiAgICAgICAgICAgICAgICBidG4uYXR0cignZGlzYWJsZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGdyaWQuYXBwZW5kKGNhcmQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyog5Y2h54mH6L6D5bCR5pe2ICovXG4gICAgICAgIGlmIChkYXRhLm9wdGlvbnMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgZ3JpZC5hZGRDbGFzcygnZmV3LWNhcmRzJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEub3B0aW9ucy5sZW5ndGggPiA0KSB7XG4gICAgICAgICAgICBncmlkLmFkZENsYXNzKCdtYW55LWNhcmRzJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25maXJtLmFwcGVuZChidG4pO1xuICAgICAgICBtb2RhbC5hcHBlbmQodGl0bGUsIGdyaWQsIGNvbmZpcm0pO1xuICAgICAgICBvdmVybGF5LmFwcGVuZCh0b2dnbGVCdG4sIG1vZGFsKTtcbiAgICAgICAgJCgnYm9keScpLmFwcGVuZChvdmVybGF5KTtcblxuICAgICAgICAvKiDnoa7lrprmjInpkq4gKi9cbiAgICAgICAgYnRuLm9uKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKGNvbmZpcm1lZCB8fCBzZWxlY3RlZCA8IDApIHJldHVybjtcbiAgICAgICAgICAgIGNvbmZpcm1lZCA9IHRydWU7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVySWQpO1xuICAgICAgICAgICAgZ3JpZC5maW5kKCcuY2hhcmFjdGVyLWNhcmQnKS5jc3MoJ3BvaW50ZXItZXZlbnRzJywgJ25vbmUnKTtcbiAgICAgICAgICAgIGJ0bi5hdHRyKCdkaXNhYmxlZCcsIHRydWUpLnRleHQoJ+W3suehruiupCcpO1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBvdmVybGF5LmZhZGVPdXQoMjAwLCBmdW5jdGlvbigpIHsgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgICAgICAgICB9LCAzMDApO1xuICAgICAgICAgICAgc29jay5lbWl0KCdDSEFSQUNURVInLCBzZWxlY3RlZCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9vbkNoYXJhY3RlckNvbmZpcm1lZChkYXRhKSB7XG4gICAgICAgIC8qIGRhdGE6IHsgY2hhcmFjdGVyczogW3tpZCwgbmFtZSwgY2FyZCwgc2tpbGxzfSwgLi4uXSB9ICovXG4gICAgICAgIGlmIChkYXRhLmNoYXJhY3RlcnMgJiYgYm9hcmRWaWV3KSB7XG4gICAgICAgICAgICBfdXBkYXRlQm9hcmRDaGFyYWN0ZXJzKGRhdGEuY2hhcmFjdGVycyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfdXBkYXRlQm9hcmRDaGFyYWN0ZXJzKGNoYXJhY3Rlcikge1xuICAgICAgICBpZiAoIWJvYXJkVmlldyB8fCAhYm9hcmRWaWV3Ll9tb2RlbCkgcmV0dXJuO1xuICAgICAgICAvKiDmoLnmja7njqnlrrbluqfkvY3ml4vovazop5LoibLmlbDnu4TvvIzkvb/oh6rlt7HlnKjkuIvmlrnvvIjkvY3nva4w77yJICovXG4gICAgICAgIGxldCByb3RhdGVkID0gX3JvdGF0ZUNoYXJhY3RlckFycmF5KGNoYXJhY3RlciwgbXlHYW1lU2VhdCk7XG4gICAgICAgIGJvYXJkVmlldy5fbW9kZWwuX2NoYXJhY3RlciA9IHJvdGF0ZWQ7XG4gICAgICAgIGJvYXJkVmlldy5fbW9kZWwuY2hhcmFjdGVyID0gcm90YXRlZDtcbiAgICAgICAgLyog5qCH6K6w5bey6aKE5peL6L2s77yMYm9hcmQuX3JlbmRlckNoYXJhY3RlckRpc3BsYXkg5LiN5YaN5LqM5qyh5peL6L2sICovXG4gICAgICAgIGJvYXJkVmlldy5fbW9kZWwuX25ldHBsYXlSb3RhdGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDml4vovazop5LoibLmlbDnu4TvvJrlsIbmjIflrpogZ2FtZVNlYXQg5L2N572u55qE5YWD57Sg5peL6L2s5Yiw5pWw57uE57Si5byVIDDjgIJcbiAgICAgKiBcbiAgICAgKiDmnI3liqHnq6/lj5HmnaXnmoQgY2hhcmFjdGVyIOaVsOe7hOaMiSBnYW1lU2VhdCDntKLlvJXvvIhbMF095Lic5a626KeS6ImyLCBbMV095Y2X5a626KeS6ImyLi4u77yJ77yMXG4gICAgICog5L2G5a6i5oi356uvIFVJIOacn+acmyBbMF096Ieq5bex77yI5bGP5bmV5LiL5pa577yJ44CC5q2k5Ye95pWw6YCa6L+H5YGP56e75peL6L2s5a6e546w77yaXG4gICAgICogICByb3RhdGVkW2ldID0gY2hhcnNbKGkgKyBvZmZzZXQpICUgNF1cbiAgICAgKiDlvZMgb2Zmc2V0ID0g5b2T5YmN546p5a6255qEIGdhbWVTZWF0IOaXtu+8jHJvdGF0ZWRbMF0gPSBjaGFyc1voh6rlt7Fd44CCXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdFtdfSBjaGFycyAtIOaMiSBnYW1lU2VhdCDntKLlvJXnmoTop5LoibLmlbDnu4RcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gb2Zmc2V0IC0g5YGP56e76YeP77yI5b2T5YmN546p5a6255qEIGdhbWVTZWF077yM5Y2zIG15R2FtZVNlYXTvvIlcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0W119IOaXi+i9rOWQjueahOaVsOe7hO+8jFswXT3lvZPliY3njqnlrrbop5LoibJcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBfcm90YXRlQ2hhcmFjdGVyQXJyYXkoY2hhcnMsIG9mZnNldCkge1xuICAgICAgICBpZiAoIWNoYXJzIHx8ICFvZmZzZXQgfHwgb2Zmc2V0ID09PSAwKSByZXR1cm4gY2hhcnM7XG4gICAgICAgIGxldCByb3RhdGVkID0gW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hhcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHJvdGF0ZWRbaV0gPSBjaGFyc1soaSArIG9mZnNldCkgJSBjaGFycy5sZW5ndGhdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3RhdGVkO1xuICAgIH1cblxuICAgIC8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgKiAg5oqA6IO95Lqk5LqS5o+Q56S6IOKAlCDnu5/kuIDmoYbmnrbvvJrlp5TmiZjnu5kgU2tpbGxQcm9tcHQgVUlcbiAgICAgKiAg5pyN5Yqh56uv6YCa6L+HIE11bHRpcGxheWVyU2tpbGxQcm9tcHQg5Y+R6YCB57uf5LiA5Y2P6K6u77yMXG4gICAgICogIOWuouaIt+err+ebtOaOpeiwg+eUqCBTa2lsbFByb21wdCDmlrnms5XvvIzml6DpnIDoh6rlrprkuYkgSFRNTOOAglxuICAgICAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cblxuICAgIGZ1bmN0aW9uIF9zaG93U2tpbGxQcm9tcHQoZGF0YSkge1xuICAgICAgICAvKiBkYXRhOiB7IHByb21wdElkLCBwcm9tcHRUeXBlLCBkZXNjcmlwdGlvbiwgY2hvaWNlcywgdmFsaWRUaWxlcywgdGl0bGUsIHRpbGVzLCB0aW1lb3V0IH0gKi9cblxuICAgICAgICBjb25zb2xlLmxvZyhgW25ldHBsYXldIF9zaG93U2tpbGxQcm9tcHQgcHJvbXB0SWQ9JHtkYXRhLnByb21wdElkfSB0eXBlPSR7ZGF0YS5wcm9tcHRUeXBlfSBjaG9pY2VzPWAsIGRhdGEuY2hvaWNlcyk7XG5cbiAgICAgICAgaWYgKCFza2lsbFByb21wdFVJKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW25ldHBsYXldIF9zaG93U2tpbGxQcm9tcHQ6IHNraWxsUHJvbXB0VUkgaXMgbnVsbCEnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBwcm9tcHRUeXBlID0gZGF0YS5wcm9tcHRUeXBlO1xuICAgICAgICBsZXQgZW1pdFJlcGx5ID0gKHJlcGx5KSA9PiB7XG4gICAgICAgICAgICByZXBseSA9IHJlcGx5IHx8IHt9O1xuICAgICAgICAgICAgcmVwbHkucHJvbXB0SWQgPSBkYXRhLnByb21wdElkO1xuICAgICAgICAgICAgc29jay5lbWl0KCdTS0lMTF9SRVBMWV8nICsgZGF0YS5wcm9tcHRJZCwgcmVwbHkpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHN3aXRjaCAocHJvbXB0VHlwZSkge1xuXG4gICAgICAgICAgICBjYXNlICdjb25maXJtJzpcbiAgICAgICAgICAgICAgICBza2lsbFByb21wdFVJLmFza0NvbmZpcm0oJycsIGRhdGEuZGVzY3JpcHRpb24gfHwgJycsIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBlbWl0UmVwbHkoeyBjaG9pY2U6IHJlc3BvbnNlID09PSAneWVzJyA/IDAgOiAxIH0pO1xuICAgICAgICAgICAgICAgIH0sIGRhdGEudGltZW91dCB8fCAwKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnb3B0aW9ucyc6XG4gICAgICAgICAgICAgICAgc2tpbGxQcm9tcHRVSS5hc2tPcHRpb25zKGRhdGEuZGVzY3JpcHRpb24gfHwgJycsIGRhdGEuY2hvaWNlcyB8fCBbXSwgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGVtaXRSZXBseSh7IGNob2ljZTogdmFsdWUgfSk7XG4gICAgICAgICAgICAgICAgfSwgbnVsbCwgZGF0YS50aW1lb3V0IHx8IDApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdyaXZlcl90aWxlJzpcbiAgICAgICAgICAgICAgICBza2lsbFByb21wdFVJLmFza1JpdmVyVGlsZShkYXRhLmRlc2NyaXB0aW9uIHx8ICcnLCAocGFpU3RyLCBzZWF0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFpU3RyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbWl0UmVwbHkoeyBjaG9pY2U6IDAsIHBhaVN0cjogcGFpU3RyLCBzZWF0OiBzZWF0LCBpbmRleDogaW5kZXggfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbWl0UmVwbHkoeyBjaG9pY2U6IC0xLCBwYWlTdHI6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBkYXRhLnRpbWVvdXQgfHwgMCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2hhbmRfdGlsZSc6XG4gICAgICAgICAgICAgICAgc2tpbGxQcm9tcHRVSS5hc2tIYW5kVGlsZShkYXRhLmRlc2NyaXB0aW9uIHx8ICcnLCAocGFpU3RyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGVtaXRSZXBseSh7IHBhaVN0cjogcGFpU3RyIHx8IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgfSwgZGF0YS52YWxpZFRpbGVzIHx8IG51bGwsIGRhdGEudGltZW91dCB8fCAwKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnaGFuZF90aWxlcyc6XG4gICAgICAgICAgICAgICAgc2tpbGxQcm9tcHRVSS5waWNrSGFuZFRpbGVzKFxuICAgICAgICAgICAgICAgICAgICBkYXRhLmNvdW50IHx8IDEsXG4gICAgICAgICAgICAgICAgICAgIGRhdGEuZGVzY3JpcHRpb24gfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGRhdGEudGltZW91dCB8fCAxNTAwMCxcbiAgICAgICAgICAgICAgICAgICAgKHRpbGVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbWl0UmVwbHkoeyB0aWxlczogdGlsZXMgfHwgbnVsbCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YS52YWxpZFRpbGVzIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGRhdGEub3B0cyB8fCBudWxsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnaGFuZF90aWxlc19yYW5nZSc6XG4gICAgICAgICAgICAgICAgc2tpbGxQcm9tcHRVSS5waWNrSGFuZFRpbGVzUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIGRhdGEubWluQ291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5tYXhDb3VudCB8fCAxLFxuICAgICAgICAgICAgICAgICAgICBkYXRhLmRlc2NyaXB0aW9uIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkYXRhLnRpbWVvdXQgfHwgMTUwMDAsXG4gICAgICAgICAgICAgICAgICAgICh0aWxlcykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgZW1pdFJlcGx5KHsgdGlsZXM6IHRpbGVzIHx8IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGRhdGEudmFsaWRUaWxlcyB8fCBudWxsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAndGlsZV9wb3B1cCc6XG4gICAgICAgICAgICAgICAgc2tpbGxQcm9tcHRVSS5zaG93VGlsZVBvcHVwKGRhdGEudGl0bGUgfHwgJycsIGRhdGEudGlsZXMgfHwgW10sICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZW1pdFJlcGx5KHt9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnY2xlYXInOlxuICAgICAgICAgICAgICAgIHNraWxsUHJvbXB0VUkuY2xlYXIoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvKiDlkJHlkI7lhbzlrrnml6fniYjoh6rlrprkuYnnsbvlnosgKi9cbiAgICAgICAgICAgICAgICBfc2hvd0xlZ2FjeVNraWxsUHJvbXB0KGRhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5ZCR5ZCO5YW85a6577ya5pen54mI6Ieq5a6a5LmJIHByb21wdCDnsbvlnovvvIjov4fmuKHmnJ/kv53nlZnvvIlcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBfc2hvd0xlZ2FjeVNraWxsUHJvbXB0KGRhdGEpIHtcbiAgICAgICAgaWYgKCFza2lsbFByb21wdFVJKSByZXR1cm47XG5cbiAgICAgICAgbGV0IGVtaXRSZXBseSA9IChyZXBseSkgPT4ge1xuICAgICAgICAgICAgcmVwbHkgPSByZXBseSB8fCB7fTtcbiAgICAgICAgICAgIHJlcGx5LnByb21wdElkID0gZGF0YS5wcm9tcHRJZDtcbiAgICAgICAgICAgIHJlcGx5LnNraWxsSWQgPSBkYXRhLnNraWxsSWQ7XG4gICAgICAgICAgICBzb2NrLmVtaXQoJ1NLSUxMX1JFUExZXycgKyBkYXRhLnByb21wdElkLCByZXBseSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyog5Li05pe26KaG5bGC77ya5YWz6Zet5pen5by556qXICovXG4gICAgICAgIHNraWxsUHJvbXB0VUkuY2xlYXIoKTtcblxuICAgICAgICAvKiDlhZzlupXvvJrkvZzkuLogb3B0aW9ucyDlpITnkIYgKi9cbiAgICAgICAgaWYgKGRhdGEuY2hvaWNlcyAmJiBkYXRhLmNob2ljZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgb3B0aW9ucyA9IGRhdGEuY2hvaWNlcy5tYXAoKGMsIGkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGMgPT09ICdzdHJpbmcnKSByZXR1cm4geyBsYWJlbDogYywgdmFsdWU6IFN0cmluZyhpKSB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGxhYmVsOiBjLmxhYmVsIHx8IFN0cmluZyhjKSwgdmFsdWU6IFN0cmluZyhjLnZhbHVlICE9PSB1bmRlZmluZWQgPyBjLnZhbHVlIDogaSkgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2tpbGxQcm9tcHRVSS5hc2tPcHRpb25zKGRhdGEuZGVzY3JpcHRpb24gfHwgJycsIG9wdGlvbnMsICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLnByb21wdFR5cGUgPT09ICdyaXZlcl90aWxlJyAmJiB2YWx1ZSA9PT0gJy0xJykge1xuICAgICAgICAgICAgICAgICAgICBlbWl0UmVwbHkoeyBjaG9pY2U6IC0xLCBwYWlTdHI6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZW1pdFJlcGx5KHsgY2hvaWNlOiB2YWx1ZSB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgKiAg57uT5p2fXG4gICAgICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xuXG4gICAgZnVuY3Rpb24gZW5kKHBhaXB1KSB7XG4gICAgICAgIC8qIOmHjei/nuacn+mXtOS4jeWkhOeQhiBFTkTvvIzpgb/lhY3liIfmjaLliLAgZmlsZSDnlYzpnaIgKi9cbiAgICAgICAgaWYgKF9pc1JlY29ubmVjdGluZygpKSByZXR1cm47XG4gICAgICAgIHNvY2sucmVtb3ZlQWxsTGlzdGVuZXJzKCdHQU1FJyk7XG4gICAgICAgIGJnbVBsYXllci5zdG9wKCk7XG4gICAgICAgIGlmIChwYWlwdSkgZmlsZS5hZGQocGFpcHUsIDEwKTtcbiAgICAgICAgc2hvdygkKCcjZmlsZScpKTtcbiAgICAgICAgZmFkZUluKCQoJ2JvZHknKS5hdHRyKCdjbGFzcycsJ2ZpbGUnKSk7XG4gICAgICAgIGZpbGUucmVkcmF3KCk7XG4gICAgICAgICQoJyNmaWxlIGlucHV0W25hbWU9XCJyb29tX25vXCJdJykudmFsKCcnKTtcbiAgICB9XG5cbiAgICAvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICogIOinhOWImemAieaLqVxuICAgICAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cblxuICAgIGZvciAobGV0IGtleSBvZiBPYmplY3Qua2V5cyhwcmVzZXQpKSB7XG4gICAgICAgIGxldCBvcHQgPSAkKCc8b3B0aW9uPicpLnZhbChrZXkpLnRleHQoa2V5KTtcbiAgICAgICAgaWYgKGtleSA9PT0gJ+i2heiDveWKm+m6u+WwhicpIG9wdC5hdHRyKCdzZWxlY3RlZCcsIHRydWUpO1xuICAgICAgICAkKCdzZWxlY3RbbmFtZT1cInJ1bGVcIl0nKS5hcHBlbmQob3B0KTtcbiAgICB9XG4gICAgaWYgKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdNYWppYW5nLnJ1bGUnKSkge1xuICAgICAgICAkKCdzZWxlY3RbbmFtZT1cInJ1bGVcIl0nKS5hcHBlbmQoJCgnPG9wdGlvbj4nKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudmFsKCctJykudGV4dCgn6Ieq5a6a5LmJ6KeE5YiZJykpO1xuICAgIH1cblxuICAgICQoJyNmaWxlIGZvcm0ucm9vbScpLm9uKCdzdWJtaXQnLCAoZXYpPT57XG4gICAgICAgIGxldCByb29tID0gJCgnaW5wdXRbbmFtZT1cInJvb21fbm9cIl0nLCAkKGV2LnRhcmdldCkpLnZhbCgpO1xuICAgICAgICBzb2NrLmVtaXQoJ1JPT00nLCByb29tKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0pO1xuICAgICQoJyNyb29tIGZvcm0nKS5vbignc3VibWl0JywgKGV2KT0+e1xuICAgICAgICBsZXQgcm9vbSA9ICQoJ2lucHV0W25hbWU9XCJyb29tX25vXCJdJywgJChldi50YXJnZXQpKS52YWwoKTtcblxuICAgICAgICBsZXQgcnVsZSA9ICQoJ3NlbGVjdFtuYW1lPVwicnVsZVwiXScsICQoZXYudGFyZ2V0KSkudmFsKCk7XG4gICAgICAgIHJ1bGUgPSAhIHJ1bGUgICAgICA/IHByZXNldFsn6LaF6IO95Yqb6bq75bCGJ10gfHwge31cbiAgICAgICAgICAgICA6IHJ1bGUgPT0gJy0nID8gSlNPTi5wYXJzZShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ01hamlhbmcucnVsZScpfHwne30nKVxuICAgICAgICAgICAgIDogICAgICAgICAgICAgICBwcmVzZXRbcnVsZV07XG4gICAgICAgIHJ1bGUgPSBNYWppYW5nLnJ1bGUocnVsZSk7XG5cbiAgICAgICAgbGV0IHRpbWVyID0gJCgnaW5wdXRbbmFtZT1cInRpbWVyXCJdJywgJChldi50YXJnZXQpKS52YWwoKTtcbiAgICAgICAgdGltZXIgPSB0aW1lci5tYXRjaCgvKFxcZCspL2cpO1xuICAgICAgICBpZiAodGltZXIpIHRpbWVyID0gdGltZXIubWFwKHQ9Pit0KTtcblxuICAgICAgICBzb2NrLmVtaXQoJ1NUQVJUJywgcm9vbSwgcnVsZSwgdGltZXIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSk7XG4gICAgJCgnI3Jvb20gaW5wdXRbbmFtZT1cImJvdFwiXScpLm9uKCdjbGljaycsIChldik9PntcbiAgICAgICAgbGV0IHJvb20gPSAkKCdpbnB1dFtuYW1lPVwicm9vbV9ub1wiXScsICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJykpLnZhbCgpO1xuICAgICAgICBzb2NrLmVtaXQoJ0JPVCcsIHJvb20pO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSk7XG5cbiAgICAkKHdpbmRvdykub24oJ3Jlc2l6ZScsICgpPT5zY2FsZSgkKCcjYm9hcmQnKSwgJCgnI3NwYWNlJykpKTtcblxuICAgICQod2luZG93KS5vbignbG9hZCcsICgpPT5zZXRUaW1lb3V0KGluaXQsIDUwMCkpO1xuICAgIGlmIChsb2FkZWQpICQod2luZG93KS50cmlnZ2VyKCdsb2FkJyk7XG4gICAgLyog5YWc5bqV77ya5Zu+54mH5Y2z5L2/5rKh5Yqg6L295a6M77yM5pyA5aSa562JIDMg56eS5by65Yi25ZCv5Yqo77yM6YG/5YWN5Y2h5q27ICovXG4gICAgc2V0VGltZW91dCgoKT0+eyBpZiAoIXNvY2spIGluaXQoKTsgfSwgMzAwMCk7XG5cbiAgICAkKCcjdGl0bGUgLmxvZ2luIGZvcm0nKS5lYWNoKGZ1bmN0aW9uKCl7XG4gICAgICAgIGxldCBtZXRob2QgPSAkKHRoaXMpLmF0dHIoJ21ldGhvZCcpXG4gICAgICAgIGxldCB1cmwgICAgPSAkKHRoaXMpLmF0dHIoJ2FjdGlvbicpO1xuICAgICAgICBmZXRjaCh1cmwsIHsgbWV0aG9kOiBtZXRob2QsIHJlZGlyZWN0OiAnbWFudWFsJyB9KS50aGVuKHJlcyA9PntcbiAgICAgICAgICAgIGlmIChyZXMuc3RhdHVzID09IDQwNCkgaGlkZSgkKHRoaXMpKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59KTtcbiQod2luZG93KS5vbignbG9hZCcsICgpPT4gbG9hZGVkID0gdHJ1ZSk7XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=