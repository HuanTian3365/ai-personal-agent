import { ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'

const expandApi = {
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.expand.pickDirectory),
  validPath: (target: string): Promise<boolean> => ipcRenderer.invoke(IPC.expand.validPath, target)
}

export default expandApi
