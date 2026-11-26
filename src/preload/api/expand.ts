import { ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'
import type {
  ExpandPickDirectoryRes,
  ExpandValidPathReq,
  ExpandValidPathRes
} from '@shared/types/ipcContract'

const expandApi = {
  pickDirectory: (): Promise<ExpandPickDirectoryRes> =>
    ipcRenderer.invoke(IPC.expand.pickDirectory),
  validPath: (request: ExpandValidPathReq): Promise<ExpandValidPathRes> =>
    ipcRenderer.invoke(IPC.expand.validPath, request)
}

export default expandApi
