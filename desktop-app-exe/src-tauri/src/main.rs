//! Fimto Concrete ERP — desktop shell.
//!
//! Thin Tauri wrapper: the UI is the already-built `website-app/dist`
//! single-file bundle. Native duties here are limited to:
//!   - persistent store (server URL + session) via tauri-plugin-store
//!   - single-instance (second launch focuses the plant window)
//!   - opening external links (help, invoices) in the system browser

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .run(tauri::generate_context!())
        .expect("failed to run Fimto Concrete desktop app");
}
