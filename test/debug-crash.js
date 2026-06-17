const Shoupai = require('../src/core/shoupai.js');
const fs = require('fs');
let stepId = 0;

const log = (msg) => fs.appendFileSync('/tmp/debug-v5.log', msg + '\n');

// Intercept zimo to trace set/clear
const origZimo = Shoupai.prototype.zimo;
const origDapai = Shoupai.prototype.dapai;

Shoupai.prototype.zimo = function(p, check) {
    let oldZimo = this._zimo;
    let result = origZimo.call(this, p, check);
    let handKey = this.toString().slice(0, 20);
    log(`[ZIMO] step=${++stepId} oldZimo=${oldZimo} newZimo=${this._zimo} p=${p} hand=${handKey}`);
    return result;
};

Shoupai.prototype.dapai = function(p, check) {
    let oldZimo = this._zimo;
    if (check !== false && !this._zimo) {
        log(`[DAPAI_CRASH] step=${++stepId} _zimo=${this._zimo} p=${p} hand=${this.toString().slice(0,30)}`);
        log(new Error().stack);
        throw new Error([this, p]);
    }
    let result = origDapai.call(this, p, check);
    log(`[DAPAI] step=${++stepId} oldZimo=${oldZimo} newZimo=${this._zimo} p=${p} hand=${this.toString().slice(0,20)}`);
    return result;
};

// Also intercept _finish_zimo
const Game = require('../src/core/game.js');
const origFinishZimo = Game.prototype._finish_zimo;
Game.prototype._finish_zimo = function(lunban, pai, opts) {
    let model = this._model;
    let oldZimo = model.shoupai[lunban]?._zimo;
    log(`[_FINISH_ZIMO] lunban=${lunban} pai=${pai} oldZimo=${oldZimo} hand=${model.shoupai[lunban]?.toString().slice(0,25)} opts=${JSON.stringify(opts)}`);
    return origFinishZimo.call(this, lunban, pai, opts);
};

// Intercept _safeDapai
const origSafeDapai = Game.prototype._safeDapai;
Game.prototype._safeDapai = function(dapai) {
    let model = this._model;
    let lunban = model.lunban;
    log(`[_SAFE_DAPAI] dapai=${dapai} lunban=${lunban} _zimo=${model.shoupai[lunban]?._zimo}`);
    return origSafeDapai.call(this, dapai);
};

try { require('./batch-test.js'); } catch(e) { log('[ERROR] ' + e.message); }
