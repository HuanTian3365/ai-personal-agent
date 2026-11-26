import { IPC } from '../../shared/ipc'
import registerAgentIpc from './impl/agent'
import registerExpandIpc from './impl/expand'
import registerConversationIpc from './impl/conversation'

// 渲染 → 主，不等结果：  ipcRenderer.send   ↔  ipcMain.on
// 渲染 → 主，等结果：    ipcRenderer.invoke ↔  ipcMain.handle
// 主 → 渲染：            webContents.send   ↔  ipcRenderer.on

/**
 * 事件注册中心。
 * 只负责把 IPC handler 挂上去，具体实现都在 ipc/ 下，按功能分文件。
 */
export default function mount(ipcMain: Electron.IpcMain): void {
  // 测试连通性
  ipcMain.on(IPC.ping, () => console.log('pong'))

  registerAgentIpc(ipcMain)
  registerConversationIpc(ipcMain)
  registerExpandIpc(ipcMain)
}
