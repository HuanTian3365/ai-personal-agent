import { IPC } from '../../../shared/ipc'
import { getHistoryMessage } from '../../../core/export'
import { getRepository } from '../../database'
import type { CreateGroupInput, GroupRenameI } from '@shared/types/ipcContract'
import { shell } from 'electron'

/**
 * 归一新建分组入参
 *
 * 渲染层递过来的参数一律当不可信 同lib/file.ts的validPath
 * path空串与null同义(都没选目录) 在这里合并成一种表达 业务层只见一种
 * title只trim不判非空 空标题的业务含义交给仓储
 */
function normalizeCreateGroupInput(input: unknown): CreateGroupInput {
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
  if (typeof title !== 'string') {
    throw new Error('group.create: title 必须是字符串')
  }
  return {
    workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
    path: typeof path === 'string' ? path.trim() || null : null,
    title: title.trim()
  }
}

export default function registerConversationIpc(ipcMain: Electron.IpcMain): void {
  /** ====================  工作区  ==================== */
  // 工作区列表
  ipcMain.handle(IPC.workspace.list, () => getRepository().listWorkspaces())

  /** ====================  分组  ==================== */
  // 分组列表
  ipcMain.handle(IPC.group.list, () => getRepository().listGroups())
  // 新增分组
  ipcMain.handle(IPC.group.create, (_event, input: unknown) =>
    getRepository().createGroup(normalizeCreateGroupInput(input))
  )
  // 分组展开状态
  ipcMain.handle(IPC.group.expand, (_event, id: unknown, open: unknown) => {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error('group.expand: id 必须是非空字符串')
    }
    if (typeof open !== 'boolean') {
      throw new Error('group.expand: open 必须是布尔值')
    }
    return getRepository().setGroupOpen(id, open)
  })
  // 打开分组目录
  ipcMain.handle(IPC.group.folder, async (_event, path: unknown) => {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('group.folder: path 必须是非空字符串')
    }
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })
  // 删除分组
  ipcMain.handle(IPC.group.delete, (_event, id: unknown) => {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error('group.delete: id 必须是非空字符串')
    }
    return
  })
  // 重命名分组
  ipcMain.handle(IPC.group.rename, (_event, input: GroupRenameI) => {
    return getRepository().groupRename(input)
  })

  /** ====================  会话  ==================== */
  // 会话列表
  ipcMain.handle(IPC.conversation.list, () => getRepository().listConversations())
  // 新建对话
  ipcMain.handle(IPC.conversation.create, (_event, groupId: unknown) => {
    if (groupId !== null && (typeof groupId !== 'string' || groupId.trim() === '')) {
      throw new Error('conversation.create: groupId 必须是非空字符串或 null')
    }
    return getRepository().createConversation(groupId)
  })
  // 获取对话信息
  ipcMain.handle(IPC.conversation.info, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('conversation.info: conversationId 必须是非空字符串')
    }
    return getRepository().getConversation(conversationId)
  })
  /** ====================  消息  ==================== */
  // 消息列表
  ipcMain.handle(IPC.message.list, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('message.list: conversationId 必须是非空字符串')
    }
    return getHistoryMessage(conversationId)
  })
}
