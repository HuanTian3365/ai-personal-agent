import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { Conversation, Group, Workspace } from '@shared/types/conversation'
import type { CreateGroupInput } from '@shared/types/conversationService'
import type { TurnMessage } from '@shared/types/message'

/**
 * 会话域的三个子域，对应列表三层：工作区 → 分组 → 对话。
 * 保持扁平的 { workspace, group, conversation } 结构，
 * 由 mount.ts 展开进 api，渲染层的 window.api.workspace 等路径不变。
 */
const conversationApi = {
  /** ====================  工作区  ==================== */
  workspace: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke(IPC.workspace.list)
  },
  /** ====================  分组  ==================== */
  group: {
    list: (): Promise<Group[]> => ipcRenderer.invoke(IPC.group.list),
    create: (input: CreateGroupInput): Promise<Group> =>
      ipcRenderer.invoke(IPC.group.create, input),
    expand: (id: string, open: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.group.expand, id, open)
  },
  /** ====================  会话  ==================== */
  conversation: {
    list: (): Promise<Conversation[]> => ipcRenderer.invoke(IPC.conversation.list),
    create: (groupId: string | null): Promise<Conversation> =>
      ipcRenderer.invoke(IPC.conversation.create, groupId),
    info: (id: string): Promise<Conversation | null> =>
      ipcRenderer.invoke(IPC.conversation.info, id)
  },
  /** ====================  消息  ==================== */
  message: {
    list: (conversationId: string): Promise<TurnMessage[]> =>
      ipcRenderer.invoke(IPC.message.list, conversationId)
  }
}

export default conversationApi
