import { IPC } from '../../../shared/ipc'
import { getHistoryMessage } from '../../../core/export'
import { getRepository } from '../../database'

export default function registerConversationIpc(ipcMain: Electron.IpcMain): void {
  /** ====================  工作区  ==================== */
  ipcMain.handle(IPC.workspace.list, () => getRepository().listWorkspaces())

  /** ====================  分组  ==================== */
  ipcMain.handle(IPC.group.list, () => getRepository().listGroups())

  ipcMain.handle(IPC.group.create, (_event, input: unknown) => {
    if (typeof input !== 'object' || input === null) {
      throw new Error('group.create: 参数必须是对象')
    }
    const { workspaceId, path, title } = input as Record<string, unknown>
    if (workspaceId !== undefined && typeof workspaceId !== 'string') {
      throw new Error('group.create: workspaceId 必须是字符串')
    }
    if (path !== undefined && path !== null && typeof path !== 'string') {
      throw new Error('group.create: path 必须是字符串或 null')
    }
    if (title !== undefined && title !== null && typeof title !== 'string') {
      throw new Error('group.create: title 必须是字符串或 null')
    }
    return getRepository().createGroup({
      workspaceId: workspaceId as string | undefined,
      path: (path as string | null | undefined) ?? null,
      title: (title as string | null | undefined) ?? null
    })
  })

  ipcMain.handle(IPC.group.expand, (_event, id: string, open: boolean) =>
    getRepository().setGroupOpen(id, open)
  )

  /** ====================  会话  ==================== */
  ipcMain.handle(IPC.conversation.list, () => getRepository().listConversations())

  ipcMain.handle(IPC.conversation.create, (_event, groupId: unknown) => {
    if (groupId !== null && typeof groupId !== 'string') {
      throw new Error('conversation.create: groupId 必须是字符串或 null')
    }
    return getRepository().createConversation(groupId)
  })

  ipcMain.handle(IPC.conversation.info, (_event, conversationId: string) =>
    getRepository().getConversation(conversationId)
  )
  /** ====================  消息  ==================== */
  ipcMain.handle(IPC.message.list, (_event, conversationId: string) =>
    getHistoryMessage(conversationId)
  )
}
