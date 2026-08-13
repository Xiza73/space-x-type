# Sistema de diseño — SPACE x TYPE

Extraído del prototipo de referencia (`design/`, **no versionado**). Esta es la fuente de
verdad del estilo: si el prototipo se pierde, esto queda.

Estética: **arcade neón / retro-futurista**. Fondo casi negro azulado, cromo metálico en los
títulos, y tres acentos de neón. Nada de pasteles, nada de flat claro.

## Paleta

Se define **una sola vez** como variables de tema de Tailwind 4 (`@theme`). Nunca se
hardcodea un hex en un componente.

### Superficies

| Token | Hex | Uso |
|---|---|---|
| `bg-base` | `#0b0b12` | Fondo raíz |
| `bg-grad` | `#101018` → `#0b0b12` (55%) → `#141420` | Gradiente de pantalla completa |
| `surface` | `#1c1c2a` → `#13131d` | Tarjetas y paneles (gradiente vertical) |
| `surface-sunken` | `#15151f` | Inputs, filas de ranking |
| `surface-track` | `#191924` → `#101018` | Riel de la barra de timing |
| `tile-idle` | `#232336` → `#15151f` | Casilla de secuencia sin completar |

### Bordes

| Token | Hex | Uso |
|---|---|---|
| `border` | `#3a3d56` | Por defecto |
| `border-card` | `#33364e` | Paneles |
| `border-muted` | `#2c2f45` | Inactivo, vida gastada |

### Texto

| Token | Hex | Uso |
|---|---|---|
| `text` | `#e8eaf6` | Principal |
| `text-secondary` | `#aab0cf` | Descripciones |
| `text-muted` | `#8b8fae` | Labels en mayúscula con tracking |

### Acentos — cada uno significa algo

**No son intercambiables.** El color comunica estado; usarlos al azar rompe la lectura del
juego a velocidad.

| Token | Hex | Significa |
|---|---|---|
| `magenta` | `#ff2e88` | Acción primaria, combo, vidas, `GREAT`. Variantes: `#ff5aa5` (claro), `#d61a77` / `#c1156b` (oscuro) |
| `cyan` | `#29e5ff` | Selección, multiplicador, puntaje, `GOOD`, links |
| `gold` | `#ffd23e` | **El centro de la zona y `PERFECT`.** Es el color de "presiona aquí". Variantes: `#ffe27a`, `#ffc21e` |
| `red` | `#ff4d6d` | `MISS` |
| `purple` | `#8b5cff` | `BAD` y el fondo psicodélico |

Los cinco escalones usan **gold · magenta · cyan · purple · red** en el texto de feedback y
en el panel de resultados.

## El riel: brillo, no color

El riel **no** usa esos cinco colores. Se pinta con un único degradado horizontal que va de
`flare` (casi blanco) en el centro a `cyan` transparente en los bordes de `BAD`. Los stops
son las constantes de `TIMING`.

| Token | Hex | Uso |
|---|---|---|
| `flare` | `#e8fbff` | Núcleo de la zona de acierto en el riel |

La información va en la **luminancia**, no en el matiz, y eso es deliberado:

- El ojo lee brillo mucho más rápido que color. En un juego que se juega a velocidad, eso
  es la diferencia entre llegar y no llegar.
- Un jugador daltónico distingue perfectamente claro de oscuro. Con un degradado de matices
  no distinguía nada.
- Con cuatro ventanas anidadas, pintar cada una de su color las convierte en una torta de
  capas que no comunica nada.

El brillo cae de forma **monótona** desde el centro hasta el borde de `BAD`. No hay marcas
de borde: la rampa misma señala dónde está el centro.

## La escalera de dificultad

En modo canción, arriba del riel va una escalera de un escalón por cada largo posible de
secuencia (`SONG.minKeys` a `SONG.maxKeys`). Alturas crecientes de izquierda a derecha; se
prenden los alcanzados y el actual brilla.

**No lleva texto, y es a propósito.** Un `TECLAS 6` da el número, pero el número no es el
dato: lo que el jugador necesita percibir de un vistazo es *dónde está en la curva* —si
viene subiendo, si está cerca del techo, si acaba de reiniciar—. La forma ascendente indica
"esto se pone más difícil" sin una palabra, y la cantidad exacta ya está a la vista en las
casillas.

## Dónde va cada cosa

Esta es la regla que ordena el HUD:

> **Lo que usas para decidir va cerca de donde miras. Lo que usas para saber cómo vas puede
> estar lejos.**

Durante la partida los ojos van de las casillas al marcador. La escalera de dificultad vive
ahí, entre las dos. El puntaje, el combo y el tiempo van arriba: son contexto, no
información de acción.

## Tipografía

| Fuente | Pesos | Uso |
|---|---|---|
| **Bungee** | único | Títulos, números grandes (score, combo, mult), glifos de secuencia, botones de acción |
| **Chakra Petch** | 400 / 600 / 700 | Todo el resto de la UI |

Labels chicos: `11–12px`, `700`, **mayúscula**, `letter-spacing: 3–6px`, color `text-muted`.
Ese tracking ancho es firma del estilo — no lo saques.

## Efectos característicos

**Texto cromado** (títulos, score) — gradiente vertical con `background-clip:text` y
`color:transparent`. El título grande suma `titleshine` (5s lineal infinito) moviendo el
`background-position`, y `drop-shadow` magenta abajo + cyan arriba para el borde neón.

**Glow neón** — `text-shadow` / `box-shadow` con el acento a `.4–.6` alpha. Los números
importantes brillan; el texto normal no.

**Scanlines** — `repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 7px)`
sobre todo, con `pointer-events:none`.

**Viñeta** — `radial-gradient` elíptico azulado al 42% de altura.

**Fondo de luces reactivas** — un campo de blobs que se prenden con lo que suena. Reemplaza
al fondo psicodélico del prototipo **y** al plan de poner el video de YouTube de fondo.

Se alimenta de un `AnalyserNode` colgado de la salida maestra, en tres bandas —graves,
medios, agudos—. Tres y no treinta: el fondo comunica *sonó algo, y de qué tipo*, no dibuja
un ecualizador. Cada luz tiene **ataque instantáneo y caída lenta**, así marca el golpe y se
apaga sola; con caída rápida el fondo tiembla y marea, con caída lenta es una mancha fija.

Las posiciones se sortean **una vez por partida** y no por frame: el pedido era que las luces
se prendan en lugares aleatorios, no que se muevan. El sorteo va con semilla, no con
`Math.random`, para que un test pueda fijarlo.

Cada luz es un sprite de gradiente radial pre-renderizado una sola vez y dibujado con
`globalCompositeOperation = 'lighter'`. **Nada de filtros CSS.** Armar el gradiente por luz y
por frame es exactamente lo que vuelve lento a este efecto.

> ✅ **Medido con el gameplay corriendo**, que es lo que esta regla venía pidiendo desde el
> principio. A 1280×720 con 14 luces: el render completo pasa de **0.152 ms a 0.245 ms** por
> frame. El fondo cuesta **0.093 ms**, o sea el 0.6% del presupuesto de 16.67 ms a 60fps.
>
> El contraste del riel **no se mueve**: 105 puntos de luminancia entre el centro de la zona
> y el borde, idéntico con el fondo apagado, en silencio, a medio volumen y a full. El riel
> se dibuja con rellenos opacos encima, así que el fondo queda tapado debajo. El fondo
> respira entre 16.8 y 39.4 de luminancia media según lo que suene.
>
> Aun así **es apagable** desde el menú (`FONDO: LUCES / LISO`). Es lo único que dibuja de
> más por frame. El fondo nunca le gana al loop de juego.

El fondo psicodélico original usaba `filter: blur(34px) contrast(18)` sobre el contenedor
—ese par es lo que produce el efecto *metaball* de lámpara de lava; separados no hacen nada—
más un `hue-rotate` de 40s. Queda documentado porque es lindo, pero **no se construyó**: era
un blur a pantalla completa animándose bajo un juego de 60fps, y las luces dan un efecto
comparable por dos órdenes de magnitud menos.

## Geometría y movimiento

- Radios: `8px` (chips) · `9–10px` (botones) · `12–14px` (paneles, riel).
- Casilla de secuencia: **círculo** de `66px` de diámetro, con gradiente radial cuyo foco
  está arriba a la izquierda —un gradiente centrado se ve plano por más colores que le
  pongas—, anillo de `3px` y un arco de reflejo en la mitad superior.
- Las flechas se dibujan con uniones y puntas redondeadas, contorno grueso primero y
  relleno encima: eso les da el aire de sticker. El polígono crudo se veía duro y de otro
  juego.
- Riel de timing: `min(720px, 86vw) × 48px`.
- Transiciones de UI: `.12–.15s`. Feedback (`fbpop`): `.7s ease-out`.
- La zona dorada pulsa (`zonepulse`, 1s) — es lo único que late en pantalla. Que siga así.

## Reglas

- Tokens en `@theme` de Tailwind 4. **Cero hex sueltos en componentes.**
- El **canvas del gameplay** lee los colores del mismo módulo de tokens que la UI. Dos
  paletas que se desincronizan es un bug garantizado.
- Fuentes **embebidas localmente**, no desde Google Fonts: la app es de escritorio y tiene
  que funcionar sin internet. La CSP no permite orígenes remotos.
- Los estados del juego (`PERFECT` / `GOOD` / `MISS`) no se distinguen **solo** por color:
  también cambian el texto. Un jugador daltónico tiene que poder jugar.
