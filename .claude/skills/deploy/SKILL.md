---
name: deploy
description: Proceso de release de la app de escritorio Tauri — gate de calidad, versionado sincronizado en tres archivos, merge dev→master, tag semver y generación de binarios por plataforma. Usar al cortar una versión, subir el número de versión o preparar la distribución de binarios.
---

# Deploy — SPACE x TYPE

App de escritorio: **no hay servidor, no hay rollback remoto**. Una vez que un binario está
en la máquina de alguien, está. Por eso el gate va antes, no después.

## Precondiciones

- Estás en `dev`, limpia y al día con `origin`.
- No hay PRs pendientes que tendrían que entrar en esta versión.

## 1. Gate de calidad

Todo verde, sin excepciones:

```bash
bun run typecheck
bun run lint
bun run test
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

**Además:** si cambió el esquema de `library.json`, sube su campo `version` y verifica que
exista el camino de migración. Una biblioteca que el usuario ya llenó **no se rompe ni se
descarta** — se migra.

## 3. Merge y tag

Según `git-flow`: PR `dev` → `master`, merge `--no-ff`. Nunca squash, nunca rebase.

```bash
git tag -a v<X.Y.Z> -m "release: v<X.Y.Z>"
git push origin v<X.Y.Z>
```

## 4. Binarios

```bash
bun run tauri build
```

Lo corre **el usuario**, no el agente (CLAUDE.md prohíbe correr builds, y además tarda).

Salida en `src-tauri/target/release/bundle/`:

| Plataforma | Artefactos |
|---|---|
| Windows | `.msi`, `.exe` (NSIS) |
| macOS | `.app`, `.dmg` |
| Linux | `.deb`, `.AppImage`, `.rpm` |

**`tauri build` compila solo para la plataforma donde corre.** Tres sistemas operativos
objetivo = tres máquinas, o CI con matriz de OS. No hay atajo por aquí.

Eso ya está resuelto en `.github/workflows/release.yml`: se empuja un tag `v*` y la matriz
genera los cuatro paquetes. A mano solo se construye el de tu propia máquina.

## Iconos

La fuente es `app-icon.svg` en la raíz. Para regenerar los 17 archivos:

```bash
bun run tauri icon app-icon.svg
```

Genera además `android/` e `ios/`, que este proyecto no usa: se borran. El móvil está fuera
del MVP y esos archivos serían ruido que nadie mantiene.

## 5. Verificación post-build

- El binario arranca en una máquina limpia (sin toolchain de desarrollo instalado).
- La app **falla con un mensaje claro** si `yt-dlp` no está en el `PATH`. No con un crash.
- La biblioteca se escribe en el directorio de datos de la app, **no en el cwd**.
- Una canción se descarga, analiza, **se guarda en la biblioteca** y se reproduce de punta
  a punta.
- Cerrar y reabrir la app: la biblioteca sigue ahí y las canciones son jugables.
- **Actualizar desde la versión anterior no borra la biblioteca existente.** Probalo con una
  biblioteca real, no vacía — es el bug de release más caro y el más fácil de no ver.

## Deuda conocida

- **Sin code signing.** Windows SmartScreen y Gatekeeper de macOS van a advertir. Aceptable
  para uso personal; si en algún momento se distribuye, hace falta certificado + notarización.
- **Sin updater.** Las actualizaciones son manuales. Agregar el plugin `updater` de Tauri
  solo cuando haya usuarios reales que actualizar.
- **`yt-dlp` no viene empaquetado.** Es un requisito externo, y además cambia seguido: si se
  empaqueta una versión, queda vieja en semanas.
