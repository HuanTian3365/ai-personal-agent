import { ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'

const expandApi = {
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.expand.pickDirectory)
}

export default expandApi
