/**
 * tauriApi.ts - Tauri 版桥接层 (Carvis 0.10.0)
 *
 * 完全对齐旧版 Electron preload 暴露的 window.serviceAPI 方法签名与返回结构：
 *   - 统一返回 { success: boolean, data?: any, error?: string }
 *   - 内置 5 秒超时，避免调用挂起导致 UI 卡死
 *   - 事件订阅 onLog / onStatusChange / onAppShutdownReady 返回取消订阅函数
 *
 * 所有系统能力通过 @tauri-apps/api 的 invoke / listen 调用 Rust 后端命令。
 */

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const TIMEOUT_MS = 5000

/** 统一调用封装：与原 _invoke 行为一致 */
async function _invoke<T = any>(
  channel: string,
  args?: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`IPC ${channel} timeout after 5s`)), TIMEOUT_MS)
    )
    const result = await Promise.race([invoke(channel, args), timeout])
    // 若后端已返回新格式 { success, data/error } 则原样返回
    if (result && typeof result === 'object' && 'success' in result) {
      return result as { success: boolean; data?: T; error?: string }
    }
    // 兼容旧格式，直接包装为成功
    return { success: true, data: result as T }
  } catch (error: any) {
    // Tauri v2 的 invoke 在命令 panic / 返回 Err 时，reject 的载荷可能是纯字符串
    // （无 .message），直接显示会变成 "Unknown error"。这里尽量还原真实错误文本。
    let detail: string
    if (typeof error === 'string') {
      detail = error
    } else if (error?.message) {
      detail = error.message
    } else {
      try {
        detail = JSON.stringify(error)
      } catch {
        detail = String(error)
      }
    }
    if (!detail || detail === 'Unknown error') {
      detail = `调用 ${channel} 失败（无详细错误信息，请查看 Rust 端 panic.log）`
    }
    console.error(`IPC ${channel} error:`, error)
    return { success: false, error: detail }
  }
}

/** 启动 / 停止 / 状态事件载荷类型 */
export interface ServiceLog {
  service: string
  text: string
}
export interface ServiceStatusChange {
  service: string
  status: string
}
type Unlisten = () => void

export const tauriApi = {
  // 平台信息（对应原 window.carvisPlatform）
  platform: {
    isMac: /Mac/i.test(navigator.userAgent),
    isWindows: /Win/i.test(navigator.userAgent),
    isLinux: /Linux/i.test(navigator.userAgent),
  },

  // ---- 配置管理 ----
  getServicesConfig() {
    return _invoke('get_services_config')
  },
  getFullConfig() {
    return _invoke('get_full_config')
  },
  saveConfig(config: any) {
    return _invoke('save_config', { config })
  },

  // ---- 服务控制 ----
  start(serviceId: string) {
    return _invoke('start_service', { serviceId })
  },
  stop(serviceId: string) {
    return _invoke('stop_service', { serviceId })
  },
  getStatus(serviceId: string) {
    return _invoke('get_service_status', { serviceId })
  },
  getAllStatus() {
    return _invoke('get_all_status')
  },

  // ---- 端口清理 ----
  killPort(port: number) {
    return _invoke('kill_port', { port })
  },
  getPortStatus(port: number) {
    return _invoke('get_port_status', { port })
  },
  pinPort(port: number) {
    return _invoke('pin_port', { port })
  },
  unpinPort(port: number) {
    return _invoke('unpin_port', { port })
  },
  cleanAllPorts() {
    return _invoke('clean_all_ports')
  },

  // ---- 日志 & 状态事件 ----
  onLog(callback: (data: ServiceLog) => void): Unlisten {
    let unlisten: Unlisten | null = null
    listen<ServiceLog>('service-log', (e) => callback(e.payload)).then((u) => {
      unlisten = u
    })
    return () => {
      if (unlisten) unlisten()
    }
  },
  onStatusChange(callback: (data: ServiceStatusChange) => void): Unlisten {
    let unlisten: Unlisten | null = null
    listen<ServiceStatusChange>('service-status-change', (e) => callback(e.payload)).then((u) => {
      unlisten = u
    })
    return () => {
      if (unlisten) unlisten()
    }
  },
  onAppShutdownReady(callback: () => void): Unlisten {
    let unlisten: Unlisten | null = null
    listen('app-shutdown-ready', () => callback()).then((u) => {
      unlisten = u
    })
    return () => {
      if (unlisten) unlisten()
    }
  },

  // ---- 窗口控制 ----
  minimizeWindow() {
    return _invoke('minimize_window')
  },
  maximizeWindow() {
    return _invoke('maximize_window')
  },
  closeWindow() {
    return _invoke('close_window')
  },
  // 前端初始化完成后由 UI 调用，显示（此前在 tauri.conf.json 设为 visible:false 防黑屏）
  showWindow() {
    return _invoke('show_main_window')
  },

  // ---- 文件 / 链接打开 ----
  openFolder(folderPath: string) {
    return _invoke('open_folder', { folderPath })
  },
  openUrl(url: string) {
    return _invoke('open_url', { url })
  },

  // ---- 服务分组管理 ----
  getGroups() {
    return _invoke('get_groups')
  },
  addGroup(name: string) {
    return _invoke('add_group', { name })
  },
  removeGroup(groupId: string) {
    return _invoke('remove_group', { groupId })
  },
  renameGroup(groupId: string, newName: string) {
    return _invoke('rename_group', { groupId, newName })
  },
  updateGroupServices(groupId: string, serviceIds: string[]) {
    return _invoke('update_group_services', { groupId, serviceIds })
  },

  // ---- 应用设置 ----
  getSettings() {
    return _invoke('get_settings')
  },
  saveSettings(settings: any) {
    return _invoke('save_settings', { settings })
  },

  // ---- 开机自启动 ----
  getAutoStart() {
    return _invoke('get_auto_start')
  },
  setAutoStart(enabled: boolean) {
    return _invoke('set_auto_start', { enabled })
  },

  // ---- 应用版本 ----
  getAppVersion(): Promise<string> {
    return invoke<string>('get_app_version')
  },
}

export default tauriApi
