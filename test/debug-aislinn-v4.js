/**
 * Aislinn 崩溃诊断 v4 - 直接拦截 Shoupai.prototype.zimo
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

/* 拦截 Shoupai.zimo 在原型上 */
const Shoupai = Majiang.Shoupai;
const _origShoupaiZimo = Shoupai.prototype.zimo;
Shoupai.prototype.zimo = function(p, check) {
    if (this._zimo) {
        console.log(`[SHOUPAI_ZIMO_ALREADY_SET] step=${++stepId} p=${p} check=${check} _zimo=${this._zimo}`);
        console.trace('Stack:');
    }
    return _origShoupaiZimo.call(this, p, check);
};

function run() {
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

    /* 拦截 _finish_zimo 来看看传入参数 */
    const _origFinishZimo = game._finish_zimo.bind(game);
    game._finish_zimo = function(lunban, pai, opts) {
        console.log(`[FINISH_ZIMO] step=${++stepId} seat=${lunban} pai=${pai} opts=${JSON.stringify(opts)} _zimo=${this._model.shoupai[lunban] ? this._model.shoupai[lunban]._zimo : 'nil'}`);
        return _origFinishZimo(lunban, pai, opts);
    };

    /* 也拦截 Game.zimo */
    const _origZimo = game.zimo.bind(game);
    game.zimo = function(opts) {
        let isExtra = opts && opts.isExtraTurn;
        console.log(`[GAME_ZIMO] step=${++stepId} isExtra=${!!isExtra} lunban=${this._model.lunban} _status=${this._status}`);
        return _origZimo(opts);
    };

    try {
        game.do_sync();
        console.log(`[OK] Game completed`);
    } catch(e) {
        console.log(`[CRASH] ${e.message}`);
        console.log(e.stack.split('\n').slice(0, 8).join('\n'));
    }
}

run();
