/**
 * 追踪暗切技能触发循环 - Test_Character 隔离测试 v2
 */
'use strict';

const Module = require('module');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
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

let players = [new AI(), new AI(), new AI(), new AI()];
let rule = Majiang.rule();
let game = new Majiang.Game(players, () => {}, rule);
game._sync = true;
game.speed = 0;
game.wait = 0;

for (let p of players) {
    if (p._debug) p._debug = false;
    if (p._log) p._log = () => {};
}
Majiang.Game._debugHule = false;

/* All 4 players use Test_Character */
let sm = new SkillManager({ characters, rule });
for (let i = 0; i < 4; i++) {
    sm._activeCharacters[i] = 'Test_Character';
    sm._activatePassiveSkills(i, 'Test_Character');
}
game.skillManager = sm;

/* Counters */
let logCount = 0;
let dapaiCount = 0;
let lastLogAt = 0;

let origLog = game._add_action_log.bind(game);
game._add_action_log = function(text, seat) {
    logCount++;
    if (logCount % 20 === 0) {
        console.log('  [log#' + logCount + '] ' + text + ' (syncStep=' + syncStep + ')');
    }
    return origLog(text, seat);
};

let origDapai = game.dapai.bind(game);
game.dapai = function(dp) {
    dapaiCount++;
    return origDapai(dp);
};

/* Monitor sync loop */
let syncStep = 0;
game.do_sync = function() {
    this._sync = true;
    this._stepCount = 0;
    this.kaiju();

    for (;;) {
        this._stepCount++;
        syncStep++;
        if (syncStep > 100000) {
            console.error('!!! SYNC LOOP at step ' + syncStep + ' status=' + this._status);
            break;
        }
        if (this._stepCount > 100000) break;

        if (this._status === 'kaiju') this.reply_kaiju();
        else if (this._status === 'qipai') this.reply_qipai();
        else if (this._status === 'zimo') this.reply_zimo();
        else if (this._status === 'dapai') this.reply_dapai();
        else if (this._status === 'fulou') this.reply_fulou();
        else if (this._status === 'gang') this.reply_gang();
        else if (this._status === 'gangzimo') this.reply_zimo();
        else if (this._status === 'hule') this.reply_hule();
        else if (this._status === 'pingju') this.reply_pingju();
        else break;
    }
    return this._callback(this._paipu);
};

try {
    game.do_sync();
} catch(e) {
    console.error('ERROR:', e.message);
}
console.log('DONE: syncSteps=' + syncStep +
    ' logCount=' + logCount +
    ' dapaiCount=' + dapaiCount);
