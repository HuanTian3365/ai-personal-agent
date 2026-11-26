import { IPC } from '@shared/ipc'
import type { HYEQueueItemView } from '@shared/types/queueItem'
import type { MessageEventSend } from '@shared/types/message'
import type { SendMode, SendResult, StreamSnapshot } from '@shared/types/ipcContract'
import { submitMessage } from '../../runtime/drive'
import { editQueueItem, listQueue, markInsert, removeQueueItem } from '../../runtime/queue'
import { abortRun, emitInsertBlock, emitQueue, getSnapshot } from '../../runtime/run'

/**
 * agent 域的事件注册。
 *
 * 只做三件事:挂 handler、校验参数、转发给 runtime。
 * 队列在 runtime/queue.ts 台账与推送在 runtime/run.ts 驱动循环在 runtime/drive.ts
 * 事件出口在 ipc/broadcast.ts。
 */
export default function registerAgentIpc(ipcMain: Electron.IpcMain): void {
  /**
   * 发送对话。
   *
   * mode=queue: 空闲就直接跑 生成中就排队等本轮结束
   * mode=insert: 生成中直接推进当前轮(插队) 不进排队区
   * 受理即返回 不等整轮跑完 进度靠事件推
   */
  ipcMain.handle(
    IPC.agent.send,
    async (
      _event,
      conversationId: unknown,
      message: MessageEventSend,
      mode: unknown
    ): Promise<SendResult> => {
      if (typeof conversationId !== 'string' || conversationId.trim() === '') {
        throw new Error('agent.send: conversationId 必须是非空字符串')
      }
      if (typeof message?.content !== 'string' || message.content.trim() === '') {
        throw new Error('agent.send: content 必须是非空字符串')
      }
      if (mode !== 'queue' && mode !== 'insert') {
        throw new Error('agent.send: mode 必须是 queue 或 insert')
      }
      return submitMessage({ conversationId, message, mode: mode as SendMode })
    }
  )

  /** 中断对话 */
  ipcMain.handle(IPC.agent.abort, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string') {
      throw new Error('agent.abort: conversationId 必须是字符串')
    }
    abortRun(conversationId)
  })

  /** 获得进行中那一轮的快照,没在跑返回 null */
  ipcMain.handle(IPC.agent.snapshot, (_event, conversationId: unknown): StreamSnapshot | null => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('agent.snapshot: conversationId 必须是非空字符串')
    }
    return getSnapshot(conversationId)
  })

  /** 取该对话的排队内容 */
  ipcMain.handle(IPC.agent.queue, (_event, conversationId: unknown): HYEQueueItemView[] => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('agent.queue: conversationId 必须是非空字符串')
    }
    return listQueue(conversationId)
  })

  /** 把排队里的一条改成插队 */
  ipcMain.handle(
    IPC.agent.insert,
    async (_event, conversationId: unknown, itemId: unknown): Promise<void> => {
      if (typeof conversationId !== 'string' || conversationId.trim() === '') {
        throw new Error('agent.insert: conversationId 必须是非空字符串')
      }
      if (typeof itemId !== 'string' || itemId.trim() === '') {
        throw new Error('agent.insert: itemId 必须是非空字符串')
      }
      const changed = await markInsert(conversationId, itemId)
      if (!changed) throw new Error('agent.insert: 这条不在排队里')
      // 立即画进当前轮 队列里那条不再显示
      const item = listQueue(conversationId).find((row) => row.id === itemId)
      if (item !== undefined) emitInsertBlock(conversationId, item)
      emitQueue(conversationId, listQueue(conversationId))
    }
  )

  /** 改排队里的一条：改文案 / 删除 */
  ipcMain.handle(
    IPC.agent.queueUpdate,
    async (_event, conversationId: unknown, itemId: unknown, action: unknown): Promise<void> => {
      if (typeof conversationId !== 'string' || conversationId.trim() === '') {
        throw new Error('agent.queueUpdate: conversationId 必须是非空字符串')
      }
      if (typeof itemId !== 'string' || itemId.trim() === '') {
        throw new Error('agent.queueUpdate: itemId 必须是非空字符串')
      }
      if (action === null || typeof action !== 'object') {
        throw new Error('agent.queueUpdate: action 必须是对象')
      }
      const { kind, text } = action as Record<string, unknown>
      let changed: boolean
      if (kind === 'edit') {
        if (typeof text !== 'string') {
          throw new Error('agent.queueUpdate: edit 需要 text')
        }
        changed = await editQueueItem(conversationId, itemId, text)
      } else if (kind === 'remove') {
        changed = await removeQueueItem(conversationId, itemId)
      } else {
        throw new Error('agent.queueUpdate: kind 只能是 edit 或 remove')
      }
      emitQueue(conversationId, listQueue(conversationId))
      if (!changed) throw new Error('agent.queueUpdate: 这条不在排队里')
    }
  )
}
