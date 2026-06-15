/*
 *  Majiang.UI.BgmPlayer — 对局 BGM 播放器
 *
 *  API:
 *    new BgmPlayer()            — 创建播放器（初始无曲目）
 *    bp.setTrack(filename)      — 设置曲目（空字符串或 null 表示不启用）
 *    bp.play()                  — 开始循环播放
 *    bp.pause()                 — 暂停
 *    bp.stop()                  — 停止并重置
 *    bp.setVolume(v)            — 设置音量 (0~1)
 */
'use strict';

const BASE_PATH = 'resources/music/';

module.exports = class BgmPlayer {

    constructor() {
        this._audio = null;
        this._track = null;
        this._volume = 0.3;
    }

    /**
     * 设置曲目（传入文件名或 null）
     */
    setTrack(filename) {
        if (this._track === filename) return;

        let wasPlaying = this._audio && !this._audio.paused;
        this.stop();

        this._track = filename || null;

        if (this._track) {
            this._audio = new Audio(BASE_PATH + this._track);
            this._audio.volume = this._volume;
            this._audio.loop = true;
            if (wasPlaying) {
                this._audio.play().catch(() => {});
            }
        }
    }

    /**
     * 开始播放
     */
    play() {
        if (!this._audio) return;
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
    }

    /**
     * 暂停
     */
    pause() {
        if (!this._audio) return;
        this._audio.pause();
    }

    /**
     * 停止并重置
     */
    stop() {
        if (!this._audio) return;
        this._audio.pause();
        this._audio.currentTime = 0;
    }

    /**
     * 设置音量
     */
    setVolume(v) {
        this._volume = v;
        if (this._audio) this._audio.volume = v;
    }
};
