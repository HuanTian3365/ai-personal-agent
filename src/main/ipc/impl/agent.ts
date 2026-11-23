import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/ipc'
import { sendMessage } from '@core/export'
import { broadcast } from '../broadcast'
import { abortRun, finishRun, startRun } from '../../runtime/agent'
import type { MessageEventSend, SendResult } from '@shared/types/messageService'

/**
 * agent 域的事件注册。
 *
 * 只做三件事:挂 handler、校验参数、转发给 runtime / core。
 * 中断信号的台账在 runtime/agent.ts,事件出口在 ipc/broadcast.ts。
 */
export default function registerAgentIpc(ipcMain: Electron.IpcMain): void {
  /**
   * 发送对话。
   * 正在生成时不再报错，而是进排队，等本轮结束自动发。
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
      // 设置中断信号
      const controller = startRun(conversationId)
      // 发送消息
      try {
        await sendMessage({
          conversationId,
          message,
          /** 消息ID,也是轮ID */
          messageId: randomUUID(),
          emit: broadcast,
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
}
