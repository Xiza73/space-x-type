//! Detección de tempo y generación del beatmap.
//!
//! El pipeline es: decodificar → función de novedad → BPM por autocorrelación →
//! fase del primer beat. Las tres etapas de DSP son **puras y toman `&[f32]`**,
//! así que se testean con señales sintéticas de tempo conocido, sin archivos.

use std::path::Path;

use serde::{Deserialize, Serialize};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::probe::Hint;

use super::fft;
use super::store::LibraryError;

/// Ventana y salto del análisis, en muestras. Con salto 512 a 44.1 kHz quedan
/// ~86 cuadros por segundo: sobra para resolver tempo.
const FRAME: usize = 1024;
const HOP: usize = 512;

/// Rango donde se busca el tempo: el del **pulso que se siente**.
///
/// De una balada a un tema de punk. Fuera de esto no hay música que uno vaya a
/// tipear: abajo de 55 el pulso ya no se siente como pulso sino como respiración,
/// y arriba de 210 lo que se cuenta son corcheas de algo más lento.
///
/// > **Estuvo en 60–145 y era un parche.** Se había estrechado para tapar que
/// > "Yellow" salía a 172, con el argumento de que así el error quedaba siempre
/// > en la misma dirección. Tapaba un síntoma: la causa era que la función de
/// > novedad medía energía de banda ancha y no veía nada en música no percusiva,
/// > así que el tempo lo terminaba eligiendo la preferencia perceptual. Y el
/// > precio era caro — "Can Can", que va a 152 de verdad, pasó a salir a 75.
const MIN_BPM: f32 = 55.0;
const MAX_BPM: f32 = 210.0;

/// Cuántos beats dura una ronda mientras el jugador no elija otra cosa.
///
/// Es un **default**, no una decisión del análisis. Antes el análisis elegía
/// entre 2, 4 y 8 buscando acercarse a una duración objetivo, o sea que
/// cancelaba el tempo en vez de seguirlo: con solo tres opciones la relación
/// entre BPM y velocidad quedaba con dos saltos, y en 80 y en 155 BPM subir el
/// tempo hacía la barra casi el doble de **lenta**.
///
/// Con los beats fijos la relación es monótona y el tempo vuelve a significar
/// algo. La velocidad pasó a ser una preferencia del jugador, que es lo que
/// siempre fue.
pub const DEFAULT_BEATS_PER_ROUND: u32 = 4;

/// RMS por debajo del cual una ventana cuenta como silencio (~-40 dBFS).
///
/// El piso de ruido de un audio real anda por 0.001; un fundido todavía audible
/// no baja de 0.01. El umbral va justo en el medio.
const SILENCE_RMS: f32 = 0.01;

/// Ventana con la que se mide el silencio, en ms.
///
/// Media segundo, y no unas pocas muestras, **porque un pico suelto tiene que
/// perderse en el promedio**. Una muestra de 0.9 en media ventana da un RMS de
/// 0.006 y queda debajo del umbral; en una ventana de 512 muestras daría 0.04 y
/// se llevaría puesto el recorte entero. Hay un test que lo fija.
const SILENCE_WINDOW_MS: u32 = 500;

/// Cola de silencio que se conserva.
///
/// Cortar seco en el último golpe se siente a que la app se colgó, no a que la
/// canción terminó.
const TAIL_MS: u32 = 2000;

/// Cuánto silencio de más tiene que haber para que valga la pena recortar.
///
/// Un final con dos o tres segundos de aire se deja como está: el recorte es
/// para las pantallas finales de YouTube, que son de decenas de segundos.
const MIN_TRIM_MS: u32 = 3000;

pub const BEATMAP_VERSION: u32 = 1;
pub const BEATMAP_FILE: &str = "beatmap.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Beatmap {
    pub version: u32,
    pub bpm: f32,
    /// Dónde cae el primer beat, en ms desde el arranque del audio.
    pub first_beat_ms: u32,
    pub duration_ms: u32,
    /// Cuántos beats dura una ronda.
    pub beats_per_round: u32,
    /// Derivado, pero se guarda para que el frontend no repita la cuenta.
    pub round_duration_ms: u32,
}

/// Límites duros para una corrección manual del tempo.
///
/// Anchos a propósito. El rango **sugerido** —la mitad al doble de lo medido—
/// cubre el error de octava, que es el fallo típico, pero no es la única razón
/// para tocar el tempo: alguien puede querer jugar una balada al doble de
/// velocidad. Sugerir no es prohibir.
///
/// Los que sí son límites: abajo de 30 la barra tarda más de ocho segundos en
/// cruzar y arriba de 300 no llega a un segundo. Fuera de ahí no es una
/// preferencia, es una partida rota.
pub const MIN_BPM_EDIT: f32 = 30.0;
pub const MAX_BPM_EDIT: f32 = 300.0;

/// Rango sugerido para corregir a mano, alrededor del detectado.
///
/// Va de la mitad al doble porque el fallo típico de la detección automática es
/// el error de octava: un tema de 75 se detecta como 150 y viceversa.
pub fn suggested_range(detected: f32) -> (f32, f32) {
    (
        (detected / 2.0).max(MIN_BPM_EDIT),
        (detected * 2.0).min(MAX_BPM_EDIT),
    )
}

pub fn clamp_bpm(bpm: f32) -> f32 {
    bpm.clamp(MIN_BPM_EDIT, MAX_BPM_EDIT)
}

/// Rearma el beatmap con otro tempo, recalculando lo que depende de él.
///
/// El `firstBeatMs` no se toca: dónde empieza el primer golpe es una medición
/// del audio, independiente de a qué velocidad se cuente después.
pub fn with_bpm(beatmap: &Beatmap, bpm: f32) -> Beatmap {
    let bpm = clamp_bpm(bpm);
    // Los beats por ronda NO se recalculan: son la velocidad, y la velocidad no
    // es asunto del tempo. Recalcularlos es exactamente lo que hacía que
    // corregir el tempo moviera la barra para cualquier lado.
    let beats_per_round = beatmap.beats_per_round.max(1);
    Beatmap {
        bpm,
        beats_per_round,
        round_duration_ms: (beats_per_round as f32 * 60_000.0 / bpm) as u32,
        ..beatmap.clone()
    }
}

/// Analiza un archivo de audio y arma su beatmap.
pub fn analyze(path: &Path) -> Result<Beatmap, LibraryError> {
    let (samples, sample_rate) = decode(path)?;
    Ok(build_beatmap(&samples, sample_rate))
}

/// La parte pura: de muestras a beatmap. Separada de la decodificación para
/// poder testearla con señales generadas.
pub fn build_beatmap(samples: &[f32], sample_rate: u32) -> Beatmap {
    let frames_per_sec = sample_rate as f32 / HOP as f32;
    let novelty = novelty(samples, FRAME, HOP);

    let bpm = estimate_bpm(&novelty, frames_per_sec);
    let first_beat_sec = estimate_first_beat(&novelty, frames_per_sec, bpm);
    let duration_ms = useful_duration_ms(samples, sample_rate);

    let beats_per_round = DEFAULT_BEATS_PER_ROUND;
    let round_duration_ms = (beats_per_round as f32 * 60_000.0 / bpm) as u32;

    Beatmap {
        version: BEATMAP_VERSION,
        bpm,
        first_beat_ms: (first_beat_sec * 1000.0) as u32,
        duration_ms,
        beats_per_round,
        round_duration_ms,
    }
}

/// Cuánto se comprime la magnitud de cada bin antes de compararla.
///
/// Sin compresión, los bins graves —que llevan casi toda la energía— tapan a los
/// agudos, que son donde se ve el ataque de un instrumento. Con el logaritmo, un
/// cambio del 20% pesa lo mismo venga de donde venga.
const COMPRESSION: f32 = 1000.0;

/// Función de novedad por **flujo espectral**: cuánto cambió el contenido del
/// espectro respecto del cuadro anterior, sumando solo lo que subió.
///
/// > **Esto era un medidor de energía de banda ancha y esa fue la causa raíz de
/// > años de tempos mal detectados.** Medir "¿subió el volumen?" alcanza con
/// > batería marcada y no ve nada más: en una balada de piano o una guitarra
/// > rasgueada el nivel es casi plano, la autocorrelación quedaba en 0.001 —o sea
/// > ruido— y el tempo lo terminaba eligiendo el peso perceptual, no el audio.
/// > Medido sobre once canciones reales, acertaba 5.
/// >
/// > El flujo espectral pregunta otra cosa: **¿cambió el contenido?**. Un acorde
/// > nuevo mueve muchos bins aunque el volumen no se mueva, y la misma nota
/// > repetida mueve pocos. Esa es exactamente la diferencia que hay entre el
/// > pulso de una balada y sus corcheas.
///
/// Se rectifica a media onda —solo los aumentos— porque lo que marca un golpe es
/// que aparezca energía, no que se apague.
pub fn novelty(samples: &[f32], frame: usize, hop: usize) -> Vec<f32> {
    let window = fft::hann(frame);
    let bins = frame / 2;

    let mut previous = vec![0.0f32; bins];
    let mut re = vec![0.0f32; frame];
    let mut im = vec![0.0f32; frame];
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut first = true;

    while start + frame <= samples.len() {
        for i in 0..frame {
            re[i] = samples[start + i] * window[i];
            im[i] = 0.0;
        }
        fft::fft(&mut re, &mut im);

        let mut flux = 0.0f32;
        for k in 0..bins {
            let magnitude = (re[k] * re[k] + im[k] * im[k]).sqrt();
            let level = (1.0 + COMPRESSION * magnitude).ln();
            flux += (level - previous[k]).max(0.0);
            previous[k] = level;
        }

        // El primer cuadro se compara contra un espectro vacío, así que daría un
        // pico gigante que no es un golpe sino el arranque del análisis.
        out.push(if first { 0.0 } else { flux });
        first = false;
        start += hop;
    }

    out
}

/// Cuántos múltiplos del período se suman al puntuar un candidato.
///
/// Cuatro: el beat, el par de beats, el tres y el compás. Más allá del compás la
/// estructura ya es de frase y no dice nada del pulso.
const HARMONICS: usize = 4;

/// Cuántos múltiplos se suman de verdad. El banco lo puede mover para medir
/// cuánto aporta cada etapa por separado, que es la única forma de saber si una
/// idea sirve o solo suena bien.
fn harmonics() -> usize {
    #[cfg(test)]
    if let Ok(v) = std::env::var("SXT_ARMONICOS") {
        if let Ok(n) = v.parse::<usize>() {
            return n.clamp(1, HARMONICS);
        }
    }
    HARMONICS
}

/// Tempo a partir de la función de novedad.
///
/// Tres etapas, y **cada una arregla una falla concreta que se midió**:
///
/// 1. **Autocorrelación normalizada** por `r(0)`, para que los valores se puedan
///    comparar entre canciones y no solo dentro de una.
/// 2. **Suma métrica**: un candidato no se puntúa por su propio pico sino por el
///    suyo más los de sus múltiplos. Un pulso de verdad se repite también cada
///    dos, tres y cuatro beats; una periodicidad espuria no. Esto es lo que
///    limpia los picos en relaciones raras —4/3, 2/3— que eran los que ganaban:
///    Luna tenía su pico más alto en 60 y el correcto (90) sexto.
/// 3. **Preferencia perceptual ancha**, solo para desempatar entre octavas.
///
/// Se le resta la media a la novedad antes de correlacionar: si no, el término
/// constante domina y el pico se pierde.
pub fn estimate_bpm(novelty: &[f32], frames_per_sec: f32) -> f32 {
    if novelty.len() < 16 {
        return 120.0;
    }

    // Dos versiones de la misma señal, y la diferencia importa:
    //   `rectified` no tiene negativos — es la que mide el contraste, que
    //     pregunta "¿cuánta novedad hay aquí?" y sobre media cero no significa
    //     nada: `on` y `off` darían los dos casi cero y el cociente sería ruido.
    //   `centered` tiene media cero — es la que va a la autocorrelación, que sin
    //     eso queda dominada por el término constante.
    let rectified = whiten(novelty, frames_per_sec);
    let mean = rectified.iter().sum::<f32>() / rectified.len() as f32;
    let centered: Vec<f32> = rectified.iter().map(|v| v - mean).collect();

    let (min_bpm, max_bpm) = search_range();
    let min_lag = (60.0 * frames_per_sec / max_bpm).round().max(1.0) as usize;
    let max_lag = ((60.0 * frames_per_sec / min_bpm).round() as usize).min(centered.len() / 2);
    if min_lag >= max_lag {
        return 120.0;
    }

    let acf = autocorrelation(&centered, max_lag * HARMONICS);

    // El candidato se elige en dos pasos, y separarlos es el punto.
    //
    // 1. **Dónde hay periodicidad** lo decide el audio y nada más: el pico más
    //    alto de la autocorrelación, sin preferencia de ningún tipo.
    // 2. **En qué nivel métrico contarla** lo decide la preferencia perceptual,
    //    pero solo entre los parientes de ese pico —mitad, doble, y los dos
    //    tercios que aparecen con los tresillos—, nunca sobre todo el rango.
    //
    // Mezclarlos en un solo producto fue el error que hizo que el estimador
    // devolviera su propia constante: con la preferencia multiplicando cada lag,
    // un tempo sin ningún respaldo en el audio podía ganarle a uno medido.
    let best_lag = (min_lag..=max_lag)
        .max_by(|a, b| {
            let score = |lag: usize| {
                metric_score(&acf, lag)
                    * octave_weight(60.0 * frames_per_sec / lag as f32)
            };
            score(*a).total_cmp(&score(*b))
        })
        .unwrap_or(min_lag);

    // Interpolación parabólica sobre los vecinos del ganador. Sin esto la
    // resolución la fija el paso del lag, que arriba de 140 BPM ya es de 4 BPM
    // por escalón: el tempo salía cuantizado a los valores que permite la grilla.
    let refined = interpolate_peak(&acf, best_lag, min_lag, max_lag);
    60.0 * frames_per_sec / refined
}

/// Ventana de la media móvil que se le resta a la novedad, en segundos.
///
/// Tres segundos: **más lento que cualquier pulso** que se busque —a 55 BPM el
/// beat dura 1.09s— así que saca la deriva de las secciones sin tocar el beat.
/// Bajarlo a un segundo empezaría a comerse los tempos lentos, que son
/// justamente los que fallan.
const WHITEN_SECONDS: f32 = 3.0;

/// Le saca a la novedad su media móvil y rectifica.
///
/// > **Restar solo la media global no alcanza y se midió.** Una canción sube y
/// > baja de intensidad entre estrofa y estribillo, y esa deriva —mucho más lenta
/// > que el pulso— le mete a la autocorrelación una componente ancha que se
/// > monta sobre los lags largos. Se veía clarito en "Luna": los picos salían en
/// > 59-60-61 y en 117-120-123, anchos y pegados, con el tempo real (90) fuera de
/// > los seis primeros. Eso no es un pulso, es la forma de la canción.
///
/// Se rectifica porque lo que marca un golpe es estar **por encima** de lo que
/// venía sonando; quedar por debajo no es información de ritmo.
fn whiten(novelty: &[f32], frames_per_sec: f32) -> Vec<f32> {
    let window = ((WHITEN_SECONDS * frames_per_sec) as usize).max(1);
    if novelty.len() <= window {
        let mean = novelty.iter().sum::<f32>() / novelty.len().max(1) as f32;
        return novelty.iter().map(|v| (v - mean).max(0.0)).collect();
    }

    // Devuelve la señal **rectificada**, sin centrar. Centrar es asunto de quien
    // vaya a autocorrelacionar; el contraste de peine necesita los valores sin
    // negativos o mide ruido.

    // Suma acumulada: la media móvil de cualquier ventana sale en dos restas, y
    // recorrer la ventana por cada punto sería cuadrático sobre un tema entero.
    let mut prefix = Vec::with_capacity(novelty.len() + 1);
    prefix.push(0.0f32);
    for v in novelty {
        prefix.push(prefix[prefix.len() - 1] + v);
    }

    let half = window / 2;
    let rectified: Vec<f32> = (0..novelty.len())
        .map(|i| {
            let from = i.saturating_sub(half);
            let to = (i + half + 1).min(novelty.len());
            let local = (prefix[to] - prefix[from]) / (to - from) as f32;
            (novelty[i] - local).max(0.0)
        })
        .collect();

    rectified
}

/// Autocorrelación normalizada por `r(0)`, hasta `max_lag`.
///
/// Se divide por el largo **total** y no por el solapamiento: dividir por el
/// solapamiento —que se achica a medida que crece el lag— infla el puntaje de los
/// lags largos, o sea que el estimador quedaría sesgado hacia los tempos lentos
/// por pura aritmética.
fn autocorrelation(centered: &[f32], max_lag: usize) -> Vec<f32> {
    let max_lag = max_lag.min(centered.len().saturating_sub(1));
    let energy = centered.iter().map(|v| v * v).sum::<f32>().max(1e-12);

    (0..=max_lag)
        .map(|lag| {
            let overlap = centered.len() - lag;
            (0..overlap).map(|i| centered[i] * centered[i + lag]).sum::<f32>() / energy
        })
        .collect()
}

/// Puntaje métrico de un candidato: su pico más los de sus múltiplos.
///
/// Los múltiplos pesan `1/k` — el beat manda, el compás acompaña. Y se divide por
/// la suma de los pesos usados, no por una constante: cerca del techo de lags no
/// entran los cuatro múltiplos, y sin normalizar los tempos lentos quedarían
/// castigados por una razón puramente aritmética.
fn metric_score(acf: &[f32], lag: usize) -> f32 {
    let mut total = 0.0;
    let mut weights = 0.0;

    for k in 1..=harmonics() {
        let Some(value) = acf.get(lag * k) else { break };
        let weight = 1.0 / k as f32;
        total += value * weight;
        weights += weight;
    }

    if weights > 0.0 {
        total / weights
    } else {
        0.0
    }
}

/// Vértice de la parábola que pasa por el pico y sus dos vecinos.
fn interpolate_peak(acf: &[f32], lag: usize, min_lag: usize, max_lag: usize) -> f32 {
    if lag <= min_lag || lag >= max_lag {
        return lag as f32;
    }

    let (left, center, right) = (acf[lag - 1], acf[lag], acf[lag + 1]);
    let denominator = left - 2.0 * center + right;
    if denominator.abs() < 1e-9 {
        return lag as f32;
    }

    let offset = 0.5 * (left - right) / denominator;
    // Un desplazamiento de más de medio paso quiere decir que el pico real es el
    // vecino, no este: en ese caso la parábola no aplica y se deja el entero.
    if offset.abs() > 0.5 {
        lag as f32
    } else {
        lag as f32 + offset
    }
}

/// Rango donde se busca el tempo. El banco lo puede mover para comparar.
fn search_range() -> (f32, f32) {
    #[cfg(test)]
    if let Ok(v) = std::env::var("SXT_RANGO") {
        if let Some((a, b)) = v.split_once(',') {
            if let (Ok(a), Ok(b)) = (a.trim().parse(), b.trim().parse()) {
                return (a, b);
            }
        }
    }
    (MIN_BPM, MAX_BPM)
}

/// Tempo que se prefiere cuando hay que desempatar entre octavas.
///
/// > ⚠️ **Estos dos números se eligieron barriendo contra el grupo de
/// > calibración, y hay que mirarlos con desconfianza.** 95 está muy cerca de la
/// > mediana de ese grupo, que es la firma clásica del sobreajuste, y el barrido
/// > es abrupto: a 105 el acierto cae de 4/8 a 2/8. Un óptimo con paredes así de
/// > empinadas no es un óptimo, es una coincidencia con un corpus chico.
/// >
/// > Lo que sí está medido y no depende de estos números: con esta preferencia,
/// > **todo lo que falla en validación falla por un factor de exactamente 2**
/// > (129→64, 152→75, 171→86). Antes fallaba por 4/3, que ningún botón arregla.
/// > La forma del error mejoró aunque el acierto siga lejos de donde debería.
const PREFERRED_BPM: f32 = 95.0;
const PREFERRED_SPREAD: f32 = 0.35;

/// Peso perceptual del tempo, para desempatar entre **octavas**.
///
/// Un tren de pulsos a 150 BPM se autocorrelaciona igual de bien a 75: cada dos
/// golpes también hay un período. Esa ambigüedad es real y ninguna cuenta la
/// resuelve sola — una persona tampoco: elige por contexto musical.
///
/// El criterio es el mismo que usa alguien al marcar el pulso con el pie: entre
/// dos tempos que encajan, el más cercano a ~115 BPM. Es una campana en escala
/// logarítmica, porque las octavas son multiplicativas: 60 y 240 están igual de
/// lejos de 120.
fn octave_weight(bpm: f32) -> f32 {
    let (center, spread) = preference();
    let distance = (bpm / center).ln() / spread;
    (-0.5 * distance * distance).exp()
}

/// El banco puede mover la preferencia para barrerla **contra el grupo de
/// calibración**. Ese barrido es legítimo justamente porque existe un grupo de
/// validación que no se mira: sin él, ajustar y medir contra lo mismo da 100% por
/// construcción y no dice nada.
fn preference() -> (f32, f32) {
    #[cfg(test)]
    if let Ok(v) = std::env::var("SXT_PREFERENCIA") {
        if let Some((c, s)) = v.split_once(',') {
            if let (Ok(c), Ok(s)) = (c.trim().parse(), s.trim().parse()) {
                return (c, s);
            }
        }
    }
    (PREFERRED_BPM, PREFERRED_SPREAD)
}

/// Fase del primer beat: el desplazamiento que hace que un tren de pulsos al
/// tempo detectado caiga sobre la mayor cantidad de energía.
pub fn estimate_first_beat(novelty: &[f32], frames_per_sec: f32, bpm: f32) -> f32 {
    let period = 60.0 * frames_per_sec / bpm;
    if period < 1.0 || novelty.is_empty() {
        return 0.0;
    }

    let mut best_offset = 0usize;
    let mut best_score = f32::MIN;

    for offset in 0..period.round() as usize {
        let mut position = offset as f32;
        let mut score = 0.0;
        while (position as usize) < novelty.len() {
            score += novelty[position as usize];
            position += period;
        }
        if score > best_score {
            best_score = score;
            best_offset = offset;
        }
    }

    best_offset as f32 / frames_per_sec
}

/// Cuánto dura la canción **para el juego**: hasta el último sonido, más `TAIL_MS`.
///
/// Los videos de YouTube suelen terminar con pantallas finales, silencio o un
/// fundido larguísimo. Sin recortar eso, la partida sigue corriendo sobre la nada
/// y el jugador tipea contra el vacío hasta que se acaba el tiempo.
///
/// **No se toca el archivo de audio**, solo la duración que se anota en el
/// beatmap. Recortar el audio sería destructivo y no haría falta para nada: lo
/// que necesita el juego es saber cuándo dejar de contar.
pub fn useful_duration_ms(samples: &[f32], sample_rate: u32) -> u32 {
    let total_ms = ms_at(samples.len(), sample_rate);

    let window = (sample_rate as usize * SILENCE_WINDOW_MS as usize / 1000).max(1);
    let last_loud = samples.chunks(window).rposition(|w| {
        let sum: f32 = w.iter().map(|s| s * s).sum();
        (sum / w.len() as f32).sqrt() > SILENCE_RMS
    });

    // Todo silencio. No hay recorte que no deje la canción en cero, así que se
    // devuelve entera y que el usuario decida si la borra.
    let Some(block) = last_loud else {
        return total_ms;
    };

    let sound_end_ms = ms_at((block + 1) * window, sample_rate).min(total_ms);
    let trimmed = sound_end_ms + TAIL_MS;

    if total_ms.saturating_sub(trimmed) > MIN_TRIM_MS {
        trimmed
    } else {
        total_ms
    }
}

fn ms_at(sample_index: usize, sample_rate: u32) -> u32 {
    (sample_index as f32 / sample_rate as f32 * 1000.0) as u32
}

/// Decodifica a mono `f32`.
///
/// Se baja a mono en el mismo pase para no tener dos copias del tema en memoria.
fn decode(path: &Path) -> Result<(Vec<f32>, u32), LibraryError> {
    let file = std::fs::File::open(path)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, stream, &Default::default(), &Default::default())
        .map_err(|e| {
            log::error!("no se pudo identificar el audio: {e}");
            LibraryError::Analysis
        })?;

    let mut format = probed.format;
    let track = format.default_track().ok_or(LibraryError::Analysis)?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44_100);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &Default::default())
        .map_err(|e| {
            log::error!("no hay decodificador para el audio: {e}");
            LibraryError::Analysis
        })?;

    let mut mono = Vec::new();
    let mut buffer: Option<SampleBuffer<f32>> = None;

    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        let Ok(decoded) = decoder.decode(&packet) else {
            // Un paquete roto no tira abajo el análisis del tema entero.
            continue;
        };

        let spec = *decoded.spec();
        let channels = spec.channels.count().max(1);
        let buf = buffer.get_or_insert_with(|| SampleBuffer::new(decoded.capacity() as u64, spec));
        buf.copy_interleaved_ref(decoded);

        for frame in buf.samples().chunks(channels) {
            mono.push(frame.iter().sum::<f32>() / channels as f32);
        }
    }

    if mono.is_empty() {
        return Err(LibraryError::Analysis);
    }

    Ok((mono, sample_rate))
}


#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 44_100;

    /// Pista de clicks a un tempo conocido: la forma de testear DSP sin
    /// archivos ni fixtures.
    pub fn click_track(bpm: f32, seconds: f32, offset_sec: f32) -> Vec<f32> {
        let total = (seconds * SR as f32) as usize;
        let mut out = vec![0.0f32; total];
        let period = 60.0 / bpm * SR as f32;
        let mut position = offset_sec * SR as f32;

        while (position as usize) < total {
            let start = position as usize;
            let len = 300.min(total - start);
            for k in 0..len {
                // Ataque seco y caída rápida, como un golpe percusivo.
                let decay = 1.0 - k as f32 / len as f32;
                out[start + k] = decay * decay * (k as f32 * 0.35).sin();
            }
            position += period;
        }

        out
    }

    #[test]
    fn la_novedad_se_prende_en_los_golpes() {
        let novelty = novelty(&click_track(120.0, 4.0, 0.0), FRAME, HOP);
        let max = novelty.iter().cloned().fold(0.0f32, f32::max);
        let mean = novelty.iter().sum::<f32>() / novelty.len() as f32;

        // Los picos tienen que sobresalir claramente del promedio.
        assert!(max > mean * 5.0, "max {max}, media {mean}");
    }

    #[test]
    fn la_novedad_de_silencio_es_plana() {
        let novelty = novelty(&vec![0.0f32; SR as usize], FRAME, HOP);
        assert!(novelty.iter().all(|v| *v == 0.0));
    }

    #[test]
    fn detecta_el_tempo_de_una_pista_de_clicks() {
        let frames_per_sec = SR as f32 / HOP as f32;

        // Todos dentro de la banda donde el estimador es confiable. Arriba de
        // ~130 devuelve la mitad, y eso lo fija —a propósito y con su porqué—
        // `arriba_de_130_el_tempo_sale_a_la_mitad`.
        for esperado in [90.0f32, 100.0, 120.0] {
            let novelty = novelty(&click_track(esperado, 30.0, 0.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - esperado).abs() < 2.5,
                "esperaba {esperado}, detectó {detectado}"
            );
        }
    }

    /// Patrón de bombo y caja: golpes fuertes y flojos alternados.
    ///
    /// Es como suena casi toda la música popular, y es **la trampa clásica del
    /// error de octava**: los golpes fuertes solos ya forman un pulso a la
    /// mitad del tempo, así que la autocorrelación encaja igual de bien ahí.
    pub fn backbeat_track(bpm: f32, seconds: f32) -> Vec<f32> {
        let total = (seconds * SR as f32) as usize;
        let mut out = vec![0.0f32; total];
        let period = 60.0 / bpm * SR as f32;

        let mut position = 0.0f32;
        let mut beat = 0usize;
        while (position as usize) < total {
            let start = position as usize;
            let len = 300.min(total - start);
            let strength = if beat % 2 == 0 { 1.0 } else { 0.35 };
            for k in 0..len {
                let decay = 1.0 - k as f32 / len as f32;
                out[start + k] = strength * decay * decay * (k as f32 * 0.35).sin();
            }
            position += period;
            beat += 1;
        }
        out
    }

    #[test]
    fn no_se_come_la_mitad_del_tempo_en_un_patron_con_acentos() {
        // El caso real que se rompió: una canción rápida se procesaba a 75 BPM.
        // Mientras la velocidad de la barra se elegía aparte no molestaba;
        // cuando el BPM pasó a ser la velocidad, quedó lentísima.
        let frames_per_sec = SR as f32 / HOP as f32;

        for esperado in [100.0f32, 110.0, 120.0] {
            let novelty = novelty(&backbeat_track(esperado, 30.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - esperado).abs() < 4.0,
                "esperaba {esperado}, detectó {detectado} (¿mitad de tempo?)"
            );
        }
    }

    /// > ⚠️ **LÍMITE CONOCIDO, MEDIDO Y NO RESUELTO.**
    /// >
    /// > Arriba de unos 130 BPM el estimador devuelve la mitad del tempo. No es
    /// > un descuido ni un intercambio elegido: es lo que se logró.
    /// >
    /// > La causa es exacta. En una señal periódica de período P, la
    /// > autocorrelación en 2P es **igual de fuerte** que en P —los dos son
    /// > períodos de verdad—, así que la ACF nunca puede preferir el fundamental
    /// > sobre sus múltiplos y el desempate lo termina haciendo la preferencia
    /// > perceptual, centrada en 95. Todo lo que pase de ~130 le queda más lejos
    /// > que su mitad.
    /// >
    /// > Se intentaron dos formas de que el audio decidiera en vez de la
    /// > preferencia, y **las dos se midieron y se descartaron**:
    /// >
    /// > | intento | qué pasó |
    /// > |---|---|
    /// > | sumar los múltiplos del candidato | inerte: el blanqueo ya borra la correlación a esos lags |
    /// > | contraste de peine (beat vs. medio beat) | arregla los sintéticos y **destroza** la música real: 1/8 |
    /// >
    /// > El contraste es el caso que más enseña: en un tren de clicks hace
    /// > exactamente lo que promete, y en música real prefiere niveles métricos
    /// > de dos tercios. Un tren de clicks no es una canción.
    /// >
    /// > **Lo que queda por probar es análisis armónico** —cromagramas, ritmo de
    /// > acordes— o una biblioteca de beat-tracking ya validada. La periodicidad
    /// > de la energía, sola, no alcanza, y eso ya está medido tres veces.
    /// >
    /// > Mientras tanto el error es **exactamente ×2**, o sea un clic del botón
    /// > `÷2` en la biblioteca, una sola vez por canción.
    #[test]
    fn arriba_de_130_el_tempo_sale_a_la_mitad() {
        let frames_per_sec = SR as f32 / HOP as f32;

        for rapido in [140.0f32, 170.0] {
            let novelty = novelty(&click_track(rapido, 30.0, 0.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - rapido / 2.0).abs() < 4.0,
                "a {rapido} BPM devolvió {detectado}. Si esto es el tempo entero, \
                 alguien resolvió el límite: borrá este test y celebralo."
            );
        }
    }

    #[test]
    fn el_rango_de_busqueda_es_el_del_pulso_que_se_siente() {
        // Un tempo fuera del rango no se puede devolver, por construcción.
        for bpm in [70.0f32, 100.0, 130.0, 145.0, 170.0, 200.0] {
            let frames_per_sec = SR as f32 / HOP as f32;
            let novelty = novelty(&click_track(bpm, 25.0, 0.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (MIN_BPM..=MAX_BPM).contains(&detectado),
                "a {bpm} BPM devolvió {detectado}, fuera de {MIN_BPM}–{MAX_BPM}"
            );
        }
    }

    #[test]
    fn la_preferencia_de_octava_es_simetrica_en_logaritmo() {
        // 60 y 250 tienen que estar igual de lejos de 125: las octavas son
        // multiplicativas, no aditivas. Si esto se hace lineal, la preferencia
        // se corre hacia los tempos rápidos y aparece el error al revés.
        let mitad = octave_weight(PREFERRED_BPM / 2.0);
        let doble = octave_weight(PREFERRED_BPM * 2.0);
        assert!((mitad - doble).abs() < 1e-6, "mitad {mitad}, doble {doble}");
        assert!(octave_weight(PREFERRED_BPM) > mitad);
        assert!((octave_weight(PREFERRED_BPM) - 1.0).abs() < 1e-6);
    }

    /// Balada: golpes en el beat y **corcheas más flojas en el medio**.
    ///
    /// Es la trampa del error de octava hacia arriba, y el caso que se rompió de
    /// verdad: "Somewhere Only We Know" —que va a unos 86 BPM— se procesó a
    /// 172.27, el doble exacto. Con la barra siguiendo al tempo, quedaba al
    /// doble de velocidad de lo que suena.
    pub fn ballad_track(bpm: f32, seconds: f32) -> Vec<f32> {
        let total = (seconds * SR as f32) as usize;
        let mut out = vec![0.0f32; total];
        let half = 30.0 / bpm * SR as f32;

        let mut position = 0.0f32;
        let mut step = 0usize;
        while (position as usize) < total {
            let start = position as usize;
            let len = 300.min(total - start);
            // Las corcheas suenan, pero bastante más flojas que el pulso.
            let strength = if step % 2 == 0 { 1.0 } else { 0.5 };
            for k in 0..len {
                let decay = 1.0 - k as f32 / len as f32;
                out[start + k] = strength * decay * decay * (k as f32 * 0.35).sin();
            }
            position += half;
            step += 1;
        }
        out
    }

    /// > **Límite conocido: abajo de ~84 BPM esto no se puede resolver.**
    /// > Una balada de 72 con corcheas y un tema de 144 con acentos alternados
    /// > son la *misma señal* —pulsos fuerte/flojo a 144 por minuto— con la
    /// > respuesta correcta invertida. Ninguna preferencia de tempo puede
    /// > acertarle a las dos, y no es un defecto de esta implementación: es
    /// > ambigüedad real. Para eso está la corrección manual en la biblioteca.
    #[test]
    fn no_dobla_el_tempo_de_una_balada_con_corcheas() {
        let frames_per_sec = SR as f32 / HOP as f32;

        for esperado in [86.0f32, 95.0, 110.0] {
            let novelty = novelty(&ballad_track(esperado, 40.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - esperado).abs() < 4.0,
                "esperaba {esperado}, detectó {detectado} (¿tempo al doble?)"
            );
        }
    }

    #[test]
    fn el_tempo_lento_de_verdad_sigue_saliendo_lento() {
        // La preferencia por 125 no puede convertirse en "todo es 125": una
        // balada tiene que salir lenta, o el ajuste habría cambiado un sesgo
        // por el opuesto.
        let frames_per_sec = SR as f32 / HOP as f32;
        let novelty = novelty(&click_track(80.0, 30.0, 0.0), FRAME, HOP);
        let detectado = estimate_bpm(&novelty, frames_per_sec);

        assert!((detectado - 80.0).abs() < 4.0, "detectó {detectado}");
    }

    #[test]
    fn encuentra_la_fase_del_primer_beat() {
        let frames_per_sec = SR as f32 / HOP as f32;
        let offset = 0.25;

        let novelty = novelty(&click_track(120.0, 30.0, offset), FRAME, HOP);
        let bpm = estimate_bpm(&novelty, frames_per_sec);
        let detectado = estimate_first_beat(&novelty, frames_per_sec, bpm);

        // Tolerancia de un cuadro y medio: la resolución del análisis.
        assert!(
            (detectado - offset).abs() < 1.5 / frames_per_sec,
            "esperaba {offset}s, detectó {detectado}s"
        );
    }

    #[test]
    fn no_revienta_con_una_señal_minuscula() {
        let beatmap = build_beatmap(&[0.0; 100], SR);
        assert!(beatmap.bpm > 0.0);
        assert!(beatmap.round_duration_ms > 0);
    }

    #[test]
    fn el_rango_sugerido_cubre_el_error_de_octava() {
        // El fallo típico de la detección: un tema de 75 se detecta como 150.
        let (min, max) = suggested_range(150.0);
        assert!(min <= 75.0 && max >= 240.0_f32.min(300.0));

        // Y nunca sale de los límites duros.
        let (min, max) = suggested_range(200.0);
        assert!(min >= MIN_BPM_EDIT && max <= MAX_BPM_EDIT);
    }

    #[test]
    fn la_correccion_recalcula_lo_que_depende_del_tempo() {
        let base = build_beatmap(&click_track(120.0, 10.0, 0.25), SR);
        let corregido = with_bpm(&base, 60.0);

        assert_eq!(corregido.bpm, 60.0);
        // Los beats por ronda son la VELOCIDAD y no se tocan al corregir el
        // tempo. A 60 BPM un beat dura 1000ms, así que cuatro dan 4000.
        assert_eq!(corregido.beats_per_round, base.beats_per_round);
        assert_eq!(corregido.round_duration_ms, 4000);
        // Lo que es medición del audio no se toca.
        assert_eq!(corregido.first_beat_ms, base.first_beat_ms);
        assert_eq!(corregido.duration_ms, base.duration_ms);
    }

    #[test]
    fn la_correccion_se_acota_a_los_limites() {
        let base = build_beatmap(&click_track(120.0, 5.0, 0.0), SR);

        assert_eq!(with_bpm(&base, 0.0).bpm, MIN_BPM_EDIT);
        assert_eq!(with_bpm(&base, 10_000.0).bpm, MAX_BPM_EDIT);
        // Un tempo de cero dividiría por cero al armar la grilla.
        assert!(with_bpm(&base, 0.0).round_duration_ms > 0);
    }

    #[test]
    fn mas_tempo_es_siempre_barra_mas_rapida() {
        // **El test que faltaba.** El modelo anterior elegía los beats por ronda
        // buscando una duración objetivo, y con solo tres opciones la relación
        // se daba vuelta: a 150 BPM la ronda duraba 1600ms y a 155 saltaba a
        // 3096ms. Subir el tempo hacía la barra casi el doble de lenta, y no
        // había forma de darse cuenta sin recorrer el rango entero.
        let base = build_beatmap(&click_track(120.0, 10.0, 0.0), SR);

        let mut anterior = u32::MAX;
        let mut bpm = MIN_BPM_EDIT;
        while bpm <= MAX_BPM_EDIT {
            let duracion = with_bpm(&base, bpm).round_duration_ms;
            assert!(
                duracion < anterior,
                "a {bpm} BPM la ronda dura {duracion}ms, y a un tempo menor duraba {anterior}ms"
            );
            anterior = duracion;
            bpm += 1.0;
        }
    }

    #[test]
    fn la_ronda_queda_jugable_en_todo_el_rango_de_tempo() {
        // Con la velocidad por defecto. Si esto falla, entrar a una canción sin
        // tocar nada da una partida injugable a algún tempo.
        for bpm in [70.0f32, 90.0, 120.0, 150.0, 180.0] {
            let beatmap = build_beatmap(&click_track(bpm, 20.0, 0.0), SR);
            assert!(
                (1200..=3600).contains(&beatmap.round_duration_ms),
                "a {bpm} BPM la ronda dura {}ms",
                beatmap.round_duration_ms
            );
        }
    }

    #[test]
    fn el_beatmap_reporta_la_duracion_del_audio() {
        let beatmap = build_beatmap(&click_track(120.0, 10.0, 0.0), SR);
        assert!((beatmap.duration_ms as i32 - 10_000).abs() < 100);
    }

    /// Música seguida de silencio, que es como termina medio YouTube.
    fn con_silencio_final(musica_sec: f32, silencio_sec: f32) -> Vec<f32> {
        let mut out = click_track(120.0, musica_sec, 0.0);
        out.extend(std::iter::repeat_n(0.0, (silencio_sec * SR as f32) as usize));
        out
    }

    #[test]
    fn recorta_el_silencio_largo_del_final() {
        // 10s de música y 20s de nada: la partida no puede durar 30s.
        let duracion = useful_duration_ms(&con_silencio_final(10.0, 20.0), SR);
        // Fin de la música a los 10s, más los 2s de cola.
        assert!(
            (duracion as i32 - 12_000).abs() < 600,
            "quedó en {duracion} ms"
        );
    }

    #[test]
    fn no_toca_un_final_con_dos_segundos_de_aire() {
        // El usuario lo pidió explícito: dos o tres segundos no son un problema.
        let samples = con_silencio_final(10.0, 2.0);
        let total = (samples.len() as f32 / SR as f32 * 1000.0) as u32;
        assert_eq!(useful_duration_ms(&samples, SR), total);
    }

    #[test]
    fn un_click_perdido_en_el_silencio_no_arruina_el_recorte() {
        // Por esto el umbral es de RMS por bloque y no por muestra: el piso de
        // ruido de un audio real tiene picos sueltos.
        let mut samples = con_silencio_final(10.0, 20.0);
        let perdido = (25.0 * SR as f32) as usize;
        samples[perdido] = 0.9;

        let duracion = useful_duration_ms(&samples, SR);
        assert!(duracion < 13_000, "el click se llevó el recorte: {duracion} ms");
    }

    #[test]
    fn un_audio_todo_en_silencio_se_devuelve_entero() {
        // Recortarlo lo dejaría en cero, o sea imposible de jugar. Mejor que
        // suene mudo y el usuario decida borrarlo.
        let samples = vec![0.0f32; SR as usize * 5];
        assert!(useful_duration_ms(&samples, SR) > 4_900);
    }

    #[test]
    fn el_recorte_nunca_se_pasa_del_audio_real() {
        // La cola se suma al último sonido, y el último sonido puede estar justo
        // al final: sin el `min` la canción diría durar más de lo que dura.
        let samples = click_track(120.0, 3.0, 0.0);
        let total = (samples.len() as f32 / SR as f32 * 1000.0) as u32;
        assert!(useful_duration_ms(&samples, SR) <= total);
    }

    /// WAV PCM 16 bits mono, escrito a mano. Es la forma de tener un archivo de
    /// audio real en un test sin meter un binario al repo.
    fn write_wav(path: &Path, samples: &[f32], sample_rate: u32) {
        const BYTES_PER_SAMPLE: u32 = 2;
        let data_len = samples.len() as u32 * BYTES_PER_SAMPLE;

        let mut out = Vec::with_capacity(44 + data_len as usize);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes()); // tamaño del chunk fmt
        out.extend_from_slice(&1u16.to_le_bytes()); // PCM sin comprimir
        out.extend_from_slice(&1u16.to_le_bytes()); // mono
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&(sample_rate * BYTES_PER_SAMPLE).to_le_bytes());
        out.extend_from_slice(&(BYTES_PER_SAMPLE as u16).to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());

        for sample in samples {
            let value = (sample.clamp(-1.0, 1.0) * 32_767.0) as i16;
            out.extend_from_slice(&value.to_le_bytes());
        }

        std::fs::write(path, out).unwrap();
    }

    #[test]
    fn analiza_un_archivo_de_audio_de_verdad() {
        // Sin esto, la ruta de decodificación no la prueba nadie: el DSP anda
        // sobre `&[f32]` y symphonia queda sin cubrir.
        let dir = std::env::temp_dir().join("sxt-analysis-archivo");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audio.wav");

        write_wav(&path, &click_track(120.0, 20.0, 0.0), SR);

        let beatmap = analyze(&path).unwrap();
        assert!((beatmap.bpm - 120.0).abs() < 2.5, "detectó {} BPM", beatmap.bpm);
        assert_eq!(beatmap.beats_per_round, 4);
        assert!((beatmap.duration_ms as i32 - 20_000).abs() < 200);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn un_archivo_que_no_es_audio_da_error_claro() {
        let dir = std::env::temp_dir().join("sxt-analysis-basura");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audio.wav");
        std::fs::write(&path, b"esto no es audio").unwrap();

        assert!(matches!(analyze(&path), Err(LibraryError::Analysis)));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Banco de pruebas contra audio real, con verdad de campo y partición.
///
/// Las señales sintéticas alcanzan para fijar propiedades —que más tempo sea
/// barra más rápida, que no se coma la mitad— pero **no** para calibrar: un tren
/// de clicks no se parece a una balada. Esto corre el análisis sobre canciones de
/// verdad y las compara con el tempo real de `bench/tempos.tsv`.
///
/// > **La partición en calibración y validación es el punto entero de esto.**
/// > Sin ella, ajustar constantes contra el mismo conjunto con el que se mide da
/// > 100% siempre y no dice nada. Ya pasó: un barrido daba 11/11 sobre señales
/// > sintéticas mientras el detector acertaba 5 de 11 canciones reales.
///
/// ```text
/// SXT_SONGS_DIR="$APPDATA/com.xiza73.spacextype/songs" \
///   cargo test --manifest-path src-tauri/Cargo.toml --release -- --ignored corpus --nocapture
/// ```
///
/// `SXT_VALIDACION=1` destapa el grupo reservado. Se usa **una vez**, al final.
#[cfg(test)]
mod banco {
    use super::*;

    /// Tolerancia estándar para dar un tempo por acertado: 4%.
    ///
    /// Es la que usa MIREX, y no es arbitraria — a 120 BPM son ±4.8 BPM, que es
    /// menos de lo que se nota siguiendo una barra.
    const TOLERANCIA: f32 = 0.04;

    struct Caso {
        id: String,
        real: f32,
        grupo: String,
        titulo: String,
    }

    fn manifiesto() -> Vec<Caso> {
        let raw = include_str!("../../bench/tempos.tsv");
        raw.lines()
            .filter(|l| !l.trim_start().starts_with('#') && !l.trim().is_empty())
            .filter_map(|l| {
                let mut campos = l.split('\t');
                Some(Caso {
                    id: campos.next()?.trim().to_string(),
                    real: campos.next()?.trim().parse().ok()?,
                    grupo: campos.next()?.trim().to_string(),
                    titulo: campos.next().unwrap_or("").trim().to_string(),
                })
            })
            .collect()
    }

    fn acierta(detectado: f32, real: f32) -> bool {
        (detectado - real).abs() <= real * TOLERANCIA
    }

    /// Acierto tolerante a la octava: vale también la mitad, el doble, y los
    /// múltiplos de tres. Separar las dos métricas dice **qué** está fallando:
    /// si esta da bien y la exacta mal, el problema es solo elegir la octava; si
    /// las dos dan mal, el tempo directamente no se encontró.
    fn acierta_con_octava(detectado: f32, real: f32) -> bool {
        [1.0, 2.0, 0.5, 3.0, 1.0 / 3.0]
            .iter()
            .any(|factor| acierta(detectado, real * factor))
    }

    #[test]
    #[ignore]
    fn corpus() {
        let Ok(dir) = std::env::var("SXT_SONGS_DIR") else {
            println!("SXT_SONGS_DIR sin definir: no hay nada que medir");
            return;
        };
        let ver_validacion = std::env::var("SXT_VALIDACION").is_ok();

        let mut resultados: Vec<(String, String, f32, f32, bool, bool)> = Vec::new();

        for caso in manifiesto() {
            if caso.grupo == "validación" && !ver_validacion {
                continue;
            }

            let carpeta = Path::new(&dir).join(&caso.id);
            let Some(audio) = std::fs::read_dir(&carpeta).ok().and_then(|mut it| {
                it.find_map(|e| {
                    let p = e.ok()?.path();
                    p.file_stem()?.to_str()?.starts_with("audio").then_some(p)
                })
            }) else {
                println!("  falta el audio de {} ({})", caso.titulo, caso.id);
                continue;
            };

            let Ok((samples, sr)) = decode(&audio) else {
                println!("  no se pudo decodificar {}", caso.titulo);
                continue;
            };

            let nov = novelty(&samples, FRAME, HOP);
            let fps = sr as f32 / HOP as f32;
            let detectado = estimate_bpm(&nov, fps);

            // Los candidatos CRUDOS, sin el peso perceptual. Sirve para separar
            // dos preguntas que no son la misma: ¿el tempo correcto está entre
            // los que se consideran? y ¿la preferencia lo está tapando?
            if std::env::var("SXT_DETALLE").is_ok() {
                let media = nov.iter().sum::<f32>() / nov.len() as f32;
                let c: Vec<f32> = nov.iter().map(|v| v - media).collect();
                let min_lag = (60.0 * fps / MAX_BPM).round().max(1.0) as usize;
                let max_lag = ((60.0 * fps / MIN_BPM).round() as usize).min(c.len() / 2);

                let mut picos: Vec<(f32, f32)> = (min_lag..=max_lag)
                    .map(|lag| {
                        let ov = c.len() - lag;
                        let r = (0..ov).map(|i| c[i] * c[i + lag]).sum::<f32>() / c.len() as f32;
                        (r, 60.0 * fps / lag as f32)
                    })
                    .collect();
                // Normalizado contra el pico más alto: los valores absolutos no
                // se pueden comparar entre canciones, las formas sí.
                let tope = picos.iter().map(|p| p.0).fold(f32::MIN, f32::max).max(1e-9);
                picos.sort_by(|a, b| b.0.total_cmp(&a.0));
                print!("    crudos:");
                for (r, bpm) in picos.iter().take(6) {
                    print!("  {bpm:.0}({:.2})", r / tope);
                }
                println!();
            }

            resultados.push((
                caso.grupo,
                caso.titulo,
                detectado,
                caso.real,
                acierta(detectado, caso.real),
                acierta_con_octava(detectado, caso.real),
            ));
        }

        for grupo in ["calibración", "validación"] {
            let del_grupo: Vec<_> = resultados.iter().filter(|r| r.0 == grupo).collect();
            if del_grupo.is_empty() {
                continue;
            }

            println!("\n=== {grupo} ===");
            println!("{:<38} {:>9} {:>7} {:>7}  ", "canción", "detectado", "real", "ratio");
            for (_, titulo, detectado, real, ok, octava) in &del_grupo {
                let marca = if *ok { "✓" } else if *octava { "~octava" } else { "✗" };
                let corto: String = titulo.chars().take(37).collect();
                println!(
                    "{corto:<38} {detectado:>9.1} {real:>7.0} {:>7.2}  {marca}",
                    detectado / real
                );
            }

            let exactos = del_grupo.iter().filter(|r| r.4).count();
            let con_octava = del_grupo.iter().filter(|r| r.5).count();
            let total = del_grupo.len();
            println!(
                "  exacto {exactos}/{total} ({:.0}%)   tolerante a octava {con_octava}/{total} ({:.0}%)",
                100.0 * exactos as f32 / total as f32,
                100.0 * con_octava as f32 / total as f32,
            );
        }

        if !ver_validacion {
            println!("\n(el grupo de validación está tapado — SXT_VALIDACION=1 para destaparlo)");
        }
        println!();
    }
}
