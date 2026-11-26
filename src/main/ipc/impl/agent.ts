import { IPC } from '@shared/ipc'
import type { MessageEventSend } from '@shared/types/message'
import { objectInput } from '@main/utils/input'
import { submitMessage } from '../../runtime/drive'
import { editQueueItem, listQueue, markInsert, removeQueueItem } from '../../runtime/queue'
import { abortRun, emitInsertBlock, emitQueue, getSnapshot } from '../../runtime/run'

/**
 * agent 域的事件注册。
 *
 * 只做三件事:挂 handler、校验参数、转发给 runtime。
 * 队列在 runtime/queue.ts 台账与推送在 runtime/run.ts 驱动循环在 runtime/drive.ts
 * 事件出口在 ipc/broadcast.ts。
 *
 * 失败一律走Result不throw | 渲染层只判success 入参按unknown收
 */
export default function registerAgentIpc(ipcMain: Electron.IpcMain): void {
  // 发送对话：mode=queue 排队等本轮结束 | mode=insert 生成中推进当前轮 | 受理即返回 进度靠事件推
  ipcMain.handle(IPC.agent.send, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId, message, mode } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    if (
      message === null ||
      typeof message !== 'object' ||
      typeof (message as { content?: unknown }).content !== 'string' ||
      (message as { content: string }).content.trim() === ''
    ) {
      return { success: false, error: '发送内容不能为空' }
    }
    if (mode !== 'queue' && mode !== 'insert') {
      return { success: false, error: '投递方式只能是queue或insert' }
    }
    return {
      success: true,
      data: submitMessage({ conversationId, message: message as MessageEventSend, mode })
    }
  })

  // 中断对话
  ipcMain.handle(IPC.agent.abort, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    abortRun(conversationId)
    return { success: true, data: undefined }
  })

  // 获得进行中那一轮的快照,没在跑给 null
  ipcMain.handle(IPC.agent.snapshot, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    return { success: true, data: getSnapshot(conversationId) }
  })

  // 取该对话的排队内容
  ipcMain.handle(IPC.agent.queue, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    return { success: true, data: listQueue(conversationId) }
  })

  // 把排队里的一条改成插队
  ipcMain.handle(IPC.agent.insert, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId, itemId } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    if (typeof itemId !== 'string' || itemId.trim() === '') {
      return { success: false, error: '排队项id不合法' }
    }
    if (!markInsert(conversationId, itemId)) {
      return { success: false, error: '这条不在排队里' }
    }
    // 立即画进当前轮 队列里那条不再显示
    const item = listQueue(conversationId).find((row) => row.id === itemId)
    if (item !== undefined) emitInsertBlock(conversationId, item)
    emitQueue(conversationId, listQueue(conversationId))
    return { success: true, data: undefined }
  })

  // 改排队里的一条：改文案 / 删除
  ipcMain.handle(IPC.agent.queueUpdate, (_event, request: unknown) => {
    const fields = objectInput(request)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId, itemId, action } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    if (typeof itemId !== 'string' || itemId.trim() === '') {
      return { success: false, error: '排队项id不合法' }
    }
    if (action === null || typeof action !== 'object') {
      return { success: false, error: '动作必须是对象' }
    }
    const { kind, text } = action as Record<string, unknown>
    let changed: boolean
    if (kind === 'edit') {
      if (typeof text !== 'string') return { success: false, error: '改文案需要文本' }
      changed = editQueueItem(conversationId, itemId, text)
    } else if (kind === 'remove') {
      changed = removeQueueItem(conversationId, itemId)
    } else {
      return { success: false, error: '动作只能是edit或remove' }
    }
    emitQueue(conversationId, listQueue(conversationId))
    if (!changed) return { success: false, error: '这条不在排队里' }
    return { success: true, data: undefined }
  })
}
