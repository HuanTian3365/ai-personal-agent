import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ConversationCreateReq,
  ConversationCreateRes,
  ConversationInfoReq,
  ConversationInfoRes,
  ConversationListRes,
  GroupCreateReq,
  GroupCreateRes,
  GroupDeleteReq,
  GroupDeleteRes,
  GroupExpandReq,
  GroupExpandRes,
  GroupFolderReq,
  GroupFolderRes,
  GroupListRes,
  GroupRenameReq,
  GroupRenameRes,
  MessageListReq,
  MessageListRes,
  WorkspaceListRes
} from '@shared/types/ipcContract'

/**
 * 会话域的三个子域，对应列表三层：工作区 → 分组 → 对话。
 * 保持扁平的 { workspace, group, conversation } 结构，
 * 由 mount.ts 展开进 api，渲染层的 window.api.workspace 等路径不变。
 *
 * 每个通道都返回 Result | main侧不会throw出来 渲染层只判success
 * 入参一律一个对象 对应 ipcContract 的 xxxReq
 * invoke跨进程天生异步 所以这一层返回Promise 数据层本身是同步的
 */
const conversationApi = {
  /** ====================  工作区  ==================== */
  workspace: {
    list: (): Promise<WorkspaceListRes> => ipcRenderer.invoke(IPC.workspace.list)
  },
  /** ====================  分组  ==================== */
  group: {
    list: (): Promise<GroupListRes> => ipcRenderer.invoke(IPC.group.list),
    create: (request: GroupCreateReq): Promise<GroupCreateRes> =>
      ipcRenderer.invoke(IPC.group.create, request),
    expand: (request: GroupExpandReq): Promise<GroupExpandRes> =>
      ipcRenderer.invoke(IPC.group.expand, request),
    folder: (request: GroupFolderReq): Promise<GroupFolderRes> =>
      ipcRenderer.invoke(IPC.group.folder, request),
    delete: (request: GroupDeleteReq): Promise<GroupDeleteRes> =>
      ipcRenderer.invoke(IPC.group.delete, request),
    rename: (request: GroupRenameReq): Promise<GroupRenameRes> =>
      ipcRenderer.invoke(IPC.group.rename, request)
  },
  /** ====================  会话  ==================== */
  conversation: {
    list: (): Promise<ConversationListRes> => ipcRenderer.invoke(IPC.conversation.list),
    create: (request: ConversationCreateReq): Promise<ConversationCreateRes> =>
      ipcRenderer.invoke(IPC.conversation.create, request),
    info: (request: ConversationInfoReq): Promise<ConversationInfoRes> =>
      ipcRenderer.invoke(IPC.conversation.info, request)
  },
  /** ====================  消息  ==================== */
  message: {
    list: (request: MessageListReq): Promise<MessageListRes> =>
      ipcRenderer.invoke(IPC.message.list, request)
  }
}

export default conversationApi
