/**
 * Debug Aislinn_Wishart - exact batch test counting logic
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

const charId = 'Aislinn_Wishart';
const skillActs = {};

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

// Same counting as batch test
if (!skillActs[charId]) skillActs[charId] = {};
let origAddActionLog = game._add_action_log.bind(game);
game._add_action_log = function(text, seat) {
    let m = text.match(/发动了技能「(.+?)·(.+?)」/);
    if (m) {
        let desc = m[2].replace(/;+$/, '').trim();
        skillActs[charId][desc] = (skillActs[charId][desc] || 0) + 1;
        console.log('[LOG] ' + text);
    }
    return origAddActionLog(text, seat);
};

console.log('Starting...');
let result;
try {
    result = game.do_sync();
} catch(e) {
    console.error('Error:', e.message);
}
console.log('Skill activations:', JSON.stringify(skillActs));
