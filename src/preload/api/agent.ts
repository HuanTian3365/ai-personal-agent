import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AgentEventEnvelope } from '@shared/types/agentEvent'
import type {
  AgentAbortReq,
  AgentAbortRes,
  AgentInsertReq,
  AgentInsertRes,
  AgentQueueReq,
  AgentQueueRes,
  AgentQueueUpdateReq,
  AgentQueueUpdateRes,
  AgentSendReq,
  AgentSendRes,
  AgentSnapshotReq,
  AgentSnapshotRes
} from '@shared/types/ipcContract'

/**
 * 对话执行域 | 发送、中断、快照、排队
 *
 * 每个通道都返回 Result | main侧不会throw出来 渲染层只判success
 * 入参一律一个对象 对应 ipcContract 的 xxxReq
 */
const agentApi = {
  // to main -> 发送对话,mode决定排队还是插队
  send: (request: AgentSendReq): Promise<AgentSendRes> =>
    ipcRenderer.invoke(IPC.agent.send, request),
  // to main -> 中断对话
  abort: (request: AgentAbortReq): Promise<AgentAbortRes> =>
    ipcRenderer.invoke(IPC.agent.abort, request),
  // from main -> 监听对话事件
  onEvent: (callback: (payload: AgentEventEnvelope) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEventEnvelope): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC.agent.event, listener)
    return (): void => {
      ipcRenderer.removeListener(IPC.agent.event, listener)
    }
  },
  // to main -> 获取对话快照
  snapshot: (request: AgentSnapshotReq): Promise<AgentSnapshotRes> =>
    ipcRenderer.invoke(IPC.agent.snapshot, request),
  // to main -> 把排队里的一条插入当前轮
  insert: (request: AgentInsertReq): Promise<AgentInsertRes> =>
    ipcRenderer.invoke(IPC.agent.insert, request),
  // to main -> 取该对话的排队内容
  queue: (request: AgentQueueReq): Promise<AgentQueueRes> =>
    ipcRenderer.invoke(IPC.agent.queue, request),
  // to main -> 改排队里的一条
  updateQueue: (request: AgentQueueUpdateReq): Promise<AgentQueueUpdateRes> =>
    ipcRenderer.invoke(IPC.agent.queueUpdate, request)
}

export default agentApi
