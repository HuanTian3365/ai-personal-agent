import { IPC } from '../../../shared/ipc'
import { getHistoryMessage } from '../../../core/export'
import { getRepository } from '../../database'
import { errorText } from '@main/utils/error'
import { objectInput } from '@main/utils/input'
import { shell } from 'electron'

export default function registerConversationIpc(ipcMain: Electron.IpcMain): void {
  /** ====================  工作区  ==================== */
  // 工作区列表
  ipcMain.handle(IPC.workspace.list, () => getRepository().workspaceList())

  /** ====================  分组  ==================== */
  // 分组列表
  ipcMain.handle(IPC.group.list, () => getRepository().groupList())
  // 新增分组
  ipcMain.handle(IPC.group.create, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { workspaceId, path, title } = fields
    if (workspaceId !== undefined && typeof workspaceId !== 'string') {
      return { success: false, error: '工作区id不合法' }
    }
    if (path !== undefined && path !== null && typeof path !== 'string') {
      return { success: false, error: '分组路径不合法' }
    }
    if (typeof title !== 'string') {
      return { success: false, error: '分组名称不合法' }
    }
    // path空串与null同义(都没选目录) 归一成一种 业务层只见一种
    return getRepository().groupCreate({
      workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
      path: typeof path === 'string' ? path.trim() || null : null,
      title: title.trim()
    })
  })
  // 分组展开状态
  ipcMain.handle(IPC.group.expand, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { id, open } = fields
    if (typeof id !== 'string' || id.trim() === '') {
      return { success: false, error: '分组id不合法' }
    }
    if (typeof open !== 'boolean') {
      return { success: false, error: '展开状态必须是布尔值' }
    }
    return getRepository().groupExpand({ id, open })
  })
  // 打开分组目录
  ipcMain.handle(IPC.group.folder, async (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { path } = fields
    if (typeof path !== 'string' || path.trim() === '') {
      return { success: false, error: '分组路径不合法' }
    }
    // 不经过数据层 自己兜 | openPath返回空串才是成功
    try {
      const err = await shell.openPath(path)
      if (err !== '') return { success: false, error: err }
      return { success: true, data: undefined }
    } catch (err) {
      return { success: false, error: errorText('打开文件夹', err) }
    }
  })
  // 删除分组
  ipcMain.handle(IPC.group.delete, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { id } = fields
    if (typeof id !== 'string' || id.trim() === '') {
      return { success: false, error: '分组id不合法' }
    }
    return getRepository().groupDelete({ id })
  })
  // 重命名分组
  ipcMain.handle(IPC.group.rename, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { id, title } = fields
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
  ipcMain.handle(IPC.conversation.list, () => getRepository().conversationList())
  // 新建对话
  ipcMain.handle(IPC.conversation.create, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { groupId } = fields
    if (groupId !== null && (typeof groupId !== 'string' || groupId.trim() === '')) {
      return { success: false, error: '分组id必须是非空字符串或null' }
    }
    return getRepository().conversationCreate({ groupId })
  })
  // 获取对话信息
  ipcMain.handle(IPC.conversation.info, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { id } = fields
    if (typeof id !== 'string' || id.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    return getRepository().conversationInfo({ id })
  })
  /** ====================  消息  ==================== */
  // 消息列表
  ipcMain.handle(IPC.message.list, (_event, input: unknown) => {
    const fields = objectInput(input)
    if (fields === null) return { success: false, error: '入参必须是对象' }
    const { conversationId } = fields
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      return { success: false, error: '对话id不合法' }
    }
    // 不经过数据层 自己兜
    try {
      return { success: true, data: getHistoryMessage(conversationId) }
    } catch (err) {
      return { success: false, error: errorText('读取消息', err) }
    }
  })
}
