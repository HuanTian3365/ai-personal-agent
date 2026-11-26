import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ConversationCreateI,
  ConversationCreateR,
  ConversationInfoI,
  ConversationInfoR,
  ConversationListR,
  GroupCreateI,
  GroupCreateR,
  GroupDeleteI,
  GroupDeleteR,
  GroupExpandI,
  GroupExpandR,
  GroupFolderI,
  GroupFolderR,
  GroupListR,
  GroupRenameI,
  GroupRenameR,
  MessageListI,
  MessageListR,
  WorkspaceListR
} from '@shared/types/ipcContract'

/**
 * 会话域的三个子域，对应列表三层：工作区 → 分组 → 对话。
 * 保持扁平的 { workspace, group, conversation } 结构，
 * 由 mount.ts 展开进 api，渲染层的 window.api.workspace 等路径不变。
 *
 * 每个通道都返回 Result | main侧不会throw出来 渲染层只判success
 * 入参一律一个对象 对应 ipcContract 的 xxxI
 */
const conversationApi = {
  /** ====================  工作区  ==================== */
  workspace: {
    list: (): Promise<WorkspaceListR> => ipcRenderer.invoke(IPC.workspace.list)
  },
  /** ====================  分组  ==================== */
  group: {
    list: (): Promise<GroupListR> => ipcRenderer.invoke(IPC.group.list),
    create: (input: GroupCreateI): Promise<GroupCreateR> =>
      ipcRenderer.invoke(IPC.group.create, input),
    expand: (input: GroupExpandI): Promise<GroupExpandR> =>
      ipcRenderer.invoke(IPC.group.expand, input),
    folder: (input: GroupFolderI): Promise<GroupFolderR> =>
      ipcRenderer.invoke(IPC.group.folder, input),
    delete: (input: GroupDeleteI): Promise<GroupDeleteR> =>
      ipcRenderer.invoke(IPC.group.delete, input),
    rename: (input: GroupRenameI): Promise<GroupRenameR> =>
      ipcRenderer.invoke(IPC.group.rename, input)
  },
  /** ====================  会话  ==================== */
  conversation: {
    list: (): Promise<ConversationListR> => ipcRenderer.invoke(IPC.conversation.list),
    create: (input: ConversationCreateI): Promise<ConversationCreateR> =>
      ipcRenderer.invoke(IPC.conversation.create, input),
    info: (input: ConversationInfoI): Promise<ConversationInfoR> =>
      ipcRenderer.invoke(IPC.conversation.info, input)
  },
  /** ====================  消息  ==================== */
  message: {
    list: (input: MessageListI): Promise<MessageListR> =>
      ipcRenderer.invoke(IPC.message.list, input)
  }
}

export default conversationApi
