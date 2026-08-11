---
description: Workflow completo para resolver un bug — reproducir, causa raíz, arreglar, probar
argument-hint: "<número de issue o descripción del bug>"
allowed-tools: Read, Edit, Grep, Glob, Bash(gh issue view:*), Bash(git status:*), Bash(git diff:*), Bash(git checkout:*), Bash(pnpm test:*), Bash(cargo test:*)
---

Resolvé el bug: `$ARGUMENTS`

Si es un número, traé el detalle con `gh issue view $ARGUMENTS`.

## Reglas

**No escribas el fix hasta entender la causa raíz.** Un parche sobre un síntoma vuelve.

## Pasos

1. **Entender** — leé el reporte. Si falta info para reproducir, **pará y preguntá**.

2. **Reproducir** — escribí primero un test que **falle** por la razón correcta.
   - Lógica de front (scoring, timing, secuencias) → Vitest.
   - Core (descarga, decodificación, BPM) → `cargo test`.
   - Si el bug no es testeable de forma razonable, decilo y explicá cómo lo vas a verificar.

3. **Causa raíz** — respondé por escrito, en una o dos frases: *por qué* pasa.
   Sospechosos habituales en este proyecto:
   - Reloj equivocado (`Date.now()` en vez de `audioContext.currentTime`).
   - Deriva entre el beatmap y la reproducción del audio.
   - Estado del game loop leído desde React con un frame de atraso.
   - Beatmap cacheado que quedó viejo respecto del audio.

4. **Arreglar** — el diff **más chico** que corrige la causa. Nada de refactors de paso.
   Si ves algo aparte que vale arreglar, anotalo — no lo mezcles.

5. **Verificar** — el test nuevo pasa y el resto sigue verde:
   ```bash
   pnpm test
   ```
   Si tocaste Rust, además `cargo test --manifest-path src-tauri/Cargo.toml`.

6. **Entregar** — rama `fix/<slug>`, commit convencional:
   ```
   fix(<scope>): <qué se corrigió>
   ```
   PR contra `dev`. Nunca contra `master`.

## Salida

- Causa raíz en una o dos frases.
- Archivos tocados y por qué.
- Resultado de los tests (pegá la salida real, no la resumas como "pasa todo").
