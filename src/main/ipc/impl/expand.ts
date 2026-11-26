import { dialog } from 'electron'
import { IPC } from '../../../shared/ipc'
import { validPath } from '@main/lib/file'
import { errorText } from '@main/utils/error'
import { objectInput } from '@main/utils/input'

export default function registerExpandIpc(ipcMain: Electron.IpcMain): void {
  // 选目录：用户取消时 data 给 null，让渲染层能区分「取消」和「空路径」
  ipcMain.handle(IPC.expand.pickDirectory, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return { success: true, data: null }
      return { success: true, data: result.filePaths[0] }
    } catch (err) {
      return { success: false, error: errorText('选择文件夹', err) }
    }
  })

  // 校验路径：渲染层递过来的参数一律当不可信，路径不存在算失败，原因直接给用户看
  ipcMain.handle(IPC.expand.validPath, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { path } = fields
    if (typeof path !== 'string' || path.trim() === '') {
      return { success: false, error: '路径不合法' }
    }
    if (!validPath(path)) return { success: false, error: '目录不存在' }
    return { success: true, data: undefined }
  })
}
