// persona-data.js - Dinámica "Para cada persona": cada jugador le dedica algo a cada uno de los demás
// y después se revisa persona por persona, sin saber quién escribió qué.

export const PERSONA_VARIANTS = [
  {
    key: "carteles",
    icon: "🏷️",
    title: "Carteles",
    desc: "Recibes un cartel para cada persona y decides a quién le va mejor cada uno.",
    instructions: "Asigna un cartel distinto a cada persona. Puedes cambiarlos hasta que presiones Finalizar.",
    revealTitle: "Sus carteles",
  },
  {
    key: "profesion",
    icon: "💼",
    title: "Profesión alternativa",
    desc: "¿A qué se dedicaría cada uno en otra vida? Con su porqué.",
    instructions: "Escribe una profesión alternativa para cada persona y por qué se la das.",
    fieldA: { label: "Profesión", placeholder: "Ej: Chef, detective, DJ..." },
    fieldB: { label: "¿Por qué?", placeholder: "Porque siempre..." },
    suggest: true,
    revealTitle: "En otra vida sería...",
  },
  {
    key: "aprender",
    icon: "📚",
    title: "Algo que me gustaría aprender de ti",
    desc: "Qué admiras de cada uno y te gustaría aprenderle.",
    instructions: "Escribe algo que te gustaría aprender de cada persona.",
    fieldA: { label: "Me gustaría aprender de ti...", placeholder: "Ej: Cómo mantienes la calma con los clientes", long: true },
    revealTitle: "Lo que le quieren aprender",
  },
  {
    key: "regalo",
    icon: "🎁",
    title: "Un regalo imaginario",
    desc: "Algo no material para cada uno, con su motivo.",
    instructions: "Elige un regalo imaginario (no material) para cada persona y cuenta por qué.",
    fieldA: { label: "Te regalo...", placeholder: "Ej: Una semana en la playa" },
    fieldB: { label: "¿Por qué?", placeholder: "Porque trabajas demasiado" },
    revealTitle: "Sus regalos",
  },
  {
    key: "gracias",
    icon: "💌",
    title: "Agradecimientos",
    desc: "Palabras de agradecimiento para cada uno.",
    instructions: "Escribe algo que le quieras agradecer a cada persona.",
    fieldA: { label: "Gracias por...", placeholder: "Ej: Ayudarme con el proyecto cuando estaba colapsado/a", long: true },
    revealTitle: "Le agradecen",
  },
];

// Positivos y divertidos (broma cariñosa) se mezclan al repartir
export const CARTELES = [
  "💖 Amoroso/a", "🧸 Tierno/a", "😊 Simpático/a", "🤝 Colaborador/a", "🎩 Educado/a", "🎁 Generoso/a",
  "🦁 Líder natural", "🧘 Paciente", "🔒 Confiable", "✌️ Buena onda", "🗂️ Ordenado/a", "🎨 Creativo/a",
  "👂 El/la que escucha", "📣 Motivador/a", "🛠️ Resuelve todo", "🌟 Alma del equipo", "☀️ Optimista",
  "💎 Honesto/a", "📋 Responsable", "😄 Divertido/a", "🫶 Empático/a", "🔍 Detallista", "🦸 Valiente",
  "🐕 Leal", "🧠 Mente brillante", "🐜 Trabajador/a", "🌱 Humilde", "✨ Carismático/a", "🙌 Solidario/a",
  "👀 Atento/a", "🚀 Proactivo/a", "🌊 Tranquilo/a", "🗣️ Sincero/a", "🎉 Alegre", "🤗 Comprensivo/a",
  "🙋 Siempre ayuda", "🔋 Contagia buena energía", "💪 Pone el hombro", "🦉 Da los mejores consejos",
  "🤣 Hace reír a todos", "🏃 Nunca se rinde", "🫀 Corazón de oro", "⏰ Siempre puntual", "📚 Sabe de todo un poco",
  "🍪 Siempre tiene un snack", "☕ Funciona a base de café", "🎧 Siempre con audífonos",
  "📻 Habla más que la radio", "🧭 El/la más despistado/a", "📸 Foto para todo", "🎶 Canta sin darse cuenta",
  "🍕 Nunca dice que no a la comida", "🛋️ Experto/a en siestas", "🐢 Sin apuro por la vida", "⚡ Pilas infinitas",
  "🤓 Tiene un dato para todo", "🤹 Hace mil cosas a la vez", "😂 Se ríe de sus propios chistes",
  "📦 Guarda todo \"por si acaso\"", "🌮 Siempre sabe dónde comer rico", "🗺️ Organiza los panoramas",
];

export const PROFESIONES = [
  "Chef", "Detective privado", "DJ", "Astronauta", "Domador/a de leones", "Guía turístico", "Youtuber",
  "Mago/a", "Piloto de avión", "Actor o actriz de teleserie", "Arqueólogo/a", "Bombero/a", "Sommelier",
  "Futbolista", "Cantante de karaoke profesional", "Influencer de viajes", "Profesor/a de yoga", "Espía",
  "Veterinario/a", "Presidente/a", "Barista", "Diseñador/a de moda", "Comediante", "Surfista",
  "Paleontólogo/a", "Locutor/a de radio", "Organizador/a de matrimonios", "Crítico/a gastronómico/a",
  "Coach motivacional", "Capitán/a de crucero", "Jardinero/a", "Streamer de videojuegos", "Bailarín/a",
  "Científico/a loco/a", "Tarotista", "Escritor/a de novelas románticas", "Instructor/a de zumba", "Pastelero/a",
];
