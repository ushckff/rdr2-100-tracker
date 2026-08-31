/* ============================================================
   store.js — состояние прогресса
   Хранит объект вида { "<id пункта>": 1 | <число> }.
   Локально всегда пишет в localStorage; если подключён облачный
   обработчик (auth.js), дублирует туда с задержкой.
   ============================================================ */
window.Store = (function(){
  "use strict";
  var KEY = "rdr2-100-tracker-v1";
  var state = {};
  var subs = [];
  var cloudPush = null;     // функция, которую ставит auth.js
  var pushTimer = null;

  function loadLocal(){
    try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
    catch(e){ state = {}; }
    if (typeof state !== "object" || Array.isArray(state)) state = {};
    return state;
  }
  function saveLocal(){
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){}
  }

  /* source: "local"  — пользователь щёлкнул пункт (перерисовывать раздел не нужно)
     source: "external" — состояние пришло целиком: облако, импорт, сброс */
  function emit(source){
    subs.forEach(function(f){ try{ f(state, source || "local"); }catch(e){ console.error(e); } });
  }

  function schedulePush(){
    if (!cloudPush) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function(){ cloudPush(state); }, 900);
  }

  function changed(source){ saveLocal(); emit(source); schedulePush(); }

  /* объединение двух наборов прогресса: берём максимум по каждому пункту,
     чтобы вход в аккаунт никогда не стирал уже отмеченное */
  function mergeObjects(a, b){
    var out = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a,k)) out[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b,k)) {
      var cur = out[k], next = b[k];
      out[k] = (typeof cur === "number" && typeof next === "number") ? Math.max(cur,next) : (cur || next);
    }
    return out;
  }

  return {
    KEY: KEY,
    init: function(){ loadLocal(); return state; },
    all: function(){ return state; },
    get: function(id){ return state[id]; },
    isEmpty: function(){ for (var k in state) if (Object.prototype.hasOwnProperty.call(state,k)) return false; return true; },

    set: function(id, value){
      if (!value) delete state[id]; else state[id] = value;
      changed();
    },
    toggle: function(item){
      var id = item.i;
      if (item.n) state[id] = (+state[id] || 0) >= item.n ? 0 : item.n;
      else if (state[id]) delete state[id];
      else state[id] = 1;
      if (!state[id]) delete state[id];
      changed();
    },
    bump: function(item, delta){
      var v = Math.min(item.n, Math.max(0, (+state[item.i] || 0) + delta));
      if (v) state[item.i] = v; else delete state[item.i];
      changed();
    },

    /* полная замена (импорт файла, сброс) */
    replace: function(obj){
      state = (obj && typeof obj === "object" && !Array.isArray(obj)) ? obj : {};
      changed("external");
    },
    /* слияние с облаком или импортируемым файлом */
    mergeIn: function(obj){
      if (!obj || typeof obj !== "object") return;
      state = mergeObjects(state, obj);
      changed("external");
    },
    /* применить облачное состояние, ничего не отправляя обратно */
    applyRemote: function(obj){
      state = mergeObjects(state, obj || {});
      saveLocal(); emit("external");
    },
    clear: function(){ state = {}; changed("external"); },

    subscribe: function(fn){ subs.push(fn); return function(){ subs = subs.filter(function(f){return f!==fn;}); }; },
    setCloudPush: function(fn){ cloudPush = fn; },
    flush: function(){ if (cloudPush){ clearTimeout(pushTimer); cloudPush(state); } }
  };
})();
