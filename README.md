<div align="center">

<img src="docs/capturas/logo.png" alt="SPACE x TYPE" width="180">

# SPACE x TYPE

**Juego de ritmo y mecanografía para escritorio.**
Una barra cruza la pantalla, tipeás la secuencia, y confirmás en el momento justo.

[![CI](https://github.com/Xiza73/space-x-type/actions/workflows/ci.yml/badge.svg)](https://github.com/Xiza73/space-x-type/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Xiza73/space-x-type?display_name=tag)](https://github.com/Xiza73/space-x-type/releases)

</div>

---

![Gameplay](docs/capturas/gameplay-arcade.png)

## Qué es

Inspirado en la mecánica de **Audition**: una barra avanza a velocidad constante y sobre ella
aparece una secuencia que hay que tipear **antes** de confirmar con la barra espaciadora,
dentro de la ventana de timing correcta.

Sin baile, sin avatares, sin social. Entrás y jugás.

La "x" del nombre se lee como cruce, porque es literalmente lo que hace el juego:

|  | **Arcade** | **Canción simulada** | **Canción real** |
|---|:---:|:---:|:---:|
| **Flechas** ↑↓←→ | ✅ | ✅ | ✅ |
| **Palabras** (es/en) | ✅ | ✅ | ✅ |

**Qué se tipea** y **de dónde sale el ritmo** son ejes independientes. Seis combinaciones.

- **Arcade** — sin canción. Música chiptune generada con osciladores, vidas, y la barra que se
  acelera cada cuatro aciertos.
- **Canción** — el tempo lo pone la canción, y el tempo **es** la velocidad: la barra cruza un
  compás de 4/4. No hay vidas: se falla, se pierde combo, y se sigue hasta el final. Lo que
  sube es la cantidad de teclas, en diente de sierra.

## Instalar

Descargá el instalador de tu sistema desde **[Releases](https://github.com/Xiza73/space-x-type/releases)**.

| Sistema | Archivo |
|---|---|
| Windows | `.msi` o `.exe` |
| macOS | `.dmg` (hay uno para Intel y otro para Apple Silicon) |
| Linux | `.AppImage`, `.deb` o `.rpm` |

> **Windows va a mostrar una advertencia de SmartScreen, y macOS una de Gatekeeper.**
> Es porque el binario no está firmado: un certificado cuesta cientos de dólares por año y esto
> es un proyecto personal. En Windows: *Más información* → *Ejecutar de todas formas*.

**No hace falta instalar nada más.** Ni Python, ni yt-dlp, ni un runtime de JavaScript. La app
resuelve sus herramientas sola la primera vez que procesás una canción, y verifica lo que baja
contra el hash que publica cada proyecto.

## Cómo se juega

| Tecla | Qué hace |
|---|---|
| `↑` `↓` `←` `→` / letras | Tipear la secuencia |
| `ESPACIO` o `ENTER` | Confirmar, dentro de la zona |
| `ESC` | Pausa |
| `ALT` + `ENTER` | Pantalla completa |

Tipear una tecla equivocada **reinicia la secuencia** pero no cuesta una vida: el castigo es el
tiempo perdido, que ya alcanza. Confirmar con la secuencia incompleta sí es `MISS` directo.

Después de un fallo la siguiente ronda se muestra **en anticipo** —al 35% de opacidad, sin
aceptar input— para que machacar espacio no te coma las tres vidas de un saque.

### Ventanas de timing

El riel se pinta con un degradado que va de casi blanco en el centro a transparente en los
bordes. La información va en el **brillo** y no en el color, a propósito: el ojo lee luminancia
mucho más rápido, y así se distingue sin depender de ver bien los colores.

| | Puntos | Combo | Vida |
|---|---|---|---|
| `PERFECT` | 150 | mantiene | — |
| `GREAT` | 100 | mantiene | — |
| `GOOD` | 60 | mantiene | — |
| `BAD` | 20 | **corta** | — |
| `MISS` | 0 | corta | **−1** |

Todo se multiplica por `1 + ⌊combo / 5⌋`.

## Biblioteca personal

![Biblioteca](docs/capturas/biblioteca.png)

Le pasás una URL de YouTube, la app baja el audio, detecta el tempo y genera el beatmap.
**Procesar es una sola vez por canción**: queda guardada en el disco y la elegís del combo la
próxima vez.

Todo vive en el directorio de datos de la app — en Windows,
`%APPDATA%\com.xiza73.spacextype\`:

```
library.json           índice: id, título, duración, bpm, mejor puntaje
songs/<id>/
├── audio.<ext>        el audio descargado
└── beatmap.json       onsets, bpm, secuencias
```

> **El tempo detectado se puede corregir a mano**, entre 30 y 300 BPM, con botones de `÷2` y
> `×2`. Hacen falta: la detección automática acierta 10 de 17 en el corpus de prueba, y casi
> todo lo que falla lo hace por un factor de exactamente 2 — un clic, una sola vez por canción.
> El detalle de por qué está en [`src-tauri/bench/`](src-tauri/bench/).

## Desarrollo

```bash
bun install
bun run tools        # baja el sidecar de QuickJS — sin esto, tauri dev y build fallan
bun run tauri dev
```

**Bun es el único gestor de paquetes.** Nada de `npm` ni `pnpm`; solo se commitea `bun.lock`.

### El gate, antes de commitear

```bash
bun run typecheck && bun run lint && bun run test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Lo mismo corre solo en cada PR. La versión de Rust está fijada en `rust-toolchain.toml`, y no
es burocracia: la primera corrida del CI falló por un lint que existía en su compilador y no en
el local.

### Banco de tempo

El detector se mide contra canciones reales con verdad de campo verificada, partidas en
calibración y validación:

```bash
bun run bench:fetch
SXT_SONGS_DIR="$PWD/src-tauri/bench/audio" \
  cargo test --manifest-path src-tauri/Cargo.toml --release -- --ignored corpus --nocapture
```

## Stack

| Capa | Elección |
|---|---|
| Shell | Tauri v2 — core Rust + WebView del sistema |
| UI | React 19 + TypeScript strict + Tailwind 4 |
| Gameplay | Canvas 2D y `requestAnimationFrame`, fuera de React |
| Audio | Web Audio API — `audioContext.currentTime` es el reloj maestro |
| Análisis | Rust: flujo espectral, autocorrelación, FFT propia |

El reloj de juego es **siempre** el del audio. Ni `Date.now()` ni `performance.now()`: derivan
respecto del audio y desincronizan la partida.

## Licencia

MIT. El contenido musical que proceses es tuyo y no se distribuye con la app.
