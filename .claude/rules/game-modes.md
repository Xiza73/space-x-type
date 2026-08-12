# Modos de juego y reglas de gameplay

## Dos ejes ortogonales, no una lista de modos

El prototipo de referencia deja clara una separación que hay que respetar en el código: lo
que el jugador tipea y de dónde sale el ritmo son **decisiones independientes**.

| | **Arcade** | **Canción simulada** | **Canción real** |
|---|---|---|---|
| **Flechas** | ✅ el del prototipo | ✅ | ✅ |
| **Palabras** | ✅ | ✅ | ✅ |

- **Eje 1 — tipo de secuencia:** `arrows` (↑↓←→) · `words` (es/en).
- **Eje 2 — fuente del ritmo:** `arcade` · `song` simulada (chiptune, velocidad elegida) ·
  `song` real (beatmap de la biblioteca).

Son **2×3 = 6 combinaciones**. Concretamente: el generador de secuencias no sabe de dónde
viene el ritmo, y el proveedor de ritmo no sabe qué se tipea. Si alguna vez tenés un
`if (mode === 'arcade')` dentro del generador de secuencias, los ejes se te mezclaron.

## Cómo se reparten las responsabilidades

El motor (`engine.ts`) **no implementa ninguno de los dos ejes**. Recibe la secuencia y la
duración de la ronda **como datos** en `startRound`, y no sabe de dónde salieron.

| Quién | Qué decide |
|---|---|
| `sequence.ts` (eje 1) | Qué se tipea, dado **cuántas teclas** le piden |
| `rhythm.ts` (eje 2) | Cuánto dura la ronda, cuántas teclas, cuánto dura la partida |
| `loop.ts` | Los junta: le pide el largo al ritmo y se lo pasa a la secuencia |
| `engine.ts` | Timing, scoring, vidas. Nada de progresión |

> Este reparto no estuvo bien desde el principio. `startRound` calculaba la duración con la
> fórmula de arcade adentro, o sea que el motor tenía metido el eje 2. Con un solo modo no
> se notaba. Si aparece otra fuente de ritmo y hay que tocar `engine.ts`, algo se filtró.

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
nivel               nivel = 1 + floor(rondas jugadas / 4)
progreso            p = tiempo transcurrido / dur        ∈ [0, 1]

PERFECT             0.795 <= p <= 0.885
GREAT               0.755 <= p <= 0.925
GOOD                0.720 <= p <= 0.960
BAD                 0.670 <= p <= 0.985
MISS                cualquier otro caso, o p >= 1

multiplicador       mult = 1 + floor(combo / 5)
score               PERFECT 150 · GREAT 100 · GOOD 60 · BAD 20   (× mult)

vidas iniciales     3        (configurable 1–9)
bpm                 132      (configurable 100–170, paso 2)
speedScale          1.0      (configurable 0.6–1.6, paso 0.1)
```

**Todas estas constantes viven en UN módulo.** Números mágicos desparramados en el código
son la razón por la que después nadie se anima a calibrar el juego.

### Las ventanas están anidadas

`bad ⊃ good ⊃ great ⊃ perfect`, todas centradas en `0.84`. `judge` prueba de la más chica a
la más grande. Si alguien rompe el anidado, `judge` empieza a saltear escalones y el
degradado del riel deja de tener sentido — hay un test que lo impide.

### Qué hace cada escalón

| | Puntos | Combo | Vida | Espera después |
|---|---|---|---|---|
| `perfect` · `great` · `good` | sí | mantiene | — | pausa normal |
| `bad` | 20 | **corta** | — | pausa normal |
| `miss` | 0 | corta | **−1** | pausa **+ una ronda entera** |

**`bad` es el escalón que hace falta explicar.** Sumás algo y no perdés vida, pero se te
corta el combo. Sin eso sería un `good` flojo y no tendría razón de existir; con eso, es el
aviso de que estás al borde **antes** de empezar a perder vidas. Un `miss` que llega sin
advertencia se siente injusto.

### La progresión cuenta rondas, no aciertos

Tres rondas suben un escalón **se ganen o no**: tres aciertos o dos aciertos y un fallo dan
lo mismo. Si contara aciertos, al jugador que falla se le congelaría la dificultad justo
cuando necesita que la partida avance, y una mala racha lo dejaría estancado en el piso.

### Un `miss` cuesta una ronda de espera

Después de fallar, la ronda siguiente no arranca hasta pasada una ronda entera. Sin eso,
machacar espacio encadena fallos y se comen las tres vidas sin ninguna chance de reaccionar
—el fallo se vuelve autoinfligido y el juego se siente roto—.

### Reglas de input

- Tecla **incorrecta** → la secuencia se reinicia (`idx = 0`), suena un error. **No se pierde
  vida.** El castigo es el tiempo perdido, que ya es suficiente.
- Se confirma con **ESPACIO o ENTER**, las dos valen (`CONFIRM_KEYS`). En palabras las manos
  están sobre las letras y estirarse hasta la barra rompe el tipeo; ENTER queda al lado del
  meñique. En flechas pasa lo mismo al revés.
- **Confirmar con la secuencia incompleta** → `MISS` directo.
- Cada tecla correcta sube de tono (`440 * 1.12^i`): da feedback de progreso sin mirar.

### Progresión

La barra se acelera **cada 4 aciertos**, con piso de 1500ms. El largo de la secuencia no se
mueve. Una sola palanca de dificultad por modo: acá es la velocidad.

## Modo Canción

**El tempo lo pone la canción.** Por eso la barra no puede acelerar: si acelera, se va del
beat y se pierde lo único que hace que un juego de ritmo sea un juego de ritmo.

Consecuencia directa: **el modelo de dificultad de arcade no se traslada acá.** La velocidad
es fija y la única palanca es **cuántas teclas** tiene la secuencia.

```
teclas       min + (floor(rondas / roundsPerKeyStep) mod (max - min + 1))
             piso 3 · techo 8 · sube cada 3 rondas jugadas
partida      dura un tiempo fijo
vidas        NINGUNA — `config.lives = null`
velocidad    fija; en la simulada la elige el jugador, en la real la pone el beatmap
```

**En canción no hay vidas.** No es un descuido: cortar la partida a la mitad por fallar es
sacar al jugador de la canción, que es exactamente lo contrario de lo que hace el género.
Se falla, se pierde combo y puntaje, y se sigue hasta el final.

La curva es un **diente de sierra**: sube de a una tecla hasta el techo y vuelve al piso.
Volver al piso es deliberado — da respiro y hace que la partida se sienta como una canción
con estrofas y estribillo, no como una rampa que no termina más.

### Canción simulada

Misma mecánica, pero con el chiptune en vez de una canción descargada. Existe para poder
construir y calibrar el modo canción **sin depender del pipeline de audio**, que es la parte
más cara del proyecto. Cuando llegue el beatmap real, reemplaza a `songRhythm` y nada más
cambia.

### El largo de la palabra ES la dificultad

En modo canción, una palabra de 8 letras no es un caso raro: es el nivel 8. Por eso las
listas de `data/words/` cubren **todas** las longitudes entre el piso y el techo, y se elige
por longitud, no al azar. Un hueco en la lista es un escalón que el juego se saltea.

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
