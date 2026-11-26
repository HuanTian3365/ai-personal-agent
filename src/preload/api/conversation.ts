import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'
import type { CreateGroupInput } from '@shared/types/ipcContract'
import type { TurnMessage } from '@shared/types/message'

/**
 * 会话域的三个子域，对应列表三层：工作区 → 分组 → 对话。
 * 保持扁平的 { workspace, group, conversation } 结构，
 * 由 mount.ts 展开进 api，渲染层的 window.api.workspace 等路径不变。
 */
const conversationApi = {
  /** ====================  工作区  ==================== */
  workspace: {
    list: (): Promise<HYWorkspace[]> => ipcRenderer.invoke(IPC.workspace.list)
  },
  /** ====================  分组  ==================== */
  group: {
    list: (): Promise<HYGroup[]> => ipcRenderer.invoke(IPC.group.list),
    create: (input: CreateGroupInput): Promise<HYGroup> =>
      ipcRenderer.invoke(IPC.group.create, input),
    expand: (id: string, open: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.group.expand, id, open),
    folder: (path: string): Promise<void> => ipcRenderer.invoke(IPC.group.folder, path),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.group.delete, id),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke(IPC.group.rename, id, title)
  },
  /** ====================  会话  ==================== */
  conversation: {
    list: (): Promise<HYConversation[]> => ipcRenderer.invoke(IPC.conversation.list),
    create: (groupId: string | null): Promise<HYConversation> =>
      ipcRenderer.invoke(IPC.conversation.create, groupId),
    info: (id: string): Promise<HYConversation | null> =>
      ipcRenderer.invoke(IPC.conversation.info, id)
  },
  /** ====================  消息  ==================== */
  message: {
    list: (conversationId: string): Promise<TurnMessage[]> =>
      ipcRenderer.invoke(IPC.message.list, conversationId)
  }
}

export default conversationApi
