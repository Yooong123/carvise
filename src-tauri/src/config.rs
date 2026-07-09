use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ========================
// 配置数据模型（与旧版 Electron config.json 完全兼容）
// ========================

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ServiceConfig {
    pub id: String,
    pub name: String,
    pub label: String,
    pub cwd: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub port: u16,
}

impl ServiceConfig {
    pub fn command_string(&self) -> String {
        let mut s = self.command.clone();
        for a in &self.args {
            s.push(' ');
            s.push_str(a);
        }
        s
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GroupConfig {
    pub id: String,
    pub name: String,
    #[serde(default, rename = "serviceIds")]
    pub service_ids: Vec<String>,
    #[serde(default, rename = "_expanded")]
    pub expanded: bool,
    #[serde(default)]
    pub color: String,
}

// 注意：前端（SettingsModal.vue / tauriApi.ts）统一使用驼峰命名发送与接收
// settings（autoStart / minimizeToTray / theme），因此这里用 rename_all = "camelCase"
// 与前端保持一致；同时保留蛇形别名以兼容旧版 Electron 配置迁移。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default, alias = "auto_start")]
    pub auto_start: bool,
    #[serde(default, alias = "minimize_to_tray")]
    pub minimize_to_tray: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            auto_start: false,
            minimize_to_tray: false,
            theme: "system".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PortKillerConfig {
    #[serde(default)]
    pub ports: Vec<u16>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub services: Vec<ServiceConfig>,
    #[serde(default)]
    pub groups: Vec<GroupConfig>,
    #[serde(default)]
    pub settings: AppSettings,
    #[serde(default, rename = "portKiller")]
    pub port_killer: PortKillerConfig,
    #[serde(default, rename = "pinnedPorts")]
    pub pinned_ports: Vec<u16>,
}

// ========================
// 校验 / 规范化（对应 Electron validateAndFixConfig）
// ========================

const VALID_COLORS: [&str; 6] = ["red", "orange", "yellow", "green", "blue", "purple"];
const VALID_THEMES: [&str; 3] = ["system", "light", "dark"];

pub fn normalize(config: &mut AppConfig) {
    config.services = config
        .services
        .iter()
        .filter_map(|s| {
            let id = s.id.trim().to_string();
            if id.is_empty() {
                return None;
            }
            let name = if s.name.trim().is_empty() {
                id.clone()
            } else {
                s.name.trim().to_string()
            };
            let label = if s.label.trim().is_empty() {
                if name.is_empty() {
                    "Unnamed Service".to_string()
                } else {
                    name.clone()
                }
            } else {
                s.label.trim().to_string()
            };
            Some(ServiceConfig {
                id: id.clone(),
                name,
                label,
                cwd: s.cwd.trim().to_string(),
                command: s.command.trim().to_string(),
                args: s.args.iter().filter(|a| !a.is_empty()).cloned().collect(),
                port: if s.port == 0 { 0 } else { s.port },
            })
        })
        .collect();

    config.groups = config
        .groups
        .iter()
        .filter(|g| !g.id.trim().is_empty())
        .map(|g| GroupConfig {
            id: g.id.trim().to_string(),
            name: if g.name.trim().is_empty() {
                "Unnamed Group".to_string()
            } else {
                g.name.trim().to_string()
            },
            service_ids: g
                .service_ids
                .iter()
                .filter(|id| !id.is_empty())
                .cloned()
                .collect(),
            expanded: g.expanded,
            color: if VALID_COLORS.contains(&g.color.as_str()) {
                g.color.clone()
            } else {
                String::new()
            },
        })
        .collect();

    config.port_killer.ports = config
        .port_killer
        .ports
        .iter()
        .cloned()
        .filter(|p| *p > 0 && *p <= 65535)
        .collect();
    config.pinned_ports = config
        .pinned_ports
        .iter()
        .cloned()
        .filter(|p| *p > 0 && *p <= 65535)
        .collect();

    if !VALID_THEMES.contains(&config.settings.theme.as_str()) {
        config.settings.theme = "system".to_string();
    }
}

// ========================
// 路径解析
// ========================

pub fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| fallback_config_dir())
}

pub fn config_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("config.json")
}

fn fallback_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.carvis.app")
}

/// 旧版 Electron 配置路径：%APPDATA%/Carvis/config.json 等，用于平滑迁移
fn legacy_config_path() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        dirs::config_dir()
    } else if cfg!(target_os = "macos") {
        dirs::home_dir().map(|h| h.join("Library/Application Support"))
    } else {
        dirs::config_dir()
    }?;
    let legacy = base.join("Carvis").join("config.json");
    if legacy.exists() {
        Some(legacy)
    } else {
        None
    }
}

// ========================
// 读写
// ========================

pub fn save_config(app: &AppHandle, config: &AppConfig) {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(s) = serde_json::to_string_pretty(config) {
        let _ = fs::write(&path, s);
    }
}

/// 加载配置：优先读 Tauri 配置目录；若不存在则尝试从旧版 Electron 配置迁移；
/// 最终都不存在则生成默认配置并落盘。返回已规范化的配置。
pub fn load_config(app: &AppHandle) -> AppConfig {
    let path = config_path(app);

    if path.exists() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(mut cfg) = serde_json::from_str::<AppConfig>(&raw) {
                normalize(&mut cfg);
                save_config(app, &cfg);
                return cfg;
            }
        }
    }

    if let Some(legacy) = legacy_config_path() {
        if let Ok(raw) = fs::read_to_string(&legacy) {
            if let Ok(mut cfg) = serde_json::from_str::<AppConfig>(&raw) {
                normalize(&mut cfg);
                save_config(app, &cfg);
                return cfg;
            }
        }
    }

    let cfg = AppConfig::default();
    save_config(app, &cfg);
    cfg
}
