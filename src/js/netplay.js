/*!
 *  電脳麻将: ネット対戦 v2.5.1
 *  + 超能力技能系统支持
 *
 *  Copyright(C) 2017 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/Majiang/blob/master/LICENSE
 */
"use strict";

const { hide, show, fadeIn, scale,
        setSelector, clearSelector  } = Majiang.UI.Util;

const preset = require('./conf/rule.json');

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
        /* 起名界面不显示断线遮罩 */
        if ($('#title .login').is(':visible')) return;
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
            /* 使用实际座位 myGameSeat（已在上面根据 qijia/jushu 计算） */
            let isFirstTime = voiceChars[myGameSeat] === null;
            voiceChars[myGameSeat] = kaiju.voice_char === 'none' ? null : kaiju.voice_char;
            if (isFirstTime) {
                let humanChar = voiceChars[myGameSeat];
                /* 排除玩家语音，剩余角色洗牌后依次分配给其他席位 */
                let available = VOICE_CHAR_LIST.filter(c => c !== humanChar);
                for (let i = available.length - 1; i > 0; i--) {
                    let j = Math.floor(Math.random() * (i + 1));
                    [available[i], available[j]] = [available[j], available[i]];
                }
                let aiIdx = 0;
                for (let i = 0; i < 4; i++) {
                    if (i !== myGameSeat) {
                        voiceChars[i] = available[aiIdx % available.length];
                        aiIdx++;
                    }
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
