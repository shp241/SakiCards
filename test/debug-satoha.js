/**
 * Debug script for Tsujigaito_Satoha skill triggering
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
const { SkillManager } = require('../src/skill/index');

// Override to trace trigger
const origTrigger = SkillManager.prototype.trigger;
SkillManager.prototype.trigger = function(timing, context) {
    let result = origTrigger.call(this, timing, context);
    if (result.actions && result.actions.length > 0) {
        for (let a of result.actions) {
            console.log('[TRACE] trigger timing=' + timing + ' skill=' + a.skill.id + ' seat=' + a.seat);
        }
    }
    return result;
};

// Hook _executeOptionalSkill
const origExecOpt = Majiang.Game.prototype._executeOptionalSkill;
Majiang.Game.prototype._executeOptionalSkill = function(action, baseContext, onComplete, options) {
    console.log('[TRACE] _executeOptionalSkill called for skill=' + (action.skill ? action.skill.id : '?') + ' seat=' + action.seat);
    return origExecOpt.call(this, action, baseContext, onComplete, options);
};

// Run one game
let game = new Majiang.Game({});
let sim = new AI.Simulator('Tsujigaito_Satoha');
sim.start(game, { games: 1, silent: true });
let res = game.do_match();
console.log('Done, error:', res ? res.error : 'none');
