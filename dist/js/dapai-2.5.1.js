/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/*!*************************!*\
  !*** ./src/js/dapai.js ***!
  \*************************/
/*!
 *  電脳麻将: 何切る解答機 v2.5.1
 *
 *  Copyright(C) 2017 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/Majiang/blob/master/LICENSE
 */


const { hide, show, fadeIn, fadeOut, scale } = Majiang.UI.Util;
const minipaipu = Majiang.AI.minipaipu;

let pai, audio;

function init(fragment) {

    if (fragment) {

        let [ baseinfo, heinfo ] = fragment.split(/&/);

        let xun, param = baseinfo.split(/\//);
        if (param.length && param[param.length-1][0] == '+') xun = param.pop();
        let [ paistr, zhuangfeng, menfeng, baopai, hongpai ] = param;
        baopai  = (baopai   || '').split(/,/);
        hongpai = ! hongpai;

        $('input[name="paistr"]').val(paistr);
        $('select[name="zhuangfeng"]').val(+zhuangfeng||0);
        $('select[name="menfeng"]').val(+menfeng||0);
        $('select[name="xun"]').val(+xun||7);
        for (let i = 0; i < baopai.length; i++) {
            $('input[name="baopai"]').eq(i).val(baopai[i]);
        }
        $('input[name="hongpai"]').prop('checked', hongpai);

        if (heinfo != null) {
            $('form input[name="heinfo"]').prop('checked', true)
                                          .trigger('change');
            let hestr = heinfo.split(/\//);
            for (let l = 0; l < 4; l++) {
                $('input[name="hestr"]').eq(l).val(hestr[l]);
            }
        }

        submit();
    }
    else {
        $('input[name="paistr"]').val('m123p1234789s338s8').focus();
        $('input[name="baopai"]').eq(0).val('s3');
    }
}

function submit(ev) {

    hide($('.shan, .shoupai, .analyzer', $('#demo')));

    let paistr = $('input[name="paistr"]').val();
    if (! paistr) return false;

    let zhuangfeng = + $('select[name="zhuangfeng"]').val();
    let menfeng    = + $('select[name="menfeng"]').val();
    let xun        = + $('select[name="xun"]').val();
    let baopai     = $('input[name="baopai"]').map((i,n)=>$(n).val()).toArray()
                                    .filter(p => Majiang.Shoupai.valid_pai(p));
    let hongpai    = $('input[name="hongpai"]').prop('checked');

    if (! baopai.length) baopai = ['z2'];

    let heinfo = $('input[name="hestr"]').map((i,n)=>$(n).val()).toArray();

    if (! hongpai) {
        paistr = paistr.replace(/0/,'5');
        baopai = baopai.map(p => p.replace(/0/,'5'));
        heinfo = heinfo.map(hestr => hestr.replace(/0/,'5'));
    }

    let baseinfo = { paistr: paistr, zhuangfeng: zhuangfeng, menfeng: menfeng,
                     baopai: baopai, hongpai: hongpai, xun: xun };

    let analyzer;
    let kaiju = { id: 0, rule: Majiang.rule(), qijia: 0 };

    if ($('form input[name="heinfo"]').prop('checked')) {

        analyzer = new Majiang.UI.Analyzer($('#board >.analyzer'), kaiju, pai);

        heinfo = minipaipu(analyzer, baseinfo, heinfo, true);

        let view = new Majiang.UI.Board($('#board .board'),
                                        pai, audio, analyzer.model, {});
        view.no_player_name = true;
        view.open_he        = true;
        view.redraw();

        let zimo = analyzer.shoupai._zimo
        if (zimo) {
            if (zimo.length == 2)
                    analyzer.action_zimo({ l: menfeng, p: zimo });
            else    analyzer.action_fulou({ l: menfeng, m: zimo });
        }
        else {
            let l = analyzer.model.lunban;
            if (l != -1) {
                let p = analyzer.model.he[l]._pai.slice(-1)[0];
                analyzer.action_dapai({ l: l, p: p });
            }
            else {
                analyzer.action_qipai();
            }
        }
        $('body').attr('class','board analyzer');
        scale($('#board'), $('#space'));
    }
    else {
        analyzer = new Majiang.UI.Analyzer($('#demo >.analyzer'), kaiju, pai);

        minipaipu(analyzer, baseinfo);

        new Majiang.UI.Shan($('#demo .shan'), pai, analyzer.shan).redraw();
        new Majiang.UI.Shoupai($('#demo .shoupai'), pai, analyzer.shoupai)
                                                                .redraw(true);

        let zimo = analyzer.shoupai._zimo
        if (zimo) {
            if (zimo.length == 2)
                    analyzer.action_zimo({ l: menfeng, p: zimo });
            else    analyzer.action_fulou({ l: menfeng, m: zimo });
        }
        fadeIn($('.shan, .shoupai, .analyzer', $('#demo')));

        heinfo = null;
    }

    paistr = analyzer.shoupai.toString();
    $('input[name="paistr"]').val(paistr);

    baopai = analyzer.shan.baopai;
    for (let i = 0; i < 5; i++) {
        $('input[name="baopai"]').eq(i).val(baopai[i] || '');
    }

    if (heinfo) {
        for (let i = 0; i < 4; i++)  {
            $('input[name="hestr"]').eq(i).val(heinfo[i]);
        }
    }

    let fragment = '#'
                 + [ paistr, zhuangfeng, menfeng, baopai.join(',')].join('/');
    if (! hongpai) fragment += '/1';

    if (heinfo) fragment += '&' + heinfo.join('/');
    else        fragment += '/+' + xun;

    history.replaceState('', '', fragment)

    return false;
}

function set_controller(root) {
    root.addClass('paipu');
    $(window).on('keyup', (ev)=>{
        if (ev.key == 'q' || ev.key == 'Escape') {
            if ($('body').attr('class') != 'demo')
                                    $('body').attr('class','demo');
        }
    });
    hide($('> img', root));
    show($('> img.exit', root).on('click', ()=>$('body').attr('class','demo')));
}

$(function(){

    pai = Majiang.UI.pai('#loaddata');
    audio = Majiang.UI.audio('#loaddata');

    $('form input[name="heinfo"]').on('change', function(){
        if ($(this).prop('checked')) {
            show($('form .heinfo'));
            hide($('form .xun'));
        }
        else {
            hide($('form .heinfo'));
            show($('form .xun'));
        }
    });
    hide($('form .heinfo'));

    $('form').on('submit', submit);

    $('form').on('reset', function(){
        hide($('.shan, .shoupai, .analyzer', $('#demo')));
        hide($('form .heinfo'));
        $('form input[name="paistr"]').focus();
    });

    $(window).on('resize', ()=>scale($('#board'), $('#space')));

    set_controller($('#board .controller'));

    let fragment = location.hash.replace(/^#/,'');
    init(fragment);
});

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGFwYWktMi41LjEuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNhOztBQUViLFFBQVEscUNBQXFDO0FBQzdDOztBQUVBOztBQUVBOztBQUVBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsbUJBQW1CO0FBQzNDO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDRCQUE0QixPQUFPO0FBQ25DO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLHFCQUFxQjtBQUNyQjs7QUFFQTtBQUNBLGtCQUFrQjs7QUFFbEI7O0FBRUE7O0FBRUE7O0FBRUE7QUFDQSxzRUFBc0U7QUFDdEU7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLDJDQUEyQyxxQkFBcUI7QUFDaEUsNENBQTRDLHFCQUFxQjtBQUNqRTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esd0NBQXdDLFlBQVk7QUFDcEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLDJDQUEyQyxxQkFBcUI7QUFDaEUsNENBQTRDLHFCQUFxQjtBQUNqRTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBLG9CQUFvQixPQUFPO0FBQzNCO0FBQ0E7O0FBRUE7QUFDQSx3QkFBd0IsT0FBTztBQUMvQjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLOztBQUVMOztBQUVBOztBQUVBO0FBQ0E7QUFDQSxDQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vbWFqaWFuZy8uL3NyYy9qcy9kYXBhaS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiFcbiAqICDpm7vohLPpurvlsIY6IOS9leWIh+OCi+ino+etlOapnyB2Mi41LjFcbiAqXG4gKiAgQ29weXJpZ2h0KEMpIDIwMTcgU2F0b3NoaSBLb2JheWFzaGlcbiAqICBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqICBodHRwczovL2dpdGh1Yi5jb20va29iYWxhYi9NYWppYW5nL2Jsb2IvbWFzdGVyL0xJQ0VOU0VcbiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmNvbnN0IHsgaGlkZSwgc2hvdywgZmFkZUluLCBmYWRlT3V0LCBzY2FsZSB9ID0gTWFqaWFuZy5VSS5VdGlsO1xuY29uc3QgbWluaXBhaXB1ID0gTWFqaWFuZy5BSS5taW5pcGFpcHU7XG5cbmxldCBwYWksIGF1ZGlvO1xuXG5mdW5jdGlvbiBpbml0KGZyYWdtZW50KSB7XG5cbiAgICBpZiAoZnJhZ21lbnQpIHtcblxuICAgICAgICBsZXQgWyBiYXNlaW5mbywgaGVpbmZvIF0gPSBmcmFnbWVudC5zcGxpdCgvJi8pO1xuXG4gICAgICAgIGxldCB4dW4sIHBhcmFtID0gYmFzZWluZm8uc3BsaXQoL1xcLy8pO1xuICAgICAgICBpZiAocGFyYW0ubGVuZ3RoICYmIHBhcmFtW3BhcmFtLmxlbmd0aC0xXVswXSA9PSAnKycpIHh1biA9IHBhcmFtLnBvcCgpO1xuICAgICAgICBsZXQgWyBwYWlzdHIsIHpodWFuZ2ZlbmcsIG1lbmZlbmcsIGJhb3BhaSwgaG9uZ3BhaSBdID0gcGFyYW07XG4gICAgICAgIGJhb3BhaSAgPSAoYmFvcGFpICAgfHwgJycpLnNwbGl0KC8sLyk7XG4gICAgICAgIGhvbmdwYWkgPSAhIGhvbmdwYWk7XG5cbiAgICAgICAgJCgnaW5wdXRbbmFtZT1cInBhaXN0clwiXScpLnZhbChwYWlzdHIpO1xuICAgICAgICAkKCdzZWxlY3RbbmFtZT1cInpodWFuZ2ZlbmdcIl0nKS52YWwoK3podWFuZ2Zlbmd8fDApO1xuICAgICAgICAkKCdzZWxlY3RbbmFtZT1cIm1lbmZlbmdcIl0nKS52YWwoK21lbmZlbmd8fDApO1xuICAgICAgICAkKCdzZWxlY3RbbmFtZT1cInh1blwiXScpLnZhbCgreHVufHw3KTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYW9wYWkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICQoJ2lucHV0W25hbWU9XCJiYW9wYWlcIl0nKS5lcShpKS52YWwoYmFvcGFpW2ldKTtcbiAgICAgICAgfVxuICAgICAgICAkKCdpbnB1dFtuYW1lPVwiaG9uZ3BhaVwiXScpLnByb3AoJ2NoZWNrZWQnLCBob25ncGFpKTtcblxuICAgICAgICBpZiAoaGVpbmZvICE9IG51bGwpIHtcbiAgICAgICAgICAgICQoJ2Zvcm0gaW5wdXRbbmFtZT1cImhlaW5mb1wiXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICAgICAgbGV0IGhlc3RyID0gaGVpbmZvLnNwbGl0KC9cXC8vKTtcbiAgICAgICAgICAgIGZvciAobGV0IGwgPSAwOyBsIDwgNDsgbCsrKSB7XG4gICAgICAgICAgICAgICAgJCgnaW5wdXRbbmFtZT1cImhlc3RyXCJdJykuZXEobCkudmFsKGhlc3RyW2xdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHN1Ym1pdCgpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgJCgnaW5wdXRbbmFtZT1cInBhaXN0clwiXScpLnZhbCgnbTEyM3AxMjM0Nzg5czMzOHM4JykuZm9jdXMoKTtcbiAgICAgICAgJCgnaW5wdXRbbmFtZT1cImJhb3BhaVwiXScpLmVxKDApLnZhbCgnczMnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN1Ym1pdChldikge1xuXG4gICAgaGlkZSgkKCcuc2hhbiwgLnNob3VwYWksIC5hbmFseXplcicsICQoJyNkZW1vJykpKTtcblxuICAgIGxldCBwYWlzdHIgPSAkKCdpbnB1dFtuYW1lPVwicGFpc3RyXCJdJykudmFsKCk7XG4gICAgaWYgKCEgcGFpc3RyKSByZXR1cm4gZmFsc2U7XG5cbiAgICBsZXQgemh1YW5nZmVuZyA9ICsgJCgnc2VsZWN0W25hbWU9XCJ6aHVhbmdmZW5nXCJdJykudmFsKCk7XG4gICAgbGV0IG1lbmZlbmcgICAgPSArICQoJ3NlbGVjdFtuYW1lPVwibWVuZmVuZ1wiXScpLnZhbCgpO1xuICAgIGxldCB4dW4gICAgICAgID0gKyAkKCdzZWxlY3RbbmFtZT1cInh1blwiXScpLnZhbCgpO1xuICAgIGxldCBiYW9wYWkgICAgID0gJCgnaW5wdXRbbmFtZT1cImJhb3BhaVwiXScpLm1hcCgoaSxuKT0+JChuKS52YWwoKSkudG9BcnJheSgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKHAgPT4gTWFqaWFuZy5TaG91cGFpLnZhbGlkX3BhaShwKSk7XG4gICAgbGV0IGhvbmdwYWkgICAgPSAkKCdpbnB1dFtuYW1lPVwiaG9uZ3BhaVwiXScpLnByb3AoJ2NoZWNrZWQnKTtcblxuICAgIGlmICghIGJhb3BhaS5sZW5ndGgpIGJhb3BhaSA9IFsnejInXTtcblxuICAgIGxldCBoZWluZm8gPSAkKCdpbnB1dFtuYW1lPVwiaGVzdHJcIl0nKS5tYXAoKGksbik9PiQobikudmFsKCkpLnRvQXJyYXkoKTtcblxuICAgIGlmICghIGhvbmdwYWkpIHtcbiAgICAgICAgcGFpc3RyID0gcGFpc3RyLnJlcGxhY2UoLzAvLCc1Jyk7XG4gICAgICAgIGJhb3BhaSA9IGJhb3BhaS5tYXAocCA9PiBwLnJlcGxhY2UoLzAvLCc1JykpO1xuICAgICAgICBoZWluZm8gPSBoZWluZm8ubWFwKGhlc3RyID0+IGhlc3RyLnJlcGxhY2UoLzAvLCc1JykpO1xuICAgIH1cblxuICAgIGxldCBiYXNlaW5mbyA9IHsgcGFpc3RyOiBwYWlzdHIsIHpodWFuZ2Zlbmc6IHpodWFuZ2ZlbmcsIG1lbmZlbmc6IG1lbmZlbmcsXG4gICAgICAgICAgICAgICAgICAgICBiYW9wYWk6IGJhb3BhaSwgaG9uZ3BhaTogaG9uZ3BhaSwgeHVuOiB4dW4gfTtcblxuICAgIGxldCBhbmFseXplcjtcbiAgICBsZXQga2FpanUgPSB7IGlkOiAwLCBydWxlOiBNYWppYW5nLnJ1bGUoKSwgcWlqaWE6IDAgfTtcblxuICAgIGlmICgkKCdmb3JtIGlucHV0W25hbWU9XCJoZWluZm9cIl0nKS5wcm9wKCdjaGVja2VkJykpIHtcblxuICAgICAgICBhbmFseXplciA9IG5ldyBNYWppYW5nLlVJLkFuYWx5emVyKCQoJyNib2FyZCA+LmFuYWx5emVyJyksIGthaWp1LCBwYWkpO1xuXG4gICAgICAgIGhlaW5mbyA9IG1pbmlwYWlwdShhbmFseXplciwgYmFzZWluZm8sIGhlaW5mbywgdHJ1ZSk7XG5cbiAgICAgICAgbGV0IHZpZXcgPSBuZXcgTWFqaWFuZy5VSS5Cb2FyZCgkKCcjYm9hcmQgLmJvYXJkJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFpLCBhdWRpbywgYW5hbHl6ZXIubW9kZWwsIHt9KTtcbiAgICAgICAgdmlldy5ub19wbGF5ZXJfbmFtZSA9IHRydWU7XG4gICAgICAgIHZpZXcub3Blbl9oZSAgICAgICAgPSB0cnVlO1xuICAgICAgICB2aWV3LnJlZHJhdygpO1xuXG4gICAgICAgIGxldCB6aW1vID0gYW5hbHl6ZXIuc2hvdXBhaS5femltb1xuICAgICAgICBpZiAoemltbykge1xuICAgICAgICAgICAgaWYgKHppbW8ubGVuZ3RoID09IDIpXG4gICAgICAgICAgICAgICAgICAgIGFuYWx5emVyLmFjdGlvbl96aW1vKHsgbDogbWVuZmVuZywgcDogemltbyB9KTtcbiAgICAgICAgICAgIGVsc2UgICAgYW5hbHl6ZXIuYWN0aW9uX2Z1bG91KHsgbDogbWVuZmVuZywgbTogemltbyB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGxldCBsID0gYW5hbHl6ZXIubW9kZWwubHVuYmFuO1xuICAgICAgICAgICAgaWYgKGwgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBsZXQgcCA9IGFuYWx5emVyLm1vZGVsLmhlW2xdLl9wYWkuc2xpY2UoLTEpWzBdO1xuICAgICAgICAgICAgICAgIGFuYWx5emVyLmFjdGlvbl9kYXBhaSh7IGw6IGwsIHA6IHAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBhbmFseXplci5hY3Rpb25fcWlwYWkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAkKCdib2R5JykuYXR0cignY2xhc3MnLCdib2FyZCBhbmFseXplcicpO1xuICAgICAgICBzY2FsZSgkKCcjYm9hcmQnKSwgJCgnI3NwYWNlJykpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYW5hbHl6ZXIgPSBuZXcgTWFqaWFuZy5VSS5BbmFseXplcigkKCcjZGVtbyA+LmFuYWx5emVyJyksIGthaWp1LCBwYWkpO1xuXG4gICAgICAgIG1pbmlwYWlwdShhbmFseXplciwgYmFzZWluZm8pO1xuXG4gICAgICAgIG5ldyBNYWppYW5nLlVJLlNoYW4oJCgnI2RlbW8gLnNoYW4nKSwgcGFpLCBhbmFseXplci5zaGFuKS5yZWRyYXcoKTtcbiAgICAgICAgbmV3IE1hamlhbmcuVUkuU2hvdXBhaSgkKCcjZGVtbyAuc2hvdXBhaScpLCBwYWksIGFuYWx5emVyLnNob3VwYWkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlZHJhdyh0cnVlKTtcblxuICAgICAgICBsZXQgemltbyA9IGFuYWx5emVyLnNob3VwYWkuX3ppbW9cbiAgICAgICAgaWYgKHppbW8pIHtcbiAgICAgICAgICAgIGlmICh6aW1vLmxlbmd0aCA9PSAyKVxuICAgICAgICAgICAgICAgICAgICBhbmFseXplci5hY3Rpb25femltbyh7IGw6IG1lbmZlbmcsIHA6IHppbW8gfSk7XG4gICAgICAgICAgICBlbHNlICAgIGFuYWx5emVyLmFjdGlvbl9mdWxvdSh7IGw6IG1lbmZlbmcsIG06IHppbW8gfSk7XG4gICAgICAgIH1cbiAgICAgICAgZmFkZUluKCQoJy5zaGFuLCAuc2hvdXBhaSwgLmFuYWx5emVyJywgJCgnI2RlbW8nKSkpO1xuXG4gICAgICAgIGhlaW5mbyA9IG51bGw7XG4gICAgfVxuXG4gICAgcGFpc3RyID0gYW5hbHl6ZXIuc2hvdXBhaS50b1N0cmluZygpO1xuICAgICQoJ2lucHV0W25hbWU9XCJwYWlzdHJcIl0nKS52YWwocGFpc3RyKTtcblxuICAgIGJhb3BhaSA9IGFuYWx5emVyLnNoYW4uYmFvcGFpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG4gICAgICAgICQoJ2lucHV0W25hbWU9XCJiYW9wYWlcIl0nKS5lcShpKS52YWwoYmFvcGFpW2ldIHx8ICcnKTtcbiAgICB9XG5cbiAgICBpZiAoaGVpbmZvKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSAge1xuICAgICAgICAgICAgJCgnaW5wdXRbbmFtZT1cImhlc3RyXCJdJykuZXEoaSkudmFsKGhlaW5mb1tpXSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgZnJhZ21lbnQgPSAnIydcbiAgICAgICAgICAgICAgICAgKyBbIHBhaXN0ciwgemh1YW5nZmVuZywgbWVuZmVuZywgYmFvcGFpLmpvaW4oJywnKV0uam9pbignLycpO1xuICAgIGlmICghIGhvbmdwYWkpIGZyYWdtZW50ICs9ICcvMSc7XG5cbiAgICBpZiAoaGVpbmZvKSBmcmFnbWVudCArPSAnJicgKyBoZWluZm8uam9pbignLycpO1xuICAgIGVsc2UgICAgICAgIGZyYWdtZW50ICs9ICcvKycgKyB4dW47XG5cbiAgICBoaXN0b3J5LnJlcGxhY2VTdGF0ZSgnJywgJycsIGZyYWdtZW50KVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBzZXRfY29udHJvbGxlcihyb290KSB7XG4gICAgcm9vdC5hZGRDbGFzcygncGFpcHUnKTtcbiAgICAkKHdpbmRvdykub24oJ2tleXVwJywgKGV2KT0+e1xuICAgICAgICBpZiAoZXYua2V5ID09ICdxJyB8fCBldi5rZXkgPT0gJ0VzY2FwZScpIHtcbiAgICAgICAgICAgIGlmICgkKCdib2R5JykuYXR0cignY2xhc3MnKSAhPSAnZGVtbycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkKCdib2R5JykuYXR0cignY2xhc3MnLCdkZW1vJyk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBoaWRlKCQoJz4gaW1nJywgcm9vdCkpO1xuICAgIHNob3coJCgnPiBpbWcuZXhpdCcsIHJvb3QpLm9uKCdjbGljaycsICgpPT4kKCdib2R5JykuYXR0cignY2xhc3MnLCdkZW1vJykpKTtcbn1cblxuJChmdW5jdGlvbigpe1xuXG4gICAgcGFpID0gTWFqaWFuZy5VSS5wYWkoJyNsb2FkZGF0YScpO1xuICAgIGF1ZGlvID0gTWFqaWFuZy5VSS5hdWRpbygnI2xvYWRkYXRhJyk7XG5cbiAgICAkKCdmb3JtIGlucHV0W25hbWU9XCJoZWluZm9cIl0nKS5vbignY2hhbmdlJywgZnVuY3Rpb24oKXtcbiAgICAgICAgaWYgKCQodGhpcykucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICBzaG93KCQoJ2Zvcm0gLmhlaW5mbycpKTtcbiAgICAgICAgICAgIGhpZGUoJCgnZm9ybSAueHVuJykpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaGlkZSgkKCdmb3JtIC5oZWluZm8nKSk7XG4gICAgICAgICAgICBzaG93KCQoJ2Zvcm0gLnh1bicpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGhpZGUoJCgnZm9ybSAuaGVpbmZvJykpO1xuXG4gICAgJCgnZm9ybScpLm9uKCdzdWJtaXQnLCBzdWJtaXQpO1xuXG4gICAgJCgnZm9ybScpLm9uKCdyZXNldCcsIGZ1bmN0aW9uKCl7XG4gICAgICAgIGhpZGUoJCgnLnNoYW4sIC5zaG91cGFpLCAuYW5hbHl6ZXInLCAkKCcjZGVtbycpKSk7XG4gICAgICAgIGhpZGUoJCgnZm9ybSAuaGVpbmZvJykpO1xuICAgICAgICAkKCdmb3JtIGlucHV0W25hbWU9XCJwYWlzdHJcIl0nKS5mb2N1cygpO1xuICAgIH0pO1xuXG4gICAgJCh3aW5kb3cpLm9uKCdyZXNpemUnLCAoKT0+c2NhbGUoJCgnI2JvYXJkJyksICQoJyNzcGFjZScpKSk7XG5cbiAgICBzZXRfY29udHJvbGxlcigkKCcjYm9hcmQgLmNvbnRyb2xsZXInKSk7XG5cbiAgICBsZXQgZnJhZ21lbnQgPSBsb2NhdGlvbi5oYXNoLnJlcGxhY2UoL14jLywnJyk7XG4gICAgaW5pdChmcmFnbWVudCk7XG59KTtcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==