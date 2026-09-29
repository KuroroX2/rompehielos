// app.js - Lógica principal de RompeHielos
import { firebaseConfig } from "./firebase-config.js";
import { DEFAULT_CATEGORIES } from "./questions-data.js";
import { classifyGroupQuestion, isChoiceQuestion, questionText } from "./question-types.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const db = getFirestore(initializeApp(firebaseConfig));

// ==========================================
// 1. BANCO DE PREGUNTAS (oficial + ediciones locales del admin)
// ==========================================
const STORAGE_KEY_CATEGORIES = "rompehielos_categories_v3";
["rompehielos_custom_categories_v2"].forEach((oldKey) => {
  try { localStorage.removeItem(oldKey); } catch {}
});

let categories = loadStoredCategories();

function loadStoredCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || "null");
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Las ediciones del admin se conservan, pero las categorías oficiales nuevas también aparecen
      const ids = new Set(parsed.map((c) => c.id));
      return [...parsed, ...structuredClone(DEFAULT_CATEGORIES.filter((c) => !ids.has(c.id)))];
    }
  } catch {}
  return structuredClone(DEFAULT_CATEGORIES);
}

function saveCategories(cats) {
  categories = cats;
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(cats));
  } catch (e) {
    showToast("No se pudo guardar en este dispositivo", "⚠️");
  }
}

function getCategory(id) {
  return categories.find((c) => c.id === id) || DEFAULT_CATEGORIES.find((c) => c.id === id);
}

// ==========================================
// 2. UTILIDADES
// ==========================================
const $ = (id) => document.getElementById(id);
let toastTimer = null;

function showToast(msg, icon = "✨") {
  $("toast-msg").textContent = msg;
  $("toast-icon").textContent = icon;
  $("toast-notice").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast-notice").classList.remove("show"), 3000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomId(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function store(kind, key, value) {
  try { (kind === "local" ? localStorage : sessionStorage).setItem(key, value); } catch {}
}
function load(kind, key) {
  try { return (kind === "local" ? localStorage : sessionStorage).getItem(key); } catch { return null; }
}
function unstore(kind, key) {
  try { (kind === "local" ? localStorage : sessionStorage).removeItem(key); } catch {}
}

function initParticles() {
  const container = $("particles-container");
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = Math.random() * 8 + 4;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 12}s`;
    p.style.animationDuration = `${Math.random() * 8 + 10}s`;
    container.appendChild(p);
  }
}

function switchView(viewId) {
  document.querySelectorAll(".view-screen").forEach((el) => el.classList.toggle("active", el.id === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function activeViewId() {
  return document.querySelector(".view-screen.active")?.id;
}

// ==========================================
// 3. MODO 1 CELULAR (2 personas en la mesa)
// ==========================================
const SOLO_CATEGORIES = ["citas_nivel1", "citas_nivel2", "citas_nivel3", "dilemas_absurdos"];

const solo = {
  categoryId: "citas_nivel1",
  subcategory: "all",
  deck: [],
  index: 0,
  tableMode: true,
};

function filterBySubcategory(questions, sub) {
  if (sub === "all") return questions;
  const filtered = questions.filter((q) => isChoiceQuestion(q) === (sub === "choice"));
  return filtered.length > 0 ? filtered : questions;
}

function setChipGroup(containerId, sub) {
  document.querySelectorAll(`#${containerId} .filter-chip`).forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.subcat === sub);
  });
}

function renderSoloCategories() {
  const grid = $("solo-categories-grid");
  grid.innerHTML = SOLO_CATEGORIES.map(getCategory)
    .filter(Boolean)
    .map((cat) => {
      const choiceCount = cat.preguntas.filter(isChoiceQuestion).length;
      return `
        <div class="category-card" data-catid="${cat.id}" role="button" tabindex="0">
          <div class="category-top">
            <span class="cat-emoji">${cat.icono || "🧊"}</span>
            <span class="cat-badge" style="color:${cat.color || "var(--cyan)"}">${escapeHtml(cat.badge || "Pack")}</span>
          </div>
          <h4>${escapeHtml(cat.titulo)}</h4>
          <p>${escapeHtml(cat.descripcion)}</p>
          <div class="cat-counts">
            <span class="count-chip choice">🅰️/🅱️ ${choiceCount}</span>
            <span class="count-chip open">💬 ${cat.preguntas.length - choiceCount}</span>
          </div>
          <div class="cat-meta">
            <span>${cat.preguntas.length} preguntas</span>
            <strong>Jugar ➔</strong>
          </div>
        </div>`;
    })
    .join("");
  setChipGroup("solo-subcat-chips", solo.subcategory);
}

$("solo-categories-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".category-card");
  if (card) startSoloMode(card.dataset.catid);
});

$("solo-subcat-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  solo.subcategory = chip.dataset.subcat;
  setChipGroup("solo-subcat-chips", solo.subcategory);
});

$("solo-filter-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  solo.subcategory = chip.dataset.subcat;
  reshuffleSoloDeck();
});

function reshuffleSoloDeck() {
  const cat = getCategory(solo.categoryId);
  solo.deck = shuffleArray(filterBySubcategory(cat.preguntas, solo.subcategory));
  solo.index = 0;
  updateSoloCard();
}

function startSoloMode(categoryId) {
  solo.categoryId = categoryId;
  reshuffleSoloDeck();
  switchView("view-solo");
}

// El turno se deduce de la posición: pregunta par = Jugador 1, impar = Jugador 2
function updateSoloCard() {
  const cat = getCategory(solo.categoryId);
  const total = solo.deck.length;
  if (total === 0) {
    $("solo-question-text").textContent = "No hay preguntas en esta temática.";
    return;
  }
  solo.index = ((solo.index % total) + total) % total;
  const question = solo.deck[solo.index];
  const isP1 = solo.index % 2 === 0;

  const typeBadge = $("solo-subcat-badge");
  const choice = isChoiceQuestion(question);
  typeBadge.textContent = choice ? "🅰️/🅱️ Elección" : "💬 Abierta";
  typeBadge.classList.toggle("is-choice", choice);

  const card = $("solo-question-card");
  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");

  $("solo-rotating-arena").classList.toggle("rotate-180", solo.tableMode && !isP1);
  $("top-player-bar").classList.toggle("active-player", !isP1);
  $("bottom-player-bar").classList.toggle("active-player", isP1);
  $("lbl-top-player-instruction").textContent = isP1 ? "Escucha a Jugador 1" : "🗣️ Te toca preguntar";
  $("lbl-bottom-player-instruction").textContent = isP1 ? "🗣️ Te toca preguntar" : "Escucha a Jugador 2";

  const choiceCount = cat.preguntas.filter(isChoiceQuestion).length;
  $("count-subcat-all").textContent = cat.preguntas.length;
  $("count-subcat-choice").textContent = choiceCount;
  $("count-subcat-open").textContent = cat.preguntas.length - choiceCount;
  setChipGroup("solo-filter-chips", solo.subcategory);

  $("solo-cat-badge").textContent = `${cat.icono || ""} ${cat.titulo}`;
  $("solo-cat-badge").style.color = cat.color || "var(--cyan)";
  $("solo-counter").textContent = `${solo.index + 1} / ${total}`;
  $("solo-question-text").textContent = question;
  $("lbl-table-mode-text").textContent = solo.tableMode ? "Giro: sí" : "Giro: no";
}

function soloStep(delta) {
  solo.index += delta;
  updateSoloCard();
}

$("solo-question-card").addEventListener("click", () => soloStep(1));
$("btn-solo-next").addEventListener("click", () => soloStep(1));
$("btn-solo-prev").addEventListener("click", () => soloStep(-1));
$("btn-solo-shuffle").addEventListener("click", () => {
  reshuffleSoloDeck();
  showToast("Preguntas barajadas", "🔀");
});
$("btn-toggle-table-mode").addEventListener("click", () => {
  solo.tableMode = !solo.tableMode;
  updateSoloCard();
  showToast(solo.tableMode ? "La tarjeta gira hacia quien pregunta" : "La tarjeta queda fija", "🔄");
});

function openSoloCategories() {
  renderSoloCategories();
  switchView("view-solo-categories");
}

$("btn-back-solo").addEventListener("click", openSoloCategories);
$("btn-back-solo-categories").addEventListener("click", () => switchView("view-home"));

// ==========================================
// 4. SALAS MULTICELULAR
// ==========================================
// Estructura en Firestore:
//   salas/{code}                       estado compartido (dinámica, fase, ronda, pregunta actual)
//   salas/{code}/players/{playerId}    quién está conectado
//   salas/{code}/v_{gameId}_{round}    votos anónimos (el id del doc es un token aleatorio)
//   salas/{code}/s_{gameId}            confesiones o "2 mentiras y 1 verdad" escritas
//   salas/{code}/d_{gameId}_{round}    respuestas de "Respuestas en sincronía"
//   salas/{code}/muro                  mensajes del muro anónimo
// Solo el anfitrión avanza fases y rondas; todos los celulares reaccionan al snapshot.

const HEARTBEAT_MS = 25000;
const STALE_MS = 75000;

const ROOM_DYNAMICS = [
  { key: "quien_es_mas_probable", mode: "preguntas", category: "quien_es_mas_probable", icon: "👉", title: "¿Quién es más probable?", desc: "Cada uno vota por alguien del grupo y se revela el ranking." },
  { key: "secretos_intimos", mode: "preguntas", category: "secretos_intimos", icon: "🔥", title: "Secretos íntimos (+18)", desc: "Afirmaciones picantes: cada uno vota Sí o No en secreto.", gender: true },
  { key: "dilemas_absurdos", mode: "preguntas", category: "dilemas_absurdos", icon: "🤯", title: "Dilemas absurdos", desc: "Votan A o B, Sí o No, o a alguien le toca responder.", gender: true },
  { key: "amigos_fiesta", mode: "preguntas", category: "amigos_fiesta", icon: "🍻", title: "Amigos y carrete", desc: "Anécdotas, votaciones y confesiones para el grupo.", gender: true },
  { key: "empresas_trabajo", mode: "preguntas", category: "empresas_trabajo", icon: "💼", title: "Trabajo en equipo", desc: "Para conocer al equipo: rondas de respuesta y votaciones.", gender: true },
  { key: "reunion_hombres", mode: "preguntas", category: "reunion_hombres", icon: "🍺", title: "Junta de hombres", desc: "Solo para hombres: qué miran primero, quién es el más mandado y más.", audience: "hombre" },
  { key: "reunion_mujeres", mode: "preguntas", category: "reunion_mujeres", icon: "🥂", title: "Junta de mujeres", desc: "Solo para mujeres: qué miran primero, quién stalkea mejor y más.", audience: "mujer" },
  { key: "confesiones", mode: "confesiones", icon: "🕵️", title: "Confesiones anónimas", desc: "Cada uno escribe una confesión y el grupo adivina de quién es.", author: true },
  { key: "tres", mode: "tres", icon: "🎭", title: "2 mentiras y 1 verdad", desc: "Cada uno escribe 3 afirmaciones y el resto adivina la real." },
  { key: "duo", mode: "duo", icon: "⚡", title: "Respuestas en sincronía", desc: "Todos responden la misma pregunta en secreto y se revelan juntas." },
  { key: "muro", mode: "muro", icon: "🧱", title: "Muro anónimo", desc: "Mensajes sin nombre que aparecen en vivo en todos los celulares." },
];

function getDynamic(key) {
  return ROOM_DYNAMICS.find((d) => d.key === key) || ROOM_DYNAMICS[0];
}

const profile = {
  playerId: load("session", "rh_player_id") || "p_" + randomId(10),
  name: load("local", "rh_player_name") || "",
  avatar: load("local", "rh_player_avatar") || "🦊",
  gender: load("local", "rh_player_gender") || "hombre",
};
store("session", "rh_player_id", profile.playerId);

let roomWatcher = null;       // sala en la que juega este celular
let heartbeatTimer = null;
let selectedDynamicKey = "quien_es_mas_probable";
let lastPanelKey = null;

function activePlayers(players) {
  const now = Date.now();
  return players.filter((p) => !p.lastSeen || now - p.lastSeen < STALE_MS);
}

function isHost() {
  return !!roomWatcher?.room && roomWatcher.room.hostId === profile.playerId;
}

function roomRef(code) {
  return doc(db, "salas", code);
}

function friendlyError(err) {
  if (err?.code === "permission-denied") return "Firebase rechazó el acceso a la sala";
  if (err?.code === "unavailable") return "Sin conexión a internet";
  return err?.message || "Error desconocido";
}

// ---------- Observador de una sala (lo usan los jugadores y el Modo TV) ----------
function createRoomWatcher(code, onUpdate, onMissing) {
  const w = {
    code, room: null, players: [], votes: [], subs: [], answers: [], muro: [],
    roundKey: null, gameKey: null, unsubs: [], roundUnsubs: [], gameUnsubs: [],
  };

  const listen = (colName, field, target) => {
    const unsub = onSnapshot(
      collection(db, "salas", code, colName),
      (snap) => {
        w[field] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onUpdate(w);
      },
      (err) => console.warn(`Error escuchando ${colName}:`, err)
    );
    target.push(unsub);
  };

  const syncGameSubs = () => {
    const r = w.room;
    const playing = r.state === "playing";
    const gameKey = playing ? `${r.mode}|${r.gameId}` : null;
    const roundKey = playing ? `${gameKey}|${r.round}` : null;

    if (gameKey !== w.gameKey) {
      w.gameUnsubs.forEach((u) => u());
      w.gameUnsubs = [];
      w.subs = [];
      w.muro = [];
      w.gameKey = gameKey;
      if (playing && (r.mode === "confesiones" || r.mode === "tres")) listen(`s_${r.gameId}`, "subs", w.gameUnsubs);
      if (playing && r.mode === "muro") {
        w.gameUnsubs.push(
          onSnapshot(query(collection(db, "salas", code, "muro"), orderBy("createdAt", "desc"), limit(80)), (snap) => {
            w.muro = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            onUpdate(w);
          })
        );
      }
    }

    if (roundKey !== w.roundKey) {
      w.roundUnsubs.forEach((u) => u());
      w.roundUnsubs = [];
      w.votes = [];
      w.answers = [];
      w.roundKey = roundKey;
      if (playing && ["preguntas", "confesiones", "tres"].includes(r.mode)) listen(`v_${r.gameId}_${r.round}`, "votes", w.roundUnsubs);
      if (playing && r.mode === "duo") listen(`d_${r.gameId}_${r.round}`, "answers", w.roundUnsubs);
    }
  };

  w.unsubs.push(
    onSnapshot(
      roomRef(code),
      (snap) => {
        if (!snap.exists()) {
          onMissing?.(w);
          return;
        }
        w.room = snap.data();
        syncGameSubs();
        onUpdate(w);
      },
      (err) => showToast(friendlyError(err), "⚠️")
    )
  );
  w.unsubs.push(
    onSnapshot(collection(db, "salas", code, "players"), (snap) => {
      w.players = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      onUpdate(w);
    })
  );

  w.stop = () => [...w.unsubs, ...w.roundUnsubs, ...w.gameUnsubs].forEach((u) => u());
  return w;
}

// ---------- Perfil: avatar y género ----------
function setupProfilePickers() {
  $("input-player-name").value = profile.name;

  const avatars = document.querySelectorAll(".avatar-opt");
  avatars.forEach((opt) => {
    opt.classList.toggle("selected", opt.dataset.avatar === profile.avatar);
    opt.addEventListener("click", () => {
      avatars.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      profile.avatar = opt.dataset.avatar;
      store("local", "rh_player_avatar", profile.avatar);
    });
  });

  const genders = document.querySelectorAll("#gender-picker .segmented-opt");
  genders.forEach((opt) => {
    opt.classList.toggle("selected", opt.dataset.gender === profile.gender);
    opt.addEventListener("click", () => {
      genders.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      profile.gender = opt.dataset.gender;
      store("local", "rh_player_gender", profile.gender);
    });
  });
}

function readPlayerName() {
  const input = $("input-player-name");
  const name = input.value.trim();
  if (!name) {
    showToast("Escribe tu nombre primero", "✍️");
    input.focus();
    return null;
  }
  profile.name = name;
  store("local", "rh_player_name", name);
  return name;
}

function generateRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  return code;
}

// merge: al recargar la página se conservan "listo" y "ya votó", y el orden de llegada
async function writePlayerDoc(code) {
  const ref = doc(db, "salas", code, "players", profile.playerId);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      name: profile.name,
      avatar: profile.avatar,
      gender: profile.gender,
      lastSeen: Date.now(),
      ...(existing.exists() ? {} : { joinedAt: Date.now() }),
    },
    { merge: true }
  );
}

// ---------- Crear, unirse, salir ----------
$("btn-create-room").addEventListener("click", async () => {
  if (!readPlayerName()) return;
  const btn = $("btn-create-room");
  btn.disabled = true;
  try {
    let code = generateRoomCode();
    for (let i = 0; i < 3 && (await getDoc(roomRef(code))).exists(); i++) code = generateRoomCode();
    await setDoc(roomRef(code), {
      code,
      hostId: profile.playerId,
      state: "lobby",
      lobbyId: randomId(6),
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await writePlayerDoc(code);
    enterRoom(code);
    showToast(`Sala ${code} creada`, "🎉");
  } catch (err) {
    console.error(err);
    showToast("No se pudo crear la sala: " + friendlyError(err), "❌");
  } finally {
    btn.disabled = false;
  }
});

$("btn-toggle-join-mode").addEventListener("click", () => {
  const container = $("join-code-container");
  container.hidden = !container.hidden;
  if (!container.hidden) $("input-room-code").focus();
});

async function joinRoom(rawCode, { silent = false } = {}) {
  const code = (rawCode || "").trim().toUpperCase();
  if (code.length < 4) {
    if (!silent) showToast("Ese código no es válido", "⚠️");
    return false;
  }
  try {
    const snap = await getDoc(roomRef(code));
    if (!snap.exists()) {
      if (!silent) showToast(`La sala ${code} no existe o ya se cerró`, "❌");
      return false;
    }
    await writePlayerDoc(code);
    enterRoom(code);
    if (!silent) showToast(`Entraste a la sala ${code}`, "🚀");
    return true;
  } catch (err) {
    console.error(err);
    if (!silent) showToast("No se pudo entrar: " + friendlyError(err), "❌");
    return false;
  }
}

$("btn-submit-join").addEventListener("click", async () => {
  if (!readPlayerName()) return;
  const btn = $("btn-submit-join");
  btn.disabled = true;
  await joinRoom($("input-room-code").value);
  btn.disabled = false;
});

$("input-room-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btn-submit-join").click();
});

function enterRoom(code) {
  roomWatcher?.stop();
  lastPanelKey = null;
  store("session", "rh_room", code);
  history.replaceState(null, "", window.location.pathname);

  $("lobby-join-create-box").hidden = true;
  $("lobby-active-room-box").hidden = false;
  $("invited-room-banner").hidden = true;
  $("lbl-room-code").textContent = code;

  roomWatcher = createRoomWatcher(code, onRoomUpdate, () => {
    showToast("La sala se cerró", "👋");
    resetRoomUi();
  });

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  if (activeViewId() !== "view-tv") switchView("view-lobby");
}

function heartbeat() {
  if (!roomWatcher) return;
  updateDoc(doc(db, "salas", roomWatcher.code, "players", profile.playerId), { lastSeen: Date.now() }).catch(() => {});
  maybeClaimHost();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") heartbeat();
});

// Si el anfitrión se desconectó, el jugador más antiguo que siga activo toma el control
function maybeClaimHost() {
  const w = roomWatcher;
  if (!w?.room || isHost()) return;
  const active = activePlayers(w.players);
  const hostActive = active.some((p) => p.id === w.room.hostId);
  if (!hostActive && active[0]?.id === profile.playerId) {
    updateDoc(roomRef(w.code), { hostId: profile.playerId })
      .then(() => showToast("Ahora eres el anfitrión de la sala", "👑"))
      .catch(() => {});
  }
}

async function leaveRoom() {
  const w = roomWatcher;
  if (!w) return;
  const code = w.code;
  const others = activePlayers(w.players).filter((p) => p.id !== profile.playerId);
  try {
    if (isHost() && others.length > 0) await updateDoc(roomRef(code), { hostId: others[0].id });
    await deleteDoc(doc(db, "salas", code, "players", profile.playerId));
  } catch (err) {
    console.warn("Error al salir de la sala:", err);
  }
  resetRoomUi();
  showToast("Saliste de la sala", "👋");
}

function resetRoomUi() {
  roomWatcher?.stop();
  roomWatcher = null;
  clearInterval(heartbeatTimer);
  unstore("session", "rh_room");
  $("lobby-main-actions").hidden = false;
  $("lobby-join-create-box").hidden = false;
  $("lobby-active-room-box").hidden = true;
  if (activeViewId() === "view-game") switchView("view-lobby");
}

$("btn-leave-room").addEventListener("click", () => {
  if (confirm("¿Salir de la sala?")) leaveRoom();
});

// ---------- Compartir ----------
function roomShareUrl(code) {
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg, "📋");
  } catch {
    showToast(text, "🔗");
  }
}

$("btn-copy-room-code").addEventListener("click", () => {
  if (roomWatcher) copyText(roomShareUrl(roomWatcher.code), "Enlace de la sala copiado");
});

$("btn-share-whatsapp").addEventListener("click", () => {
  if (!roomWatcher) return;
  const text = `🧊 ¡Únete a mi sala de RompeHielos! Código ${roomWatcher.code}: ${roomShareUrl(roomWatcher.code)}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
});

$("btn-lobby-tv-shortcut").addEventListener("click", () => {
  if (roomWatcher) openTv(roomWatcher.code);
});

// ---------- Sala de espera ----------
// Cada vuelta a la sala de espera tiene un id nuevo; un jugador está listo si marcó ese id.
// Al empezar una dinámica el id cambia, así que al volver todos deben marcar "listo" otra vez.
function lobbyKey(room) {
  return room?.lobbyId || "inicio";
}

function isReady(player, room) {
  return player.id === room.hostId || player.readyFor === lobbyKey(room);
}

function playerChipsHtml(players, hostId, room = null) {
  return players
    .map((p) => {
      const readyMark = room ? (isReady(p, room) ? " ✅" : " ⏳") : "";
      return `<div class="player-chip ${p.id === hostId ? "is-host" : ""}">
        <span>${p.avatar || "👤"}</span><span>${escapeHtml(p.name)}</span>${p.id === hostId ? " 👑" : readyMark}
      </div>`;
    })
    .join("");
}

function lobbyReadiness(w) {
  const active = activePlayers(w.players);
  const readyCount = active.filter((p) => isReady(p, w.room)).length;
  return { active, readyCount, allReady: active.length >= 2 && readyCount === active.length };
}

function genderCounts(players) {
  const counts = { hombre: 0, mujer: 0, otro: 0 };
  players.forEach((p) => { counts[p.gender in counts ? p.gender : "otro"]++; });
  return counts;
}

function singleGenderWarning(players) {
  const { hombre, mujer } = genderCounts(players);
  if (hombre === 1 && mujer === 1) return "Hay solo 1 hombre y 1 mujer: con el desglose por género se sabría qué votó cada uno.";
  if (hombre === 1) return "Hay solo 1 hombre: con el desglose por género se sabría qué votó.";
  if (mujer === 1) return "Hay solo 1 mujer: con el desglose por género se sabría qué votó.";
  return "";
}

// Tipos de pregunta que el anfitrión puede activar o desactivar en el paso 2
const QUESTION_TYPES = [
  { type: "choice", icon: "🅰️", title: "Elegir una opción", desc: "¿Preferirías A o B? y preguntas con alternativas" },
  { type: "yesno", icon: "🙋", title: "Sí o No", desc: "Cada uno vota en secreto" },
  { type: "suspect", icon: "👉", title: "Votar por alguien", desc: "¿Quién del grupo...?" },
  { type: "open", icon: "🎤", title: "Responder en voz alta", desc: "Se sortea a alguien para que responda", duoTitle: "Respuesta escrita", duoDesc: "Cada uno escribe lo que quiera" },
];

let hostStep = 1;
let selectedTypes = new Set(QUESTION_TYPES.map((t) => t.type));

// Preguntas disponibles para una dinámica (null si la dinámica no usa el banco de preguntas)
function dynamicPool(dyn) {
  if (dyn.mode === "preguntas") return { questions: getCategory(dyn.category).preguntas, category: dyn.category };
  if (dyn.mode === "duo") return { questions: [...getCategory("citas_nivel1").preguntas, ...getCategory("dilemas_absurdos").preguntas], category: "" };
  return null;
}

function typeCounts(dyn) {
  const pool = dynamicPool(dyn);
  const counts = {};
  pool?.questions.forEach((q) => {
    const t = classifyGroupQuestion(q, pool.category).type;
    counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
}

function selectedQuestionCount(dyn) {
  const counts = typeCounts(dyn);
  return [...selectedTypes].reduce((sum, t) => sum + (counts[t] || 0), 0);
}

function renderDynamicsGrid() {
  $("dynamics-grid").innerHTML = ROOM_DYNAMICS.map(
    (d) => `
      <button type="button" class="dynamic-card-radio ${d.key === selectedDynamicKey ? "selected" : ""}" data-key="${d.key}">
        <span class="dyn-icon">${d.icon}</span>
        <strong>${d.title}</strong>
        <small>${d.desc}</small>
      </button>`
  ).join("");
}

function renderHostStep() {
  const dyn = getDynamic(selectedDynamicKey);
  $("host-step-1").hidden = hostStep !== 1;
  $("host-step-2").hidden = hostStep !== 2;
  if (hostStep !== 2) return;

  $("selected-dynamic-summary").innerHTML = `<span class="dyn-icon">${dyn.icon}</span><div><strong>${dyn.title}</strong><small>${dyn.desc}</small></div>`;

  const counts = typeCounts(dyn);
  const available = QUESTION_TYPES.filter((t) => counts[t.type] > 0);
  $("question-types-box").hidden = available.length === 0;
  $("question-types-list").innerHTML = available
    .map((t) => {
      const on = selectedTypes.has(t.type);
      const title = dyn.mode === "duo" && t.duoTitle ? t.duoTitle : t.title;
      const desc = dyn.mode === "duo" && t.duoDesc ? t.duoDesc : t.desc;
      return `<button type="button" class="type-toggle ${on ? "selected" : ""}" data-type="${t.type}" aria-pressed="${on}">
        <span class="type-check">${on ? "✓" : ""}</span>
        <span class="type-icon">${t.icon}</span>
        <span class="type-text"><strong>${title}</strong><small>${desc}</small></span>
        <span class="type-count">${counts[t.type]}</span>
      </button>`;
    })
    .join("");
  updateDynamicOptions();
}

function updateDynamicOptions() {
  const dyn = getDynamic(selectedDynamicKey);
  const usesTypes = !!dynamicPool(dyn);
  $("opt-reveal-author-row").hidden = !dyn.author;
  $("opt-reveal-gender-row").hidden = !dyn.gender || !selectedTypes.has("yesno");
  const players = roomWatcher ? activePlayers(roomWatcher.players) : [];
  let warning = !$("opt-reveal-gender-row").hidden && $("chk-reveal-gender").checked ? singleGenderWarning(players) : "";
  if (dyn.audience) {
    const outsiders = players.filter((p) => p.gender !== dyn.audience).length;
    if (outsiders > 0) {
      const audienceLabel = dyn.audience === "hombre" ? "hombres" : "mujeres";
      warning = `Esta dinámica está pensada para una junta solo de ${audienceLabel}, y en la sala hay ${outsiders} ${outsiders === 1 ? "persona" : "personas"} de otro género.`;
    }
  }
  $("single-gender-warning-box").hidden = !warning;
  $("lbl-single-gender-desc").textContent = warning;

  // El botón de empezar aparece solo si todos están listos y hay preguntas para jugar
  const ready = roomWatcher?.room ? lobbyReadiness(roomWatcher) : { allReady: false, readyCount: 0, active: [] };
  const questionCount = usesTypes ? selectedQuestionCount(dyn) : 1;
  const canStart = ready.allReady && questionCount > 0;
  $("btn-start-dynamic").hidden = !canStart;
  $("btn-start-dynamic").textContent = usesTypes ? `🚀 Empezar para todos (${questionCount} preguntas)` : "🚀 Empezar para todos";
  $("start-wait-msg").hidden = canStart;
  $("start-wait-msg").textContent =
    questionCount === 0 ? "☝️ Marca al menos un tipo de pregunta."
    : ready.active.length < 2 ? "👥 Se necesitan al menos 2 jugadores para empezar."
    : `⏳ Esperando que todos estén listos (${ready.readyCount} de ${ready.active.length}).`;
}

$("dynamics-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".dynamic-card-radio");
  if (!card) return;
  selectedDynamicKey = card.dataset.key;
  document.querySelectorAll(".dynamic-card-radio").forEach((c) => c.classList.toggle("selected", c === card));
});

$("btn-host-next-step").addEventListener("click", () => {
  selectedTypes = new Set(QUESTION_TYPES.map((t) => t.type));
  hostStep = 2;
  renderHostStep();
});

$("btn-host-prev-step").addEventListener("click", () => {
  hostStep = 1;
  renderHostStep();
});

$("question-types-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".type-toggle");
  if (!btn) return;
  const t = btn.dataset.type;
  if (selectedTypes.has(t)) selectedTypes.delete(t);
  else selectedTypes.add(t);
  renderHostStep();
});

$("chk-reveal-gender").addEventListener("change", updateDynamicOptions);

function renderLobby(w) {
  const { active, readyCount } = lobbyReadiness(w);
  const host = isHost();
  $("lbl-player-count").textContent = active.length;
  $("room-players-list").innerHTML = playerChipsHtml(active, w.room.hostId, w.room);
  const hostPlayer = w.players.find((p) => p.id === w.room.hostId);
  $("lbl-host-indicator").textContent = host ? "👑 Eres el anfitrión" : `Anfitrión: ${hostPlayer?.name || "..."}`;
  $("host-lobby-actions").hidden = !host;
  $("non-host-wait-msg").hidden = host;
  $("lbl-host-lobby-hint").textContent =
    active.length < 2 ? "Invita al menos a 1 persona más." : readyCount === active.length ? "✅ Todos listos: elige el juego y empiecen." : "Puedes ir eligiendo el juego mientras el resto marca listo.";
  $("setup-room-pill").textContent = `👥 Sala ${w.code} · ✅ ${readyCount} de ${active.length} listos`;

  $("lbl-ready-status").textContent =
    active.length < 2 ? "👥 Se necesitan al menos 2 jugadores" : `✅ ${readyCount} de ${active.length} listos`;

  const me = w.players.find((p) => p.id === profile.playerId);
  const imReady = me ? isReady(me, w.room) : false;
  const readyBtn = $("btn-toggle-ready");
  readyBtn.hidden = host;
  readyBtn.textContent = imReady ? "✅ Estoy listo (toca para cancelar)" : "✋ Estoy listo";
  readyBtn.classList.toggle("is-ready", imReady);

  if (host) updateDynamicOptions();
}

$("btn-toggle-ready").addEventListener("click", async () => {
  const w = roomWatcher;
  if (!w?.room) return;
  const me = w.players.find((p) => p.id === profile.playerId);
  const imReady = me ? isReady(me, w.room) : false;
  try {
    await updateDoc(doc(db, "salas", w.code, "players", profile.playerId), { readyFor: imReady ? null : lobbyKey(w.room) });
  } catch (err) {
    showToast("No se pudo actualizar: " + friendlyError(err), "❌");
  }
});

function onRoomUpdate(w) {
  if (!w.room) return;
  renderLobby(w);
  const view = activeViewId();
  if (w.room.state === "playing") {
    if (view === "view-lobby" || view === "view-setup") switchView("view-game");
    renderGame(w);
  } else if (view === "view-game" || (view === "view-setup" && !isHost())) {
    lastPanelKey = null;
    switchView("view-lobby");
  }
}

$("btn-open-setup").addEventListener("click", () => {
  switchView("view-setup");
  renderHostStep();
});

$("btn-setup-back").addEventListener("click", () => switchView("view-lobby"));

// ---------- Iniciar dinámica (anfitrión) ----------
function gameResetFields() {
  return {
    phase: null, round: 0, pos: 0, deck: [], order: [], current: null,
    speaker: null, currentAuthor: null, realIdx: null, category: null,
  };
}

function filteredDeck(dyn) {
  const pool = dynamicPool(dyn);
  return shuffleArray(pool.questions.filter((q) => selectedTypes.has(classifyGroupQuestion(q, pool.category).type)));
}

function pickSpeaker(players, exceptId) {
  const pool = activePlayers(players).filter((p) => p.id !== exceptId);
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  return pick ? { id: pick.id, name: pick.name, avatar: pick.avatar || "👤" } : null;
}

$("btn-start-dynamic").addEventListener("click", async () => {
  const w = roomWatcher;
  if (!w || !isHost()) return;
  if (!lobbyReadiness(w).allReady) {
    showToast("Todavía hay jugadores que no están listos", "⏳");
    return;
  }
  const dyn = getDynamic(selectedDynamicKey);
  const fields = {
    ...gameResetFields(),
    lobbyId: randomId(6),
    state: "playing",
    mode: dyn.mode,
    dynamicKey: dyn.key,
    gameId: randomId(6),
    settings: {
      revealAuthor: $("chk-reveal-truth").checked,
      revealGender: $("chk-reveal-gender").checked,
      types: [...selectedTypes],
    },
  };
  if (dynamicPool(dyn) && selectedQuestionCount(dyn) === 0) {
    showToast("Marca al menos un tipo de pregunta", "☝️");
    return;
  }

  if (dyn.mode === "preguntas") {
    fields.category = dyn.category;
    fields.deck = filteredDeck(dyn);
    fields.phase = "vote";
    fields.speaker = pickSpeaker(w.players);
  } else if (dyn.mode === "duo") {
    fields.deck = filteredDeck(dyn);
    fields.phase = "answer";
  } else if (dyn.mode === "muro") {
    fields.phase = "wall";
  } else {
    fields.phase = "write";
  }

  try {
    await updateDoc(roomRef(w.code), fields);
  } catch (err) {
    showToast("No se pudo empezar: " + friendlyError(err), "❌");
  }
});

// ==========================================
// 5. MOTOR DE DINÁMICAS EN SALA
// ==========================================
function hostUpdate(fields) {
  if (!roomWatcher || !isHost()) return Promise.resolve();
  return updateDoc(roomRef(roomWatcher.code), fields).catch((err) => showToast(friendlyError(err), "⚠️"));
}

function voteStorageKey(room) {
  return `rh_v_${roomWatcher.code}_${room.gameId}_${room.round}`;
}

function getMyVote(room) {
  try { return JSON.parse(load("session", voteStorageKey(room)) || "null"); } catch { return null; }
}

// El voto se guarda con un id aleatorio y sin nombre: nadie puede saber qué votó cada persona
async function castVote(value, label, extra = {}) {
  const w = roomWatcher;
  const room = w?.room;
  if (!room || getMyVote(room)) return;
  const token = randomId(16);
  store("session", voteStorageKey(room), JSON.stringify({ value, label }));
  renderGame(w);
  try {
    await setDoc(doc(db, "salas", w.code, `v_${room.gameId}_${room.round}`, token), { value, ...extra });
    markStepDone();
  } catch (err) {
    unstore("session", voteStorageKey(room));
    renderGame(w);
    showToast("No se pudo registrar tu voto: " + friendlyError(err), "❌");
  }
}

function questionTypeLabel(info) {
  return {
    suspect: "👉 Voten por alguien",
    choice: info.options?.length > 2 ? "☝️ Elige una opción" : "🅰️/🅱️ Elijan una opción",
    yesno: "🙋 Sí o no, en secreto",
    open: "🎤 Ronda de respuesta",
  }[info.type];
}

function barRow(label, count, total, { highlight = false, color = "var(--purple)" } = {}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <div class="result-row ${highlight ? "is-top" : ""}">
      <div class="result-row-head">
        <span>${label}</span>
        <strong>${count} ${count === 1 ? "voto" : "votos"} · ${pct}%</strong>
      </div>
      <div class="result-track"><div class="result-fill" style="width:${pct}%; background:${color}"></div></div>
    </div>`;
}

function suspectResultsHtml(votes, players) {
  const tally = new Map();
  votes.forEach((v) => {
    const player = players.find((p) => p.id === v.value);
    const name = player ? `${player.avatar || "👤"} ${escapeHtml(player.name)}` : escapeHtml(v.name || "Alguien");
    const entry = tally.get(v.value) || { name, count: 0 };
    entry.count++;
    tally.set(v.value, entry);
  });
  const sorted = [...tally.values()].sort((a, b) => b.count - a.count);
  if (sorted.length === 0) return "";
  const tie = sorted.length > 1 && sorted[0].count === sorted[1].count;
  const headline = tie ? "🤝 ¡Empate en el primer lugar!" : `👑 ${sorted[0].name} ganó la votación`;
  return `
    <div class="results-headline">${headline}</div>
    <div class="results-bars-list">
      ${sorted.map((s, i) => barRow(s.name, s.count, votes.length, { highlight: i === 0 && !tie, color: i === 0 ? "var(--coral)" : "var(--purple)" })).join("")}
    </div>`;
}

const OPTION_COLORS = ["var(--cyan)", "var(--pink)", "var(--purple)", "var(--emerald)", "var(--amber)", "var(--coral)"];

function optionLetter(i) {
  return String.fromCharCode(65 + i);
}

function choiceResultsHtml(votes, options) {
  const counts = options.map((_, i) => votes.filter((v) => v.value === i).length);
  const max = Math.max(...counts);
  const winners = counts.filter((c) => c === max).length;
  const winner = winners === 1 ? counts.indexOf(max) : -1;
  const headline = winner === -1 ? "🤝 ¡Empate!" : `🏆 Ganó: ${escapeHtml(options[winner])}`;
  // Con más de 2 opciones se ordenan de más a menos votada
  const order = options.map((_, i) => i);
  if (options.length > 2) order.sort((a, b) => counts[b] - counts[a]);
  return `
    <div class="results-headline">${headline}</div>
    <div class="results-bars-list">
      ${order
        .map((i) => barRow(`${optionLetter(i)}. ${escapeHtml(options[i])}`, counts[i], votes.length, { highlight: i === winner, color: OPTION_COLORS[i % OPTION_COLORS.length] }))
        .join("")}
    </div>`;
}

function yesNoResultsHtml(votes, info, revealGender) {
  const yes = votes.filter((v) => v.value === "yes").length;
  const no = votes.length - yes;
  let html = `
    <div class="stat-pair">
      <div class="stat-box yes"><span class="stat-num">${yes}</span><span>${info.labels[0]}</span></div>
      <div class="stat-box no"><span class="stat-num">${no}</span><span>${info.labels[1]}</span></div>
    </div>`;

  if (revealGender) {
    const groups = [
      { key: "hombre", label: "👨 Hombres", color: "var(--cyan)" },
      { key: "mujer", label: "👩 Mujeres", color: "var(--pink)" },
      { key: "otro", label: "🌈 Otros", color: "var(--purple)" },
    ];
    const rows = groups
      .map((g) => {
        const group = votes.filter((v) => v.gender === g.key);
        if (group.length === 0) return "";
        const groupYes = group.filter((v) => v.value === "yes").length;
        const pct = Math.round((groupYes / group.length) * 100);
        return `
          <div class="result-row">
            <div class="result-row-head"><span>${g.label}</span><strong>${groupYes} de ${group.length} dijeron sí</strong></div>
            <div class="result-track"><div class="result-fill" style="width:${pct}%; background:${g.color}"></div></div>
          </div>`;
      })
      .join("");
    if (rows) html += `<div class="results-bars-list">${rows}</div>`;
  }

  let intrigue;
  if (yes === 0) intrigue = "Todos dijeron que no... ¿santos o nadie se atrevió? 😇";
  else if (yes === votes.length) intrigue = "¡El 100% dijo que sí! Nadie aquí es inocente 😂";
  else if (yes === 1) intrigue = "Solo 1 persona lo admitió. ¿Quién será? 👀";
  else intrigue = `${yes} de ${votes.length} personas dijeron que sí 🤫`;
  return html + `<div class="results-headline subtle">${intrigue}</div>`;
}

function voteButtonsHtml(buttons) {
  return `<div class="voting-options-grid">${buttons
    .map((b) => `<button type="button" class="vote-btn ${b.cls || ""}" data-vote="${escapeAttr(JSON.stringify(b.value))}" data-label="${escapeAttr(b.label)}">${b.html}</button>`)
    .join("")}</div>`;
}

function votedHtml(myVote) {
  return `<div class="voted-status">✓ Tu voto: <strong>${escapeHtml(myVote.label)}</strong></div>`;
}

function hostButtons(buttons) {
  return buttons.map((b) => `<button type="button" class="btn ${b.cls || "btn-primary"}" data-host="${b.action}" ${b.disabled ? "disabled" : ""}>${b.label}</button>`).join("");
}

function nonHostNote(text) {
  return `<p class="muted-small center">${text}</p>`;
}

// ---------- Render principal ----------
function renderGame(w) {
  const room = w.room;
  if (!room || room.state !== "playing") return;
  const dyn = getDynamic(room.dynamicKey);
  $("game-mode-pill").textContent = `${dyn.icon} ${dyn.title}`;
  $("btn-game-back").textContent = isHost() ? "← Terminar" : "← Salir";

  const renderers = { preguntas: renderPreguntas, confesiones: renderConfesiones, tres: renderTres, duo: renderDuo, muro: renderMuro };
  renderers[room.mode]?.(w);
  $("game-player-status").innerHTML = playerStatusHtml(w);
}

// ---------- Estados por jugador ("Juan votó", "Vale envió") ----------
// Cada jugador marca en su documento el paso que ya completó. Solo dice QUE participó, nunca QUÉ eligió.
function currentStep(room) {
  if (!room || room.state !== "playing") return null;
  const g = room.gameId;
  if (room.mode === "preguntas") {
    const info = classifyGroupQuestion(room.deck[room.pos], room.category);
    return info.type === "open" ? null : { key: `${g}:${room.round}`, verb: "votó" };
  }
  if (room.mode === "confesiones" || room.mode === "tres") {
    if (room.phase === "write") return { key: `${g}:write`, verb: room.mode === "tres" ? "está listo" : "envió" };
    if (room.phase === "end") return null;
    return { key: `${g}:${room.round}`, verb: "votó", exceptId: room.mode === "tres" ? room.current?.playerId : null };
  }
  if (room.mode === "duo") return { key: `${g}:${room.round}`, verb: "respondió" };
  return null;
}

function playerStatusHtml(w) {
  const step = currentStep(w.room);
  if (!step) return "";
  const players = activePlayers(w.players);
  const chips = players
    .map((p) => {
      if (p.id === step.exceptId) return `<span class="status-chip is-turn">🎭 ${escapeHtml(p.name)} (su turno)</span>`;
      const done = p.doneFor === step.key;
      return `<span class="status-chip ${done ? "is-done" : ""}">${done ? "✅" : "⏳"} ${escapeHtml(p.name)}${done ? ` ${step.verb}` : ""}</span>`;
    })
    .join("");
  return `<div class="status-chips">${chips}</div>`;
}

function markStepDone() {
  const step = currentStep(roomWatcher?.room);
  if (!step) return;
  updateDoc(doc(db, "salas", roomWatcher.code, "players", profile.playerId), { doneFor: step.key }).catch(() => {});
}

// Reconstruye el panel solo cuando cambia la fase o la ronda, así no se borra lo que alguien está escribiendo
function ensurePanel(key, html) {
  if (key === lastPanelKey) return false;
  lastPanelKey = key;
  $("game-panel").innerHTML = html;
  return true;
}

// ---------- Preguntas en grupo (votos / ronda de respuesta) ----------
function renderPreguntas(w) {
  const room = w.room;
  const question = room.deck[room.pos] || "";
  const info = classifyGroupQuestion(question, room.category);
  const cat = getCategory(room.category);
  const players = activePlayers(w.players);
  const revealGender = !!room.settings?.revealGender;

  $("game-status").textContent = `${cat?.titulo || ""} · Pregunta ${room.pos + 1} de ${room.deck.length}`;

  let privacy = "";
  if (info.type === "yesno") privacy = revealGender ? "🛡️ Voto anónimo. Se muestra el total y el desglose por género." : "🛡️ Voto anónimo. Solo se muestra el total del grupo.";
  else if (info.type === "suspect") privacy = "🛡️ Voto secreto: nadie ve por quién votaste.";
  else if (info.type === "choice") privacy = "🛡️ Voto secreto: solo se ven los porcentajes.";

  const singleWarning = info.type === "yesno" && revealGender ? singleGenderWarning(players) : "";

  ensurePanel(
    `preguntas|${room.gameId}|${room.round}|${room.pos}`,
    `
    <div class="question-hero">
      <span class="type-badge">${questionTypeLabel(info)}</span>
      <p class="question-hero-text">${escapeHtml(questionText(question))}</p>
    </div>
    ${privacy ? `<div class="notice notice-safe">${privacy}</div>` : ""}
    ${singleWarning ? `<div class="notice notice-warn">⚠️ ${singleWarning}</div>` : ""}
    <div id="g-vote-area"></div>
    <div class="progress-line" id="g-progress"></div>
    <div id="g-results"></div>`
  );

  const host = isHost();
  if (info.type === "open") {
    const sp = room.speaker;
    const isMe = sp?.id === profile.playerId;
    $("g-vote-area").innerHTML = sp
      ? `<div class="speaker-card ${isMe ? "is-me" : ""}">
           <span class="eyebrow">Le toca responder a</span>
           <div class="speaker-name">${sp.avatar} ${escapeHtml(sp.name)}</div>
           ${isMe ? "<p>🎤 ¡Te toca! Responde en voz alta.</p>" : "<p>Después, cualquiera puede opinar.</p>"}
         </div>`
      : `<div class="speaker-card"><p>Respondan en voz alta, uno por uno.</p></div>`;
    $("g-progress").textContent = "";
    $("g-results").innerHTML = "";
    $("game-host-bar").innerHTML = host
      ? hostButtons([
          { action: "reroll-speaker", label: "🎲 Otra persona", cls: "btn-secondary" },
          { action: "next-question", label: "Siguiente pregunta ➔" },
        ])
      : nonHostNote("El anfitrión pasa a la siguiente pregunta.");
    return;
  }

  const myVote = getMyVote(room);
  const votes = w.votes;
  const everyoneVoted = allDone(votes.length, players.length);
  // Nada se muestra solo: el anfitrión revela cuando votaron todos
  const showResults = room.phase === "results";

  if (myVote) {
    $("g-vote-area").innerHTML = votedHtml(myVote);
  } else if (!showResults) {
    let buttons;
    if (info.type === "yesno") {
      buttons = [
        { value: "yes", label: info.labels[0], html: info.labels[0], cls: "big yes" },
        { value: "no", label: info.labels[1], html: info.labels[1], cls: "big no" },
      ];
    } else if (info.type === "choice") {
      const cls = info.options.length > 2 ? "option compact" : "option";
      buttons = info.options.map((opt, i) => ({ value: i, label: opt, html: `<span class="opt-letter">${optionLetter(i)}</span> ${escapeHtml(opt)}`, cls }));
    } else {
      buttons = players.map((p) => ({ value: p.id, label: p.name, html: `<span class="vote-avatar">${p.avatar || "👤"}</span> ${escapeHtml(p.name)}` }));
    }
    $("g-vote-area").innerHTML = voteButtonsHtml(buttons);
  } else {
    $("g-vote-area").innerHTML = "";
  }

  $("g-progress").textContent = `🗳️ ${votes.length} de ${players.length} votaron`;

  if (showResults && votes.length > 0) {
    let html;
    if (info.type === "suspect") html = suspectResultsHtml(votes, w.players);
    else if (info.type === "choice") html = choiceResultsHtml(votes, info.options);
    else html = yesNoResultsHtml(votes, info, revealGender);
    $("g-results").innerHTML = `<div class="results-box">${html}</div>`;
  } else {
    $("g-results").innerHTML = showResults ? `<p class="muted-small center">Nadie votó en esta ronda.</p>` : "";
  }

  $("game-host-bar").innerHTML = host
    ? hostButtons([revealOrNext(showResults, everyoneVoted, votes.length, players.length, "show-results", "📊 Mostrar resultados", "next-question", "Siguiente pregunta ➔")])
    : nonHostNote(showResults ? "Esperando la siguiente pregunta..." : "El anfitrión muestra los resultados cuando todos voten.");
}

// Los resultados solo se muestran cuando votó cada jugador conectado
function allDone(doneCount, expectedCount) {
  return expectedCount > 0 && doneCount >= expectedCount;
}

// Un solo botón para el anfitrión: desactivado mientras falten votos, luego "Mostrar" y después "Siguiente"
function revealOrNext(shown, everyoneDone, doneCount, expected, revealAction, revealLabel, nextAction, nextLabel) {
  if (shown) return { action: nextAction, label: nextLabel };
  return everyoneDone
    ? { action: revealAction, label: revealLabel, cls: "btn-purple" }
    : { action: revealAction, label: `⏳ Esperando a todos (${doneCount} de ${expected})`, cls: "btn-purple", disabled: true };
}

function handleVoteClick(btn) {
  const room = roomWatcher?.room;
  if (!room) return;
  const value = JSON.parse(btn.dataset.vote);
  const label = btn.dataset.label;
  const extra = {};
  if (room.mode === "preguntas") {
    const info = classifyGroupQuestion(room.deck[room.pos], room.category);
    if (info.type === "yesno" && room.settings?.revealGender) extra.gender = profile.gender;
    if (info.type === "suspect") extra.name = label;
  }
  if (room.mode === "confesiones") extra.name = label;
  castVote(value, label, extra);
}

// ---------- Confesiones anónimas ----------
function submissionKey(room) {
  return `rh_s_${roomWatcher.code}_${room.gameId}`;
}

function renderConfesiones(w) {
  const room = w.room;
  const players = activePlayers(w.players);
  const host = isHost();
  const reveal = room.settings?.revealAuthor !== false;

  if (room.phase === "write") {
    $("game-status").textContent = "Paso 1 · Escribe tu confesión";
    const submitted = !!load("session", submissionKey(room));
    ensurePanel(
      `conf|${room.gameId}|write|${submitted}`,
      `
      <div class="room-box inner">
        <h3 class="panel-title">Escribe tu confesión 🤫</h3>
        <div class="notice ${reveal ? "notice-warn" : "notice-safe"}">
          ${reveal ? "👀 Al final de cada votación se revelará quién la escribió." : "🛡️ 100% anónima: tu nombre no se guarda en ningún lado."}
        </div>
        ${submitted
          ? `<div class="voted-status">✓ Tu confesión está guardada</div>`
          : `<p class="panel-desc">Algo vergonzoso, una anécdota loca o algo que nadie del grupo sepa.</p>
             <textarea id="txt-player-confession" class="input-field" rows="4" maxlength="200" placeholder="Ej: Una vez me quedé dormido en una fiesta y desperté en otra..."></textarea>
             <button type="button" class="btn btn-purple btn-block" data-action="submit-confession">🔒 Enviar en secreto</button>`}
        <div class="progress-line" id="g-progress"></div>
      </div>`
    );
    const everyoneSent = allDone(w.subs.length, players.length);
    $("g-progress").textContent = `✍️ ${w.subs.length} de ${players.length} ya enviaron`;
    $("game-host-bar").innerHTML = host
      ? hostButtons([{ action: "conf-start-vote", label: everyoneSent ? "🗳️ Empezar votación" : `⏳ Esperando confesiones (${w.subs.length} de ${players.length})`, disabled: !everyoneSent }])
      : nonHostNote("Cuando todos envíen, el anfitrión empieza la votación.");
    return;
  }

  if (room.phase === "end") {
    renderEndPanel(w, "¡Se acabaron las confesiones!", "conf-restart");
    return;
  }

  // Fases vote / results
  $("game-status").textContent = `Confesión ${room.pos + 1} de ${room.order.length}`;
  ensurePanel(
    `conf|${room.gameId}|${room.round}|${room.phase}`,
    `
    <div class="question-hero purple">
      <span class="type-badge">¿De quién es esta confesión?</span>
      <p class="question-hero-text">"${escapeHtml(room.current?.text || "")}"</p>
    </div>
    <div id="g-vote-area"></div>
    <div class="progress-line" id="g-progress"></div>
    <div id="g-results"></div>`
  );

  const votes = w.votes;
  const myVote = getMyVote(room);
  const everyoneVoted = allDone(votes.length, players.length);
  // Los resultados aparecen en todos los celulares a la vez, cuando el anfitrión los muestra
  const showResults = room.phase === "results";

  if (myVote) $("g-vote-area").innerHTML = votedHtml(myVote);
  else if (!showResults)
    $("g-vote-area").innerHTML = voteButtonsHtml(
      players.map((p) => ({ value: p.id, label: p.name, html: `<span class="vote-avatar">${p.avatar || "👤"}</span> ${escapeHtml(p.name)}` }))
    );
  else $("g-vote-area").innerHTML = "";

  $("g-progress").textContent = `🗳️ ${votes.length} de ${players.length} votaron`;
  let results = showResults && votes.length ? `<div class="results-box">${suspectResultsHtml(votes, w.players)}</div>` : "";
  if (room.currentAuthor) {
    results += `<div class="author-reveal"><span class="eyebrow">💥 La confesión era de</span><div class="speaker-name">${escapeHtml(room.currentAuthor)}</div></div>`;
  }
  $("g-results").innerHTML = results;

  const isLast = room.pos + 1 >= room.order.length;
  $("game-host-bar").innerHTML = host
    ? hostButtons(
        !showResults
          ? [revealOrNext(false, everyoneVoted, votes.length, players.length, "conf-show-results", "📊 Mostrar resultados")]
          : [
              ...(reveal && !room.currentAuthor ? [{ action: "conf-reveal", label: "👀 Revelar quién confesó", cls: "btn-purple" }] : []),
              { action: "conf-next", label: isLast ? "Terminar ronda ➔" : "Siguiente confesión ➔" },
            ]
      )
    : nonHostNote(showResults ? "Esperando al anfitrión..." : "El anfitrión muestra los resultados cuando todos voten.");
}

async function submitConfession() {
  const w = roomWatcher;
  const room = w.room;
  const text = $("txt-player-confession")?.value.trim();
  if (!text) {
    showToast("Escribe algo antes de enviar", "✍️");
    return;
  }
  const reveal = room.settings?.revealAuthor !== false;
  // En modo anónimo el documento no guarda nombre y su id es aleatorio
  const docId = reveal ? profile.playerId : randomId(16);
  const data = reveal ? { text, authorId: profile.playerId, authorName: profile.name } : { text };
  try {
    await setDoc(doc(db, "salas", w.code, `s_${room.gameId}`, docId), data);
    store("session", submissionKey(room), "1");
    markStepDone();
    renderGame(w);
    showToast("Confesión enviada", "🔒");
  } catch (err) {
    showToast("No se pudo enviar: " + friendlyError(err), "❌");
  }
}

// ---------- 2 mentiras y 1 verdad ----------
function renderTres(w) {
  const room = w.room;
  const players = activePlayers(w.players);
  const host = isHost();

  if (room.phase === "write") {
    $("game-status").textContent = "Paso 1 · Escribe tus 3 afirmaciones";
    const submitted = !!load("session", submissionKey(room));
    // La tarjeta marcada como verdad queda en verde y las mentiras en rojo
    const statementInput = (i, placeholder) => `
      <div class="statement-input ${i === 0 ? "is-truth" : "is-lie"}" data-idx="${i}">
        <div class="statement-label">
          <span>Afirmación ${"ABC"[i]}</span>
          <button type="button" class="truth-toggle" data-action="pick-truth" data-idx="${i}">${i === 0 ? "✅ Verdad" : "❌ Mentira"}</button>
        </div>
        <input type="text" class="input-field" id="txt-statement-${i}" maxlength="120" placeholder="${placeholder}">
      </div>`;
    ensurePanel(
      `tres|${room.gameId}|write|${submitted}`,
      `
      <div class="room-box inner">
        <h3 class="panel-title">2 mentiras y 1 verdad 🎭</h3>
        <p class="panel-desc">Escribe 3 cosas sobre ti: 2 mentiras creíbles y <strong>1 verdad</strong>. Toca el botón de la afirmación que es verdad.</p>
        ${submitted
          ? `<div class="voted-status">✓ Tus afirmaciones están guardadas</div>`
          : `${statementInput(0, "Ej: Me rompí el brazo saltando en paracaídas")}
             ${statementInput(1, "Ej: Fui extra en un comercial de televisión")}
             ${statementInput(2, "Ej: Le tengo fobia a las aceitunas")}
             <button type="button" class="btn btn-purple btn-block" data-action="submit-tres">🔒 Guardar mis afirmaciones</button>`}
        <div class="progress-line" id="g-progress"></div>
      </div>`
    );
    const everyoneWrote = allDone(w.subs.length, players.length);
    $("g-progress").textContent = `✍️ ${w.subs.length} de ${players.length} están listos`;
    $("game-host-bar").innerHTML = host
      ? hostButtons([{ action: "tres-start-vote", label: everyoneWrote ? "🎯 Empezar a adivinar" : `⏳ Esperando a todos (${w.subs.length} de ${players.length})`, disabled: !everyoneWrote }])
      : nonHostNote("Cuando todos estén listos, el anfitrión empieza.");
    return;
  }

  if (room.phase === "end") {
    renderEndPanel(w, "¡Ya jugaron todos!", "tres-restart");
    return;
  }

  const current = room.current || {};
  const isMine = current.playerId === profile.playerId;
  $("game-status").textContent = `Jugador ${room.pos + 1} de ${room.order.length}`;
  ensurePanel(
    `tres|${room.gameId}|${room.round}|${room.phase}`,
    `
    <div class="center">
      <span class="eyebrow">Turno de</span>
      <div class="speaker-name">${current.avatar || "👤"} ${escapeHtml(current.name || "")}</div>
      <p class="panel-desc">${isMine ? "🤫 El grupo está adivinando cuál es tu verdad. ¡Pon cara de póker!" : "¿Cuál de estas 3 es la <strong>única verdad</strong>?"}</p>
    </div>
    <div id="g-vote-area"></div>
    <div class="progress-line" id="g-progress"></div>
    <div id="g-results"></div>`
  );

  const voters = players.filter((p) => p.id !== current.playerId);
  const votes = w.votes;
  const myVote = getMyVote(room);
  const revealed = room.phase === "results" && room.realIdx !== null && room.realIdx !== undefined;
  const statements = current.statements || [];

  if (revealed) {
    const correct = votes.filter((v) => v.value === room.realIdx).length;
    $("g-vote-area").innerHTML = `<div class="statement-list">${statements
      .map((s, i) => {
        const count = votes.filter((v) => v.value === i).length;
        return `<div class="statement-result ${i === room.realIdx ? "is-true" : "is-false"}">
          <span><strong>${"ABC"[i]}:</strong> ${escapeHtml(s)}</span>
          <span class="statement-meta">${i === room.realIdx ? "✓ VERDAD" : "✗ Mentira"} · ${count} ${count === 1 ? "voto" : "votos"}</span>
        </div>`;
      })
      .join("")}</div>`;
    $("g-results").innerHTML = `<div class="results-headline">${correct} de ${votes.length} adivinaron 🎯</div>`;
  } else if (isMine) {
    $("g-vote-area").innerHTML = `<div class="statement-list">${statements.map((s, i) => `<div class="statement-result"><strong>${"ABC"[i]}:</strong> ${escapeHtml(s)}</div>`).join("")}</div>`;
    $("g-results").innerHTML = "";
  } else if (myVote) {
    $("g-vote-area").innerHTML = votedHtml(myVote);
    $("g-results").innerHTML = "";
  } else {
    $("g-vote-area").innerHTML = voteButtonsHtml(
      statements.map((s, i) => ({ value: i, label: `${"ABC"[i]}: ${s}`, html: `<span class="opt-letter">${"ABC"[i]}</span> ${escapeHtml(s)}`, cls: "option" }))
    );
    $("g-results").innerHTML = "";
  }
  $("g-progress").textContent = revealed ? "" : `🗳️ ${votes.length} de ${voters.length} votaron`;

  const isLast = room.pos + 1 >= room.order.length;
  const everyoneVoted = voters.length === 0 || allDone(votes.length, voters.length);
  $("game-host-bar").innerHTML = host
    ? hostButtons(
        revealed
          ? [{ action: "tres-next", label: isLast ? "Terminar ➔" : "Siguiente jugador ➔" }]
          : [revealOrNext(false, everyoneVoted, votes.length, voters.length, "tres-reveal", "🎉 Revelar la verdad")]
      )
    : nonHostNote(revealed ? "Esperando al siguiente jugador..." : "El anfitrión revela la verdad cuando todos voten.");
}

async function submitTres() {
  const w = roomWatcher;
  const room = w.room;
  const statements = [0, 1, 2].map((i) => $(`txt-statement-${i}`).value.trim());
  if (statements.some((s) => !s)) {
    showToast("Completa las 3 afirmaciones", "⚠️");
    return;
  }
  const realIdx = parseInt(document.querySelector(".statement-input.is-truth")?.dataset.idx || "0", 10);
  try {
    await setDoc(doc(db, "salas", w.code, `s_${room.gameId}`, profile.playerId), {
      name: profile.name,
      avatar: profile.avatar,
      statements,
      realIdx,
    });
    store("session", submissionKey(room), "1");
    markStepDone();
    renderGame(w);
    showToast("Afirmaciones guardadas", "🎭");
  } catch (err) {
    showToast("No se pudo guardar: " + friendlyError(err), "❌");
  }
}

function pickTruth(btn) {
  const idx = btn.dataset.idx;
  document.querySelectorAll(".statement-input[data-idx]").forEach((card) => {
    const isTruth = card.dataset.idx === idx;
    card.classList.toggle("is-truth", isTruth);
    card.classList.toggle("is-lie", !isTruth);
    card.querySelector(".truth-toggle").textContent = isTruth ? "✅ Verdad" : "❌ Mentira";
  });
}

function tresCurrentFor(sub) {
  return { playerId: sub.id, name: sub.name, avatar: sub.avatar || "👤", statements: sub.statements };
}

// ---------- Respuestas en sincronía ----------
function duoAnswerKey(room) {
  return `rh_d_${roomWatcher.code}_${room.gameId}_${room.round}`;
}

// Opciones para responder: solo las preguntas abiertas llevan texto libre
function duoAnswerOptions(info, players) {
  if (info.type === "yesno") return info.labels.map((label, i) => ({ label, cls: `big ${i === 0 ? "yes" : "no"}`, html: label }));
  if (info.type === "choice") {
    const cls = info.options.length > 2 ? "option compact" : "option";
    return info.options.map((opt, i) => ({ label: opt, cls, html: `<span class="opt-letter">${optionLetter(i)}</span> ${escapeHtml(opt)}` }));
  }
  if (info.type === "suspect") return players.map((p) => ({ label: p.name, cls: "", html: `<span class="vote-avatar">${p.avatar || "👤"}</span> ${escapeHtml(p.name)}` }));
  return null;
}

function duoRevealHtml(answers, info) {
  if (answers.length === 0) return `<p class="muted-small center">Nadie respondió esta pregunta.</p>`;
  if (info.type === "open") {
    return `<div class="answers-grid">${answers
      .map((a) => `<div class="answer-card"><span class="eyebrow">${a.avatar || "👤"} ${escapeHtml(a.name)}</span><p>${escapeHtml(a.answer)}</p></div>`)
      .join("")}</div>`;
  }
  // Con alternativas se agrupa quién eligió qué, para ver en qué coinciden
  const groups = new Map();
  answers.forEach((a) => groups.set(a.answer, [...(groups.get(a.answer) || []), a]));
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const headline = sorted.length === 1 ? "💯 ¡Todos respondieron lo mismo!" : `🔀 ${sorted.length} respuestas distintas`;
  return `
    <div class="results-headline">${headline}</div>
    <div class="results-bars-list">
      ${sorted
        .map(([answer, people]) => `
          <div class="result-row">
            <div class="result-row-head"><span>${escapeHtml(answer)}</span><strong>${people.length} de ${answers.length}</strong></div>
            <div class="answer-people">${people.map((p) => `<span class="player-chip">${p.avatar || "👤"} ${escapeHtml(p.name)}</span>`).join("")}</div>
          </div>`)
        .join("")}
    </div>`;
}

function renderDuo(w) {
  const room = w.room;
  const players = activePlayers(w.players);
  const question = room.deck[room.pos] || "";
  const info = classifyGroupQuestion(question);
  const answered = !!load("session", duoAnswerKey(room));
  const answers = w.answers;
  const everyoneAnswered = allDone(answers.length, players.length);
  const revealed = room.phase === "reveal";
  const options = duoAnswerOptions(info, players);

  $("game-status").textContent = `Pregunta ${room.pos + 1} de ${room.deck.length}`;
  ensurePanel(
    `duo|${room.gameId}|${room.round}|${answered}|${revealed}|${info.type === "suspect" ? players.length : ""}`,
    `
    <div class="question-hero">
      <span class="type-badge">⚡ Todos responden en secreto</span>
      <p class="question-hero-text">${escapeHtml(questionText(question))}</p>
    </div>
    ${revealed ? `<div id="g-results"></div>`
      : answered ? `<div class="waiting"><div class="waiting-icon">🔐</div><p>Respuesta guardada. Se revelan todas cuando el resto termine.</p></div>`
      : options ? `<div class="voting-options-grid">${options
          .map((o) => `<button type="button" class="vote-btn ${o.cls}" data-duo="${escapeAttr(o.label)}">${o.html}</button>`)
          .join("")}</div>`
      : `<div class="join-row">
           <input type="text" class="input-field" id="txt-duo-answer" maxlength="120" placeholder="Tu respuesta...">
           <button type="button" class="btn btn-purple" data-action="submit-duo">🔒 Listo</button>
         </div>`}
    <div class="progress-line" id="g-progress"></div>`
  );

  $("g-progress").textContent = revealed ? "" : `🔐 ${answers.length} de ${players.length} respondieron`;
  if (revealed) $("g-results").innerHTML = duoRevealHtml(answers, info);

  $("game-host-bar").innerHTML = isHost()
    ? hostButtons([revealOrNext(revealed, everyoneAnswered, answers.length, players.length, "duo-reveal", "👀 Revelar respuestas", "duo-next", "Siguiente pregunta ➔")])
    : nonHostNote(revealed ? "El anfitrión pasa a la siguiente pregunta." : "El anfitrión revela las respuestas cuando todos respondan.");
}

async function submitDuo(presetAnswer) {
  const w = roomWatcher;
  const room = w.room;
  const answer = typeof presetAnswer === "string" ? presetAnswer : $("txt-duo-answer")?.value.trim();
  if (!answer) {
    showToast("Escribe tu respuesta primero", "✍️");
    return;
  }
  try {
    await setDoc(doc(db, "salas", w.code, `d_${room.gameId}_${room.round}`, profile.playerId), {
      name: profile.name,
      avatar: profile.avatar,
      answer,
    });
    store("session", duoAnswerKey(room), "1");
    markStepDone();
    renderGame(w);
  } catch (err) {
    showToast("No se pudo enviar: " + friendlyError(err), "❌");
  }
}

// ---------- Muro anónimo ----------
const WALL_COLORS = ["color-yellow", "color-pink", "color-cyan", "color-green", "color-orange"];

function wallNotesHtml(notes) {
  if (notes.length === 0) return `<p class="muted-small center">El muro está vacío. ¡Escribe lo primero!</p>`;
  return notes
    .map((n) => {
      const rot = ((n.id.charCodeAt(0) % 7) - 3) * 0.8;
      return `<div class="wall-note ${WALL_COLORS.includes(n.color) ? n.color : "color-yellow"}" style="--rot:${rot}deg">${escapeHtml(n.text)}</div>`;
    })
    .join("");
}

function renderMuro(w) {
  $("game-status").textContent = `${w.muro.length} ${w.muro.length === 1 ? "mensaje" : "mensajes"} en el muro`;
  ensurePanel(
    `muro|${w.room.gameId}`,
    `
    <div class="room-box inner">
      <h3 class="panel-title">Escribe en el muro ✍️</h3>
      <div class="notice notice-safe">🛡️ 100% anónimo: tu nombre no se guarda en ningún lado.</div>
      <div class="join-row">
        <input type="text" class="input-field" id="input-muro-note" maxlength="140" placeholder="Un saludo, un desahogo, un piropo secreto...">
        <button type="button" class="btn btn-primary" data-action="post-muro">Publicar</button>
      </div>
    </div>
    <div class="wall-container" id="muro-notes-wall"></div>`
  );
  $("muro-notes-wall").innerHTML = wallNotesHtml(w.muro);
  $("game-host-bar").innerHTML = "";
}

async function postMuroNote() {
  const input = $("input-muro-note");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  try {
    await addDoc(collection(db, "salas", roomWatcher.code, "muro"), {
      text,
      color: WALL_COLORS[Math.floor(Math.random() * WALL_COLORS.length)],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    input.value = text;
    showToast("No se pudo publicar: " + friendlyError(err), "❌");
  }
}

// ---------- Pantalla final (confesiones / 2 mentiras) ----------
function renderEndPanel(w, title, restartAction) {
  $("game-status").textContent = "Fin de la ronda";
  ensurePanel(
    `end|${w.room.gameId}`,
    `<div class="waiting"><div class="waiting-icon">🎉</div><h3 class="panel-title">${title}</h3></div>`
  );
  $("game-host-bar").innerHTML = isHost()
    ? hostButtons([
        { action: restartAction, label: "🔁 Otra ronda", cls: "btn-purple" },
        { action: "end-game", label: "← Volver a la sala", cls: "btn-secondary" },
      ])
    : nonHostNote("Esperando al anfitrión...");
}

// ---------- Acciones del anfitrión ----------
const HOST_ACTIONS = {
  "next-question": () => {
    const r = roomWatcher.room;
    return hostUpdate({
      pos: (r.pos + 1) % r.deck.length,
      round: r.round + 1,
      phase: "vote",
      speaker: pickSpeaker(roomWatcher.players, r.speaker?.id),
    });
  },

  "reroll-speaker": () => hostUpdate({ speaker: pickSpeaker(roomWatcher.players, roomWatcher.room.speaker?.id) }),

  "conf-start-vote": () => {
    const subs = shuffleArray(roomWatcher.subs);
    if (subs.length === 0) return;
    return hostUpdate({
      phase: "vote",
      order: subs.map((s) => s.id),
      pos: 0,
      round: roomWatcher.room.round + 1,
      current: { text: subs[0].text },
      currentAuthor: null,
    });
  },

  "show-results": () => {
    const w = roomWatcher;
    if (!allDone(w.votes.length, activePlayers(w.players).length)) return;
    return hostUpdate({ phase: "results" });
  },

  "duo-reveal": () => {
    const w = roomWatcher;
    if (!allDone(w.answers.length, activePlayers(w.players).length)) return;
    return hostUpdate({ phase: "reveal" });
  },

  "conf-show-results": () => {
    const w = roomWatcher;
    if (!allDone(w.votes.length, activePlayers(w.players).length)) return;
    return hostUpdate({ phase: "results" });
  },

  "conf-reveal": () => {
    const r = roomWatcher.room;
    const sub = roomWatcher.subs.find((s) => s.id === r.order[r.pos]);
    return hostUpdate({ currentAuthor: sub?.authorName || "Anónimo" });
  },

  "conf-next": () => {
    const r = roomWatcher.room;
    const nextPos = r.pos + 1;
    if (nextPos >= r.order.length) return hostUpdate({ phase: "end" });
    const sub = roomWatcher.subs.find((s) => s.id === r.order[nextPos]);
    return hostUpdate({ phase: "vote", pos: nextPos, round: r.round + 1, current: { text: sub?.text || "" }, currentAuthor: null });
  },

  "conf-restart": () => hostUpdate({ ...gameResetFields(), phase: "write", gameId: randomId(6) }),

  "tres-start-vote": () => {
    const subs = shuffleArray(roomWatcher.subs);
    if (subs.length === 0) return;
    return hostUpdate({
      phase: "vote",
      order: subs.map((s) => s.id),
      pos: 0,
      round: roomWatcher.room.round + 1,
      current: tresCurrentFor(subs[0]),
      realIdx: null,
    });
  },

  "tres-reveal": () => {
    const r = roomWatcher.room;
    const sub = roomWatcher.subs.find((s) => s.id === r.current?.playerId);
    return hostUpdate({ phase: "results", realIdx: sub?.realIdx ?? 0 });
  },

  "tres-next": () => {
    const r = roomWatcher.room;
    const nextPos = r.pos + 1;
    if (nextPos >= r.order.length) return hostUpdate({ phase: "end" });
    const sub = roomWatcher.subs.find((s) => s.id === r.order[nextPos]);
    if (!sub) return hostUpdate({ phase: "end" });
    return hostUpdate({ phase: "vote", pos: nextPos, round: r.round + 1, current: tresCurrentFor(sub), realIdx: null });
  },

  "tres-restart": () => hostUpdate({ ...gameResetFields(), phase: "write", gameId: randomId(6) }),

  "duo-next": () => {
    const r = roomWatcher.room;
    return hostUpdate({ pos: (r.pos + 1) % r.deck.length, round: r.round + 1, phase: "answer" });
  },

  "end-game": () => hostUpdate({ state: "lobby" }),
};

$("game-host-bar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-host]");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  Promise.resolve(HOST_ACTIONS[btn.dataset.host]?.()).finally(() => { btn.disabled = false; });
});

$("game-panel").addEventListener("click", (e) => {
  const voteBtn = e.target.closest(".vote-btn[data-vote]");
  if (voteBtn) {
    handleVoteClick(voteBtn);
    return;
  }
  const duoBtn = e.target.closest(".vote-btn[data-duo]");
  if (duoBtn) {
    submitDuo(duoBtn.dataset.duo);
    return;
  }
  const actionBtn = e.target.closest("[data-action]");
  if (!actionBtn) return;
  const actions = { "submit-confession": submitConfession, "submit-tres": submitTres, "submit-duo": () => submitDuo(), "post-muro": postMuroNote, "pick-truth": pickTruth };
  actions[actionBtn.dataset.action]?.(actionBtn);
});

$("game-panel").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "input-muro-note") postMuroNote();
  if (e.target.id === "txt-duo-answer") submitDuo();
});

$("btn-game-back").addEventListener("click", () => {
  if (isHost()) {
    if (confirm("¿Terminar la dinámica y volver todos a la sala?")) HOST_ACTIONS["end-game"]();
  } else if (confirm("¿Salir de la sala?")) {
    leaveRoom();
  }
});

// ==========================================
// 6. MODO TV / PROYECTOR
// ==========================================
const TV_CATEGORIES = ["dilemas_absurdos", "quien_es_mas_probable", "amigos_fiesta", "empresas_trabajo", "citas_nivel1"];
const tv = { source: "sala_sync", deck: [], index: 0, watcher: null };

function setupTvCategoryBar() {
  const bar = $("tv-category-bar");
  TV_CATEGORIES.map(getCategory).filter(Boolean).forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip";
    btn.dataset.tvcat = cat.id;
    btn.textContent = `${cat.icono} ${cat.titulo}`;
    bar.appendChild(btn);
  });
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tvcat]");
    if (!btn) return;
    bar.querySelectorAll("[data-tvcat]").forEach((b) => b.classList.toggle("active", b === btn));
    setTvSource(btn.dataset.tvcat);
  });
}

function setTvSource(sourceId) {
  tv.source = sourceId;
  $("tv-stage-room").hidden = sourceId !== "sala_sync";
  $("tv-stage-questions").hidden = sourceId === "sala_sync";
  if (sourceId !== "sala_sync") {
    tv.deck = shuffleArray(getCategory(sourceId).preguntas);
    tv.index = 0;
    renderTvQuestion();
  }
}

function renderTvQuestion() {
  const cat = getCategory(tv.source);
  if (!cat || tv.deck.length === 0) return;
  tv.index = ((tv.index % tv.deck.length) + tv.deck.length) % tv.deck.length;
  $("tv-q-cat-badge").textContent = `${cat.icono} ${cat.titulo} · ${tv.index + 1} de ${tv.deck.length}`;
  $("tv-q-cat-badge").style.color = cat.color || "var(--cyan)";
  $("tv-giant-q-text").textContent = tv.deck[tv.index];
}

$("btn-tv-next-q").addEventListener("click", () => { tv.index++; renderTvQuestion(); });
$("btn-tv-prev-q").addEventListener("click", () => { tv.index--; renderTvQuestion(); });
$("btn-tv-shuffle").addEventListener("click", () => {
  tv.deck = shuffleArray(tv.deck);
  tv.index = 0;
  renderTvQuestion();
  showToast("Preguntas barajadas", "🔀");
});

window.addEventListener("keydown", (e) => {
  if (activeViewId() !== "view-tv" || tv.source === "sala_sync") return;
  if (e.target.matches("input, textarea")) return;
  if (e.code === "Space" || e.code === "ArrowRight") {
    e.preventDefault();
    tv.index++;
    renderTvQuestion();
  } else if (e.code === "ArrowLeft") {
    e.preventDefault();
    tv.index--;
    renderTvQuestion();
  }
});

function tvWatchRoom(code) {
  tv.watcher?.stop();
  $("tv-room-connect").hidden = true;
  $("tv-room-live").hidden = false;
  $("tv-code-cta").hidden = false;
  $("tv-room-code-display").textContent = code;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(roomShareUrl(code))}&color=070a12&bgcolor=ffffff`;
  $("tv-qr-container").innerHTML = `<img src="${qrUrl}" alt="QR para unirse a la sala ${code}">`;
  tv.watcher = createRoomWatcher(code, renderTvRoom, () => {
    showToast(`La sala ${code} no existe`, "❌");
    tvDisconnect();
  });
}

function tvDisconnect() {
  tv.watcher?.stop();
  tv.watcher = null;
  $("tv-room-connect").hidden = false;
  $("tv-room-live").hidden = true;
  $("tv-code-cta").hidden = true;
}

// En la TV nunca se muestra quién escribió o votó algo, solo lo que ya es público en los celulares
function renderTvRoom(w) {
  const room = w.room;
  if (!room) return;
  const players = activePlayers(w.players);
  // En la sala de espera se ve quién está listo; durante la dinámica, quién ya participó
  $("tv-players-list").innerHTML = room.state === "playing" && currentStep(room) ? playerStatusHtml(w) : playerChipsHtml(players, room.hostId, room.state === "playing" ? null : room);
  const status = $("tv-live-status");
  const headline = $("tv-main-headline");
  const results = $("tv-live-results");
  results.innerHTML = "";

  if (room.state !== "playing") {
    status.textContent = `${players.length} ${players.length === 1 ? "jugador conectado" : "jugadores conectados"}`;
    headline.textContent = "Escanea el QR o entra con el código para jugar";
    return;
  }

  const dyn = getDynamic(room.dynamicKey);
  status.textContent = `${dyn.icon} ${dyn.title}`;

  if (room.mode === "preguntas") {
    const question = room.deck[room.pos] || "";
    const info = classifyGroupQuestion(question, room.category);
    headline.textContent = questionText(question);
    if (info.type === "open") {
      results.innerHTML = room.speaker ? `<div class="results-headline">🎤 Responde: ${room.speaker.avatar} ${escapeHtml(room.speaker.name)}</div>` : "";
      return;
    }
    const showResults = room.phase === "results";
    if (!showResults) {
      results.innerHTML = `<div class="results-headline">🗳️ ${w.votes.length} de ${players.length} votaron</div>`;
    } else if (w.votes.length) {
      const html = info.type === "suspect" ? suspectResultsHtml(w.votes, w.players)
        : info.type === "choice" ? choiceResultsHtml(w.votes, info.options)
        : yesNoResultsHtml(w.votes, info, !!room.settings?.revealGender);
      results.innerHTML = `<div class="results-box">${html}</div>`;
    }
  } else if (room.mode === "confesiones") {
    if (room.phase === "write") {
      headline.textContent = "Escriban su confesión en el celular 🤫";
      results.innerHTML = `<div class="results-headline">✍️ ${w.subs.length} de ${players.length} enviaron</div>`;
    } else if (room.phase === "end") {
      headline.textContent = "¡Se acabaron las confesiones! 🎉";
    } else {
      headline.textContent = `"${room.current?.text || ""}"`;
      const showResults = room.phase === "results";
      results.innerHTML = showResults && w.votes.length ? `<div class="results-box">${suspectResultsHtml(w.votes, w.players)}</div>` : `<div class="results-headline">🗳️ ${w.votes.length} de ${players.length} votaron</div>`;
      if (room.currentAuthor) results.innerHTML += `<div class="author-reveal"><span class="eyebrow">💥 Era de</span><div class="speaker-name">${escapeHtml(room.currentAuthor)}</div></div>`;
    }
  } else if (room.mode === "tres") {
    if (room.phase === "write") {
      headline.textContent = "Escriban 2 mentiras y 1 verdad 🎭";
      results.innerHTML = `<div class="results-headline">✍️ ${w.subs.length} de ${players.length} listos</div>`;
    } else if (room.phase === "end") {
      headline.textContent = "¡Ya jugaron todos! 🎉";
    } else {
      const c = room.current || {};
      headline.textContent = `${c.avatar || ""} ${c.name || ""}: ¿cuál es la verdad?`;
      const revealed = room.phase === "results";
      results.innerHTML = `<div class="statement-list">${(c.statements || [])
        .map((s, i) => `<div class="statement-result ${revealed ? (i === room.realIdx ? "is-true" : "is-false") : ""}"><strong>${"ABC"[i]}:</strong> ${escapeHtml(s)}</div>`)
        .join("")}</div>`;
    }
  } else if (room.mode === "duo") {
    const question = room.deck[room.pos] || "";
    headline.textContent = questionText(question);
    const revealed = room.phase === "reveal";
    results.innerHTML = revealed
      ? duoRevealHtml(w.answers, classifyGroupQuestion(question))
      : `<div class="results-headline">🔐 ${w.answers.length} de ${players.length} respondieron</div>`;
  } else if (room.mode === "muro") {
    headline.textContent = "Muro anónimo 🧱";
    results.innerHTML = `<div class="wall-container">${wallNotesHtml(w.muro.slice(0, 24))}</div>`;
  }
}

$("btn-tv-watch-room").addEventListener("click", () => {
  const code = $("input-tv-room-code").value.trim().toUpperCase();
  if (code.length < 4) {
    showToast("Escribe el código de la sala", "⚠️");
    return;
  }
  tvWatchRoom(code);
});

$("input-tv-room-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btn-tv-watch-room").click();
});

function openTv(code) {
  switchView("view-tv");
  const chip = document.querySelector('#tv-category-bar [data-tvcat="sala_sync"]');
  document.querySelectorAll("#tv-category-bar [data-tvcat]").forEach((b) => b.classList.toggle("active", b === chip));
  setTvSource("sala_sync");
  if (code) tvWatchRoom(code);
}

$("btn-close-tv").addEventListener("click", () => {
  tvDisconnect();
  if (roomWatcher) {
    lastPanelKey = null;
    switchView(roomWatcher.room?.state === "playing" ? "view-game" : "view-lobby");
    onRoomUpdate(roomWatcher);
  } else {
    switchView("view-home");
  }
});

// ==========================================
// 7. PANEL DE ADMINISTRACIÓN (ediciones locales + exportar)
// ==========================================
let isAdminLoggedIn = false;

function openAdmin() {
  $("modal-admin").classList.add("active");
  if (isAdminLoggedIn) showAdminPanel();
}

$("btn-open-admin").addEventListener("click", openAdmin);
$("btn-close-admin").addEventListener("click", () => $("modal-admin").classList.remove("active"));

$("btn-admin-login").addEventListener("click", () => {
  const u = $("admin-user-input").value.trim();
  const p = $("admin-pass-input").value.trim();
  if (u === "admin" && p === "hielo2025") {
    isAdminLoggedIn = true;
    showAdminPanel();
  } else {
    showToast("Usuario o contraseña incorrectos", "❌");
  }
});

$("btn-admin-logout").addEventListener("click", () => {
  isAdminLoggedIn = false;
  $("admin-login-box").hidden = false;
  $("admin-panel-box").hidden = true;
});

function showAdminPanel() {
  $("admin-login-box").hidden = true;
  $("admin-panel-box").hidden = false;
  const select = $("admin-select-category");
  const previous = select.value;
  select.innerHTML = categories.map((c) => `<option value="${c.id}">${c.icono || "🧊"} ${escapeHtml(c.titulo)}</option>`).join("");
  if (previous) select.value = previous;
  renderAdminQuestionsList(select.value);
}

$("admin-select-category").addEventListener("change", (e) => renderAdminQuestionsList(e.target.value));

function renderAdminQuestionsList(catId) {
  const cat = categories.find((c) => c.id === catId);
  if (!cat) return;
  $("admin-questions-count").textContent = cat.preguntas.length;
  $("admin-questions-list").innerHTML = cat.preguntas
    .map(
      (q, idx) => `
      <div class="admin-list-item">
        <span class="admin-num">#${idx + 1}</span>
        <span class="admin-text">${escapeHtml(q)}</span>
        <button type="button" class="btn btn-secondary btn-xs" data-edit="${idx}" title="Editar">✏️</button>
        <button type="button" class="btn btn-danger btn-xs" data-del="${idx}" title="Eliminar">🗑️</button>
      </div>`
    )
    .join("");
}

$("admin-questions-list").addEventListener("click", (e) => {
  const cat = categories.find((c) => c.id === $("admin-select-category").value);
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");
  if (!cat) return;
  if (editBtn) {
    const idx = Number(editBtn.dataset.edit);
    const nuevo = prompt("Editar pregunta:", cat.preguntas[idx]);
    if (nuevo && nuevo.trim()) {
      cat.preguntas[idx] = nuevo.trim();
      saveCategories(categories);
      renderAdminQuestionsList(cat.id);
      showToast("Pregunta actualizada", "✓");
    }
  } else if (delBtn && confirm("¿Eliminar esta pregunta?")) {
    cat.preguntas.splice(Number(delBtn.dataset.del), 1);
    saveCategories(categories);
    renderAdminQuestionsList(cat.id);
    showToast("Pregunta eliminada", "🗑️");
  }
});

$("btn-admin-add-question").addEventListener("click", () => {
  const input = $("admin-input-new-question");
  const text = input.value.trim();
  const cat = categories.find((c) => c.id === $("admin-select-category").value);
  if (!text || !cat) return;
  cat.preguntas.push(text);
  saveCategories(categories);
  input.value = "";
  renderAdminQuestionsList(cat.id);
  showToast("Pregunta agregada", "✨");
});

$("btn-admin-export-code").addEventListener("click", () => {
  const code = `// questions-data.js - Banco oficial de RompeHielos (8 categorías)\nexport const DEFAULT_CATEGORIES = ${JSON.stringify(categories, null, 2)};\n`;
  const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "questions-data.js";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Descargando questions-data.js", "💾");
});

$("btn-admin-restore-defaults").addEventListener("click", () => {
  if (!confirm("¿Descartar tus cambios y volver a las preguntas oficiales?")) return;
  saveCategories(structuredClone(DEFAULT_CATEGORIES));
  showAdminPanel();
  showToast("Preguntas oficiales restauradas", "🔄");
});

// ==========================================
// 8. NAVEGACIÓN E INICIO
// ==========================================
function openLobby() {
  switchView(roomWatcher?.room?.state === "playing" ? "view-game" : "view-lobby");
  if (roomWatcher) {
    lastPanelKey = null;
    onRoomUpdate(roomWatcher);
  }
}

function onActivate(el, handler) {
  el.addEventListener("click", handler);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  });
}

onActivate($("card-start-solo"), openSoloCategories);
onActivate($("card-start-multi"), openLobby);
onActivate($("card-start-tv"), () => openTv(roomWatcher?.code));
$("btn-open-tv-mode").addEventListener("click", () => openTv(roomWatcher?.code));
$("btn-brand-home").addEventListener("click", () => switchView("view-home"));
$("btn-back-lobby").addEventListener("click", () => switchView("view-home"));
$("footer-btn-solo").addEventListener("click", openSoloCategories);
$("footer-btn-multi").addEventListener("click", openLobby);
$("footer-btn-tv").addEventListener("click", () => openTv(roomWatcher?.code));

$("btn-fullscreen").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
});

// Invitación por enlace (?room=CODIGO) o volver a la sala tras recargar la página
async function restoreRoomFromUrlOrSession() {
  const invited = new URLSearchParams(window.location.search).get("room");
  if (invited) {
    const code = invited.trim().toUpperCase();
    switchView("view-lobby");
    $("invited-room-banner").hidden = false;
    $("lbl-invited-room-code").textContent = code;
    $("input-room-code").value = code;
    $("join-code-container").hidden = false;
    $("lobby-main-actions").hidden = true;
    setTimeout(() => $("input-player-name").focus(), 300);
    return;
  }
  const savedRoom = load("session", "rh_room");
  if (savedRoom && profile.name) {
    const ok = await joinRoom(savedRoom, { silent: true });
    if (!ok) unstore("session", "rh_room");
  }
}

initParticles();
setupProfilePickers();
renderDynamicsGrid();
renderHostStep();
renderSoloCategories();
setupTvCategoryBar();
restoreRoomFromUrlOrSession();
