/*!
 *  電脳麻将 v2.5.1
 *
 *  Copyright(C) 2017 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/Majiang/blob/master/LICENSE
 */
"use strict";

const { hide, show, fadeIn, scale,
        setSelector, clearSelector  } = Majiang.UI.Util;

let loaded;

$(function(){

    let game;
    const pai   = Majiang.UI.pai($('#loaddata'));
    const audio = Majiang.UI.audio($('#loaddata'));
const bgmPlayer = new Majiang.UI.BgmPlayer();

    const analyzer = (kaiju)=>{
        $('body').addClass('analyzer');
        return new Majiang.UI.Analyzer($('#board > .analyzer'), kaiju, pai,
                                        ()=>$('body').removeClass('analyzer'));
    };
    const viewer = (paipu)=>{
        $('#board .controller').addClass('paipu')
        $('body').attr('class','board');
        scale($('#board'), $('#space'));
        const _viewer
                = new Majiang.UI.Paipu(
                        $('#board'), paipu, pai, audio, 'Majiang.pref',
                        ()=>show($('#file')) && fadeIn($('body').attr('class','file')),
                        analyzer);
        delete _viewer._view.dummy_name;
        return _viewer;
    };
    const stat = (paipu_list)=>{
        fadeIn($('body').attr('class','stat'));
        return new Majiang.UI.PaipuStat($('#stat'), paipu_list,
                        ()=>show($('#file')) && fadeIn($('body').attr('class','file')));
    };
    const file = new Majiang.UI.PaipuFile($('#file'), 'Majiang.game',
                                            viewer, stat);
    const rule = (() => {
        let storedRule = JSON.parse(localStorage.getItem('Majiang.rule')||'{}');
        if (storedRule['音声キャラ'] === undefined) storedRule['音声キャラ'] = 'yiji';
        if (storedRule['BGM'] === undefined) storedRule['BGM'] = '竹取之语.mp3';
        return Majiang.rule(storedRule);
    })();

    /* 技能系统 */
    const characters = require('../skill/characters_skills');
    const { SkillManager, AssignmentMode } = require('../skill/index');

    /* 可用的语音角色目录名 */
    const VOICE_CHAR_LIST = ['gongyongxiao', 'yiji', 'tianjiangyi', 'yuancunhe', 'gongyongzhao'];

    function start() {
        let players = [ new Majiang.UI.Player($('#board'), pai, audio) ];
        for (let i = 1; i < 4; i++) {
            players[i] = new Majiang.AI();
        }
        game = new Majiang.Game(players, end, rule);
        let board = new Majiang.UI.Board($('#board .board'),
                                        pai, audio, game.model, rule);
        game.view = board;

        /* AI 语音随机分配，0号座席使用规则中设定的语音 */
        {
            let voiceChars = [];
            voiceChars[0] = rule['音声キャラ'] === 'none' ? null : rule['音声キャラ'];
            for (let i = 1; i < 4; i++) {
                voiceChars[i] = VOICE_CHAR_LIST[Math.floor(Math.random() * VOICE_CHAR_LIST.length)];
            }
            board.setVoiceChars(voiceChars);
        }

        /* BGM 播放 */
        if (rule['BGM']) {
            bgmPlayer.setTrack(rule['BGM']);
            bgmPlayer.play();
        } else {
            bgmPlayer.stop();
        }

        /* 初始化技能管理器 */
        let sm = new SkillManager({
            characters: characters,
            rule: rule,
        });
        game.skillManager = sm;

        /* 初始化技能提示 UI 组件 */
        let skillPrompt = new Majiang.UI.SkillPrompt($('#board'), pai);
        game.setSkillPrompt(skillPrompt);

        /* 初始化轻量提示框 UI 组件 */
        let toast = new Majiang.UI.Toast(pai);
        game.setToast(toast);

        /* 发牌角色卡 */
        const modeMap = {
            'draw4': AssignmentMode.DRAW_4, 'draw2': AssignmentMode.DRAW_2,
            'draft': AssignmentMode.DRAFT, 'random': AssignmentMode.RANDOM,
            'free': AssignmentMode.FREE
        };

        function showCharacterSelector() {
            let mode = modeMap[rule['角色分配方式']] || AssignmentMode.DRAW_4;
            /* 重置角色池，让玩家可以重新选择 */
            sm.getPool().resetForHand();
            let dealResult = sm.dealCharacters(mode);

            let selector = new Majiang.UI.CharacterSelector(
                sm, dealResult, 0,
                () => {
                    /* 角色选择完成，更新模型中的角色信息并恢复游戏 */
                    game._model.character = sm.getAllCharacters();
                    if (game._view) game._view.redraw();

                    /* 诊断：打印角色-座位完整映射 */
                    sm.dumpCharacterMapping({
                        qijia: game._model.qijia,
                        jushu: game._model.jushu || 0,
                        seatToPlIdx: game._model.seatToPlIdx,
                        viewpoint: game._view ? game._view.viewpoint : 0,
                        label: '单机-角色选择完成',
                    });

                    game.resumeFromCharacterSelect();
                },
                game.seatToPlayerIdx(game._model.qijia),
                game
            );
            selector.show();
        }

        $('#board .controller').removeClass('paipu')
        $('body').attr('class','board');
        hide($('#file'));
        scale($('#board'), $('#space'));

        new Majiang.UI.GameCtl($('#board'), 'Majiang.pref', game, game._view);

        /* 生成 qijia（庄家位置），在角色选择前决定 */
        let qijia = Math.floor(Math.random() * 4);

        /* 先开牌配牌，然后暂停插入角色选择 */
        game.kaiju(qijia);
        game._view.paipu = game._paipu;
        game.pauseBeforeZimo(() => showCharacterSelector());

        /* 设置每小局结束后重新选择角色 */
        game.onHandStart(() => showCharacterSelector());
    }

    function end(paipu) {
        bgmPlayer.stop();
        if (paipu) file.add(paipu, 10);
        show($('#file'));
        fadeIn($('body').attr('class','file'));
        file.redraw();
    }

    $('#file .start').on('click', start);

    $(window).on('resize', ()=>scale($('#board'), $('#space')));

    /* 主菜单：点击"开始对战"直接进入游戏 */
    $('#menu-start').on('click', function(){
        $('body').removeClass('menu');
        $('#main-menu').removeClass('active');
        clearSelector('title');
        start();
    });

    setTimeout(()=>{
        $(window).on('load', function(){
            if (! file.isEmpty) {
                $('body').removeClass('menu');
                $('#main-menu').removeClass('active');
                return end();
            }
        });
        if (loaded) $(window).trigger('load');
    }, 1000);
});

$(window).on('load', ()=> loaded = true);
