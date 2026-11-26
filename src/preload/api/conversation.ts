import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'
import type {
  CreateGroupInput,
  GroupDeleteI,
  GroupDeleteR,
  GroupRenameI,
  GroupRenameR
} from '@shared/types/ipcContract'
import type { Result } from '@shared/types/result'
import type { TurnMessage } from '@shared/types/message'

/**
 * 会话域的三个子域，对应列表三层：工作区 → 分组 → 对话。
 * 保持扁平的 { workspace, group, conversation } 结构，
 * 由 mount.ts 展开进 api，渲染层的 window.api.workspace 等路径不变。
 *
 * 每个通道都返回 Result | main侧不会throw出来 渲染层只判success
 */
const conversationApi = {
  /** ====================  工作区  ==================== */
  workspace: {
    list: (): Promise<Result<HYWorkspace[]>> => ipcRenderer.invoke(IPC.workspace.list)
  },
  /** ====================  分组  ==================== */
  group: {
    list: (): Promise<Result<HYGroup[]>> => ipcRenderer.invoke(IPC.group.list),
    create: (input: CreateGroupInput): Promise<Result<HYGroup>> =>
      ipcRenderer.invoke(IPC.group.create, input),
    expand: (id: string, open: boolean): Promise<Result<undefined>> =>
      ipcRenderer.invoke(IPC.group.expand, id, open),
    folder: (path: string): Promise<Result<undefined>> =>
      ipcRenderer.invoke(IPC.group.folder, path),
    delete: (id: GroupDeleteI): Promise<GroupDeleteR> => ipcRenderer.invoke(IPC.group.delete, id),
    rename: (input: GroupRenameI): Promise<GroupRenameR> =>
      ipcRenderer.invoke(IPC.group.rename, input)
  },
  /** ====================  会话  ==================== */
  conversation: {
    list: (): Promise<Result<HYConversation[]>> => ipcRenderer.invoke(IPC.conversation.list),
    create: (groupId: string | null): Promise<Result<HYConversation>> =>
      ipcRenderer.invoke(IPC.conversation.create, groupId),
    info: (id: string): Promise<Result<HYConversation | null>> =>
      ipcRenderer.invoke(IPC.conversation.info, id)
  },
  /** ====================  消息  ==================== */
  message: {
    list: (conversationId: string): Promise<Result<TurnMessage[]>> =>
      ipcRenderer.invoke(IPC.message.list, conversationId)
  }
}

export default conversationApi
