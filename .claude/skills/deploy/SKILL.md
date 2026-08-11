---
name: deploy
description: Proceso de release de la app de escritorio Tauri — gate de calidad, versionado sincronizado en tres archivos, merge dev→master, tag semver y generación de binarios por plataforma. Usar al cortar una versión, subir el número de versión o preparar la distribución de binarios.
---

# Deploy — space-type-rythm

App de escritorio: **no hay servidor, no hay rollback remoto**. Una vez que un binario está
en la máquina de alguien, está. Por eso el gate va antes, no después.

## Precondiciones

- Estás en `dev`, limpia y al día con `origin`.
- No hay PRs pendientes que tendrían que entrar en esta versión.

## 1. Gate de calidad

Todo verde, sin excepciones:

```bash
pnpm typecheck
pnpm lint
pnpm test
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
```

Falla algo → se corta el release y se reporta la salida real.

## 2. Versionado — tres archivos, un solo número

Este es el error clásico y silencioso: se actualiza uno y se olvidan los otros dos. El
updater y los metadatos del bundle empiezan a mentir.

| Archivo | Campo |
|---|---|
| `package.json` | `version` |
| `src-tauri/Cargo.toml` | `[package] version` |
| `src-tauri/tauri.conf.json` | `version` |

SemVer: `fix` → patch · `feat` → minor · breaking → major.

Commit: `chore(release): v<X.Y.Z>`

## 3. Merge y tag

Según `git-flow`: PR `dev` → `master`, merge `--no-ff`. Nunca squash, nunca rebase.

```bash
git tag -a v<X.Y.Z> -m "release: v<X.Y.Z>"
git push origin v<X.Y.Z>
```

## 4. Binarios

```bash
pnpm tauri build
```

Lo corre **el usuario**, no el agente (CLAUDE.md prohíbe correr builds, y además tarda).

Salida en `src-tauri/target/release/bundle/`:

| Plataforma | Artefactos |
|---|---|
| Windows | `.msi`, `.exe` (NSIS) |
| macOS | `.app`, `.dmg` |
| Linux | `.deb`, `.AppImage`, `.rpm` |

**`tauri build` compila solo para la plataforma donde corre.** Tres sistemas operativos
objetivo = tres máquinas, o CI con matriz de OS. No hay atajo por acá.

## 5. Verificación post-build

- El binario arranca en una máquina limpia (sin toolchain de desarrollo instalado).
- La app **falla con un mensaje claro** si `yt-dlp` no está en el `PATH`. No con un crash.
- El caché de audio se escribe en el directorio de datos de la app, no en el cwd.
- Una canción se descarga, analiza y reproduce de punta a punta.

## Deuda conocida

- **Sin code signing.** Windows SmartScreen y Gatekeeper de macOS van a advertir. Aceptable
  para uso personal; si en algún momento se distribuye, hace falta certificado + notarización.
- **Sin updater.** Las actualizaciones son manuales. Agregar el plugin `updater` de Tauri
  recién cuando haya usuarios reales que actualizar.
- **`yt-dlp` no viene empaquetado.** Es un requisito externo, y además cambia seguido: si se
  empaqueta una versión, queda vieja en semanas.
