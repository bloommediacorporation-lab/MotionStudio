use tauri::{AppHandle, Emitter, Manager};
use std::sync::{Arc, Mutex};
use rdev::{listen, Event, EventType};
use serde::Serialize;

#[derive(Clone, Serialize)]
struct MouseMovePayload {
    x: f64,
    y: f64,
}

#[derive(Clone, Serialize)]
struct MouseClickPayload {
    x: f64,
    y: f64,
    button: String,
}

lazy_static::lazy_static! {
    static ref IS_TRACKING: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
    static ref LAST_X: Arc<Mutex<f64>> = Arc::new(Mutex::new(0.0));
    static ref LAST_Y: Arc<Mutex<f64>> = Arc::new(Mutex::new(0.0));
}

#[tauri::command]
fn start_mouse_tracking() {
    let mut tracking = IS_TRACKING.lock().unwrap();
    *tracking = true;
}

#[tauri::command]
fn stop_mouse_tracking() {
    let mut tracking = IS_TRACKING.lock().unwrap();
    *tracking = false;
}

#[tauri::command]
async fn call_gemini(prompt: String) -> Result<String, String> {
    // Keep Gemini API key secure on the Rust backend
    let api_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        return Err("GEMINI_API_KEY not set in Rust backend".to_string());
    }
    
    // Here you would use reqwest to call the Gemini API
    // Example placeholder response:
    Ok(format!("Simulated Gemini response for: {}", prompt))
}

#[tauri::command]
async fn save_recording(file_path: String, data: Vec<u8>) -> Result<(), String> {
    // File system operations handled securely in Rust
    std::fs::write(&file_path, data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            std::thread::spawn(move || {
                let callback = move |event: Event| {
                    let is_tracking = *IS_TRACKING.lock().unwrap();
                    if !is_tracking {
                        return;
                    }

                    match event.event_type {
                        EventType::MouseMove { x, y } => {
                            *LAST_X.lock().unwrap() = x;
                            *LAST_Y.lock().unwrap() = y;
                            let _ = app_handle.emit("global-mouse-move", MouseMovePayload { x, y });
                        }
                        EventType::ButtonPress(button) => {
                            let x = *LAST_X.lock().unwrap();
                            let y = *LAST_Y.lock().unwrap();
                            let btn_str = match button {
                                rdev::Button::Left => "left",
                                rdev::Button::Right => "right",
                                rdev::Button::Middle => "middle",
                                _ => "unknown",
                            };
                            let _ = app_handle.emit("global-mouse-click", MouseClickPayload { x, y, button: btn_str.to_string() });
                        }
                        _ => {}
                    }
                };

                if let Err(error) = listen(callback) {
                    println!("Error: {:?}", error);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![call_gemini, save_recording, start_mouse_tracking, stop_mouse_tracking])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
