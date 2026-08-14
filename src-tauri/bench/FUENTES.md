# Verdad de campo del banco de tempo

De dónde sale el BPM de cada canción de `tempos.tsv`, y por qué ese número y no otro.

## La regla: el pulso que se siente

El tempo anotado es **el que marcarías con el pie**, no el que devuelve una base de datos.
La distinción importa porque las bases de datos tienen el mismo error de octava que estamos
midiendo: Spotify reporta "Yellow" a 173 y "Someone Like You" a 135, que son el doble del
pulso real. Usar eso como verdad de campo sería medir el detector contra el mismo error que
queremos detectar.

Cuando las fuentes discrepan por un factor de exactamente 2, se toma **el valor lento**, que
es el que corresponde al pulso. Cuando discrepan por otra cosa, la canción se marca abajo.

## Origen de cada valor

| canción | bpm | fuente |
|---|---|---|
| Bad Apple!! | 138 | [SongBPM](https://songbpm.com/@alstroemeria-records/bad-apple-feat--nomico-s6LkefKgoK) · coincide con los stems publicados |
| Jet – Look What You've Done | 74 | [SongBPM](https://songbpm.com/@jet/look-what-you-ve-done) (73–75 según fuente) |
| Coldplay – Yellow | 86 | [GetSongBPM](https://getsongbpm.com/song/yellow/E9o7OK) — Spotify da 173, el doble |
| Zoé – Luna | 90 | [SongBPM](https://songbpm.com/@zoe/luna); las versiones en vivo se listan a 180 |
| Big Boy – Mis Ojos Lloran Por Ti | 86 | [pool de DJ](https://europaremix.com/home/7960-big-boy-mis-ojos-lloran-por-ti-intro-outro-86-bpm-dj-martinez-er.html) — ⚠️ contestado, ver abajo |
| Justin Bieber – Beauty And A Beat | 129 | ampliamente documentado |
| Keane – Bedshaped | 75 | [SongBPM](https://songbpm.com/@keane/bedshaped) |
| Willie Colón – Idilio | 94 | [SongBPM](https://songbpm.com/@willie-colon/idilio) (92 en otra edición) |
| Keane – Somewhere Only We Know | 86 | ampliamente documentado |
| Offenbach – Can Can | 152 | ampliamente documentado |
| Linkin Park – Given Up | 100 | [SongBPM](https://songbpm.com/@linkin-park/given-up) |
| The Beatles – Let It Be | 72 | [SongBPM](https://songbpm.com/@the-beatles/let-it-be) — 144 en las fuentes que doblan |
| Michael Jackson – Billie Jean | 117 | [SongBPM](https://songbpm.com/@michael-jackson/billie-jean) |
| Ramones – Blitzkrieg Bop | 177 | [SongBPM](https://songbpm.com/@ramones/blitzkrieg-bop) — 176–178 según remaster |
| Radiohead – Creep | 92 | [SongBPM](https://songbpm.com/@radiohead/creep) |
| Bee Gees – Stayin' Alive | 104 | ampliamente documentado (es el tempo de referencia para RCP) |
| The Weeknd – Blinding Lights | 171 | [SongBPM](https://songbpm.com/@the-weeknd/blinding-lights) |

## Valores contestados

**Big Boy – Mis Ojos Lloran Por Ti.** Las fuentes dan 172/86, 92, 95, 84 y 58. Se anotó 86
porque es lo que dan los pools de DJ, que anotan el tempo con el que se mezcla —o sea el que
se siente—, pero es el valor con menos respaldo del banco.

**Zoé – Luna.** ⚠️ **Sin resolver, y es la fila que más conviene resolver.**

Se anotó 90 porque lo dice SongBPM. Pero la autocorrelación del audio da `60(1.00)` y
`120(0.91)` —exactamente el doble uno del otro— y **en 90 no hay absolutamente nada**. Una
familia de octavas limpia {60, 120} sin rastro del valor anotado es señal de que el número
anotado es el que está mal.

El jugador, escuchándola, descartó las dos veces que fuera 120 por rápida. Eso deja **60** como
la hipótesis más probable.

Importa porque cambia de qué tipo es el error:

| si Luna es | el detector falla por | ¿lo arregla el botón? |
|---|---|---|
| 90 | 4/3 | **no** — el ×2 corrige octavas, no tercios |
| 60 | exactamente ×2 | sí, un clic |

**No se cambió sin confirmar.** Mover la verdad de campo para que el detector quede mejor es
justamente lo que este banco existe para impedir. La comprobación es de un minuto: poner Luna
en 60 en la biblioteca y jugarla — si la barra cae con la música, es 60.

## Cómo agregar canciones

Cuantas más haya, menos margen para ajustar constantes a un puñado de casos. Se agregan a
`pendientes.tsv` con su búsqueda y su tempo, y `bun run bench:fetch` las resuelve y las baja.

**El grupo importa.** Una canción nueva va a `validación` salvo que haga falta para entender
un fallo concreto: el grupo de calibración ya tiene con qué, y lo que escasea es material que
nadie haya mirado. Si alguna vez se ajusta algo mirando validación, ese grupo dejó de medir
y hay que reponerlo con canciones nuevas.
