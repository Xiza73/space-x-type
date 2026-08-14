//! FFT radix-2, lo mínimo para calcular un espectro de magnitud.
//!
//! **Por qué a mano y no una dependencia.** Lo único que hace falta es la
//! transformada de una ventana real de tamaño fijo potencia de dos. Eso son
//! cuarenta líneas que se prueban contra una DFT directa —está el test— y evitan
//! arrastrar `rustfft` con sus cinco dependencias transitivas a una app que hoy
//! no tiene ninguna para esto. Si algún día hiciera falta rendimiento de verdad
//! o tamaños arbitrarios, el camino de salida es cambiar este módulo por
//! `rustfft` sin tocar a quien lo llama.

/// Transformada in-place. `re` e `im` tienen que medir lo mismo y ser potencia
/// de dos.
///
/// Los factores de giro se llevan por recurrencia en `f64` a propósito: en `f32`
/// el error se acumula a lo largo de la etapa y ensucia los bins agudos, que es
/// justo donde vive la información de los ataques.
pub fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    debug_assert_eq!(n, im.len());
    debug_assert!(n.is_power_of_two());

    // Permutación por inversión de bits: deja las entradas en el orden que
    // necesitan las mariposas para trabajar en el lugar.
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }

    let mut len = 2usize;
    while len <= n {
        let angle = -2.0 * std::f64::consts::PI / len as f64;
        let (step_re, step_im) = (angle.cos(), angle.sin());
        let half = len / 2;

        let mut base = 0usize;
        while base < n {
            let (mut w_re, mut w_im) = (1.0f64, 0.0f64);
            for k in 0..half {
                let (a, b) = (base + k, base + k + half);
                let (ur, ui) = (re[a], im[a]);
                let vr = re[b] * w_re as f32 - im[b] * w_im as f32;
                let vi = re[b] * w_im as f32 + im[b] * w_re as f32;

                re[a] = ur + vr;
                im[a] = ui + vi;
                re[b] = ur - vr;
                im[b] = ui - vi;

                let next_re = w_re * step_re - w_im * step_im;
                w_im = w_re * step_im + w_im * step_re;
                w_re = next_re;
            }
            base += len;
        }
        len <<= 1;
    }
}

/// Ventana de Hann.
///
/// Sin ventana, cortar el audio en bloques mete un salto en los extremos que la
/// FFT lee como un ataque: aparecería un golpe en cada cuadro, o sea en ninguno.
pub fn hann(size: usize) -> Vec<f32> {
    (0..size)
        .map(|i| {
            let phase = 2.0 * std::f32::consts::PI * i as f32 / size as f32;
            0.5 * (1.0 - phase.cos())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// DFT directa: la definición, sin optimizar. Es el patrón de oro contra el
    /// que se mide la rápida.
    fn dft(input: &[f32]) -> Vec<(f32, f32)> {
        let n = input.len();
        (0..n)
            .map(|k| {
                let mut re = 0.0f64;
                let mut im = 0.0f64;
                for (t, x) in input.iter().enumerate() {
                    let angle = -2.0 * std::f64::consts::PI * (k * t) as f64 / n as f64;
                    re += *x as f64 * angle.cos();
                    im += *x as f64 * angle.sin();
                }
                (re as f32, im as f32)
            })
            .collect()
    }

    #[test]
    fn coincide_con_la_dft_directa() {
        // 128 puntos de una señal cualquiera pero determinista.
        let input: Vec<f32> = (0..128)
            .map(|i| {
                let t = i as f32;
                (t * 0.37).sin() + 0.5 * (t * 1.9).cos() + 0.2 * (t * 0.05).sin()
            })
            .collect();

        let esperado = dft(&input);
        let mut re = input.clone();
        let mut im = vec![0.0f32; input.len()];
        fft(&mut re, &mut im);

        for (k, (er, ei)) in esperado.iter().enumerate() {
            assert!(
                (re[k] - er).abs() < 1e-2 && (im[k] - ei).abs() < 1e-2,
                "bin {k}: esperaba ({er}, {ei}), dio ({}, {})",
                re[k],
                im[k]
            );
        }
    }

    #[test]
    fn una_senoidal_pura_cae_en_su_bin() {
        const N: usize = 1024;
        const BIN: usize = 64;

        let mut re: Vec<f32> = (0..N)
            .map(|i| (2.0 * std::f32::consts::PI * BIN as f32 * i as f32 / N as f32).sin())
            .collect();
        let mut im = vec![0.0f32; N];
        fft(&mut re, &mut im);

        let magnitudes: Vec<f32> = (0..N / 2).map(|k| (re[k] * re[k] + im[k] * im[k]).sqrt()).collect();
        let pico = magnitudes
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .map(|(k, _)| k)
            .unwrap();

        assert_eq!(pico, BIN, "el pico cayó en {pico}");
    }

    #[test]
    fn el_continuo_va_todo_al_bin_cero() {
        let mut re = vec![1.0f32; 64];
        let mut im = vec![0.0f32; 64];
        fft(&mut re, &mut im);

        assert!((re[0] - 64.0).abs() < 1e-3, "bin 0 dio {}", re[0]);
        for k in 1..64 {
            let magnitud = (re[k] * re[k] + im[k] * im[k]).sqrt();
            assert!(magnitud < 1e-2, "bin {k} dio {magnitud}");
        }
    }

    #[test]
    fn la_ventana_de_hann_se_apaga_en_los_bordes() {
        let w = hann(64);
        assert!(w[0].abs() < 1e-6, "el primer valor es {}", w[0]);
        // El máximo cae en el medio.
        assert!((w[32] - 1.0).abs() < 1e-6, "el centro es {}", w[32]);
    }
}
