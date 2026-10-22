// locale.js - Jerga chilena solo para Chile; en el resto, español neutro.
// La región se detecta por la zona horaria y el idioma del navegador, y se puede cambiar a mano
// desde el pie de la página (queda guardada en el celular).

const CHILE_TIMEZONES = ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"];

function readOverride() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("region");
    if (fromUrl === "cl" || fromUrl === "neutral") return fromUrl;
    return localStorage.getItem("rh_region");
  } catch {
    return null;
  }
}

function detectChile() {
  const override = readOverride();
  if (override === "cl") return true;
  if (override === "neutral") return false;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (CHILE_TIMEZONES.includes(tz)) return true;
  } catch {}
  const langs = navigator.languages || [navigator.language || ""];
  return langs.some((l) => /^es-CL$/i.test(l));
}

export const IS_CHILE = detectChile();

export function setRegion(region) {
  try { localStorage.setItem("rh_region", region); } catch {}
}

// Texto según la región: tr("¡Jugar al tiro!", "¡Jugar ahora!")
export function tr(chile, neutral) {
  return IS_CHILE ? chile : neutral;
}

// Reemplazos de jerga chilena a español neutro. Van de lo más específico a lo más general
// (por ejemplo "de la pega" antes que "la pega") y cuidan el género del artículo.
const NEUTRAL_RULES = [
  [/\bal tiro\b/g, "de inmediato"],
  [/\bAl tiro\b/g, "De inmediato"],
  [/\bde la pega\b/g, "del trabajo"],
  [/\bla pega\b/g, "el trabajo"],
  [/\b(tu|mi|su) pega\b/g, "$1 trabajo"],
  [/\bpololo o polola\b/g, "novio o novia"],
  [/\bpolola o pololo\b/g, "novia o novio"],
  [/\bpololos\b/g, "novios"],
  [/\bpololas\b/g, "novias"],
  [/\bpololo\b/g, "novio"],
  [/\bpolola\b/g, "novia"],
  [/\bpololeos\b/g, "noviazgos"],
  [/\bpololeo\b/g, "noviazgo"],
  [/\bun carrete\b/g, "una fiesta"],
  [/\bUn carrete\b/g, "Una fiesta"],
  [/\bdel carrete\b/g, "de la fiesta"],
  [/\bel carrete\b/g, "la fiesta"],
  [/\bcarretes\b/g, "fiestas"],
  [/\bCarretes\b/g, "Fiestas"],
  [/\bcarrete\b/g, "fiesta"],
  [/\bCarrete\b/g, "Fiesta"],
  [/\bcon copete fuerte encima\b/g, "con varios tragos encima"],
  [/\bcon copete\b/g, "con unos tragos"],
  [/\bcopetes\b/g, "tragos"],
  [/\bcopete\b/g, "trago"],
  [/\ba la micro\b/g, "al autobús"],
  [/\bde la micro\b/g, "del autobús"],
  [/\bla micro\b/g, "el autobús"],
  [/\ben polera\b/g, "en camiseta"],
  [/\bpolera\b/g, "camiseta"],
  [/\bmás mandad([oa]) por\b/g, "más dominad$1 por"],
  [/\bel más mandado\b/g, "el más dominado"],
  [/\bJuntas de\b/g, "Reuniones de"],
  [/\bJunta de\b/g, "Reunión de"],
  [/\bjuntas con\b/g, "reuniones con"],
  [/\b(una|la|esta|tu) junta\b/g, "$1 reunión"],
  [/\bjunta solo de\b/g, "reunión solo de"],
  [/\bjunta (de|con|aburrida)\b/g, "reunión $1"],
  [/\bte pillaron\b/g, "te descubrieron"],
  [/\bpillaron\b/g, "descubrieron"],
  [/\bpillad([oa])/g, "descubiert$1"],
];

// Convierte jerga chilena a neutro (fuera de Chile); en Chile devuelve el texto tal cual
export function localize(text) {
  if (IS_CHILE || !text) return text;
  let out = String(text);
  for (const [re, rep] of NEUTRAL_RULES) out = out.replace(re, rep);
  return out;
}

// Recorre el HTML fijo de una página (no el contenido que escriben los jugadores) y lo neutraliza
export function localizeStaticDom(root = document.body) {
  if (IS_CHILE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const next = localize(n.nodeValue);
    if (next !== n.nodeValue) n.nodeValue = next;
  });
  root.querySelectorAll("[placeholder], [title], [aria-label]").forEach((el) => {
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      const v = el.getAttribute(attr);
      if (v) el.setAttribute(attr, localize(v));
    });
  });
  document.title = localize(document.title);
}
