import { IPC } from '../../../shared/ipc'
import { getHistoryMessage } from '../../../core/export'
import { getRepository } from '../../database'
import type { CreateGroupInput } from '@shared/types/ipcContract'
import type { Result } from '@shared/types/result'
import { shell } from 'electron'

/**
 * 归一新建分组入参
 *
 * 渲染层递过来的参数一律当不可信 同lib/file.ts的validPath
 * path空串与null同义(都没选目录) 在这里合并成一种表达 业务层只见一种
 * title只trim不判非空 空标题的业务含义交给仓储
 */
function normalizeCreateGroupInput(input: unknown): Result<CreateGroupInput> {
  if (typeof input !== 'object' || input === null) {
    return { success: false, error: '入参必须是对象' }
  }
  const { workspaceId, path, title } = input as Record<string, unknown>
  if (workspaceId !== undefined && typeof workspaceId !== 'string') {
    return { success: false, error: '工作区id不合法' }
  }
  if (path !== undefined && path !== null && typeof path !== 'string') {
    return { success: false, error: '分组路径不合法' }
  }
  if (typeof title !== 'string') {
    return { success: false, error: '分组名称不合法' }
  }
  return {
    success: true,
    data: {
      workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
      path: typeof path === 'string' ? path.trim() || null : null,
      title: title.trim()
    }
  }
}

/** 意外异常的文案 | 原始报错用户看不懂 前面补一句人话 */
function failed(what: string, err: unknown): string {
  return `${what}失败：${err instanceof Error ? err.message : String(err)}`
}

export default function registerConversationIpc(ipcMain: Electron.IpcMain): void {
  /** ====================  工作区  ==================== */
  // 工作区列表
  ipcMain.handle(IPC.workspace.list, () => getRepository().listWorkspaces())

  /** ====================  分组  ==================== */
  // 分组列表
  ipcMain.handle(IPC.group.list, () => getRepository().listGroups())
  // 新增分组
  ipcMain.handle(IPC.group.create, (_event, input: unknown) => {
    const parsed = normalizeCreateGroupInput(input)
    if (!parsed.success) return parsed
    return getRepository().createGroup(parsed.data)
  })
  // 分组展开状态
  ipcMain.handle(IPC.group.expand, (_event, id: unknown, open: unknown) => {
    if (typeof id !== 'string' || id.trim() === '') {
      return { success: false, error: '分组id不合法' }
    }
    if (typeof open !== 'boolean') {
      return { success: false, error: '展开状态必须是布尔值' }
    }
    return getRepository().setGroupOpen(id, open)
  })
  // 打开分组目录
  ipcMain.handle(IPC.group.folder, async (_event, path: unknown) => {
    if (typeof path !== 'string' || path.trim() === '') {
      return { success: false, error: '分组路径不合法' }
    }
    // 不经过数据层 自己兜 | openPath返回空串才是成功
    try {
      const err = await shell.openPath(path)
      if (err !== '') return { success: false, error: err }
      return { success: true, data: undefined }
    } catch (err) {
      return { success: false, error: failed('打开文件夹', err) }
    }
  })
  // 删除分组
  ipcMain.handle(IPC.group.delete, (_event, id: unknown) => {
    // 参数不合法也走返回 不throw | throw会被Electron包成Error invoking remote method
    if (typeof id !== 'string' || id.trim() === '') {
      return { success: false, error: '分组id不合法' }
    }
    return getRepository().groupDelete(id)
  })
  // 重命名分组
  ipcMain.handle(IPC.group.rename, (_event, input: unknown) => {
    // 同上 校验失败一律走返回
    if (input === null || typeof input !== 'object') {
      return { success: false, error: '入参必须是对象' }
    }
    const { id, title } = input as Record<string, unknown>
    if (typeof id !== 'string' || id.trim() === '') {
      return { success: false, error: '分组id不合法' }
    }
    if (typeof title !== 'string' || title.trim() === '') {
      return { success: false, error: '分组名称不能为空' }
    }
    return getRepository().groupRename({ id, title: title.trim() })
  })

  /** ====================  会话  ==================== */
  // 会话列表
  ipcMain.handle(IPC.conversation.list, () => getRepository().listConversations())
  // 新建对话
  ipcMain.handle(IPC.conversation.create, (_event, groupId: unknown) => {
    if (groupId !== null && (typeof groupId !== 'string' || groupId.trim() === '')) {
      return { success: false, error: '分组id必须是非空字符串或null' }
    }
    return getRepository().createConversation(groupId)
  })
  // 获取对话信息
  ipcMain.handle(IPC.conversation.info, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    return getRepository().getConversation(conversationId)
  })
  /** ====================  消息  ==================== */
  // 消息列表
  ipcMain.handle(IPC.message.list, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    // 不经过数据层 自己兜
    try {
      return { success: true, data: getHistoryMessage(conversationId) }
    } catch (err) {
      return { success: false, error: failed('读取消息', err) }
    }
  })
}
