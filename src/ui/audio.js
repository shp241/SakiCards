/*
 *  Majiang.UI.audio
 */
"use strict";

const $ = require('jquery');

module.exports = function(loaddata) {

    const audio = {};

    $('audio', loaddata).each(function(){
        let name = $(this).data('name');
        audio[name] = $(this);
    });

    return function(name){
        if (! audio[name]) {
            return { play() {}, pause() {}, currentTime: 0 };
        }
        let new_audio = audio[name].clone()[0];
        let volume    = audio[name].attr('volume');
        if (volume) {
            new_audio.oncanplaythrough = ()=>{
                new_audio.volume = + volume;
                new_audio.oncanplaythrough = null;
            };
        }
        return new_audio;
    }
}
