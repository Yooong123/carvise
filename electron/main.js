/**
 * main.js - Electron 主进程入口 (Carvis)
 * 
 * 职责划分：
 * - IPC 通信层：接收渲染进程的请求，调用 processManager 处理
 * - 状态推送：通过 webContents.send() 推送日志和状态变更到渲染进程
 * - 生命周期管理：托盘、窗口、应用退出处理
 */

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const plat = require('./platform');
const {
  loadConfig,
  saveConfig,
  getConfig,
  startService,
  stopService,
  stopAllServices,
  getServiceStatus,
  getServiceMemoryStatus,
  ServiceStatus,
  killPort,
  getServicesConfig,
  getServiceIds,
  getGroups,
  addGroup,
  removeGroup,
  renameGroup,
  updateGroupServices,
  getSettings,
  saveSettings,
  startMemoryCleanup,
  stopMemoryCleanup,
} = require('./processManager');

let mainWindow = null;
let tray = null;
let isQuitting = false; // 标记是否正在主动退出（托盘退出时绕过 close 阻止）
let pendingClose = false; // 标记是否正在等待服务停止

/**
 * 创建系统托盘
 * 托盘图标常驻任务栏，右键菜单提供"打开"和"退出"选项
 */
function createTray() {
  try {
    const buildDir = path.join(__dirname, '..', 'build');
    const iconPath = plat.getTrayIconPath(buildDir);
    
    // 检查图标文件是否存在，避免因文件缺失导致应用崩溃
    const fs = require('fs');
    if (!fs.existsSync(iconPath)) {
      console.warn('[tray] 图标文件不存在:', iconPath, '跳过托盘创建');
      return;
    }
    
    // macOS 托盘图标需要使用模板图像（系统自动处理亮暗模式）
    let trayIcon;
    if (plat.isMac) {
      trayIcon = nativeImage.createFromPath(iconPath);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      trayIcon.setTemplateImage(true);
    } else {
      trayIcon = iconPath;
    }
    
    tray = new Tray(trayIcon);
    tray.setToolTip('Carvis');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开 Carvis',
        click: () => {
          showMainWindow();
        },
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          if (tray) {
            tray.destroy();
            tray = null;
          }
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    // 双击托盘图标显示窗口
    tray.on('double-click', () => {
      showMainWindow();
    });
  } catch (err) {
    console.error('[tray] 创建托盘失败:', err.message);
    // 托盘创建失败不阻塞窗口创建，应用仍可正常使用
  }
}

/**
 * 显示/恢复主窗口
 * 如果窗口已被销毁则重新创建
 */
function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    // 窗口已被销毁（如某些平台隐藏后自动销毁），重新创建
    createWindow();
  }
}

/**
 * 同步开机自启动设置到操作系统
 * Windows 下通过 app.setLoginItemSettings 注册/取消开机启动
 * macOS 下需要应用签名才能正常工作，无签名时记录日志但不报错
 */
function syncAutoStartSetting() {
  const settings = getSettings();
  try {
    app.setLoginItemSettings({
      openAtLogin: !!settings.autoStart,
      path: app.getPath('exe'),
    });
  } catch (e) {
    // macOS 无签名时可能抛出异常，仅记录日志
    console.warn('[auto-start] Failed to set login item:', e.message);
  }
}

function createWindow() {
  const buildDir = path.join(__dirname, '..', 'build');

  // 检查窗口图标文件是否存在，避免因文件缺失导致窗口创建异常
  let windowIcon;
  try {
    const fs = require('fs');
    const iconPath = plat.getAppIconPath(buildDir);
    if (fs.existsSync(iconPath)) {
      windowIcon = iconPath;
    }
  } catch (_) {
    windowIcon = undefined;
  }

  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 960,
    minHeight: 700,
    frame: false,
    // macOS 使用 'hidden' 保留红绿灯（traffic light）窗口控件
    // Windows 不使用 titleBarStyle（无效果）
    ...(plat.isMac ? { titleBarStyle: 'hidden' } : {}),
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: windowIcon,
    title: 'Carvis',
    show: false,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 关闭按钮行为：若启用了 minimizeToTray 则隐藏到托盘，否则直接关闭并后台停止服务
  mainWindow.on('close', (e) => {
    if (isQuitting) {
      return;
    }
    const settings = getSettings();
    if (settings.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    
    // 标记正在退出，阻止再次进入关闭事件处理
    isQuitting = true;
    // 后台异步停止所有服务，不阻塞窗口关闭
    const sendLog = () => {};
    const sendStatus = () => {};
    stopAllServices(sendLog, sendStatus).catch(() => {});
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 内容渲染完成后显示窗口，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 首次创建窗口时初始化系统托盘
  if (!tray) {
    createTray();
  }
}

/**
 * 优雅关闭应用：停止所有服务后退出
 */
async function gracefulShutdown() {
  const sendLog = (name, text) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-log', { service: name, text });
    }
  };
  const sendStatus = (name, status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-status-change', { service: name, status });
    }
  };
  
  // 停止所有运行中的服务
  await stopAllServices(sendLog, sendStatus);
  
  // 通知渲染进程准备关闭
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-shutdown-ready');
  }
  
  // 短暂延迟后退出
  setTimeout(() => {
    pendingClose = false;
    isQuitting = true;
    app.quit();
  }, 500);
}

// ========================
// IPC 处理
// ========================

// --- 通用 IPC 错误处理 ---
function wrapIpcHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('IPC handler error:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  };
}

// ========================
// 核心 IPC：立即注册
// ========================

// --- 配置管理 ---

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-services-config', wrapIpcHandler(() => {
  return { success: true, data: getServicesConfig() };
}));

ipcMain.handle('get-full-config', wrapIpcHandler(() => {
  return { success: true, data: getConfig() };
}));

ipcMain.on('save-config-request', (_event, config) => {
  console.log('[save-config-request] called');
  console.log('[save-config-request] services count:', config?.services?.length);
  console.log('[save-config-request] groups count:', config?.groups?.length);
  console.log('[save-config-request] settings:', JSON.stringify(config?.settings));
  try {
    const result = saveConfig(config);
    console.log('[save-config-request] result:', result);
    _event.reply('save-config-response', { success: result });
  } catch (e) {
    console.error('[save-config-request] error:', e);
    _event.reply('save-config-response', { success: false, error: e.message });
  }
});

// --- 应用设置（渲染进程启动后立即需要，不能延迟注册） ---

ipcMain.handle('get-settings', wrapIpcHandler(() => {
  return { success: true, data: getSettings() };
}));

ipcMain.handle('save-settings', wrapIpcHandler((_event, settings) => {
  if (!settings || typeof settings !== 'object') {
    return { success: false, error: 'Invalid settings' };
  }
  const result = saveSettings(settings);
  return { success: result };
}));

ipcMain.handle('get-auto-start', wrapIpcHandler(() => {
  const settings = getSettings();
  return { success: true, data: { autoStart: !!settings.autoStart } };
}));

ipcMain.handle('set-auto-start', wrapIpcHandler((_event, enabled) => {
  const settings = getSettings();
  settings.autoStart = !!enabled;
  saveSettings(settings);
  // 同步到操作系统启动项（macOS 无签名时会静默失败）
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: app.getPath('exe'),
    });
  } catch (e) {
    console.warn('[auto-start] Failed to set login item:', e.message);
  }
  return { success: true, data: { autoStart: !!enabled } };
}));

// --- 窗口控制（渲染进程启动后立即需要，不能延迟注册） ---

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
  return { success: true };
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return { success: true };
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
  return { success: true };
});

// --- 文件夹/URL打开（渲染进程启动后立即需要，不能延迟注册） ---

ipcMain.handle('open-folder', (_event, folderPath) => {
  // 校验：仅允许字符串类型的本地路径，拒绝空值和非预期类型
  if (typeof folderPath !== 'string' || !folderPath.trim()) return { success: false, error: 'Invalid path' };
  shell.openPath(folderPath);
  return { success: true };
});

ipcMain.handle('open-url', (_event, url) => {
  // 校验：仅允许 http/https 协议的 URL，防止通过 file:/// 或 javascript: 协议注入
  if (typeof url !== 'string' || !url.trim()) return { success: false, error: 'Invalid URL' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { success: false, error: 'Invalid protocol' };
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }
  shell.openExternal(url);
  return { success: true };
});

// --- 服务控制 ---

ipcMain.handle('start-service', wrapIpcHandler((_event, serviceId) => {
  if (!serviceId || typeof serviceId !== 'string') {
    return { success: false, error: 'Invalid service ID' };
  }
  
  const sendLog = (name, text) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-log', { service: name, text });
    }
  };
  const sendStatus = (name, status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-status-change', { service: name, status });
    }
  };
  
  return startService(serviceId, sendLog, sendStatus);
}));

ipcMain.handle('stop-service', wrapIpcHandler((_event, serviceId) => {
  if (!serviceId || typeof serviceId !== 'string') {
    return { success: false, error: 'Invalid service ID' };
  }
  
  const sendLog = (name, text) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-log', { service: name, text });
    }
  };
  const sendStatus = (name, status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-status-change', { service: name, status });
    }
  };
  
  return stopService(serviceId, sendLog, sendStatus);
}));

ipcMain.handle('get-service-status', wrapIpcHandler(async (_event, serviceId) => {
  if (!serviceId || typeof serviceId !== 'string') {
    return { success: false, error: 'Invalid service ID' };
  }
  const status = await getServiceStatus(serviceId);
  return { success: true, data: status };
}));

// get-all-status: 使用 Promise.all 并行检测所有服务的端口状态
ipcMain.handle('get-all-status', wrapIpcHandler(async () => {
  const ids = getServiceIds();
  const entries = await Promise.all(
    ids.map(async (id) => [id, await getServiceStatus(id)])
  );
  return { success: true, data: Object.fromEntries(entries) };
}));

// ========================
// 非核心 IPC：延迟注册
// ========================

/**
 * 注册非核心 IPC 处理器（端口清理、分组管理、设置、窗口控制等）
 * 延迟注册以减少应用启动时的初始负载
 */
function registerDeferredHandlers() {
  // --- 端口清理 ---
  ipcMain.handle('kill-port', wrapIpcHandler(async (_event, port) => {
    const portNum = parseInt(port);
    if (!portNum || portNum <= 0 || portNum > 65535) {
      return { success: false, error: 'Invalid port number' };
    }
    
    const sendLog = (name, text) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('service-log', { service: name, text });
      }
    };
    
    return await killPort(portNum, sendLog);
  }));

  // --- 服务分组管理 ---
  ipcMain.handle('get-groups', wrapIpcHandler(() => {
    return { success: true, data: getGroups() };
  }));

  ipcMain.handle('add-group', wrapIpcHandler((_event, name) => {
    if (!name || typeof name !== 'string') {
      return { success: false, error: 'Invalid group name' };
    }
    const group = addGroup(name.trim());
    return { success: true, data: group };
  }));

  ipcMain.handle('remove-group', wrapIpcHandler((_event, groupId) => {
    if (!groupId || typeof groupId !== 'string') {
      return { success: false, error: 'Invalid group ID' };
    }
    const result = removeGroup(groupId);
    return { success: result };
  }));

  ipcMain.handle('rename-group', wrapIpcHandler((_event, groupId, newName) => {
    if (!groupId || typeof groupId !== 'string' || !newName || typeof newName !== 'string') {
      return { success: false, error: 'Invalid parameters' };
    }
    const result = renameGroup(groupId, newName.trim());
    return { success: result };
  }));

  ipcMain.handle('update-group-services', wrapIpcHandler((_event, groupId, serviceIds) => {
    if (!groupId || typeof groupId !== 'string' || !Array.isArray(serviceIds)) {
      return { success: false, error: 'Invalid parameters' };
    }
    const result = updateGroupServices(groupId, serviceIds);
    return { success: result };
  }));
}

// ========================
// 应用生命周期
// ========================

app.whenReady().then(() => {
  loadConfig();
  
  // 设置 macOS Dock 图标（使用 .icns 格式）
  if (process.platform === 'darwin' && app.dock) {
    try {
      const iconPath = path.join(__dirname, '..', 'build', 'icon.icns');
      const fs = require('fs');
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
      }
    } catch (_) {
      // Dock 图标设置失败不影响应用运行
    }
  }
  
  // 启动周期性内存清理
  startMemoryCleanup();
  // 延迟同步开机自启动设置，不阻塞窗口创建
  setTimeout(() => {
    syncAutoStartSetting();
  }, 2000);
  createWindow();

  // 延迟注册非核心 IPC 处理器（窗口显示后再注册）
  setTimeout(() => {
    registerDeferredHandlers();
  }, 1500);
});

app.on('window-all-closed', () => {
  // 如果存在托盘，说明只是隐藏而非退出，不退出应用
  if (tray) {
    // 窗口全部关闭但托盘存在，是正常状态（最小化到托盘），不做任何操作
  } else if (!plat.isMac) {
    app.quit();
  }
  // macOS 上关闭所有窗口不退出应用（标准 macOS 行为）
});

app.on('activate', () => {
  // macOS 标准行为：点击 Dock 图标时重新创建/显示窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  // 标记为正在退出，确保窗口 close 事件不会阻止退出
  isQuitting = true;
  
  // 停止所有运行中的服务
  const ids = getServiceIds();
  const noop = () => {};
  for (const id of ids) {
    stopService(id, noop, noop);
  }
});
