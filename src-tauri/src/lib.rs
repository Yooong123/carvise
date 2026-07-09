mod commands;
mod config;
mod port;
mod process;
mod state;

use state::AppState;
use tauri::{
    Manager, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 捕获 panic 并落盘，便于排查「前端只收到 Unknown error、无详细信息」的启动失败。
    // 配合 profile.release 的 panic="unwind"，命令内 panic 会被 Tauri 转成可读错误而非崩进程。
    std::panic::set_hook(Box::new(|info| {
        let msg = info.to_string();
        if let Some(base) = dirs::config_dir() {
            let dir = base.join("com.carvis.app");
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::write(dir.join("panic.log"), &msg);
        }
    }));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            // 加载配置并初始化运行时状态（含旧版 Electron 配置迁移）
            let app_state = AppState::new(app.handle());
            app.manage(app_state);

            // 系统托盘（打开 / 退出）
            create_tray(app.handle())?;

            // 同步开机自启动设置
            process::sync_autostart(app.handle());

            // 启动周期性内存清理（防泄漏）
            process::start_memory_cleanup(app.app_handle().clone());

            // 兜底：窗口在 tauri.conf.json 中设为 visible:false，依赖前端调用
            // show_main_window 显示。若前端因任何原因（IPC 被拒 / JS 异常）未能显示，
            // 4s 后由 Rust 强制显示，避免窗口永久不可见（表现为“安装后无法启动”）。
            let fallback_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
                if let Some(w) = fallback_handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(false) {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let minimize = {
                    let state = app.state::<AppState>();
                    let x = state.config.lock().unwrap_or_else(|e| e.into_inner()).settings.minimize_to_tray;
                    x
                };
                // 始终拦截默认关闭，按设置决定「最小化到托盘」或「停止服务后退出」
                api.prevent_close();
                if minimize {
                    let _ = window.hide();
                } else {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        process::stop_all_services(&app_clone).await;
                        app_clone.exit(0);
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_services_config,
            commands::get_full_config,
            commands::save_config,
            commands::get_settings,
            commands::save_settings,
            commands::get_auto_start,
            commands::set_auto_start,
            commands::minimize_window,
            commands::maximize_window,
            commands::close_window,
            commands::show_main_window,
            commands::open_folder,
            commands::open_url,
            commands::start_service,
            commands::stop_service,
            commands::get_service_status,
            commands::get_all_status,
            commands::kill_port,
            commands::get_port_status,
            commands::pin_port,
            commands::unpin_port,
            commands::clean_all_ports,
            commands::get_groups,
            commands::add_group,
            commands::remove_group,
            commands::rename_group,
            commands::update_group_services,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running Carvis");
}

/// 创建系统托盘与右键菜单（对应 Electron createTray）
fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open", "打开 Carvis", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

    let icon = match app.default_window_icon() {
        Some(i) => i.clone(),
        None => return Ok(()),
    };

    TrayIconBuilder::with_id("carvis-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                process::request_quit(app.clone());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
