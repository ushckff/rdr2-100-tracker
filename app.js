/* ============================================================
   app.js — сборка страницы и все обработчики
   Данные приходят из data-*.js, состояние из store.js,
   разметка из render.js. Авторизация подключается отдельно (auth.js).
   ============================================================ */
window.App = (function(){
  "use strict";

  var SECTIONS = window.RDR2_SECTIONS || [];
  var ITEMS    = window.Render.indexItems(SECTIONS);
  var HAY      = window.Render.buildIndex(SECTIONS);
  var FKEY     = "rdr2-tracker-filters";

  var content = document.getElementById("content");
  var nav     = document.getElementById("nav");

  var filters = { todo:false, miss:false, q:"", spoil:false };
  try { Object.assign(filters, JSON.parse(localStorage.getItem(FKEY) || "{}")); } catch(e){}
  filters.q = "";

  function saveFilters(){
    try { localStorage.setItem(FKEY, JSON.stringify({todo:filters.todo, miss:filters.miss, spoil:filters.spoil})); } catch(e){}
  }

  /* ---------- отрисовка ---------- */
  function renderAll(){
    var state = window.Store.all();
    content.innerHTML = SECTIONS.map(function(s){ return window.Render.sectionHtml(s, state); }).join("");
    nav.innerHTML = window.Render.navHtml(SECTIONS, state);
    if (filters.spoil) revealAll(true);
    applyFilters();
  }

  function refreshMeters(){
    var state = window.Store.all();
    var g = window.Render.globalStats(SECTIONS, state);
    var label = Math.round(g.done) + " / " + g.total + " · " + g.pct + "%";
    ["gpct","gpctM"].forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent = label; });
    ["gfill","gfillM"].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.width = g.pct + "%"; });

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
        a.classList.toggle("done", st.pct === 100);
      }
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

  /* ---------- фильтры ---------- */
  function applyFilters(){
    var q = filters.q.trim().toLowerCase();
    var state = window.Store.all();
    var anyFilter = filters.todo || filters.miss || q;

    document.querySelectorAll("section.sec").forEach(function(sec){
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
        g.hidden = total > 0 && g.querySelectorAll("li.it:not(.hide)").length === 0;
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
    var reveal = e.target.closest("[data-reveal]");
    if (reveal){
      var sec = document.getElementById(reveal.dataset.reveal);
      var opened = reveal.classList.toggle("on");
      sec.querySelectorAll(".sp").forEach(function(s){ s.classList.toggle("open", opened); });
      reveal.textContent = opened ? "Скрыть названия миссий" : "Раскрыть названия миссий";
      return;
    }

    var sp = e.target.closest(".sp");
    if (sp && !sp.classList.contains("open")){ sp.classList.add("open"); return; }
    if (sp) return;                                  // открытый спойлер — обычный текст

    var li = e.target.closest("li.it");
    if (!li) return;
    var it = ITEMS[li.dataset.id];
    if (!it) return;

    // если человек выделял текст — это не отметка пункта
    var selection = window.getSelection && window.getSelection();
    if (selection && String(selection).length > 0 && !e.target.closest("[data-act]")) return;

    var btn = e.target.closest("[data-act]");
    var act = btn ? btn.dataset.act : "toggle";      // клик по строке = переключение

    if (act === "plus")       window.Store.bump(it, 1);
    else if (act === "minus") window.Store.bump(it, -1);
    else                      window.Store.toggle(it);

    redrawItem(li);
    refreshMeters();
    applyFilters();
  });

  /* спойлер с клавиатуры */
  content.addEventListener("keydown", function(e){
    if (e.key !== "Enter" && e.key !== " ") return;
    var sp = e.target.closest(".sp");
    if (sp){ e.preventDefault(); sp.classList.add("open"); }
  });

  /* двойной клик по спойлеру не должен выделять текст под ним */
  content.addEventListener("mousedown", function(e){
    if (e.detail > 1 && e.target.closest(".sp:not(.open)")) e.preventDefault();
  });

  /* ---------- панель управления ---------- */
  document.getElementById("q").addEventListener("input", function(e){
    filters.q = e.target.value; applyFilters();
  });
  function bindChip(id, key, onToggle){
    var el = document.getElementById(id);
    el.classList.toggle("on", !!filters[key]);
    el.addEventListener("click", function(){
      filters[key] = !filters[key];
      el.classList.toggle("on", filters[key]);
      saveFilters();
      if (onToggle) onToggle(filters[key]); else applyFilters();
    });
  }
  bindChip("fTodo","todo");
  bindChip("fMiss","miss");
  bindChip("fSpoil","spoil", function(on){ revealAll(on); });

  /* ---------- мобильное меню ---------- */
  var burger = document.getElementById("burger");
  var scrim  = document.getElementById("scrim");
  function setNav(open){
    document.body.classList.toggle("nav-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  burger.addEventListener("click", function(){ setNav(!document.body.classList.contains("nav-open")); });
  scrim.addEventListener("click", function(){ setNav(false); });
  nav.addEventListener("click", function(e){ if (e.target.closest("a")) setNav(false); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") setNav(false); });

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
      var best = null, bd = 1e9;
      document.querySelectorAll("section.sec").forEach(function(s){
        if (s.hidden) return;
        var d = Math.abs(s.getBoundingClientRect().top - 90);
        if (d < bd){ bd = d; best = s.id; }
      });
      document.querySelectorAll("[data-nav]").forEach(function(a){ a.classList.toggle("on", a.dataset.nav === best); });
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

  /* auth.js вызывает это после каждой смены состояния входа */
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
  refreshMeters();

  var rerenderTimer = null;
  window.Store.subscribe(function(state, source){
    // локальные клики уже перерисовали свой пункт — полная перерисовка нужна
    // только когда состояние пришло целиком: из облака, импорта или сброса
    if (source !== "external") return;
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(function(){ renderAll(); refreshMeters(); }, 30);
  });

  return {
    sections: SECTIONS,
    items: ITEMS,
    render: renderAll,
    refresh: refreshMeters,
    refreshAccount: refreshAccount,
    exportJson: exportJson,
    importJson: importJson,
    resetAll: resetAll
  };
})();
