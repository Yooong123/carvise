/**
 * preload.js - 预加载脚本 (Carvis)
 * 通过 contextBridge 暴露安全的 IPC API 给渲染进程
 * 
 * IPC 返回格式统一为 { success: boolean, data?: any, error?: string }
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露平台信息给渲染进程
contextBridge.exposeInMainWorld('carvisPlatform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
});

contextBridge.exposeInMainWorld('serviceAPI', {
  // ========================
  // 统一 IPC 调用封装
  // ========================
  
  /**
   * 通用 IPC 调用方法
   * @param {string} channel - IPC 通道名
   * @param {any[]} args - 参数列表
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  async _invoke(channel, ...args) {
    try {
      // 添加 5 秒超时，避免 IPC 挂起导致 UI 卡死
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`IPC ${channel} timeout after 5s`)), 5000)
      );
      const result = await Promise.race([
        ipcRenderer.invoke(channel, ...args),
        timeoutPromise,
      ]);
      // 如果返回的是新格式 { success, data/error }
      if (result && typeof result === 'object' && 'success' in result) {
        return result;
      }
      // 兼容旧格式，直接返回数据
      return { success: true, data: result };
    } catch (error) {
      console.error(`IPC ${channel} error:`, error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  },

  // ========================
  // 配置管理
  // ========================

  /**
   * 获取前端展示用的服务配置
   * @returns {Promise<{success: boolean, data?: Array}>}
   */
  getServicesConfig() {
    return this._invoke('get-services-config');
  },

  /**
   * 获取完整配置（含原始 args 等，用于设置编辑）
   * @returns {Promise<{success: boolean, data?: Object}>}
   */
  getFullConfig() {
    return this._invoke('get-full-config');
  },

  /**
   * 保存配置
   * @param {Object} config - 配置对象
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  saveConfig(config) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ipcRenderer.removeAllListeners('save-config-response');
        resolve({ success: false, error: 'save-config timeout' });
      }, 6000);
      const handler = (_event, result) => {
        clearTimeout(timeout);
        ipcRenderer.removeListener('save-config-response', handler);
        resolve(result);
      };
      ipcRenderer.on('save-config-response', handler);
      ipcRenderer.send('save-config-request', config);
    });
  },

  // ========================
  // 服务控制
  // ========================

  /**
   * 启动服务
   * @param {string} serviceId - 服务ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  start(serviceId) {
    return this._invoke('start-service', serviceId);
  },

  /**
   * 停止服务
   * @param {string} serviceId - 服务ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  stop(serviceId) {
    return this._invoke('stop-service', serviceId);
  },

  /**
   * 获取单个服务状态
   * @param {string} serviceId - 服务ID
   * @returns {Promise<{success: boolean, data?: string}>}
   */
  getStatus(serviceId) {
    return this._invoke('get-service-status', serviceId);
  },

  /**
   * 获取所有服务状态
   * @returns {Promise<{success: boolean, data?: Object}>}
   */
  getAllStatus() {
    return this._invoke('get-all-status');
  },

  // ========================
  // 端口清理
  // ========================

  /**
   * 清理端口占用
   * @param {number} port - 端口号
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  killPort(port) {
    return this._invoke('kill-port', port);
  },

  // ========================
  // 日志 & 状态事件
  // ========================

  /**
   * 监听服务日志
   * @param {Function} callback - 回调函数，接收 { service: string, text: string }
   * @returns {Function} 取消监听函数
   */
  onLog(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('service-log', handler);
    return () => ipcRenderer.removeListener('service-log', handler);
  },

  /**
   * 监听服务状态变更
   * @param {Function} callback - 回调函数，接收 { service: string, status: string }
   * @returns {Function} 取消监听函数
   */
  onStatusChange(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('service-status-change', handler);
    return () => ipcRenderer.removeListener('service-status-change', handler);
  },

  /**
   * 监听应用准备关闭事件
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onAppShutdownReady(callback) {
    const handler = () => callback();
    ipcRenderer.on('app-shutdown-ready', handler);
    return () => ipcRenderer.removeListener('app-shutdown-ready', handler);
  },

  // ========================
  // 窗口控制
  // ========================

  /**
   * 最小化窗口
   */
  minimizeWindow() {
    return this._invoke('minimize-window');
  },

  /**
   * 最大化/还原窗口
   */
  maximizeWindow() {
    return this._invoke('maximize-window');
  },

  /**
   * 关闭窗口
   */
  closeWindow() {
    return this._invoke('close-window');
  },

  // ========================
  // 文件/链接操作
  // ========================

  /**
   * 打开文件夹
   * @param {string} folderPath - 文件夹路径
   */
  openFolder(folderPath) {
    return this._invoke('open-folder', folderPath);
  },

  /**
   * 打开URL
   * @param {string} url - URL地址
   */
  openUrl(url) {
    return this._invoke('open-url', url);
  },

  // ========================
  // 服务分组管理
  // ========================

  /**
   * 获取所有分组
   * @returns {Promise<{success: boolean, data?: Array}>}
   */
  getGroups() {
    return this._invoke('get-groups');
  },

  /**
   * 添加分组
   * @param {string} name - 分组名称
   * @returns {Promise<{success: boolean, data?: Object}>}
   */
  addGroup(name) {
    return this._invoke('add-group', name);
  },

  /**
   * 删除分组
   * @param {string} groupId - 分组ID
   * @returns {Promise<{success: boolean}>}
   */
  removeGroup(groupId) {
    return this._invoke('remove-group', groupId);
  },

  /**
   * 重命名分组
   * @param {string} groupId - 分组ID
   * @param {string} newName - 新名称
   * @returns {Promise<{success: boolean}>}
   */
  renameGroup(groupId, newName) {
    return this._invoke('rename-group', groupId, newName);
  },

  /**
   * 更新分组服务列表
   * @param {string} groupId - 分组ID
   * @param {string[]} serviceIds - 服务ID列表
   * @returns {Promise<{success: boolean}>}
   */
  updateGroupServices(groupId, serviceIds) {
    return this._invoke('update-group-services', groupId, serviceIds);
  },

  // ========================
  // 应用设置
  // ========================

  /**
   * 获取应用设置
   * @returns {Promise<{success: boolean, data?: Object}>}
   */
  getSettings() {
    return this._invoke('get-settings');
  },

  /**
   * 保存应用设置
   * @param {Object} settings - 设置对象
   * @returns {Promise<{success: boolean}>}
   */
  saveSettings(settings) {
    return this._invoke('save-settings', settings);
  },

  // ========================
  // 开机自启动
  // ========================

  /**
   * 获取开机自启动状态
   * @returns {Promise<{success: boolean, data?: {autoStart: boolean}}>}
   */
  getAutoStart() {
    return this._invoke('get-auto-start');
  },

  /**
   * 设置开机自启动
   * @param {boolean} enabled - 是否启用
   * @returns {Promise<{success: boolean, data?: {autoStart: boolean}}>}
   */
  setAutoStart(enabled) {
    return this._invoke('set-auto-start', enabled);
  },

  /**
   * 获取应用版本号
   * @returns {Promise<string>}
   */
  getAppVersion() {
    return ipcRenderer.invoke('get-app-version');
  },
});
