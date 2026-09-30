// app.js - Lógica principal de RompeHielos
import { firebaseConfig } from "./firebase-config.js";
import { DEFAULT_CATEGORIES } from "./questions-data.js";
import { classifyGroupQuestion, isChoiceQuestion, questionText, questionId, EXPERIENCE_OPTIONS, FORMAT_LABELS } from "./question-types.js";
import { NIVELES_18, TEMAS_18 } from "./questions-18.js";
import { PERSONA_VARIANTS, CARTELES, PROFESIONES } from "./persona-data.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
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

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ==========================================
// 1. BANCO DE PREGUNTAS (oficial + cambios del admin en la nube)
// ==========================================
// El banco oficial vive en questions-data.js. Lo que el admin cambia desde la web se guarda en
// Firestore (configuracion/banco) como una lista de cambios: borradas, editadas y agregadas.
// Así, cuando se suman preguntas oficiales nuevas al código, igual aparecen para todos.
const ADMIN_EMAIL = "kurorox2@gmail.com";
const BANK_DOC = doc(db, "configuracion", "banco");
const EMPTY_PATCH = () => ({ deleted: [], edits: {}, added: {} });

let bankPatch = EMPTY_PATCH();
let categories = buildCategories(bankPatch);

["rompehielos_custom_categories_v2", "rompehielos_categories_v3"].forEach((oldKey) => {
  try { localStorage.removeItem(oldKey); } catch {}
});

function buildCategories(patch) {
  const deleted = new Set(patch.deleted || []);
  return DEFAULT_CATEGORIES.map((cat) => {
    const base = cat.preguntas
      .filter((q) => !deleted.has(questionId(cat.id, q)))
      .map((q) => patch.edits?.[questionId(cat.id, q)] || q);
    const added = (patch.added?.[cat.id] || []).filter((q) => !deleted.has(q.id));
    return { ...cat, preguntas: [...base, ...added] };
  });
}

function subscribeToBank() {
  onSnapshot(
    BANK_DOC,
    (snap) => {
      bankPatch = snap.exists() ? { ...EMPTY_PATCH(), ...snap.data() } : EMPTY_PATCH();
      categories = buildCategories(bankPatch);
      renderSoloCategories();
      if (isAdminUser()) renderAdminQuestionsList();
      if (activeViewId() === "view-setup") renderHostStep();
    },
    (err) => console.warn("No se pudo leer el banco de preguntas en la nube:", err)
  );
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
  $("solo-question-text").textContent = questionText(question);
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
  { key: "secretos_intimos", mode: "preguntas", category: "secretos_intimos", icon: "🔥", title: "Secretos íntimos (+18)", desc: "Por niveles y temas: lo has hecho, te gustaría o no. Todo en secreto.", gender: true },
  { key: "dilemas_absurdos", mode: "preguntas", category: "dilemas_absurdos", icon: "🤯", title: "Dilemas absurdos", desc: "Votan A o B, Sí o No, o a alguien le toca responder.", gender: true },
  { key: "amigos_fiesta", mode: "preguntas", category: "amigos_fiesta", icon: "🍻", title: "Amigos y carrete", desc: "Anécdotas, votaciones y confesiones para el grupo.", gender: true },
  { key: "empresas_trabajo", mode: "preguntas", category: "empresas_trabajo", icon: "💼", title: "Trabajo en equipo", desc: "Para conocer al equipo: rondas de respuesta y votaciones.", gender: true },
  { key: "reunion_hombres", mode: "preguntas", category: "reunion_hombres", icon: "🍺", title: "Junta de hombres", desc: "Solo para hombres: qué miran primero, quién es el más mandado y más.", audience: "hombre" },
  { key: "reunion_mujeres", mode: "preguntas", category: "reunion_mujeres", icon: "🥂", title: "Junta de mujeres", desc: "Solo para mujeres: qué miran primero, quién stalkea mejor y más.", audience: "mujer" },
  { key: "persona", mode: "persona", icon: "🎁", title: "Para cada persona", desc: "Carteles, profesiones, regalos y agradecimientos para cada uno, en anónimo." },
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
    code, room: null, players: [], votes: [], subs: [], answers: [], muro: [], guesses: [], gifts: [],
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
      w.gifts = [];
      w.gameKey = gameKey;
      if (playing && (r.mode === "confesiones" || r.mode === "tres")) listen(`s_${r.gameId}`, "subs", w.gameUnsubs);
      if (playing && r.mode === "persona") listen(`a_${r.gameId}`, "gifts", w.gameUnsubs);
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
      w.guesses = [];
      w.answers = [];
      w.roundKey = roundKey;
      if (playing && ["preguntas", "confesiones", "tres"].includes(r.mode)) listen(`v_${r.gameId}_${r.round}`, "votes", w.roundUnsubs);
      if (playing && r.mode === "preguntas" && r.settings?.guess) listen(`g_${r.gameId}_${r.round}`, "guesses", w.roundUnsubs);
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

// Géneros cuyo desglose se puede mostrar sin delatar a nadie (3 o más personas)
const MIN_GENDER_GROUP = 3;
const GENDER_GROUPS = [
  { key: "hombre", plural: "hombres", label: "👨 Hombres", color: "var(--cyan)" },
  { key: "mujer", plural: "mujeres", label: "👩 Mujeres", color: "var(--pink)" },
  { key: "otro", plural: "otros", label: "🌈 Otros", color: "var(--purple)" },
];

function genderPreviewText(players) {
  const counts = genderCounts(players);
  const shown = GENDER_GROUPS.filter((g) => counts[g.key] >= MIN_GENDER_GROUP).map((g) => g.plural);
  const summary = GENDER_GROUPS.filter((g) => counts[g.key] > 0).map((g) => `${counts[g.key]} ${g.plural}`).join(", ");
  if (shown.length === 0) return `Hay ${summary || "0 jugadores"}: ningún género llega a 3 personas, así que solo se verá el total.`;
  return `Hay ${summary}: se mostrará el desglose de ${shown.join(" y ")}. Los grupos con menos de 3 se ocultan para no delatar a nadie.`;
}

// Tipos de pregunta que el anfitrión puede activar o desactivar en el paso 2
const QUESTION_TYPES = [
  { type: "choice", icon: "🅰️", title: "Elegir una opción", desc: "¿Preferirías A o B? y preguntas con alternativas" },
  { type: "yesno", icon: "🙋", title: "Sí o No", desc: "Cada uno vota en secreto" },
  { type: "suspect", icon: "👉", title: "Votar por alguien", desc: "¿Quién del grupo...?" },
  { type: "open", icon: "🎤", title: "Responder en voz alta", desc: "Se sortea a alguien para que responda", duoTitle: "Respuesta escrita", duoDesc: "Cada uno escribe lo que quiera" },
];

let hostStep = 1;
const setup = {
  types: new Set(QUESTION_TYPES.map((t) => t.type)),
  levels: new Set([1, 2]),
  temas: new Set(TEMAS_18.map((t) => t.tema)),
  variant: PERSONA_VARIANTS[0].key,
  guess: false,
  revealGender: true,
  revealAuthor: true,
};

function isSpicy(dyn) {
  return dyn.category === "secretos_intimos";
}

// Preguntas disponibles para una dinámica (null si la dinámica no usa el banco de preguntas)
function dynamicPool(dyn) {
  if (dyn.mode === "preguntas") return { questions: getCategory(dyn.category).preguntas, category: dyn.category };
  if (dyn.mode === "duo") return { questions: [...getCategory("citas_nivel1").preguntas, ...getCategory("dilemas_absurdos").preguntas], category: "" };
  return null;
}

function setupQuestions(dyn) {
  const pool = dynamicPool(dyn);
  if (!pool) return [];
  if (isSpicy(dyn)) return pool.questions.filter((q) => setup.levels.has(q.lvl) && setup.temas.has(q.tema));
  return pool.questions.filter((q) => setup.types.has(classifyGroupQuestion(q, pool.category).type));
}

function toggleRowHtml({ attr, value, on, icon, title, desc, count }) {
  return `<button type="button" class="type-toggle ${on ? "selected" : ""}" data-${attr}="${escapeAttr(value)}" aria-pressed="${on}">
    <span class="type-check">${on ? "✓" : ""}</span>
    <span class="type-icon">${icon}</span>
    <span class="type-text"><strong>${title}</strong>${desc ? `<small>${desc}</small>` : ""}</span>
    ${count !== undefined ? `<span class="type-count">${count}</span>` : ""}
  </button>`;
}

function step2Section(title, rows) {
  return rows ? `<span class="field-label">${title}</span><div class="type-toggle-list">${rows}</div>` : "";
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
  const pool = dynamicPool(dyn);
  const players = roomWatcher ? activePlayers(roomWatcher.players) : [];
  let html = "";

  if (dyn.mode === "persona") {
    html += step2Section("¿Qué van a dedicarle a cada persona?", PERSONA_VARIANTS.map((v) =>
      toggleRowHtml({ attr: "variant", value: v.key, on: setup.variant === v.key, icon: v.icon, title: v.title, desc: v.desc })
    ).join(""));
  } else if (pool && isSpicy(dyn)) {
    const byLevel = (lvl) => pool.questions.filter((q) => q.lvl === lvl && setup.temas.has(q.tema)).length;
    const byTema = (tema) => pool.questions.filter((q) => q.tema === tema && setup.levels.has(q.lvl)).length;
    html += step2Section("Niveles de intensidad (marca los que quieran)", NIVELES_18.map((n) =>
      toggleRowHtml({ attr: "lvl", value: n.lvl, on: setup.levels.has(n.lvl), icon: n.icon, title: `${n.lvl} · ${n.title}`, desc: n.desc, count: byLevel(n.lvl) })
    ).join(""));
    html += step2Section("Temas", TEMAS_18.map((t) =>
      toggleRowHtml({ attr: "tema", value: t.tema, on: setup.temas.has(t.tema), icon: t.icon, title: t.title, count: byTema(t.tema) })
    ).join(""));
  } else if (pool) {
    const counts = {};
    pool.questions.forEach((q) => {
      const t = classifyGroupQuestion(q, pool.category).type;
      counts[t] = (counts[t] || 0) + 1;
    });
    html += step2Section("Tipos de pregunta (marca los que quieran)", QUESTION_TYPES.filter((t) => counts[t.type] > 0).map((t) =>
      toggleRowHtml({
        attr: "type", value: t.type, on: setup.types.has(t.type), icon: t.icon, count: counts[t.type],
        title: dyn.mode === "duo" && t.duoTitle ? t.duoTitle : t.title,
        desc: dyn.mode === "duo" && t.duoDesc ? t.duoDesc : t.desc,
      })
    ).join(""));
  }

  // Opciones extra, con el mismo estilo de casilla
  const options = [];
  if (dyn.mode === "preguntas") {
    options.push(toggleRowHtml({ attr: "opt", value: "guess", on: setup.guess, icon: "🎯", title: "Adivina cuántos", desc: "Antes de ver los resultados, cada uno apuesta cuántos respondieron que sí (o qué opción ganó). Suma puntos para el ranking." }));
  }
  if (dyn.gender) {
    options.push(toggleRowHtml({ attr: "opt", value: "revealGender", on: setup.revealGender, icon: "🚻", title: "Resultados por género", desc: setup.revealGender ? genderPreviewText(players) : "Solo se verá el total del grupo." }));
  }
  if (dyn.author) {
    options.push(toggleRowHtml({ attr: "opt", value: "revealAuthor", on: setup.revealAuthor, icon: "👀", title: "Revelar quién escribió cada confesión", desc: "Si lo desactivas, las confesiones son 100% anónimas." }));
  }
  html += step2Section("Opciones", options.join(""));
  $("step2-content").innerHTML = html;
  updateDynamicOptions();
}

function updateDynamicOptions() {
  const dyn = getDynamic(selectedDynamicKey);
  const usesQuestions = !!dynamicPool(dyn);
  const players = roomWatcher ? activePlayers(roomWatcher.players) : [];

  let warning = "";
  if (dyn.audience) {
    const outsiders = players.filter((p) => p.gender !== dyn.audience).length;
    if (outsiders > 0) {
      const audienceLabel = dyn.audience === "hombre" ? "hombres" : "mujeres";
      warning = `Esta dinámica está pensada para una junta solo de ${audienceLabel}, y en la sala hay ${outsiders} ${outsiders === 1 ? "persona" : "personas"} de otro género.`;
    }
  }
  if (isSpicy(dyn) && (setup.levels.has(4) || setup.levels.has(5))) {
    warning = "Los niveles 4 y 5 son muy explícitos: no se recomiendan en contextos de trabajo.";
  }
  $("single-gender-warning-box").hidden = !warning;
  $("lbl-single-gender-desc").textContent = warning;

  // El botón de empezar aparece solo si todos están listos y hay preguntas para jugar
  const ready = roomWatcher?.room ? lobbyReadiness(roomWatcher) : { allReady: false, readyCount: 0, active: [] };
  const questionCount = usesQuestions ? setupQuestions(dyn).length : 1;
  const canStart = ready.allReady && questionCount > 0;
  $("btn-start-dynamic").hidden = !canStart;
  $("btn-start-dynamic").textContent = usesQuestions ? `🚀 Empezar para todos (${questionCount} preguntas)` : "🚀 Empezar para todos";
  $("start-wait-msg").hidden = canStart;
  $("start-wait-msg").textContent =
    questionCount === 0 ? (isSpicy(dyn) ? "☝️ Marca al menos un nivel y un tema." : "☝️ Marca al menos un tipo de pregunta.")
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
  setup.types = new Set(QUESTION_TYPES.map((t) => t.type));
  hostStep = 2;
  renderHostStep();
});

$("btn-host-prev-step").addEventListener("click", () => {
  hostStep = 1;
  renderHostStep();
});

function toggleInSet(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

$("step2-content").addEventListener("click", (e) => {
  const btn = e.target.closest(".type-toggle");
  if (!btn) return;
  const d = btn.dataset;
  if (d.type) toggleInSet(setup.types, d.type);
  else if (d.lvl) toggleInSet(setup.levels, Number(d.lvl));
  else if (d.tema) toggleInSet(setup.temas, d.tema);
  else if (d.variant) setup.variant = d.variant;
  else if (d.opt) setup[d.opt] = !setup[d.opt];
  renderHostStep();
});

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
    variant: null, participants: [], hands: {}, shown: 0, hidden: [], lastGuess: null,
  };
}

function filteredDeck(dyn) {
  return shuffleArray(setupQuestions(dyn));
}

// Reparte a cada jugador N-1 carteles distintos. Si alcanzan, ningún cartel se repite en toda la ronda.
function dealCartelHands(participants) {
  const perHand = participants.length - 1;
  let pool = shuffleArray(CARTELES);
  const hands = {};
  participants.forEach((p) => {
    if (pool.length < perHand) pool = shuffleArray(CARTELES);
    hands[p.id] = pool.splice(0, perHand);
  });
  return hands;
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
      revealAuthor: setup.revealAuthor,
      revealGender: setup.revealGender,
      guess: dyn.mode === "preguntas" && setup.guess,
      types: [...setup.types],
      levels: [...setup.levels],
      temas: [...setup.temas],
    },
    scores: {},
  };
  if (dynamicPool(dyn) && setupQuestions(dyn).length === 0) {
    showToast("No hay preguntas con esa selección", "☝️");
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
  } else if (dyn.mode === "persona") {
    Object.assign(fields, personaStartFields(w));
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
    experience: "🔥 ¿Lo has hecho?",
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

// Grupos de género con suficientes votos para mostrarse sin delatar a nadie
function visibleGenderGroups(votes) {
  return GENDER_GROUPS.map((g) => ({ ...g, votes: votes.filter((v) => v.gender === g.key) })).filter((g) => g.votes.length >= MIN_GENDER_GROUP);
}

function hiddenGenderNote(votes, revealGender) {
  if (!revealGender) return "";
  const withGender = votes.filter((v) => v.gender).length;
  return withGender > 0 && visibleGenderGroups(votes).length === 0
    ? `<p class="muted-small center">🛡️ Desglose por género oculto: ningún género tiene 3 o más personas.</p>`
    : "";
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
    const rows = visibleGenderGroups(votes)
      .map((g) => {
        const groupYes = g.votes.filter((v) => v.value === "yes").length;
        const pct = Math.round((groupYes / g.votes.length) * 100);
        return `
          <div class="result-row">
            <div class="result-row-head"><span>${g.label}</span><strong>${groupYes} de ${g.votes.length} dijeron sí</strong></div>
            <div class="result-track"><div class="result-fill" style="width:${pct}%; background:${g.color}"></div></div>
          </div>`;
      })
      .join("");
    if (rows) html += `<div class="results-bars-list">${rows}</div>`;
    html += hiddenGenderNote(votes, revealGender);
  }

  let intrigue;
  if (yes === 0) intrigue = "Todos dijeron que no... ¿santos o nadie se atrevió? 😇";
  else if (yes === votes.length) intrigue = "¡El 100% dijo que sí! Nadie aquí es inocente 😂";
  else if (yes === 1) intrigue = "Solo 1 persona lo admitió. ¿Quién será? 👀";
  else intrigue = `${yes} de ${votes.length} personas dijeron que sí 🤫`;
  return html + `<div class="results-headline subtle">${intrigue}</div>`;
}

const EXPERIENCE_COLORS = ["var(--emerald)", "var(--amber)", "var(--coral)"];

function experienceResultsHtml(votes, revealGender) {
  const counts = [0, 1, 2].map((i) => votes.filter((v) => v.value === i).length);
  let html = `<div class="results-bars-list">${EXPERIENCE_OPTIONS.map((label, i) =>
    barRow(label, counts[i], votes.length, { color: EXPERIENCE_COLORS[i], highlight: false })
  ).join("")}</div>`;

  if (revealGender) {
    const rows = visibleGenderGroups(votes)
      .map((g) => {
        const c = [0, 1, 2].map((i) => g.votes.filter((v) => v.value === i).length);
        const segments = c.map((n, i) => `<div style="width:${(n / g.votes.length) * 100}%; background:${EXPERIENCE_COLORS[i]}"></div>`).join("");
        return `
          <div class="result-row">
            <div class="result-row-head"><span>${g.label}</span><strong>✅ ${c[0]} · 😏 ${c[1]} · 🙅 ${c[2]}</strong></div>
            <div class="result-track stacked">${segments}</div>
          </div>`;
      })
      .join("");
    if (rows) html += `<div class="results-bars-list">${rows}</div>`;
    html += hiddenGenderNote(votes, revealGender);
  }

  const [done, want] = counts;
  let intrigue;
  if (done === votes.length) intrigue = "¡Todos lo han hecho! 🔥";
  else if (done === 0 && want > 0) intrigue = `Nadie lo ha hecho... pero ${want} ${want === 1 ? "tiene" : "tienen"} ganas 😏`;
  else if (done === 0) intrigue = "Nadie lo ha hecho ni le interesa 😇";
  else if (want > 0) intrigue = `${done} ${done === 1 ? "lo ha hecho" : "lo han hecho"} y ${want} ${want === 1 ? "tiene" : "tienen"} ganas 😏`;
  else intrigue = `${done} de ${votes.length} ${done === 1 ? "lo ha hecho" : "lo han hecho"} 🤫`;
  return html + `<div class="results-headline subtle">${intrigue}</div>`;
}

// ---------- Adivina cuántos ----------
// Se apuesta siempre por lo más jugoso: cuántos dijeron "sí" o "lo he hecho", qué opción ganó o quién fue el más votado.
function guessSpec(info, players) {
  const numbers = () => Array.from({ length: players.length + 1 }, (_, n) => ({ value: n, label: String(n), html: String(n) }));
  const topSet = (counts) => {
    const max = Math.max(0, ...counts.values());
    return new Set([...counts.entries()].filter(([, c]) => c === max && max > 0).map(([k]) => k));
  };
  if (info.type === "yesno") {
    return {
      prompt: `¿Cuántos crees que respondieron "${info.labels[0]}"?`, numeric: true, options: numbers(),
      answer: (votes) => votes.filter((v) => v.value === "yes").length,
    };
  }
  if (info.type === "experience") {
    return {
      prompt: `¿Cuántos crees que respondieron "${EXPERIENCE_OPTIONS[0]}"?`, numeric: true, options: numbers(),
      answer: (votes) => votes.filter((v) => v.value === 0).length,
    };
  }
  if (info.type === "choice") {
    return {
      prompt: "¿Qué opción crees que ganó?",
      options: info.options.map((opt, i) => ({ value: i, label: opt, html: `<span class="opt-letter">${optionLetter(i)}</span> ${escapeHtml(opt)}` })),
      answer: (votes) => topSet(new Map(info.options.map((_, i) => [i, votes.filter((v) => v.value === i).length]))),
      describe: (set) => (set.size ? `Ganó: ${[...set].map((i) => info.options[i]).join(" y ")}` : "Nadie votó"),
    };
  }
  if (info.type === "suspect") {
    return {
      prompt: "¿Quién crees que fue el más votado?",
      options: players.map((p) => ({ value: p.id, label: p.name, html: `<span class="vote-avatar">${p.avatar || "👤"}</span> ${escapeHtml(p.name)}` })),
      answer: (votes) => topSet(votes.reduce((m, v) => m.set(v.value, (m.get(v.value) || 0) + 1), new Map())),
      describe: (set) => `Más votado: ${[...set].map((id) => players.find((p) => p.id === id)?.name || "?").join(" y ")}`,
    };
  }
  return null;
}

function isCorrectGuess(spec, answer, value) {
  return spec.numeric ? value === answer : answer.has(value);
}

function guessKey(room) {
  return `rh_g_${roomWatcher.code}_${room.gameId}_${room.round}`;
}

async function castGuess(value, label) {
  const w = roomWatcher;
  const room = w?.room;
  if (!room || load("session", guessKey(room))) return;
  store("session", guessKey(room), JSON.stringify({ value, label }));
  renderGame(w);
  try {
    await setDoc(doc(db, "salas", w.code, `g_${room.gameId}_${room.round}`, profile.playerId), { value, name: profile.name });
    markStepDone();
  } catch (err) {
    unstore("session", guessKey(room));
    renderGame(w);
    showToast("No se pudo guardar tu apuesta: " + friendlyError(err), "❌");
  }
}

function rankingHtml(scores) {
  const sorted = Object.values(scores || {}).filter((s) => s.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5);
  if (!sorted.length) return "";
  return `<div class="ranking">🏆 <strong>Mejor adivino:</strong> ${sorted.map((s, i) => `${i === 0 ? "👑 " : ""}${escapeHtml(s.name)} (${s.pts})`).join(" · ")}</div>`;
}

function guessOutcomeHtml(room) {
  const g = room.lastGuess;
  if (!g || g.round !== room.round) return "";
  const who = g.winners.length ? `Acertaron: ${g.winners.map(escapeHtml).join(", ")} 🎯` : "Nadie acertó 😅";
  return `<div class="guess-outcome"><strong>${escapeHtml(g.answer)}</strong><span>${who}</span></div>${rankingHtml(room.scores)}`;
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

  const renderers = { preguntas: renderPreguntas, confesiones: renderConfesiones, tres: renderTres, duo: renderDuo, muro: renderMuro, persona: renderPersona };
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
    if (info.type === "open" || room.phase === "results") return null;
    if (room.phase === "guess") return { key: `${g}:${room.round}:guess`, verb: "apostó" };
    return { key: `${g}:${room.round}`, verb: "votó" };
  }
  if (room.mode === "persona") {
    return room.phase === "write" ? { key: `${g}:write`, verb: "finalizó" } : null;
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
// Fases: vote -> (guess, si está activo "Adivina cuántos") -> results. El anfitrión avanza cada fase.
function renderPreguntas(w) {
  const room = w.room;
  const question = room.deck[room.pos] || "";
  const info = classifyGroupQuestion(question, room.category);
  const cat = getCategory(room.category);
  const players = activePlayers(w.players);
  const revealGender = !!room.settings?.revealGender;
  const nivel = typeof question === "object" && question.lvl ? NIVELES_18.find((n) => n.lvl === question.lvl) : null;

  $("game-status").textContent = `${cat?.titulo || ""} · Pregunta ${room.pos + 1} de ${room.deck.length}${nivel ? ` · ${nivel.icon}` : ""}`;

  let privacy = "";
  if (info.type === "yesno" || info.type === "experience") privacy = revealGender ? "🛡️ Voto anónimo. Se ve el total y el desglose de los géneros con 3 o más personas." : "🛡️ Voto anónimo. Solo se muestra el total del grupo.";
  else if (info.type === "suspect") privacy = "🛡️ Voto secreto: nadie ve por quién votaste.";
  else if (info.type === "choice") privacy = "🛡️ Voto secreto: solo se ven los porcentajes.";

  ensurePanel(
    `preguntas|${room.gameId}|${room.round}|${room.pos}|${room.phase}`,
    `
    <div class="question-hero">
      <span class="type-badge">${questionTypeLabel(info)}</span>
      <p class="question-hero-text">${escapeHtml(questionText(question))}</p>
    </div>
    ${privacy && room.phase === "vote" ? `<div class="notice notice-safe">${privacy}</div>` : ""}
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

  const votes = w.votes;
  const everyoneVoted = allDone(votes.length, players.length);
  const guessOn = !!room.settings?.guess;
  const spec = guessOn ? guessSpec(info, players) : null;

  if (room.phase === "vote") {
    const myVote = getMyVote(room);
    if (myVote) {
      $("g-vote-area").innerHTML = votedHtml(myVote);
    } else {
      let buttons;
      if (info.type === "yesno") {
        buttons = [
          { value: "yes", label: info.labels[0], html: info.labels[0], cls: "big yes" },
          { value: "no", label: info.labels[1], html: info.labels[1], cls: "big no" },
        ];
      } else if (info.type === "experience") {
        buttons = EXPERIENCE_OPTIONS.map((label, i) => ({ value: i, label, html: label, cls: `option exp-${i}` }));
      } else if (info.type === "choice") {
        const cls = info.options.length > 2 ? "option compact" : "option";
        buttons = info.options.map((opt, i) => ({ value: i, label: opt, html: `<span class="opt-letter">${optionLetter(i)}</span> ${escapeHtml(opt)}`, cls }));
      } else {
        buttons = players.map((p) => ({ value: p.id, label: p.name, html: `<span class="vote-avatar">${p.avatar || "👤"}</span> ${escapeHtml(p.name)}` }));
      }
      $("g-vote-area").innerHTML = voteButtonsHtml(buttons);
    }
    $("g-progress").textContent = `🗳️ ${votes.length} de ${players.length} votaron`;
    $("g-results").innerHTML = "";
    const nextStep = guessOn && spec
      ? { action: "to-guess", label: "🎯 ¡A adivinar!", cls: "btn-purple" }
      : { action: "show-results", label: "📊 Mostrar resultados", cls: "btn-purple" };
    $("game-host-bar").innerHTML = host
      ? hostButtons([
          everyoneVoted ? nextStep : { ...nextStep, label: `⏳ Esperando a todos (${votes.length} de ${players.length})`, disabled: true },
          SKIP_BUTTON,
        ])
      : nonHostNote("Cuando todos voten, el anfitrión sigue.");
    return;
  }

  if (room.phase === "guess" && spec) {
    let myGuess = null;
    try { myGuess = JSON.parse(load("session", guessKey(room)) || "null"); } catch {}
    $("g-vote-area").innerHTML = myGuess
      ? `<div class="voted-status">🎯 Tu apuesta: <strong>${escapeHtml(myGuess.label)}</strong></div>`
      : `<p class="guess-prompt">🎯 ${escapeHtml(spec.prompt)}</p>
         <div class="voting-options-grid ${spec.numeric ? "numbers" : ""}">${spec.options
           .map((o) => `<button type="button" class="vote-btn ${spec.numeric ? "number" : "option compact"}" data-guess="${escapeAttr(JSON.stringify(o.value))}" data-label="${escapeAttr(o.label)}">${o.html}</button>`)
           .join("")}</div>`;
    const guesses = w.guesses.length;
    $("g-progress").textContent = `🎯 ${guesses} de ${players.length} apostaron`;
    $("g-results").innerHTML = "";
    const allGuessed = allDone(guesses, players.length);
    $("game-host-bar").innerHTML = host
      ? hostButtons([
          allGuessed
            ? { action: "show-results", label: "📊 Mostrar resultados", cls: "btn-purple" }
            : { action: "show-results", label: `⏳ Esperando apuestas (${guesses} de ${players.length})`, cls: "btn-purple", disabled: true },
          SKIP_BUTTON,
        ])
      : nonHostNote("Cuando todos apuesten, el anfitrión muestra los resultados.");
    return;
  }

  // Resultados
  $("g-vote-area").innerHTML = "";
  $("g-progress").textContent = "";
  if (votes.length > 0) {
    let html;
    if (info.type === "suspect") html = suspectResultsHtml(votes, w.players);
    else if (info.type === "choice") html = choiceResultsHtml(votes, info.options);
    else if (info.type === "experience") html = experienceResultsHtml(votes, revealGender);
    else html = yesNoResultsHtml(votes, info, revealGender);
    $("g-results").innerHTML = `${guessOn ? guessOutcomeHtml(room) : ""}<div class="results-box">${html}</div>`;
  } else {
    $("g-results").innerHTML = `<p class="muted-small center">Nadie votó en esta ronda.</p>`;
  }
  $("game-host-bar").innerHTML = host
    ? hostButtons([{ action: "next-question", label: "Siguiente pregunta ➔" }])
    : nonHostNote("Esperando la siguiente pregunta...");
}

// Los resultados solo se muestran cuando votó cada jugador conectado
function allDone(doneCount, expectedCount) {
  return expectedCount > 0 && doneCount >= expectedCount;
}

// Saltar pasa a la siguiente pregunta sin mostrar nada de la actual (preguntas incómodas o aburridas)
const SKIP_BUTTON = { action: "next-question", label: "⏭️ Saltar", cls: "btn-secondary btn-skip" };

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
    if ((info.type === "yesno" || info.type === "experience") && room.settings?.revealGender) extra.gender = profile.gender;
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
    ? hostButtons([
        revealOrNext(revealed, everyoneAnswered, answers.length, players.length, "duo-reveal", "👀 Revelar respuestas", "duo-next", "Siguiente pregunta ➔"),
        ...(revealed ? [] : [{ ...SKIP_BUTTON, action: "duo-next" }]),
      ])
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

// ---------- Para cada persona (carteles, profesión, aprender, regalo, agradecimientos) ----------
// Paso 1: cada jugador completa algo para cada uno de los demás y presiona Finalizar.
// Paso 2: se revisa persona por persona. Lo que se escribe se guarda sin nombre de quién lo dio.
function personaVariant(room) {
  return PERSONA_VARIANTS.find((v) => v.key === room.variant) || PERSONA_VARIANTS[0];
}

function personaStartFields(w, variant = setup.variant) {
  const participants = activePlayers(w.players).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar || "👤" }));
  return {
    phase: "write",
    variant,
    participants,
    hands: variant === "carteles" ? dealCartelHands(participants) : {},
  };
}

function personaDraftKey(room) {
  return `rh_p_${roomWatcher.code}_${room.gameId}`;
}

function loadPersonaDraft(room) {
  try { return JSON.parse(load("session", personaDraftKey(room)) || "{}"); } catch { return {}; }
}

function savePersonaDraft(room, draft) {
  store("session", personaDraftKey(room), JSON.stringify(draft));
}

function personaFormHtml(room, v, others) {
  const draft = loadPersonaDraft(room);
  const blocks = others
    .map((p) => {
      const d = draft[p.id] || {};
      let body;
      if (v.key === "carteles") {
        body = `<div class="cartel-grid" data-pid="${escapeAttr(p.id)}"></div>`;
      } else {
        const a = v.fieldA.long
          ? `<textarea class="input-field" rows="2" maxlength="200" data-pid="${escapeAttr(p.id)}" data-field="a" placeholder="${escapeAttr(v.fieldA.placeholder)}">${escapeHtml(d.a || "")}</textarea>`
          : `<input type="text" class="input-field" maxlength="80" data-pid="${escapeAttr(p.id)}" data-field="a" placeholder="${escapeAttr(v.fieldA.placeholder)}" value="${escapeAttr(d.a || "")}">`;
        const suggest = v.suggest ? `<button type="button" class="btn btn-secondary btn-sm" data-action="suggest-prof" data-pid="${escapeAttr(p.id)}">🎲 Sugerir</button>` : "";
        const b = v.fieldB
          ? `<label class="persona-field-label">${v.fieldB.label}</label>
             <input type="text" class="input-field" maxlength="160" data-pid="${escapeAttr(p.id)}" data-field="b" placeholder="${escapeAttr(v.fieldB.placeholder)}" value="${escapeAttr(d.b || "")}">`
          : "";
        body = `<label class="persona-field-label">${v.fieldA.label}</label>
          <div class="${suggest ? "join-row tight" : ""}">${a}${suggest}</div>${b}`;
      }
      return `<div class="persona-block"><div class="persona-name">${p.avatar} ${escapeHtml(p.name)}</div>${body}</div>`;
    })
    .join("");
  return `
    <div class="room-box inner">
      <h3 class="panel-title">${v.icon} ${v.title}</h3>
      <p class="panel-desc">${v.instructions}</p>
      <div class="notice notice-safe">🛡️ Anónimo: nadie sabrá qué le diste a quién.</div>
      ${blocks}
      <button type="button" class="btn btn-purple btn-block" data-action="persona-finish">✅ Finalizar</button>
      <p class="muted-small center">Puedes cambiar todo hasta que presiones Finalizar.</p>
    </div>`;
}

// Cada cartel solo se puede usar una vez: los ya asignados a otra persona aparecen desactivados
function refreshCartelChips(room) {
  const hand = room.hands?.[profile.playerId] || [];
  const draft = loadPersonaDraft(room);
  const used = new Map(Object.entries(draft).map(([pid, d]) => [d.card, pid]));
  document.querySelectorAll(".cartel-grid[data-pid]").forEach((grid) => {
    const pid = grid.dataset.pid;
    grid.innerHTML = hand
      .map((card) => {
        const owner = used.get(card);
        const selected = owner === pid;
        const taken = owner && !selected;
        return `<button type="button" class="cartel-chip ${selected ? "selected" : ""}" data-cartel="${escapeAttr(card)}" data-pid="${escapeAttr(pid)}" ${taken ? "disabled" : ""}>${escapeHtml(card)}</button>`;
      })
      .join("");
  });
}

function personaDoneCount(w) {
  const room = w.room;
  const activeIds = new Set(activePlayers(w.players).map((p) => p.id));
  const expected = (room.participants || []).filter((p) => activeIds.has(p.id));
  const done = expected.filter((p) => w.players.find((x) => x.id === p.id)?.doneFor === `${room.gameId}:write`);
  return { done: done.length, expected: expected.length };
}

function giftHtml(v, item, { hidden, hostCanHide }) {
  if (hidden) return `<div class="gift-card is-hidden">🙈 Mensaje oculto por el anfitrión</div>`;
  let body;
  if (v.key === "profesion") body = `<strong>💼 ${escapeHtml(item.text)}</strong>${item.extra ? `<p>${escapeHtml(item.extra)}</p>` : ""}`;
  else if (v.key === "regalo") body = `<strong>🎁 ${escapeHtml(item.text)}</strong>${item.extra ? `<p>${escapeHtml(item.extra)}</p>` : ""}`;
  else body = `<p>${escapeHtml(item.text)}</p>`;
  const hide = hostCanHide ? `<button type="button" class="gift-hide" data-hide="${escapeAttr(item.id)}" title="Ocultar para todos">🙈 Ocultar</button>` : "";
  return `<div class="gift-card">${body}${hide}</div>`;
}

// Lo que recibió la persona en pantalla: los carteles de una vez, los textos uno por uno
function personaRevealHtml(w, { hostCanHide = false } = {}) {
  const room = w.room;
  const v = personaVariant(room);
  const currentId = room.order[room.pos];
  const items = w.gifts.filter((g) => g.to === currentId).sort((a, b) => a.id.localeCompare(b.id));
  if (v.key === "carteles") {
    return {
      total: items.length,
      html: `<div class="cartel-reveal">${items.map((g) => `<span class="cartel-chip big">${escapeHtml(g.text)}</span>`).join("")}</div>`,
    };
  }
  const hidden = new Set(room.hidden || []);
  const visible = items.slice(0, room.shown || 0);
  return {
    total: items.length,
    shown: visible.length,
    html: `<div class="gift-list">${visible.map((item) => giftHtml(v, item, { hidden: hidden.has(item.id), hostCanHide })).join("")}</div>`,
  };
}

function renderPersona(w) {
  const room = w.room;
  const v = personaVariant(room);
  const host = isHost();
  const participants = room.participants || [];

  if (room.phase === "write") {
    $("game-status").textContent = `${v.icon} ${v.title} · Dedica algo a cada persona`;
    const me = participants.find((p) => p.id === profile.playerId);
    const submitted = !!load("session", submissionKey(room));
    const { done, expected } = personaDoneCount(w);
    if (!me) {
      ensurePanel(`persona|${room.gameId}|spectator`, `<div class="waiting"><div class="waiting-icon">👀</div><p>Entraste cuando la dinámica ya había empezado. Podrás ver la ronda cuando comience.</p></div>`);
    } else if (submitted) {
      ensurePanel(`persona|${room.gameId}|write|done`, `<div class="room-box inner"><h3 class="panel-title">${v.icon} ${v.title}</h3><div class="voted-status">✓ Enviado. Esperando al resto...</div></div>`);
    } else {
      const fresh = ensurePanel(`persona|${room.gameId}|write`, personaFormHtml(room, v, participants.filter((p) => p.id !== me.id)));
      if (fresh && v.key === "carteles") refreshCartelChips(room);
    }
    const everyone = allDone(done, expected);
    $("game-host-bar").innerHTML = host
      ? hostButtons([{ action: "persona-start-reveal", label: everyone ? "▶️ Comenzar ronda" : `⏳ Esperando a todos (${done} de ${expected})`, cls: "btn-purple", disabled: !everyone }])
      : nonHostNote("Cuando todos finalicen, el anfitrión comienza la ronda.");
    return;
  }

  if (room.phase === "end") {
    renderEndPanel(w, "¡Ya pasaron todos! 🎉", "persona-restart");
    return;
  }

  // Ronda: una persona a la vez
  const currentId = room.order[room.pos];
  const person = participants.find((p) => p.id === currentId) || {};
  const isMe = currentId === profile.playerId;
  $("game-status").textContent = `${v.icon} ${v.title} · Persona ${room.pos + 1} de ${room.order.length}`;
  ensurePanel(
    `persona|${room.gameId}|reveal|${room.pos}`,
    `<div class="persona-hero ${isMe ? "is-me" : ""}">
       <span class="eyebrow">${v.revealTitle}</span>
       <div class="speaker-name">${person.avatar || "👤"} ${escapeHtml(person.name || "")}</div>
       ${isMe ? "<p>¡Eres tú! 🙈</p>" : ""}
     </div>
     <div id="g-results"></div>
     <div class="progress-line" id="g-progress"></div>`
  );
  const reveal = personaRevealHtml(w, { hostCanHide: host });
  $("g-results").innerHTML = reveal.html;
  const isCards = v.key === "carteles";
  $("g-progress").textContent = isCards ? "" : `💬 ${reveal.shown} de ${reveal.total} mensajes`;
  const isLast = room.pos + 1 >= room.order.length;
  const moreMessages = !isCards && reveal.shown < reveal.total;
  $("game-host-bar").innerHTML = host
    ? hostButtons([
        moreMessages
          ? { action: "persona-next-msg", label: `💬 Siguiente mensaje (${reveal.shown + 1} de ${reveal.total})`, cls: "btn-purple" }
          : { action: "persona-next-person", label: isLast ? "Terminar ➔" : "Siguiente persona ➔" },
      ])
    : nonHostNote(moreMessages ? "El anfitrión va mostrando los mensajes uno por uno." : "Esperando a la siguiente persona...");
}

function handlePersonaClick(e) {
  const room = roomWatcher?.room;
  if (!room || room.mode !== "persona") return false;

  const chip = e.target.closest(".cartel-chip[data-cartel]");
  if (chip && !chip.disabled) {
    const draft = loadPersonaDraft(room);
    const pid = chip.dataset.pid;
    const card = chip.dataset.cartel;
    draft[pid] = draft[pid]?.card === card ? {} : { card };
    savePersonaDraft(room, draft);
    refreshCartelChips(room);
    return true;
  }

  const suggest = e.target.closest('[data-action="suggest-prof"]');
  if (suggest) {
    const input = document.querySelector(`[data-pid="${CSS.escape(suggest.dataset.pid)}"][data-field="a"]`);
    const current = input.value;
    const options = PROFESIONES.filter((prof) => prof !== current);
    input.value = options[Math.floor(Math.random() * options.length)];
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  const hide = e.target.closest("[data-hide]");
  if (hide && isHost()) {
    hostUpdate({ hidden: [...new Set([...(room.hidden || []), hide.dataset.hide])] });
    return true;
  }

  if (e.target.closest('[data-action="persona-finish"]')) {
    finishPersona();
    return true;
  }
  return false;
}

function handlePersonaInput(e) {
  const field = e.target.closest("[data-field][data-pid]");
  const room = roomWatcher?.room;
  if (!field || !room || room.mode !== "persona") return;
  const draft = loadPersonaDraft(room);
  draft[field.dataset.pid] = { ...(draft[field.dataset.pid] || {}), [field.dataset.field]: field.value };
  savePersonaDraft(room, draft);
}

async function finishPersona() {
  const w = roomWatcher;
  const room = w.room;
  const v = personaVariant(room);
  const others = (room.participants || []).filter((p) => p.id !== profile.playerId);
  const draft = loadPersonaDraft(room);

  const missing = others.filter((p) => {
    const d = draft[p.id] || {};
    if (v.key === "carteles") return !d.card;
    return !(d.a || "").trim() || (v.fieldB && !(d.b || "").trim());
  });
  if (missing.length) {
    showToast(`Te falta completar: ${missing.map((p) => p.name).join(", ")}`, "✍️");
    return;
  }

  const btn = document.querySelector('[data-action="persona-finish"]');
  if (btn) btn.disabled = true;
  try {
    await Promise.all(
      others.map((p) => {
        const d = draft[p.id];
        const data = v.key === "carteles" ? { to: p.id, text: d.card } : { to: p.id, text: d.a.trim(), extra: (d.b || "").trim() };
        return setDoc(doc(db, "salas", w.code, `a_${room.gameId}`, randomId(16)), data);
      })
    );
    store("session", submissionKey(room), "1");
    markStepDone();
    renderGame(w);
    showToast("¡Listo! Esperando al resto", "✅");
  } catch (err) {
    if (btn) btn.disabled = false;
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

  "to-guess": () => {
    const w = roomWatcher;
    if (!allDone(w.votes.length, activePlayers(w.players).length)) return;
    return hostUpdate({ phase: "guess" });
  },

  "show-results": () => {
    const w = roomWatcher;
    const r = w.room;
    const players = activePlayers(w.players);
    if (!allDone(w.votes.length, players.length)) return;
    if (r.phase !== "guess") return hostUpdate({ phase: "results" });
    if (!allDone(w.guesses.length, players.length)) return;

    // Se calcula quién acertó y se suma al ranking de la partida
    const info = classifyGroupQuestion(r.deck[r.pos], r.category);
    const spec = guessSpec(info, players);
    const answer = spec.answer(w.votes);
    const winners = w.guesses.filter((g) => isCorrectGuess(spec, answer, g.value));
    const scores = { ...(r.scores || {}) };
    winners.forEach((g) => {
      scores[g.id] = { name: g.name, pts: (scores[g.id]?.pts || 0) + 1 };
    });
    const answerText = spec.numeric ? `Fueron ${answer} 🔥` : spec.describe(answer);
    return hostUpdate({ phase: "results", scores, lastGuess: { round: r.round, answer: answerText, winners: winners.map((g) => g.name) } });
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

  "persona-start-reveal": () => {
    const w = roomWatcher;
    const { done, expected } = personaDoneCount(w);
    if (!allDone(done, expected)) return;
    return hostUpdate({ phase: "reveal", order: shuffleArray(w.room.participants.map((p) => p.id)), pos: 0, shown: 0, hidden: [] });
  },

  "persona-next-msg": () => hostUpdate({ shown: (roomWatcher.room.shown || 0) + 1 }),

  "persona-next-person": () => {
    const r = roomWatcher.room;
    return r.pos + 1 >= r.order.length ? hostUpdate({ phase: "end" }) : hostUpdate({ pos: r.pos + 1, shown: 0 });
  },

  "persona-restart": () => hostUpdate({ ...gameResetFields(), ...personaStartFields(roomWatcher, roomWatcher.room.variant), gameId: randomId(6) }),

  "end-game": () => hostUpdate({ state: "lobby" }),
};

$("game-host-bar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-host]");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  Promise.resolve(HOST_ACTIONS[btn.dataset.host]?.()).finally(() => { btn.disabled = false; });
});

$("game-panel").addEventListener("input", handlePersonaInput);

$("game-panel").addEventListener("click", (e) => {
  if (handlePersonaClick(e)) return;
  const voteBtn = e.target.closest(".vote-btn[data-vote]");
  if (voteBtn) {
    handleVoteClick(voteBtn);
    return;
  }
  const guessBtn = e.target.closest(".vote-btn[data-guess]");
  if (guessBtn) {
    castGuess(JSON.parse(guessBtn.dataset.guess), guessBtn.dataset.label);
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
  $("tv-giant-q-text").textContent = questionText(tv.deck[tv.index]);
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
    if (room.phase === "vote") {
      results.innerHTML = `<div class="results-headline">🗳️ ${w.votes.length} de ${players.length} votaron</div>`;
    } else if (room.phase === "guess") {
      results.innerHTML = `<div class="results-headline">🎯 A adivinar: ${w.guesses.length} de ${players.length} apostaron</div>`;
    } else if (w.votes.length) {
      const revealGender = !!room.settings?.revealGender;
      const html = info.type === "suspect" ? suspectResultsHtml(w.votes, w.players)
        : info.type === "choice" ? choiceResultsHtml(w.votes, info.options)
        : info.type === "experience" ? experienceResultsHtml(w.votes, revealGender)
        : yesNoResultsHtml(w.votes, info, revealGender);
      results.innerHTML = `${room.settings?.guess ? guessOutcomeHtml(room) : ""}<div class="results-box">${html}</div>`;
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
  } else if (room.mode === "persona") {
    const v = personaVariant(room);
    status.textContent = `${v.icon} ${v.title}`;
    if (room.phase === "write") {
      const { done, expected } = personaDoneCount(w);
      headline.textContent = "Cada uno está dedicando algo a los demás desde su celular ✍️";
      results.innerHTML = `<div class="results-headline">✅ ${done} de ${expected} finalizaron</div>`;
    } else if (room.phase === "end") {
      headline.textContent = "¡Ya pasaron todos! 🎉";
    } else {
      const person = (room.participants || []).find((p) => p.id === room.order[room.pos]) || {};
      headline.textContent = `${person.avatar || ""} ${person.name || ""}`;
      results.innerHTML = personaRevealHtml(w).html;
    }
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
// 7. PANEL DE ADMINISTRACIÓN (login con Google; los cambios son para todos)
// ==========================================
// Solo la cuenta ADMIN_EMAIL puede guardar: lo exigen también las reglas de Firestore.
let adminUser = null;
let adminEditingId = null;

function isAdminUser() {
  return adminUser?.email === ADMIN_EMAIL;
}

onAuthStateChanged(auth, (user) => {
  adminUser = user;
  renderAdminAccess();
});

function renderAdminAccess() {
  const allowed = isAdminUser();
  $("admin-login-box").hidden = allowed;
  $("admin-panel-box").hidden = !allowed;
  $("admin-not-allowed").hidden = !adminUser || allowed;
  $("btn-admin-login").hidden = !!adminUser && !allowed;
  $("lbl-admin-denied-email").textContent = adminUser?.email || "";
  if (!allowed) return;
  $("lbl-admin-email").textContent = adminUser.email;
  setupAdminSelectors();
  renderAdminForm();
  renderAdminQuestionsList();
}

function adminSignIn() {
  signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
    if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
      showToast("No se pudo iniciar sesión: " + (err?.message || err), "❌");
    }
  });
}

$("btn-open-admin").addEventListener("click", () => $("modal-admin").classList.add("active"));
$("btn-close-admin").addEventListener("click", () => $("modal-admin").classList.remove("active"));
$("btn-admin-login").addEventListener("click", adminSignIn);
$("btn-admin-switch").addEventListener("click", () => signOut(auth).then(adminSignIn));
$("btn-admin-logout").addEventListener("click", () => signOut(auth));

function adminCategory() {
  return categories.find((c) => c.id === $("admin-select-category").value) || categories[0];
}

function is18(cat) {
  return cat?.id === "secretos_intimos";
}

function setupAdminSelectors() {
  const catSelect = $("admin-select-category");
  const previous = catSelect.value;
  catSelect.innerHTML = categories.map((c) => `<option value="${c.id}">${c.icono || "🧊"} ${escapeHtml(c.titulo)}</option>`).join("");
  if (previous) catSelect.value = previous;

  const levelOptions = NIVELES_18.map((n) => `<option value="${n.lvl}">${n.icon} ${n.lvl} · ${n.title}</option>`).join("");
  const temaOptions = TEMAS_18.map((t) => `<option value="${t.tema}">${t.icon} ${t.title}</option>`).join("");
  if (!$("admin-q-lvl").options.length) {
    $("admin-q-lvl").innerHTML = levelOptions;
    $("admin-q-tema").innerHTML = temaOptions;
    $("admin-filter-lvl").innerHTML = `<option value="">Todos los niveles</option>${levelOptions}`;
    $("admin-filter-tema").innerHTML = `<option value="">Todos los temas</option>${temaOptions}`;
  }
}

function renderAdminForm() {
  const cat = adminCategory();
  const editing = !!adminEditingId;
  $("lbl-admin-form-title").textContent = editing ? "✏️ Editando pregunta" : "➕ Agregar pregunta";
  $("btn-admin-save-question").textContent = editing ? "Guardar cambios" : "Agregar";
  $("btn-admin-cancel-edit").hidden = !editing;
  $("admin-18-fields").hidden = !is18(cat);
  $("admin-q-opts").hidden = !is18(cat) || $("admin-q-fmt").value !== "gusto";
  $("admin-form-hint").hidden = is18(cat);
  $("admin-filter-lvl").hidden = !is18(cat);
  $("admin-filter-tema").hidden = !is18(cat);
}

function resetAdminForm() {
  adminEditingId = null;
  $("admin-q-text").value = "";
  $("admin-q-opts").value = "";
  renderAdminForm();
}

function readAdminForm() {
  const text = $("admin-q-text").value.trim();
  if (!text) {
    showToast("Escribe la pregunta", "✍️");
    return null;
  }
  if (!is18(adminCategory())) return { t: text };
  const q = { t: text, fmt: $("admin-q-fmt").value, lvl: Number($("admin-q-lvl").value), tema: $("admin-q-tema").value };
  if (q.fmt === "gusto") {
    q.opts = $("admin-q-opts").value.split("|").map((o) => o.trim()).filter(Boolean);
    if (q.opts.length < 2) {
      showToast("Escribe al menos 2 opciones separadas por |", "⚠️");
      return null;
    }
  }
  return q;
}

async function saveBankPatch(mutate, okMessage) {
  const next = structuredClone({ deleted: bankPatch.deleted || [], edits: bankPatch.edits || {}, added: bankPatch.added || {} });
  mutate(next);
  try {
    await setDoc(BANK_DOC, { ...next, updatedAt: serverTimestamp() });
    showToast(okMessage, "☁️");
    return true;
  } catch (err) {
    showToast("No se pudo guardar: " + friendlyError(err), "❌");
    return false;
  }
}

function isAddedQuestion(cat, id) {
  return (bankPatch.added?.[cat.id] || []).some((q) => q.id === id);
}

$("admin-select-category").addEventListener("change", () => {
  resetAdminForm();
  renderAdminQuestionsList();
});
$("admin-q-fmt").addEventListener("change", renderAdminForm);
["admin-filter-text", "admin-filter-lvl", "admin-filter-tema"].forEach((id) => $(id).addEventListener("input", renderAdminQuestionsList));
$("btn-admin-cancel-edit").addEventListener("click", resetAdminForm);

$("btn-admin-save-question").addEventListener("click", async () => {
  const cat = adminCategory();
  const q = readAdminForm();
  if (!q) return;
  const editingId = adminEditingId;
  const ok = await saveBankPatch((patch) => {
    if (!editingId) {
      patch.added[cat.id] = [...(patch.added[cat.id] || []), { ...q, id: "a_" + randomId(8) }];
    } else if (isAddedQuestion(cat, editingId)) {
      patch.added[cat.id] = patch.added[cat.id].map((x) => (x.id === editingId ? { ...q, id: editingId } : x));
    } else {
      patch.edits[editingId] = { ...q, id: editingId };
    }
  }, editingId ? "Pregunta actualizada para todos" : "Pregunta agregada para todos");
  if (ok) resetAdminForm();
});

$("admin-questions-list").addEventListener("click", (e) => {
  const cat = adminCategory();
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");
  if (editBtn) {
    const q = cat.preguntas.find((x) => questionId(cat.id, x) === editBtn.dataset.edit);
    if (!q) return;
    adminEditingId = editBtn.dataset.edit;
    $("admin-q-text").value = typeof q === "string" ? q : q.t;
    if (is18(cat)) {
      $("admin-q-fmt").value = q.fmt || "exp";
      $("admin-q-lvl").value = String(q.lvl || 1);
      $("admin-q-tema").value = q.tema || TEMAS_18[0].tema;
      $("admin-q-opts").value = (q.opts || []).join(" | ");
    }
    renderAdminForm();
    $("admin-form").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (delBtn && confirm("¿Eliminar esta pregunta para todos?")) {
    const id = delBtn.dataset.del;
    saveBankPatch((patch) => {
      if (isAddedQuestion(cat, id)) {
        patch.added[cat.id] = patch.added[cat.id].filter((x) => x.id !== id);
      } else if (!patch.deleted.includes(id)) {
        patch.deleted.push(id);
      }
      delete patch.edits[id];
    }, "Pregunta eliminada para todos");
    if (adminEditingId === id) resetAdminForm();
  }
});

function adminBadgesHtml(cat, q) {
  if (is18(cat)) {
    const nivel = NIVELES_18.find((n) => n.lvl === q.lvl);
    const tema = TEMAS_18.find((t) => t.tema === q.tema);
    const opts = q.fmt === "gusto" ? `<span class="admin-badge">${(q.opts || []).map(escapeHtml).join(" · ")}</span>` : "";
    return `<span class="admin-badge">${nivel ? `${nivel.icon} ${nivel.title}` : "Sin nivel"}</span>
      <span class="admin-badge">${tema ? `${tema.icon} ${tema.title}` : "Sin tema"}</span>
      <span class="admin-badge">${FORMAT_LABELS[q.fmt] || "Sin formato"}</span>${opts}`;
  }
  const info = classifyGroupQuestion(q, cat.id);
  const label = { suspect: "👉 Votar por alguien", choice: "🅰️ Elegir opción", yesno: "🙋 Sí o No", open: "🎤 Responder", experience: "🔥 Experiencia" }[info.type];
  const opts = info.type === "choice" ? `<span class="admin-badge">${info.options.map(escapeHtml).join(" · ")}</span>` : "";
  return `<span class="admin-badge">${label}</span>${opts}`;
}

function renderAdminQuestionsList() {
  if (!isAdminUser()) return;
  const cat = adminCategory();
  if (!cat) return;
  const search = $("admin-filter-text").value.trim().toLowerCase();
  const lvl = is18(cat) ? $("admin-filter-lvl").value : "";
  const tema = is18(cat) ? $("admin-filter-tema").value : "";
  const edited = new Set(Object.keys(bankPatch.edits || {}));

  const rows = cat.preguntas.filter((q) => {
    if (search && !questionText(q).toLowerCase().includes(search)) return false;
    if (lvl && String(q.lvl) !== lvl) return false;
    if (tema && q.tema !== tema) return false;
    return true;
  });

  $("admin-questions-count").textContent = rows.length === cat.preguntas.length ? cat.preguntas.length : `${rows.length} de ${cat.preguntas.length}`;
  $("admin-questions-list").innerHTML = rows
    .map((q) => {
      const id = questionId(cat.id, q);
      const mark = isAddedQuestion(cat, id) ? `<span class="admin-badge is-new">Nueva</span>` : edited.has(id) ? `<span class="admin-badge is-edited">Editada</span>` : "";
      return `
      <div class="admin-list-item">
        <div class="admin-text">
          <span>${escapeHtml(questionText(q))}</span>
          <div class="admin-badges">${mark}${adminBadgesHtml(cat, q)}</div>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" data-edit="${escapeAttr(id)}" title="Editar">✏️</button>
        <button type="button" class="btn btn-danger btn-xs" data-del="${escapeAttr(id)}" title="Eliminar">🗑️</button>
      </div>`;
    })
    .join("");
}

$("btn-admin-restore-defaults").addEventListener("click", () => {
  if (!confirm("¿Deshacer TODOS los cambios (borradas, editadas y agregadas) y volver a las preguntas oficiales para todos?")) return;
  saveBankPatch((patch) => {
    patch.deleted = [];
    patch.edits = {};
    patch.added = {};
  }, "Preguntas oficiales restauradas para todos");
  resetAdminForm();
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
subscribeToBank();
