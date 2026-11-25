import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AgentEventEnvelope, QueueItem } from '@shared/types/agentEvent'
import type { MessageEventSend, SendResult, StreamSnapshot } from '@shared/types/messageService'

const agentApi = {
  // to main -> 发送对话
  send: (conversationId: string, message: MessageEventSend): Promise<SendResult> =>
    ipcRenderer.invoke(IPC.agent.send, conversationId, message),
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
  queue: (conversationId: string): Promise<QueueItem[]> =>
    ipcRenderer.invoke(IPC.agent.queue, conversationId)
}

export default agentApi
