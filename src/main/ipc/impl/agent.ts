import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { sendMessage } from '@core/export'
import { MessageEventSend, SendResult } from '@shared/types/newMessageService'
import { AgentEvent } from '@shared/types/newEvent'

/**
 * 正在运行的对话
 *
 * key: 会话ID
 *
 * value: 停止信号
 */
const running = new Map<string, AbortController>()

/**
 * 把 core 推出来的事件转发给所有渲染进程。
 * 用 getAllWindows() 而不是把窗口实例传进 mount()，
 * 因为 main/index.ts 里 mount(ipcMain) 在 createWindow() 之前调用，那时还没有窗口。
 */
function broadcast(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.agent.event, event)
  }
}

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
      const controller = new AbortController()
      running.set(conversationId, controller)
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
        running.delete(conversationId)
      }
    }
  )

  /** 中断对话 */
  ipcMain.handle(IPC.agent.abort, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string') {
      throw new Error('agent.abort: conversationId 必须是字符串')
    }
    running.get(conversationId)?.abort()
  })
}
