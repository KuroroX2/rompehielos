import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const categoriasCol = collection(db, "categorias");
const categoriasListEl = document.getElementById("categorias-list");
const toastEl = document.getElementById("toast");

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2500);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Estado local de qué tarjetas están abiertas, para no perder el estado al re-renderizar.
const openCategorias = new Set();
const openSubcategorias = new Set();

// ---------- Nueva categoría ----------
document.getElementById("form-nueva-categoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("input-nueva-categoria");
  const nombre = input.value.trim();
  if (!nombre) return;
  try {
    await addDoc(categoriasCol, { nombre, creadoEn: serverTimestamp() });
    input.value = "";
    toast("Categoría agregada");
  } catch (err) {
    console.error(err);
    toast("No se pudo agregar: " + err.message);
  }
});

// ---------- Render de categorías (nivel 1) ----------
onSnapshot(query(categoriasCol, orderBy("creadoEn", "asc")), (snap) => {
  if (snap.empty) {
    categoriasListEl.innerHTML = `<p class="empty">Todavía no hay categorías. ¡Agrega la primera! 👆</p>`;
    return;
  }

  categoriasListEl.innerHTML = "";
  snap.forEach((catDoc) => {
    const cat = catDoc.data();
    const catId = catDoc.id;

    const card = document.createElement("div");
    card.className = "categoria-card" + (openCategorias.has(catId) ? " open" : "");
    card.innerHTML = `
      <div class="categoria-header">
        <span class="chevron">▶</span>
        <h2 class="cat-nombre">${escapeHtml(cat.nombre)}</h2>
        <div class="categoria-actions">
          <button type="button" class="ghost small btn-edit-cat">Editar</button>
          <button type="button" class="danger small btn-del-cat">Eliminar</button>
        </div>
      </div>
      <div class="categoria-body">
        <form class="inline-form form-nueva-sub">
          <input type="text" placeholder="Nueva subcategoría (ej: Gustos, Valores...)" maxlength="60" required>
          <button type="submit">+ Agregar</button>
        </form>
        <div class="subcategorias-list"></div>
      </div>
    `;

    const header = card.querySelector(".categoria-header");
    header.addEventListener("click", (e) => {
      if (e.target.closest(".categoria-actions")) return;
      card.classList.toggle("open");
      if (card.classList.contains("open")) openCategorias.add(catId);
      else openCategorias.delete(catId);
    });

    card.querySelector(".btn-edit-cat").addEventListener("click", async () => {
      const nuevo = promptInline(card.querySelector(".cat-nombre"), cat.nombre);
      if (nuevo === null) return;
      try {
        await updateDoc(doc(db, "categorias", catId), { nombre: nuevo });
        toast("Categoría actualizada");
      } catch (err) {
        toast("Error al editar: " + err.message);
      }
    });

    card.querySelector(".btn-del-cat").addEventListener("click", async () => {
      if (!confirm(`¿Borrar la categoría "${cat.nombre}" y todo lo que contiene?`)) return;
      try {
        await deleteDoc(doc(db, "categorias", catId));
        toast("Categoría eliminada");
      } catch (err) {
        toast("Error al borrar: " + err.message);
      }
    });

    card.querySelector(".form-nueva-sub").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = e.target.querySelector("input");
      const nombre = input.value.trim();
      if (!nombre) return;
      openCategorias.add(catId);
      card.classList.add("open");
      try {
        await addDoc(collection(db, "categorias", catId, "subcategorias"), {
          nombre,
          creadoEn: serverTimestamp(),
        });
        input.value = "";
      } catch (err) {
        toast("Error al agregar: " + err.message);
      }
    });

    categoriasListEl.appendChild(card);
    renderSubcategorias(catId, card.querySelector(".subcategorias-list"));
  });
});

// ---------- Render de subcategorías (nivel 2) ----------
function renderSubcategorias(catId, containerEl) {
  const subCol = collection(db, "categorias", catId, "subcategorias");
  onSnapshot(query(subCol, orderBy("creadoEn", "asc")), (snap) => {
    if (snap.empty) {
      containerEl.innerHTML = `<p class="empty">Sin subcategorías todavía.</p>`;
      return;
    }
    containerEl.innerHTML = "";
    snap.forEach((subDoc) => {
      const sub = subDoc.data();
      const subId = subDoc.id;
      const key = catId + "/" + subId;

      const card = document.createElement("div");
      card.className = "subcategoria-card" + (openSubcategorias.has(key) ? " open" : "");
      card.innerHTML = `
        <div class="subcategoria-header">
          <span class="chevron">▶</span>
          <h3 class="sub-nombre">${escapeHtml(sub.nombre)}</h3>
          <div class="subcategoria-actions">
            <button type="button" class="ghost small btn-edit-sub">Editar</button>
            <button type="button" class="danger small btn-del-sub">Eliminar</button>
          </div>
        </div>
        <div class="subcategoria-body">
          <form class="inline-form form-nueva-pregunta">
            <input type="text" placeholder="Nueva pregunta..." maxlength="500" required>
            <button type="submit">+ Agregar</button>
          </form>
          <div class="preguntas-list"></div>
        </div>
      `;

      const header = card.querySelector(".subcategoria-header");
      header.addEventListener("click", (e) => {
        if (e.target.closest(".subcategoria-actions")) return;
        card.classList.toggle("open");
        if (card.classList.contains("open")) openSubcategorias.add(key);
        else openSubcategorias.delete(key);
      });

      card.querySelector(".btn-edit-sub").addEventListener("click", async () => {
        const nuevo = promptInline(card.querySelector(".sub-nombre"), sub.nombre);
        if (nuevo === null) return;
        try {
          await updateDoc(doc(db, "categorias", catId, "subcategorias", subId), { nombre: nuevo });
          toast("Subcategoría actualizada");
        } catch (err) {
          toast("Error al editar: " + err.message);
        }
      });

      card.querySelector(".btn-del-sub").addEventListener("click", async () => {
        if (!confirm(`¿Borrar la subcategoría "${sub.nombre}" y sus preguntas?`)) return;
        try {
          await deleteDoc(doc(db, "categorias", catId, "subcategorias", subId));
          toast("Subcategoría eliminada");
        } catch (err) {
          toast("Error al borrar: " + err.message);
        }
      });

      card.querySelector(".form-nueva-pregunta").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = e.target.querySelector("input");
        const texto = input.value.trim();
        if (!texto) return;
        openSubcategorias.add(key);
        card.classList.add("open");
        try {
          await addDoc(collection(db, "categorias", catId, "subcategorias", subId, "preguntas"), {
            texto,
            creadoEn: serverTimestamp(),
          });
          input.value = "";
        } catch (err) {
          toast("Error al agregar: " + err.message);
        }
      });

      containerEl.appendChild(card);
      renderPreguntas(catId, subId, card.querySelector(".preguntas-list"));
    });
  });
}

// ---------- Render de preguntas (nivel 3) ----------
function renderPreguntas(catId, subId, containerEl) {
  const qCol = collection(db, "categorias", catId, "subcategorias", subId, "preguntas");
  onSnapshot(query(qCol, orderBy("creadoEn", "asc")), (snap) => {
    if (snap.empty) {
      containerEl.innerHTML = `<p class="empty">Sin preguntas todavía.</p>`;
      return;
    }
    containerEl.innerHTML = "";
    snap.forEach((qDoc) => {
      const preg = qDoc.data();
      const qId = qDoc.id;

      const item = document.createElement("div");
      item.className = "pregunta-item";
      item.innerHTML = `
        <p class="preg-texto">${escapeHtml(preg.texto)}</p>
        <div class="pregunta-actions">
          <button type="button" class="ghost small btn-edit-preg">Editar</button>
          <button type="button" class="danger small btn-del-preg">Eliminar</button>
        </div>
      `;

      item.querySelector(".btn-edit-preg").addEventListener("click", async () => {
        const nuevo = promptInline(item.querySelector(".preg-texto"), preg.texto, true);
        if (nuevo === null) return;
        try {
          await updateDoc(
            doc(db, "categorias", catId, "subcategorias", subId, "preguntas", qId),
            { texto: nuevo }
          );
          toast("Pregunta actualizada");
        } catch (err) {
          toast("Error al editar: " + err.message);
        }
      });

      item.querySelector(".btn-del-preg").addEventListener("click", async () => {
        if (!confirm("¿Borrar esta pregunta?")) return;
        try {
          await deleteDoc(doc(db, "categorias", catId, "subcategorias", subId, "preguntas", qId));
          toast("Pregunta eliminada");
        } catch (err) {
          toast("Error al borrar: " + err.message);
        }
      });

      containerEl.appendChild(item);
    });
  });
}

// ---------- Helper: edición inline sin usar prompt() nativo feo ----------
// Reemplaza temporalmente el elemento de texto por un <input>, y devuelve
// (vía Promise síncrona simulada con confirm/valor) el nuevo valor o null si se cancela.
function promptInline(displayEl, valorActual) {
  const nuevo = window.prompt("Editar:", valorActual);
  if (nuevo === null) return null;
  const limpio = nuevo.trim();
  if (!limpio || limpio === valorActual) return null;
  return limpio;
}
