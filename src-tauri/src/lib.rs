mod commands;
mod jsonstore;
mod library;
mod scores;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // **El log va también en release.** Antes solo se registraba en
            // debug, así que la app instalada no dejaba rastro de nada.
            //
            // Eso choca de frente con una decisión que el código toma a
            // propósito: el stderr de `yt-dlp` y el detalle de los errores van
            // al log y NO al usuario, porque pueden filtrar rutas del sistema y
            // no le dicen nada útil a nadie. Sin log en producción ese detalle
            // no iba a ningún lado, y un fallo quedaba sin causa averiguable.
            //
            // El archivo vive en el directorio de logs de la app, al lado de la
            // biblioteca. Se acota a 512 KB y se guarda una sola rotación: es
            // para diagnosticar lo último que pasó, no un historial.
            let mut logger = tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(512 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("space-x-type".into()),
                    },
                ));

            // En desarrollo, además por consola. En release no hay consola a
            // la que escribir —la app es gráfica— y en Windows además abriría
            // una ventana negra.
            if cfg!(debug_assertions) {
                logger = logger.target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ));
            }

            app.handle().plugin(logger.build())?;

            log::info!("SPACE x TYPE {} iniciada", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_scores,
            commands::save_score,
            commands::last_score_name,
            commands::process_song,
            commands::list_songs,
            commands::delete_song,
            commands::song_beatmap,
            commands::song_audio,
            commands::set_song_bpm
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
