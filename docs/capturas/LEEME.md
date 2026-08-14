# Capturas del README

El README referencia estos archivos. **Faltan las tres**: hay que sacarlas jugando, y eso no lo
puede hacer el agente — requiere una partida de verdad, con puntaje y combo reales. Una captura
de un menú vacío o de una partida recién empezada no vende nada.

| archivo | qué tiene que mostrarse |
|---|---|
| `logo.png` | el logo solo, fondo transparente, ~360px de lado. Sale de `app-icon.svg` |
| `gameplay-arcade.png` | una ronda **en curso**: el marcador dentro de la zona dorada, combo alto, el visualizador con barras encendidas |
| `biblioteca.png` | el menú con el combo de canciones **abierto**, mostrando varias entradas |

## Cómo sacarlas

```bash
bun run tauri dev
```

`ALT` + `ENTER` para pantalla completa, y capturar a **1280×720**. Ese tamaño no es capricho:
es donde se midió el costo del visualizador, y es lo que se ve bien en GitHub sin que el lector
tenga que abrir la imagen.

Tres cosas que hacen la diferencia entre una captura y una buena captura:

- **En gameplay, esperá a tener combo.** Un `x1` con puntaje en cero se ve a que el juego no
  pasa nada. Con `x4` y el multiplicador prendido se entiende el sistema de un vistazo.
- **El marcador tiene que estar dentro de la zona**, no llegando ni pasado. Es el momento que
  explica la mecánica sin una palabra.
- **Que el visualizador esté reaccionando.** En reposo es solo la figura, y la figura sola no
  cuenta que el anillo escucha la música.

Después de agregarlas, mirá el README renderizado en GitHub antes de dar por cerrado: las rutas
relativas se rompen distinto ahí que en un editor local.
