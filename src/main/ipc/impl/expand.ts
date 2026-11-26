import { dialog } from 'electron'
import { IPC } from '../../../shared/ipc'

export default function registerExpandIpc(ipcMain: Electron.IpcMain): void {
  // 选目录：用户取消时返回 null，让渲染层能区分「取消」和「空路径」
  ipcMain.handle(IPC.expand.pickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
