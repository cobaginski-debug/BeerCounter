// Strichliste – App-Logik
// Reines ES-Modul ohne Build-Schritt; das Firebase-Web-SDK wird per CDN geladen.
//
// Datenmodell in der Realtime Database (siehe database.rules.json):
//   groups/{groupId}/members/{memberId}        = { name, count, createdAt, hasPin }
//   groups/{groupId}/pins/{memberId}           = SHA-256-Hash der PIN (für niemanden lesbar)
//   groups/{groupId}/unlocks/{memberId}/{uid}  = PIN-Hash, mit dem ein Gerät entsperrt wurde
//   groups/{groupId}/meta/resetAt              = Zeitpunkt des letzten Resets

const FIREBASE_VERSION = "12.19.0"; // muss zur Version in sw.js passen
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
const PLACEHOLDER_PATTERN = /^(DEIN|HIER)|DEIN-PROJEKT/;
const MAX_NAME_LENGTH = 30;
const MAX_COUNT = 9999;
const UNDO_LIMIT = 20;
const TALLY_LIMIT = 40;
const VERIFY_TIMEOUT_MS = 10000;
const SLOW_LOADING_MS = 12000;
const OFFLINE_BANNER_DELAY_MS = 2500;

const $ = (selector) => document.querySelector(selector);

const el = {
  appTitle: $("#app-title"),
  appEmoji: $("#app-emoji"),
  status: $("#status"),
  statusText: $("#status-text"),
  totalBox: $("#total-box"),
  total: $("#total"),
  totalLabel: $("#total-label"),
  offlineBanner: $("#offline-banner"),
  installBanner: $("#install-banner"),
  installBannerClose: $("#install-banner-close"),
  loading: $("#screen-loading"),
  loadingHint: $("#loading-hint"),
  setup: $("#screen-setup"),
  setupTitle: $("#setup-title"),
  setupText: $("#setup-text"),
  setupList: $("#setup-list"),
  setupRetry: $("#setup-retry"),
  app: $("#screen-app"),
  list: $("#list"),
  empty: $("#empty"),
  emptyAdd: $("#empty-add"),
  footer: $("#list-footer"),
  shareBtn: $("#share-btn"),
  resetBtn: $("#reset-btn"),
  lastReset: $("#last-reset"),
  installBtn: $("#install-btn"),
  bottomBar: $("#bottom-bar"),
  undoBtn: $("#undo-btn"),
  undoLabel: $("#undo-label"),
  addBtn: $("#add-btn"),
  toast: $("#toast"),
  dlgAdd: $("#dlg-add"),
  addForm: $("#add-form"),
  addName: $("#add-name"),
  addPin: $("#add-pin"),
  addError: $("#add-error"),
  dlgPrompt: $("#dlg-prompt"),
  promptForm: $("#prompt-form"),
  promptTitle: $("#prompt-title"),
  promptLabel: $("#prompt-label"),
  promptInput: $("#prompt-input"),
  promptError: $("#prompt-error"),
  promptSubmit: $("#prompt-submit"),
  dlgPin: $("#dlg-pin"),
  pinTitle: $("#pin-title"),
  pinText: $("#pin-text"),
  pinDots: $("#pin-dots"),
  pinError: $("#pin-error"),
  pinPad: $("#pin-pad"),
  pinHint: $("#pin-hint"),
  dlgMember: $("#dlg-member"),
  memberTitle: $("#member-title"),
  memberText: $("#member-text"),
  memberActions: $("#member-actions"),
  dlgConfirm: $("#dlg-confirm"),
  confirmTitle: $("#confirm-title"),
  confirmText: $("#confirm-text"),
  confirmExtra: $("#confirm-extra"),
  confirmOk: $("#confirm-ok"),
};

const icons = {
  plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  more: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  unlock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.7-1.5"/></svg>',
  key: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4"/><path d="M10.5 12.5 20 3m-3.5 3.5 3 3m-5.5-1 2 2"/></svg>',
  user: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/></svg>',
};

const settings = {
  groupId: "",
  title: "Strichliste",
  itemSingular: "Bier",
  itemPlural: "Biere",
  emoji: "🍺",
};

const state = {
  fb: null,
  db: null,
  base: "",
  uid: "",
  ready: false,
  membersLoaded: false,
  resetAtLoaded: false,
  members: new Map(),
  resetAt: null,
  online: false,
  offlineTimer: 0,
  meId: null,
  unlocked: new Set(),
  undo: [],
  installPrompt: null,
};

// ---------- Hilfsfunktionen ----------

const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Speicher voll oder gesperrt (z. B. privater Modus) – dann eben ohne.
    }
  },
};

const storeKey = (name) => `strichliste:${settings.groupId}:${name}`;

function items(count) {
  return `${count} ${count === 1 ? settings.itemSingular : settings.itemPlural}`;
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration nicht verfügbar (z. B. iOS)
  }
}

function isPermissionDenied(err) {
  return /permission[_ ]denied/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Zeitüberschreitung – bitte erneut versuchen.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeName(value) {
  return value.replace(/\s+/g, " ").trim();
}

function validateName(name, ignoreId = null) {
  if (!name) return "Bitte einen Namen eingeben.";
  if (name.length > MAX_NAME_LENGTH) return `Höchstens ${MAX_NAME_LENGTH} Zeichen.`;
  for (const member of state.members.values()) {
    if (member.id !== ignoreId && collator.compare(member.name, name) === 0) return `„${name}“ steht schon auf der Liste.`;
  }
  return "";
}

async function hashPin(memberId, pin) {
  if (!crypto?.subtle) throw new Error("PINs funktionieren nur über HTTPS.");
  const data = new TextEncoder().encode(`strichliste:${settings.groupId}:${memberId}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

let toastTimer = 0;
function toast(message, type = "info") {
  el.toast.textContent = message;
  el.toast.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), type === "error" ? 4500 : 2600);
}

// ---------- Start ----------

main().catch((err) => {
  console.error(err);
  showSetup("Unerwarteter Fehler", "Beim Starten ist etwas schiefgelaufen.", [String(err?.message || err)]);
});

async function main() {
  registerServiceWorker();
  setupInstallHints();
  bindStaticEvents();

  let config;
  try {
    config = await import("./config.js");
  } catch (err) {
    showSetup(
      "config.js ist fehlerhaft",
      "Die Datei config.js konnte nicht gelesen werden. Meist ist es ein kleiner Tippfehler, z. B. ein fehlendes Anführungszeichen, Komma oder eine Klammer.",
      [String(err?.message || err)],
    );
    return;
  }

  applySettings(config.appConfig);
  const problems = findConfigProblems(config.firebaseConfig, config.appConfig);
  if (problems.length) {
    showSetup("Noch nicht eingerichtet", "Bitte trage in config.js noch Folgendes ein:", problems);
    return;
  }

  let fb;
  try {
    fb = await loadFirebase();
  } catch (err) {
    showSetup("Firebase konnte nicht geladen werden", "Prüfe deine Internetverbindung und versuche es erneut.", [String(err?.message || err)]);
    return;
  }
  state.fb = fb;

  let app;
  let auth;
  try {
    app = fb.initializeApp(config.firebaseConfig);
    auth = fb.getAuth(app);
    await auth.authStateReady();
    if (!auth.currentUser) await fb.signInAnonymously(auth);
    state.uid = auth.currentUser.uid;
  } catch (err) {
    const [title, text] = describeAuthError(err);
    showSetup(title, text, [err?.code || String(err?.message || err)]);
    return;
  }

  try {
    state.db = fb.getDatabase(app);
  } catch (err) {
    showSetup("databaseURL ist ungültig", "Prüfe den Wert databaseURL in config.js (README, Schritt 5).", [String(err?.message || err)]);
    return;
  }

  state.base = `groups/${settings.groupId}`;
  state.meId = storage.get(storeKey("me"), null);
  state.unlocked = new Set(storage.get(storeKey(`unlocked:${state.uid}`), []));
  state.undo = storage.get(storeKey("undo"), []).filter(isValidUndoEntry);

  const { ref, onValue } = fb;
  onValue(ref(state.db, ".info/connected"), (snap) => setOnline(snap.val() === true));
  onValue(ref(state.db, `${state.base}/members`), handleMembers, handleReadError);
  onValue(ref(state.db, `${state.base}/meta/resetAt`), handleResetAt, handleReadError);

  setTimeout(() => {
    if (!state.ready && el.setup.hidden) el.loadingHint.hidden = false;
  }, SLOW_LOADING_MS);
}

async function loadFirebase() {
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import(`${FIREBASE_CDN}/firebase-app.js`),
    import(`${FIREBASE_CDN}/firebase-auth.js`),
    import(`${FIREBASE_CDN}/firebase-database.js`),
  ]);
  return {
    initializeApp: appSdk.initializeApp,
    getAuth: authSdk.getAuth,
    signInAnonymously: authSdk.signInAnonymously,
    getDatabase: dbSdk.getDatabase,
    ref: dbSdk.ref,
    child: dbSdk.child,
    push: dbSdk.push,
    set: dbSdk.set,
    update: dbSdk.update,
    onValue: dbSdk.onValue,
    increment: dbSdk.increment,
    serverTimestamp: dbSdk.serverTimestamp,
  };
}

function applySettings(appConfig = {}) {
  for (const key of ["title", "itemSingular", "itemPlural", "emoji"]) {
    const value = appConfig?.[key];
    if (typeof value === "string" && value.trim()) settings[key] = value.trim();
  }
  settings.groupId = typeof appConfig?.groupId === "string" ? appConfig.groupId.trim() : "";
  el.appTitle.textContent = settings.title;
  el.appEmoji.textContent = settings.emoji;
  el.totalLabel.textContent = `${settings.itemPlural} gesamt`;
  document.title = settings.title;
}

function findConfigProblems(firebaseConfig, appConfig) {
  const problems = [];
  if (!firebaseConfig || typeof firebaseConfig !== "object") {
    return ["firebaseConfig fehlt in config.js."];
  }
  for (const key of ["apiKey", "authDomain", "databaseURL", "projectId", "appId"]) {
    const value = firebaseConfig[key];
    if (typeof value !== "string" || !value.trim() || PLACEHOLDER_PATTERN.test(value)) {
      problems.push(`firebaseConfig.${key} – noch ein Platzhalter`);
    }
  }
  const url = firebaseConfig.databaseURL;
  if (typeof url === "string" && !PLACEHOLDER_PATTERN.test(url) && !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/?]/.test(url)) {
    problems.push("firebaseConfig.databaseURL muss mit https:// beginnen");
  }
  const groupId = typeof appConfig?.groupId === "string" ? appConfig.groupId.trim() : "";
  if (!GROUP_ID_PATTERN.test(groupId) || PLACEHOLDER_PATTERN.test(groupId)) {
    problems.push("appConfig.groupId – eigene geheime Gruppen-ID mit mindestens 12 Zeichen (nur A–Z, a–z, 0–9, - und _)");
  }
  return problems;
}

function describeAuthError(err) {
  const code = err?.code || "";
  if (["auth/operation-not-allowed", "auth/admin-restricted-operation", "auth/configuration-not-found"].includes(code)) {
    return [
      "Anonyme Anmeldung ist nicht aktiviert",
      "Aktiviere in der Firebase-Konsole unter Authentication → Anmeldemethode (Sign-in method) den Anbieter „Anonym“ (README, Schritt 2).",
    ];
  }
  if (code.startsWith("auth/api-key") || code === "auth/invalid-api-key") {
    return ["API-Key ungültig", "Prüfe den Wert apiKey in config.js (README, Schritt 5)."];
  }
  if (code === "auth/network-request-failed") {
    return ["Keine Verbindung", "Beim ersten Start wird eine Internetverbindung benötigt. Bitte versuche es gleich noch einmal."];
  }
  if (code === "auth/unauthorized-domain" || code.includes("referer")) {
    return ["Domain nicht freigegeben", "Füge die Adresse dieser Seite in Firebase unter Authentication → Einstellungen → Autorisierte Domains hinzu (README, Schritt 8)."];
  }
  return ["Anmeldung fehlgeschlagen", "Die anonyme Anmeldung bei Firebase hat nicht geklappt."];
}

function showSetup(title, text, problems = []) {
  el.loading.hidden = true;
  el.app.hidden = true;
  el.bottomBar.hidden = true;
  el.totalBox.hidden = true;
  el.setup.hidden = false;
  el.setupTitle.textContent = title;
  el.setupText.textContent = text;
  el.setupList.replaceChildren(
    ...problems.map((problem) => {
      const li = document.createElement("li");
      li.textContent = problem;
      return li;
    }),
  );
  el.status.className = "status offline";
  el.statusText.textContent = "Nicht verbunden";
}

function showApp() {
  if (state.ready) return;
  state.ready = true;
  el.loading.hidden = true;
  el.setup.hidden = true;
  el.app.hidden = false;
  el.bottomBar.hidden = false;
  el.totalBox.hidden = false;
  setOnline(state.online);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("Service Worker nicht registriert:", err));
  }
}

function setupInstallHints() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    el.installBtn.hidden = false;
  });
  el.installBtn.addEventListener("click", async () => {
    const prompt = state.installPrompt;
    state.installPrompt = null;
    el.installBtn.hidden = true;
    if (prompt) await prompt.prompt();
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos && !storage.get("strichliste:install-hint-dismissed", false)) {
    el.installBanner.hidden = false;
    el.installBannerClose.addEventListener("click", () => {
      el.installBanner.hidden = true;
      storage.set("strichliste:install-hint-dismissed", true);
    });
  }
}

function bindStaticEvents() {
  el.setupRetry.addEventListener("click", () => location.reload());
  el.list.addEventListener("click", onListClick);
  el.addBtn.addEventListener("click", addMember);
  el.emptyAdd.addEventListener("click", addMember);
  el.undoBtn.addEventListener("click", undoLast);
  el.resetBtn.addEventListener("click", resetAll);
  el.shareBtn.addEventListener("click", shareStandings);
}

// ---------- Daten aus Firebase ----------

function handleReadError(err) {
  console.error(err);
  if (isPermissionDenied(err)) {
    showSetup("Zugriff verweigert", "Die Datenbank hat den Zugriff abgelehnt. Bitte prüfe:", [
      "Sind die Regeln aus database.rules.json in Firebase veröffentlicht? (README, Schritt 4)",
      "Ist appConfig.groupId gültig (mindestens 12 Zeichen, nur A–Z, a–z, 0–9, - und _)?",
    ]);
  } else {
    showSetup("Datenbankfehler", "Die Daten konnten nicht geladen werden.", [String(err?.message || err)]);
  }
}

function handleMembers(snap) {
  const members = new Map();
  snap.forEach((child) => {
    const value = child.val();
    if (value && typeof value.name === "string") {
      members.set(child.key, {
        id: child.key,
        name: value.name,
        count: Number.isFinite(value.count) ? value.count : 0,
        hasPin: value.hasPin === true,
        createdAt: Number(value.createdAt) || 0,
      });
    }
  });
  state.members = members;

  // Lokale Zustände aufräumen, die nicht mehr passen
  let unlockedChanged = false;
  for (const id of state.unlocked) {
    if (!members.get(id)?.hasPin) {
      state.unlocked.delete(id);
      unlockedChanged = true;
    }
  }
  if (unlockedChanged) saveUnlocked();
  if (state.meId && !members.has(state.meId)) setMe(null);
  const undoBefore = state.undo.length;
  state.undo = state.undo.filter((entry) => members.has(entry.memberId));
  if (state.undo.length !== undoBefore) saveUndo();

  state.membersLoaded = true;
  if (state.resetAtLoaded) showApp();
  render();
}

function handleResetAt(snap) {
  const value = typeof snap.val() === "number" ? snap.val() : null;
  if (!state.resetAtLoaded) {
    // Rückgängig-Einträge von vor dem letzten Reset verwerfen
    state.undo = state.undo.filter((entry) => entry.resetAt === value);
    saveUndo();
  } else if (value !== state.resetAt) {
    clearUndo();
  }
  state.resetAt = value;
  state.resetAtLoaded = true;
  if (state.membersLoaded) showApp();
  render();
}

function setOnline(online) {
  state.online = online;
  if (!state.ready) return;
  el.status.className = `status ${online ? "online" : "offline"}`;
  el.statusText.textContent = online ? "Live synchronisiert" : "Offline";
  clearTimeout(state.offlineTimer);
  if (online) {
    el.offlineBanner.hidden = true;
  } else {
    state.offlineTimer = setTimeout(() => {
      el.offlineBanner.hidden = state.online;
    }, OFFLINE_BANNER_DELAY_MS);
  }
}

// ---------- Darstellung ----------

function sortedMembers() {
  return [...state.members.values()].sort(
    (a, b) =>
      Number(b.id === state.meId) - Number(a.id === state.meId) ||
      collator.compare(a.name, b.name) ||
      a.createdAt - b.createdAt,
  );
}

function medalsFor(members) {
  const medals = new Map();
  if (members.length < 2) return medals;
  const top = [...new Set(members.map((m) => m.count).filter((count) => count > 0))].sort((a, b) => b - a).slice(0, 3);
  for (const member of members) {
    const rank = top.indexOf(member.count);
    if (rank !== -1) medals.set(member.id, ["🥇", "🥈", "🥉"][rank]);
  }
  return medals;
}

function isLocked(member) {
  return member.hasPin && !state.unlocked.has(member.id);
}

function render() {
  if (!state.ready) return;
  const members = sortedMembers();
  const total = members.reduce((sum, member) => sum + member.count, 0);
  const medals = medalsFor(members);

  el.total.textContent = String(total);
  el.totalLabel.textContent = `${total === 1 ? settings.itemSingular : settings.itemPlural} gesamt`;

  const cards = new Map([...el.list.children].map((li) => [li.dataset.id, li]));
  for (const [id, li] of cards) {
    if (!state.members.has(id)) li.remove();
  }
  members.forEach((member, index) => {
    const li = cards.get(member.id) ?? createCard(member.id);
    updateCard(li, member, medals.get(member.id));
    if (el.list.children[index] !== li) el.list.insertBefore(li, el.list.children[index] ?? null);
  });

  el.empty.hidden = members.length > 0;
  el.footer.hidden = members.length === 0;
  el.resetBtn.disabled = total === 0;
  el.lastReset.textContent = state.resetAt ? `Zuletzt zurückgesetzt: ${dateFormat.format(state.resetAt)}` : "";
  renderUndo();
}

function createCard(id) {
  const li = document.createElement("li");
  li.className = "card";
  li.dataset.id = id;
  li.innerHTML = `
    <button type="button" class="card-head" data-action="menu">
      <span class="card-name"></span>
      <span class="card-badges"></span>
      <span class="card-more" aria-hidden="true">${icons.more}</span>
    </button>
    <div class="tally" aria-hidden="true"></div>
    <div class="card-controls">
      <button type="button" class="btn-count btn-minus" data-action="minus">${icons.minus}</button>
      <div class="count"><span class="count-num"></span><span class="count-unit"></span></div>
      <button type="button" class="btn-count btn-plus" data-action="plus">${icons.plus}<span class="lock-hint">${icons.lock}</span></button>
    </div>`;
  return li;
}

function updateCard(li, member, medal) {
  const locked = isLocked(member);
  const isMe = member.id === state.meId;
  li.classList.toggle("is-me", isMe);
  li.classList.toggle("is-locked", locked);

  li.querySelector(".card-name").textContent = member.name;
  li.querySelector(".card-head").setAttribute("aria-label", `Optionen für ${member.name}`);

  const badges = [];
  if (isMe) badges.push(badge("Du", "badge-me"));
  if (medal) badges.push(badge(medal, "badge-medal"));
  if (member.hasPin) {
    const lockBadge = badge("", locked ? "badge-locked" : "");
    lockBadge.innerHTML = locked ? icons.lock : icons.unlock;
    lockBadge.title = locked ? "Mit PIN geschützt" : "Auf diesem Gerät entsperrt";
    badges.push(lockBadge);
  }
  li.querySelector(".card-badges").replaceChildren(...badges);

  const previous = Number(li.dataset.count);
  if (previous !== member.count) {
    li.dataset.count = String(member.count);
    li.querySelector(".count-num").textContent = String(member.count);
    li.querySelector(".tally").innerHTML = tallyMarkup(member.count);
    if (!Number.isNaN(previous)) {
      restartAnimation(li.querySelector(".count"), "bump");
      restartAnimation(li, "flash");
    }
  }
  li.querySelector(".count-unit").textContent = member.count === 1 ? settings.itemSingular : settings.itemPlural;

  const minus = li.querySelector(".btn-minus");
  const plus = li.querySelector(".btn-plus");
  minus.disabled = member.count <= 0;
  minus.setAttribute("aria-label", `Einen Strich weniger für ${member.name}`);
  plus.setAttribute("aria-label", `${locked ? "Mit PIN entsperren und " : ""}einen Strich mehr für ${member.name}`);
}

function badge(text, className) {
  const span = document.createElement("span");
  span.className = `badge ${className}`.trim();
  span.textContent = text;
  return span;
}

function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // Reflow, damit die Animation neu startet
  node.classList.add(className);
}

function tallyMarkup(count) {
  const shown = Math.min(count, TALLY_LIMIT);
  if (shown <= 0) return "";
  const groupWidth = 24;
  const groups = Math.ceil(shown / 5);
  let path = "";
  for (let group = 0; group < groups; group++) {
    const strokes = Math.min(5, shown - group * 5);
    const x = group * groupWidth + 3;
    for (let i = 0; i < Math.min(strokes, 4); i++) path += `M${x + i * 5} 3V19`;
    if (strokes === 5) path += `M${x - 2} 16L${x + 17} 6`;
  }
  const width = groups * groupWidth;
  const more = count > TALLY_LIMIT ? "<span>…</span>" : "";
  return `<svg viewBox="0 0 ${width} 22" width="${width}" height="22"><path d="${path}"/></svg>${more}`;
}

function renderUndo() {
  const entry = state.undo[state.undo.length - 1];
  const member = entry && state.members.get(entry.memberId);
  el.undoBtn.disabled = !member;
  el.undoLabel.textContent = member ? `${entry.delta > 0 ? "+1" : "−1"} bei ${member.name}` : "Noch nichts gezählt";
}

// ---------- Zählen & Rückgängig ----------

function onListClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const member = state.members.get(button.closest(".card")?.dataset.id);
  if (!member) return;
  const action = button.dataset.action;
  if (action === "plus") changeCount(member, 1);
  else if (action === "minus") changeCount(member, -1);
  else if (action === "menu") openMemberMenu(member);
}

async function changeCount(member, delta) {
  if (delta < 0 && member.count <= 0) {
    const count = el.list.querySelector(`[data-id="${CSS.escape(member.id)}"] .count`);
    if (count) restartAnimation(count, "shake");
    return;
  }
  const access = await ensureAccess(member, "Zum Zählen bitte die PIN eingeben.");
  const current = state.members.get(member.id);
  if (!access || !current) return;
  if (delta < 0 && current.count <= 0) return;
  if (delta > 0 && current.count >= MAX_COUNT) {
    toast(`Mehr als ${MAX_COUNT} geht nicht – Respekt!`);
    return;
  }

  vibrate(delta > 0 ? 12 : [8, 40, 8]);
  const entry = { memberId: current.id, delta, at: Date.now(), resetAt: state.resetAt };
  pushUndo(entry);
  writeCount(current.id, delta).catch((err) => {
    removeUndo(entry);
    handleWriteError(err, current);
  });
}

function writeCount(memberId, delta) {
  const { ref, set, increment } = state.fb;
  return set(ref(state.db, `${state.base}/members/${memberId}/count`), increment(delta));
}

async function undoLast() {
  const entry = state.undo[state.undo.length - 1];
  if (!entry) return;
  const member = state.members.get(entry.memberId);
  removeUndo(entry);
  if (!member) {
    toast("Dieses Mitglied gibt es nicht mehr.");
    return;
  }
  if (entry.delta > 0 && member.count <= 0) {
    toast(`${member.name} steht schon auf 0.`);
    return;
  }
  if (!(await ensureAccess(member, "Zum Rückgängigmachen bitte die PIN eingeben."))) {
    pushUndo(entry);
    return;
  }
  vibrate([6, 30, 6]);
  writeCount(member.id, -entry.delta).catch((err) => handleWriteError(err, member));
  toast(`Rückgängig: ${entry.delta > 0 ? "+1" : "−1"} bei ${member.name}`);
}

function isValidUndoEntry(entry) {
  return entry && typeof entry.memberId === "string" && (entry.delta === 1 || entry.delta === -1);
}

function pushUndo(entry) {
  state.undo.push(entry);
  if (state.undo.length > UNDO_LIMIT) state.undo.splice(0, state.undo.length - UNDO_LIMIT);
  saveUndo();
  renderUndo();
}

function removeUndo(entry) {
  const index = state.undo.lastIndexOf(entry);
  if (index !== -1) state.undo.splice(index, 1);
  saveUndo();
  renderUndo();
}

function clearUndo() {
  state.undo = [];
  saveUndo();
  renderUndo();
}

function saveUndo() {
  storage.set(storeKey("undo"), state.undo);
}

function handleWriteError(err, member) {
  console.warn(err);
  if (isPermissionDenied(err)) {
    if (member?.hasPin && state.unlocked.has(member.id)) {
      state.unlocked.delete(member.id);
      saveUnlocked();
      render();
      toast(`Die PIN von ${member.name} wurde geändert – bitte neu entsperren.`, "error");
    } else {
      toast("Die Änderung wurde vom Server abgelehnt.", "error");
    }
  } else {
    toast(`Speichern fehlgeschlagen: ${err?.message || err}`, "error");
  }
}

// ---------- PIN ----------

function saveUnlocked() {
  storage.set(storeKey(`unlocked:${state.uid}`), [...state.unlocked]);
}

async function ensureAccess(member, text) {
  if (!isLocked(member)) return true;
  return unlockMember(member, text);
}

async function unlockMember(member, text = "Bitte die 4-stellige PIN eingeben.") {
  if (!state.online) {
    toast("Zum Entsperren wird eine Internetverbindung benötigt.", "error");
    return false;
  }
  const { ref, set } = state.fb;
  const pin = await askPin({
    title: `PIN für ${member.name}`,
    text,
    hint: "PIN vergessen? Wer die PIN kennt, kann sie im Menü ändern. Steht der Zähler auf 0, lässt sich das Mitglied auch ohne PIN entfernen.",
    errorText: "Falsche PIN – bitte noch einmal.",
    verify: async (digits) => {
      const hash = await hashPin(member.id, digits);
      try {
        await withTimeout(set(ref(state.db, `${state.base}/unlocks/${member.id}/${state.uid}`), hash), VERIFY_TIMEOUT_MS);
        return true;
      } catch (err) {
        if (isPermissionDenied(err)) return false;
        throw err;
      }
    },
  });
  if (!pin) return false;
  state.unlocked.add(member.id);
  saveUnlocked();
  render();
  return true;
}

async function setPin(member) {
  if (!state.online) {
    toast("Dafür wird eine Internetverbindung benötigt.", "error");
    return;
  }
  const pin = await askPin({ title: `PIN für ${member.name} festlegen`, text: "Wähle 4 Ziffern.", repeat: true });
  if (!pin) return;
  const { ref, update } = state.fb;
  try {
    const hash = await hashPin(member.id, pin);
    const updates = {
      [`pins/${member.id}`]: hash,
      [`unlocks/${member.id}/${state.uid}`]: hash,
    };
    if (!member.hasPin) updates[`members/${member.id}/hasPin`] = true;
    await withTimeout(update(ref(state.db, state.base), updates), VERIFY_TIMEOUT_MS);
    state.unlocked.add(member.id);
    saveUnlocked();
    render();
    toast(member.hasPin ? "PIN geändert." : `${member.name} ist jetzt mit PIN geschützt.`);
  } catch (err) {
    handleWriteError(err, member);
  }
}

async function removePin(member) {
  const choice = await confirmDialog({
    title: "PIN entfernen?",
    text: `Danach kann jede und jeder bei ${member.name} zählen.`,
    confirmLabel: "PIN entfernen",
    danger: true,
  });
  if (choice !== "confirm") return;
  const { ref, update } = state.fb;
  try {
    await withTimeout(
      update(ref(state.db, state.base), {
        [`pins/${member.id}`]: null,
        [`members/${member.id}/hasPin`]: false,
        [`unlocks/${member.id}`]: null,
      }),
      VERIFY_TIMEOUT_MS,
    );
    state.unlocked.delete(member.id);
    saveUnlocked();
    render();
    toast("PIN entfernt.");
  } catch (err) {
    handleWriteError(err, member);
  }
}

function lockOnThisDevice(member) {
  const { ref, set } = state.fb;
  state.unlocked.delete(member.id);
  saveUnlocked();
  render();
  set(ref(state.db, `${state.base}/unlocks/${member.id}/${state.uid}`), null).catch((err) => console.warn(err));
  toast(`${member.name} ist auf diesem Gerät wieder gesperrt.`);
}

// ---------- Mitglieder verwalten ----------

async function addMember() {
  el.addName.value = "";
  el.addPin.checked = false;
  el.addError.textContent = "";
  const result = await modal(el.dlgAdd, ({ done, signal }) => {
    el.addForm.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const name = normalizeName(el.addName.value);
        const problem = validateName(name);
        if (problem) {
          el.addError.textContent = problem;
          el.addName.focus();
          return;
        }
        done({ name, withPin: el.addPin.checked });
      },
      { signal },
    );
    el.addName.addEventListener("input", () => (el.addError.textContent = ""), { signal });
  });
  if (!result) return;

  let pin = null;
  if (result.withPin) {
    pin = await askPin({ title: `PIN für ${result.name}`, text: "Wähle 4 Ziffern.", repeat: true });
    if (!pin) return;
  }

  const { ref, push, update, serverTimestamp } = state.fb;
  const id = push(ref(state.db, `${state.base}/members`)).key;
  const updates = {
    [`members/${id}`]: { name: result.name, count: 0, createdAt: serverTimestamp(), hasPin: Boolean(pin) },
  };
  try {
    if (pin) {
      const hash = await hashPin(id, pin);
      updates[`pins/${id}`] = hash;
      updates[`unlocks/${id}/${state.uid}`] = hash;
      state.unlocked.add(id);
      saveUnlocked();
    }
  } catch (err) {
    toast(err.message, "error");
    return;
  }
  update(ref(state.db, state.base), updates).catch((err) => {
    state.unlocked.delete(id);
    saveUnlocked();
    handleWriteError(err);
  });
  toast(`${result.name} ist jetzt auf der Liste.`);
}

async function renameMember(member) {
  if (!(await ensureAccess(member, "Zum Umbenennen bitte die PIN eingeben."))) return;
  const name = await promptText({
    title: "Umbenennen",
    label: "Neuer Name",
    value: member.name,
    submitLabel: "Speichern",
    validate: (value) => validateName(value, member.id),
  });
  if (!name || name === member.name) return;
  const { ref, set } = state.fb;
  set(ref(state.db, `${state.base}/members/${member.id}/name`), name).catch((err) => handleWriteError(err, member));
}

async function removeMember(member) {
  const choice = await confirmDialog({
    title: `${member.name} entfernen?`,
    text: member.count > 0 ? `Der Zählerstand (${items(member.count)}) geht dabei verloren.` : "Das Mitglied wird von der Liste gelöscht.",
    confirmLabel: "Entfernen",
    danger: true,
  });
  if (choice !== "confirm") return;
  const current = state.members.get(member.id);
  if (!current) return;
  if (current.count > 0 && !(await ensureAccess(current, "Zum Entfernen bitte die PIN eingeben."))) return;

  const { ref, update } = state.fb;
  update(ref(state.db, state.base), {
    [`members/${member.id}`]: null,
    [`pins/${member.id}`]: null,
    [`unlocks/${member.id}`]: null,
  }).catch((err) => handleWriteError(err, current));
  toast(`${member.name} wurde entfernt.`);
}

function setMe(id) {
  state.meId = id;
  storage.set(storeKey("me"), id);
}

async function openMemberMenu(member) {
  const locked = isLocked(member);
  const isMe = member.id === state.meId;
  const actions = [
    { id: "me", label: isMe ? "Nicht mehr als „Du“ markieren" : "Das bin ich", icon: icons.user },
    { id: "rename", label: "Umbenennen", icon: icons.edit },
  ];
  if (!member.hasPin) {
    actions.push({ id: "pin-set", label: "Mit PIN schützen", icon: icons.lock });
  } else if (locked) {
    actions.push({ id: "unlock", label: "Mit PIN entsperren", icon: icons.unlock });
  } else {
    actions.push(
      { id: "pin-set", label: "PIN ändern", icon: icons.key },
      { id: "pin-remove", label: "PIN entfernen", icon: icons.unlock },
      { id: "lock", label: "Auf diesem Gerät sperren", icon: icons.lock },
    );
  }
  actions.push({ id: "remove", label: "Mitglied entfernen", icon: icons.trash, danger: true });

  el.memberTitle.textContent = member.name;
  el.memberText.textContent = `${items(member.count)}${member.hasPin ? (locked ? " · mit PIN geschützt" : " · auf diesem Gerät entsperrt") : ""}`;

  const choice = await modal(el.dlgMember, ({ done, signal }) => {
    el.memberActions.replaceChildren(
      ...actions.map((action) => {
        const button = document.createElement("button");
        button.type = "button";
        if (action.danger) button.className = "is-danger";
        button.innerHTML = action.icon;
        button.append(action.label);
        button.addEventListener("click", () => done(action.id), { signal });
        return button;
      }),
    );
  });

  const current = state.members.get(member.id);
  if (!choice || !current) return;
  switch (choice) {
    case "me":
      setMe(isMe ? null : current.id);
      render();
      if (!isMe) window.scrollTo({ top: 0, behavior: "smooth" });
      break;
    case "rename":
      await renameMember(current);
      break;
    case "pin-set":
      await setPin(current);
      break;
    case "pin-remove":
      await removePin(current);
      break;
    case "unlock":
      if (await unlockMember(current)) toast(`${current.name} ist auf diesem Gerät entsperrt.`);
      break;
    case "lock":
      lockOnThisDevice(current);
      break;
    case "remove":
      await removeMember(current);
      break;
  }
}

// ---------- Gesamtstand ----------

async function shareStandings() {
  const members = [...state.members.values()].sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
  const total = members.reduce((sum, member) => sum + member.count, 0);
  const text = [
    `${settings.emoji} ${settings.title} – Stand ${dateFormat.format(Date.now())}`,
    "",
    ...members.map((member) => `${member.name}: ${member.count}`),
    "",
    `Gesamt: ${items(total)}`,
  ].join("\n");

  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Stand in die Zwischenablage kopiert.");
  } catch {
    toast("Teilen wird von diesem Browser leider nicht unterstützt.", "error");
  }
}

async function resetAll() {
  for (;;) {
    const members = [...state.members.values()];
    const total = members.reduce((sum, member) => sum + member.count, 0);
    if (total === 0) return;
    const choice = await confirmDialog({
      title: "Alle Zähler zurücksetzen?",
      text: `${items(total)} bei ${members.length} ${members.length === 1 ? "Mitglied" : "Mitgliedern"} werden auf 0 gesetzt. Das kann nicht rückgängig gemacht werden.`,
      confirmLabel: "Alles auf 0",
      danger: true,
      extraLabel: "Vorher Stand teilen",
    });
    if (choice === "extra") {
      await shareStandings();
      continue;
    }
    if (choice !== "confirm") return;
    break;
  }

  const { ref, update, serverTimestamp } = state.fb;
  const updates = { "meta/resetAt": serverTimestamp() };
  for (const member of state.members.values()) {
    if (member.count !== 0) updates[`members/${member.id}/count`] = 0;
  }
  clearUndo();
  vibrate(30);
  update(ref(state.db, state.base), updates).catch((err) => handleWriteError(err));
  toast("Alle Zähler stehen wieder auf 0.");
}

// ---------- Dialoge ----------

// Öffnet einen <dialog> und liefert ein Promise mit dem Ergebnis (null = abgebrochen).
function modal(dialog, setup) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    const done = (value) => {
      if (signal.aborted) return;
      controller.abort();
      if (dialog.open) dialog.close();
      resolve(value);
    };
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        done(null);
      },
      { signal },
    );
    dialog.addEventListener(
      "click",
      (event) => {
        if (event.target === dialog) done(null);
      },
      { signal },
    );
    for (const button of dialog.querySelectorAll("[data-cancel]")) {
      button.addEventListener("click", () => done(null), { signal });
    }
    setup({ done, signal });
    dialog.showModal();
  });
}

function confirmDialog({ title, text, confirmLabel = "OK", danger = false, extraLabel = "" }) {
  el.confirmTitle.textContent = title;
  el.confirmText.textContent = text;
  el.confirmOk.textContent = confirmLabel;
  el.confirmOk.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
  el.confirmExtra.hidden = !extraLabel;
  el.confirmExtra.textContent = extraLabel;
  return modal(el.dlgConfirm, ({ done, signal }) => {
    el.confirmOk.addEventListener("click", () => done("confirm"), { signal });
    el.confirmExtra.addEventListener("click", () => done("extra"), { signal });
  });
}

function promptText({ title, label, value = "", submitLabel = "Speichern", validate }) {
  el.promptTitle.textContent = title;
  el.promptLabel.textContent = label;
  el.promptInput.value = value;
  el.promptSubmit.textContent = submitLabel;
  el.promptError.textContent = "";
  return modal(el.dlgPrompt, ({ done, signal }) => {
    el.promptForm.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const name = normalizeName(el.promptInput.value);
        const problem = validate?.(name);
        if (problem) {
          el.promptError.textContent = problem;
          return;
        }
        done(name);
      },
      { signal },
    );
    el.promptInput.addEventListener("input", () => (el.promptError.textContent = ""), { signal });
  });
}

// PIN-Tastatur. Mit repeat: true muss die PIN zweimal eingegeben werden.
// verify(pin) kann prüfen (true/false); bei false bleibt der Dialog offen.
function askPin({ title, text = "", hint = "", repeat = false, verify = null, errorText = "Falsche PIN." }) {
  const dots = [...el.pinDots.children];
  const showStep = (stepTitle, stepText) => {
    el.pinTitle.textContent = stepTitle;
    el.pinText.textContent = stepText;
  };
  showStep(title, text);
  el.pinHint.textContent = hint;
  el.pinHint.hidden = !hint;
  el.pinError.textContent = "";

  return modal(el.dlgPin, ({ done, signal }) => {
    let digits = "";
    let first = null;
    let busy = false;

    const paint = () => dots.forEach((dot, i) => dot.classList.toggle("filled", i < digits.length));
    const fail = (message) => {
      el.pinError.textContent = message;
      restartAnimation(el.pinDots, "shake");
      vibrate([30, 40, 30]);
      digits = "";
      paint();
    };

    const submit = async () => {
      if (repeat && first === null) {
        first = digits;
        digits = "";
        paint();
        showStep("PIN wiederholen", "Zur Sicherheit bitte noch einmal eingeben.");
        return;
      }
      if (repeat && digits !== first) {
        first = null;
        showStep(title, text);
        fail("Die PINs stimmen nicht überein – bitte neu wählen.");
        return;
      }
      if (!verify) {
        done(digits);
        return;
      }
      busy = true;
      el.dlgPin.classList.add("busy");
      try {
        const ok = await verify(digits);
        if (signal.aborted) return;
        if (ok) done(digits);
        else fail(errorText);
      } catch (err) {
        if (!signal.aborted) fail(err?.message || "Unbekannter Fehler");
      } finally {
        busy = false;
        el.dlgPin.classList.remove("busy");
      }
    };

    const press = (key) => {
      if (busy) return;
      if (key === "cancel") {
        done(null);
        return;
      }
      if (key === "back") digits = digits.slice(0, -1);
      else if (/^\d$/.test(key) && digits.length < 4) digits += key;
      el.pinError.textContent = "";
      paint();
      if (digits.length === 4) submit();
    };

    el.pinPad.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("[data-key]");
        if (button) press(button.dataset.key);
      },
      { signal },
    );
    el.dlgPin.addEventListener(
      "keydown",
      (event) => {
        if (/^\d$/.test(event.key)) press(event.key);
        else if (event.key === "Backspace") press("back");
      },
      { signal },
    );
    paint();
  });
}
