import { dialog } from 'electron'
import { IPC } from '../../../shared/ipc'
import { validPath } from '@main/lib/file'

export default function registerExpandIpc(ipcMain: Electron.IpcMain): void {
  // 选目录：用户取消时返回 null，让渲染层能区分「取消」和「空路径」
  ipcMain.handle(IPC.expand.pickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 校验路径是否存在：渲染层递过来的参数一律当不可信，非字符串直接 false，不抛给前端
  ipcMain.handle(IPC.expand.validPath, (_event, target: unknown) =>
    typeof target === 'string' ? validPath(target) : false
  )
}
