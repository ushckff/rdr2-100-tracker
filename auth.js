/* ============================================================
   auth.js — вход через Google / почту и синхронизация прогресса
   Модуль: подключается через <script type="module">.
   Всё, что связано с Firebase, живёт только здесь.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  browserLocalPersistence, setPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const Store = window.Store;
const app   = initializeApp(window.FIREBASE_CONFIG);
const auth  = getAuth(app);
const db    = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(function(){});

/* ---------- элементы ---------- */
const els = {
  sync:     document.getElementById("sync"),
  overlay:  document.getElementById("authOverlay"),
  title:    document.getElementById("authTitle"),
  lead:     document.getElementById("authLead"),
  email:    document.getElementById("authEmail"),
  pass:     document.getElementById("authPass"),
  err:      document.getElementById("authErr"),
  google:   document.getElementById("btnGoogle"),
  submit:   document.getElementById("btnEmail"),
  swapText: document.getElementById("swapText"),
  swapBtn:  document.getElementById("swapBtn"),
  close:    document.getElementById("btnClose")
};

let user = null;
let mode = "signin";          // signin | signup
let unsubscribeDoc = null;
let applyingRemote = false;

/* ---------- вспомогательное ---------- */
function setSync(text, cls){
  els.sync.textContent = text || "";
  els.sync.className = "sync" + (cls ? " " + cls : "");
}
function ruError(code){
  const map = {
    "auth/invalid-email": "Неверный адрес почты.",
    "auth/missing-password": "Введи пароль.",
    "auth/weak-password": "Пароль слишком короткий — минимум 6 символов.",
    "auth/email-already-in-use": "Такая почта уже зарегистрирована. Попробуй войти.",
    "auth/invalid-credential": "Неверная почта или пароль.",
    "auth/wrong-password": "Неверный пароль.",
    "auth/user-not-found": "Пользователь с такой почтой не найден.",
    "auth/too-many-requests": "Слишком много попыток. Подожди пару минут.",
    "auth/popup-closed-by-user": "Окно входа закрыто.",
    "auth/network-request-failed": "Нет связи с сервером. Проверь интернет.",
    "auth/unauthorized-domain": "Этот домен не разрешён в настройках Firebase."
  };
  return map[code] || ("Ошибка входа: " + code);
}

/* Меню аккаунта рисует app.js — он работает и без Firebase.
   Здесь только публичный интерфейс, которым это меню пользуется. */
window.Auth = {
  user: null,
  openModal: function(open){ openModal(open !== false); },
  signOut: function(){ Store.flush(); signOut(auth); }
};

/* ---------- модальное окно входа ---------- */
function openModal(open){
  els.overlay.hidden = !open;
  document.body.classList.toggle("no-scroll", open);
  if (open){ setMode("signin"); setTimeout(function(){ els.email.focus(); }, 30); }
}

function setMode(m){
  mode = m;
  const signin = m === "signin";
  els.title.textContent = signin ? "Вход" : "Регистрация";
  els.lead.textContent  = signin
    ? "Прогресс будет синхронизироваться между всеми твоими устройствами."
    : "Заведи аккаунт — и прогресс перестанет зависеть от одного браузера.";
  els.submit.textContent = signin ? "Войти" : "Создать аккаунт";
  els.swapText.textContent = signin ? "Ещё нет аккаунта?" : "Уже есть аккаунт?";
  els.swapBtn.textContent  = signin ? "Зарегистрироваться" : "Войти";
  els.pass.setAttribute("autocomplete", signin ? "current-password" : "new-password");
  els.err.textContent = "";
}
els.swapBtn.addEventListener("click", function(){ setMode(mode === "signin" ? "signup" : "signin"); });
els.close.addEventListener("click", function(){ openModal(false); });
els.overlay.addEventListener("click", function(e){ if (e.target === els.overlay) openModal(false); });
document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !els.overlay.hidden) openModal(false); });

/* ---------- вход ---------- */
els.google.addEventListener("click", async function(){
  els.err.textContent = "";
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    openModal(false);
  } catch (e){
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment" || e.code === "auth/cancelled-popup-request")){
      try { await signInWithRedirect(auth, provider); return; } catch(e2){ els.err.textContent = ruError(e2.code); return; }
    }
    if (e && e.code === "auth/popup-closed-by-user") return;
    els.err.textContent = ruError(e && e.code);
  }
});

els.submit.addEventListener("click", async function(){
  els.err.textContent = "";
  const email = els.email.value.trim();
  const pass  = els.pass.value;
  if (!email){ els.err.textContent = "Введи адрес почты."; return; }
  if (pass.length < 6){ els.err.textContent = "Пароль должен быть не короче 6 символов."; return; }
  els.submit.disabled = true;
  try {
    if (mode === "signup") await createUserWithEmailAndPassword(auth, email, pass);
    else                   await signInWithEmailAndPassword(auth, email, pass);
    openModal(false);
  } catch (e){
    els.err.textContent = ruError(e && e.code);
  } finally {
    els.submit.disabled = false;
  }
});
els.pass.addEventListener("keydown", function(e){ if (e.key === "Enter") els.submit.click(); });

getRedirectResult(auth).catch(function(){});

/* ---------- синхронизация ---------- */
function progressRef(uid){ return doc(db, "progress", uid); }

async function pushToCloud(state){
  if (!user || applyingRemote) return;
  try {
    setSync("сохраняю…");
    await setDoc(progressRef(user.uid), { data: state, updatedAt: serverTimestamp() }, { merge: false });
    setSync("сохранено", "on");
    setTimeout(function(){ if (els.sync.textContent === "сохранено") setSync("синхронизировано", "on"); }, 1800);
  } catch (e){
    console.error(e);
    setSync("не сохранилось", "err");
  }
}

async function startSync(u){
  setSync("подключаюсь…");
  try {
    const snap = await getDoc(progressRef(u.uid));
    const remote = snap.exists() ? (snap.data().data || {}) : {};
    applyingRemote = true;
    Store.applyRemote(remote);          // объединяем: локальное не теряется
    applyingRemote = false;
    await setDoc(progressRef(u.uid), { data: Store.all(), updatedAt: serverTimestamp() }, { merge: false });
    setSync("синхронизировано", "on");
  } catch (e){
    console.error(e);
    setSync("нет синхронизации", "err");
  }

  if (unsubscribeDoc) unsubscribeDoc();
  unsubscribeDoc = onSnapshot(progressRef(u.uid), function(snap){
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const remote = snap.data().data || {};
    applyingRemote = true;
    Store.applyRemote(remote);
    applyingRemote = false;
  }, function(e){ console.error(e); });
}

/* ---------- состояние входа ---------- */
onAuthStateChanged(auth, function(u){
  user = u;
  window.Auth.user = u;
  window.App.refreshAccount();
  if (u){
    Store.setCloudPush(pushToCloud);
    startSync(u);
  } else {
    Store.setCloudPush(null);
    if (unsubscribeDoc){ unsubscribeDoc(); unsubscribeDoc = null; }
    setSync("");
  }
});

window.addEventListener("beforeunload", function(){ Store.flush(); });
