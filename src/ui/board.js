/*
 *  Majiang.UI.Board
 */
"use strict";

const $ = require('jquery');

const Shoupai    = require('./shoupai');
const Shan       = require('./shan');
const He         = require('./he');
const HuleDialog = require('./dialog');
const summary    = require('./summary');
const InfoPanel  = require('./info_panel');

const { hide, show, fadeIn, fadeOut } = require('./fadein');
const VoicePlayer = require('./voice_player');

const class_name = ['main','xiajia','duimian','shangjia'];
const feng_hanzi = ['東','南','西','北'];
const shu_hanzi  = ['一','二','三','四'];
const dummy_name = ['自己','下家','对家','上家'];

const say_text   = { chi:   '吃',
                     peng:  '碰',
                     gang:  '杠',
                     lizhi: '立直',
                     rong:  '荣和',
                     zimo:  '自摸'  };

class Score {

    constructor(root, model) {
        this._model = model;
        this._view = {
            root:      root,
            jushu:     $('.jushu', root),
            changbang: $('.changbang', root),
            lizhibang: $('.lizhibang', root),
            defen:     [],
        };
        this._viewpoint = 0;
        hide(this._view.root);
    }

    redraw(viewpoint) {

        if (viewpoint != null) this._viewpoint = viewpoint;

        show(this._view.root);

        let jushu = feng_hanzi[this._model.zhuangfeng]
                  + shu_hanzi[this._model.jushu] + '局';
        this._view.jushu.text(jushu);
        this._view.changbang.text(this._model.changbang);
        this._view.lizhibang.text(this._model.lizhibang);

        for (let l = 0; l < 4; l++) {
            let id = this._model.seatToPlIdx[l];
            let defen = '' + this._model.defen[id];
            defen = defen.replace(/(\d)(\d{3})$/,'$1,$2');
            defen = `${feng_hanzi[l]}: ${defen}`;
            let c = class_name[(id + 4 - this._viewpoint) % 4];
            this._view.defen[l] = $(`.defen .${c}`, this._root);
            this._view.defen[l].removeClass('lunban').text(defen);
            if (l == this._model.lunban) this._view.defen[l].addClass('lunban');
        }
        return this;
    }

    update() {
        let lunban = this._model.lunban < 0 ? 0 : this._model.lunban;
        for (let l = 0; l < 4; l++) {
            if (l == lunban) this._view.defen[l].addClass('lunban');
            else             this._view.defen[l].removeClass('lunban');
        }
        return this;
    }
}

const Board = module.exports = class Board {

    constructor(root, pai, audio, model, rule) {
        this._root  = root;
        this._model = model;
        this._pai   = pai;
        this._rule  = rule || {};

        /* 每座席一个语音播放器（按 seat 索引：0=東/1=南/2=西/3=北） */
        this._voice = [];
        for (let l = 0; l < 4; l++) {
            this._voice[l] = new VoicePlayer(null);
        }
        /**
         * _view: UI 元素集合，其中 shoupai/he/say 按 seat 索引（与 model 一致）
         * seat=0: 東家（屏幕下方），seat=1: 南家（屏幕右方），
         * seat=2: 西家（屏幕上方），seat=3: 北家（屏幕左方）。
         * 实际屏幕位置由 _rotateView() 根据俯视点旋转决定。
         */
        this._view  = {
            score:   new Score($('.score', root), model),
            shan:    null,
            shoupai: [],
            he:      [],
            say:     [],
            dialog:  null,
            summary: hide($('> .summary', root)),
            kaiju:   hide($('> .kaiju', root)),
            charDisplay: $('.character-display', root),
        };
        this._say = [];
        this._lizhi = false;

        this.viewpoint = 0;
        this.sound_on  = true
        this.open_shoupai;
        this.open_he;
        this.dummy_name = null;
        this.no_player_name;

        this._timeout_id;

        /* 信息面板（牌山 + 牌局日志） */
        this._info_panel = new InfoPanel(this._pai);
        $('#board .info-btn').on('click', () => {
            this._info_panel.show(this._model, this._paipu,
                this._wallSnapshot, this._actionLog);
        });

        $('> .player', this._root).removeClass('disconnect');

        $(window).on('resize', ()=>this._view.shoupai.forEach(s=>s.adjust()));
    }

    set paipu(val) { this._paipu = val }

    /** 设置每座席的语音角色 */
    setVoiceChars(chars) {
        for (let l = 0; l < 4; l++) {
            this._voice[l].setCharacter(chars[l] || null);
        }
    }

    redraw() {

        this._timeout_id = clearTimeout(this._timeout_id);
        hide(this._view.summary);
        hide(this._view.kaiju);

        this._view.score.redraw(this.viewpoint);

        /* 显示角色头像 */
        this._renderCharacterDisplay();

        this._view.shan = new Shan($('.score .shan', this._root), this._pai,
                                    this._model.shan).redraw();

        for (let l = 0; l < 4; l++) {
            let id   = this._model.seatToPlIdx[l];
            let c    = class_name[(id + 4 - this.viewpoint) % 4];

            if (this.no_player_name) {
                hide($(`> .player.${c}`, this._root));
            }
            else {
                let name = (this.dummy_name == null)
                                ? this._model.player[id].replace(/\n.*$/,'')
                                : dummy_name[(4 + id - this.dummy_name) % 4];
                show($(`> .player.${c}`, this._root).text(name));
            }

            let open = this._model.seatToPlIdx[l] == this.viewpoint;
            this._view.shoupai[l]
                    = new Shoupai(show($(`.shoupai.${c}`, this._root)),
                                    this._pai, this._model.shoupai[l])
                        .redraw(open || this.open_shoupai).adjust();

            this._view.he[l]
                    = new He(show($(`.he.${c}`, this._root)),
                                    this._pai, this._model.he[l])
                        .redraw(this.open_he);
            $(`.he.${c}`, this._root).attr('data-seat', l);

            this._view.say[l] = hide($(`.say.${c}`, this._root).text(''));
            this._say[l] = null;
        }

        this._lunban = this._model.lunban;
        this._view.score.update();

        this._view.dialog
            = new HuleDialog($('.hule-dialog', this._root), this._pai,
                            this._model, this.viewpoint).hide();

        return this;
    }

    update(data = {}) {

        if (this._lunban >= 0 && this._lunban != this._model.lunban) {
            if (this._say[this._lunban]) {
                fadeOut(this._view.say[this._lunban]);
                this._say[this._lunban] = null;
            }
            else {
                hide(this._view.say[this._lunban].text(''));
            }
            if (this._lizhi) {
                this._view.score.redraw();
                this._lizhi = false;
            }
            this._view.he[this._lunban].redraw();
            this._view.shoupai[this._lunban].redraw();
        }

        if (   (this._say[this._lunban] == 'lizhi')
            || (this._say[this._lunban] == 'chi'   && ! data.fulou)
            || (this._say[this._lunban] == 'peng'  && ! data.fulou)
            || (this._say[this._lunban] == 'gang'
                            && !(data.fulou || data.gang || data.kaigang)))
        {
            fadeOut(this._view.say[this._lunban]);
            this._say[this._lunban] = null;
        }

        if (data.zimo) {
            this._view.shan.update();
            this._view.shoupai[data.zimo.l].redraw().adjust();
        }
        else if (data.dapai) {
            this._view.shoupai[data.dapai.l].dapai(data.dapai.p);
            this._view.he[data.dapai.l].dapai(data.dapai.p, data.dapai.hidden);
            this._view.he[data.dapai.l].redraw();
            this._lizhi = data.dapai.p.slice(-1) == '*';
        }
        else if (data.fulou) {
            this._view.shoupai[data.fulou.l].redraw().adjust();
        }
        else if (data.gang) {
            this._view.shoupai[data.gang.l].redraw().adjust();
        }
        else if (data.gangzimo) {
            this._view.shan.update();
            this._view.shoupai[data.gangzimo.l].redraw().adjust();
        }
        else if (data.kaigang) {
            this._view.shan.redraw();
        }
        else if (data.hule) {
            this.hule(data.hule);
        }
        else if (data.pingju) {
            this.pingju(data.pingju);
        }
        else {
            this._view.score.redraw();
        }

        this._lunban = this._model.lunban;
        if (this._lunban >= 0) this._view.score.update();

        return this;
    }

    hule(hule) {

        for (let l = 0; l < 4; l++) {
            fadeOut(this._view.say[l]);
            this._say[l] = null;
        }

        this._timeout_id = setTimeout(()=>{
            this._view.shoupai[hule.l].redraw(true);

            /* 渐进式展示役种 + 语音同步 */
        if (this.sound_on && hule.hupai && hule.hupai.length) {
            this._progressiveHuleDisplay(hule).catch(() => {
                this._view.dialog.hule(hule);
            });
        } else {
            this._view.dialog.hule(hule);
        }
        }, 400);
    }

    /**
     * 渐进式和了展示：役种区默认为空，逐条追加役种 + 播放对应语音
     */
    async _progressiveHuleDisplay(hule) {
        let dialog = this._view.dialog;
        let voice  = this._voice[hule.l];

        /* 先出面板（役种区为空） */
        dialog.huleStart(hule);

        /* 预处理：检测场风+自风配对（同一风同时是场风和自风 → 连风） */
        let hupai = hule.hupai;
        let windPairs = {};  // { '東': { idx: [firstIdx, secondIdx] }, ... }
        for (let i = 0; i < hupai.length; i++) {
            let m = hupai[i].name.match(/^(?:场风|自风)\s*(.)/);
            if (m) {
                let wind = m[1];
                if (!windPairs[wind]) windPairs[wind] = { idx: [] };
                windPairs[wind].idx.push(i);
            }
        }

        /* 逐条处理 */
        for (let i = 0; i < hupai.length; i++) {
            let h = hupai[i];
            let key;

            /* 场风/自风配对检测：同风双役 → 第一条静音，第二条播放 double 版本 */
            let wm = h.name.match(/^(?:场风|自风)\s*(.)/);
            if (wm && windPairs[wm[1]] && windPairs[wm[1]].idx.length === 2) {
                let pair = windPairs[wm[1]];
                if (i === pair.idx[0]) {
                    key = null;  // 第一条风只显示不念
                } else {
                    key = 'double' + Board.FANPAI_MAP[wm[1]];
                }
            } else {
                key = this._fanToVoiceKey(h.name, h.fanshu);
            }

            dialog.addFan(h.name, h.fanshu);
            try {
                if (key) {
                    await voice.playFanAsync(key);
                } else {
                    await new Promise(r => setTimeout(r, 400));
                }
            } catch (e) {
            }
        }

        /* 播放得点语音 */
        let endKey = this._gameEndKey(hule);
        if (endKey) {
            try { await voice.playGameEndAsync(endKey); } catch (e) {}
        }

        /* 显示得点 */
        dialog.addDefen();
    }

    /**
     * 根据 hule 得点计算局终语音键
     */
    _gameEndKey(hule) {
        if (hule.damanguan) {
            let m = Math.round(hule.defen / (hule.l == 0 ? 6 : 4) / 8000);
            if (m > 6) m = 6;
            if (m > 1) return 'yiman' + m;
            return 'yiman1';
        }
        let manguan = hule.defen / (hule.l == 0 ? 6 : 4) / 2000;
        if (manguan >= 3)   return 'sanbeiman';
        if (manguan >= 2)   return 'beiman';
        if (manguan >= 1.5) return 'tiaoman';
        if (manguan >= 1)   return 'manguan';
        return null;
    }

    pingju(pingju) {

        for (let l = 0; l < 4; l++) {
            fadeOut(this._view.say[l]);
            this._say[l] = null;
        }

        if (this.sound_on) {
            this._playPingjuVoice(pingju);
        }

        let duration = 0;
        if (pingju.name.match(/^三家和/)) {
            duration = 400;
        }
        else {
            this._view.he[this._lunban].redraw();
            this._view.shoupai[this._lunban].redraw();
        }

        this._timeout_id = setTimeout(()=>{
            for (let l = 0; l < 4; l++) {
                let open = this._model.seatToPlIdx[l] == this.viewpoint
                            || pingju.shoupai[l];
                this._view.shoupai[l].redraw(open);
            }
            this._view.dialog.pingju(pingju);
        }, duration);
    }

    /* ── 流局语音播放 ── */
    _playPingjuVoice(pingju) {

        const PINGJU_VOICE_MAP = {
            '九種九牌': 'jiuzhongjiupai',
            '四風連打': 'sifenglianda',
            '四家立直': 'sijializhi',
            '四開槓':   'sigangliuju',
            '三家和':   'sanjiahe',
        };

        let seat = this._model.seatToPlIdx.indexOf(this.viewpoint);

        let key = PINGJU_VOICE_MAP[pingju.name];
        if (key) {
            this._voice[seat].playGameEnd(key);
            return;
        }

        if (pingju.name === '流局满贯') {
            this._voice[seat].playFan('liujumanguan');
            return;
        }

        /* 荒牌平局 → 按主视角听牌/不听牌播放 */
        if (pingju.shoupai[seat]) {
            this._voice[seat].playGameEnd('tingpai');
        } else {
            this._voice[seat].playGameEnd('noting');
        }
    }

    say(name, l) {
        if (this.sound_on) {
            this._voice[l].play(name);
        }
        show(this._view.say[l].text(say_text[name]));
        this._say[l] = name;
    }

    /* ── 役种名语音键映射 ── */
    _fanToVoiceKey(name, fanshu) {
        /* 直接映射 */
        if (Board.FAN_VOICE_MAP[name]) return Board.FAN_VOICE_MAP[name];

        /* 场风/自风 */
        let windMatch = name.match(/(?:场风|自风)\s*(.)/);
        if (windMatch) return Board.FANPAI_MAP[windMatch[1]] || null;

        /* 役牌 */
        let fanpaiMatch = name.match(/役牌\s*(.)/);
        if (fanpaiMatch) return Board.FANPAI_MAP[fanpaiMatch[1]] || null;

        /* 宝牌/里宝牌/红宝牌 都使用宝牌语音（根据数量） */
        if (name === '宝牌' || name === '里宝牌' || name === '红宝牌') {
            let n = Math.min(fanshu, 13);
            if (n > 0) return 'dora' + n;
            return null;
        }
    }

    kaiju(viewpoint) {
        if (viewpoint != null) this.viewpoint = viewpoint;
        if (this.no_player_name) return;
        hide($('> *', this._root));
        let title = $('<span>').text(this._model.title).html()
                                            .replace(/\n/g,'<br>');
        $('.title', this._view.kaiju).html(title);
        for (let id = 0; id < 4; id++) {
            let c = class_name[(4 - this.viewpoint + id) % 4];
            let name = (this.dummy_name == null)
                            ? this._model.player[id].replace(/\n.*$/,'')
                            : dummy_name[(4 + id - this.dummy_name) % 4];
            $(`.player .${c}`, this._view.kaiju).text(name);
        }
        show(this._view.kaiju);

        /* 渲染角色头像 */
        this._renderCharacterDisplay();
    }

    /**
     * 渲染所有玩家的角色头像与名字（位于各自手牌左方向中心）
     */
    _renderCharacterDisplay() {
        let characters = this._model.character || [];
        let displays = this._view.charDisplay;
        /* 联机模式：netplay 已预旋转数组（[0]=自己），直接按顺序渲染 */
        let useNetplayRotation = this._model._netplayRotated === true;

        for (let i = 0; i < 4; i++) {
            /* 人类席位 → 显示位置(自家0下家1対面2上家3) */
            let seat;
            if (useNetplayRotation) {
                seat = i;
            } else {
                let humanSeat = this._model.seatToPlIdx
                                ? this._model.seatToPlIdx.indexOf(0) : 0;
                seat = (i + humanSeat) % 4;
            }
            let charInfo = characters[seat];
            let display = displays.eq(i);

            if (!charInfo || !charInfo.id) {
                hide(display);
                continue;
            }

            display.empty();
            let avatar = $('<img>').addClass('char-avatar')
                                   .attr('src', 'resources/头像/' + charInfo.card)
                                   .data('player', seat);
            let name = $('<div>').addClass('char-name').text(charInfo.name);
            display.append(avatar, name);
            show(display);
        }

        /* 绑定技能浮窗 */
        this._bindSkillPopup();
    }

    /**
     * 点击角色头像弹出技能浮窗
     */
    _bindSkillPopup() {
        let self = this;
        /* 移除旧事件，避免重复绑定 */
        $('.character-display .char-avatar', this._root).off('click.skillpopup');

        $('.character-display .char-avatar', this._root).on('click.skillpopup', function(e) {
            e.stopPropagation();
            let playerIdx = $(this).data('player');
            let charInfo = self._model.character ? self._model.character[playerIdx] : null;
            if (!charInfo || !charInfo.id) return;

            /* 移除旧弹窗 */
            $('.skill-popup').remove();

            let popup = $('<div>').addClass('skill-popup');
            let nameEl = $('<div>').addClass('skill-popup-name').text(charInfo.name);

            popup.append(nameEl);

            /* 获取技能文本 */
            if (charInfo.skills && charInfo.skills.length) {
                for (let s of charInfo.skills) {
                    popup.append($('<div>').addClass('skill-popup-item').text(s));
                }
            }

            /* 居中显示 */
            $('body').append(popup);

            /* 点击其他地方关闭 */
            setTimeout(() => {
                $(document).on('click.skillpopup-close', function(ev) {
                    if (!$(ev.target).closest('.skill-popup').length) {
                        $('.skill-popup').remove();
                        $(document).off('click.skillpopup-close');
                    }
                });
            }, 0);
        });
    }

    summary(paipu) {
        this._timeout_id = clearTimeout(this._timeout_id);
        this._view.dialog.hide();
        this._view.summary.scrollTop(0);
        let name;
        if (this.dummy_name != null) {
            name = [];
            for (let id = 0; id < 4; id++) {
                name[id] = dummy_name[(4 + id - this.dummy_name) % 4];
            }
        }
        if (paipu) fadeIn(summary(this._view.summary, paipu, this.viewpoint,
                                  name));
        else       hide(this._view.summary);
    }

    players(players) {
        for (let id = 0; id < 4; id++) {
            let c = class_name[(id + 4 - this.viewpoint) % 4];
            if (players[id])
                    $(`> .player.${c}`, this._root).removeClass('disconnect');
            else    $(`> .player.${c}`, this._root).addClass('disconnect');
        }
    }
}

/* ── 静态：役种名 → 语音键映射 ── */
Board.FAN_VOICE_MAP = {
    '立直':       'liqi',
    '两立直':     'dliqi',
    '一发':       'yifa',
    '海底捞月':   'haidi',
    '河底捞鱼':   'hedi',
    '岭上开花':   'lingshang',
    '抢杠':       'qianggang',
    '天和':       'tianhu',
    '地和':       'dihu',
    '门前清自摸和':'zimo',
    '平和':       'pinghu',
    '断幺九':     'duanyao',
    '一杯口':     'yibeikou',
    '三色同顺':   'sansetongshun',
    '一气通贯':   'yiqitongguan',
    '混全带幺九': 'hunquandaiyaojiu',
    '七对子':     'qiduizi',
    '对对和':     'duiduihu',
    '三暗刻':     'sananke',
    '三杠子':     'sangangzi',
    '三色同刻':   'sansetongke',
    '混老头':     'hunlaotou',
    '小三元':     'xiaosanyuan',
    '混一色':     'hunyise',
    '纯全带幺九': 'chunquandaiyaojiu',
    '二杯口':     'erbeikou',
    '清一色':     'qingyise',
    '国士无双':   'guoshiwushuang',
    '国士无双十三面':'guoshishisanmian',
    '四暗刻':     'sianke',
    '四暗刻单骑': 'siankedanqi',
    '大三元':     'dasanyuan',
    '大四喜':     'dasixi',
    '小四喜':     'xiaosixi',
    '字一色':     'ziyise',
    '绿一色':     'lvyise',
    '清老头':     'qinglaotou',
    '四杠子':     'sigangzi',
    '九莲宝灯':   'jiulianbaodeng',
    '纯正九莲宝灯':'chunzhengjiulianbaodeng',
    '流局满贯':   'liujumanguan',
};

Board.FANPAI_MAP = {
    '東': 'dong', '南': 'nan', '西': 'xi', '北': 'bei',
    '白': 'bai',  '发': 'fa',  '中': 'zhong',
};
