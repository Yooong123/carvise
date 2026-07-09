use std::collections::HashSet;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

use crate::config::save_config;
use crate::process::emit_log;
use crate::state::AppState;

// ========================
// 端口占用 PID 探测（对应 Electron getPortCheckCommand + parsePidsFromPortCheck）
// ========================

pub async fn get_pids_on_port(app: &AppHandle, port: u16) -> Vec<u32> {
    let shell = app.shell();
    #[cfg(windows)]
    let command = shell
        .command("cmd")
        .args(["/c", &format!("netstat -ano | findstr :{}", port)]);
    #[cfg(not(windows))]
    let command = shell.command("sh").args([
        "-c",
        &format!(
            "lsof -i :{} -P -n 2>/dev/null || ss -tlnp sport = :{} 2>/dev/null",
            port, port
        ),
    ]);

    let output = command.output().await;
    let stdout = match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return vec![],
    };
    parse_pids(&stdout)
}

fn parse_pids(stdout: &str) -> Vec<u32> {
    let mut pids = HashSet::new();
    let lines: Vec<&str> = stdout.trim().split('\n').collect();

    if cfg!(windows) {
        for line in &lines {
            if line.contains("LISTENING") || line.contains("ESTABLISHED") {
                let parts: Vec<&str> = line.trim().split_whitespace().collect();
                if let Some(pid_str) = parts.last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid != 0 {
                            pids.insert(pid);
                        }
                    }
                }
            }
        }
        if pids.is_empty() {
            for line in &lines {
                let parts: Vec<&str> = line.trim().split_whitespace().collect();
                if let Some(pid_str) = parts.last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid != 0 {
                            pids.insert(pid);
                        }
                    }
                }
            }
        }
    } else {
        for line in &lines {
            if line.starts_with("COMMAND") {
                continue;
            }
            let parts: Vec<&str> = line.trim().split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(pid) = parts[1].parse::<u32>() {
                    if pid != 0 {
                        pids.insert(pid);
                    }
                }
            }
        }
    }
    pids.into_iter().collect()
}

pub async fn get_port_status(app: &AppHandle, port: u16) -> serde_json::Value {
    let pids = get_pids_on_port(app, port).await;
    serde_json::json!({
        "occupied": !pids.is_empty(),
        "pids": pids,
        "processCount": pids.len()
    })
}

// ========================
// 清理端口占用（跳过受保护的服务端口）
// ========================

async fn kill_pid(app: AppHandle, pid: u32) -> bool {
    let shell = app.shell();
    #[cfg(windows)]
    let result = shell
        .command("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .status()
        .await;
    #[cfg(not(windows))]
    let result = shell
        .command("sh")
        .args(["-c", &format!("kill -9 {} 2>/dev/null", pid)])
        .status()
        .await;
    result.is_ok()
}

pub async fn kill_port(app: &AppHandle, port: u16) -> serde_json::Value {
    // 检查是否受保护的服务端口
    let protected = {
        let state = app.state::<AppState>();
        let p2s = state.port_to_service.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(sid) = p2s.get(&port) {
            let running = state.running.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(rp) = running.get(sid) {
                if rp.status == "running" || rp.status == "starting" {
                    Some(sid.clone())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    };

    if let Some(sid) = protected {
        emit_log(
            app,
            "port-killer",
            format!(
                "[WARN] 端口 {} 正被服务 \"{}\" 使用中，请先停止该服务\n",
                port, sid
            ),
        );
        return serde_json::json!({
            "success": false,
            "message": "端口被受保护的服务占用",
            "protected": true,
            "serviceId": sid
        });
    }

    emit_log(
        app,
        "port-killer",
        format!("[INFO] 正在查找占用端口 {} 的进程...\n", port),
    );

    let pids = get_pids_on_port(app, port).await;
    if pids.is_empty() {
        emit_log(
            app,
            "port-killer",
            format!("[INFO] 端口 {} 未找到需要终止的进程\n", port),
        );
        return serde_json::json!({ "success": true, "message": "未找到进程" });
    }

    emit_log(
        app,
        "port-killer",
        format!(
            "[INFO] 发现 {} 个进程: {}\n",
            pids.len(),
            pids.iter()
                .map(|p| p.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ),
    );

    let running_pids: Vec<u32> = {
        let state = app.state::<AppState>();
        let x = state
            .running
            .lock()
            .unwrap()
            .values()
            .filter_map(|r| r.pid)
            .collect();
        x
    };

    let mut kill_count = 0u32;
    let mut fail_count = 0u32;
    for pid in pids {
        if running_pids.contains(&pid) {
            emit_log(
                app,
                "port-killer",
                format!("[WARN] PID {} 属于 Carvis 管理的服务，跳过终止\n", pid),
            );
            fail_count += 1;
            continue;
        }
        let ok = kill_pid(app.clone(), pid).await;
        if ok {
            kill_count += 1;
            emit_log(app, "port-killer", format!("[OK] 已终止 PID {}\n", pid));
        } else {
            fail_count += 1;
            emit_log(app, "port-killer", format!("[WARN] 终止 PID {} 失败\n", pid));
        }
    }

    emit_log(
        app,
        "port-killer",
        format!(
            "[OK] 端口 {} 清理完成 (终止: {}, 跳过/失败: {})\n",
            port, kill_count, fail_count
        ),
    );

    serde_json::json!({
        "success": fail_count == 0,
        "killed": kill_count,
        "failed": fail_count
    })
}

pub async fn clean_all_ports(app: &AppHandle) -> serde_json::Value {
    let ports: Vec<u16> = {
        let state = app.state::<AppState>();
        let x = state.config.lock().unwrap_or_else(|e| e.into_inner()).port_killer.ports.clone();
        x
    };
    let mut cleaned = 0u32;
    let mut skipped = 0u32;
    let mut failed = 0u32;
    for port in &ports {
        let res = kill_port(app, *port).await;
        if res["success"].as_bool().unwrap_or(false) {
            cleaned += 1;
        } else if res["protected"].as_bool().unwrap_or(false) {
            skipped += 1;
        } else {
            failed += 1;
        }
    }
    serde_json::json!({
        "success": true,
        "total": ports.len(),
        "cleaned": cleaned,
        "skipped": skipped,
        "failed": failed
    })
}

// ========================
// 固定 / 取消固定端口（常驻左侧列表）
// ========================

pub fn pin_port(app: &AppHandle, port: u16) -> serde_json::Value {
    let mut cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if !cfg.port_killer.ports.contains(&port) {
        return serde_json::json!({ "success": false, "error": "端口不在清理列表中" });
    }
    if !cfg.pinned_ports.contains(&port) {
        cfg.pinned_ports.push(port);
    }
    save_config(app, &cfg);
    *app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    serde_json::json!({ "success": true, "data": { "pinned": cfg.pinned_ports } })
}

pub fn unpin_port(app: &AppHandle, port: u16) -> serde_json::Value {
    let mut cfg = app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    cfg.pinned_ports.retain(|x| *x != port);
    save_config(app, &cfg);
    *app.state::<AppState>().config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    serde_json::json!({ "success": true, "data": { "pinned": cfg.pinned_ports } })
}
