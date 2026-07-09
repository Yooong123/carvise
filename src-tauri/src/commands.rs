use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use serde_json::{json, Value};

use crate::config::{save_config as persist_config, AppConfig, AppSettings, GroupConfig};
use crate::state::AppState;
use crate::process;
use crate::port;

static GROUP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn gen_group_id() -> String {
    let n = GROUP_COUNTER.fetch_add(1, Ordering::SeqCst);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    format!("group-{}-{}", now, n)
}

// ========================
// 应用信息
// ========================

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

// ========================
// 配置管理
// ========================

#[tauri::command]
pub fn get_services_config(app: AppHandle) -> Value {
    let state = app.state::<AppState>();
    let sm = state.services_map.lock().unwrap_or_else(|e| e.into_inner());
    let services: Vec<Value> = sm
        .values()
        .map(|s| {
            json!({
                "id": s.id,
                "name": s.name,
                "label": s.label,
                "port": s.port,
                "cwd": s.cwd,
                "command": s.command_string()
            })
        })
        .collect();
    json!({ "success": true, "data": services })
}

#[tauri::command]
pub fn get_full_config(app: AppHandle) -> Value {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    json!({ "success": true, "data": serde_json::to_value(&*cfg).unwrap_or(Value::Null) })
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Value {
    {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        *cfg = config;
        crate::config::normalize(&mut *cfg);
    }
    {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        persist_config(&app, &cfg);
    }
    app.state::<AppState>().rebuild_indexes();
    json!({ "success": true })
}

// ========================
// 应用设置
// ========================

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Value {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    json!({ "success": true, "data": serde_json::to_value(&cfg.settings).unwrap_or(Value::Null) })
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Value {
    {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        cfg.settings = settings;
        crate::config::normalize(&mut cfg);
    }
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    persist_config(&app, &cfg);
    json!({ "success": true })
}

#[tauri::command]
pub fn get_auto_start(app: AppHandle) -> Value {
    let enabled = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).settings.auto_start;
    json!({ "success": true, "data": { "autoStart": enabled } })
}

#[tauri::command]
pub fn set_auto_start(app: AppHandle, enabled: bool) -> Value {
    process::set_auto_start(&app, enabled);
    json!({ "success": true, "data": { "autoStart": enabled } })
}

// ========================
// 窗口控制
// ========================

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Value {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
    json!({ "success": true })
}

#[tauri::command]
pub fn maximize_window(app: AppHandle) -> Value {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
    json!({ "success": true })
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Value {
    if let Some(w) = app.get_webview_window("main") {
        // 与 on_window_event 的 CloseRequested 行为保持一致：
        // 按「关闭时最小化到托盘」设置决定隐藏窗口或停止服务后退出
        let minimize = {
            let state = app.state::<AppState>();
            let x = state.config.lock().unwrap_or_else(|e| e.into_inner()).settings.minimize_to_tray;
            x
        };
        if minimize {
            let _ = w.hide();
        } else {
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                process::stop_all_services(&app_clone).await;
                app_clone.exit(0);
            });
        }
    }
    json!({ "success": true })
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Value {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    json!({ "success": true })
}

// ========================
// 文件 / 链接打开
// ========================

#[tauri::command]
pub fn open_folder(app: AppHandle, folder_path: String) -> Value {
    if folder_path.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid path" });
    }
    let _ = app.opener().open_path(folder_path, None::<&str>);
    json!({ "success": true })
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Value {
    if url.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid URL" });
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return json!({ "success": false, "error": "Invalid protocol" });
    }
    let _ = app.opener().open_url(url, None::<&str>);
    json!({ "success": true })
}

// ========================
// 服务控制
// ========================

#[tauri::command]
pub fn start_service(app: AppHandle, service_id: String) -> Value {
    if service_id.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid service ID" });
    }
    match process::start_service(&app, &service_id) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
pub fn stop_service(app: AppHandle, service_id: String) -> Value {
    if service_id.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid service ID" });
    }
    match process::stop_service(&app, &service_id) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
pub async fn get_service_status(app: AppHandle, service_id: String) -> Value {
    if service_id.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid service ID" });
    }
    let st = process::get_service_status(&app, &service_id).await;
    json!({ "success": true, "data": st })
}

#[tauri::command]
pub async fn get_all_status(app: AppHandle) -> Value {
    let map = process::get_all_status(&app).await;
    json!({ "success": true, "data": map })
}

// ========================
// 端口清理
// ========================

#[tauri::command]
pub async fn kill_port(app: AppHandle, port: i32) -> Value {
    let p = port as u16;
    if p == 0 || p > 65535 {
        return json!({ "success": false, "error": "Invalid port number" });
    }
    port::kill_port(&app, p).await
}

#[tauri::command]
pub async fn get_port_status(app: AppHandle, port: i32) -> Value {
    let p = port as u16;
    if p == 0 || p > 65535 {
        return json!({ "success": false, "error": "Invalid port number" });
    }
    let st = port::get_port_status(&app, p).await;
    json!({ "success": true, "data": st })
}

#[tauri::command]
pub fn pin_port(app: AppHandle, port: i32) -> Value {
    let p = port as u16;
    if p == 0 || p > 65535 {
        return json!({ "success": false, "error": "Invalid port number" });
    }
    port::pin_port(&app, p)
}

#[tauri::command]
pub fn unpin_port(app: AppHandle, port: i32) -> Value {
    let p = port as u16;
    if p == 0 || p > 65535 {
        return json!({ "success": false, "error": "Invalid port number" });
    }
    port::unpin_port(&app, p)
}

#[tauri::command]
pub async fn clean_all_ports(app: AppHandle) -> Value {
    let res = port::clean_all_ports(&app).await;
    json!({ "success": true, "data": res })
}

// ========================
// 服务分组管理
// ========================

#[tauri::command]
pub fn get_groups(app: AppHandle) -> Value {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    json!({ "success": true, "data": serde_json::to_value(&cfg.groups).unwrap_or(Value::Null) })
}

#[tauri::command]
pub fn add_group(app: AppHandle, name: String) -> Value {
    if name.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid group name" });
    }
    let new_group = GroupConfig {
        id: gen_group_id(),
        name: name.trim().to_string(),
        service_ids: vec![],
        expanded: false,
        color: String::new(),
    };
    {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        cfg.groups.push(new_group.clone());
        crate::config::normalize(&mut cfg);
        let clone = cfg.clone();
        persist_config(&app, &clone);
    }
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    persist_config(&app, &cfg);
    json!({ "success": true, "data": new_group })
}

#[tauri::command]
pub fn remove_group(app: AppHandle, group_id: String) -> Value {
    if group_id.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid group ID" });
    }
    {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        cfg.groups.retain(|g| g.id != group_id);
        let clone = cfg.clone();
        persist_config(&app, &clone);
    }
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    persist_config(&app, &cfg);
    json!({ "success": true })
}

#[tauri::command]
pub fn rename_group(app: AppHandle, group_id: String, new_name: String) -> Value {
    if group_id.trim().is_empty() || new_name.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid parameters" });
    }
    {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(g) = cfg.groups.iter_mut().find(|g| g.id == group_id) {
            g.name = new_name.trim().to_string();
        }
        let clone = cfg.clone();
        persist_config(&app, &clone);
    }
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    persist_config(&app, &cfg);
    json!({ "success": true })
}

#[tauri::command]
pub fn update_group_services(app: AppHandle, group_id: String, service_ids: Vec<String>) -> Value {
    if group_id.trim().is_empty() {
        return json!({ "success": false, "error": "Invalid parameters" });
    }
    {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(g) = cfg.groups.iter_mut().find(|g| g.id == group_id) {
            let sm = state.services_map.lock().unwrap_or_else(|e| e.into_inner());
            g.service_ids = service_ids
                .iter()
                .filter(|id| sm.contains_key(*id))
                .cloned()
                .collect();
        }
        let clone = cfg.clone();
        persist_config(&app, &clone);
    }
    let cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    persist_config(&app, &cfg);
    json!({ "success": true })
}
