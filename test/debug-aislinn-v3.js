/**
 * Aislinn 崩溃诊断 v3 - 精确追踪 _zimo 的设值/清除
 */
'use strict';

const Module = require('module');
const path = require('path');
const originalResolveFilename = Module._resolveFilename;
const ROOT = path.resolve(__dirname, '..');

Module._resolveFilename = function(request, parent, isMain, options) {
    const aliases = {
        '@kobalab/majiang-core': path.resolve(ROOT, 'src/core/index.js'),
        '@kobalab/majiang-ai': path.resolve(ROOT, 'src/ai/index.js'),
    };
    if (aliases[request]) return aliases[request];
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

const Majiang = require('@kobalab/majiang-core');
const AI = require('@kobalab/majiang-ai');
const characters = require('../src/skill/characters_skills');
const { SkillManager } = require('../src/skill/index');

let stepId = 0;

function zimoState(game, seat) {
    let shoupai = game._model.shoupai[seat];
    return shoupai ? shoupai._zimo : 'nil';
}

function run() {
    // 只放一个 Aislinn 在 seat 0
    let players = [new AI(), new AI(), new AI(), new AI()];
    let rule = Majiang.rule();
    let game = new Majiang.Game(players, () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    let sm = new SkillManager({ characters, rule });
    sm._activeCharacters[0] = 'Aislinn_Wishart';
    sm._activatePassiveSkills(0, 'Aislinn_Wishart');
    game.skillManager = sm;

    /* 拦截 Game.zimo */
    const _origZimo = game.zimo.bind(game);
    game.zimo = function(opts) {
        let isExtra = opts && opts.isExtraTurn;
        let model = this._model;
        let lunban = model.lunban;
        let zimo0 = zimoState(this, 0);
        let zimo1 = zimoState(this, 1);
        console.log(`[ZIMO_ENTER] step=${++stepId} isExtra=${!!isExtra} lunban=${lunban} _zimo[0]=${zimo0} _zimo[1]=${zimo1} _status=${this._status}`);
        return _origZimo(opts);
    };

    /* 拦截 _finish_zimo */
    const _origFinishZimo = game._finish_zimo.bind(game);
    game._finish_zimo = function(lunban, pai, opts) {
        let model = this._model;
        let zimo = model.shoupai[lunban] ? model.shoupai[lunban]._zimo : 'nil';
        if (zimo) {
            console.log(`[BUG_DETECTED] step=${++stepId} _finish_zimo: seat=${lunban} pai=${pai} _zimo_already=${zimo} hand=${model.shoupai[lunban].toString()}`);
            console.log(`  _extra_turn=${JSON.stringify(this._extra_turn)} _extra_chain=${this._extra_chain_remaining}`);
            console.trace('Stack:');
        }
        return _origFinishZimo(lunban, pai, opts);
    };

    /* 拦截 _finish_zimo 后记录 */
    const origCallPlayers = game.call_players.bind(game);
    game.call_players = function(type, msg, timeout) {
        let model = this._model;
        if (type === 'zimo') {
            for (let l = 0; l < 4; l++) {
                let z = model.shoupai[l] ? model.shoupai[l]._zimo : 'nil';
                console.log(`[AFTER_ZIMO] step=${++stepId} seat=${l} _zimo=${z} hand=${model.shoupai[l] ? model.shoupai[l].toString() : 'nil'}`);
            }
        }
        return origCallPlayers(type, msg, timeout);
    };

    /* 拦截 dapai */
    const _origDapai = game.dapai.bind(game);
    game.dapai = function(dp) {
        let model = this._model;
        let z0 = zimoState(this, 0), z1 = zimoState(this, 1),
            z2 = zimoState(this, 2), z3 = zimoState(this, 3);
        console.log(`[DAPAI] step=${++stepId} tile=${dp} lunban=${model.lunban} _zimo=[${z0},${z1},${z2},${z3}]`);
        return _origDapai(dp);
    };

    /* 拦截 AFTER_DISCARD 触发 */
    const _origReplyDapai = game.reply_dapai.bind(game);
    game.reply_dapai = function(data) {
        let model = this._model;
        console.log(`[REPLY_DAPAI] step=${++stepId} lunban=${model.lunban} _extra_turn=${JSON.stringify(this._extra_turn)} _extra_chain=${this._extra_chain_remaining}`);
        return _origReplyDapai(data);
    };

    try {
        game.do_sync();
        console.log(`[OK] Game completed in ${stepId} steps`);
    } catch(e) {
        console.log(`[CRASH] step=${++stepId} ${e.message}`);
        let stack = e.stack.split('\n').slice(0, 10).join('\n');
        console.log(stack);
        // 打印当前 _zimo 状态
        let m = game._model;
        for (let l = 0; l < 4; l++) {
            let s = m.shoupai[l];
            console.log(`  seat=${l} shoupai=${s ? s.toString() : 'nil'} _zimo=${s ? s._zimo : 'nil'}`);
        }
    }
}

// 只跑一次
stepId = 0;
run();
