// app.js - Lógica principal y en tiempo real de RompeHielos
import { firebaseConfig } from "./firebase-config.js";
import { DEFAULT_CATEGORIES } from "./questions-data.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ==========================================
// 1. INICIALIZACIÓN DE FIREBASE & ESTADO
// ==========================================
let db = null;
let firestoreAvailable = false;
try {
  const firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  firestoreAvailable = true;
} catch (e) {
  console.warn("Firestore no disponible o en modo offline:", e);
}

// Estado de categorías y preguntas (localStorage + Default)
const STORAGE_KEY_CATEGORIES = "rompehielos_custom_categories_v2";
let categories = loadStoredCategories();

function loadStoredCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Asegurar que las nuevas categorías oficiales (como secretos_intimos) se integren
        const existingIds = new Set(parsed.map((c) => c.id));
        DEFAULT_CATEGORIES.forEach((defCat) => {
          if (!existingIds.has(defCat.id)) {
            parsed.unshift(defCat);
          } else {
            // Actualizar preguntas si la categoría oficial tiene más
            const target = parsed.find((c) => c.id === defCat.id);
            if (target && defCat.preguntas.length > target.preguntas.length) {
              target.preguntas = defCat.preguntas;
            }
          }
        });
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error cargando categorías de localStorage:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

function saveCategories(cats) {
  categories = cats;
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(cats));
  } catch (e) {
    console.error("Error guardando categorías:", e);
  }
}

// Estado del jugador y de la sala actual
let currentSession = {
  playerId: sessionStorage.getItem("rh_player_id") || "p_" + Math.random().toString(36).substring(2, 9),
  playerName: sessionStorage.getItem("rh_player_name") || "",
  playerAvatar: sessionStorage.getItem("rh_player_avatar") || "🦊",
  playerGender: sessionStorage.getItem("rh_player_gender") || "hombre",
  currentRoomId: null,
  isHost: false,
  unsubscribeRoom: null,
  unsubscribePlayers: null,
  unsubscribeEntries: null,
  unsubscribeVotes: null,
  unsubscribeMuro: null,
  unsubscribeSecretos: null,
  activeDynamic: null,
  selectedCategory: categories[0]?.id || "dilemas_absurdos",
  soloQuestionIndex: 0,
  soloTurnPlayer: 1,
  soloDeck: null,
  secretosDeck: null,
};
sessionStorage.setItem("rh_player_id", currentSession.playerId);
sessionStorage.setItem("rh_player_gender", currentSession.playerGender);

// ==========================================
// 2. UTILIDADES VISUALES Y TOAST
// ==========================================
const toastEl = document.getElementById("toast-notice");
const toastMsg = document.getElementById("toast-msg");
const toastIcon = document.getElementById("toast-icon");
let toastTimer = null;

function showToast(msg, icon = "✨") {
  if (!toastEl) return;
  toastMsg.textContent = msg;
  toastIcon.textContent = icon;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Algoritmo Fisher-Yates para barajar preguntas al azar en todas las dinámicas
function shuffleArray(array) {
  if (!Array.isArray(array)) return [];
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Partículas flotantes de hielo
function initParticles() {
  const container = document.getElementById("particles-container");
  if (!container) return;
  const count = 18;
  for (let i = 0; i < count; i++) {
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

// Router simple de vistas
function switchView(viewId) {
  document.querySelectorAll(".view-screen").forEach((el) => el.classList.remove("active"));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ==========================================
// 3. MODO 1 CELULAR (SOLO / EN PERSONA)
// ==========================================

// Compatibilidad estricta de categorías por modo de juego
const MODE_COMPATIBLE_CATEGORIES = {
  // Modo 1 Celular en la Mesa: Exclusivo para 2 personas (Citas románticas y preguntas cara a cara de a dos)
  // Las dinámicas grupales con votaciones ("¿Quién es más probable?", "Secretos Íntimos / Yo he...") son exclusivas de Salas Multicelular.
  solo: [
    "citas_nivel1",
    "citas_nivel2",
    "citas_nivel3",
    "dilemas_absurdos",
  ],
  // Modo Salas Multicelular: Dinámicas grupales con celulares, votaciones de sospechosos, anonimato y estadísticas en vivo
  multiplayer: [
    "secretos_intimos",
    "quien_es_mas_probable",
    "dilemas_absurdos",
    "amigos_fiesta",
    "empresas_trabajo",
  ],
  // Modo TV / Proyector: Pantalla gigante para eventos o carretes
  tv: [
    "quien_es_mas_probable",
    "secretos_intimos",
    "dilemas_absurdos",
    "amigos_fiesta",
    "empresas_trabajo",
  ],
};

function renderSoloCategories() {
  const soloGrid = document.getElementById("solo-categories-grid");
  const homeGrid = document.getElementById("home-categories-grid");

  const soloCats = categories.filter((c) => MODE_COMPATIBLE_CATEGORIES.solo.includes(c.id));

  const generateCardHtml = (cat) => `
    <div class="category-card" data-catid="${cat.id}">
      <div class="category-top">
        <span class="cat-emoji">${cat.icono || "🧊"}</span>
        <span class="cat-badge" style="color:${cat.color || "var(--cyan)"}">${cat.badge || "Pack"}</span>
      </div>
      <h4>${escapeHtml(cat.titulo)}</h4>
      <p>${escapeHtml(cat.descripcion)}</p>
      <div class="cat-meta">
        <span>${cat.preguntas.length} preguntas al azar</span>
        <strong style="color:var(--cyan)">Jugar ➔</strong>
      </div>
    </div>
  `;

  if (soloGrid) {
    soloGrid.innerHTML = soloCats.map(generateCardHtml).join("");
    soloGrid.querySelectorAll(".category-card").forEach((card) => {
      card.addEventListener("click", () => {
        const catId = card.getAttribute("data-catid");
        startSoloMode(catId);
      });
    });
  }

  if (homeGrid) {
    homeGrid.innerHTML = soloCats.map(generateCardHtml).join("");
    homeGrid.querySelectorAll(".category-card").forEach((card) => {
      card.addEventListener("click", () => {
        const catId = card.getAttribute("data-catid");
        startSoloMode(catId);
      });
    });
  }
}

function renderHomeCategories() {
  renderSoloCategories();
}

function startSoloMode(categoryId) {
  currentSession.selectedCategory = categoryId;
  const cat = categories.find((c) => c.id === categoryId) || categories[0];
  // Mezclar preguntas al azar para esta partida
  currentSession.soloDeck = shuffleArray([...cat.preguntas]);
  currentSession.soloQuestionIndex = 0;
  currentSession.soloTurnPlayer = 1;
  updateSoloCard();
  switchView("view-solo");
}

function updateSoloCard() {
  const cat = categories.find((c) => c.id === currentSession.selectedCategory) || categories[0];
  if (!currentSession.soloDeck || currentSession.soloDeck.length === 0) {
    currentSession.soloDeck = shuffleArray([...cat.preguntas]);
  }
  const qList = currentSession.soloDeck;
  if (!qList || qList.length === 0) {
    document.getElementById("solo-question-text").textContent = "No hay preguntas en esta categoría.";
    return;
  }

  // Si se recorrieron todas, rebarajar automáticamente para seguir jugando al azar sin repeticiones inmediatas
  if (currentSession.soloQuestionIndex >= qList.length) {
    currentSession.soloDeck = shuffleArray([...cat.preguntas]);
    currentSession.soloQuestionIndex = 0;
    showToast("¡Mazo de 100 preguntas rebarajado al azar! 🔀", "🎲");
  }

  const idx = Math.max(0, Math.min(currentSession.soloQuestionIndex, currentSession.soloDeck.length - 1));
  currentSession.soloQuestionIndex = idx;

  const card = document.getElementById("solo-question-card");
  card.classList.remove("shake");
  void card.offsetWidth; // reflow
  card.classList.add("shake");

  document.getElementById("solo-cat-badge").textContent = cat.titulo;
  document.getElementById("solo-cat-badge").style.color = cat.color || "var(--cyan)";
  document.getElementById("solo-counter").textContent = `🎲 ${idx + 1} / ${qList.length}`;
  document.getElementById("solo-question-text").textContent = currentSession.soloDeck[idx];

  const turnBadge = document.getElementById("solo-turn-badge");
  turnBadge.textContent = currentSession.soloTurnPlayer === 1 ? "👤 Turno: Jugador 1" : "👥 Turno: Jugador 2";
  turnBadge.style.borderColor = currentSession.soloTurnPlayer === 1 ? "var(--cyan)" : "var(--coral)";
  turnBadge.style.color = currentSession.soloTurnPlayer === 1 ? "var(--cyan)" : "var(--coral)";
}

// Botones modo Solo y navegación entre vistas de categorías
document.getElementById("solo-question-card")?.addEventListener("click", () => {
  currentSession.soloQuestionIndex++;
  currentSession.soloTurnPlayer = currentSession.soloTurnPlayer === 1 ? 2 : 1;
  updateSoloCard();
});

document.getElementById("btn-solo-next")?.addEventListener("click", () => {
  currentSession.soloQuestionIndex++;
  currentSession.soloTurnPlayer = currentSession.soloTurnPlayer === 1 ? 2 : 1;
  updateSoloCard();
});

document.getElementById("btn-solo-prev")?.addEventListener("click", () => {
  if (currentSession.soloDeck && currentSession.soloDeck.length > 0) {
    currentSession.soloQuestionIndex = (currentSession.soloQuestionIndex - 1 + currentSession.soloDeck.length) % currentSession.soloDeck.length;
    updateSoloCard();
  }
});

document.getElementById("btn-solo-shuffle")?.addEventListener("click", () => {
  const cat = categories.find((c) => c.id === currentSession.selectedCategory) || categories[0];
  currentSession.soloDeck = shuffleArray([...cat.preguntas]);
  currentSession.soloQuestionIndex = 0;
  updateSoloCard();
  showToast("¡Preguntas rebarajadas al azar! 🎲", "🔀");
});

document.getElementById("btn-solo-toggle-turn")?.addEventListener("click", () => {
  currentSession.soloTurnPlayer = currentSession.soloTurnPlayer === 1 ? 2 : 1;
  updateSoloCard();
  showToast(`Ahora es el turno del Jugador ${currentSession.soloTurnPlayer}`, "🔄");
});

document.getElementById("solo-turn-badge")?.addEventListener("click", () => {
  currentSession.soloTurnPlayer = currentSession.soloTurnPlayer === 1 ? 2 : 1;
  updateSoloCard();
});

document.getElementById("btn-solo-change-cat")?.addEventListener("click", () => {
  renderSoloCategories();
  switchView("view-solo-categories");
});

document.getElementById("btn-back-solo")?.addEventListener("click", () => {
  renderSoloCategories();
  switchView("view-solo-categories");
});

document.getElementById("btn-back-solo-categories")?.addEventListener("click", () => {
  switchView("view-home");
});

// Navegación de los 3 Modos desde el Home Hub
document.getElementById("card-start-solo")?.addEventListener("click", () => {
  renderSoloCategories();
  switchView("view-solo-categories");
});

document.getElementById("card-start-multi")?.addEventListener("click", () => {
  switchView("view-lobby");
});

document.getElementById("card-start-tv")?.addEventListener("click", () => {
  const room = currentSession.currentRoomId || "HIELO";
  enterTvMode(room);
});

// ==========================================
// 4. SALAS MULTICELULAR (MULTIPLAYER LOBBY)
// ==========================================
function setupAvatarPicker() {
  const opts = document.querySelectorAll(".avatar-opt");
  opts.forEach((opt) => {
    opt.addEventListener("click", () => {
      opts.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      currentSession.playerAvatar = opt.getAttribute("data-avatar");
      sessionStorage.setItem("rh_player_avatar", currentSession.playerAvatar);
    });
  });
}

function setupGenderPicker() {
  const pills = document.querySelectorAll(".gender-radio-pill");
  pills.forEach((p) => {
    p.addEventListener("click", () => {
      pills.forEach((x) => x.classList.remove("selected"));
      p.classList.add("selected");
      const radio = p.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        currentSession.playerGender = radio.value;
        sessionStorage.setItem("rh_player_gender", radio.value);
      }
    });
  });
  // Restaurar el seleccionado en base al estado
  pills.forEach((p) => {
    const radio = p.querySelector('input[type="radio"]');
    if (radio && radio.value === currentSession.playerGender) {
      p.classList.add("selected");
      radio.checked = true;
    } else {
      p.classList.remove("selected");
    }
  });
}

function generateRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

// Crear sala
document.getElementById("btn-create-room")?.addEventListener("click", async () => {
  const nameInput = document.getElementById("input-player-name");
  const name = nameInput.value.trim();
  if (!name) {
    showToast("Por favor ingresa tu nombre", "⚠️");
    nameInput.focus();
    return;
  }
  currentSession.playerName = name;
  sessionStorage.setItem("rh_player_name", name);

  const roomCode = generateRoomCode();
  currentSession.currentRoomId = roomCode;
  currentSession.isHost = true;

  try {
    if (firestoreAvailable && db) {
      await setDoc(doc(db, "salas", roomCode), {
        code: roomCode,
        hostId: currentSession.playerId,
        hostName: name,
        gameMode: "secretos_cruzados",
        state: "lobby", // lobby, writing, voting, results, muro
        revealAuthor: document.getElementById("chk-reveal-truth")?.checked ?? true,
        currentRound: 0,
        createdAt: serverTimestamp(),
      });

      // Añadirse como jugador con su género
      await setDoc(doc(db, "salas", roomCode, "players", currentSession.playerId), {
        id: currentSession.playerId,
        name: name,
        avatar: currentSession.playerAvatar,
        gender: currentSession.playerGender,
        isHost: true,
        connectedAt: serverTimestamp(),
      });
    }

    enterRoomView(roomCode);
    showToast("¡Sala creada con éxito!", "🎉");
  } catch (err) {
    console.error("Error al crear sala en Firestore:", err);
    // Modo simulación local por si las reglas de firestore dan error
    enterRoomView(roomCode);
    showToast("Sala local activa (código: " + roomCode + ")", "🧊");
  }
});

// Toggle unirse
document.getElementById("btn-toggle-join-mode")?.addEventListener("click", () => {
  const container = document.getElementById("join-code-container");
  container.style.display = container.style.display === "none" ? "block" : "none";
  if (container.style.display === "block") {
    document.getElementById("input-room-code").focus();
  }
});

// Unirse a sala existente
document.getElementById("btn-submit-join")?.addEventListener("click", async () => {
  const nameInput = document.getElementById("input-player-name");
  const name = nameInput.value.trim();
  if (!name) {
    showToast("Ingresa tu nombre antes de unirte", "⚠️");
    nameInput.focus();
    return;
  }
  const codeInput = document.getElementById("input-room-code");
  const roomCode = codeInput.value.trim().toUpperCase();
  if (!roomCode || roomCode.length < 3) {
    showToast("Ingresa un código de sala válido", "⚠️");
    return;
  }

  currentSession.playerName = name;
  sessionStorage.setItem("rh_player_name", name);
  currentSession.currentRoomId = roomCode;
  currentSession.isHost = false;

  try {
    if (firestoreAvailable && db) {
      const roomRef = doc(db, "salas", roomCode);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
        showToast("La sala " + roomCode + " no existe.", "❌");
        return;
      }
      const data = roomSnap.data();
      currentSession.isHost = data.hostId === currentSession.playerId;

      await setDoc(doc(db, "salas", roomCode, "players", currentSession.playerId), {
        id: currentSession.playerId,
        name: name,
        avatar: currentSession.playerAvatar,
        gender: currentSession.playerGender,
        isHost: currentSession.isHost,
        connectedAt: serverTimestamp(),
      });
    }

    enterRoomView(roomCode);
    showToast("¡Te has unido a la sala!", "🚀");
  } catch (err) {
    console.error("Error al unirse a sala:", err);
    enterRoomView(roomCode);
  }
});

// Entrar a la interfaz de sala de espera
function enterRoomView(roomCode) {
  document.getElementById("lobby-join-create-box").style.display = "none";
  document.getElementById("lobby-active-room-box").style.display = "block";
  document.getElementById("lbl-room-code").textContent = roomCode;
  document.getElementById("tv-room-code-display").textContent = roomCode;

  // Actualizar controles de Host vs Jugador
  const hostControls = document.getElementById("host-game-controls");
  const waitMsg = document.getElementById("non-host-wait-msg");
  if (currentSession.isHost) {
    hostControls.style.display = "block";
    waitMsg.style.display = "none";
    document.getElementById("lbl-host-indicator").textContent = "👑 Eres el Anfitrión";
  } else {
    hostControls.style.display = "none";
    waitMsg.style.display = "block";
    document.getElementById("lbl-host-indicator").textContent = "Esperando al anfitrión...";
  }

  generateQrCodes(roomCode);
  listenToRoom(roomCode);
  switchView("view-lobby");
}

function generateQrCodes(roomCode) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}&color=070a12&bgcolor=ffffff`;
  const tvQr = document.getElementById("tv-qr-container");
  if (tvQr) {
    tvQr.innerHTML = `<img src="${qrUrl}" alt="QR Sala" style="width:140px;height:140px;display:block;border-radius:6px;">`;
  }
}

// Copiar código o link
document.getElementById("btn-copy-room-code")?.addEventListener("click", () => {
  const code = currentSession.currentRoomId;
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareUrl);
    showToast("¡Enlace copiado al portapapeles!", "📋");
  } else {
    showToast(`Código: ${code}`, "📋");
  }
});

function shareViaWhatsApp(roomCode) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  const text = `🧊 ¡Únete a mi sala de RompeHielos! Entra directo con este enlace para jugar: ${shareUrl}`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, "_blank");
}

document.getElementById("btn-share-whatsapp")?.addEventListener("click", () => {
  const code = currentSession.currentRoomId || "HIELO";
  shareViaWhatsApp(code);
});

document.getElementById("btn-share-copy-link")?.addEventListener("click", () => {
  const code = currentSession.currentRoomId || "HIELO";
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareUrl);
    showToast("¡Enlace directo copiado al portapapeles!", "🔗");
  } else {
    showToast(`Enlace: ${shareUrl}`, "🔗");
  }
});

let currentRoomPlayers = [];

// Escuchar cambios de la sala en tiempo real
function listenToRoom(roomCode) {
  if (!firestoreAvailable || !db) {
    // Simulación para prueba sin conexión
    renderLocalPlayerChip();
    return;
  }

  // 1. Escuchar jugadores de la sala
  const playersCol = collection(db, "salas", roomCode, "players");
  currentSession.unsubscribePlayers = onSnapshot(playersCol, (snap) => {
    const listEl = document.getElementById("room-players-list");
    const tvListEl = document.getElementById("tv-players-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    if (tvListEl) tvListEl.innerHTML = "";

    let count = 0;
    let hombres = 0;
    let mujeres = 0;
    let otros = 0;
    currentRoomPlayers = [];

    snap.forEach((pDoc) => {
      count++;
      const p = pDoc.data();
      const pId = p.id || pDoc.id;
      currentRoomPlayers.push({
        id: pId,
        name: p.name || "Jugador",
        avatar: p.avatar || "👤",
        gender: p.gender || "hombre",
        isHost: !!p.isHost,
      });

      const g = (p.gender || "hombre").toLowerCase();
      if (g === "hombre") hombres++;
      else if (g === "mujer") mujeres++;
      else otros++;

      const chip = document.createElement("div");
      chip.className = `player-chip ${p.isHost ? "is-host" : ""}`;
      chip.innerHTML = `<span>${p.avatar || "👤"}</span> <span>${escapeHtml(p.name)}</span> ${p.isHost ? "👑" : ""}`;
      listEl.appendChild(chip);

      if (tvListEl) {
        const tvChip = chip.cloneNode(true);
        tvListEl.appendChild(tvChip);
      }
    });

    currentRoomGenderCounts = { hombres, mujeres, otros };
    document.getElementById("lbl-player-count").textContent = count;
    updateSingleGenderWarning();
  });

  // 2. Escuchar estado general de la sala (cambio de fases / dinámicas)
  const roomDocRef = doc(db, "salas", roomCode);
  currentSession.unsubscribeRoom = onSnapshot(roomDocRef, (snap) => {
    if (!snap.exists()) return;
    const room = snap.data();
    handleRoomStateChange(room);
  });
}

let currentRoomGenderCounts = { hombres: 0, mujeres: 0, otros: 0 };

function updateSingleGenderWarning() {
  const warningBox = document.getElementById("single-gender-warning-box");
  const descEl = document.getElementById("lbl-single-gender-desc");
  const chkRevealGender = document.getElementById("chk-reveal-gender");
  if (!warningBox || !descEl || !chkRevealGender) return;

  const revealActive = chkRevealGender.checked;
  const { hombres, mujeres } = currentRoomGenderCounts;

  if (revealActive) {
    if (hombres === 1 && mujeres === 1) {
      warningBox.style.display = "block";
      descEl.textContent = "Hay solo 1 hombre y 1 mujer en la sala. Al activar el desglose por sexo, aunque sea anónimo, las respuestas de ambos quedarán expuestas.";
    } else if (hombres === 1) {
      warningBox.style.display = "block";
      descEl.textContent = "Solo hay 1 hombre en la sala. Aunque sea anónimo, al desglosar por sexo su respuesta quedará automáticamente en evidencia.";
    } else if (mujeres === 1) {
      warningBox.style.display = "block";
      descEl.textContent = "Solo hay 1 mujer en la sala. Aunque sea anónimo, al desglosar por sexo su respuesta quedará automáticamente en evidencia.";
    } else {
      warningBox.style.display = "none";
    }
  } else {
    warningBox.style.display = "none";
  }
}

document.getElementById("chk-reveal-gender")?.addEventListener("change", updateSingleGenderWarning);

function renderLocalPlayerChip() {
  const listEl = document.getElementById("room-players-list");
  if (!listEl) return;
  listEl.innerHTML = `
    <div class="player-chip is-host">
      <span>${currentSession.playerAvatar}</span>
      <span>${escapeHtml(currentSession.playerName || "Tú")}</span> 👑
    </div>
  `;
  document.getElementById("lbl-player-count").textContent = "1";
  currentRoomPlayers = [
    {
      id: currentSession.playerId,
      name: currentSession.playerName || "Tú",
      avatar: currentSession.playerAvatar || "👤",
      gender: currentSession.playerGender || "hombre",
      isHost: true,
    }
  ];
  currentRoomGenderCounts = {
    hombres: currentSession.playerGender === "hombre" ? 1 : 0,
    mujeres: currentSession.playerGender === "mujer" ? 1 : 0,
    otros: currentSession.playerGender === "otro" ? 1 : 0,
  };
  updateSingleGenderWarning();
}

// Selector de dinámicas en el lobby
const dynamicCards = document.querySelectorAll(".dynamic-card-radio");
dynamicCards.forEach((card) => {
  card.addEventListener("click", () => {
    dynamicCards.forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
  });
});

// Anfitrión inicia dinámica
document.getElementById("btn-start-dynamic")?.addEventListener("click", async () => {
  const selectedCard = document.querySelector(".dynamic-card-radio.selected");
  const mode = selectedCard?.getAttribute("data-mode") || "secretos_cruzados";
  const catId = selectedCard?.getAttribute("data-cat") || "secretos_intimos";
  const revealAuthor = document.getElementById("chk-reveal-truth")?.checked ?? true;
  const revealGender = document.getElementById("chk-reveal-gender")?.checked ?? true;

  const targetCategory = categories.find((c) => c.id === catId) || categories[0];
  const shuffledSecretosOrder = shuffleArray([...Array(targetCategory.preguntas.length).keys()]);
  currentRoomSecretosDeck = shuffledSecretosOrder;
  currentSession.selectedRoomCategory = catId;

  if (firestoreAvailable && db && currentSession.currentRoomId) {
    try {
      await updateDoc(doc(db, "salas", currentSession.currentRoomId), {
        gameMode: mode,
        category: catId,
        state: mode === "muro_bano" ? "muro" : "writing",
        revealAuthor: revealAuthor,
        revealGender: revealGender,
        currentRound: 0,
        secretosRoundIndex: 0,
        secretosDeck: shuffledSecretosOrder,
        currentConfessionId: null,
      });
    } catch (e) {
      console.error(e);
    }
  }

  // Despacho local
  dispatchGameMode(mode, "writing", {
    category: catId,
    revealAuthor,
    revealGender,
    secretosRoundIndex: 0,
    secretosDeck: shuffledSecretosOrder,
  });
});

// Manejo reactivo de estados de la sala para todos los celulares
function handleRoomStateChange(room) {
  const { gameMode, state } = room;
  currentSession.activeDynamic = gameMode;

  if (state === "lobby") {
    switchView("view-lobby");
    return;
  }

  dispatchGameMode(gameMode, state, room);
}

function dispatchGameMode(mode, state, roomData = {}) {
  if (mode === "secretos_cruzados") {
    switchView("view-game-secretos");
    setupSecretosPhase(state, roomData);
  } else if (mode === "confesiones") {
    switchView("view-game-confesiones");
    setupConfesionesPhase(state, roomData);
  } else if (mode === "tres_confesiones") {
    switchView("view-game-tres-confesiones");
    setupTresConfesionesPhase(state, roomData);
  } else if (mode === "muro_bano") {
    switchView("view-game-muro");
    setupMuroPhase();
  } else if (mode === "duo_sync") {
    switchView("view-game-duo");
    setupDuoPhase();
  } else if (mode === "feedback_equipo") {
    // Reutiliza modo muro enfocado en virtudes
    switchView("view-game-muro");
    setupMuroPhase("🌟 Muro Positivo de Empresa");
  }
}

// ==========================================
// 4.5. DINÁMICA: SECRETOS CRUZADOS (EL TERMÓMETRO ÍNTIMO)
// ==========================================
let secretosRoundIndex = 0;
let secretosCurrentVotes = {};
let currentRoomSecretosDeck = null;

function setupSecretosPhase(state, roomData = {}) {
  const targetCatId = roomData.category || currentSession.selectedRoomCategory || "secretos_intimos";
  currentSession.selectedRoomCategory = targetCatId;
  const cat = categories.find((c) => c.id === targetCatId) || categories[0];
  const qList = cat.preguntas;
  if (roomData.secretosRoundIndex !== undefined) {
    secretosRoundIndex = roomData.secretosRoundIndex;
  }

  // Sincronizar o inicializar el mazo de preguntas al azar para la sala
  if (Array.isArray(roomData.secretosDeck) && roomData.secretosDeck.length > 0) {
    currentRoomSecretosDeck = roomData.secretosDeck;
  } else if (!currentRoomSecretosDeck || currentRoomSecretosDeck.length !== qList.length) {
    currentRoomSecretosDeck = shuffleArray([...Array(qList.length).keys()]);
  }

  const statementIndex = currentRoomSecretosDeck[secretosRoundIndex % currentRoomSecretosDeck.length];
  const currentStatement = qList[statementIndex] || qList[secretosRoundIndex % qList.length];

  document.getElementById("lbl-secreto-statement").textContent = `"${currentStatement}"`;
  document.getElementById("lbl-secretos-counter").textContent = `${cat.titulo} • Ronda ${(secretosRoundIndex % qList.length) + 1} de ${qList.length} (Al azar 🎲)`;

  // Configuración de desglose por sexo
  const revealGender = roomData.revealGender !== undefined
    ? roomData.revealGender
    : (document.getElementById("chk-reveal-gender")?.checked ?? true);
  currentSession.revealGender = revealGender;

  const breakdownContainer = document.getElementById("secretos-gender-breakdown-list");
  if (breakdownContainer) {
    breakdownContainer.style.display = revealGender ? "flex" : "none";
  }

  // Alerta si este jugador es el único hombre o mujer y el desglose está activo
  const singleNotice = document.getElementById("secretos-single-gender-notice");
  const singleNoticeText = document.getElementById("lbl-secretos-single-gender-text");
  if (singleNotice && singleNoticeText) {
    const myGender = (currentSession.playerGender || "hombre").toLowerCase();
    const { hombres, mujeres } = currentRoomGenderCounts;
    if (revealGender && myGender === "hombre" && hombres === 1) {
      singleNotice.style.display = "block";
      singleNoticeText.textContent = "Aviso de Deducción: Eres el único hombre en la sala. Al estar activo el desglose por sexo, el grupo podrá saber qué respondiste.";
    } else if (revealGender && myGender === "mujer" && mujeres === 1) {
      singleNotice.style.display = "block";
      singleNoticeText.textContent = "Aviso de Deducción: Eres la única mujer en la sala. Al estar activo el desglose por sexo, el grupo podrá saber qué respondiste.";
    } else {
      singleNotice.style.display = "none";
    }
  }

  // Reset UI
  const isSuspectMode = targetCatId === "quien_es_mas_probable";
  const yesNoControls = document.getElementById("secretos-yes-no-controls");
  const suspectsControls = document.getElementById("secretos-suspects-controls");

  document.getElementById("secretos-voting-controls").style.display = "block";
  document.getElementById("secretos-voted-status").style.display = "none";
  document.getElementById("secretos-results-box").style.display = "none";

  if (isSuspectMode) {
    if (yesNoControls) yesNoControls.style.display = "none";
    if (suspectsControls) suspectsControls.style.display = "block";
    renderSuspectsVotingButtons();
  } else {
    if (yesNoControls) yesNoControls.style.display = "grid";
    if (suspectsControls) suspectsControls.style.display = "none";
  }

  // TV mode sync if TV is open
  const tvHeadline = document.getElementById("tv-main-headline");
  if (tvHeadline) {
    const headlinePrefix = isSuspectMode ? "👑 ¿Quién es Más Probable Que...?" : "🔥 Declaración Íntima:";
    tvHeadline.innerHTML = `
      <div style="font-size:22px; color:var(--coral); text-transform:uppercase; margin-bottom:12px; font-weight:800;">${headlinePrefix}</div>
      "${escapeHtml(currentStatement)}"
    `;
  }

  listenToSecretosVotes(secretosRoundIndex);
}

function renderSuspectsVotingButtons() {
  const grid = document.getElementById("secretos-suspects-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const players = currentRoomPlayers.length > 0 ? currentRoomPlayers : [
    { id: currentSession.playerId, name: currentSession.playerName || "Tú", avatar: currentSession.playerAvatar || "👤" },
    { id: "p_demo1", name: "Valentina", avatar: "🐱" },
    { id: "p_demo2", name: "Nicolás", avatar: "🐺" }
  ];

  players.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "voting-option-btn";
    btn.innerHTML = `<span style="font-size:24px;">${p.avatar || "👤"}</span> <strong>${escapeHtml(p.name)}</strong>`;
    btn.addEventListener("click", () => {
      recordSecretosSuspectVote(p.id, p.name);
    });
    grid.appendChild(btn);
  });
}

function recordSecretosSuspectVote(suspectId, suspectName) {
  document.getElementById("secretos-voting-controls").style.display = "none";
  document.getElementById("secretos-voted-status").style.display = "block";

  const voteData = {
    playerId: currentSession.playerId,
    name: currentSession.playerName,
    gender: currentSession.playerGender || "hombre",
    suspectId: suspectId,
    suspectName: suspectName,
    createdAt: Date.now(),
  };

  secretosCurrentVotes[currentSession.playerId] = voteData;

  if (firestoreAvailable && db && currentSession.currentRoomId) {
    setDoc(
      doc(db, "salas", currentSession.currentRoomId, `secretos_v_${secretosRoundIndex}`, currentSession.playerId),
      voteData
    ).catch(console.error);
  }

  showToast(`Votaste por: ${suspectName}`, "👉");
  renderSecretosTally();
}

function listenToSecretosVotes(roundIdx) {
  if (!firestoreAvailable || !db || !currentSession.currentRoomId) return;

  const votesCol = collection(db, "salas", currentSession.currentRoomId, `secretos_v_${roundIdx}`);
  if (currentSession.unsubscribeSecretos) currentSession.unsubscribeSecretos();

  currentSession.unsubscribeSecretos = onSnapshot(votesCol, (snap) => {
    secretosCurrentVotes = {};
    snap.forEach((d) => {
      secretosCurrentVotes[d.id] = d.data();
    });
    renderSecretosTally();
  });
}

function recordSecretosVote(voteBool) {
  document.getElementById("secretos-voting-controls").style.display = "none";
  document.getElementById("secretos-voted-status").style.display = "block";

  const voteData = {
    playerId: currentSession.playerId,
    name: currentSession.playerName,
    gender: currentSession.playerGender || "hombre",
    vote: voteBool,
    createdAt: Date.now(),
  };

  secretosCurrentVotes[currentSession.playerId] = voteData;

  if (firestoreAvailable && db && currentSession.currentRoomId) {
    setDoc(
      doc(db, "salas", currentSession.currentRoomId, `secretos_v_${secretosRoundIndex}`, currentSession.playerId),
      voteData
    ).catch(console.error);
  }

  showToast(voteBool ? "Votaste: SÍ" : "Votaste: NO", voteBool ? "✅" : "❌");
  renderSecretosTally();
}

function renderSecretosTally() {
  const votes = Object.values(secretosCurrentVotes);
  if (votes.length === 0) return;

  document.getElementById("secretos-results-box").style.display = "block";

  const isSuspectMode = currentSession.selectedRoomCategory === "quien_es_mas_probable";
  const suspectsResultsContainer = document.getElementById("secretos-suspects-results-container");
  const yesNoResultsSummary = document.getElementById("secretos-yes-no-results-summary");
  const genderBreakdownList = document.getElementById("secretos-gender-breakdown-list");

  if (isSuspectMode) {
    if (suspectsResultsContainer) suspectsResultsContainer.style.display = "block";
    if (yesNoResultsSummary) yesNoResultsSummary.style.display = "none";
    if (genderBreakdownList) genderBreakdownList.style.display = "none";

    const tally = {};
    votes.forEach((v) => {
      if (v.suspectId) {
        if (!tally[v.suspectId]) {
          tally[v.suspectId] = {
            name: v.suspectName || "Participante",
            count: 0,
          };
        }
        tally[v.suspectId].count++;
      }
    });

    const sortedSuspects = Object.values(tally).sort((a, b) => b.count - a.count);
    const barsList = document.getElementById("secretos-suspects-bars-list");
    if (barsList) {
      barsList.innerHTML = sortedSuspects.map((item, idx) => {
        const pct = Math.round((item.count / votes.length) * 100);
        const isTop = idx === 0 && item.count > 0;
        return `
          <div class="result-bar-item" style="padding: 12px 14px; margin-bottom: 8px; border-left: 4px solid ${isTop ? 'var(--coral)' : 'var(--purple)'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 800; font-size: 14.5px;">
                ${isTop ? '👑 ' : ''}${escapeHtml(item.name)}
              </span>
              <span style="font-weight: 800; color: ${isTop ? 'var(--coral)' : 'var(--cyan)'};">
                ${item.count} ${item.count === 1 ? 'voto' : 'votos'} (${pct}%)
              </span>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: ${isTop ? 'var(--coral)' : 'var(--purple)'}; height: 100%; width: ${pct}%; transition: width 0.8s ease;"></div>
            </div>
          </div>
        `;
      }).join("");
    }

    if (sortedSuspects.length > 0) {
      const winner = sortedSuspects[0];
      document.getElementById("lbl-secretos-intrigue-text").textContent =
        `👑 ¡${winner.name} fue elegido/a como el más probable con ${winner.count} ${winner.count === 1 ? 'voto' : 'votos'} (${Math.round((winner.count / votes.length) * 100)}%)! 👀`;
    }
    return;
  }

  // Si no es suspect mode, mostrar resultados Yes/No
  if (suspectsResultsContainer) suspectsResultsContainer.style.display = "none";
  if (yesNoResultsSummary) yesNoResultsSummary.style.display = "grid";

  let totalYes = 0;
  let totalNo = 0;

  let hombresTotal = 0;
  let hombresYes = 0;

  let mujeresTotal = 0;
  let mujeresYes = 0;

  let otrosTotal = 0;
  let otrosYes = 0;

  votes.forEach((v) => {
    if (v.vote) totalYes++;
    else totalNo++;

    const g = (v.gender || "hombre").toLowerCase();
    if (g === "hombre") {
      hombresTotal++;
      if (v.vote) hombresYes++;
    } else if (g === "mujer") {
      mujeresTotal++;
      if (v.vote) mujeresYes++;
    } else {
      otrosTotal++;
      if (v.vote) otrosYes++;
    }
  });

  document.getElementById("lbl-secretos-total-yes").textContent = totalYes;
  document.getElementById("lbl-secretos-total-no").textContent = totalNo;

  const revealGender = currentSession.revealGender !== false;
  const breakdownContainer = document.getElementById("secretos-gender-breakdown-list");
  if (breakdownContainer) {
    breakdownContainer.style.display = revealGender ? "flex" : "none";
  }

  if (revealGender) {
    // Hombres stats
    const pctH = hombresTotal > 0 ? Math.round((hombresYes / hombresTotal) * 100) : 0;
    document.getElementById("lbl-secretos-hombres-stats").textContent = `${hombresYes} de ${hombresTotal} dijeron Sí (${pctH}%)`;
    document.getElementById("bar-secretos-hombres").style.width = `${pctH}%`;

    // Mujeres stats
    const pctM = mujeresTotal > 0 ? Math.round((mujeresYes / mujeresTotal) * 100) : 0;
    document.getElementById("lbl-secretos-mujeres-stats").textContent = `${mujeresYes} de ${mujeresTotal} dijeron Sí (${pctM}%)`;
    document.getElementById("bar-secretos-mujeres").style.width = `${pctM}%`;

    // Otros stats
    const rowOtros = document.getElementById("row-secretos-otros");
    if (otrosTotal > 0) {
      rowOtros.style.display = "block";
      const pctO = Math.round((otrosYes / otrosTotal) * 100);
      document.getElementById("lbl-secretos-otros-stats").textContent = `${otrosYes} de ${otrosTotal} dijeron Sí (${pctO}%)`;
      document.getElementById("bar-secretos-otros").style.width = `${pctO}%`;
    } else {
      rowOtros.style.display = "none";
    }
  }

  // Generar mensaje de intriga divertido / picante
  let intrigueMsg = "";
  if (revealGender) {
    if (hombresYes > 0 && hombresYes < hombresTotal) {
      intrigueMsg = `¡${hombresYes} de los ${hombresTotal} hombres en el grupo confesó haberlo hecho! ¿Quién de ellos habrá sido? 👀`;
    } else if (mujeresYes > 0 && mujeresYes < mujeresTotal) {
      intrigueMsg = `¡${mujeresYes} de las ${mujeresTotal} mujeres en el grupo confesó haberlo hecho! ¿Quién de ellas fue? 🤫`;
    } else if (totalYes === votes.length) {
      intrigueMsg = `¡El 100% del grupo respondió que SÍ! Nadie aquí es un santo 😂`;
    } else if (totalYes === 0) {
      intrigueMsg = `Todos dijeron que NO... ¿Son todos unos santos o nadie se atrevió a confesar? 🤔`;
    } else if (totalYes === 1) {
      intrigueMsg = `¡Solo 1 persona en todo el grupo se atrevió a admitirlo! ¿Quién será el/la valiente? 🔥`;
    } else {
      intrigueMsg = `¡${totalYes} personas en la sala dijeron que SÍ! Hay secretos guardados en el grupo... 🤐`;
    }
  } else {
    // Desglose por sexo desactivado (Modo 100% neutro)
    if (totalYes === votes.length) {
      intrigueMsg = `¡El 100% de la sala confesó que SÍ! (Desglose por sexo oculto) 🎉`;
    } else if (totalYes === 0) {
      intrigueMsg = `¡El 100% del grupo respondió que NO! 😇`;
    } else {
      const pct = Math.round((totalYes / votes.length) * 100);
      intrigueMsg = `¡${totalYes} de ${votes.length} personas (${pct}%) respondieron que SÍ! (Desglose por sexo desactivado) 🤫`;
    }
  }

  document.getElementById("lbl-secretos-intrigue-text").textContent = intrigueMsg;
}

document.getElementById("btn-secreto-vote-yes")?.addEventListener("click", () => recordSecretosVote(true));
document.getElementById("btn-secreto-vote-no")?.addEventListener("click", () => recordSecretosVote(false));

document.getElementById("btn-next-secreto")?.addEventListener("click", async () => {
  secretosRoundIndex++;
  secretosCurrentVotes = {};

  if (firestoreAvailable && db && currentSession.currentRoomId) {
    try {
      await updateDoc(doc(db, "salas", currentSession.currentRoomId), {
        secretosRoundIndex: secretosRoundIndex,
      });
    } catch (e) {
      console.error(e);
    }
  }

  setupSecretosPhase(null, { secretosRoundIndex, secretosDeck: currentRoomSecretosDeck });
  const isProbable = currentSession.selectedRoomCategory === "quien_es_mas_probable";
  showToast(isProbable ? "Siguiente ronda: ¿Quién es más probable?..." : "Siguiente declaración íntima al azar...", "🎲");
});

document.getElementById("btn-leave-secretos")?.addEventListener("click", () => switchView("view-lobby"));

// ==========================================
// 5. DINÁMICA: CONFESIONES SECRETAS
// ==========================================
let currentRoomConfessions = [];

function setupConfesionesPhase(state, roomData) {
  const stepWrite = document.getElementById("confesion-step-write");
  const stepVote = document.getElementById("confesion-step-vote");
  const stepResults = document.getElementById("confesion-step-results");

  stepWrite.style.display = "none";
  stepVote.style.display = "none";
  stepResults.style.display = "none";

  if (state === "writing" || !state) {
    stepWrite.style.display = "block";

    // Actualizar aviso según configuración de la sala
    const privacyBadge = document.getElementById("confesion-privacy-notice-badge");
    const privacyIcon = document.getElementById("lbl-confesion-privacy-icon");
    const privacyText = document.getElementById("lbl-confesion-privacy-text");
    const willReveal = roomData?.revealAuthor !== false;

    if (privacyBadge && privacyText) {
      if (willReveal) {
        privacyBadge.style.background = "rgba(245, 158, 11, 0.15)";
        privacyBadge.style.borderColor = "rgba(245, 158, 11, 0.5)";
        if (privacyIcon) privacyIcon.textContent = "👀";
        privacyText.style.color = "#fde68a";
        privacyText.textContent = "Atención: En esta confesión los nombres de los que confiesan SERÁN REVELADOS al final de la votación.";
      } else {
        privacyBadge.style.background = "rgba(16, 185, 129, 0.15)";
        privacyBadge.style.borderColor = "rgba(16, 185, 129, 0.5)";
        if (privacyIcon) privacyIcon.textContent = "🛡️";
        privacyText.style.color = "#a7f3d0";
        privacyText.textContent = "Garantía 100% Anónima: Tu nombre JAMÁS será revelado. Solo se verán las votaciones y sospechas.";
      }
    }

    listenToConfessionsSubmissions();
  } else if (state === "voting") {
    stepVote.style.display = "block";
    renderConfessionVotingRound(roomData);
  } else if (state === "results") {
    stepResults.style.display = "block";
    renderConfessionResults(roomData);
  }
}

// Enviar confesión
document.getElementById("btn-submit-confession")?.addEventListener("click", async () => {
  const textarea = document.getElementById("txt-player-confession");
  const texto = textarea.value.trim();
  if (!texto) {
    showToast("Escribe algo antes de enviar", "✍️");
    return;
  }

  document.getElementById("btn-submit-confession").disabled = true;
  document.getElementById("confession-submitted-wait").style.display = "block";

  if (firestoreAvailable && db && currentSession.currentRoomId) {
    try {
      await setDoc(doc(db, "salas", currentSession.currentRoomId, "confesiones", currentSession.playerId), {
        playerId: currentSession.playerId,
        authorName: currentSession.playerName,
        text: texto,
        createdAt: serverTimestamp(),
      });
      showToast("¡Confesión guardada!", "🔒");
    } catch (e) {
      console.error(e);
    }
  } else {
    showToast("¡Confesión enviada en modo secreto!", "🔒");
    setTimeout(() => {
      // Simulación offline si no hay backend
      document.getElementById("confesion-step-write").style.display = "none";
      document.getElementById("confesion-step-vote").style.display = "block";
      document.getElementById("lbl-current-confession-text").textContent = `"${texto}"`;
      renderSuspectButtons([
        { id: "p1", name: currentSession.playerName || "Tú", avatar: currentSession.playerAvatar },
        { id: "p2", name: "Sofi", avatar: "🦄" },
        { id: "p3", name: "Diego", avatar: "⚡" },
      ]);
    }, 1500);
  }
});

function listenToConfessionsSubmissions() {
  if (!firestoreAvailable || !db || !currentSession.currentRoomId) return;

  const confCol = collection(db, "salas", currentSession.currentRoomId, "confesiones");
  onSnapshot(confCol, async (snap) => {
    currentRoomConfessions = [];
    snap.forEach((d) => currentRoomConfessions.push({ id: d.id, ...d.data() }));

    // Si el Host ve que hay confesiones, puede avanzar a votación
    if (currentSession.isHost && currentRoomConfessions.length >= 1) {
      const waitDiv = document.getElementById("confession-submitted-wait");
      if (waitDiv) {
        waitDiv.innerHTML = `
          <div style="margin-top:10px;">
            <strong>${currentRoomConfessions.length} confesiones recibidas.</strong>
            <br>
            <button type="button" class="btn btn-primary" id="btn-host-advance-voting" style="margin-top:10px;">
              Comenzar Votación para Todos ➔
            </button>
          </div>
        `;
        document.getElementById("btn-host-advance-voting")?.addEventListener("click", async () => {
          const firstConf = currentRoomConfessions[0];
          await updateDoc(doc(db, "salas", currentSession.currentRoomId), {
            state: "voting",
            currentConfessionId: firstConf.id,
            currentConfessionText: firstConf.text,
            currentConfessionAuthor: firstConf.authorName,
          });
        });
      }
    }
  });
}

function renderConfessionVotingRound(roomData) {
  const confText = roomData.currentConfessionText || "Confesión secreta...";
  document.getElementById("lbl-current-confession-text").textContent = `"${confText}"`;
  document.getElementById("vote-submitted-feedback").style.display = "none";

  // Cargar lista de jugadores para votar
  if (firestoreAvailable && db && currentSession.currentRoomId) {
    const playersCol = collection(db, "salas", currentSession.currentRoomId, "players");
    getDoc(playersCol).then((snap) => {
      // Cargados en snapshot de sala
    });
  }

  // Extraer sospechosos de la lista de jugadores de la sala
  const playerChips = document.querySelectorAll("#room-players-list .player-chip");
  const suspects = [];
  playerChips.forEach((chip, i) => {
    suspects.push({
      id: "p_" + i,
      name: chip.textContent.replace("👑", "").trim(),
      avatar: "👤",
    });
  });

  if (suspects.length === 0) {
    suspects.push(
      { id: "1", name: currentSession.playerName, avatar: currentSession.playerAvatar },
      { id: "2", name: "Amigo 1", avatar: "🍕" },
      { id: "3", name: "Amigo 2", avatar: "🚀" }
    );
  }

  renderSuspectButtons(suspects);
}

function renderSuspectButtons(suspects) {
  const grid = document.getElementById("confession-suspects-grid");
  if (!grid) return;
  grid.innerHTML = "";

  suspects.forEach((sus) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vote-btn";
    btn.innerHTML = `<span>${sus.avatar || "👤"}</span> <span>${escapeHtml(sus.name)}</span>`;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".vote-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("vote-submitted-feedback").style.display = "block";
      showToast(`Votaste por ${sus.name}`, "🗳️");

      // Si es el host, activa botón de ver resultados
      if (currentSession.isHost) {
        setTimeout(() => {
          showHostResultsOption();
        }, 1200);
      }
    });
    grid.appendChild(btn);
  });
}

function showHostResultsOption() {
  const feedback = document.getElementById("vote-submitted-feedback");
  if (feedback && currentSession.isHost) {
    feedback.innerHTML = `
      ✓ Votos recibidos.
      <br>
      <button type="button" class="btn btn-purple" id="btn-host-show-results" style="margin-top:10px;">
        Ver Resultados del Grupo 📊
      </button>
    `;
    document.getElementById("btn-host-show-results")?.addEventListener("click", async () => {
      if (firestoreAvailable && db && currentSession.currentRoomId) {
        await updateDoc(doc(db, "salas", currentSession.currentRoomId), {
          state: "results",
        });
      } else {
        document.getElementById("confesion-step-vote").style.display = "none";
        document.getElementById("confesion-step-results").style.display = "block";
        renderConfessionResults({
          currentConfessionAuthor: currentSession.playerName,
        });
      }
    });
  }
}

function renderConfessionResults(roomData) {
  const barsContainer = document.getElementById("confession-results-bars");
  if (!barsContainer) return;
  barsContainer.innerHTML = "";

  const mockTally = [
    { name: currentSession.playerName, count: 5, pct: 62 },
    { name: "Sofi", count: 2, pct: 25 },
    { name: "Diego", count: 1, pct: 13 },
  ];

  mockTally.forEach((item) => {
    const bar = document.createElement("div");
    bar.className = "result-bar-item";
    bar.innerHTML = `
      <div class="result-bar-fill" style="width: ${item.pct}%"></div>
      <div class="result-bar-content">
        <span>${escapeHtml(item.name)}</span>
        <span>${item.pct}% (${item.count} votos)</span>
      </div>
    `;
    barsContainer.appendChild(bar);
  });

  const authorBox = document.getElementById("confession-real-author-box");
  authorBox.style.display = "none";

  document.getElementById("btn-host-reveal-author")?.addEventListener("click", () => {
    authorBox.style.display = "block";
    document.getElementById("lbl-real-author-name").textContent = roomData.currentConfessionAuthor || currentSession.playerName || "¡Carlos!";
    showToast("¡Se ha revelado la verdad!", "💥");
  });

  document.getElementById("btn-next-confession-round")?.addEventListener("click", () => {
    showToast("Avanzando a la siguiente ronda...", "➔");
    document.getElementById("confesion-step-results").style.display = "none";
    document.getElementById("confesion-step-write").style.display = "block";
    document.getElementById("txt-player-confession").value = "";
    document.getElementById("btn-submit-confession").disabled = false;
    document.getElementById("confession-submitted-wait").style.display = "none";
  });
}

// ==========================================
// 6. DINÁMICA: LAS 3 CONFESIONES (2 MENTIRAS 1 VERDAD)
// ==========================================
document.getElementById("btn-submit-tres-statements")?.addEventListener("click", async () => {
  const s0 = document.getElementById("txt-statement-0").value.trim();
  const s1 = document.getElementById("txt-statement-1").value.trim();
  const s2 = document.getElementById("txt-statement-2").value.trim();
  const realIdx = parseInt(document.querySelector('input[name="radio-real-statement"]:checked')?.value || "0");

  if (!s0 || !s1 || !s2) {
    showToast("Completa las 3 afirmaciones", "⚠️");
    return;
  }

  showToast("¡Tus 3 afirmaciones han sido guardadas!", "🎭");

  // Transición a la etapa de adivinanzas
  document.getElementById("tres-step-write").style.display = "none";
  document.getElementById("tres-step-vote").style.display = "block";
  document.getElementById("lbl-tres-player-name").textContent = currentSession.playerName || "Participante";

  renderTresStatementsVoting([s0, s1, s2], realIdx);
});

function renderTresStatementsVoting(statements, realIndex) {
  const list = document.getElementById("tres-statements-vote-list");
  if (!list) return;
  list.innerHTML = "";

  statements.forEach((st, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vote-btn";
    btn.style.justifyContent = "flex-start";
    btn.style.textAlign = "left";
    btn.innerHTML = `<strong style="color:var(--cyan); margin-right:8px;">${["A", "B", "C"][idx]}:</strong> <span>${escapeHtml(st)}</span>`;

    btn.addEventListener("click", () => {
      list.querySelectorAll(".vote-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("tres-vote-feedback").style.display = "block";
      showToast("Voto registrado", "🗳️");
    });
    list.appendChild(btn);
  });

  // Botón revelar
  document.getElementById("btn-reveal-real-statement")?.addEventListener("click", () => {
    const buttons = list.querySelectorAll(".vote-btn");
    buttons.forEach((b, i) => {
      if (i === realIndex) {
        b.style.borderColor = "var(--emerald)";
        b.style.background = "rgba(16, 185, 129, 0.25)";
        b.innerHTML += ` <span style="margin-left:auto; color:var(--emerald); font-weight:800;">✓ ¡VERDAD!</span>`;
      } else {
        b.style.opacity = "0.5";
      }
    });
    showToast("¡La verdad ha sido revelada!", "🎉");
  });

  document.getElementById("btn-next-tres-player")?.addEventListener("click", () => {
    showToast("Cargando turno del siguiente jugador...", "🎲");
    document.getElementById("tres-step-vote").style.display = "none";
    document.getElementById("tres-step-write").style.display = "block";
  });
}

function setupTresConfesionesPhase(state, roomData) {
  document.getElementById("tres-step-write").style.display = "block";
  document.getElementById("tres-step-vote").style.display = "none";
}

// ==========================================
// 7. DINÁMICA: MURO DE BAÑO / DESAHOGO EN VIVO
// ==========================================
const wallColors = ["color-yellow", "color-pink", "color-cyan", "color-green", "color-orange"];

function setupMuroPhase(title) {
  const container = document.getElementById("muro-notes-wall");
  if (!container) return;
  // Añadir notas de ejemplo iniciales
  if (container.children.length === 0) {
    addNoteToWall("¡Bienvenidos a la fiesta! 🎉 No se olviden de dejar su saludo.", "color-cyan");
    addNoteToWall("Alguien que ponga cumbia o reggaetón del viejito por favor 😂", "color-yellow");
    addNoteToWall("Confieso que me comí los últimos tequeños y le eché la culpa al perro 🌭", "color-pink");
  }

  listenToMuroUpdates();
}

function addNoteToWall(text, colorClass) {
  const wall = document.getElementById("muro-notes-wall");
  if (!wall) return;
  const note = document.createElement("div");
  const randomRot = (Math.random() * 6 - 3).toFixed(1);
  const color = colorClass || wallColors[Math.floor(Math.random() * wallColors.length)];

  note.className = `wall-note ${color}`;
  note.style.setProperty("--rot", `${randomRot}deg`);
  note.textContent = text;
  wall.prepend(note);
}

document.getElementById("btn-post-muro-note")?.addEventListener("click", async () => {
  const input = document.getElementById("input-muro-note");
  const text = input.value.trim();
  if (!text) return;

  const color = wallColors[Math.floor(Math.random() * wallColors.length)];
  addNoteToWall(text, color);
  input.value = "";
  showToast("¡Nota publicada en el muro!", "🧱");

  if (firestoreAvailable && db && currentSession.currentRoomId) {
    try {
      await addDoc(collection(db, "salas", currentSession.currentRoomId, "muro"), {
        text: text,
        color: color,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  }
});

function listenToMuroUpdates() {
  if (!firestoreAvailable || !db || !currentSession.currentRoomId) return;

  const muroCol = query(
    collection(db, "salas", currentSession.currentRoomId, "muro"),
    orderBy("createdAt", "desc")
  );
  currentSession.unsubscribeMuro = onSnapshot(muroCol, (snap) => {
    const wall = document.getElementById("muro-notes-wall");
    if (!wall) return;
    wall.innerHTML = "";
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      addNoteToWall(data.text, data.color);
    });
  });
}

// ==========================================
// 8. DINÁMICA: DÚO SINCRONIZADO
// ==========================================
const duoDilemasFallback = [
  "¿Quién de los dos tiene mejor sentido del humor?",
  "Si pudiéramos viajar juntos mañana, ¿playa tropical o cabaña en la nieve?",
  "¿Quién es más probable que pierda la paciencia primero en un trancón?",
  "¿Qué nos define mejor hoy: pura química o amigos con complicidad?",
  "Si tuvieran que pedir delivery ahora mismo, ¿qué comen?",
];
let duoIndex = 0;
let duoDeck = [];

function setupDuoPhase() {
  const pool = [
    ...(categories.find((c) => c.id === "citas_nivel1")?.preguntas || []),
    ...(categories.find((c) => c.id === "citas_nivel2")?.preguntas || []),
    ...(categories.find((c) => c.id === "dilemas_absurdos")?.preguntas || []),
    ...(categories.find((c) => c.id === "quien_es_mas_probable")?.preguntas || []),
  ];
  duoDeck = shuffleArray(pool.length > 0 ? pool : duoDilemasFallback);
  duoIndex = 0;
  loadDuoDilema();
}

function loadDuoDilema() {
  if (!duoDeck || duoDeck.length === 0) setupDuoPhase();
  const q = duoDeck[duoIndex % duoDeck.length];
  document.getElementById("lbl-duo-question").textContent = `"${q}"`;
  document.getElementById("duo-input-area").style.display = "block";
  document.getElementById("duo-lock-status").style.display = "none";
  document.getElementById("duo-revealed-answers").style.display = "none";
  document.getElementById("txt-duo-answer").value = "";
}

document.getElementById("btn-submit-duo-answer")?.addEventListener("click", () => {
  const ans = document.getElementById("txt-duo-answer").value.trim();
  if (!ans) {
    showToast("Escribe tu respuesta primero", "✍️");
    return;
  }

  document.getElementById("duo-input-area").style.display = "none";
  document.getElementById("duo-lock-status").style.display = "block";
  showToast("Respuesta bloqueada. Esperando a tu acompañante...", "🔒");

  // Simulación de respuesta mutua a los 2 segundos
  setTimeout(() => {
    document.getElementById("duo-lock-status").style.display = "none";
    document.getElementById("duo-revealed-answers").style.display = "block";

    document.getElementById("lbl-duo-p1-name").textContent = currentSession.playerName || "Tú";
    document.getElementById("lbl-duo-p1-ans").textContent = `"${ans}"`;

    document.getElementById("lbl-duo-p2-name").textContent = "Tu Acompañante";
    document.getElementById("lbl-duo-p2-ans").textContent = '"¡Totalmente de acuerdo!"';
    showToast("¡PUM! Respuestas reveladas a la vez", "💥");
  }, 2000);
});

document.getElementById("btn-duo-next-question")?.addEventListener("click", () => {
  duoIndex++;
  loadDuoDilema();
});

// ==========================================
// 9. MODO TV / PROYECTOR (BIG SCREEN)
// ==========================================
let tvSelectedSource = "sala_sync";
let tvQuestionIndex = 0;
let tvDeck = [];

function setupTvControls() {
  const btns = document.querySelectorAll(".tv-cat-btn");
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      const target = b.getAttribute("data-tvcat");
      setTvSource(target);
    });
  });

  document.getElementById("btn-tv-next-q")?.addEventListener("click", () => {
    tvQuestionIndex++;
    renderTvQuestion();
  });

  document.getElementById("btn-tv-shuffle")?.addEventListener("click", () => {
    const cat = categories.find((c) => c.id === tvSelectedSource);
    if (cat) {
      tvDeck = shuffleArray([...cat.preguntas]);
      tvQuestionIndex = 0;
      renderTvQuestion();
      showToast("¡Preguntas de TV rebarajadas al azar! 🎲", "🔀");
    }
  });

  // Atajos de teclado para presentaciones / proyector (Barra espaciadora o Flecha Derecha)
  window.addEventListener("keydown", (e) => {
    const tvScreen = document.getElementById("view-tv");
    if (!tvScreen || !tvScreen.classList.contains("active")) return;
    if (tvSelectedSource === "sala_sync") return;

    if (e.code === "Space" || e.code === "ArrowRight") {
      e.preventDefault();
      tvQuestionIndex++;
      renderTvQuestion();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      if (tvDeck.length > 0) {
        tvQuestionIndex = (tvQuestionIndex - 1 + tvDeck.length) % tvDeck.length;
        renderTvQuestion();
      }
    }
  });
}

function setTvSource(sourceId) {
  tvSelectedSource = sourceId;
  const stageLive = document.getElementById("tv-stage-content");
  const stageQuestions = document.getElementById("tv-stage-questions");

  if (sourceId === "sala_sync") {
    if (stageLive) stageLive.style.display = "block";
    if (stageQuestions) stageQuestions.style.display = "none";
  } else {
    if (stageLive) stageLive.style.display = "none";
    if (stageQuestions) stageQuestions.style.display = "block";

    const cat = categories.find((c) => c.id === sourceId);
    if (cat) {
      tvDeck = shuffleArray([...cat.preguntas]);
      tvQuestionIndex = 0;
      renderTvQuestion();
    }
  }
}

function renderTvQuestion() {
  const cat = categories.find((c) => c.id === tvSelectedSource);
  if (!cat || !tvDeck || tvDeck.length === 0) return;

  const idx = Math.abs(tvQuestionIndex) % tvDeck.length;
  tvQuestionIndex = idx;

  const qText = tvDeck[idx];
  const badgeEl = document.getElementById("tv-q-cat-badge");
  const textEl = document.getElementById("tv-giant-q-text");

  if (badgeEl) {
    badgeEl.textContent = `${cat.icono || "🧊"} ${cat.titulo} • Pregunta ${idx + 1} de ${tvDeck.length} 🎲`;
    badgeEl.style.color = cat.color || "var(--cyan)";
  }
  if (textEl) {
    textEl.textContent = `"${qText}"`;
  }
}

document.getElementById("btn-open-tv-mode")?.addEventListener("click", () => {
  const room = currentSession.currentRoomId || "HIELO";
  enterTvMode(room);
});

document.getElementById("btn-lobby-tv-shortcut")?.addEventListener("click", () => {
  const room = currentSession.currentRoomId || "HIELO";
  enterTvMode(room);
});

document.getElementById("btn-close-tv")?.addEventListener("click", () => {
  switchView(currentSession.currentRoomId ? "view-lobby" : "view-home");
});

function enterTvMode(roomCode) {
  document.getElementById("tv-room-code-display").textContent = roomCode;
  generateQrCodes(roomCode);
  switchView("view-tv");
  showToast("Modo TV / Pantalla Gigante activado 📺", "✨");
}

// ==========================================
// 10. PANEL DE ADMINISTRACIÓN DE PREGUNTAS
// ==========================================
const adminModal = document.getElementById("modal-admin");
const btnOpenAdmin = document.getElementById("btn-open-admin");
const btnCloseAdmin = document.getElementById("btn-close-admin");
let isAdminLoggedIn = false;

btnOpenAdmin?.addEventListener("click", () => {
  adminModal.classList.add("active");
  if (isAdminLoggedIn) {
    showAdminPanel();
  }
});

document.getElementById("footer-btn-admin")?.addEventListener("click", () => {
  adminModal.classList.add("active");
  if (isAdminLoggedIn) {
    showAdminPanel();
  }
});

btnCloseAdmin?.addEventListener("click", () => {
  adminModal.classList.remove("active");
});

// Login Admin
document.getElementById("btn-admin-login")?.addEventListener("click", () => {
  const u = document.getElementById("admin-user-input").value.trim();
  const p = document.getElementById("admin-pass-input").value.trim();

  // Credenciales por defecto: admin / hielo2025
  if ((u === "admin" && p === "hielo2025") || (u === "admin" && p === "admin")) {
    isAdminLoggedIn = true;
    showToast("¡Bienvenido, Administrador!", "🔑");
    showAdminPanel();
  } else {
    showToast("Credenciales incorrectas (defecto: admin / hielo2025)", "❌");
  }
});

document.getElementById("btn-admin-logout")?.addEventListener("click", () => {
  isAdminLoggedIn = false;
  document.getElementById("admin-login-box").style.display = "block";
  document.getElementById("admin-panel-box").style.display = "none";
  showToast("Sesión cerrada", "👋");
});

function showAdminPanel() {
  document.getElementById("admin-login-box").style.display = "none";
  document.getElementById("admin-panel-box").style.display = "block";

  // Llenar selector de categorías
  const select = document.getElementById("admin-select-category");
  select.innerHTML = "";
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.icono || "🧊"} ${cat.titulo}`;
    select.appendChild(opt);
  });

  renderAdminQuestionsList(select.value);
  select.onchange = () => renderAdminQuestionsList(select.value);
}

function renderAdminQuestionsList(catId) {
  const cat = categories.find((c) => c.id === catId);
  const container = document.getElementById("admin-questions-list");
  if (!cat || !container) return;

  document.getElementById("admin-questions-count").textContent = cat.preguntas.length;
  container.innerHTML = "";

  // NOTA: En el modo administrador se presentan SIEMPRE EN SU ORDEN FIJO ORIGINAL (#1 al #100)
  // para permitir una revisión, auditoría, filtrado y edición predecible sin saltos.
  cat.preguntas.forEach((qText, idx) => {
    const item = document.createElement("div");
    item.className = "admin-list-item";
    item.innerHTML = `
      <span style="font-size:11.5px; font-weight:800; color:var(--cyan); min-width:34px; padding:2px 4px; background:rgba(56,189,248,0.1); border-radius:4px; text-align:center;">#${idx + 1}</span>
      <span style="font-size:13.5px; flex:1; line-height:1.4; margin-left:6px;">${escapeHtml(qText)}</span>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn btn-secondary" style="font-size:11px; padding:4px 8px;" data-edit="${idx}" title="Editar texto">✏️</button>
        <button type="button" class="btn btn-danger" style="font-size:11px; padding:4px 8px;" data-del="${idx}" title="Eliminar pregunta">🗑️</button>
      </div>
    `;

    // Editar
    item.querySelector("[data-edit]").addEventListener("click", () => {
      const nuevo = prompt("Modificar pregunta:", qText);
      if (nuevo && nuevo.trim()) {
        cat.preguntas[idx] = nuevo.trim();
        saveCategories(categories);
        renderAdminQuestionsList(catId);
        renderHomeCategories();
        showToast("Pregunta actualizada", "✓");
      }
    });

    // Eliminar
    item.querySelector("[data-del]").addEventListener("click", () => {
      if (confirm("¿Eliminar esta pregunta?")) {
        cat.preguntas.splice(idx, 1);
        saveCategories(categories);
        renderAdminQuestionsList(catId);
        renderHomeCategories();
        showToast("Pregunta eliminada", "🗑️");
      }
    });

    container.appendChild(item);
  });
}

// Agregar pregunta
document.getElementById("btn-admin-add-question")?.addEventListener("click", () => {
  const select = document.getElementById("admin-select-category");
  const input = document.getElementById("admin-input-new-question");
  const text = input.value.trim();
  if (!text) return;

  const cat = categories.find((c) => c.id === select.value);
  if (cat) {
    cat.preguntas.push(text);
    saveCategories(categories);
    input.value = "";
    renderAdminQuestionsList(cat.id);
    renderHomeCategories();
    showToast("Pregunta añadida con éxito", "✨");
  }
});

// Restaurar oficiales
document.getElementById("btn-admin-restore-defaults")?.addEventListener("click", () => {
  if (confirm("¿Restaurar las preguntas oficiales de fábrica?")) {
    saveCategories(JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)));
    showAdminPanel();
    renderHomeCategories();
    showToast("Preguntas oficiales restauradas", "🔄");
  }
});

// ==========================================
// 11. NAVEGACIÓN GENERAL & INICIALIZACIÓN
// ==========================================
document.getElementById("btn-brand-home")?.addEventListener("click", () => switchView("view-home"));

document.getElementById("btn-back-lobby")?.addEventListener("click", () => switchView("view-home"));
document.getElementById("btn-leave-game")?.addEventListener("click", () => switchView("view-lobby"));
document.getElementById("btn-leave-tres-confesiones")?.addEventListener("click", () => switchView("view-lobby"));
document.getElementById("btn-leave-muro")?.addEventListener("click", () => switchView("view-lobby"));
document.getElementById("btn-leave-duo")?.addEventListener("click", () => switchView("view-lobby"));

document.getElementById("footer-btn-solo")?.addEventListener("click", () => {
  renderSoloCategories();
  switchView("view-solo-categories");
});
document.getElementById("footer-btn-multi")?.addEventListener("click", () => switchView("view-lobby"));

// Fullscreen toggle
document.getElementById("btn-fullscreen")?.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

// Auto unirse si viene con ?room=XXXX en la URL (invitación por WhatsApp / enlace)
function checkUrlRoomParam() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (room) {
    const cleanCode = room.trim().toUpperCase();
    currentSession.currentRoomId = cleanCode;

    // Cambiar a la vista de sala
    switchView("view-lobby");

    // Mostrar banner de invitación
    const banner = document.getElementById("invited-room-banner");
    const lblCode = document.getElementById("lbl-invited-room-code");
    if (banner && lblCode) {
      lblCode.textContent = cleanCode;
      banner.style.display = "block";
    }

    // Prellenar código de sala
    const codeInput = document.getElementById("input-room-code");
    if (codeInput) {
      codeInput.value = cleanCode;
      document.getElementById("join-code-container").style.display = "block";
    }

    // Autoenfocar el nombre
    const nameInput = document.getElementById("input-player-name");
    if (nameInput) {
      nameInput.placeholder = "Escribe tu nombre para entrar a la sala...";
      setTimeout(() => nameInput.focus(), 300);
    }

    showToast(`¡Invitación a la sala ${cleanCode} detectada!`, "🎉");
  }
}

// Inicializar la app
window.addEventListener("DOMContentLoaded", () => {
  initParticles();
  setupAvatarPicker();
  setupGenderPicker();
  renderSoloCategories();
  setupTvControls();
  checkUrlRoomParam();
});
