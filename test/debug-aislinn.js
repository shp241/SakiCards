/**
 * Debug Aislinn_Wishart skill 1 condition failures
 */
'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');
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
const { TimingPoints } = require('../src/skill/triggers');
const tileUtils = require('../src/effect/tile-utils');

const charId = 'Aislinn_Wishart';

// Override trigger to trace condition evaluation
const origTrigger = SkillManager.prototype.trigger;
SkillManager.prototype.trigger = function(timing, context) {
    if (timing === TimingPoints.AFTER_DISCARD) {
        let model = context.game._model;
        let seat = context.seat;
        let he = model.he[seat];
        let paiCount = he ? tileUtils.countHePai(he) : 0;
        let row = tileUtils.heRow(paiCount);
        let dapai = context.dapai || '';
        let isExtra = context.game._extra_turn;
        let isChain = typeof context.game._extra_chain_remaining === 'number' && context.game._extra_chain_remaining >= 0;

        console.log('[TRACE] AFTER_DISCARD condition check: seat=' + seat +
            ' player=' + context.player +
            ' dapai=' + dapai +
            ' paiCount=' + paiCount +
            ' row=' + row +
            ' extraTurn=' + !!isExtra +
            ' chainRemaining=' + context.game._extra_chain_remaining);
    }
    let result = origTrigger.call(this, timing, context);
    if (timing === TimingPoints.AFTER_DISCARD && result.actions && result.actions.length > 0) {
        console.log('[TRACE] AFTER_DISCARD actions: ' + result.actions.length +
            ' skills=' + result.actions.map(a => a.skill.id).join(','));
    }
    return result;
};

// Run
let rule = Majiang.rule();
let players = [new AI(), new AI(), new AI(), new AI()];
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

console.log('Starting game...');
let result;
try {
    result = game.do_sync();
} catch(e) {
    console.error('Error:', e.message);
}
console.log('Done, result:', result ? 'ok' : 'none');
