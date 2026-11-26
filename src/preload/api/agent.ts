import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AgentEventEnvelope } from '@shared/types/agentEvent'
import type { HYEQueueItemView } from '@shared/types/hyExpand'
import type { MessageEventSend } from '@shared/types/message'
import type {
  QueueEditAction,
  SendMode,
  SendResult,
  StreamSnapshot
} from '@shared/types/ipcContract'

const agentApi = {
  // to main -> 发送对话,mode决定排队还是插队
  send: (conversationId: string, message: MessageEventSend, mode: SendMode): Promise<SendResult> =>
    ipcRenderer.invoke(IPC.agent.send, conversationId, message, mode),
  // to main -> 中断对话
  abort: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.agent.abort, conversationId),
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
  snapshot: (conversationId: string): Promise<StreamSnapshot | null> =>
    ipcRenderer.invoke(IPC.agent.snapshot, conversationId),
  // to main -> 把排队里的一条插入当前轮
  insert: (conversationId: string, itemId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.agent.insert, conversationId, itemId),
  // to main -> 取该对话的排队内容
  queue: (conversationId: string): Promise<HYEQueueItemView[]> =>
    ipcRenderer.invoke(IPC.agent.queue, conversationId),
  // to main -> 改排队里的一条
  updateQueue: (conversationId: string, itemId: string, action: QueueEditAction): Promise<void> =>
    ipcRenderer.invoke(IPC.agent.queueUpdate, conversationId, itemId, action)
}

export default agentApi
