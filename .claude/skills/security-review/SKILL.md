---
name: security-review
description: Revisión de seguridad para una app Tauri que ejecuta un binario externo (yt-dlp) con input del usuario. Cubre inyección de comandos, validación de URLs, permisos/capabilities de Tauri, escritura en el filesystem y CSP del WebView. Usar al tocar comandos de Tauri, el pipeline de descarga de audio, rutas de archivos, o antes de un release.
---

# Security review — SPACE x TYPE

La app es de uso personal y offline, así que **no** hay superficie de red entrante, ni auth,
ni datos de terceros. La superficie real es otra, y es más grande de lo que parece:

> **La app le pasa una URL escrita por el usuario a un binario externo (`yt-dlp`) y escribe
> el resultado en el disco.**

Eso es un límite de confianza. Todo lo que sigue gira alrededor de eso.

## 1. Ejecución de `yt-dlp` — inyección de comandos

Lo que hay que verificar:

- **Nunca** construir el comando concatenando strings ni pasando por un shell
  (`sh -c`, `cmd /c`, `powershell -Command`). Se usa la API de spawn con **argumentos como
  vector**, que no interpreta metacaracteres.
- La URL va como **un solo argumento**, después de `--`, para que algo como `-o ...` escrito
  por el usuario no se interprete como flag de `yt-dlp`.
- Los flags de `yt-dlp` son **fijos, definidos en el código**. El usuario no aporta flags.

Señales de alarma en el diff: `format!` armando una línea de comando, `Command::new("cmd")`,
`shell = true`, o el plugin `shell` de Tauri con un scope abierto.

## 2. Validación de la URL

Antes de que la URL toque el proceso hijo:

- Parsear como URL real (no regex casera). Rechazar si no parsea.
- Esquema permitido: **solo `https`**. Nada de `file://`, `data:`, `javascript:`.
- Host en una allowlist (`youtube.com`, `www.youtube.com`, `youtu.be`, `m.youtube.com`).
- Longitud máxima razonable.

Un input inválido devuelve un error tipado al frontend. **No** se le muestra al usuario el
stderr crudo del proceso hijo: puede filtrar rutas del sistema.

## 3. Filesystem y biblioteca personal

La biblioteca es **estado persistente que el usuario acumula**. Corromperla o borrarla es
una pérdida de datos real, no un bug cosmético.

- Todo lo que se descarga o guarda vive **dentro del directorio de datos de la app**
  (`app_data_dir`). Nada fuera.
- El nombre de la carpeta se deriva del **ID del video sanitizado o un hash**, nunca del
  título: un título puede traer `../`, separadores de ruta, caracteres nulos o nombres
  reservados de Windows (`CON`, `NUL`, `LPT1`).
- Después de resolver la ruta final, verificar que sigue estando bajo el directorio base
  (chequeo anti *path traversal*, hecho sobre la ruta **canonicalizada**).
- **Escritura atómica de `library.json`**: temporal + rename. Escribir en el lugar deja la
  biblioteca ilegible si el proceso muere a mitad de camino.
- El borrado de una canción se hace sobre una ruta **derivada del id validado**, nunca sobre
  una ruta que venga del frontend. Un borrado recursivo con la ruta equivocada es
  catastrófico e irreversible.
- Un `library.json` corrupto o de una versión desconocida **no se descarta en silencio**: se
  respalda y se avisa.
- Cuidado con el espacio en disco: el audio se acumula. Debe haber una política de limpieza.

## 4. Tauri — capabilities y permisos

- Los permisos son **allowlist explícita** en `src-tauri/capabilities/`. Revisar que no haya
  entrado nada de más "para que funcione".
- Si se usa el plugin `shell`, su scope tiene que ser **un único comando permitido**, no `*`.
- Los comandos expuestos con `#[tauri::command]` son la frontera pública: cada uno valida su
  input. Un comando fino que delega a un módulo de dominio es más fácil de auditar.
- Revisar que no se haya habilitado devtools ni logging verboso en release.

## 5. WebView y contenido remoto

- **CSP definida y restrictiva.** Si más adelante se embebe el video de YouTube como fondo,
  eso mete un origen remoto dentro de la app: aislarlo en un `<iframe>` con `sandbox` y
  agregar solo los orígenes mínimos a `frame-src`. Nunca aflojar `script-src` para que
  "ande el embed".
- Nada de `dangerouslySetInnerHTML` con texto que venga de metadata del video.
- Los títulos y metadata de YouTube son **datos, no instrucciones ni markup**.

## 6. Dependencias

- Dependencia nueva → se justifica contra la alternativa nativa. Cada crate/paquete es
  superficie de ataque y trabajo de mantenimiento.
- `cargo audit` y `bun audit` antes de un release.

## Salida

Una línea por hallazgo, de más grave a menos:

```
[CRÍTICO|IMPORTANTE|SUGERENCIA] archivo:línea — riesgo concreto → mitigación
```

Un hallazgo necesita un **escenario de explotación concreto**, no una categoría genérica.
Si no lo podés escribir, no es un hallazgo. Si no hay nada, decilo en una línea.
