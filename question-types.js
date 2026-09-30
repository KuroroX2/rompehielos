// question-types.js - Decide cómo se juega cada pregunta en una sala.
//   suspect    -> todos votan por una persona de la sala ("¿Quién es más probable...?")
//   choice     -> elegir una opción ("¿Preferirías X o Y?", "[A | B | C]", formato Gusto)
//   yesno      -> Sí / No ("He hecho...", "¿Alguna vez...?", formato Confesión)
//   experience -> Lo he hecho / No, pero me gustaría / No y no me interesa (formato Experiencia)
//   open       -> no se vota: se sortea a alguien para que responda en voz alta
//
// Una pregunta puede ser un texto o un objeto { t, fmt, lvl, tema, opts } (las del +18).

const WORD = "[^\\p{L}]";
const INTERROGATIVE = new RegExp(
  `(^|${WORD})(qué|cuál|cuáles|quién|quiénes|cómo|dónde|cuándo|cuánto|cuánta|cuántos|cuántas|por qué)(?=${WORD}|$)`,
  "iu"
);
const GROUP_REFERENCE = /(grupo|nosotros|aquí|presentes|esta sala|este equipo|del equipo)/i;

export const EXPERIENCE_OPTIONS = ["✅ Lo he hecho", "😏 No, pero me gustaría", "🙅 No y no me interesa"];
export const CONFESSION_LABELS = ["🙋 Me ha pasado", "🙅 Nunca"];

export const FORMAT_LABELS = {
  exp: "🔥 Experiencia",
  conf: "🙊 Confesión",
  gusto: "💭 Gusto",
};

// Último tramo interrogativo: en "Si pasara X, ¿lo harías?" devuelve "lo harías"
function lastQuestionSegment(text) {
  const start = text.lastIndexOf("¿");
  const segment = start >= 0 ? text.slice(start + 1) : text;
  return segment.replace(/\?+\s*$/, "").trim();
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function parseChoiceOptions(segment) {
  const match = segment.match(/^(qué\s+)?(preferirías|prefieres)\s+(.+)$/i);
  if (!match) return null;
  const parts = match[3].split(/\s+o\s+/i);
  if (parts.length !== 2) return null;
  return parts.map((p) => capitalize(p.trim().replace(/[.,;:]+$/, "")));
}

// Opciones explícitas al final de la pregunta: "¿Qué miras primero? [Ojos | Sonrisa | Manos]"
const EXPLICIT_OPTIONS = /\s*\[([^\]]+)\]\s*$/;

function rawText(q) {
  return typeof q === "string" ? q : q?.t || "";
}

// Texto que se muestra en pantalla, sin la lista de opciones entre corchetes
export function questionText(q) {
  return rawText(q).replace(EXPLICIT_OPTIONS, "").trim();
}

// Id estable de una pregunta: el que trae el objeto o un hash de su texto
export function questionId(categoryId, q) {
  if (q && typeof q === "object" && q.id) return q.id;
  const text = rawText(q);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${categoryId}_${(hash >>> 0).toString(36)}`;
}

export function classifyGroupQuestion(q, categoryId = "") {
  if (q && typeof q === "object" && q.fmt) {
    if (q.fmt === "exp") return { type: "experience", options: EXPERIENCE_OPTIONS };
    if (q.fmt === "conf") return { type: "yesno", labels: CONFESSION_LABELS };
    if (q.fmt === "gusto" && Array.isArray(q.opts) && q.opts.length >= 2) return { type: "choice", options: q.opts };
  }

  const text = rawText(q);
  const explicit = text.match(EXPLICIT_OPTIONS);
  if (explicit) {
    const options = explicit[1].split("|").map((o) => o.trim()).filter(Boolean);
    if (options.length >= 2) return { type: "choice", options };
  }

  const t = text.trim();
  const segment = lastQuestionSegment(t);
  const lowerSegment = segment.toLowerCase();

  if (categoryId === "quien_es_mas_probable") return { type: "suspect" };
  // "¿Quién de nosotros...?" / "¿Quién es el más...?" apuntan a alguien de la sala;
  // "¿quién sería y qué harías?" (un famoso cualquiera) no.
  if (/^(a\s+)?quién(es)?(\s|$)/i.test(lowerSegment)) {
    if (GROUP_REFERENCE.test(t) || /^quién (es (el|la|más)|de\s)/i.test(lowerSegment)) return { type: "suspect" };
  }
  if (/^(qué|cuál)\s+(colega|persona|compañero|compañera)\b/i.test(lowerSegment)) return { type: "suspect" };

  // Afirmaciones en primera persona: "He besado...", "Tengo un fetiche..."
  if (!t.includes("¿") && /^(he|me he|tengo|soy)\s/i.test(t)) {
    return { type: "yesno", labels: ["🙋 Yo sí", "🙅 Yo no"] };
  }

  // "¿Alguna vez...?" es Sí/No aunque mencione alternativas ("tu sueldo, tu altura o tu auto")
  if (/^(alguna vez|has\s)/i.test(lowerSegment)) {
    return { type: "yesno", labels: ["🙋 Sí, me pasó", "🙅 Nunca"] };
  }

  const options = parseChoiceOptions(segment);
  if (options) return { type: "choice", options };

  if (!INTERROGATIVE.test(segment) && !/\s+o\s+/i.test(segment)) {
    return { type: "yesno", labels: ["👍 Sí", "👎 No"] };
  }

  return { type: "open" };
}

// Para el modo 1 Celular: "Elección" agrupa las preguntas de A vs B
export function isChoiceQuestion(q) {
  if (classifyGroupQuestion(q).type === "choice") return true;
  const segment = lastQuestionSegment(rawText(q).trim()).toLowerCase();
  return /\s+o\s+/.test(segment) && /^(eres|prefieres|te gusta|qué prefieres)/.test(segment);
}
