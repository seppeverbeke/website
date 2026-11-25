// =====================================================================
// KESNOENE · app.js
// Alle logica. Publieke inhoud staat in data.js. Geheime inhoud (stops,
// activiteitenvakjes, codes) staat enkel in Supabase en komt er pas uit
// zodra de server het toelaat (RLS + rpc's, zie supabase.sql).
// =====================================================================

import { MISSION, PLAYERS, CARD, CELLS, RULES, BRIEFING, GAME, EASTER_EGGS as EE } from "./data.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const PRESS_MS = 600;
const PRESS_TOLERANCE = 10;
const SHEET_GUARD_MS = 450;
const POLL_MS = 15000;

const $ = (id) => document.getElementById(id);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------
// tijd. ?now= werkt enkel voor de weergave (aftelling, knop). Geheime
// inhoud opent nooit op basis hiervan: dat beslist de server.
// ---------------------------------------------------------------------
let timeOffsetMs = 0;
(() => {
  const raw = new URLSearchParams(location.search).get("now");
  if (raw) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) timeOffsetMs = parsed.getTime() - Date.now();
  }
})();
const nowMs = () => Date.now() + timeOffsetMs;

function formatStart() {
  const parts = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(MISSION.start));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get("day")}.${get("month")}`, time: `${get("hour")}:${get("minute")}` };
}

const fmt = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? "" : vars[k]));

// kalenderdelen in Belgische tijd, ook als de gsm een andere tijdzone heeft
function brusselsParts(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value) % (t === "hour" ? 24 : Infinity);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

// de modus van de landingspagina; een voorbeeld uit het admin-paneel wint
let forcedMode = null;
function computeMode() {
  const t = nowMs();
  if (t < new Date(MISSION.start).getTime()) return "before";
  if (t < new Date(MISSION.end).getTime()) return "during";
  if (t < new Date(EE.memorial.from).getTime()) return "after";
  const p = brusselsParts(t);
  const m = brusselsParts(new Date(MISSION.start).getTime());
  return p.y > m.y && p.mo === m.mo && p.d === m.d ? "anniversary" : "memorial";
}
const landingMode = () => forcedMode || computeMode();
const isPostMission = (mode) => mode === "after" || mode === "memorial" || mode === "anniversary";
// vanaf middernacht kan er niets meer aangevinkt worden
const isReadOnly = () => { const m = computeMode(); return m === "memorial" || m === "anniversary"; };

// ---------------------------------------------------------------------
// opslag: localStorage met fallback naar geheugen
// ---------------------------------------------------------------------
const memoryStore = {};
const storageOK = (() => {
  try {
    localStorage.setItem("__kesnoene_test__", "1");
    localStorage.removeItem("__kesnoene_test__");
    return true;
  } catch (e) { return false; }
})();

function lsGet(key, fallback) {
  try {
    if (storageOK) {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    }
  } catch (e) { /* val door naar geheugen */ }
  return key in memoryStore ? memoryStore[key] : fallback;
}
function lsSet(key, value) {
  try {
    if (storageOK) { localStorage.setItem(key, JSON.stringify(value)); return; }
  } catch (e) { /* val door naar geheugen */ }
  memoryStore[key] = value;
}
function lsRemove(key) {
  try { if (storageOK) localStorage.removeItem(key); } catch (e) { /* negeren */ }
  delete memoryStore[key];
}
function lsKeys() {
  if (storageOK) { try { return Object.keys(localStorage); } catch (e) { /* negeren */ } }
  return Object.keys(memoryStore);
}

function checkEnvironment() {
  const ua = navigator.userAgent || "";
  const embedded = /Instagram|FBAN|FBAV|Messenger|WhatsApp/i.test(ua);
  if (embedded || !storageOK) {
    const banner = $("banner-warning");
    banner.textContent = "Open deze pagina in Safari of Chrome.";
    banner.classList.remove("hidden");
  }
}

function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* negeren */ }
}

// ---------------------------------------------------------------------
// seeded rng + kaartopbouw (deterministisch per speler)
// ---------------------------------------------------------------------
function hashStr(str) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildCard(playerId) {
  const rng = mulberry32(hashStr("kesnoene-" + playerId));
  const used = new Set();
  const chosen = [];

  // 1. activiteiten, zoveel mogelijk over verschillende stops verdeeld
  const byStop = {};
  for (const c of CELLS.filter((x) => x.type === "activity")) { (byStop[c.stop] ||= []).push(c); }
  const stopIds = seededShuffle(Object.keys(byStop), rng);
  stopIds.forEach((sid) => { byStop[sid] = seededShuffle(byStop[sid], rng); });
  const pointers = {};
  stopIds.forEach((s) => { pointers[s] = 0; });
  const activityPicked = [];
  let guard = 0;
  while (activityPicked.length < CARD.activities && guard++ < 1000) {
    let progressed = false;
    for (const sid of stopIds) {
      if (activityPicked.length >= CARD.activities) break;
      const bucket = byStop[sid];
      if (pointers[sid] < bucket.length) {
        const cell = bucket[pointers[sid]++];
        if (!used.has(cell.id)) { activityPicked.push(cell); used.add(cell.id); progressed = true; }
      }
    }
    if (!progressed) break;
  }
  if (activityPicked.length < CARD.activities) {
    console.warn(`Kesnoene: te weinig activity-vakjes (${activityPicked.length}/${CARD.activities}) voor ${playerId}, aangevuld met general.`);
  }
  chosen.push(...activityPicked);

  // 2. persoonlijk, nooit over jezelf
  const personalPicked = seededShuffle(
    CELLS.filter((c) => c.type === "personal" && c.about !== playerId && !used.has(c.id)), rng
  ).slice(0, CARD.personal);
  personalPicked.forEach((c) => used.add(c.id));
  if (personalPicked.length < CARD.personal) {
    console.warn(`Kesnoene: te weinig personal-vakjes (${personalPicked.length}/${CARD.personal}) voor ${playerId}, aangevuld met general.`);
  }
  chosen.push(...personalPicked);

  // 3. aanvullen met algemeen
  const totalSlots = playableTotal();
  let needed = totalSlots - chosen.length;
  const generalPool = seededShuffle(CELLS.filter((c) => c.type === "general" && !used.has(c.id)), rng);
  for (let i = 0; needed > 0 && i < generalPool.length; i++, needed--) {
    chosen.push(generalPool[i]);
    used.add(generalPool[i].id);
  }
  if (needed > 0) {
    console.warn(`Kesnoene: kaart van ${playerId} kon niet volledig gevuld worden, ${needed} vakje(s) ontbreken. Algemene vakjes worden hergebruikt.`);
    const anyGeneral = CELLS.filter((c) => c.type === "general");
    for (let i = 0; needed > 0 && anyGeneral.length; i++, needed--) {
      const base = anyGeneral[i % anyGeneral.length];
      chosen.push({ ...base, id: base.id + "__dup" + i });
    }
  }

  // 4. alles schudden en op het raster plaatsen
  const shuffled = seededShuffle(chosen, rng);
  const grid = new Array(CARD.cols * CARD.rows).fill(null);
  const center = CARD.free ? Math.floor(CARD.rows / 2) * CARD.cols + Math.floor(CARD.cols / 2) : -1;
  if (center >= 0) grid[center] = { id: "free", type: "free", icon: "⭐", text: "KESNOENE" };
  let p = 0;
  for (let i = 0; i < grid.length; i++) { if (i !== center) grid[i] = shuffled[p++]; }
  return grid;
}

// ---------------------------------------------------------------------
// bingo-logica
// ---------------------------------------------------------------------
const isCellTicked = (cell, set) => cell.type === "free" || set.has(cell.id);

// enkel rijen (cols vakjes) en kolommen (rows vakjes), geen diagonalen
function gridLines() {
  const { cols, rows } = CARD;
  const lines = [];
  for (let r = 0; r < rows; r++) lines.push({ key: "row" + r, idxs: Array.from({ length: cols }, (_, c) => r * cols + c) });
  for (let c = 0; c < cols; c++) lines.push({ key: "col" + c, idxs: Array.from({ length: rows }, (_, r) => r * cols + c) });
  return lines;
}
function computeCompletedLines(grid, set) {
  return gridLines().filter((l) => l.idxs.every((i) => isCellTicked(grid[i], set))).map((l) => l.key);
}
const isFullCard = (grid, set) => grid.every((cell) => isCellTicked(cell, set));
function playableTotal() { return CARD.cols * CARD.rows - (CARD.free ? 1 : 0); }

const tickedCount = (grid, set) => grid.filter((c) => c.type !== "free" && set.has(c.id)).length;

// ---------------------------------------------------------------------
// state
// ---------------------------------------------------------------------
const state = {
  player: null,
  card: null,
  cellById: new Map(),
  ticks: new Set(),
  completedLines: [],
  fullCardCelebrated: false,
  secret: lsGet("kesnoene_secret", {}),          // cellId -> { icon, text, stop }
  stopTimes: lsGet("kesnoene_stop_times", []),   // [{ stop_id, opens (ms) }]
  unlocks: {},                                   // stop_id -> 'open' | 'closed'
  settings: { reveal: lsGet("kesnoene_reveal_cache", false) },
  feedCache: [],
  seenEventIds: new Set(),
  maxEventId: 0,
  adminCode: null,
  drinkEvents: new Map((lsGet("kesnoene_drinks", []) || []).map((d) => [d.id, d])),   // id -> { id, from, to }
  bonSeen: 0,            // hoogste aantal verdiende bonnen dat al gemeld is (per speler bewaard)
  net: { serverOk: null },
};

const pkey = (suffix) => `kesnoene_${suffix}_${state.player.id}`;
function loadPlayerState() {
  state.ticks = new Set(lsGet(pkey("ticks"), []));
  state.completedLines = lsGet(pkey("lines"), []);
  state.fullCardCelebrated = lsGet(pkey("fullcard"), false);
  state.card = buildCard(state.player.id);
  state.cellById = new Map(state.card.map((c) => [c.id, c]));
  const storedBon = lsGet(pkey("bon"), null);
  state.bonSeen = storedBon === null ? earnedBons() : storedBon;
}
const persistTicks = () => lsSet(pkey("ticks"), Array.from(state.ticks));
const persistLines = () => lsSet(pkey("lines"), state.completedLines);
const persistFull = () => lsSet(pkey("fullcard"), state.fullCardCelebrated);
const persistSecret = () => lsSet("kesnoene_secret", state.secret);

// wachtrij voor tick/untick
let queueVersion = 0;
let queueCounter = 0;
const getQueue = () => lsGet(pkey("queue"), []);
function setQueue(q) { queueVersion++; lsSet(pkey("queue"), q); }
function queueOp(op, cellId, extra = {}) {
  const q = getQueue();
  q.push({ uid: `${Date.now()}-${queueCounter++}`, op, cell_id: cellId, ...extra });
  setQueue(q);
  flushQueue();
}

// inhoud van een vakje: algemeen/persoonlijk zit in data.js, activiteiten
// komen enkel uit de lokale cache van wat de server al heeft vrijgegeven
function getContent(cell) {
  if (cell.type !== "activity") return { icon: cell.icon, text: cell.text };
  return state.secret[cell.id] || null;
}

// ---------------------------------------------------------------------
// supabase
// ---------------------------------------------------------------------
let supabase = null;
let initPromise = null;

function supabaseConfigured() {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && !/VUL|TODO|PLACEHOLDER/i.test(SUPABASE_URL + SUPABASE_ANON_KEY);
}

function initSupabase() {
  if (supabase) return Promise.resolve(supabase);
  if (initPromise) return initPromise;
  if (!supabaseConfigured()) return Promise.resolve(null);
  initPromise = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ SUPABASE_CDN);
      supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      return supabase;
    } catch (e) {
      console.warn("Kesnoene: kon Supabase niet laden.", e);
      setServerOk(false);
      return null;
    } finally {
      if (!supabase) initPromise = null;
    }
  })();
  return initPromise;
}

function setServerOk(ok) {
  if (state.net.serverOk !== ok) { state.net.serverOk = ok; updateConnIndicator(); }
}

async function sb(request) {
  try {
    const res = await request;
    setServerOk(!res.error);
    return res;
  } catch (e) {
    setServerOk(false);
    return { data: null, error: e };
  }
}

function updateConnIndicator() {
  const el = $("conn-indicator");
  if (!el) return;
  let text;
  if (!supabaseConfigured()) text = "⚪ Geen server";
  else if (!navigator.onLine) text = "🟠 Offline";
  else if (state.net.serverOk === false) text = "🔴 Server niet bereikbaar";
  else if (state.net.serverOk === null) text = "🟠 Verbinden";
  else text = "🟢 Verbonden";
  el.textContent = text;
}

let synced = false;
async function startSync() {
  const client = await initSupabase();
  if (!client || !state.player) { updateConnIndicator(); return; }
  await loadStopTimes();
  await Promise.all([refreshUnlocks(), refreshSettings()]);
  await refreshSecret({ animate: false });
  await syncOwnTicks();
  await loadFeed();
  await loadDrinks();
  setupRealtime();
  scheduleNextOpening();
  synced = state.net.serverOk === true;
  await flushQueue();
  updateConnIndicator();
}

async function loadStopTimes() {
  const { data, error } = await sb(supabase.rpc("get_stop_times"));
  if (error || !Array.isArray(data)) return;
  state.stopTimes = data.map((r) => ({ stop_id: r.stop_id, opens: new Date(r.opens).getTime() }));
  lsSet("kesnoene_stop_times", state.stopTimes);
}

async function refreshUnlocks() {
  if (!supabase) return false;
  const { data, error } = await sb(supabase.from("unlocks").select("stop_id, state"));
  if (error) return false;
  const map = {};
  (data || []).forEach((r) => { map[r.stop_id] = r.state; });
  const changed = JSON.stringify(map) !== JSON.stringify(state.unlocks);
  state.unlocks = map;
  if (changed && adminOpen) renderAdminPanel();
  return changed;
}

async function onUnlocksChanged() {
  await refreshUnlocks();
  await refreshSecret({ animate: true });
  scheduleNextOpening();
}

// haalt de secret_cells op die de server (RLS) op dit moment vrijgeeft
async function refreshSecret({ animate }) {
  if (!supabase) return [];
  const { data, error } = await sb(supabase.from("secret_cells").select("id, stop_id, icon, text"));
  if (error || !Array.isArray(data)) return [];
  const fresh = [];
  for (const row of data) {
    if (!state.secret[row.id]) {
      state.secret[row.id] = { icon: row.icon, text: row.text, stop: row.stop_id };
      fresh.push(row.id);
    }
  }
  if (fresh.length) {
    persistSecret();
    fresh.forEach((id) => { if (cellEls.has(id)) refreshCell(id, { animateUnlock: animate }); });
  }
  return fresh;
}

// precies 1 timer: loopt af op het eerstvolgende openingsuur
let openTimer = null;
function scheduleNextOpening() {
  clearTimeout(openTimer);
  openTimer = null;
  const now = Date.now();
  const next = state.stopTimes.map((s) => s.opens).filter((t) => t > now).sort((a, b) => a - b)[0];
  if (!next) return;
  openTimer = setTimeout(onOpeningTime, Math.min(next - now + 800, 2147000000));
}

async function onOpeningTime() {
  openTimer = null;
  await refreshSecret({ animate: true });
  await announceAutoUnlocks();
  scheduleNextOpening();
  retryMissing(0);
}

// de klok van de gsm kan iets voorlopen op die van de server
function retryMissing(attempt) {
  if (attempt >= 6 || !state.card) return;
  const now = Date.now();
  const due = new Set(state.stopTimes.filter((s) => s.opens <= now && state.unlocks[s.stop_id] !== "closed").map((s) => s.stop_id));
  const missing = state.card.some((c) => c.type === "activity" && due.has(c.stop) && !state.secret[c.id]);
  if (!missing) return;
  setTimeout(async () => { await refreshSecret({ animate: true }); retryMissing(attempt + 1); }, 4000);
}

// feedbericht bij automatische opening: de unieke index events_unlock_once
// zorgt dat het maar één keer gebeurt, ongeacht hoeveel toestellen het proberen
async function announceAutoUnlocks() {
  if (!supabase) return;
  const announced = new Set(lsGet("kesnoene_announced", []));
  const now = Date.now();
  for (const s of state.stopTimes) {
    if (s.opens <= now && now - s.opens < 180000 && !announced.has(s.stop_id) && !state.unlocks[s.stop_id]) {
      announced.add(s.stop_id);
      try {
        await supabase.from("events").insert({ player: state.player ? state.player.id : null, kind: "unlock", payload: { stop_id: s.stop_id } });
      } catch (e) { /* al aangekondigd door een ander toestel */ }
    }
  }
  lsSet("kesnoene_announced", Array.from(announced));
}

async function refreshSettings() {
  if (!supabase) return;
  const { data, error } = await sb(supabase.from("settings").select("key, value"));
  if (error || !Array.isArray(data)) return;
  const map = {};
  data.forEach((r) => { map[r.key] = r.value; });

  const reveal = map.reveal === true;
  const wasReveal = state.settings.reveal;
  state.settings.reveal = reveal;
  lsSet("kesnoene_reveal_cache", reveal);
  $("tab-reveal").classList.toggle("hidden", !reveal);
  if (reveal !== wasReveal && currentTab === "reveal") renderReveal();

  const epoch = map.reset_epoch === undefined ? null : String(map.reset_epoch);
  const localEpoch = lsGet("kesnoene_epoch", null);
  if (epoch !== null && epoch !== localEpoch) {
    lsSet("kesnoene_epoch", epoch);
    handleRemoteReset();
  }
}

// de spelleider heeft "alles resetten" gebruikt
function handleRemoteReset() {
  state.secret = {};
  persistSecret();
  lsSet("kesnoene_announced", []);
  state.feedCache = [];
  state.seenEventIds.clear();
  state.maxEventId = 0;
  feedDomIds.clear();
  if (state.player) {
    state.ticks = new Set();
    state.completedLines = [];
    state.fullCardCelebrated = false;
    persistTicks(); persistLines(); persistFull();
    setQueue([]);
    state.bonSeen = 0;
    lsSet(pkey("bon"), 0);
    lsRemove(pkey("ack"));
    refreshAllCells();
    updateCardStats();
  }
  state.drinkEvents = new Map();
  lsRemove("kesnoene_drinks");
  orderQueue.length = 0;
  orderIds.clear();
  updateDrinkButton();
  if (supabase) { refreshSecret({ animate: false }); loadFeed(); loadDrinks(); }
  if (currentTab === "scoreboard") renderScoreboard();
}

// server is leidend voor wat al verstuurd is; de wachtrij komt er bovenop
async function syncOwnTicks() {
  if (!supabase || !state.player) return;
  const version = queueVersion;
  const { data, error } = await sb(supabase.from("ticks").select("cell_id").eq("player", state.player.id));
  if (error || !Array.isArray(data)) return;
  if (version !== queueVersion || flushing) return;
  const next = new Set(data.map((r) => r.cell_id));
  for (const q of getQueue()) { if (q.op === "tick") next.add(q.cell_id); else if (q.op === "untick") next.delete(q.cell_id); }
  const same = next.size === state.ticks.size && [...next].every((id) => state.ticks.has(id));
  if (same) return;
  state.ticks = next;
  persistTicks();
  state.completedLines = computeCompletedLines(state.card, state.ticks);
  state.fullCardCelebrated = isFullCard(state.card, state.ticks);
  persistLines(); persistFull();
  refreshAllCells();
  updateCardStats();
  silentBonSync();
}

let flushing = false;
async function flushQueue() {
  if (flushing) return;
  if (!supabase || !navigator.onLine || !state.player) { updateConnIndicator(); return; }
  flushing = true;
  try {
    for (;;) {
      const queue = getQueue();
      if (!queue.length) break;
      const item = queue[0];
      let error;
      if (item.op === "tick") {
        ({ error } = await sb(supabase.from("ticks").upsert({ player: state.player.id, cell_id: item.cell_id }, { onConflict: "player,cell_id" })));
        if (!error) {
          try { await supabase.from("events").insert({ player: state.player.id, kind: "tick", payload: {} }); } catch (e) { /* niet kritiek */ }
        }
      } else if (item.op === "drink") {
        const res = await sb(supabase.from("events").insert({ player: state.player.id, kind: "drink", payload: { to: item.to } }).select());
        error = res.error;
        if (!error && Array.isArray(res.data)) ingestEvents(res.data, false);
      } else {
        ({ error } = await sb(supabase.from("ticks").delete().match({ player: state.player.id, cell_id: item.cell_id })));
      }
      if (error) break;
      const q = getQueue();
      const idx = q.findIndex((x) => x.uid === item.uid);
      if (idx >= 0) { q.splice(idx, 1); setQueue(q); }
    }
  } finally {
    flushing = false;
    updateConnIndicator();
    updateDrinkButton();
  }
}

async function reportEvent(kind, payload = {}) {
  if (!supabase || !state.player) return;
  try { await supabase.from("events").insert({ player: state.player.id, kind, payload }); } catch (e) { /* negeren */ }
}

// ---------------------------------------------------------------------
// realtime + polling (polling vangt een haperende realtime-verbinding op)
// ---------------------------------------------------------------------
let realtimeStarted = false;
function setupRealtime() {
  if (realtimeStarted || !supabase) return;
  realtimeStarted = true;
  const ch = supabase.channel("kesnoene-live");
  ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) => ingestEvents([p.new], true));
  ch.on("postgres_changes", { event: "*", schema: "public", table: "unlocks" }, () => onUnlocksChanged());
  ch.on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => refreshSettings());
  ch.on("postgres_changes", { event: "*", schema: "public", table: "ticks" }, () => {
    if (currentTab === "scoreboard") renderScoreboard();
    syncOwnTicks();
  });
  ch.subscribe();
}

async function pollOnce() {
  if (!state.player || document.hidden || !navigator.onLine) return;
  if (!supabase) { await initSupabase(); if (supabase && !synced) await startSync(); return; }
  if (!synced) { await startSync(); return; }
  await flushQueue();
  const unlocksChanged = await refreshUnlocks();
  await refreshSettings();
  if (unlocksChanged) await refreshSecret({ animate: true });
  await syncOwnTicks();
  const { data } = await sb(supabase.from("events").select("*").gt("id", state.maxEventId).order("id", { ascending: true }).limit(50));
  if (Array.isArray(data) && data.length) ingestEvents(data, true);
  if (currentTab === "scoreboard") renderScoreboard();
}
setInterval(pollOnce, POLL_MS);

function onBecameVisible() {
  if (!state.player) return;
  scheduleNextOpening();
  if (supabase) refreshSecret({ animate: true });
  pollOnce();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) onBecameVisible(); });
window.addEventListener("online", () => { updateConnIndicator(); onBecameVisible(); });
window.addEventListener("offline", updateConnIndicator);

// ---------------------------------------------------------------------
// meldingen en feed
// ---------------------------------------------------------------------
function showToast(message, ms = 3500) {
  const root = $("toast-root");
  while (root.children.length >= 3) root.firstChild.remove();
  const el = h("div", "toast", message);
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function nameOf(id) { return (PLAYERS.find((p) => p.id === id) || {}).name || "Iemand"; }

function feedMessage(evt) {
  const who = nameOf(evt.player);
  if (evt.kind === "tick") return `🎯 ${who} heeft een vakje aangevinkt`;
  if (evt.kind === "bingo") return `🎉 ${who} heeft BINGO!`;
  if (evt.kind === "fullcard") return `🏆 ${who} heeft een VOLLEDIGE KAART!`;
  if (evt.kind === "unlock") return "🔓 Er is een vakje vrijgegeven";
  if (evt.kind === "drink") return gameFmt(GT.givenToast, { from: who, to: nameOf((evt.payload || {}).to) });
  return null;
}

function toastFor(evt) {
  const mine = state.player && evt.player === state.player.id;
  if (evt.kind === "unlock") { showToast("🔓 Nieuw vakje vrijgegeven"); return; }
  if (mine) return;
  if (evt.kind === "drink" && (evt.payload || {}).to === (state.player && state.player.id)) return;   // de ontvanger krijgt het bevel
  const msg = feedMessage(evt);
  if (msg) showToast(msg);
}

function ingestEvents(rows, live) {
  const fresh = rows.filter((e) => !state.seenEventIds.has(e.id)).sort((a, b) => a.id - b.id);
  if (!fresh.length) return;
  fresh.forEach((e) => {
    state.seenEventIds.add(e.id);
    state.maxEventId = Math.max(state.maxEventId, e.id);
    state.feedCache.push(e);
    if (e.kind === "drink") addDrinkEvent(e);
    if (live) {
      toastFor(e);
      if (e.kind === "drink" && state.player && (e.payload || {}).to === state.player.id) enqueueOrder(e);
    }
  });
  state.feedCache.sort((a, b) => b.id - a.id);
  state.feedCache = state.feedCache.slice(0, 40);
  syncFeed(live);
}

async function loadFeed() {
  if (!supabase) return;
  const { data } = await sb(supabase.from("events").select("*").order("id", { ascending: false }).limit(30));
  if (Array.isArray(data)) ingestEvents(data, false);
}

const feedDomIds = new Set();
function timeLabel(evt) {
  const d = new Date(evt.created_at || Date.now());
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function makeFeedItem(evt, typed) {
  const item = h("div", "feed-item");
  item.dataset.id = evt.id;
  item.append(h("span", "time", timeLabel(evt)));
  const msg = h("span", "msg");
  item.append(msg);
  const text = feedMessage(evt);
  if (!typed) { msg.textContent = text; return item; }
  item.classList.add("new", "typing");
  let i = 0;
  const timer = setInterval(() => {
    i++;
    msg.textContent = text.slice(0, i);
    if (i >= text.length) { clearInterval(timer); item.classList.remove("typing"); }
  }, 26);
  return item;
}

function syncFeed(live) {
  const root = $("feed-list");
  const items = state.feedCache.filter((e) => feedMessage(e));
  if (!items.length) {
    root.replaceChildren(h("p", "empty-note", "Nog geen gebeurtenissen."));
    feedDomIds.clear();
    return;
  }
  const empty = root.querySelector(".empty-note");
  if (empty) empty.remove();
  if (!feedDomIds.size) {
    root.replaceChildren(...items.map((e) => { feedDomIds.add(e.id); return makeFeedItem(e, false); }));
    return;
  }
  const typed = live && !reduced() && currentTab === "scoreboard";
  items.filter((e) => !feedDomIds.has(e.id)).sort((a, b) => a.id - b.id).forEach((e) => {
    feedDomIds.add(e.id);
    root.prepend(makeFeedItem(e, typed));
  });
}

// ---------------------------------------------------------------------
// schermen
// ---------------------------------------------------------------------
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
}

function missionPhase() {
  const t = nowMs();
  if (t < new Date(MISSION.start).getTime()) return "before";
  if (t < new Date(MISSION.end).getTime()) return "during";
  return "after";
}

function enterGame() {
  leavePreview();
  loadPlayerState();
  $("player-tag").textContent = state.player.name.toUpperCase();
  if (missionPhase() === "before") {
    const { date, time } = formatStart();
    $("locked-player-name").textContent = state.player.name.toUpperCase();
    $("locked-preview-text").textContent = `Je kaart wordt vrijgegeven op ${date} om ${time}.`;
    showScreen("locked");
  } else {
    buildCardDOM();
    renderRules();
    showScreen("main");
  }
  updateConnIndicator();
  initSupabase().then(startSync);
}

function routeOnLoad() {
  const storedId = lsGet("kesnoene_player", null);
  const player = storedId && PLAYERS.find((p) => p.id === storedId);
  if (!player) { showScreen("landing"); return; }
  state.player = player;
  if (isPostMission(computeMode())) {
    // na 20:00 opent de pagina op de landingspagina (generiek, herinnering, verjaardag)
    loadPlayerState();
    showScreen("landing");
    updateLanding();
    initSupabase().then(startSync);
  } else {
    enterGame();
  }
}

// naar de kaart, of eerst aanmelden als er nog niemand is aangemeld
function goToCard() {
  const storedId = lsGet("kesnoene_player", null);
  const player = state.player || (storedId && PLAYERS.find((p) => p.id === storedId));
  if (player) { state.player = player; enterGame(); }
  else { leavePreview(); resetLoginScreen(); showScreen("login"); }
}

// ---------------------------------------------------------------------
// landing
// ---------------------------------------------------------------------
function setDigit(el, text) {
  if (el.textContent === text) return;
  if (reduced() || !el.offsetParent) { el.textContent = text; return; }
  el.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], { duration: 110, easing: "ease-in" }).onfinish = () => {
    el.textContent = text;
    el.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: 120, easing: "ease-out" });
  };
}

// welke blokken zichtbaar zijn hangt af van de modus (data-show) en de foto kleurt mee
function applyLandingMode(mode) {
  const screen = $("screen-landing");
  screen.dataset.mode = mode;
  document.querySelectorAll("#screen-landing [data-show]").forEach((el) => {
    el.classList.toggle("hidden", !el.dataset.show.split(" ").includes(mode));
  });
  const years = Math.max(1, brusselsParts(nowMs()).y - brusselsParts(new Date(MISSION.start).getTime()).y);
  $("anniv-banner").textContent = fmt(EE.anniversary.banner, { n: years });
  $("btn-anniv-card").textContent = mode === "after" ? EE.after.toCardButton : EE.anniversary.toCardButton;
  $("preview-exit").classList.toggle("hidden", !forcedMode);
}

// ---------------------------------------------------------------------
// briefing (voor de start; verdwijnt vanzelf via data-show="before")
// ---------------------------------------------------------------------
const isAndroid = () => /Android/i.test(navigator.userAgent);
// iPad in "desktop"-modus meldt zich als Mac met touch; Android gaat altijd voor
const isIOS = () => !isAndroid() && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function buildBriefingBody() {
  const body = $("briefing-body");
  body.replaceChildren();
  BRIEFING.sections.forEach((sec) => {
    const block = h("div", "briefing-section");
    block.append(h("h3", "briefing-heading", sec.heading));
    (sec.lines || []).forEach((line) => block.append(h("p", "briefing-line", line)));
    if (sec.map) {
      const m = sec.map;
      const link = h("a", "btn-primary briefing-map", m.label);
      link.href = fmt(isIOS() ? m.apple : m.google, { lat: m.lat, lng: m.lng });
      link.target = "_blank";
      link.rel = "noopener";
      block.append(link);
    }
    if (sec.items) {
      const list = h("ul", "briefing-list");
      sec.items.forEach((item) => list.append(h("li", "", item)));
      block.append(list);
    }
    body.append(block);
  });
}

function setBriefingOpen(open, animate = true) {
  const body = $("briefing-body");
  const btn = $("briefing-toggle");
  btn.setAttribute("aria-expanded", String(open));
  btn.textContent = open ? BRIEFING.closeButton : BRIEFING.openButton;
  if (open) {
    buildBriefingBody();
    body.classList.remove("hidden");
    if (animate && !reduced()) {
      body.animate([{ opacity: 0, transform: "translateY(-10px) scaleY(0.94)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
    }
    if (animate) requestAnimationFrame(() => $("briefing").scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }));
  } else if (animate && !reduced() && !body.classList.contains("hidden")) {
    body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => body.classList.add("hidden");
  } else {
    body.classList.add("hidden");
  }
}

function initBriefing() {
  $("briefing-title").textContent = BRIEFING.title;
  setBriefingOpen(false, false);
  $("briefing-toggle").addEventListener("click", () => setBriefingOpen($("briefing-toggle").getAttribute("aria-expanded") !== "true"));
}

function initLandingTexts() {
  initBriefing();
  $("memorial-title").textContent = EE.memorial.title;
  $("memorial-line").textContent = EE.memorial.line;
  $("btn-memorial-card").textContent = EE.memorial.toCardButton;
  $("btn-anniv-card").textContent = EE.anniversary.toCardButton;
  $("preview-exit").textContent = EE.adminTest.exitPreview;
  $("readonly-note").textContent = EE.memorial.readOnlyNote;
}

function updateLanding() {
  const mode = landingMode();
  if ($("screen-landing").dataset.mode !== mode) applyLandingMode(mode);
  const phaseEl = $("countdown-phase");
  const clock = $("countdown-clock");
  if (mode === "after") {
    phaseEl.textContent = EE.after.title;
    phaseEl.classList.remove("hidden");
    clock.classList.add("hidden");
    return;
  }
  if (mode !== "before" && mode !== "during") return;

  const phase = mode;
  const btn = $("btn-enlist");
  const note = $("enlist-note");

  if (phase === "before") {
    const diff = Math.max(0, new Date(MISSION.start).getTime() - nowMs());
    phaseEl.classList.add("hidden");
    clock.classList.remove("hidden");
    const pad = (n) => String(n).padStart(2, "0");
    setDigit($("cd-d"), pad(Math.floor(diff / 86400000)));
    setDigit($("cd-h"), pad(Math.floor((diff % 86400000) / 3600000)));
    setDigit($("cd-m"), pad(Math.floor((diff % 3600000) / 60000)));
    setDigit($("cd-s"), pad(Math.floor((diff % 60000) / 1000)));
    const { date, time } = formatStart();
    note.textContent = `Beschikbaar op ${date} om ${time}`;
  } else {
    phaseEl.textContent = "MISSIE BEZIG";
    phaseEl.classList.remove("hidden");
    clock.classList.add("hidden");
    note.textContent = "";
  }

  const open = phase !== "before";
  if (btn.disabled === open) {
    btn.disabled = !open;
    if (open) unlockEnlist(btn, enlistChecked);
  }
  enlistChecked = true;
}

// op het startmoment springt het slot open, schuift weg en begint de knop te ademen
let enlistChecked = false;
function unlockEnlist(btn, animate) {
  const lock = btn.querySelector(".btn-lock");
  const breathe = () => btn.classList.toggle("breathe", !reduced());
  if (!lock) { breathe(); return; }
  // bij het laden na de start, of met minder beweging: het slot verdwijnt gewoon
  if (!animate || reduced()) { lock.remove(); breathe(); return; }
  const label = btn.querySelector(".btn-label");
  lock.textContent = "🔓";
  lock.animate([
    { transform: "scale(1) rotate(0deg)" },
    { transform: "scale(1.45) rotate(-16deg)", offset: 0.5 },
    { transform: "scale(1.2) rotate(0deg)" },
  ], { duration: 320, easing: "ease-out", fill: "forwards" }).finished.then(() => {
    // het slot verlaat de regel; de tekst schuift soepel naar het midden
    const labelBefore = label.getBoundingClientRect().left;
    const lockRect = lock.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    lock.style.position = "absolute";
    lock.style.left = `${lockRect.left - btnRect.left}px`;
    lock.style.top = `${lockRect.top - btnRect.top}px`;
    const shift = labelBefore - label.getBoundingClientRect().left;
    label.animate([{ transform: `translateX(${shift}px)` }, { transform: "translateX(0)" }], { duration: 380, easing: "ease-out" });
    return lock.animate([
      { transform: "scale(1.2) translateX(0)", opacity: 1 },
      { transform: "scale(1) translateX(-34px)", opacity: 0 },
    ], { duration: 380, easing: "ease-in", fill: "forwards" }).finished;
  }).then(() => { lock.remove(); breathe(); }).catch(() => { lock.remove(); breathe(); });
}

setInterval(() => {
  if (document.hidden) return;
  if ($("screen-landing").classList.contains("active")) updateLanding();
  else if ($("screen-locked").classList.contains("active") && state.player && missionPhase() !== "before") enterGame();
}, 1000);

$("btn-enlist").addEventListener("click", () => {
  if (missionPhase() === "before") return;
  resetLoginScreen();
  showScreen("login");
});
$("btn-memorial-card").addEventListener("click", goToCard);
$("btn-anniv-card").addEventListener("click", goToCard);
$("preview-exit").addEventListener("click", () => leavePreview());

// voorbeeld uit het admin-paneel: forceert een modus op de landingspagina
let previewReturn = null;
function startPreview(mode) {
  if (!forcedMode) previewReturn = document.querySelector(".screen.active")?.dataset.screen || null;
  forcedMode = mode;
  closeAdminPanel();
  showScreen("landing");
  $("screen-landing").dataset.mode = "";
  updateLanding();
  window.scrollTo(0, 0);
}
function leavePreview() {
  if (!forcedMode) return;
  forcedMode = null;
  $("screen-landing").dataset.mode = "";
  $("preview-exit").classList.add("hidden");
  // terug naar waar je vandaan kwam
  if (previewReturn && previewReturn !== "landing" && $("screen-landing").classList.contains("active")) showScreen(previewReturn);
  else if ($("screen-landing").classList.contains("active")) updateLanding();
  previewReturn = null;
}

// ---------------------------------------------------------------------
// aanmelden (de server controleert de code)
// ---------------------------------------------------------------------
let selectedLoginPlayer = null;

function renderPlayerButtons() {
  const root = $("player-buttons");
  root.replaceChildren();
  PLAYERS.forEach((p) => {
    const btn = h("button", "player-btn", p.name);
    btn.type = "button";
    btn.addEventListener("click", () => {
      selectedLoginPlayer = p;
      root.classList.add("hidden");
      $("code-entry").classList.remove("hidden");
      $("code-entry-name").textContent = `Code van ${p.name}`;
      $("code-error").classList.add("hidden");
      const input = $("code-input");
      input.value = "";
      input.disabled = false;
      input.focus();
    });
    root.appendChild(btn);
  });
}

function resetLoginScreen() {
  selectedLoginPlayer = null;
  $("player-buttons").classList.remove("hidden");
  $("code-entry").classList.add("hidden");
}

function showLoginError(text) {
  const err = $("code-error");
  err.textContent = text;
  err.classList.remove("hidden");
}

$("code-input").addEventListener("input", async (e) => {
  const input = e.target;
  input.value = input.value.replace(/\D/g, "").slice(0, 4);
  if (input.value.length !== 4 || !selectedLoginPlayer) return;

  const player = selectedLoginPlayer;
  const code = input.value;
  input.disabled = true;
  $("code-error").classList.add("hidden");

  let outcome = "noconn";
  if (navigator.onLine) {
    const client = await initSupabase();
    if (client) {
      const { data, error } = await sb(client.rpc("verify_player", { p_player: player.id, p_code: code }));
      if (!error) outcome = data === true ? "ok" : "wrong";
    }
  }

  input.disabled = false;
  if (outcome === "ok") {
    state.player = player;
    lsSet("kesnoene_player", player.id);
    enterGame();
  } else {
    input.value = "";
    vibrate([30, 40, 30]);
    showLoginError(outcome === "wrong" ? "Foute code, soldaat. Nog eens." : "Verbinding nodig om je aan te melden.");
    input.focus();
  }
});

$("btn-code-back").addEventListener("click", resetLoginScreen);

function switchPlayer() {
  state.player = null;
  synced = false;
  lsRemove("kesnoene_player");
  resetLoginScreen();
  showScreen("landing");
  updateLanding();
}
$("btn-locked-switch").addEventListener("click", switchPlayer);
$("btn-switch-player").addEventListener("click", switchPlayer);

// ---------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------
let currentTab = "card";
const TAB_ORDER = ["card", "scoreboard", "reveal"];

document.querySelectorAll(".tab").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    const tab = tabBtn.dataset.tab;
    if (tab === currentTab) return;
    const dir = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(currentTab) ? "from-right" : "from-left";
    currentTab = tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tabBtn));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      const active = p.dataset.panel === tab;
      p.classList.remove("from-right", "from-left");
      p.classList.toggle("active", active);
      if (active) p.classList.add(dir);
    });
    if (tab === "scoreboard") renderScoreboard();
    if (tab === "reveal") renderReveal();
  });
});

// ---------------------------------------------------------------------
// lang indrukken (met bewegingsdrempel, zonder pointerleave-annulering)
// ---------------------------------------------------------------------
function attachLongPress(target, opts) {
  const { selector, ms = PRESS_MS, tolerance = PRESS_TOLERANCE, shouldStart, onStart, onCancel, onLongPress, onTap } = opts;
  let session = null;

  const end = (cancelled) => {
    if (!session) return null;
    const s = session;
    session = null;
    clearTimeout(s.timer);
    if (cancelled || !s.fired) onCancel && onCancel(s.el);
    return s;
  };

  target.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = selector ? e.target.closest(selector) : target;
    if (!el || !target.contains(el)) return;
    end(true);
    session = { el, x: e.clientX, y: e.clientY, id: e.pointerId, fired: false, moved: false, timer: null };
    if (!shouldStart || shouldStart(el)) {
      onStart && onStart(el);
      const s = session;
      s.timer = setTimeout(() => {
        if (session !== s) return;
        s.fired = true;
        onCancel && onCancel(s.el);
        onLongPress && onLongPress(s.el);
      }, ms);
    }
  });

  target.addEventListener("pointermove", (e) => {
    if (!session || e.pointerId !== session.id || session.moved) return;
    if (Math.hypot(e.clientX - session.x, e.clientY - session.y) > tolerance) {
      session.moved = true;
      clearTimeout(session.timer);
      onCancel && onCancel(session.el);
    }
  });

  target.addEventListener("pointerup", (e) => {
    if (!session || e.pointerId !== session.id) return;
    const s = session;
    session = null;
    clearTimeout(s.timer);
    if (s.fired) return;
    onCancel && onCancel(s.el);
    if (!s.moved && onTap) onTap(s.el);
  });

  target.addEventListener("pointercancel", () => { end(true); });
  target.addEventListener("contextmenu", (e) => e.preventDefault());
}

// ---------------------------------------------------------------------
// kaart: DOM wordt één keer opgebouwd, daarna enkel gericht bijgewerkt
// ---------------------------------------------------------------------
const cellEls = new Map();

function stableAngle(id) { return -5 - (hashStr(id) % 11); }
const randomAngle = () => -5 - Math.floor(Math.random() * 11);

function lockFace() {
  const face = h("div", "face face-lock");
  const icon = h("span", "lock-icon", "🔒");
  icon.setAttribute("aria-hidden", "true");
  face.append(icon, h("span", "lock-word", "LOCKED"));
  return face;
}

function contentFace(content, aboutYou) {
  const face = h("div", "face face-content");
  if (aboutYou) face.append(h("span", "about-you-label", "Over jou:"));
  const icon = h("span", "cell-icon", content.icon);
  icon.setAttribute("aria-hidden", "true");
  face.append(icon, h("span", "cell-text", content.text));
  return face;
}

function createCellEl(cell) {
  const el = h("div", `cell type-${cell.type}`);
  if (cell.type === "free") el.classList.add("free-cell");
  el.dataset.id = cell.id;
  el.style.setProperty("--rot", `${stableAngle(cell.id)}deg`);
  const stamp = h("span", "stamp-mark", "✓");
  stamp.setAttribute("aria-hidden", "true");
  el.append(h("div", "cell-inner"), stamp);
  el.insertAdjacentHTML("beforeend",
    '<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" pathLength="100"/></svg><span class="fuse"></span>');
  return el;
}

function setOpenFace(el, cell, content, aboutYou = false) {
  el.querySelector(".cell-inner").replaceChildren(contentFace(content, aboutYou));
  el.dataset.state = "open";
  if (aboutYou) el.classList.add("about-you");
}
function setLockFace(el) {
  el.querySelector(".cell-inner").replaceChildren(lockFace());
  el.dataset.state = "locked";
}

function buildCardDOM() {
  const grid = $("card-grid");
  grid.style.setProperty("--cols", CARD.cols);
  grid.replaceChildren();
  cellEls.clear();
  state.card.forEach((cell) => {
    const el = createCellEl(cell);
    cellEls.set(cell.id, el);
    const content = getContent(cell);
    if (content) setOpenFace(el, cell, content); else setLockFace(el);
    el.classList.toggle("is-ticked", isCellTicked(cell, state.ticks));
    grid.appendChild(el);
  });
  updateCardStats();
  updateReadOnlyNote();
}

function updateReadOnlyNote() { $("readonly-note").classList.toggle("hidden", !isReadOnly()); }

function refreshCell(id, { animateUnlock = false } = {}) {
  const cell = state.cellById.get(id);
  const el = cellEls.get(id);
  if (!cell || !el) return;
  const content = getContent(cell);
  const current = el.dataset.state;
  if (current !== "unlocking") {
    if (content && current !== "open") {
      if (current === "locked" && animateUnlock && el.offsetParent) playUnlock(el, cell, content);
      else setOpenFace(el, cell, content);
    } else if (!content && current !== "locked") {
      setLockFace(el);
    }
  }
  el.classList.toggle("is-ticked", isCellTicked(cell, state.ticks));
}

function refreshAllCells() { state.card.forEach((c) => refreshCell(c.id)); }

function updateCardStats() {
  const count = state.card.filter((c) => c.type !== "free" && state.ticks.has(c.id)).length;
  $("card-count").textContent = `${count} / ${playableTotal()}`;
  const lines = computeCompletedLines(state.card, state.ticks).length;
  $("card-lines").textContent = `${lines} ${lines === 1 ? "lijn" : "lijnen"}`;
  updateDrinkButton();
}

// ----- animaties op de kaart -----
function playStamp(el) {
  const rot = randomAngle();
  el.style.setProperty("--rot", `${rot}deg`);
  if (reduced()) return;
  const stamp = el.querySelector(".stamp-mark");
  stamp.animate([
    { transform: `rotate(${rot - 12}deg) scale(2.8)`, opacity: 0 },
    { transform: `rotate(${rot}deg) scale(0.9)`, opacity: 1, offset: 0.55 },
    { transform: `rotate(${rot}deg) scale(1)`, opacity: 0.92 },
  ], { duration: 300, easing: "cubic-bezier(.3,1.3,.5,1)" });
  el.animate([
    { transform: "none" },
    { transform: "none", offset: 0.45 },
    { transform: "translateY(3px) scale(0.965)", offset: 0.55 },
    { transform: "translate(-1px,-1px) scale(1.01)", offset: 0.75 },
    { transform: "none" },
  ], { duration: 300 });
}

// level 1 is de gewone "nee nee"; bij spam wordt het steeds heviger
function shakeLock(el, level = 1) {
  vibrate(level >= 3 ? [40, 40, 40, 40, 60] : [30, 60, 30]);
  if (reduced()) return;
  const icon = el.querySelector(".lock-icon");
  if (!icon) return;
  const a = 5 + (level - 1) * 3;
  const r = 9 + (level - 1) * 4;
  icon.animate([
    { transform: "translateX(0) rotate(0)" },
    { transform: `translateX(${-a}px) rotate(${-r}deg)`, offset: 0.2 },
    { transform: `translateX(${a}px) rotate(${r}deg)`, offset: 0.4 },
    { transform: `translateX(${-a * 0.85}px) rotate(${-r * 0.8}deg)`, offset: 0.6 },
    { transform: `translateX(${a * 0.7}px) rotate(${r * 0.6}deg)`, offset: 0.8 },
    { transform: "translateX(0) rotate(0)" },
  ], { duration: 380, easing: "ease-in-out" });
}

// een barstje in het slot, zonder dat het ooit breekt
function crackLock(el, level) {
  const face = el.querySelector(".face-lock");
  if (!face) return;
  let crack = face.querySelector(".lock-crack");
  if (!crack) {
    face.insertAdjacentHTML("beforeend",
      '<svg class="lock-crack" viewBox="0 0 40 40" aria-hidden="true"><path class="c1" d="M21 3 L17 13 L23 19 L16 27"/><path class="c2" d="M23 19 L31 22 L33 30"/></svg>');
    crack = face.querySelector(".lock-crack");
  }
  crack.classList.toggle("deep", level >= EE.lockSpam.taps - 1);
  if (!reduced()) crack.animate([{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "scale(1)" }], { duration: 160, fill: "both" });
}
function clearCracks() {
  document.querySelectorAll(".lock-crack").forEach((c) => {
    if (reduced()) { c.remove(); return; }
    c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" }).onfinish = () => c.remove();
  });
}

let lockTaps = [];
function handleLockedTap(el) {
  const spam = EE.lockSpam;
  const now = performance.now();
  lockTaps = lockTaps.filter((t) => now - t < spam.withinMs);
  lockTaps.push(now);
  const n = lockTaps.length;
  shakeLock(el, n);
  if (n >= 3) crackLock(el, n);
  if (n === 1) showToast("Nog even geduld, soldaat.", 2000);
  if (n >= spam.taps) { lockTaps = []; lockSpamPenalty(); }
}

function lockSpamPenalty() {
  const spam = EE.lockSpam;
  vibrate([60, 60, 60, 60, 120]);
  openSheet({
    title: spam.title,
    build: (sheet) => sheet.append(h("p", "", spam.text)),
    actions: [{ label: spam.button, cls: "btn-primary", onClick: () => { closeSheet(); clearCracks(); } }],
  });
  setTimeout(clearCracks, 1500);
}

async function playUnlock(el, cell, content) {
  el.dataset.state = "unlocking";
  const inner = el.querySelector(".cell-inner");
  const icon = el.querySelector(".lock-icon");
  try {
    if (reduced() || !icon) {
      setOpenFace(el, cell, content);
      inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
      return;
    }
    icon.textContent = "🔓";
    await icon.animate([
      { transform: "scale(1) rotate(0deg)" },
      { transform: "scale(1.4) rotate(-14deg)", offset: 0.5 },
      { transform: "scale(1.15) rotate(0deg)" },
    ], { duration: 320, easing: "ease-out", fill: "forwards" }).finished;
    await icon.animate([
      { transform: "scale(1.15) translateY(0) rotate(0deg)", opacity: 1 },
      { transform: "scale(1) translateY(34px) rotate(28deg)", opacity: 0 },
    ], { duration: 300, easing: "ease-in", fill: "forwards" }).finished;
    await inner.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 170, easing: "ease-in", fill: "forwards" }).finished;
    setOpenFace(el, cell, content);
    await inner.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 230, easing: "ease-out" }).finished;
  } catch (e) {
    setOpenFace(el, cell, content);
  } finally {
    inner.getAnimations().forEach((a) => a.cancel());
    if (el.dataset.state === "unlocking") setOpenFace(el, cell, content);
  }
}

// ----- tikken en weghalen -----
function tickCell(id) {
  if (state.ticks.has(id)) return;
  lastTickedId = id;
  state.ticks.add(id);
  persistTicks();
  queueOp("tick", id);
  refreshCell(id);
  const el = cellEls.get(id);
  if (el) playStamp(el);
  vibrate(20);
  updateCardStats();
  showUndoBar(id);
  checkBingo();
  checkBon();
}

function untickCell(id) {
  if (!state.ticks.has(id)) return;
  state.ticks.delete(id);
  persistTicks();
  queueOp("untick", id);
  refreshCell(id);
  updateCardStats();
  checkBon();
}

function handleCellTap(id) {
  const cell = state.cellById.get(id);
  const el = cellEls.get(id);
  if (!cell || !el || cell.type === "free") return;
  if (isReadOnly()) { updateReadOnlyNote(); showToast(EE.memorial.readOnlyToast, 2000); return; }
  if (el.dataset.state === "locked") { handleLockedTap(el); return; }
  if (el.dataset.state !== "open") return;
  if (state.ticks.has(id)) return;
  tickCell(id);
}

let undoTimer = null;
function showUndoBar(id) {
  clearTimeout(undoTimer);
  let bar = $("undo-bar");
  if (!bar) {
    bar = h("div", "undo-bar");
    bar.id = "undo-bar";
    document.body.appendChild(bar);
  }
  const btn = h("button", "", "Ongedaan maken");
  btn.type = "button";
  btn.addEventListener("click", () => { untickCell(id); hideUndoBar(); });
  bar.replaceChildren(h("span", "", "Vakje aangevinkt ·"), btn);
  document.body.classList.add("undo-active");
  undoTimer = setTimeout(hideUndoBar, 5000);
}
function hideUndoBar() {
  clearTimeout(undoTimer);
  const bar = $("undo-bar");
  if (bar) bar.remove();
  document.body.classList.remove("undo-active");
}

function openRemoveSheet(id) {
  if (!state.ticks.has(id)) return;
  openSheet({
    title: "Vakje weghalen?",
    build: (sheet) => sheet.append(h("p", "", "Dit haalt het stempel van dit vakje weg.")),
    actions: [
      { label: "Weghalen", cls: "btn-danger", onClick: () => { untickCell(id); closeSheet(); } },
      { label: "Annuleren", cls: "btn-secondary", onClick: closeSheet },
    ],
  });
}

attachLongPress($("card-grid"), {
  selector: ".cell",
  shouldStart: (el) => !isReadOnly() && state.ticks.has(el.dataset.id) && el.dataset.state === "open",
  onStart: (el) => el.classList.add("pressing"),
  onCancel: (el) => el.classList.remove("pressing"),
  onLongPress: (el) => openRemoveSheet(el.dataset.id),
  onTap: (el) => handleCellTap(el.dataset.id),
});

// ---------------------------------------------------------------------
// bingo en vieringen
// ---------------------------------------------------------------------
function checkBingo() {
  const completed = computeCompletedLines(state.card, state.ticks);
  const newLines = completed.filter((k) => !state.completedLines.includes(k));
  const full = isFullCard(state.card, state.ticks);

  if (newLines.length) {
    state.completedLines = Array.from(new Set([...state.completedLines, ...completed]));
    persistLines();
  }
  if (full && !state.fullCardCelebrated) {
    state.fullCardCelebrated = true;
    persistFull();
    playFullCard();
    reportEvent("fullcard");
  } else if (newLines.length) {
    playBingo(newLines);
    reportEvent("bingo");
  }
}

// maar één viering tegelijk: een volle kaart annuleert elke BINGO die nog loopt
let celebrationSeq = 0;
function clearCelebrations() { document.querySelectorAll(".celebration").forEach((n) => n.remove()); }

async function playBingo(lineKeys) {
  const seq = ++celebrationSeq;
  vibrate([35, 70, 35, 70, 35]);
  if (!reduced()) {
    const order = [];
    gridLines().filter((l) => lineKeys.includes(l.key)).forEach((l) => l.idxs.forEach((i) => { if (!order.includes(i)) order.push(i); }));
    const runs = order.map((idx, n) => {
      const el = cellEls.get(state.card[idx].id);
      if (!el) return Promise.resolve();
      const fuse = el.querySelector(".fuse");
      el.animate([{ transform: "scale(1)" }, { transform: "scale(1.07)" }, { transform: "scale(1)" }], { duration: 520, delay: n * 110 });
      return fuse.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { opacity: 0 }], { duration: 520, delay: n * 110, fill: "both" }).finished.catch(() => {});
    });
    await Promise.all(runs);
  }
  if (seq !== celebrationSeq) return;
  clearCelebrations();
  const overlay = h("div", "celebration");
  const word = h("div", "word", "BINGO!");
  overlay.append(word);
  document.body.appendChild(overlay);
  if (!reduced()) {
    word.animate([
      { transform: "scale(3) rotate(-14deg)", opacity: 0 },
      { transform: "scale(0.92) rotate(-5deg)", opacity: 1, offset: 0.6 },
      { transform: "scale(1) rotate(-4deg)", opacity: 1 },
    ], { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "forwards" });
  }
  setTimeout(() => overlay.remove(), 1700);
}

function playFullCard() {
  celebrationSeq++;
  clearCelebrations();
  vibrate([60, 80, 60, 80, 60, 80, 220]);
  const overlay = h("div", "celebration full");
  const word = h("div", "word");
  word.append("VOLLEDIGE", document.createElement("br"), "KAART!");
  overlay.append(word, h("div", "sub", "Mission accomplished"), h("div", "hint", "Tik om te sluiten"));
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", close);
  setTimeout(close, 12000);
  if (reduced()) return;
  word.animate([
    { transform: "scale(3) rotate(-10deg)", opacity: 0 },
    { transform: "scale(0.94) rotate(-3deg)", opacity: 1, offset: 0.6 },
    { transform: "scale(1) rotate(-2deg)", opacity: 1 },
  ], { duration: 520, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "forwards" });
  spawnConfetti(overlay);
}

function spawnConfetti(root) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (let i = 0; i < 44; i++) {
    const piece = h("span", "confetti");
    if (Math.random() < 0.45) piece.classList.add("dogtag"); else piece.textContent = "★";
    if (!piece.classList.contains("dogtag")) piece.style.color = Math.random() < 0.5 ? "#e4d9b8" : "#d9625a";
    piece.style.left = `${Math.random() * width}px`;
    root.appendChild(piece);
    const dx = (Math.random() - 0.5) * 160;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 480);
    piece.animate([
      { transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate3d(${dx}px,${height + 80}px,0) rotate(${spin}deg)`, opacity: 0.9 },
    ], { duration: 2600 + Math.random() * 2400, delay: Math.random() * 900, easing: "cubic-bezier(.25,.6,.5,1)", fill: "both" })
      .onfinish = () => piece.remove();
  }
}

// ---------------------------------------------------------------------
// spelregels
// ---------------------------------------------------------------------
function renderRules() {
  const body = $("rules-body");
  if (!RULES || !RULES.length) { body.replaceChildren(h("p", "empty", "Nog geen regels toegevoegd.")); return; }
  const ul = h("ul");
  RULES.forEach((r) => ul.appendChild(h("li", "", gameFmt(r, { ticksPerBon: GAME.ticksPerBon, bonPerLine: GAME.bonPerLine }))));
  body.replaceChildren(ul);
}
$("rules-toggle").addEventListener("click", () => {
  const open = $("rules-body").classList.toggle("open");
  $("rules-chevron").innerHTML = open ? "&#9650;" : "&#9660;";
  $("rules-toggle").setAttribute("aria-expanded", String(open));
});

// ---------------------------------------------------------------------
// scorebord
// ---------------------------------------------------------------------
const boardRowEls = new Map();

function createBoardRow(player) {
  const row = h("div", "board-row");
  const top = h("div", "board-row-top");
  const name = h("span", "board-name");
  const label = h("span", "board-label");
  name.append(label);
  const meta = h("span", "board-meta");
  const odo = h("span", "odo");
  odo.append(h("span", "", "0"));
  const rest = h("span", "board-rest");
  meta.append(odo, rest);
  top.append(name, meta);
  const bar = h("div", "progress-bar");
  const fill = h("div", "progress-bar-fill");
  fill.style.transform = "scaleX(0)";
  bar.append(fill);
  const drinks = h("div", "board-drinks");
  row.append(top, bar, drinks);
  row._parts = { name, label, odo, rest, fill, drinks, player };
  return row;
}

function setOdo(odo, value) {
  const cur = odo.firstElementChild;
  const next = String(value);
  if (cur.textContent === next) return;
  if (reduced() || !odo.offsetParent) { cur.textContent = next; return; }
  const incoming = h("span", "", next);
  odo.append(incoming);
  const dist = cur.offsetHeight || 18;
  const opts = { duration: 450, easing: "cubic-bezier(.3,1.2,.4,1)", fill: "forwards" };
  cur.animate([{ transform: "translateY(0)" }, { transform: `translateY(-${dist}px)` }], opts);
  incoming.animate([{ transform: "translateY(0)" }, { transform: `translateY(-${dist}px)` }], opts).onfinish = () => {
    cur.remove();
    incoming.getAnimations().forEach((a) => a.cancel());
  };
}

function updateBoard(summaries, stale) {
  const root = $("board-rows");
  const staleNote = root.querySelector(".stale-note");
  if (staleNote) staleNote.remove();
  root.querySelectorAll(".empty-note").forEach((n) => n.remove());

  const before = new Map();
  boardRowEls.forEach((row, id) => before.set(id, row.getBoundingClientRect().top));

  summaries.forEach((s, i) => {
    let row = boardRowEls.get(s.player.id);
    if (!row) { row = createBoardRow(s.player); boardRowEls.set(s.player.id, row); }
    const p = row._parts;
    p.label.textContent = `${i === 0 && s.count > 0 ? "👑 " : ""}${s.player.name}${s.full ? " 🏆" : ""}`;
    setOdo(p.odo, s.count);
    p.rest.textContent = ` / ${s.total} · ${s.lines} ${s.lines === 1 ? "lijn" : "lijnen"}`;
    p.fill.style.transform = `scaleX(${s.total ? s.count / s.total : 0})`;
    p.drinks.textContent = `🍺 ${s.given} ${GT.givenLabel} · 🥴 ${s.received} ${GT.receivedLabel}`;
    row.classList.toggle("leader", i === 0 && s.count > 0);
    root.appendChild(row);
  });

  if (stale) root.prepend(h("p", "empty-note stale-note", "Laatste gekende stand (offline)"));

  if (!reduced()) {
    boardRowEls.forEach((row, id) => {
      const from = before.get(id);
      if (from === undefined) return;
      const dy = from - row.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) row.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
  }
}

function summarize(grouped) {
  return PLAYERS.map((p) => {
    const grid = buildCard(p.id);
    const set = new Set(grouped[p.id] || []);
    const count = tickedCount(grid, set);
    const full = isFullCard(grid, set);
    const totals = drinkTotals();
    return {
      player: p,
      total: playableTotal(),
      count,
      lines: computeCompletedLines(grid, set).length,
      full,
      given: totals.given[p.id] || 0,
      received: totals.received[p.id] || 0,
    };
  }).sort((a, b) => (b.full - a.full) || (b.lines - a.lines) || (b.count - a.count));
}

async function renderScoreboard() {
  const rows = $("board-rows");
  const noConn = () => {
    const cached = lsGet("kesnoene_all_ticks_cache", null);
    if (cached) updateBoard(summarize(cached), true);
    else { boardRowEls.clear(); rows.replaceChildren(h("p", "empty-note", "Geen verbinding")); }
    if (!feedDomIds.size) $("feed-list").replaceChildren(h("p", "empty-note", "Geen verbinding"));
  };
  if (!supabase) { noConn(); return; }
  const { data, error } = await sb(supabase.from("ticks").select("player, cell_id"));
  if (error || !Array.isArray(data)) { noConn(); return; }
  const grouped = {};
  data.forEach((r) => { (grouped[r.player] ||= []).push(r.cell_id); });
  lsSet("kesnoene_all_ticks_cache", grouped);
  updateBoard(summarize(grouped), false);
  if (!state.feedCache.length) await loadFeed();
  if (!feedDomIds.size) syncFeed(false);
}

// ---------------------------------------------------------------------
// onthulling (rpc: geeft enkel iets terug als de spelleider dat wil)
// ---------------------------------------------------------------------
async function renderReveal() {
  const root = $("reveal-content");
  if (!state.settings.reveal) { root.replaceChildren(h("p", "empty-note", "Nog niet vrijgegeven.")); return; }
  const client = await initSupabase();
  if (!client) { root.replaceChildren(h("p", "empty-note", "Geen verbinding")); return; }
  const { data, error } = await sb(client.rpc("get_reveal_data"));
  if (error) {
    const msg = /reveal_not_enabled/.test(error.message || "") ? "Nog niet vrijgegeven." : "Geen verbinding";
    root.replaceChildren(h("p", "empty-note", msg));
    return;
  }
  const grouped = {};
  (data || []).forEach((r) => { (grouped[r.player] ||= []).push(r.cell_id); });

  root.replaceChildren();
  PLAYERS.forEach((p) => {
    const set = new Set(grouped[p.id] || []);
    const block = h("div", "reveal-player-block");
    block.append(h("p", "reveal-player-name", p.name));
    const grid = h("div", "card-grid");
    grid.style.setProperty("--cols", CARD.cols);
    buildCard(p.id).forEach((cell) => {
      const el = createCellEl(cell);
      const content = getContent(cell);
      const aboutYou = cell.type === "personal" && state.player && cell.about === state.player.id;
      if (content) setOpenFace(el, cell, content, aboutYou); else setLockFace(el);
      el.classList.toggle("is-ticked", isCellTicked(cell, set));
      grid.appendChild(el);
    });
    block.append(grid);
    root.append(block);
  });
}

// ---------------------------------------------------------------------
// venster (sheet): negeert de eerste ±450 ms, zodat de vinger die net
// loslaat na een lang indrukken het venster niet meteen sluit
// ---------------------------------------------------------------------
function openSheet({ title, build, actions }) {
  const root = $("modal-root");
  closeSheet();
  const backdrop = h("div", "sheet-backdrop pending");
  const sheet = h("div", "sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", title);
  sheet.append(h("h3", "", title));
  if (build) build(sheet);
  actions.forEach((a) => {
    const btn = h("button", a.cls || "btn-secondary", a.label);
    btn.type = "button";
    btn.addEventListener("click", () => a.onClick(sheet, btn));
    sheet.append(btn);
  });
  backdrop.append(sheet);
  const openedAt = performance.now();
  const guarded = (e) => { if (performance.now() - openedAt < SHEET_GUARD_MS) { e.stopPropagation(); e.preventDefault(); return true; } return false; };
  // een click die kort na het openen aankomt is de loslaatbeweging van het lang indrukken
  backdrop.addEventListener("click", (e) => { if (guarded(e)) return; if (e.target === backdrop) closeSheet(); }, true);
  root.append(backdrop);
  setTimeout(() => backdrop.classList.remove("pending"), SHEET_GUARD_MS);
  return sheet;
}
function closeSheet() { $("modal-root").querySelectorAll(".sheet-backdrop").forEach((n) => n.remove()); }

// ---------------------------------------------------------------------
// admin (alles via rpc, de server controleert de code)
// ---------------------------------------------------------------------
let adminOpen = false;
let adminStops = [];

async function adminRpc(fn, params) {
  const client = await initSupabase();
  if (!client || !navigator.onLine) return { error: { message: "noconn" } };
  return sb(client.rpc(fn, params));
}

function openAdminEntry() {
  vibrate(30);
  openSheet({
    title: "Spelleiderscode",
    build: (sheet) => {
      const input = h("input");
      input.id = "admin-code-input";
      input.setAttribute("inputmode", "numeric");
      input.setAttribute("maxlength", "4");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("aria-label", "Spelleiderscode");
      const err = h("p", "error hidden");
      err.id = "admin-code-error";
      sheet.append(input, err);
      setTimeout(() => input.focus(), 60);
    },
    actions: [
      {
        label: "Bevestigen", cls: "btn-primary",
        onClick: async (sheet, btn) => {
          const code = sheet.querySelector("#admin-code-input").value;
          const err = sheet.querySelector("#admin-code-error");
          btn.disabled = true;
          const { data, error } = await adminRpc("admin_list_stops", { p_admin_code: code });
          btn.disabled = false;
          if (error) {
            err.textContent = /invalid_admin_code/.test(error.message || "") ? "Foute code." : "Verbinding nodig.";
            err.classList.remove("hidden");
            return;
          }
          state.adminCode = code;
          adminStops = data || [];
          closeSheet();
          openAdminPanel();
        },
      },
      { label: "Annuleren", cls: "btn-secondary", onClick: closeSheet },
    ],
  });
}

function openAdminPanel() {
  adminOpen = true;
  const root = $("modal-root");
  root.replaceChildren();
  const overlay = h("div", "admin-overlay");
  overlay.id = "admin-overlay";
  root.append(overlay);
  renderAdminPanel();
}
function closeAdminPanel() {
  adminOpen = false;
  state.adminCode = null;
  adminStops = [];
  $("modal-root").replaceChildren();
}

function stopStatus(s) {
  if (s.override_state === "open" || s.override_state === "closed") return s.override_state;
  return new Date(s.opens).getTime() <= Date.now() ? "open" : "closed";
}

function renderAdminPanel() {
  const overlay = $("admin-overlay");
  if (!overlay) return;
  const hhmm = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  overlay.innerHTML = `
    <div class="admin-header"><h2>Spelleider</h2><button class="link-btn" id="admin-close" type="button">Sluiten</button></div>
    <div id="admin-stops"></div>
    <div class="admin-section"><h3>Grote onthulling</h3>
      <div class="reveal-switch-row"><span>Toon alle kaarten</span>
        <button type="button" class="switch ${state.settings.reveal ? "on" : ""}" id="reveal-switch" role="switch" aria-checked="${state.settings.reveal}" aria-label="Onthulling"><span class="knob"></span></button>
      </div></div>
    <div class="admin-section"><h3>${esc(EE.adminTest.title)}</h3><div id="admin-eggs" class="admin-eggs"></div></div>
    <div class="admin-section"><h3>Speler resetten</h3><div id="admin-players"></div></div>
    <div class="admin-section"><h3>Alles resetten</h3><button class="btn-danger" id="admin-reset-all" type="button" style="max-width:none">Alles resetten</button></div>
  `;
  $("admin-close").addEventListener("click", closeAdminPanel);

  const stopsRoot = $("admin-stops");
  adminStops.forEach((s) => {
    const status = stopStatus(s);
    const row = h("div", "admin-stop");
    row.innerHTML = `
      <div class="admin-stop-top">
        <span class="admin-stop-name">${esc(s.icon)} ${esc(s.name)} <span class="admin-stop-time">${hhmm(s.opens)}</span></span>
        <span class="admin-stop-status ${status}">${status === "open" ? "OPEN" : "DICHT"}</span>
      </div>
      <div class="admin-stop-btns">
        <button type="button" data-act="open" class="${s.override_state === "open" ? "selected" : ""}">Nu openen</button>
        <button type="button" data-act="closed" class="${s.override_state === "closed" ? "selected" : ""}">Gesloten houden</button>
        <button type="button" data-act="auto" class="${!s.override_state ? "selected" : ""}">Automatisch</button>
      </div>`;
    row.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => adminSetStop(s.stop_id, btn.dataset.act)));
    stopsRoot.append(row);
  });

  $("reveal-switch").addEventListener("click", async () => {
    const next = !state.settings.reveal;
    const { error } = await adminRpc("admin_set_reveal", { p_admin_code: state.adminCode, p_reveal: next });
    if (error) { adminFailed(error); return; }
    state.settings.reveal = next;
    lsSet("kesnoene_reveal_cache", next);
    $("tab-reveal").classList.toggle("hidden", !next);
    renderAdminPanel();
  });

  EE.adminTest.items.forEach((item) => {
    const btn = h("button", "admin-egg-btn", item.label);
    btn.type = "button";
    btn.addEventListener("click", () => runEgg(item.id));
    $("admin-eggs").append(btn);
  });

  PLAYERS.forEach((p) => {
    const row = h("div", "admin-player-row");
    row.append(h("span", "", p.name));
    const btn = h("button", "", "Reset");
    btn.type = "button";
    btn.addEventListener("click", () => confirmResetPlayer(p));
    row.append(btn);
    $("admin-players").append(row);
  });
  $("admin-reset-all").addEventListener("click", confirmResetAll);
}

function adminFailed(error) {
  if (/invalid_admin_code/.test(error.message || "")) { closeAdminPanel(); showToast("Foute code."); }
  else if (error.code) showToast("Actie mislukt op de server.");
  else showToast("Server niet bereikbaar.");
}

async function reloadAdminStops() {
  const { data, error } = await adminRpc("admin_list_stops", { p_admin_code: state.adminCode });
  if (error) { adminFailed(error); return; }
  adminStops = data || [];
  if (adminOpen) renderAdminPanel();
}

async function adminSetStop(stopId, act) {
  const { error } = await adminRpc("admin_set_stop", { p_admin_code: state.adminCode, p_stop_id: stopId, p_state: act });
  if (error) { adminFailed(error); return; }
  await reloadAdminStops();
  await refreshUnlocks();
  await refreshSecret({ animate: true });
  scheduleNextOpening();
}

function confirmResetPlayer(p) {
  openSheet({
    title: `${p.name} resetten?`,
    build: (sheet) => sheet.append(h("p", "", `Alle vakjes van ${p.name} worden gewist.`)),
    actions: [
      {
        label: "Resetten", cls: "btn-danger",
        onClick: async () => {
          const { error } = await adminRpc("admin_reset_player", { p_admin_code: state.adminCode, p_player_id: p.id });
          closeSheet();
          if (error) { adminFailed(error); return; }
          showToast(`${p.name} is gereset.`);
          if (state.player && state.player.id === p.id) await syncOwnTicks();
          if (currentTab === "scoreboard") renderScoreboard();
        },
      },
      { label: "Annuleren", cls: "btn-secondary", onClick: closeSheet },
    ],
  });
}

function confirmResetAll() {
  openSheet({
    title: "Alles resetten?",
    build: (sheet) => sheet.append(h("p", "", "Dit wist alle kaarten, gebeurtenissen en de onthulling. Dit kan niet ongedaan worden gemaakt.")),
    actions: [
      {
        label: "Verder", cls: "btn-danger",
        onClick: () => openSheet({
          title: "Zeker helemaal zeker?",
          build: (sheet) => sheet.append(h("p", "", "Laatste kans om te annuleren.")),
          actions: [
            {
              label: "Ja, alles wissen", cls: "btn-danger",
              onClick: async () => {
                const { error } = await adminRpc("admin_reset_all", { p_admin_code: state.adminCode });
                closeSheet();
                if (error) { adminFailed(error); return; }
                state.settings.reveal = false;
                $("tab-reveal").classList.add("hidden");
                await refreshSettings();
                await refreshUnlocks();
                await reloadAdminStops();
                showToast("Alles is gereset.");
              },
            },
            { label: "Annuleren", cls: "btn-secondary", onClick: closeSheet },
          ],
        }),
      },
      { label: "Annuleren", cls: "btn-secondary", onClick: closeSheet },
    ],
  });
}

// de admin opent via lang indrukken, nooit via een zichtbare knop
attachLongPress($("admin-stamp"), { ms: 700, onLongPress: openAdminEntry });
attachLongPress($("player-tag"), { ms: 700, onLongPress: openAdminEntry });

// ---------------------------------------------------------------------
// svg-hulpje
// ---------------------------------------------------------------------
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(name, attrs) {
  const node = document.createElementNS(SVGNS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}
// ---------------------------------------------------------------------
// drankbonnen (instellingen en teksten staan in data.js, GAME)
// ---------------------------------------------------------------------
const GT = GAME.texts;
const gameFmt = (tpl, vars = {}) => fmt(tpl, { drinkWord: GAME.drinkWord, ...vars });

const linesCount = () => computeCompletedLines(state.card, state.ticks).length;
const earnedBons = () => Math.floor(tickedCount(state.card, state.ticks) / GAME.ticksPerBon) + GAME.bonPerLine * linesCount();

function drinkTotals() {
  const given = {};
  const received = {};
  state.drinkEvents.forEach((d) => {
    given[d.from] = (given[d.from] || 0) + 1;
    received[d.to] = (received[d.to] || 0) + 1;
  });
  return { given, received };
}
const pendingDrinkOps = () => getQueue().filter((q) => q.op === "drink").length;
function availableBons() {
  if (!state.player || !state.card) return 0;
  const given = drinkTotals().given[state.player.id] || 0;
  return Math.max(0, earnedBons() - given - pendingDrinkOps());
}
const persistDrinks = () => lsSet("kesnoene_drinks", Array.from(state.drinkEvents.values()));

function updateDrinkButton() {
  const btn = $("drink-btn");
  if (!btn || !state.player || !state.card) return;
  const n = availableBons();
  btn.textContent = fmt(GT.giveButton, { n });
  btn.disabled = n < 1 || isReadOnly();
}

// alle uitgedeelde drankjes (server is leidend; lokaal bewaard voor offline)
async function loadDrinks() {
  if (!supabase) return;
  const { data, error } = await sb(supabase.from("events").select("id, player, payload").eq("kind", "drink").order("id"));
  if (error || !Array.isArray(data)) return;
  state.drinkEvents = new Map(data.map((e) => [e.id, { id: e.id, from: e.player, to: (e.payload || {}).to }]));
  persistDrinks();
  updateDrinkButton();
  checkMissedOrders();
  if (currentTab === "scoreboard") renderScoreboard();
}

function addDrinkEvent(e) {
  state.drinkEvents.set(e.id, { id: e.id, from: e.player, to: (e.payload || {}).to });
  persistDrinks();
  updateDrinkButton();
  if (currentTab === "scoreboard") renderScoreboard();
}

// ----- nieuwe bon verdiend -----
function announceBon() {
  showToast(GT.earnedToast);
  vibrate([25, 40, 25]);
  flyBon();
}

function popDrinkButton() {
  const btn = $("drink-btn");
  if (!btn || reduced()) return;
  btn.animate([{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 360, easing: "ease-out" });
}

// een bon vliegt naar de "zak" (de knop)
let lastTickedId = null;
function flyBon() {
  const btn = $("drink-btn");
  if (!btn || !btn.offsetParent || reduced()) { popDrinkButton(); return; }
  const fromEl = lastTickedId && cellEls.get(lastTickedId);
  const fr = fromEl ? fromEl.getBoundingClientRect() : { left: window.innerWidth / 2 - 20, top: window.innerHeight / 2, width: 40, height: 40 };
  const tr = btn.getBoundingClientRect();
  const sx = fr.left + fr.width / 2 - 18;
  const sy = fr.top + fr.height / 2 - 18;
  const ex = tr.left + tr.width / 2 - 18;
  const ey = tr.top + tr.height / 2 - 18;
  const bon = h("div", "bon-fly", "🍺");
  document.body.append(bon);
  bon.animate([
    { transform: `translate(${sx}px,${sy}px) scale(0.4) rotate(-20deg)`, opacity: 0 },
    { transform: `translate(${sx}px,${sy - 24}px) scale(1.5) rotate(8deg)`, opacity: 1, offset: 0.22 },
    { transform: `translate(${(sx + ex) / 2}px,${Math.min(sy, ey) - 60}px) scale(1.2) rotate(-6deg)`, opacity: 1, offset: 0.58 },
    { transform: `translate(${ex}px,${ey}px) scale(0.5) rotate(0deg)`, opacity: 0.9 },
  ], { duration: 900, easing: "ease-in-out" }).onfinish = () => { bon.remove(); popDrinkButton(); };
}

function checkBon() {
  const earned = earnedBons();
  if (earned > state.bonSeen) {
    state.bonSeen = earned;
    lsSet(pkey("bon"), earned);
    announceBon();
  }
  updateDrinkButton();
}

// na een wijziging van buitenaf: geen toast
function silentBonSync() {
  if (!state.player || !state.card) return;
  state.bonSeen = Math.min(state.bonSeen, earnedBons());
  lsSet(pkey("bon"), state.bonSeen);
  updateDrinkButton();
}

// ----- uitdelen -----
function openGiveSheet() {
  if (availableBons() < 1 || isReadOnly()) return;
  const others = PLAYERS.filter((p) => p.id !== state.player.id);
  openSheet({
    title: gameFmt(GT.giveTitle),
    build: (sheet) => others.forEach((p) => {
      const btn = h("button", "btn-primary give-target", p.name);
      btn.type = "button";
      btn.addEventListener("click", () => confirmGive(p));
      sheet.append(btn);
    }),
    actions: [{ label: GT.cancel, cls: "btn-secondary", onClick: closeSheet }],
  });
}

function confirmGive(player) {
  openSheet({
    title: gameFmt(GT.confirmTitle, { name: player.name }),
    actions: [
      { label: GT.confirmYes, cls: "btn-primary", onClick: () => { closeSheet(); giveDrink(player.id); } },
      { label: GT.confirmNo, cls: "btn-secondary", onClick: openGiveSheet },
    ],
  });
}

function giveDrink(toId) {
  if (availableBons() < 1) return;
  queueOp("drink", null, { to: toId });
  showToast(gameFmt(GT.givenToast, { from: state.player.name, to: nameOf(toId) }));
  vibrate(20);
  updateDrinkButton();
}
$("drink-btn").addEventListener("click", openGiveSheet);

// ----- bevel: grote melding bij de ontvanger -----
const orderQueue = [];
const orderIds = new Set();
let orderOpen = false;
const getAck = () => lsGet(pkey("ack"), null);

function enqueueOrder(evt) {
  if (!state.player || orderIds.has(evt.id)) return;
  if (!evt.demo && evt.id <= (getAck() || 0)) return;
  orderIds.add(evt.id);
  orderQueue.push(evt);
  if (!orderOpen) showNextOrder();
}

function showNextOrder() {
  const evt = orderQueue.shift();
  const root = $("order-root");
  if (!evt) { orderOpen = false; root.replaceChildren(); return; }
  orderOpen = true;
  root.replaceChildren();
  const overlay = h("div", "order-overlay");
  overlay.setAttribute("role", "alertdialog");
  const card = h("div", "order-card");
  card.append(h("p", "order-title", GT.orderTitle), h("p", "order-from", gameFmt(GT.orderFrom, { from: nameOf(evt.player) })));
  const btn = h("button", "btn-primary order-btn", GT.orderButton);
  btn.type = "button";
  const shownAt = performance.now();
  btn.addEventListener("click", () => {
    if (performance.now() - shownAt < 600) return;
    if (!evt.demo && evt.id > (getAck() || 0)) lsSet(pkey("ack"), evt.id);
    showNextOrder();
  });
  card.append(btn);
  overlay.append(card);
  root.append(overlay);
  vibrate([220, 100, 220, 100, 420]);
  if (!reduced()) {
    card.animate([
      { transform: "scale(2.6) rotate(-10deg)", opacity: 0 },
      { transform: "scale(0.94) rotate(-3deg)", opacity: 1, offset: 0.6 },
      { transform: "scale(1) rotate(-3deg)", opacity: 1 },
    ], { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "both" });
  }
}

// bevelen die binnenkwamen terwijl de app dicht was
function checkMissedOrders() {
  if (!state.player) return;
  const events = Array.from(state.drinkEvents.values());
  let ack = lsGet(pkey("ack"), null);
  if (ack === null) { lsSet(pkey("ack"), events.reduce((m, e) => Math.max(m, e.id), 0)); return; }
  events.filter((e) => e.to === state.player.id && e.id > ack).sort((a, b) => a.id - b.id)
    .forEach((e) => enqueueOrder({ id: e.id, player: e.from, payload: { to: e.to } }));
}

function showOrderDemo() {
  enqueueOrder({ id: -Date.now(), demo: true, player: (PLAYERS.find((p) => !state.player || p.id !== state.player.id) || PLAYERS[0]).id, payload: { to: state.player ? state.player.id : null } });
}

// ---------------------------------------------------------------------
// 5. dog tags op de foto
// ---------------------------------------------------------------------
function buildDogtagZones() {
  const zoom = $("hero-zoom");
  EE.dogtags.forEach((d, i) => {
    const zone = h("div", "dogtag-zone");
    zone.dataset.idx = i;
    zone.style.left = `${d.x}%`;
    zone.style.top = `${d.y}%`;
    zone.style.width = `${d.r * 2}%`;
    zone.style.height = `${d.r * 2}%`;
    zone.setAttribute("aria-hidden", "true");
    zone.textContent = String(i + 1);
    zoom.append(zone);
  });
  if (new URLSearchParams(location.search).has("zones")) zoom.classList.add("show-zones");
  // een tik opent de tag; meer dan 10 px bewegen (scrollen) opent niets
  attachLongPress(zoom, { selector: ".dogtag-zone", shouldStart: () => false, onTap: (el) => showDogTag(Number(el.dataset.idx)) });
}

function chainSVG() {
  const svg = svgEl("svg", { class: "dogtag-chain", viewBox: "0 0 20 96", "aria-hidden": "true" });
  for (let i = 0; i < 6; i++) {
    svg.append(svgEl("ellipse", { cx: 10, cy: 8 + i * 15, rx: i % 2 ? 3 : 6, ry: 8, class: "chain-link" }));
  }
  return svg;
}

function closeDogTag() {
  const root = $("dogtag-root");
  const backdrop = root.firstElementChild;
  if (!backdrop) return;
  if (reduced()) { root.replaceChildren(); return; }
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).onfinish = () => root.replaceChildren();
}

function showDogTag(i) {
  const d = EE.dogtags[i];
  if (!d) return;
  const root = $("dogtag-root");
  root.replaceChildren();
  const backdrop = h("div", "dogtag-backdrop");
  const tag = h("div", "dogtag");
  const swing = h("div", "dogtag-swing");
  const plate = h("div", "dogtag-plate");
  const body = h("div", "dogtag-body");
  body.append(h("p", "dogtag-name", d.name), h("p", "dogtag-rank", d.rank), h("p", "dogtag-specialty", d.specialty));
  plate.append(h("span", "dogtag-hole"), body);
  swing.append(chainSVG(), plate);
  tag.append(swing);
  backdrop.append(tag);
  root.append(backdrop);

  const openedAt = performance.now();
  // een tik buiten de tag sluit hem, maar niet de loslaatbeweging van het lang indrukken
  backdrop.addEventListener("click", (e) => {
    if (performance.now() - openedAt < SHEET_GUARD_MS) return;
    if (e.target.closest(".dogtag-plate")) return;
    closeDogTag();
  });
  vibrate(30);
  if (reduced()) return;
  tag.animate([
    { transform: "translateY(-110%)" },
    { transform: "translateY(5%)", offset: 0.62 },
    { transform: "translateY(0)" },
  ], { duration: 620, easing: "cubic-bezier(.2,.8,.3,1)", fill: "both" });
  swing.animate([
    { transform: "rotate(0deg)" },
    { transform: "rotate(9deg)", offset: 0.25 },
    { transform: "rotate(-6deg)", offset: 0.5 },
    { transform: "rotate(3.5deg)", offset: 0.72 },
    { transform: "rotate(-1.5deg)", offset: 0.88 },
    { transform: "rotate(0deg)" },
  ], { duration: 2200, delay: 450, easing: "ease-in-out" });
}

// ---------------------------------------------------------------------
// 4. de 2CV rijdt voorbij
// ---------------------------------------------------------------------
const CAR_SVG = `
<svg class="car-svg" viewBox="0 0 130 70" aria-hidden="true">
  <g class="car-smoke"><circle class="puff p1" cx="7" cy="51" r="3.5"/><circle class="puff p2" cx="7" cy="51" r="3.5"/><circle class="puff p3" cx="7" cy="51" r="3.5"/></g>
  <rect class="c-dark" x="2" y="49" width="13" height="4" rx="2"/>
  <g class="car-bob">
    <path class="c-body" d="M10 52 L10 42 Q10 36 18 34 L30 33 Q36 14 56 13 L86 13 Q102 13 107 31 L118 35 Q125 37 125 45 L125 52 Q125 57 120 57 L15 57 Q10 57 10 52 Z"/>
    <path class="c-roof" d="M33 33 Q38 17 56 16 L86 16 Q99 16 104 31 Z"/>
    <path class="c-glass" d="M60 19 L84 19 Q92 19 97 30 L60 30 Z"/>
    <path class="c-glass" d="M41 30 Q45 22 55 20 L57 20 L57 30 Z"/>
    <path class="c-line" d="M58 18 L58 44 M12 44 L120 44"/>
    <circle class="c-light" cx="118" cy="42" r="5"/>
    <rect class="c-dark" x="119" y="52" width="9" height="3" rx="1.5"/>
    <circle class="c-dark" cx="34" cy="57" r="13"/>
    <circle class="c-dark" cx="98" cy="57" r="13"/>
    <g class="wheel"><circle class="c-tyre" cx="34" cy="57" r="10"/><circle class="c-hub" cx="34" cy="57" r="4"/><path class="c-spoke" d="M34 49 L34 65 M26 57 L42 57"/></g>
    <g class="wheel"><circle class="c-tyre" cx="98" cy="57" r="10"/><circle class="c-hub" cx="98" cy="57" r="4"/><path class="c-spoke" d="M98 49 L98 65 M90 57 L106 57"/></g>
  </g>
</svg>`;

let carBusy = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildCar() {
  const car = h("div", "car");
  car.setAttribute("role", "img");
  car.setAttribute("aria-label", EE.car.ariaLabel);
  car.innerHTML = CAR_SVG;
  car.append(h("div", "car-bubble", EE.car.bubble));
  return car;
}

function carCloud(car) {
  const cloud = h("div", "car-cloud");
  car.append(cloud);
  for (let i = 0; i < 6; i++) {
    const puff = h("span", "cloud-puff");
    puff.style.left = `${-6 + Math.random() * 18}px`;
    puff.style.bottom = `${10 + Math.random() * 14}px`;
    cloud.append(puff);
    puff.animate([
      { transform: "translate(0,0) scale(0.3)", opacity: 0.95 },
      { transform: `translate(${-12 - Math.random() * 34}px,${-26 - Math.random() * 46}px) scale(${1.8 + Math.random() * 1.2})`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 900, delay: i * 90, easing: "ease-out", fill: "both" });
  }
  const pfft = h("div", "car-pfft", EE.car.puff);
  car.append(pfft);
  pfft.animate([
    { transform: "translateY(6px) scale(0.5)", opacity: 0 },
    { transform: "translateY(-6px) scale(1.15)", opacity: 1, offset: 0.25 },
    { transform: "translateY(-20px) scale(1)", opacity: 1, offset: 0.8 },
    { transform: "translateY(-26px) scale(1)", opacity: 0 },
  ], { duration: EE.car.stallMs, fill: "both" });
  return () => { cloud.remove(); pfft.remove(); };
}

// geeft false terug als hij nu niet mag (bingo-viering of al bezig)
function driveCar() {
  if (carBusy || document.querySelector(".celebration")) return false;
  carBusy = true;
  const layer = $("car-layer");
  const car = buildCar();
  layer.append(car);
  const bubble = car.querySelector(".car-bubble");

  const finish = () => { car.remove(); carBusy = false; };

  if (reduced()) {
    // rustige variant: de auto staat even stil in beeld, enkel de tekst
    car.style.left = "calc(50% - 52px)";
    car.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: "both" });
    car.addEventListener("click", () => { bubble.textContent = EE.car.puff; });
    setTimeout(() => car.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" }).onfinish = finish, 4500);
    return true;
  }

  const width = window.innerWidth;
  const ride = car.animate([
    { transform: "translateX(-120px)" },
    { transform: `translateX(${width + 20}px)` },
  ], { duration: EE.car.durationMs, easing: "linear", fill: "forwards" });

  let holding = false;
  const watcher = setInterval(() => {
    // nooit tijdens een bingo-viering
    const busy = !!document.querySelector(".celebration");
    car.style.visibility = busy ? "hidden" : "visible";
    if (holding) return;
    if (busy && ride.playState === "running") ride.pause();
    else if (!busy && ride.playState === "paused") ride.play();
  }, 150);
  ride.onfinish = () => { clearInterval(watcher); finish(); };

  car.addEventListener("click", async () => {
    if (holding) return;
    holding = true;
    ride.pause();
    car.classList.add("stalled");
    bubble.style.opacity = "0";
    bubble.style.visibility = "hidden";
    vibrate([25, 40, 25]);
    const cleanup = carCloud(car);
    await sleep(EE.car.stallMs);
    cleanup();
    car.classList.remove("stalled");
    // hortend weer op gang
    for (const [run, wait] of [[260, 220], [320, 150], [380, 0]]) {
      ride.play();
      await sleep(run);
      if (wait) { ride.pause(); await sleep(wait); }
    }
    holding = false;
  });
  return true;
}

// elk heel uur, enkel tussen MISSION.start en MISSION.end
let lastCarHourKey = null;
function maybeDriveCar() {
  const t = nowMs();
  if (document.hidden || t < new Date(MISSION.start).getTime() || t >= new Date(MISSION.end).getTime()) return;
  const p = brusselsParts(t);
  if (p.mi !== 0 || p.s >= EE.car.windowSec) return;
  const key = `${p.y}-${p.mo}-${p.d}-${p.h}`;
  if (key === lastCarHourKey) return;
  lastCarHourKey = key;
  let tries = 0;
  const attempt = () => { if (!driveCar() && ++tries < 20) setTimeout(attempt, 1000); };
  attempt();
}

let carTimer = null;
function scheduleCar() {
  clearTimeout(carTimer);
  const t = nowMs();
  if (t >= new Date(MISSION.end).getTime()) return;
  const nextHour = Math.floor(t / 3600000) * 3600000 + 3600000;
  carTimer = setTimeout(() => { maybeDriveCar(); scheduleCar(); }, nextHour - t + 100);
}

// ---------------------------------------------------------------------
// admin: "Easter eggs testen"
// ---------------------------------------------------------------------
async function runEgg(id) {
  if (id === "car") { carBusy = false; $("car-layer").replaceChildren(); driveCar(); return; }
  if (id === "dogtag") { showDogTag(0); return; }
  if (id === "order") { showOrderDemo(); return; }
  if (id === "lockspam") {
    closeAdminPanel();
    const lockedCell = $("screen-main").classList.contains("active") && document.querySelector('#card-grid .cell[data-state="locked"]');
    if (!lockedCell) { lockSpamPenalty(); return; }
    $("card-grid").scrollIntoView({ block: "center" });
    for (let i = 0; i < EE.lockSpam.taps; i++) { handleLockedTap(lockedCell); await sleep(330); }
    return;
  }
  if (id === "after" || id === "memorial" || id === "anniversary") startPreview(id);
}

// ---------------------------------------------------------------------
// opstart
// ---------------------------------------------------------------------
initLandingTexts();
buildDogtagZones();
scheduleCar();
maybeDriveCar();
document.addEventListener("visibilitychange", () => { if (!document.hidden) { scheduleCar(); maybeDriveCar(); } });

// ---------------------------------------------------------------------
// opstart (landing en aanmelden)
// ---------------------------------------------------------------------
checkEnvironment();
renderPlayerButtons();
$("tab-reveal").classList.toggle("hidden", !state.settings.reveal);
updateLanding();
updateConnIndicator();
routeOnLoad();
