mod commands;
mod jsonstore;
mod library;
mod scores;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_scores,
            commands::save_score,
            commands::process_song,
            commands::list_songs,
            commands::delete_song,
            commands::song_beatmap,
            commands::song_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
