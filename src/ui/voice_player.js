/*
 *  Majiang.UI.VoicePlayer — 角色语音播放器
 *
 *  根据选择的角色，将对局操作映射到对应角色的语音 MP3 文件并播放。
 *
 *  API:
 *    new VoicePlayer(charName)   — 创建播放器，charName 为角色目录名，null 表示不启用
 *    vp.play(name)               — 播放操作语音
 *    vp.playFan(fanKey)          — 播放役种语音（不等待）
 *    vp.playFanAsync(fanKey)     — 播放役种语音，返回 Promise，播完 resolve
 *    vp.setCharacter(charName)   — 切换角色
 */
'use strict';

/* 操作 → 语音文件名映射 */
const ACTION_VOICE_MAP = {
    chi:    'act_chi',
    peng:   'act_pon',
    gang:   'act_kan',
    rong:   'act_ron',
    zimo:   'act_tumo',
    lizhi:  'act_rich',
};

const BASE_PATH = 'resources/voice/';

module.exports = class VoicePlayer {

    constructor(charName) {
        this._charName = null;
        this._cache = {};           // { 'gongyongxiao/act_chi': <Audio> }
        this.setCharacter(charName);
    }

    setCharacter(charName) {
        if (!charName) {
            this._charName = null;
            return;
        }
        this._charName = charName;
    }

    /**
     * 获取 Audio 元素（缓存复用）
     */
    _getAudio(filename) {
        if (!this._charName) return null;

        let cacheKey = this._charName + '/' + filename;
        if (this._cache[cacheKey]) return this._cache[cacheKey];

        let src = BASE_PATH + this._charName + '/' + filename + '.mp3';
        let audio = new Audio(src);
        audio.volume = 0.3;
        audio.preload = 'auto';
        this._cache[cacheKey] = audio;
        return audio;
    }

    /**
     * 播放操作语音
     */
    play(name) {
        let filename = ACTION_VOICE_MAP[name];
        if (!filename) return;

        let audio = this._getAudio(filename);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }

    /**
     * 播放役种语音（不等待）
     */
    playFan(fanKey) {
        if (!fanKey) return;
        let audio = this._getAudio('fan_' + fanKey);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }

    /**
     * 播放役种语音，返回 Promise，在语音播放完成后 resolve。
     * 如果该役种无语音，立即 resolve。
     */
    playFanAsync(fanKey) {
        return new Promise((resolve) => {
            if (!fanKey) { resolve(); return; }
            let audio = this._getAudio('fan_' + fanKey);
            if (!audio) { resolve(); return; }
            audio.currentTime = 0;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
        });
    }

    /**
     * 播放局终语音
     */
    playGameEnd(name) {
        if (!name) return;
        let audio = this._getAudio('gameend_' + name);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }

    /**
     * 播放局终语音（异步，播完 resolve）
     */
    playGameEndAsync(name) {
        return new Promise((resolve) => {
            if (!name) { resolve(); return; }
            let audio = this._getAudio('gameend_' + name);
            if (!audio) { resolve(); return; }
            audio.currentTime = 0;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
        });
    }

    /**
     * 播放终局一位语音
     */
    playGameTop() {
        let audio = this._getAudio('game_top');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }
};
