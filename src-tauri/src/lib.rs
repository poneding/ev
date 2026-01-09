mod env_apply;

use tauri::Manager;
#[cfg(windows)]
use tauri::path::BaseDirectory;
#[cfg(not(target_os = "macos"))]
use tauri::WebviewWindow;

#[derive(serde::Serialize)]
struct EnvVar {
    key: String,
    value: String,
}

#[derive(serde::Serialize)]
struct IntegrationInfo {
    config_dir: String,
    ev_dir: String,
    reveal_target: String,
    source_zsh: Option<String>,
    source_bash: Option<String>,
    source_fish: Option<String>,
    note: String,
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn get_current_env() -> Vec<EnvVar> {
    std::env::vars()
        .map(|(key, value)| EnvVar { key, value })
        .collect()
}

#[tauri::command]
fn get_integration_info(app: tauri::AppHandle) -> Result<IntegrationInfo, String> {
    #[cfg(windows)]
    let config_base = app.path().resolve("", BaseDirectory::Config).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let ev_dir = env_apply::config_dir_from_base(&config_base);
    #[cfg(windows)]
    let config_dir = config_base.to_string_lossy().to_string();
    #[cfg(windows)]
    let ev_dir_s = ev_dir.to_string_lossy().to_string();

    #[cfg(windows)]
    {
        std::fs::create_dir_all(&ev_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(not(windows))]
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    let ev_dir = env_apply::config_dir_from_home(&home);
    #[cfg(not(windows))]
    let config_dir = home.to_string_lossy().to_string();
    #[cfg(not(windows))]
    let ev_dir_s = ev_dir.to_string_lossy().to_string();

    #[cfg(not(windows))]
    {
        std::fs::create_dir_all(&ev_dir).map_err(|e| e.to_string())?;
    }

    // Create a stable reveal target inside ev_dir, so "reveal" opens the ev_dir (not just its parent).
    let reveal_target = ev_dir.join(".keep");
    if !reveal_target.exists() {
        let _ = std::fs::write(&reveal_target, ""); // ignore errors; open_path may still work
    }
    let reveal_target_s = reveal_target.to_string_lossy().to_string();

    #[cfg(windows)]
    let info = IntegrationInfo {
        config_dir,
        ev_dir: ev_dir_s,
        reveal_target: reveal_target_s,
        source_zsh: None,
        source_bash: None,
        source_fish: None,
        note: "Windows uses user-level environment variables (HKCU). New terminals/apps will pick up updates.".to_string(),
    };

    #[cfg(not(windows))]
    let info = IntegrationInfo {
        config_dir,
        ev_dir: ev_dir_s.clone(),
        reveal_target: reveal_target_s,
        source_zsh: Some(format!("source \"{}/ev.zsh\"", ev_dir_s)),
        source_bash: Some(format!("source \"{}/ev.sh\"", ev_dir_s)),
        source_fish: Some(format!("source \"{}/ev.fish\"", ev_dir_s)),
        note: "macOS/Linux uses shell integration files. Add the source line to your shell rc and reload, or open a new terminal.".to_string(),
    };

    Ok(info)
}

#[tauri::command]
fn apply_group(app: tauri::AppHandle, group_id: String, content: String) -> Result<env_apply::ApplyResponse, String> {
    let _ = group_id; // reserved for future: persist active group id on Rust side if needed
    #[cfg(windows)]
    let dir = {
        let config_base = app.path().resolve("", BaseDirectory::Config).map_err(|e| e.to_string())?;
        env_apply::config_dir_from_base(&config_base)
    };
    #[cfg(not(windows))]
    let dir = {
        let home = app.path().home_dir().map_err(|e| e.to_string())?;
        env_apply::config_dir_from_home(&home)
    };
    let parsed = env_apply::parse_dotenv_like(&content)?;
    env_apply::apply_platform(&dir, &parsed)
}

#[tauri::command]
fn disable_group(app: tauri::AppHandle) -> Result<env_apply::ApplyResponse, String> {
    #[cfg(windows)]
    let dir = {
        let config_base = app.path().resolve("", BaseDirectory::Config).map_err(|e| e.to_string())?;
        env_apply::config_dir_from_base(&config_base)
    };
    #[cfg(not(windows))]
    let dir = {
        let home = app.path().home_dir().map_err(|e| e.to_string())?;
        env_apply::config_dir_from_home(&home)
    };
    env_apply::disable_platform(&dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                // Ensure layout doesn't break by preventing the window from being resized too narrow.
                let _ = win.set_min_size(Some(tauri::LogicalSize::new(960.0, 600.0)));

                // We want macOS traffic lights (native titlebar) but custom decorations elsewhere.
                #[cfg(not(target_os = "macos"))]
                {
                    // Ignore errors (some platforms/window managers may not support toggling).
                    let _ = win.set_decorations(false);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_current_env,
            get_integration_info,
            apply_group,
            disable_group
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
