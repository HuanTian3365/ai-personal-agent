import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/ipc'
import { sendMessage } from '@core/export'
import { broadcast } from '../broadcast'
import { abortRun, finishRun, getSnapshot, recordEvent, startRun } from '../../runtime/agent'
import type { AgentEvent } from '@shared/types/agentEvent'
import type { MessageEventSend, SendResult, StreamSnapshot } from '@shared/types/messageService'

/**
 * agent 域的事件注册。
 *
 * 只做三件事:挂 handler、校验参数、转发给 runtime / core。
 * 中断信号与事件缓冲的台账在 runtime/agent.ts,事件出口在 ipc/broadcast.ts。
 */
export default function registerAgentIpc(ipcMain: Electron.IpcMain): void {
  /**
   * 发送对话。
   * 同一会话正在生成时直接拒绝 排队入口还没做(见 docs/待实现/03.TODO-消息排队.md)
   */
  ipcMain.handle(
    IPC.agent.send,
    async (_event, conversationId: unknown, message: MessageEventSend): Promise<SendResult> => {
      // 参数校验
      if (typeof conversationId !== 'string' || conversationId.trim() === '') {
        throw new Error('agent.send: conversationId 必须是非空字符串')
      }
      if (typeof message.content !== 'string' || message.content.trim() === '') {
        throw new Error('agent.send: text 必须是非空字符串')
      }
      // 设置中断信号 | 该会话已在跑会在这里抛错
      const controller = startRun(conversationId)
      /**
       * 事件出口:先记账再广播
       * 记账是为了切回会话时能把这一轮已生成的内容重放出来
       */
      const emit = (event: AgentEvent): void => {
        broadcast(recordEvent(event))
      }
      // 发送消息
      try {
        await sendMessage({
          conversationId,
          message,
          /** 消息ID,也是轮ID */
          messageId: randomUUID(),
          emit,
          signal: controller.signal
        })
        return { status: 'sent' }
      } finally {
        finishRun(conversationId)
      }
    }
  )

  /** 中断对话 */
  ipcMain.handle(IPC.agent.abort, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string') {
      throw new Error('agent.abort: conversationId 必须是字符串')
    }
    abortRun(conversationId)
  })

  /** 取进行中那一轮的快照 | 没在跑返回 null */
  ipcMain.handle(IPC.agent.snapshot, (_event, conversationId: unknown): StreamSnapshot | null => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('agent.snapshot: conversationId 必须是非空字符串')
    }
    return getSnapshot(conversationId)
  })
}
