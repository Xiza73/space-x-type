---
description: Pasos de release — gate de calidad, versionado, build de binarios y tag
argument-hint: "[major|minor|patch — por defecto patch]"
allowed-tools: Read, Edit, Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(pnpm test:*), Bash(pnpm lint:*), Bash(pnpm typecheck:*), Bash(cargo test:*), Bash(cargo clippy:*)
---

Preparar un release `$ARGUMENTS` (si está vacío: `patch`).

Esto es una app de escritorio: **no hay servidor**. "Deploy" acá significa cortar una
versión y generar los binarios nativos.

## Precondiciones — verificá antes de tocar nada

- [ ] Estás en `dev` y está limpia (`git status`).
- [ ] `dev` está al día con `origin`.
- [ ] No hay PRs abiertos que deberían entrar en este release.

## 1. Gate de calidad — todo verde o no hay release

```bash
pnpm typecheck
pnpm lint
pnpm test
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
```

Si algo falla: **pará y reportá la salida real.** No sigas.

## 2. Versionar

Subí la versión en los **tres** lugares — tienen que coincidir:

- `package.json` → `version`
- `src-tauri/Cargo.toml` → `[package] version`
- `src-tauri/tauri.conf.json` → `version`

Commit: `chore(release): v<X.Y.Z>`

## 3. Merge a master

Según `git-flow`: PR de `dev` → `master`, merge con `--no-ff`. Nunca squash.

## 4. Tag

```bash
git tag -a v<X.Y.Z> -m "release: v<X.Y.Z>"
git push origin v<X.Y.Z>
```

## 5. Binarios

**No corras el build vos** — CLAUDE.md lo prohíbe y además tarda mucho. Decile al usuario
que corra:

```bash
pnpm tauri build
```

Salida en `src-tauri/target/release/bundle/`. Recordá que **solo se generan binarios para
la plataforma donde corrés el build** — para Windows/macOS/Linux hacen falta tres máquinas
o CI con matriz de sistemas operativos.

## Notas

- Firmar el binario (code signing) todavía no está configurado: macOS y Windows van a
  mostrar advertencias de "desarrollador no identificado". Es esperable en uso personal.
- `yt-dlp` **no** viene empaquetado: el usuario final tiene que tenerlo en el `PATH`.
