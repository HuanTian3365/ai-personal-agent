import { ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'

const dialogApi = {
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialog.pickDirectory)
}

export default dialogApi
