// question-types.js - Decide cómo se juega cada pregunta en una sala.
//   suspect -> todos votan por una persona de la sala ("¿Quién es más probable...?")
//   choice  -> dos opciones A / B ("¿Preferirías X o Y?")
//   yesno   -> Sí / No ("He hecho...", "¿Alguna vez...?", "¿Aceptarías...?")
//   open    -> no se vota: se sortea a alguien para que responda en voz alta

const WORD = "[^\\p{L}]";
const INTERROGATIVE = new RegExp(
  `(^|${WORD})(qué|cuál|cuáles|quién|quiénes|cómo|dónde|cuándo|cuánto|cuánta|cuántos|cuántas|por qué)(?=${WORD}|$)`,
  "iu"
);
const GROUP_REFERENCE = /(grupo|nosotros|aquí|presentes|esta sala|este equipo|del equipo)/i;

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

export function classifyGroupQuestion(text, categoryId = "") {
  const t = (text || "").trim();
  const segment = lastQuestionSegment(t);
  const lowerSegment = segment.toLowerCase();

  if (categoryId === "quien_es_mas_probable") return { type: "suspect" };
  // "¿Quién de nosotros...?" / "¿Quién es el más...?" apuntan a alguien de la sala;
  // "¿quién sería y qué harías?" (un famoso cualquiera) no.
  if (/^(a\s+)?quién(es)?(\s|$)/i.test(lowerSegment)) {
    if (GROUP_REFERENCE.test(t) || /^quién (es (el|la|más)|de\s)/i.test(lowerSegment)) return { type: "suspect" };
  }
  if (/^(qué|cuál)\s+(colega|persona|compañero|compañera)\b/i.test(lowerSegment)) return { type: "suspect" };

  // Afirmaciones en primera persona (Secretos Íntimos): "He besado...", "Tengo un fetiche..."
  if (!t.includes("¿") && /^(he|me he|tengo|soy)\s/i.test(t)) {
    return { type: "yesno", labels: ["🙋 Yo sí", "🙅 Yo no"] };
  }

  const options = parseChoiceOptions(segment);
  if (options) return { type: "choice", options };

  if (!INTERROGATIVE.test(segment) && !/\s+o\s+/i.test(segment)) {
    if (/^(alguna vez|has\s)/i.test(lowerSegment)) {
      return { type: "yesno", labels: ["🙋 Sí, me pasó", "🙅 Nunca"] };
    }
    return { type: "yesno", labels: ["👍 Sí", "👎 No"] };
  }

  return { type: "open" };
}

// Para el modo 1 Celular: "Elección" agrupa las preguntas de A vs B
export function isChoiceQuestion(text) {
  if (classifyGroupQuestion(text).type === "choice") return true;
  const segment = lastQuestionSegment((text || "").trim()).toLowerCase();
  return /\s+o\s+/.test(segment) && /^(eres|prefieres|te gusta|qué prefieres)/.test(segment);
}
