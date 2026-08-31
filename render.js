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
    ch1:"Часть 1 · до конца сюжета", ch2:"Часть 1 · до конца сюжета", ch3:"Часть 1 · до конца сюжета",
    ch4:"Часть 1 · до конца сюжета", ch5:"Часть 1 · до конца сюжета", ch6:"Часть 1 · до конца сюжета",
    epilog:"Часть 2 · после сюжета",
    gold:"Справочники", hundred:"Справочники", trophies:"Справочники", challenges:"Справочники",
    "comp-animals":"Компендиум", "comp-rest":"Компендиум"
  };
  var CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" stroke="#12100d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV  = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

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
  function groupStats(g, state){
    var done = 0, total = 0;
    (g.items || []).forEach(function(it){ total++; done += itemScore(it, state); });
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function sectionStats(sec, state){
    var done = 0, total = 0;
    (sec.groups || []).forEach(function(g){
      var st = groupStats(g, state); done += st.done; total += st.total;
    });
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function globalStats(sections, state){
    var done = 0, total = 0;
    sections.forEach(function(s){ var st = sectionStats(s, state); done += st.done; total += st.total; });
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }
  /* сколько отмечено пунктов, чей id начинается с prefix (для «Золотых медалей») */
  function prefixCount(sections, state, prefix){
    var n = 0;
    sections.forEach(function(s){
      (s.groups || []).forEach(function(g){
        (g.items || []).forEach(function(it){
          if (it.i.indexOf(prefix) === 0 && itemDone(it, state)) n++;
        });
      });
    });
    return n;
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

  function groupHtml(g, state, key, closed){
    var st = groupStats(g, state);
    var h = '<div class="grp' + (closed ? " closed" : "") + '" data-grp="' + key + '">';
    h += '<h3 class="grp-h" role="button" tabindex="0" aria-expanded="' + (closed ? "false" : "true") + '">' +
           CHEV + '<span class="gh">' + g.h + '</span>' +
           (g.cnt ? '<span class="cnt">' + g.cnt + '</span>' : "") +
           '<span class="gp" data-grp-lbl="' + key + '">' + Math.round(st.done) + '/' + st.total + '</span>' +
         '</h3>';
    h += '<div class="grp-body">';
    if (g.d) h += '<p class="gd">' + spoil(g.d) + '</p>';
    h += '<ul class="items">' + (g.items || []).map(function(it){ return itemHtml(it, state); }).join("") + '</ul>';
    h += '</div></div>';
    return h;
  }

  function sectionHtml(sec, state, opts){
    opts = opts || {};
    var st = sectionStats(sec, state);
    var notes = sec.notes || [];
    var h = '<section class="sec" id="' + sec.id + '"><div class="sechead">';
    if (sec.kicker) h += '<div class="kicker">' + sec.kicker + '</div>';
    h += '<h2>' + sec.title + '</h2>';
    if (sec.sub) h += '<p>' + spoil(sec.sub) + '</p>';
    if (st.total) h += '<div class="meter"><div class="bar"><i style="width:' + st.pct + '%"></i></div>' +
      '<span data-sec-lbl="' + sec.id + '">' + Math.round(st.done) + ' из ' + st.total + ' · ' + st.pct + '%</span></div>';
    h += '</div>';

    if (sec.stat) h += '<div class="statbox" data-stat="' + sec.stat.prefix + '" data-stat-total="' + sec.stat.total + '">' +
      '<b>0</b> / ' + sec.stat.total + '<span>' + sec.stat.label + '</span></div>';

    if (notes.length){
      h += '<div class="notes' + (opts.foldNotes && notes.length > 1 ? " folded" : "") + '">';
      notes.forEach(function(n, i){
        h += '<div class="note ' + (n.t || "") + (i ? " extra" : "") + '">' + spoil(n.h) + '</div>';
      });
      if (opts.foldNotes && notes.length > 1)
        h += '<button class="morenotes" data-morenotes>Ещё ' + (notes.length - 1) + ' подсказки</button>';
      h += '</div>';
    }

    if (sec.spoilerSection) h += '<div class="secbtns"><button class="chip" data-reveal="' + sec.id + '">Раскрыть спойлеры раздела</button></div>';

    (sec.groups || []).forEach(function(g, i){
      var key = sec.id + ":" + i;
      var closed = !!opts.closeGroups && !(i === 0 && (sec.groups || []).length === 1);
      h += groupHtml(g, state, key, closed);
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
      h += '<a href="#' + s.id + '" data-nav="' + s.id + '"' + (st.pct === 100 && st.total ? ' class="done"' : "") + '>' +
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
    groupStats: groupStats,
    sectionStats: sectionStats,
    globalStats: globalStats,
    prefixCount: prefixCount,
    buildIndex: buildIndex,
    indexItems: indexItems
  };
})();
