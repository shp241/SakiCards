/**
 * 调试 Jindai_Komaki 技能不触发的原因 v2
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
const { TimingPoints } = require('../src/skill/triggers');
const tileUtils = require('../src/effect/tile-utils');

const charId = 'Jindai_Komaki';

let players = [new AI(), new AI(), new AI(), new AI()];
let rule = Majiang.rule();
let game = new Majiang.Game(players, () => {}, rule);
game._sync = true;
game.speed = 0;
game.wait = 0;

let sm = new SkillManager({ characters, rule });
for (let i = 0; i < 4; i++) {
    sm._activeCharacters[i] = charId;
    sm._activatePassiveSkills(i, charId);
}
game.skillManager = sm;

// Override trigger to log FIRST DISCARD only
let origTrigger = SkillManager.prototype.trigger;
let firstDiscardsLogged = 0;
SkillManager.prototype.trigger = function(timing, context) {
    let result = origTrigger.call(this, timing, context);
    
    if (timing === TimingPoints.AFTER_DISCARD && firstDiscardsLogged < 8) {
        let seat = context.player;
        let he = context.game._model.he[seat];
        let count = tileUtils.countHePai(he);
        let riverCount = count - 1;
        if (riverCount === 0 && this._activeCharacters[seat] === charId) {
            firstDiscardsLogged++;
            console.log('[AFTER_DISCARD first] seat=' + seat + ' count=' + count + ' riverCount=' + riverCount + ' actions=' + (result.actions ? result.actions.length : 0));
            if (result.actions) {
                result.actions.forEach((a, i) => {
                    console.log('  [' + i + '] seat=' + a.seat + ' skill=' + (a.skill ? a.skill.id : 'none') + ' part=' + !!a.part);
                });
            }
        }
    }
    return result;
};

let origAdd = game._add_action_log.bind(game);
game._add_action_log = function(text, seat) {
    if (text.includes('发动了技能')) {
        console.log('[LOG] ' + text);
    }
    return origAdd(text, seat);
};

console.log('Starting Jindai_Komaki game...');
try {
    let result = game.do_sync();
    console.log('Game done');
} catch(e) {
    console.error('Error:', e.message);
}
