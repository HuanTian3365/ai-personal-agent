import { IPC } from '../../../shared/ipc'
import { getHistoryMessage } from '../../../core/export'
import { getRepository } from '../../database'
import type { CreateGroupInput } from '@shared/types/ipcContract'

export default function registerConversationIpc(ipcMain: Electron.IpcMain): void {
  /** ====================  工作区  ==================== */
  // 工作区列表
  ipcMain.handle(IPC.workspace.list, () => getRepository().listWorkspaces())

  /** ====================  分组  ==================== */
  // 分组列表
  ipcMain.handle(IPC.group.list, () => getRepository().listGroups())
  // 新增分组
  ipcMain.handle(IPC.group.create, (_event, input: CreateGroupInput) => {
    return getRepository().createGroup(input)
  })
  // 分组展开状态
  ipcMain.handle(IPC.group.expand, (_event, id: string, open: boolean) =>
    getRepository().setGroupOpen(id, open)
  )

  /** ====================  会话  ==================== */
  // 会话列表
  ipcMain.handle(IPC.conversation.list, () => getRepository().listConversations())
  // 新建对话
  ipcMain.handle(IPC.conversation.create, (_event, groupId: string | null) => {
    return getRepository().createConversation(groupId)
  })
  // 获取对话信息
  ipcMain.handle(IPC.conversation.info, (_event, conversationId: string) =>
    getRepository().getConversation(conversationId)
  )
  /** ====================  消息  ==================== */
  // 消息列表
  ipcMain.handle(IPC.message.list, (_event, conversationId: string) =>
    getHistoryMessage(conversationId)
  )
}
