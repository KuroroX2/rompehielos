# Design

## Escena

Un grupo en un bar o un living con poca luz, de noche, el celular en una mano y un vaso en la otra; la app tiene que leerse de un vistazo y no encandilar. Por eso: **mesa oscura de noche helada, cartas de color sólido encima**.

## Concepto: cartas de juego

- Cada pregunta es una **carta**: fondo de color sólido, texto oscuro (o claro en cartas oscuras), un marco interior fino como naipe impreso y la temática en la esquina.
- **Cada temática tiene su color** (su "mazo"). En el +18 el color lo pone el **nivel** (verde → rojo) y la carta siempre muestra número y nombre del nivel.
- Todo lo que no es carta (botones, estados, listas) es mesa: superficies oscuras y planas, sin vidrio, brillos, degradados ni partículas.

## Color (OKLCH)

Estrategia: **mesa restringida + mazos de color**. El único acento de interfaz es el **hielo** (celeste); los mazos usan la familia fría (celestes, aguas, menta, lavanda); los colores de los mazos solo viven en las cartas.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `oklch(0.17 0.012 235)` | Mesa (fondo) |
| `--surface` / `--surface-2` | `0.215` / `0.26` | Paneles y controles |
| `--line` | `oklch(0.34 0.015 235)` | Bordes |
| `--ink` / `--ink-muted` / `--ink-dim` | `0.97` / `0.80` / `0.68` | Texto (todo ≥ 4.5:1 sobre superficies) |
| `--hielo` | `oklch(0.82 0.12 222)` | Acción principal, selección, turno. Texto oscuro encima |
| `--ok` / `--warn` / `--bad` | verde / mostaza / rojo | Listo, avisos, peligro |

Mazos (`[data-deck]`): citas 1 celeste claro, citas 2 agua, citas 3 azul profundo (texto claro), dilemas menta, carrete turquesa, trabajo azul acero, quién es más probable lavanda, junta de hombres cobalto, junta de mujeres lila, confesiones violeta, +18 rojo. Niveles +18: `lvl-1` verde, `lvl-2` lima, `lvl-3` ámbar, `lvl-4` naranjo, `lvl-5` rojo intenso (texto claro).

## Tipografía

- **Young Serif** (display): preguntas en las cartas, títulos, marca. Da la sensación de carta impresa.
- **Onest** (interfaz): botones, estados, formularios. 400–800.
- Pregunta: `clamp(22px, 5.6vw, 32px)`, interlineado 1.3, `text-wrap: balance`.

## Formas y movimiento

- Cartas: radio 22px, marco interior a 8px, sombra neutra (sin color).
- Botones: altura mínima 48px (44px los pequeños), radio 14px.
- Movimiento: ease-out exponencial (`cubic-bezier(0.25, 1, 0.5, 1)`), sin rebotes. La carta "se reparte" al cambiar de pregunta (desliza y se endereza). Con `prefers-reduced-motion` todo pasa a un fundido o instantáneo.
- Emojis: solo como "palo" de la carta (ícono de temática) y en estados con significado; nunca en botones de acción.
