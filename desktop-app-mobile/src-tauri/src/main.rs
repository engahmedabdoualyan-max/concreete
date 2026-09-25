//! Fimto Concrete ERP — desktop shell.
//!
//! Thin Tauri wrapper: the UI is the already-built `website-app/dist`
//! single-file bundle. Native duties here are limited to:
//!   - persistent store (server URL + session) via tauri-plugin-store
//!   - single-instance (second launch focuses the plant window)
//!   - opening external links (help, invoices) in the system browser

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, RunEvent};

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .build(tauri::generate_context!())
        .expect("failed to build Fimto Concrete desktop app");

    app.run(|app_handle, event| {
        // The window is created hidden (see `visible: false` in tauri.conf.json).
        // GTK/Wayland ignores a maximize request made before the window is
        // mapped, and maximizing *after* the page has painted leaves the
        // webview surface at its old phone size — the UI then renders in a
        // corner of a full-screen window and scrolling breaks. So: maximize
        // first, show the window afterwards, and the very first paint already
        // happens at the final size.
        if let RunEvent::Ready = event {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.maximize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
