/* ============================================================
   render.js — превращает данные разделов в разметку
   Ничего не знает про фильтры и события: только HTML + счётчики.
   ============================================================ */
window.Render = (function(){
  "use strict";

  var TAGS = {
    miss: ["miss","пропускаемо"],
    tr:   ["tr","трофей"],
    ct:   ["ct","100%"],
    ep:   ["ep","эпилог"]
  };
  var NAVGRP = {
    start:"Начало", plan:"Начало",
    ch2:"Часть 1 · до конца сюжета", ch3:"Часть 1 · до конца сюжета", ch4:"Часть 1 · до конца сюжета",
    ch5:"Часть 1 · до конца сюжета", ch6:"Часть 1 · до конца сюжета",
    epilog:"Часть 2 · после сюжета",
    hundred:"Справочники", missions:"Справочники", trophies:"Справочники", challenges:"Справочники",
    "comp-animals":"Компендиум", "comp-rest":"Компендиум"
  };
  var CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" stroke="#12100d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function spoil(s){ return String(s).replace(/~([^~]+)~/g, '<span class="sp" role="button" tabindex="0">$1</span>'); }
  function plain(s){ return String(s || "").replace(/<[^>]+>/g," ").replace(/~/g," "); }

  /* ---------- счётчики ---------- */
  function itemScore(it, state){
    if (it.n) return Math.min(1, (+state[it.i] || 0) / it.n);
    return state[it.i] ? 1 : 0;
  }
  function itemDone(it, state){
    if (it.n) return (+state[it.i] || 0) >= it.n;
    return !!state[it.i];
  }
  function sectionStats(sec, state){
    var done = 0, total = 0;
    (sec.groups || []).forEach(function(g){
      (g.items || []).forEach(function(it){ total++; done += itemScore(it, state); });
    });
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function globalStats(sections, state){
    var done = 0, total = 0;
    sections.forEach(function(s){ var st = sectionStats(s, state); done += st.done; total += st.total; });
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  /* ---------- разметка ---------- */
  function tagsHtml(list){
    return (list || []).map(function(k){
      var t = TAGS[k];
      return t ? '<span class="tag ' + t[0] + '">' + t[1] + '</span>' : "";
    }).join("");
  }

  function itemHtml(it, state){
    var done = itemDone(it, state);
    var h = '<li class="it' + (done ? " done" : "") + '" data-id="' + it.i + '">';
    h += '<button class="cb" role="checkbox" aria-checked="' + (done ? "true" : "false") +
         '" data-act="toggle" aria-label="Отметить выполненным">' + CHECK + '</button>';
    h += '<div class="body"><div class="t">' + spoil(it.t) + '</div>';
    if (it.r && it.r.length) h += '<ul class="req">' + it.r.map(function(r){ return '<li>' + spoil(r) + '</li>'; }).join("") + '</ul>';
    if (it.d) h += '<div class="d">' + spoil(it.d) + '</div>';
    if (it.g && it.g.length) h += '<div class="tags">' + tagsHtml(it.g) + '</div>';
    if (it.n){
      var v = Math.min(+state[it.i] || 0, it.n);
      h += '<div class="ctr">' +
             '<button data-act="minus" aria-label="Убавить">−</button>' +
             '<span class="val">' + v + ' / ' + it.n + '</span>' +
             '<button data-act="plus" aria-label="Прибавить">+</button>' +
             '<div class="bar"><i style="width:' + (v / it.n * 100) + '%"></i></div>' +
           '</div>';
    }
    h += '</div></li>';
    return h;
  }

  function sectionHtml(sec, state){
    var st = sectionStats(sec, state);
    var h = '<section class="sec" id="' + sec.id + '"><div class="sechead">';
    if (sec.kicker) h += '<div class="kicker">' + sec.kicker + '</div>';
    h += '<h2>' + sec.title + '</h2>';
    if (sec.sub) h += '<p>' + spoil(sec.sub) + '</p>';
    if (st.total) h += '<div class="meter"><div class="bar"><i style="width:' + st.pct + '%"></i></div>' +
      '<span data-sec-lbl="' + sec.id + '">' + Math.round(st.done) + ' из ' + st.total + ' · ' + st.pct + '%</span></div>';
    h += '</div>';

    (sec.notes || []).forEach(function(n){ h += '<div class="note ' + (n.t || "") + '">' + spoil(n.h) + '</div>'; });
    if (sec.spoilerSection) h += '<div class="secbtns"><button class="chip" data-reveal="' + sec.id + '">Раскрыть названия миссий</button></div>';

    (sec.groups || []).forEach(function(g){
      h += '<div class="grp"><h3>' + g.h + (g.cnt ? ' <span class="cnt">' + g.cnt + '</span>' : "") + '</h3>';
      if (g.d) h += '<p class="gd">' + spoil(g.d) + '</p>';
      h += '<ul class="items">' + (g.items || []).map(function(it){ return itemHtml(it, state); }).join("") + '</ul></div>';
    });

    h += '<div class="empty" hidden>Под текущие фильтры в этом разделе ничего не подходит.</div></section>';
    return h;
  }

  function navHtml(sections, state){
    var h = "", cur = "";
    sections.forEach(function(s){
      var gname = NAVGRP[s.id] || s.kicker || "";
      if (gname && gname !== cur){ cur = gname; h += '<div class="navgroup">' + cur + '</div>'; }
      var st = sectionStats(s, state);
      h += '<a href="#' + s.id + '" data-nav="' + s.id + '"' + (st.pct === 100 ? ' class="done"' : "") + '>' +
             '<span>' + (s.nav || s.title) + '</span>' +
             '<span class="pct">' + (st.total ? st.pct + '%' : "") + '</span></a>';
    });
    return h;
  }

  /* поисковый индекс: пункт + заголовки раздела и группы */
  function buildIndex(sections){
    var map = {};
    sections.forEach(function(s){
      (s.groups || []).forEach(function(g){
        (g.items || []).forEach(function(it){
          map[it.i] = plain([s.title, s.nav, s.sub, g.h, g.d, it.t, it.d, (it.r || []).join(" ")].join(" ")).toLowerCase();
        });
      });
    });
    return map;
  }

  function indexItems(sections){
    var map = {};
    sections.forEach(function(s){
      (s.groups || []).forEach(function(g){
        (g.items || []).forEach(function(it){ map[it.i] = it; });
      });
    });
    return map;
  }

  return {
    itemHtml: itemHtml,
    sectionHtml: sectionHtml,
    navHtml: navHtml,
    itemScore: itemScore,
    itemDone: itemDone,
    sectionStats: sectionStats,
    globalStats: globalStats,
    buildIndex: buildIndex,
    indexItems: indexItems
  };
})();
