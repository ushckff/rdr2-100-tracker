/* ============================================================
   app.js — сборка страницы и все обработчики
   Данные приходят из data-*.js, состояние из store.js,
   разметка из render.js. Авторизация подключается отдельно (auth.js).

   На узком экране включается режим «одна вкладка за раз»: разделы
   не идут одной бесконечной лентой, а переключаются меню снизу.
   ============================================================ */
window.App = (function(){
  "use strict";

  var SECTIONS = window.RDR2_SECTIONS || [];
  var ITEMS    = window.Render.indexItems(SECTIONS);
  var HAY      = window.Render.buildIndex(SECTIONS);
  var FKEY     = "rdr2-tracker-filters";
  var GKEY     = "rdr2-tracker-groups";
  var SKEY     = "rdr2-tracker-section";

  var content = document.getElementById("content");
  var nav     = document.getElementById("nav");
  var mq      = window.matchMedia("(max-width: 1000px)");

  var filters = { todo:false, miss:false, q:"", spoil:false };
  var groupOverride = {};
  var current = SECTIONS[0] ? SECTIONS[0].id : "";

  function readLS(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch(e){ return fallback; }
  }
  function writeLS(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){} }

  Object.assign(filters, readLS(FKEY, {}));
  filters.q = "";
  groupOverride = readLS(GKEY, {});
  var savedSection = localStorage.getItem(SKEY);
  if (savedSection && SECTIONS.some(function(s){ return s.id === savedSection; })) current = savedSection;

  function isMobile(){ return mq.matches; }
  function searching(){ return !!(filters.q.trim() || filters.todo || filters.miss); }

  /* ---------- отрисовка ---------- */
  function renderAll(){
    var state = window.Store.all();
    var opts = { foldNotes: isMobile(), closeGroups: isMobile() };
    content.innerHTML = SECTIONS.map(function(s){ return window.Render.sectionHtml(s, state, opts); }).join("");
    nav.innerHTML = window.Render.navHtml(SECTIONS, state);
    applyGroupOverrides();
    if (filters.spoil) revealAll(true);
    syncMode();
    applyFilters();
    refreshMeters();
  }

  function applyGroupOverrides(){
    Object.keys(groupOverride).forEach(function(key){
      var g = content.querySelector('[data-grp="' + CSS.escape(key) + '"]');
      if (!g) return;
      var open = groupOverride[key];
      g.classList.toggle("closed", !open);
      var h = g.querySelector(".grp-h");
      if (h) h.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function refreshMeters(){
    var state = window.Store.all();
    var g = window.Render.globalStats(SECTIONS, state);
    var label = Math.round(g.done) + " / " + g.total + " · " + g.pct + "%";
    ["gpct","gpctM"].forEach(function(id){ var el = document.getElementById(id); if (el) el.textContent = label; });
    ["gfill","gfillM"].forEach(function(id){ var el = document.getElementById(id); if (el) el.style.width = g.pct + "%"; });

    SECTIONS.forEach(function(s){
      var st = window.Render.sectionStats(s, state);
      var lbl = document.querySelector('[data-sec-lbl="' + s.id + '"]');
      if (lbl){
        lbl.textContent = Math.round(st.done) + " из " + st.total + " · " + st.pct + "%";
        var fill = lbl.parentNode.querySelector(".bar > i");
        if (fill) fill.style.width = st.pct + "%";
      }
      var a = document.querySelector('[data-nav="' + s.id + '"]');
      if (a){
        a.querySelector(".pct").textContent = st.total ? st.pct + "%" : "";
        a.classList.toggle("done", st.total > 0 && st.pct === 100);
      }
      (s.groups || []).forEach(function(gr, i){
        var key = s.id + ":" + i;
        var el = document.querySelector('[data-grp-lbl="' + CSS.escape(key) + '"]');
        if (el){
          var gs = window.Render.groupStats(gr, state);
          el.textContent = Math.round(gs.done) + "/" + gs.total;
          el.classList.toggle("full", gs.total > 0 && gs.done >= gs.total);
        }
      });
    });

    document.querySelectorAll("[data-stat]").forEach(function(box){
      var n = window.Render.prefixCount(SECTIONS, state, box.dataset.stat);
      box.querySelector("b").textContent = n;
    });
  }

  function redrawItem(li){
    var it = ITEMS[li.dataset.id];
    if (!it) return;
    var tmp = document.createElement("ul");
    tmp.innerHTML = window.Render.itemHtml(it, window.Store.all());
    var fresh = tmp.firstChild;
    if (filters.spoil) fresh.querySelectorAll(".sp").forEach(function(s){ s.classList.add("open"); });
    li.parentNode.replaceChild(fresh, li);
    return fresh;
  }

  /* ---------- режим «одна вкладка» на телефоне ---------- */
  var secName = document.getElementById("secName");

  function syncMode(){
    var single = isMobile() && !searching();
    document.body.classList.toggle("single", single);
    if (single) showSection(current, true);
    else content.querySelectorAll("section.sec").forEach(function(s){ s.classList.remove("current"); });
    updateSecNav();
  }

  function showSection(id, silent){
    current = id;
    localStorage.setItem(SKEY, id);
    content.querySelectorAll("section.sec").forEach(function(s){
      s.classList.toggle("current", s.id === id);
    });
    document.querySelectorAll("[data-nav]").forEach(function(a){ a.classList.toggle("on", a.dataset.nav === id); });
    updateSecNav();
    if (!silent) window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updateSecNav(){
    var s = SECTIONS.filter(function(x){ return x.id === current; })[0];
    if (secName && s) secName.textContent = s.nav || s.title;
    var i = SECTIONS.findIndex(function(x){ return x.id === current; });
    var prev = document.getElementById("prevSec"), next = document.getElementById("nextSec");
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i < 0 || i >= SECTIONS.length - 1;
  }

  function step(delta){
    var i = SECTIONS.findIndex(function(x){ return x.id === current; });
    var j = i + delta;
    if (j < 0 || j >= SECTIONS.length) return;
    showSection(SECTIONS[j].id);
  }

  /* ---------- фильтры ---------- */
  function applyFilters(){
    var q = filters.q.trim().toLowerCase();
    var state = window.Store.all();
    var anyFilter = searching();

    content.querySelectorAll("section.sec").forEach(function(sec){
      var shown = 0, has = false;
      sec.querySelectorAll("li.it").forEach(function(li){
        has = true;
        var it = ITEMS[li.dataset.id];
        if (!it) return;
        var ok = true;
        if (filters.todo && window.Render.itemDone(it, state)) ok = false;
        if (ok && filters.miss && (it.g || []).indexOf("miss") < 0) ok = false;
        if (ok && q && (HAY[it.i] || "").indexOf(q) < 0) ok = false;
        li.classList.toggle("hide", !ok);
        if (ok) shown++;
      });
      sec.querySelectorAll(".grp").forEach(function(g){
        var total = g.querySelectorAll("li.it").length;
        var vis = g.querySelectorAll("li.it:not(.hide)").length;
        g.hidden = total > 0 && vis === 0;
        // при активном поиске группы раскрываются, чтобы результат было видно
        if (anyFilter && vis > 0) g.classList.remove("closed");
      });
      var em = sec.querySelector(".empty");
      if (em) em.hidden = !(has && shown === 0);
      sec.hidden = !!(anyFilter && has && shown === 0);
    });
  }

  /* ---------- спойлеры ---------- */
  function revealAll(open){
    document.querySelectorAll(".sp").forEach(function(s){ s.classList.toggle("open", open); });
  }

  /* ---------- события внутри контента ---------- */
  content.addEventListener("click", function(e){
    var more = e.target.closest("[data-morenotes]");
    if (more){ more.closest(".notes").classList.remove("folded"); more.remove(); return; }

    var head = e.target.closest(".grp-h");
    if (head){
      var grp = head.closest(".grp");
      var open = grp.classList.toggle("closed") === false;
      head.setAttribute("aria-expanded", open ? "true" : "false");
      groupOverride[grp.dataset.grp] = open;
      writeLS(GKEY, groupOverride);
      return;
    }

    var reveal = e.target.closest("[data-reveal]");
    if (reveal){
      var sec = document.getElementById(reveal.dataset.reveal);
      var opened = reveal.classList.toggle("on");
      sec.querySelectorAll(".sp").forEach(function(s){ s.classList.toggle("open", opened); });
      reveal.textContent = opened ? "Скрыть спойлеры раздела" : "Раскрыть спойлеры раздела";
      return;
    }

    var sp = e.target.closest(".sp");
    if (sp && !sp.classList.contains("open")){ sp.classList.add("open"); return; }
    if (sp) return;

    var li = e.target.closest("li.it");
    if (!li) return;
    var it = ITEMS[li.dataset.id];
    if (!it) return;

    var selection = window.getSelection && window.getSelection();
    if (selection && String(selection).length > 0 && !e.target.closest("[data-act]")) return;

    var btn = e.target.closest("[data-act]");
    var act = btn ? btn.dataset.act : "toggle";

    if (act === "plus")       window.Store.bump(it, 1);
    else if (act === "minus") window.Store.bump(it, -1);
    else                      window.Store.toggle(it);

    redrawItem(li);
    refreshMeters();
    applyFilters();
  });

  content.addEventListener("keydown", function(e){
    if (e.key !== "Enter" && e.key !== " ") return;
    var target = e.target.closest(".sp, .grp-h");
    if (!target) return;
    e.preventDefault();
    target.click();
  });

  content.addEventListener("mousedown", function(e){
    if (e.detail > 1 && e.target.closest(".sp:not(.open)")) e.preventDefault();
  });

  /* ---------- панель управления ---------- */
  var qInput = document.getElementById("q");
  var qTimer = null;
  qInput.addEventListener("input", function(e){
    filters.q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(function(){ syncMode(); applyFilters(); }, 120);
  });
  function bindChip(id, key, onToggle){
    var el = document.getElementById(id);
    el.classList.toggle("on", !!filters[key]);
    el.addEventListener("click", function(){
      filters[key] = !filters[key];
      el.classList.toggle("on", filters[key]);
      writeLS(FKEY, { todo:filters.todo, miss:filters.miss, spoil:filters.spoil });
      if (onToggle) onToggle(filters[key]);
      else { syncMode(); applyFilters(); }
    });
  }
  bindChip("fTodo","todo");
  bindChip("fMiss","miss");
  bindChip("fSpoil","spoil", function(on){ revealAll(on); });

  /* ---------- меню разделов ---------- */
  var burger = document.getElementById("burger");
  var scrim  = document.getElementById("scrim");
  function setNav(open){
    document.body.classList.toggle("nav-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  burger.addEventListener("click", function(){ setNav(!document.body.classList.contains("nav-open")); });
  scrim.addEventListener("click", function(){ setNav(false); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") setNav(false); });

  nav.addEventListener("click", function(e){
    var a = e.target.closest("a[data-nav]");
    if (!a) return;
    setNav(false);
    if (document.body.classList.contains("single")){
      e.preventDefault();
      showSection(a.dataset.nav);
    }
  });

  var prevBtn = document.getElementById("prevSec");
  var nextBtn = document.getElementById("nextSec");
  var pickBtn = document.getElementById("secPick");
  if (prevBtn) prevBtn.addEventListener("click", function(){ step(-1); });
  if (nextBtn) nextBtn.addEventListener("click", function(){ step(1); });
  if (pickBtn) pickBtn.addEventListener("click", function(){ setNav(true); });

  mq.addEventListener("change", function(){ renderAll(); });

  /* ---------- наверх и подсветка раздела ---------- */
  var totop = document.getElementById("totop");
  totop.addEventListener("click", function(){ window.scrollTo({top:0, behavior:"smooth"}); });
  var ticking = false;
  window.addEventListener("scroll", function(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function(){
      ticking = false;
      totop.classList.toggle("on", window.scrollY > 700);
      if (document.body.classList.contains("single")) return;
      var best = null, bd = 1e9;
      content.querySelectorAll("section.sec").forEach(function(s){
        if (s.hidden) return;
        var d = Math.abs(s.getBoundingClientRect().top - 90);
        if (d < bd){ bd = d; best = s.id; }
      });
      if (best) document.querySelectorAll("[data-nav]").forEach(function(a){ a.classList.toggle("on", a.dataset.nav === best); });
    });
  }, {passive:true});

  /* ---------- экспорт / импорт / сброс ---------- */
  function exportJson(){
    var blob = new Blob([JSON.stringify({app:"rdr2-100-tracker", v:1, data:window.Store.all()}, null, 1)], {type:"application/json"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rdr2-progress-" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  }
  var fileIn = document.getElementById("fileIn");
  function importJson(){ fileIn.click(); }
  fileIn.addEventListener("change", function(){
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var r = new FileReader();
    r.onload = function(){
      try {
        var j = JSON.parse(r.result);
        var d = (j && j.data) ? j.data : j;
        if (typeof d !== "object") throw 0;
        window.Store.mergeIn(d);
      } catch(e){ alert("Не удалось прочитать файл прогресса."); }
    };
    r.readAsText(f);
  });
  function resetAll(){
    if (!confirm("Сбросить весь прогресс? Отменить будет нельзя.")) return;
    window.Store.clear();
  }

  /* ---------- меню аккаунта ----------
     Живёт здесь, а не в auth.js: экспорт, импорт и сброс должны работать
     даже если Firebase не загрузился (нет сети, заблокирован CDN). */
  var acctBtn  = document.getElementById("acctBtn");
  var acctMenu = document.getElementById("acctMenu");
  var acctName = document.getElementById("acctName");
  var avatar   = document.getElementById("avatar");
  var foot     = document.getElementById("footStorage");

  function accountMenuHtml(){
    var u = window.Auth && window.Auth.user;
    var head, actions;
    if (u){
      head = '<div class="who"><b>' + (u.displayName || "Аккаунт") + '</b><span>' + (u.email || "") + '</span></div>';
      actions = '<button data-a="signout">Выйти</button>';
    } else {
      head = '<div class="who"><b>Вход не выполнен</b><span>Прогресс сохраняется только в этом браузере</span></div>';
      actions = '<button data-a="signin">Войти или зарегистрироваться</button>';
    }
    return head + actions +
      '<button data-a="export">Скачать прогресс в файл</button>' +
      '<button data-a="import">Загрузить прогресс из файла</button>' +
      '<button data-a="reset">Сбросить прогресс</button>';
  }
  function openMenu(open){
    if (open) acctMenu.innerHTML = accountMenuHtml();
    acctMenu.hidden = !open;
    acctBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  acctBtn.addEventListener("click", function(e){ e.stopPropagation(); openMenu(acctMenu.hidden); });
  document.addEventListener("click", function(e){ if (!acctMenu.hidden && !e.target.closest(".acct")) openMenu(false); });
  acctMenu.addEventListener("click", function(e){
    var b = e.target.closest("[data-a]");
    if (!b) return;
    openMenu(false);
    var a = b.dataset.a;
    if (a === "export") exportJson();
    if (a === "import") importJson();
    if (a === "reset")  resetAll();
    if (a === "signin"){
      if (window.Auth && window.Auth.openModal) window.Auth.openModal(true);
      else alert("Вход сейчас недоступен: не загрузился Firebase. Проверь соединение и обнови страницу.");
    }
    if (a === "signout" && window.Auth && window.Auth.signOut) window.Auth.signOut();
  });

  function refreshAccount(){
    var u = window.Auth && window.Auth.user;
    if (u){
      acctName.textContent = u.displayName || (u.email || "").split("@")[0] || "Аккаунт";
      avatar.innerHTML = u.photoURL ? '<img src="' + u.photoURL + '" alt="">' : (u.displayName || u.email || "?").trim().charAt(0).toUpperCase();
      foot.textContent = "Прогресс синхронизируется с облаком: можно продолжать с телефона и с компьютера.";
    } else {
      acctName.textContent = "Войти";
      avatar.textContent = "?";
      foot.textContent = "Прогресс хранится в этом браузере. Войди в аккаунт, чтобы он синхронизировался между телефоном и компьютером.";
    }
    if (!acctMenu.hidden) acctMenu.innerHTML = accountMenuHtml();
  }

  /* ---------- запуск ---------- */
  window.Store.init();
  renderAll();

  var rerenderTimer = null;
  window.Store.subscribe(function(state, source){
    if (source !== "external") return;
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(renderAll, 30);
  });

  return {
    sections: SECTIONS,
    items: ITEMS,
    render: renderAll,
    refresh: refreshMeters,
    refreshAccount: refreshAccount,
    showSection: showSection,
    exportJson: exportJson,
    importJson: importJson,
    resetAll: resetAll
  };
})();
