use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::AppHandle;

use crate::config::{load_config, AppConfig, ServiceConfig};

#[derive(Clone, Debug)]
pub struct RunningProcess {
    pub pid: Option<u32>,
    pub status: String,
    pub error: Option<String>,
    pub started_at: Option<u64>,
}

#[derive(Default)]
pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub services_map: Mutex<HashMap<String, ServiceConfig>>,
    pub port_to_service: Mutex<HashMap<u16, String>>,
    pub running: Mutex<HashMap<String, RunningProcess>>,
    pub stopping: Mutex<HashSet<String>>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Self {
        let config = load_config(app);
        let mut services_map = HashMap::new();
        let mut port_to_service = HashMap::new();
        for svc in &config.services {
            services_map.insert(svc.id.clone(), svc.clone());
            if svc.port > 0 {
                port_to_service.insert(svc.port, svc.id.clone());
            }
        }
        AppState {
            config: Mutex::new(config),
            services_map: Mutex::new(services_map),
            port_to_service: Mutex::new(port_to_service),
            running: Mutex::new(HashMap::new()),
            stopping: Mutex::new(HashSet::new()),
        }
    }

    /// 用新的配置覆盖状态中的 services_map / port_to_service（保存配置后调用）
    pub fn rebuild_indexes(&self) {
        let cfg = self.config.lock().unwrap_or_else(|e| e.into_inner());
        let mut sm = self.services_map.lock().unwrap_or_else(|e| e.into_inner());
        let mut p2s = self.port_to_service.lock().unwrap_or_else(|e| e.into_inner());
        sm.clear();
        p2s.clear();
        for svc in &cfg.services {
            sm.insert(svc.id.clone(), svc.clone());
            if svc.port > 0 {
                p2s.insert(svc.port, svc.id.clone());
            }
        }
    }
}
