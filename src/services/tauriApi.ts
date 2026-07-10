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
import { getCurrentWindow } from '@tauri-apps/api/window'

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
  // 注意：Tauri 的 macOS WebView 下 navigator.userAgent 不一定含 "Mac"，
  // 故组合 userAgent / platform / data-platform 多信号判定，避免单一检测失灵。
  platform: (() => {
    const ua = navigator.userAgent || ''
    const plt = (navigator as any).platform || navigator.userAgentData?.platform || ''
    const dataPlat = document.documentElement.getAttribute('data-platform')
    const isMac = /Mac/i.test(ua) || /Mac/i.test(plt) || dataPlat === 'mac'
    return {
      isMac,
      isWindows: /Win/i.test(ua) || /Win/i.test(plt),
      isLinux: /Linux/i.test(ua) || /Linux/i.test(plt),
    }
  })(),

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

  // ---- macOS 标题栏背景色（跟随系统主题）----
  /**
   * 同步 macOS 原生透明标题栏（Overlay）的背景色。
   * macOS 启用原生标题栏后，标题栏区域是透明的，其底色取自窗口 backgroundColor；
   * 若窗口背景为深色（tauri.conf.json 的 #0a0e17），浅色系统下顶部会透出黑色。
   * 因此按当前主题把窗口背景色设为浅色(#f7f8fa)/深色(#1a1b1e)，与 App 主题一致。
   * 仅 macOS 生效，其它平台直接跳过。
   */
  setTitleBarColor(theme: 'light' | 'dark') {
    // 使用 tauriApi.platform.isMac（组合 userAgent/platform/data-platform）判定，
    // 避免单独依赖 navigator.userAgent 在 Tauri WebView 中失灵。
    if (!tauriApi.platform.isMac) {
      return Promise.resolve({ success: true as const })
    }
    const hex = theme === 'dark' ? '#1a1b1e' : '#f7f8fa'
    const h = hex.replace('#', '')
    const color: [number, number, number, number] = [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
      1,
    ]
    const win = getCurrentWindow()
    // 标准窗口（decorations:true）下，标题栏颜色由 macOS 系统 appearance 控制，
    // setBackgroundColor 只改 webview 背后底色、不影响系统标题栏。
    // 因此需要再用 setTheme 设置窗口 appearance：dark → 系统深色标题栏，
    // light → 系统浅色标题栏，从而让顶部导航栏跟随 App 主题变暗/变亮。
    const appearance = theme === 'dark' ? 'dark' : 'light'
    return win
      .setBackgroundColor(color)
      .then(() => win.setTheme(appearance))
      .then(() => ({ success: true as const }))
      .catch((e: any) => ({ success: false, error: String(e?.message || e) }))
  },
}

export default tauriApi
