import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import mount from './ipc'
import { disposeCore, initCore } from '../core/export'
import { closeDatabase, getDatabase, openDatabase } from './database'
import { initConfig } from './config'
import { ensureDirs, paths } from './config/paths'

function createWindow(): void {
  const displays = screen.getAllDisplays()
  const target = displays[0] ?? screen.getPrimaryDisplay()

  const x = target.bounds.x + 0
  const y = target.bounds.y + 1200
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 610,
    icon: path.join(__dirname, '../../resources/icon.png'),
    x,
    y,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  // 页面首帧准备好之后再显示窗口，避免白屏闪烁。
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (is.dev) mainWindow.webContents.openDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 准备用户数据目录（~/.huanyu，开发时 ~/.huanyu-dev），见 paths.ts
  await ensureDirs()
  // 加载配置：模型接入参数在 ~/.huanyu/config.json，见 config/file/config.ts
  await initConfig()
  // 初始化数据库：业务表和 LangGraph 的 checkpoint 表共用同一个文件、同一个连接
  await openDatabase(paths.db)
  // 初始化 core：日志目录由这里注入，core 自己不碰 Electron
  initCore({ database: getDatabase(), logDir: paths.logs })

  // 通过注册中心给ipc添加事件
  mount(ipcMain)
  // 创建窗口
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 退出事件
app.on('will-quit', () => {
  // 先让 core 释放自己持有的引用，再关连接
  disposeCore()
  closeDatabase()
})
