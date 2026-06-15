/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/*!*************************!*\
  !*** ./src/js/paili.js ***!
  \*************************/
/*!
 *  電脳麻将: 牌理 v2.5.1
 *
 *  Copyright(C) 2017 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/Majiang/blob/master/LICENSE
 */


const { setSelector, clearSelector } = Majiang.UI.Util;

const model = {};
const view  = {};

const rule = Majiang.rule();

let pref;

function repair_shan(shan, shoupai) {
    let paistr = shoupai.toString();
    for (let suitstr of paistr.match(/[mpsz][\d\+\=\-]+/g)) {
        let s = suitstr[0];
        for (let n of suitstr.match(/\d/g)) {
            let i = shan._pai.indexOf(s+n);
            if (i >= 0) shan._pai.splice(i, 1);
        }
    }
}

function qipai(paistr) {

    model.shan = new Majiang.Shan(rule);

    if (paistr) {
        model.shoupai = Majiang.Shoupai.fromString(paistr);
        repair_shan(model.shan, model.shoupai);
    }
    else {
        let qipai = [];
        while (qipai.length < 13) qipai.push(model.shan.zimo());
        model.shoupai = new Majiang.Shoupai(qipai);
        model.shoupai.zimo(model.shan.zimo());
    }
    model.lizhi = false;

    while (model.shan.paishu > 17) model.shan.zimo();

    $('form input[name="paistr"]').val(model.shoupai.toString());
    if (paistr) history.replaceState('', '', `#${model.shoupai.toString()}`);

    view.shoupai = new Majiang.UI.Shoupai(
                                $('.shoupai'), view.pai, model.shoupai
                            ).redraw(true);

    model.he = new Majiang.He();
    view.he  = new Majiang.UI.He($('.he'), view.pai, model.he).redraw(true);

    paili(1);
}

function set_handler(focus = -1) {

    for (let p of model.shoupai.get_dapai()) {
        let pai = $(p.slice(-1) == '_'
                        ? `.zimo .pai[data-pai="${p.slice(0,2)}"]`
                        : `> .pai[data-pai="${p}"]`,
                    $('.shoupai .bingpai'));
        pai.attr('tabindex', 0).attr('role','button')
            .on('click.dapai', (ev)=>{
                $(ev.target).addClass('dapai');
                dapai(p);
            });
    }
    setSelector($('.shoupai .bingpai .pai[tabindex]'), 'dapai', {focus: focus});
}

function clear_handler() {
    view.shoupai.redraw();
    clearSelector('dapai');
}

function dapai(p) {

    clearSelector('dapai');

    if (pref.sound_on) view.audio('dapai').play();
    model.shoupai.dapai(p);
    view.shoupai.dapai(p);

    if (! model.lizhi && Majiang.Util.xiangting(model.shoupai) == 0) {
        model.lizhi = true;
        p += '*';
    }

    model.he.dapai(p);
    view.he.dapai(p);

    setTimeout(zimo, 600);
}

function zimo() {

    if (! model.shan.paishu) {
        view.shoupai.redraw();
        view.he.redraw();
        $('.status').text('流局……');
        $('.paili').empty();
        return;
    }

    model.shoupai.zimo(model.shan.zimo());
    view.shoupai.redraw();
    view.he.redraw();

    paili();
}

function paili(start) {

    $('.paili').empty();

    let n_xiangting = Majiang.Util.xiangting(model.shoupai);
    if      (n_xiangting == -1) $('.status').text('和了！！');
    else if (n_xiangting ==  0) $('.status').text('聴牌！');
    else                        $('.status').text(`${n_xiangting}向聴`);

    if (n_xiangting == -1) {
        if (pref.sound_on) view.audio('zimo').play();
        return;
    }
    else if (n_xiangting == 0 && ! model.lizhi) {
        if (pref.sound_on) view.audio('lizhi').play();
    }

    let dapai = [];
    for (let p of model.shoupai.get_dapai()) {

        let shoupai = model.shoupai.clone().dapai(p);
        if (Majiang.Util.xiangting(shoupai) > n_xiangting) continue;

        p = p[0] + (+p[1]||5);
        if (dapai.find(dapai => dapai.p == p)) continue;

        let tingpai = Majiang.Util.tingpai(shoupai);
        let n = tingpai.map(p => 4 - model.shoupai._bingpai[p[0]][p[1]])
                       .reduce((x, y)=> x + y, 0)

        dapai.push({ p: p, tingpai: tingpai, n: n });
    }

    const cmp = (a, b) => b.n - a.n
                       || b.tingpai.length - a.tingpai.length
                       || (a.p < b.p ? -1 : 1);
    for (let d of dapai.sort(cmp)) {
        let html = '<div>打: '
                 + $('<span>').append(view.pai(d.p)).html()
                 + ' 摸: '
                 + d.tingpai.map(
                     p => $('<span>').append(view.pai(p)).html()
                 ).join('')
                 + ` (${d.n}枚)</div>`;
        $('.paili').append($(html));
    }

    if (start) setTimeout(set_handler, 600);
    else       set_handler();
}

$(function(){

    view.pai   = Majiang.UI.pai('#loaddata');
    view.audio = Majiang.UI.audio('#loaddata');

    pref = JSON.parse(localStorage.getItem('Majiang.pref'));

    $('form input[type="button"]').on('click', function(){
        qipai();
        return false;
    });
    $('form').on('submit', function(){
        qipai($('form input[name="paistr"]').val());
        return false;
    });
    $('form').on('reset', function(){
        $('input[name="paistr"]').trigger('focus');
        history.replaceState('', '', location.href.replace(/#.*$/,''));
    });
    $('form [name="paistr"]').on('focus', clear_handler)
                             .on('blur',  ()=> set_handler(null));

    let paistr = location.hash.replace(/^#/,'');
    qipai(paistr);
});

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFpbGktMi41LjEuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNhOztBQUViLFFBQVEsNkJBQTZCOztBQUVyQztBQUNBOztBQUVBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQSxpREFBaUQseUJBQXlCOztBQUUxRTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQSxrREFBa0QsYUFBYTtBQUMvRCw4Q0FBOEMsRUFBRTtBQUNoRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0EsaUVBQWlFLGFBQWE7QUFDOUU7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxxREFBcUQsWUFBWTs7QUFFakU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBLHFCQUFxQiw4QkFBOEI7QUFDbkQ7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSTtBQUM1QjtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7O0FBRUE7QUFDQTtBQUNBLENBQUMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9tYWppYW5nLy4vc3JjL2pzL3BhaWxpLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qIVxuICogIOmbu+iEs+m6u+Wwhjog54mM55CGIHYyLjUuMVxuICpcbiAqICBDb3B5cmlnaHQoQykgMjAxNyBTYXRvc2hpIEtvYmF5YXNoaVxuICogIFJlbGVhc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxuICogIGh0dHBzOi8vZ2l0aHViLmNvbS9rb2JhbGFiL01hamlhbmcvYmxvYi9tYXN0ZXIvTElDRU5TRVxuICovXG5cInVzZSBzdHJpY3RcIjtcblxuY29uc3QgeyBzZXRTZWxlY3RvciwgY2xlYXJTZWxlY3RvciB9ID0gTWFqaWFuZy5VSS5VdGlsO1xuXG5jb25zdCBtb2RlbCA9IHt9O1xuY29uc3QgdmlldyAgPSB7fTtcblxuY29uc3QgcnVsZSA9IE1hamlhbmcucnVsZSgpO1xuXG5sZXQgcHJlZjtcblxuZnVuY3Rpb24gcmVwYWlyX3NoYW4oc2hhbiwgc2hvdXBhaSkge1xuICAgIGxldCBwYWlzdHIgPSBzaG91cGFpLnRvU3RyaW5nKCk7XG4gICAgZm9yIChsZXQgc3VpdHN0ciBvZiBwYWlzdHIubWF0Y2goL1ttcHN6XVtcXGRcXCtcXD1cXC1dKy9nKSkge1xuICAgICAgICBsZXQgcyA9IHN1aXRzdHJbMF07XG4gICAgICAgIGZvciAobGV0IG4gb2Ygc3VpdHN0ci5tYXRjaCgvXFxkL2cpKSB7XG4gICAgICAgICAgICBsZXQgaSA9IHNoYW4uX3BhaS5pbmRleE9mKHMrbik7XG4gICAgICAgICAgICBpZiAoaSA+PSAwKSBzaGFuLl9wYWkuc3BsaWNlKGksIDEpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBxaXBhaShwYWlzdHIpIHtcblxuICAgIG1vZGVsLnNoYW4gPSBuZXcgTWFqaWFuZy5TaGFuKHJ1bGUpO1xuXG4gICAgaWYgKHBhaXN0cikge1xuICAgICAgICBtb2RlbC5zaG91cGFpID0gTWFqaWFuZy5TaG91cGFpLmZyb21TdHJpbmcocGFpc3RyKTtcbiAgICAgICAgcmVwYWlyX3NoYW4obW9kZWwuc2hhbiwgbW9kZWwuc2hvdXBhaSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBsZXQgcWlwYWkgPSBbXTtcbiAgICAgICAgd2hpbGUgKHFpcGFpLmxlbmd0aCA8IDEzKSBxaXBhaS5wdXNoKG1vZGVsLnNoYW4uemltbygpKTtcbiAgICAgICAgbW9kZWwuc2hvdXBhaSA9IG5ldyBNYWppYW5nLlNob3VwYWkocWlwYWkpO1xuICAgICAgICBtb2RlbC5zaG91cGFpLnppbW8obW9kZWwuc2hhbi56aW1vKCkpO1xuICAgIH1cbiAgICBtb2RlbC5saXpoaSA9IGZhbHNlO1xuXG4gICAgd2hpbGUgKG1vZGVsLnNoYW4ucGFpc2h1ID4gMTcpIG1vZGVsLnNoYW4uemltbygpO1xuXG4gICAgJCgnZm9ybSBpbnB1dFtuYW1lPVwicGFpc3RyXCJdJykudmFsKG1vZGVsLnNob3VwYWkudG9TdHJpbmcoKSk7XG4gICAgaWYgKHBhaXN0cikgaGlzdG9yeS5yZXBsYWNlU3RhdGUoJycsICcnLCBgIyR7bW9kZWwuc2hvdXBhaS50b1N0cmluZygpfWApO1xuXG4gICAgdmlldy5zaG91cGFpID0gbmV3IE1hamlhbmcuVUkuU2hvdXBhaShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJCgnLnNob3VwYWknKSwgdmlldy5wYWksIG1vZGVsLnNob3VwYWlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApLnJlZHJhdyh0cnVlKTtcblxuICAgIG1vZGVsLmhlID0gbmV3IE1hamlhbmcuSGUoKTtcbiAgICB2aWV3LmhlICA9IG5ldyBNYWppYW5nLlVJLkhlKCQoJy5oZScpLCB2aWV3LnBhaSwgbW9kZWwuaGUpLnJlZHJhdyh0cnVlKTtcblxuICAgIHBhaWxpKDEpO1xufVxuXG5mdW5jdGlvbiBzZXRfaGFuZGxlcihmb2N1cyA9IC0xKSB7XG5cbiAgICBmb3IgKGxldCBwIG9mIG1vZGVsLnNob3VwYWkuZ2V0X2RhcGFpKCkpIHtcbiAgICAgICAgbGV0IHBhaSA9ICQocC5zbGljZSgtMSkgPT0gJ18nXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGAuemltbyAucGFpW2RhdGEtcGFpPVwiJHtwLnNsaWNlKDAsMil9XCJdYFxuICAgICAgICAgICAgICAgICAgICAgICAgOiBgPiAucGFpW2RhdGEtcGFpPVwiJHtwfVwiXWAsXG4gICAgICAgICAgICAgICAgICAgICQoJy5zaG91cGFpIC5iaW5ncGFpJykpO1xuICAgICAgICBwYWkuYXR0cigndGFiaW5kZXgnLCAwKS5hdHRyKCdyb2xlJywnYnV0dG9uJylcbiAgICAgICAgICAgIC5vbignY2xpY2suZGFwYWknLCAoZXYpPT57XG4gICAgICAgICAgICAgICAgJChldi50YXJnZXQpLmFkZENsYXNzKCdkYXBhaScpO1xuICAgICAgICAgICAgICAgIGRhcGFpKHApO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxuICAgIHNldFNlbGVjdG9yKCQoJy5zaG91cGFpIC5iaW5ncGFpIC5wYWlbdGFiaW5kZXhdJyksICdkYXBhaScsIHtmb2N1czogZm9jdXN9KTtcbn1cblxuZnVuY3Rpb24gY2xlYXJfaGFuZGxlcigpIHtcbiAgICB2aWV3LnNob3VwYWkucmVkcmF3KCk7XG4gICAgY2xlYXJTZWxlY3RvcignZGFwYWknKTtcbn1cblxuZnVuY3Rpb24gZGFwYWkocCkge1xuXG4gICAgY2xlYXJTZWxlY3RvcignZGFwYWknKTtcblxuICAgIGlmIChwcmVmLnNvdW5kX29uKSB2aWV3LmF1ZGlvKCdkYXBhaScpLnBsYXkoKTtcbiAgICBtb2RlbC5zaG91cGFpLmRhcGFpKHApO1xuICAgIHZpZXcuc2hvdXBhaS5kYXBhaShwKTtcblxuICAgIGlmICghIG1vZGVsLmxpemhpICYmIE1hamlhbmcuVXRpbC54aWFuZ3RpbmcobW9kZWwuc2hvdXBhaSkgPT0gMCkge1xuICAgICAgICBtb2RlbC5saXpoaSA9IHRydWU7XG4gICAgICAgIHAgKz0gJyonO1xuICAgIH1cblxuICAgIG1vZGVsLmhlLmRhcGFpKHApO1xuICAgIHZpZXcuaGUuZGFwYWkocCk7XG5cbiAgICBzZXRUaW1lb3V0KHppbW8sIDYwMCk7XG59XG5cbmZ1bmN0aW9uIHppbW8oKSB7XG5cbiAgICBpZiAoISBtb2RlbC5zaGFuLnBhaXNodSkge1xuICAgICAgICB2aWV3LnNob3VwYWkucmVkcmF3KCk7XG4gICAgICAgIHZpZXcuaGUucmVkcmF3KCk7XG4gICAgICAgICQoJy5zdGF0dXMnKS50ZXh0KCfmtYHlsYDigKbigKYnKTtcbiAgICAgICAgJCgnLnBhaWxpJykuZW1wdHkoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG1vZGVsLnNob3VwYWkuemltbyhtb2RlbC5zaGFuLnppbW8oKSk7XG4gICAgdmlldy5zaG91cGFpLnJlZHJhdygpO1xuICAgIHZpZXcuaGUucmVkcmF3KCk7XG5cbiAgICBwYWlsaSgpO1xufVxuXG5mdW5jdGlvbiBwYWlsaShzdGFydCkge1xuXG4gICAgJCgnLnBhaWxpJykuZW1wdHkoKTtcblxuICAgIGxldCBuX3hpYW5ndGluZyA9IE1hamlhbmcuVXRpbC54aWFuZ3RpbmcobW9kZWwuc2hvdXBhaSk7XG4gICAgaWYgICAgICAobl94aWFuZ3RpbmcgPT0gLTEpICQoJy5zdGF0dXMnKS50ZXh0KCflkozkuobvvIHvvIEnKTtcbiAgICBlbHNlIGlmIChuX3hpYW5ndGluZyA9PSAgMCkgJCgnLnN0YXR1cycpLnRleHQoJ+iBtOeJjO+8gScpO1xuICAgIGVsc2UgICAgICAgICAgICAgICAgICAgICAgICAkKCcuc3RhdHVzJykudGV4dChgJHtuX3hpYW5ndGluZ33lkJHogbRgKTtcblxuICAgIGlmIChuX3hpYW5ndGluZyA9PSAtMSkge1xuICAgICAgICBpZiAocHJlZi5zb3VuZF9vbikgdmlldy5hdWRpbygnemltbycpLnBsYXkoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBlbHNlIGlmIChuX3hpYW5ndGluZyA9PSAwICYmICEgbW9kZWwubGl6aGkpIHtcbiAgICAgICAgaWYgKHByZWYuc291bmRfb24pIHZpZXcuYXVkaW8oJ2xpemhpJykucGxheSgpO1xuICAgIH1cblxuICAgIGxldCBkYXBhaSA9IFtdO1xuICAgIGZvciAobGV0IHAgb2YgbW9kZWwuc2hvdXBhaS5nZXRfZGFwYWkoKSkge1xuXG4gICAgICAgIGxldCBzaG91cGFpID0gbW9kZWwuc2hvdXBhaS5jbG9uZSgpLmRhcGFpKHApO1xuICAgICAgICBpZiAoTWFqaWFuZy5VdGlsLnhpYW5ndGluZyhzaG91cGFpKSA+IG5feGlhbmd0aW5nKSBjb250aW51ZTtcblxuICAgICAgICBwID0gcFswXSArICgrcFsxXXx8NSk7XG4gICAgICAgIGlmIChkYXBhaS5maW5kKGRhcGFpID0+IGRhcGFpLnAgPT0gcCkpIGNvbnRpbnVlO1xuXG4gICAgICAgIGxldCB0aW5ncGFpID0gTWFqaWFuZy5VdGlsLnRpbmdwYWkoc2hvdXBhaSk7XG4gICAgICAgIGxldCBuID0gdGluZ3BhaS5tYXAocCA9PiA0IC0gbW9kZWwuc2hvdXBhaS5fYmluZ3BhaVtwWzBdXVtwWzFdXSlcbiAgICAgICAgICAgICAgICAgICAgICAgLnJlZHVjZSgoeCwgeSk9PiB4ICsgeSwgMClcblxuICAgICAgICBkYXBhaS5wdXNoKHsgcDogcCwgdGluZ3BhaTogdGluZ3BhaSwgbjogbiB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBjbXAgPSAoYSwgYikgPT4gYi5uIC0gYS5uXG4gICAgICAgICAgICAgICAgICAgICAgIHx8IGIudGluZ3BhaS5sZW5ndGggLSBhLnRpbmdwYWkubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgICAgIHx8IChhLnAgPCBiLnAgPyAtMSA6IDEpO1xuICAgIGZvciAobGV0IGQgb2YgZGFwYWkuc29ydChjbXApKSB7XG4gICAgICAgIGxldCBodG1sID0gJzxkaXY+5omTOiAnXG4gICAgICAgICAgICAgICAgICsgJCgnPHNwYW4+JykuYXBwZW5kKHZpZXcucGFpKGQucCkpLmh0bWwoKVxuICAgICAgICAgICAgICAgICArICcg5pG4OiAnXG4gICAgICAgICAgICAgICAgICsgZC50aW5ncGFpLm1hcChcbiAgICAgICAgICAgICAgICAgICAgIHAgPT4gJCgnPHNwYW4+JykuYXBwZW5kKHZpZXcucGFpKHApKS5odG1sKClcbiAgICAgICAgICAgICAgICAgKS5qb2luKCcnKVxuICAgICAgICAgICAgICAgICArIGAgKCR7ZC5ufeaemik8L2Rpdj5gO1xuICAgICAgICAkKCcucGFpbGknKS5hcHBlbmQoJChodG1sKSk7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0KSBzZXRUaW1lb3V0KHNldF9oYW5kbGVyLCA2MDApO1xuICAgIGVsc2UgICAgICAgc2V0X2hhbmRsZXIoKTtcbn1cblxuJChmdW5jdGlvbigpe1xuXG4gICAgdmlldy5wYWkgICA9IE1hamlhbmcuVUkucGFpKCcjbG9hZGRhdGEnKTtcbiAgICB2aWV3LmF1ZGlvID0gTWFqaWFuZy5VSS5hdWRpbygnI2xvYWRkYXRhJyk7XG5cbiAgICBwcmVmID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnTWFqaWFuZy5wcmVmJykpO1xuXG4gICAgJCgnZm9ybSBpbnB1dFt0eXBlPVwiYnV0dG9uXCJdJykub24oJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICAgICAgcWlwYWkoKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0pO1xuICAgICQoJ2Zvcm0nKS5vbignc3VibWl0JywgZnVuY3Rpb24oKXtcbiAgICAgICAgcWlwYWkoJCgnZm9ybSBpbnB1dFtuYW1lPVwicGFpc3RyXCJdJykudmFsKCkpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSk7XG4gICAgJCgnZm9ybScpLm9uKCdyZXNldCcsIGZ1bmN0aW9uKCl7XG4gICAgICAgICQoJ2lucHV0W25hbWU9XCJwYWlzdHJcIl0nKS50cmlnZ2VyKCdmb2N1cycpO1xuICAgICAgICBoaXN0b3J5LnJlcGxhY2VTdGF0ZSgnJywgJycsIGxvY2F0aW9uLmhyZWYucmVwbGFjZSgvIy4qJC8sJycpKTtcbiAgICB9KTtcbiAgICAkKCdmb3JtIFtuYW1lPVwicGFpc3RyXCJdJykub24oJ2ZvY3VzJywgY2xlYXJfaGFuZGxlcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm9uKCdibHVyJywgICgpPT4gc2V0X2hhbmRsZXIobnVsbCkpO1xuXG4gICAgbGV0IHBhaXN0ciA9IGxvY2F0aW9uLmhhc2gucmVwbGFjZSgvXiMvLCcnKTtcbiAgICBxaXBhaShwYWlzdHIpO1xufSk7XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=