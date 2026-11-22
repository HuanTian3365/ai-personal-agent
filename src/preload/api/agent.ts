import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import { AgentEvent, QueueItem } from '@shared/types/newEvent'
import { ActiveStream, MessageEventSend, SendResult } from '@shared/types/newMessageService'

const agentApi = {
  // to main -> 发送对话
  send: (conversationId: string, message: MessageEventSend): Promise<SendResult> =>
    ipcRenderer.invoke(IPC.agent.send, conversationId, message),
  // to main -> 中断对话
  abort: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.agent.abort, conversationId),
  // from main -> 监听对话事件
  onEvent: (callback: (event: AgentEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEvent): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC.agent.event, listener)
    return (): void => {
      ipcRenderer.removeListener(IPC.agent.event, listener)
    }
  },
  // to main -> 获取对话快照
  snapshot: (conversationId: string): Promise<ActiveStream | null> =>
    ipcRenderer.invoke(IPC.agent.snapshot, conversationId),
  // to main -> 把排队里的一条插入当前轮
  insert: (conversationId: string, itemId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.agent.insert, conversationId, itemId),
  // to main -> 取该对话的排队内容
  queue: (conversationId: string): Promise<QueueItem[]> =>
    ipcRenderer.invoke(IPC.agent.queue, conversationId)
}

export default agentApi
