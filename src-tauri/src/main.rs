#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::Duration,
};
use tauri::{Manager, RunEvent};

#[derive(Clone, Serialize)]
struct Connection {
    url: String,
    token: String,
}

struct Backend {
    child: Child,
    connection: Connection,
}

impl Drop for Backend {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
struct BackendState(Mutex<Option<Backend>>);

fn start_backend(app: &tauri::AppHandle) -> Result<Connection, String> {
    let state = app.state::<BackendState>();
    let mut backend = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(running) = backend.as_mut() {
        if running
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Ok(running.connection.clone());
        }
    }
    let resources = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    } else {
        app.path().resource_dir().map_err(|e| e.to_string())?
    };
    let executable = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name(if cfg!(windows) {
            "remarkable-node.exe"
        } else {
            "remarkable-node"
        });
    let token = uuid::Uuid::new_v4().to_string();
    let mut command = Command::new(executable);
    command
        .arg(resources.join("resources/server/index.mjs"))
        .env("PORT", "0")
        .env("NODE_ENV", "production")
        .env("RM_DESKTOP_TOKEN", &token)
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env_remove("RM_DESKTOP_ORIGIN")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    if cfg!(debug_assertions) {
        command.env("RM_DESKTOP_ORIGIN", "http://localhost:5173");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let child = command
        .spawn()
        .map_err(|e| format!("Could not start the tablet service: {e}"))?;
    let mut running = Backend {
        child,
        connection: Connection {
            url: String::new(),
            token,
        },
    };
    let output = running
        .child
        .stdout
        .take()
        .ok_or("Tablet service has no output")?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            let Ok(line) = line else { break };
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(port) = value["port"]
                    .as_u64()
                    .filter(|port| *port > 0 && *port <= 65535)
                {
                    let _ = sender.send(port);
                }
            }
        }
    });
    let port = receiver
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| "The tablet service did not start. Close the app and try again.")?;
    running.connection.url = format!("http://127.0.0.1:{port}");
    let connection = running.connection.clone();
    *backend = Some(running);
    Ok(connection)
}

#[tauri::command]
async fn backend_connection(app: tauri::AppHandle) -> Result<Connection, String> {
    tauri::async_runtime::spawn_blocking(move || start_backend(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![backend_connection])
        .build(tauri::generate_context!())
        .expect("Could not open reMarkable WebUI");
    app.run(|app, event| {
        if matches!(event, RunEvent::Exit) {
            if let Ok(mut backend) = app.state::<BackendState>().0.lock() {
                backend.take();
            }
        }
    });
}
