/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/*!****************************!*\
  !*** ./src/js/autoplay.js ***!
  \****************************/
/*!
 *  電脳麻将: 自動対戦 v2.5.1
 *
 *  Copyright(C) 2017 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/Majiang/blob/master/LICENSE
 */


const { hide, show, fadeIn, scale,
        setSelector, clearSelector  } = Majiang.UI.Util;

let loaded;

$(function(){

    let game;
    const pai   = Majiang.UI.pai($('#loaddata'));
    const audio = Majiang.UI.audio($('#loaddata'));

    const rule = Majiang.rule(
                    JSON.parse(localStorage.getItem('Majiang.rule')||'{}'));

    let open_shoupai = false;
    let open_he      = false;

    function start() {
        if (game) {
            open_shoupai = game._view.open_shoupai;
            open_he      = game._view.open_he;
        }
        let players = [];
        for (let i = 0; i < 4; i++) {
            players[i] = new Majiang.AI();
        }
        game = new Majiang.Game(players, start, rule);
        game.view = new Majiang.UI.Board($('#board .board'),
                                        pai, audio, game.model, rule);
        game.wait  = 5000;
        game._model.title
            = game._model.title.replace(/^[^\n]*/, $('title').text());
        game._view.open_shoupai = open_shoupai;
        game._view.open_he      = open_he;

        $('body').attr('class','board');
        scale($('#board'), $('#space'));

        $(window).off('keyup').on('keyup', (ev)=>{
            if (ev.key == ' ') {
                if (gamectl.stoped) gamectl.start();
                else                gamectl.stop();
                game.handler = ()=> gamectl.stop();
            }
            else if (ev.key == 's') gamectl.shoupai();
            else if (ev.key == 'h') gamectl.he();
            return false;
        });
        $('#board .board').off('click').on('click', ()=>{
            if (gamectl.stoped) gamectl.start();
            else                gamectl.stop();
            game.handler = ()=> gamectl.stop();
        });
        $('#board .board > .shoupai')
            .off('click', '.pai')
            .on('click', '.pai', ()=>gamectl.shoupai());
        $('#board .board > .he')
            .off('click', '.pai')
            .on('click', '.pai', ()=>gamectl.he());

        const gamectl = new Majiang.UI.GameCtl($('#board'), 'Majiang.pref',
                                                game, game._view);
        game.kaiju();
    }

    $(window).on('resize', ()=>scale($('#board'), $('#space')));

    $(window).on('load', function(){
        start();
    });
    if (loaded) $(window).trigger('load');
});

$(window).on('load', ()=> loaded = true);

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0b3BsYXktMi41LjEuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNhOztBQUViLFFBQVE7QUFDUixzQ0FBc0M7O0FBRXRDOztBQUVBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLHdFQUF3RTs7QUFFeEU7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsT0FBTztBQUMvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBLENBQUM7O0FBRUQiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9tYWppYW5nLy4vc3JjL2pzL2F1dG9wbGF5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qIVxuICogIOmbu+iEs+m6u+Wwhjog6Ieq5YuV5a++5oimIHYyLjUuMVxuICpcbiAqICBDb3B5cmlnaHQoQykgMjAxNyBTYXRvc2hpIEtvYmF5YXNoaVxuICogIFJlbGVhc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxuICogIGh0dHBzOi8vZ2l0aHViLmNvbS9rb2JhbGFiL01hamlhbmcvYmxvYi9tYXN0ZXIvTElDRU5TRVxuICovXG5cInVzZSBzdHJpY3RcIjtcblxuY29uc3QgeyBoaWRlLCBzaG93LCBmYWRlSW4sIHNjYWxlLFxuICAgICAgICBzZXRTZWxlY3RvciwgY2xlYXJTZWxlY3RvciAgfSA9IE1hamlhbmcuVUkuVXRpbDtcblxubGV0IGxvYWRlZDtcblxuJChmdW5jdGlvbigpe1xuXG4gICAgbGV0IGdhbWU7XG4gICAgY29uc3QgcGFpICAgPSBNYWppYW5nLlVJLnBhaSgkKCcjbG9hZGRhdGEnKSk7XG4gICAgY29uc3QgYXVkaW8gPSBNYWppYW5nLlVJLmF1ZGlvKCQoJyNsb2FkZGF0YScpKTtcblxuICAgIGNvbnN0IHJ1bGUgPSBNYWppYW5nLnJ1bGUoXG4gICAgICAgICAgICAgICAgICAgIEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ01hamlhbmcucnVsZScpfHwne30nKSk7XG5cbiAgICBsZXQgb3Blbl9zaG91cGFpID0gZmFsc2U7XG4gICAgbGV0IG9wZW5faGUgICAgICA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gc3RhcnQoKSB7XG4gICAgICAgIGlmIChnYW1lKSB7XG4gICAgICAgICAgICBvcGVuX3Nob3VwYWkgPSBnYW1lLl92aWV3Lm9wZW5fc2hvdXBhaTtcbiAgICAgICAgICAgIG9wZW5faGUgICAgICA9IGdhbWUuX3ZpZXcub3Blbl9oZTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgcGxheWVycyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgICAgICAgICAgcGxheWVyc1tpXSA9IG5ldyBNYWppYW5nLkFJKCk7XG4gICAgICAgIH1cbiAgICAgICAgZ2FtZSA9IG5ldyBNYWppYW5nLkdhbWUocGxheWVycywgc3RhcnQsIHJ1bGUpO1xuICAgICAgICBnYW1lLnZpZXcgPSBuZXcgTWFqaWFuZy5VSS5Cb2FyZCgkKCcjYm9hcmQgLmJvYXJkJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFpLCBhdWRpbywgZ2FtZS5tb2RlbCwgcnVsZSk7XG4gICAgICAgIGdhbWUud2FpdCAgPSA1MDAwO1xuICAgICAgICBnYW1lLl9tb2RlbC50aXRsZVxuICAgICAgICAgICAgPSBnYW1lLl9tb2RlbC50aXRsZS5yZXBsYWNlKC9eW15cXG5dKi8sICQoJ3RpdGxlJykudGV4dCgpKTtcbiAgICAgICAgZ2FtZS5fdmlldy5vcGVuX3Nob3VwYWkgPSBvcGVuX3Nob3VwYWk7XG4gICAgICAgIGdhbWUuX3ZpZXcub3Blbl9oZSAgICAgID0gb3Blbl9oZTtcblxuICAgICAgICAkKCdib2R5JykuYXR0cignY2xhc3MnLCdib2FyZCcpO1xuICAgICAgICBzY2FsZSgkKCcjYm9hcmQnKSwgJCgnI3NwYWNlJykpO1xuXG4gICAgICAgICQod2luZG93KS5vZmYoJ2tleXVwJykub24oJ2tleXVwJywgKGV2KT0+e1xuICAgICAgICAgICAgaWYgKGV2LmtleSA9PSAnICcpIHtcbiAgICAgICAgICAgICAgICBpZiAoZ2FtZWN0bC5zdG9wZWQpIGdhbWVjdGwuc3RhcnQoKTtcbiAgICAgICAgICAgICAgICBlbHNlICAgICAgICAgICAgICAgIGdhbWVjdGwuc3RvcCgpO1xuICAgICAgICAgICAgICAgIGdhbWUuaGFuZGxlciA9ICgpPT4gZ2FtZWN0bC5zdG9wKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChldi5rZXkgPT0gJ3MnKSBnYW1lY3RsLnNob3VwYWkoKTtcbiAgICAgICAgICAgIGVsc2UgaWYgKGV2LmtleSA9PSAnaCcpIGdhbWVjdGwuaGUoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNib2FyZCAuYm9hcmQnKS5vZmYoJ2NsaWNrJykub24oJ2NsaWNrJywgKCk9PntcbiAgICAgICAgICAgIGlmIChnYW1lY3RsLnN0b3BlZCkgZ2FtZWN0bC5zdGFydCgpO1xuICAgICAgICAgICAgZWxzZSAgICAgICAgICAgICAgICBnYW1lY3RsLnN0b3AoKTtcbiAgICAgICAgICAgIGdhbWUuaGFuZGxlciA9ICgpPT4gZ2FtZWN0bC5zdG9wKCk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjYm9hcmQgLmJvYXJkID4gLnNob3VwYWknKVxuICAgICAgICAgICAgLm9mZignY2xpY2snLCAnLnBhaScpXG4gICAgICAgICAgICAub24oJ2NsaWNrJywgJy5wYWknLCAoKT0+Z2FtZWN0bC5zaG91cGFpKCkpO1xuICAgICAgICAkKCcjYm9hcmQgLmJvYXJkID4gLmhlJylcbiAgICAgICAgICAgIC5vZmYoJ2NsaWNrJywgJy5wYWknKVxuICAgICAgICAgICAgLm9uKCdjbGljaycsICcucGFpJywgKCk9PmdhbWVjdGwuaGUoKSk7XG5cbiAgICAgICAgY29uc3QgZ2FtZWN0bCA9IG5ldyBNYWppYW5nLlVJLkdhbWVDdGwoJCgnI2JvYXJkJyksICdNYWppYW5nLnByZWYnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2FtZSwgZ2FtZS5fdmlldyk7XG4gICAgICAgIGdhbWUua2FpanUoKTtcbiAgICB9XG5cbiAgICAkKHdpbmRvdykub24oJ3Jlc2l6ZScsICgpPT5zY2FsZSgkKCcjYm9hcmQnKSwgJCgnI3NwYWNlJykpKTtcblxuICAgICQod2luZG93KS5vbignbG9hZCcsIGZ1bmN0aW9uKCl7XG4gICAgICAgIHN0YXJ0KCk7XG4gICAgfSk7XG4gICAgaWYgKGxvYWRlZCkgJCh3aW5kb3cpLnRyaWdnZXIoJ2xvYWQnKTtcbn0pO1xuXG4kKHdpbmRvdykub24oJ2xvYWQnLCAoKT0+IGxvYWRlZCA9IHRydWUpO1xuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9