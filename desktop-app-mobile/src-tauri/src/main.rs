//! Fimto Concrete ERP — desktop shell.
//!
//! Thin Tauri wrapper: the UI is the already-built `website-app/dist`
//! single-file bundle. Native duties here are limited to:
//!   - persistent store (server URL + session) via tauri-plugin-store
//!   - single-instance (second launch focuses the plant window)
//!   - opening external links (help, invoices) in the system browser

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, RunEvent};

// WebKitGTK on Wayland never resizes its surface when the compositor resizes
// the window: the page keeps painting at the size the webview was created with,
// so a maximised/fullscreen window shows the UI shrunk into one corner and
// scrolling breaks. Running the same WebKitGTK build through XWayland resizes
// correctly, so the desktop flavour pins the X11 backend before GTK is
// initialised. (Android/phone builds are unaffected — native only.)
#[cfg(target_os = "linux")]
fn pin_x11_backend() {
    if std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    pin_x11_backend();

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
        // No geometry changes here on purpose: any maximize/fullscreen applied
        // after the window is mapped re-triggers the WebKit surface bug. The
        // window opens at its normal desktop size, centred, and the user is
        // free to resize, maximize or restore it.
        if let RunEvent::Ready = event {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }
    });
}
