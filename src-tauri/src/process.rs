use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::config::save_config;
use crate::state::{AppState, RunningProcess};

// ========================
// 事件载荷
// ========================

#[derive(Clone, serde::Serialize)]
struct LogPayload {
    service: String,
    text: String,
}

#[derive(Clone, serde::Serialize)]
struct StatusPayload {
    service: String,
    status: String,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn emit_log(app: &AppHandle, service: &str, text: String) {
    let _ = app.emit(
        "service-log",
        LogPayload {
            service: service.to_string(),
            text,
        },
    );
}

fn set_status(
    app: &AppHandle,
    service: &str,
    status: &str,
    pid: Option<u32>,
    error: Option<String>,
) {
    {
        let state = app.state::<AppState>();
        let mut running = state.running.lock().unwrap_or_else(|e| e.into_inner());
        let entry = running.entry(service.to_string()).or_insert(RunningProcess {
            pid: None,
            status: "stopped".to_string(),
            error: None,
            started_at: None,
        });
        entry.status = status.to_string();
        if pid.is_some() {
            entry.pid = pid;
        }
        if error.is_some() {
            entry.error = error;
        }
    }
    let _ = app.emit(
        "service-status-change",
        StatusPayload {
            service: service.to_string(),
            status: status.to_string(),
        },
    );
}

/// 端口是否被占用（TCP 连接探测，对应旧版 net.createServer 监听检测）
async fn port_occupied(port: u16) -> bool {
    use tokio::net::TcpStream;
    match TcpStream::connect(("127.0.0.1", port)).await {
        Ok(_) => true,
        Err(_) => false,
    }
}

fn is_still_running(app: &AppHandle, service_id: &str) -> bool {
    let state = app.state::<AppState>();
    let running = state.running.lock().unwrap_or_else(|e| e.into_inner());
    running
        .get(service_id)
        .map(|r| r.status == "running" || r.status == "starting")
        .unwrap_or(false)
}

// ========================
// 启动服务
// ========================

pub fn start_service(app: &AppHandle, service_id: &str) -> Result<(), String> {
    let (service, already_running) = {
        let state = app.state::<AppState>();
        let _cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        let sm = state.services_map.lock().unwrap_or_else(|e| e.into_inner());
        let svc = match sm.get(service_id) {
            Some(s) => s.clone(),
            None => {
                emit_log(app, service_id, format!("[ERROR] 未知服务: {}\n", service_id));
                return Err("未知服务".to_string());
            }
        };
        let running = state.running.lock().unwrap_or_else(|e| e.into_inner());
        let ar = running
            .get(service_id)
            .map(|r| r.status == "running" || r.status == "starting")
            .unwrap_or(false);
        (svc, ar)
    };

    if already_running {
        emit_log(
            app,
            service_id,
            format!(
                "[WARN] 服务 {} 已在运行中 (PID: {:?})\n",
                service.label,
                service_id
            ),
        );
        return Err("服务已在运行".to_string());
    }

    let cmd_str = service.command_string();
    emit_log(
        app,
        service_id,
        format!("[INFO] 正在启动 {} ...\n", service.label),
    );
    emit_log(app, service_id, format!("[INFO] 路径: {}\n", service.cwd));
    emit_log(app, service_id, format!("[INFO] 命令: {}\n", cmd_str));
    emit_log(
        app,
        service_id,
        format!(
            "[INFO] 端口: {}\n",
            if service.port > 0 {
                service.port.to_string()
            } else {
                "无".to_string()
            }
        ),
    );
    emit_log(app, service_id, "─".repeat(60) + "\n");

    set_status(app, service_id, "starting", None, None);

    // 校验工作目录是否存在（仅对绝对路径）：Windows 上若 cwd 无效，CreateProcess 会静默失败且无明确错误
    let cwd_path = std::path::Path::new(&service.cwd);
    if !service.cwd.trim().is_empty() && cwd_path.is_absolute() && !cwd_path.is_dir() {
        let msg = format!("工作目录不存在: {}", service.cwd);
        emit_log(app, service_id, format!("[ERROR] {}\n", msg));
        set_status(app, service_id, "failed", None, Some(msg.clone()));
        return Err(msg);
    }

    let shell = app.shell();
    #[cfg(windows)]
    let command = shell
        .command("cmd")
        .args(["/c", &service.command])
        .args(&service.args);
    #[cfg(not(windows))]
    let command = shell.command(&service.command).args(&service.args);

    let command = command.current_dir(service.cwd.as_str()).env("FORCE_COLOR", "1");

    let (mut rx, child): (_, CommandChild) = match command.spawn() {
        Ok(v) => v,
        Err(e) => {
            emit_log(
                app,
                service_id,
                format!("[ERROR] 启动失败: {}\n", e),
            );
            set_status(
                app,
                service_id,
                "failed",
                None,
                Some(format!("启动失败: {}", e)),
            );
            return Err(format!("启动失败: {}", e));
        }
    };

    let pid = Some(child.pid());
    {
        let state = app.state::<AppState>();
        let mut running = state.running.lock().unwrap_or_else(|e| e.into_inner());
        running.insert(
            service_id.to_string(),
            RunningProcess {
                pid,
                status: "starting".to_string(),
                error: None,
                started_at: Some(now_ms()),
            },
        );
    }

    let app_clone = app.clone();
    let sid = service_id.to_string();
    let port = service.port;

    // 跟踪是否成功进入“运行中”状态 + 收集最后的 stderr，用于准确判断启动成败
    let reached_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let last_stderr = std::sync::Arc::new(std::sync::Mutex::new(String::new()));

    tauri::async_runtime::spawn(async move {
        // 端口就绪 / 无端口启动反馈
        let port_watcher = if port > 0 {
            let app2 = app_clone.clone();
            let sid2 = sid.clone();
            let reached = reached_running.clone();
            Some(tauri::async_runtime::spawn(async move {
                let mut attempts = 0u32;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    attempts += 1;
                    if !is_still_running(&app2, &sid2) {
                        return;
                    }
                    if port_occupied(port).await {
                        reached.store(true, std::sync::atomic::Ordering::SeqCst);
                        emit_log(
                            &app2,
                            &sid2,
                            format!("[OK] 端口 {} 已就绪，服务启动成功!\n", port),
                        );
                        set_status(&app2, &sid2, "running", None, None);
                        return;
                    }
                    if attempts >= 120 {
                        // 超时仍未监听到端口：若进程已退出则标记失败，否则保守标记为运行中
                        if is_still_running(&app2, &sid2) {
                            reached.store(true, std::sync::atomic::Ordering::SeqCst);
                            emit_log(
                                &app2,
                                &sid2,
                                "[WARN] 端口检测超时，标记为运行中（服务可能不监听端口）\n".into(),
                            );
                            set_status(&app2, &sid2, "running", None, None);
                        } else {
                            emit_log(
                                &app2,
                                &sid2,
                                "[ERROR] 进程已退出且端口未就绪，启动失败\n".into(),
                            );
                            set_status(
                                &app2,
                                &sid2,
                                "failed",
                                None,
                                Some("进程已退出，端口未就绪".into()),
                            );
                        }
                        return;
                    }
                }
            }))
        } else {
            let app2 = app_clone.clone();
            let sid2 = sid.clone();
            let reached = reached_running.clone();
            Some(tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                if is_still_running(&app2, &sid2) {
                    reached.store(true, std::sync::atomic::Ordering::SeqCst);
                    emit_log(&app2, &sid2, "[OK] 服务已启动\n".into());
                    set_status(&app2, &sid2, "running", None, None);
                } else {
                    emit_log(
                        &app2,
                        &sid2,
                        "[ERROR] 进程已退出，服务启动失败\n".into(),
                    );
                    set_status(
                        &app2,
                        &sid2,
                        "failed",
                        None,
                        Some("进程已退出（命令可能未找到或执行出错）".into()),
                    );
                }
            }))
        };

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    emit_log(&app_clone, &sid, text.clone());
                    if text.contains("[OK]") && text.contains("已就绪") {
                        reached_running.store(true, std::sync::atomic::Ordering::SeqCst);
                        set_status(&app_clone, &sid, "running", None, None);
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    if let Ok(mut b) = last_stderr.lock() {
                        b.push_str(&text);
                        // 仅保留尾部，避免无限增长
                        if b.len() > 2000 {
                            let split_at = b.len() - 2000;
                            *b = b.split_off(split_at);
                        }
                    }
                    emit_log(&app_clone, &sid, format!("[STDERR] {}", text));
                }
                CommandEvent::Terminated(payload) => {
                    emit_log(&app_clone, &sid, "─".repeat(60) + "\n");
                    emit_log(
                        &app_clone,
                        &sid,
                        format!("[INFO] 服务 {} 已退出 (exit code: {:?})\n", sid, payload.code),
                    );
                    if let Some(h) = port_watcher {
                        h.abort();
                    }
                    {
                        let state = app_clone.state::<AppState>();
                        let mut running = state.running.lock().unwrap_or_else(|e| e.into_inner());
                        running.remove(&sid);
                    }
                    // 若从未进入“运行中”且进程退出，则标记为失败并附带原因，避免假绿（误以为启动成功）
                    if !reached_running.load(std::sync::atomic::Ordering::SeqCst) {
                        let reason = {
                            let stderr_tail = last_stderr
                                .lock()
                                .map(|b| b.trim().to_string())
                                .unwrap_or_default();
                            if stderr_tail.is_empty() {
                                format!("进程退出 (code {:?})，服务未能启动", payload.code)
                            } else {
                                let last_line = stderr_tail.lines().last().unwrap_or("").trim();
                                format!("启动失败 (code {:?}): {}", payload.code, last_line)
                            }
                        };
                        set_status(&app_clone, &sid, "failed", None, Some(reason));
                    } else {
                        set_status(&app_clone, &sid, "stopped", None, None);
                    }
                    return;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

// ========================
// 停止服务
// ========================

fn kill_process_tree(app: AppHandle, pid: u32) {
    tauri::async_runtime::spawn(async move {
        let shell = app.shell();
        #[cfg(windows)]
        let _ = shell
            .command("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .status()
            .await;
        #[cfg(not(windows))]
        let _ = shell
            .command("sh")
            .args([
                "-c",
                &format!("kill -9 -{} 2>/dev/null; kill -9 {} 2>/dev/null", pid, pid),
            ])
            .status()
            .await;
    });
}

pub fn stop_service(app: &AppHandle, service_id: &str) -> Result<(), String> {
    let (label, pid) = {
        let state = app.state::<AppState>();
        let sm = state.services_map.lock().unwrap_or_else(|e| e.into_inner());
        let running = state.running.lock().unwrap_or_else(|e| e.into_inner());
        let label = sm
            .get(service_id)
            .map(|s| s.label.clone())
            .unwrap_or_else(|| service_id.to_string());
        let pid = running.get(service_id).and_then(|r| r.pid);
        (label, pid)
    };

    let not_running = {
        let state = app.state::<AppState>();
        let x = !state.running.lock().unwrap_or_else(|e| e.into_inner()).contains_key(service_id);
        x
    };
    if not_running {
        set_status(app, service_id, "stopped", None, None);
        return Ok(());
    }

    emit_log(
        app,
        service_id,
        format!("[INFO] 正在停止 {} (PID: {:?}) ...\n", label, pid),
    );
    set_status(app, service_id, "stopping", None, None);
    {
        let state = app.state::<AppState>();
        state.stopping.lock().unwrap_or_else(|e| e.into_inner()).insert(service_id.to_string());
    }

    if let Some(pid) = pid {
        kill_process_tree(app.clone(), pid);
    }

    {
        let state = app.state::<AppState>();
        state.running.lock().unwrap_or_else(|e| e.into_inner()).remove(service_id);
        state.stopping.lock().unwrap_or_else(|e| e.into_inner()).remove(service_id);
    }
    set_status(app, service_id, "stopped", None, None);
    Ok(())
}

// ========================
// 状态查询
// ========================

pub async fn get_service_status(app: &AppHandle, service_id: &str) -> String {
    let (has_port, port, in_running) = {
        let state = app.state::<AppState>();
        let sm = state.services_map.lock().unwrap_or_else(|e| e.into_inner());
        let running = state.running.lock().unwrap_or_else(|e| e.into_inner());
        let svc = sm.get(service_id);
        let in_running = running.get(service_id).map(|r| r.status.clone());
        (
            svc.map(|s| s.port > 0).unwrap_or(false),
            svc.map(|s| s.port).unwrap_or(0),
            in_running,
        )
    };

    if let Some(st) = in_running {
        if st == "running" || st == "starting" {
            if has_port {
                if port_occupied(port).await {
                    return st;
                }
                return "starting".to_string();
            }
            return st;
        }
    }
    if has_port && port_occupied(port).await {
        return "running".to_string();
    }
    "stopped".to_string()
}

pub async fn get_all_status(app: &AppHandle) -> HashMap<String, String> {
    let ids: Vec<String> = {
        let state = app.state::<AppState>();
        let x = state.services_map.lock().unwrap_or_else(|e| e.into_inner()).keys().cloned().collect();
        x
    };
    let mut map = HashMap::new();
    for id in ids {
        let st = get_service_status(app, &id).await;
        map.insert(id, st);
    }
    map
}

pub async fn stop_all_services(app: &AppHandle) {
    let ids: Vec<String> = {
        let state = app.state::<AppState>();
        let x = state.running.lock().unwrap_or_else(|e| e.into_inner()).keys().cloned().collect();
        x
    };
    for id in ids {
        let _ = stop_service(app, &id);
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }
}

// ========================
// 开机自启动
// ========================

pub fn sync_autostart(app: &AppHandle) {
    let enabled = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).settings.auto_start;
    let mgr = app.autolaunch();
    if enabled {
        let _ = mgr.enable();
    } else {
        let _ = mgr.disable();
    }
}

pub fn set_auto_start(app: &AppHandle, enabled: bool) {
    {
        let state = app.state::<AppState>();
        state.config.lock().unwrap_or_else(|e| e.into_inner()).settings.auto_start = enabled;
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        save_config(app, &cfg);
    }
    let mgr = app.autolaunch();
    if enabled {
        let _ = mgr.enable();
    } else {
        let _ = mgr.disable();
    }
}

// ========================
// 退出请求
// ========================

pub fn request_quit(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        stop_all_services(&app).await;
        // 通知渲染进程应用即将关闭（对应原 onAppShutdownReady 订阅）
        let _ = app.emit("app-shutdown-ready", ());
        app.exit(0);
    });
}

// ========================
// 周期性内存清理（防泄漏；Rust 自带 GC，仅做防御性清理）
// ========================

pub fn start_memory_cleanup(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            let state = app.state::<AppState>();
            let mut stopping = state.stopping.lock().unwrap_or_else(|e| e.into_inner());
            stopping.retain(|id| {
                let running = state.running.lock().unwrap_or_else(|e| e.into_inner());
                running
                    .get(id)
                    .map(|r| r.status == "stopping" || r.status == "running")
                    .unwrap_or(false)
            });
        }
    });
}
