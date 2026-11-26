import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import agentApi from './api/agent'
import expandApi from './api/expand'
import conversationApi from './api/conversation'

/**
 * 暴露给渲染层的全部能力。
 * window.api 的形状是渲染层的公开契约，改这里等于改 API，
 * 必须同步检查 src/renderer/src/lib/ipc.ts。
 */
const api = {
  ping: () => ipcRenderer.send(IPC.ping),
  agent: agentApi,
  // conversationApi 是 { workspace, group, conversation }，展开后与原有扁平结构一致
  ...conversationApi,
  expand: expandApi
}

export default api
