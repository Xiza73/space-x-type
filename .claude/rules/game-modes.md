# Modos de juego y reglas de gameplay

## Dos ejes ortogonales, no una lista de modos

El prototipo de referencia deja clara una separación que hay que respetar en el código: lo
que el jugador tipea y de dónde sale el ritmo son **decisiones independientes**.

| | **Arcade** (procedural) | **Canción** (biblioteca) |
|---|---|---|
| **Flechas** | ✅ modo 1 — el del prototipo | ✅ |
| **Palabras** | ✅ | ✅ |

- **Eje 1 — tipo de secuencia:** `arrows` (↑↓←→) · `words` (es/en).
- **Eje 2 — fuente del ritmo:** `arcade` (chiptune generado, acelera por nivel, vidas) ·
  `song` (beatmap de una canción de la biblioteca).

Son **2×2 = 4 combinaciones**, y las cuatro entran en el MVP. Concretamente: el generador de
secuencias no sabe de dónde viene el ritmo, y el proveedor de ritmo no sabe qué se tipea.
Si alguna vez tenés un `if (mode === 'arcade')` dentro del generador de secuencias, los ejes
se te mezclaron — separalos de nuevo.

## Modo Arcade — el primero a construir

Sin canción, sin descarga, sin biblioteca. **Es el modo que valida toda la mecánica.**
Por eso va primero: si el timing no se siente bien acá, no lo va a salvar ningún beatmap.

Música: chiptune generado con osciladores de Web Audio (kick, hi-hat, línea de bajo,
adornos pentatónicos) a BPM fijo. Cero assets, cero descargas.

### Ciclo de ronda

1. Se muestra una secuencia (5 flechas, o una palabra).
2. El marcador recorre el riel de izquierda a derecha en `dur`.
3. El jugador tipea la secuencia completa.
4. Con la secuencia completa, presiona **ESPACIO** dentro de la zona.
5. Se resuelve: `perfect` / `good` / `miss`. Pausa de ~700ms. Siguiente ronda.

### Constantes (del prototipo — punto de partida, se calibran jugando)

```
duración de ronda   dur = max(1500, (4200 - (nivel - 1) * 350) * speedScale)   [ms]
nivel               nivel = 1 + floor(aciertos / 4)
progreso            p = tiempo transcurrido / dur        ∈ [0, 1]

PERFECT             |p - 0.84| <= 0.045
GOOD                0.72 <= p <= 0.96
MISS                cualquier otro caso, o p >= 1

multiplicador       mult = 1 + floor(combo / 5)
score PERFECT       150 * mult
score GOOD          60  * mult
MISS                combo = 0, vidas - 1

vidas iniciales     3        (configurable 1–9)
bpm                 132      (configurable 100–170, paso 2)
speedScale          1.0      (configurable 0.6–1.6, paso 0.1)
```

**Todas estas constantes viven en UN módulo.** Números mágicos desparramados en el código
son la razón por la que después nadie se anima a calibrar el juego.

### Reglas de input

- Tecla **incorrecta** → la secuencia se reinicia (`idx = 0`), suena un error. **No se pierde
  vida.** El castigo es el tiempo perdido, que ya es suficiente.
- **ESPACIO con la secuencia incompleta** → `MISS` directo.
- Cada tecla correcta sube de tono (`440 * 1.12^i`): da feedback de progreso sin mirar.

### Progresión

La barra se acelera **cada 4 aciertos**, con piso de 1500ms. La aceleración es el único
mecanismo de dificultad: no cambia la longitud de la secuencia ni las ventanas de timing.
Mantenelo así — una sola variable de dificultad es legible para el jugador.

## Modo Canción

Mismo ciclo de ronda, pero el ritmo y el tempo salen del **beatmap** de una canción de la
biblioteca, no de una fórmula. La partida dura lo que dura la canción, no hasta perder las
vidas.

## Reloj — vale para los dos modos

El prototipo usa `performance.now()`. **En el proyecto no.** El reloj maestro es siempre
`audioContext.currentTime`:

- En modo canción es **obligatorio**: cualquier otro reloj deriva respecto del audio y
  desincroniza la partida.
- En modo arcade es **gratis y mejor**: la música procedural ya se agenda sobre el reloj de
  audio, así que usar el mismo reloj para la barra los deja en la misma base de tiempo.

Un solo reloj para los dos modos = un solo código de timing que testear.

**El scheduler de audio usa lookahead**: un `setInterval` de ~30ms que agenda eventos ~120ms
en el futuro con `currentTime`. No se agenda desde `setTimeout` directo — el timer del
navegador no tiene la precisión necesaria. Es el patrón estándar de Web Audio; no lo
"simplifiques".

## Propiedad deliberada del modo arcade

En arcade, **la barra y la música NO están sincronizadas**: la barra dura según el nivel, la
música corre a BPM fijo. Coexisten sin alinearse, y está bien — el jugador sigue la barra,
no el beat. **No es un bug.** Si alguien lo "arregla", la curva de dificultad desaparece.

## Ranking local

Top 5 por puntaje, con nombre de hasta 10 caracteres, persistido localmente. Va al mismo
almacenamiento que la biblioteca (directorio de datos de la app), **no a `localStorage`**:
el prototipo usa `localStorage` porque corre en una página suelta; en la app de escritorio
el estado del jugador vive junto a la biblioteca.

## Accesibilidad mínima

- El estado de una jugada se comunica por **texto + color**, nunca solo por color.
- Reasignación de teclas queda fuera del MVP, pero el input se lee de un mapa, no con
  comparaciones de strings desparramadas. Cambiarlo después tiene que ser barato.
