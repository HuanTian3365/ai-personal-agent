import { ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ConversationCreateFun,
  ConversationInfoFun,
  ConversationListFun,
  GroupCreateFun,
  GroupDeleteFun,
  GroupExpandFun,
  GroupFolderFun,
  GroupListFun,
  GroupRenameFun,
  MessageListFun,
  ToAsync,
  WorkspaceListFun
} from '@shared/types/ipcContract'

/**
 * window.api 的形状
 *
 * 签名直接用契约里的 xxxFun 与 ToAsync<xxxFun> | 这一层不重复写参数与返回
 * invoke跨进程天生异步 所以全部是异步版 | group.folder本身已是异步 直接引GroupFolderFun
 */
interface ConversationPreload {
  /** ====================  工作区  ==================== */
  workspace: {
    // ========== 工作区列表
    list: ToAsync<WorkspaceListFun>
  }
  /** ====================  分组  ==================== */
  group: {
    // ========== 分组列表
    list: ToAsync<GroupListFun>
    // ========== 新增分组
    create: ToAsync<GroupCreateFun>
    // ========== 分组展开收起
    expand: ToAsync<GroupExpandFun>
    // ========== 打开分组目录
    folder: GroupFolderFun
    // ========== 删除分组
    delete: ToAsync<GroupDeleteFun>
    // ========== 重命名分组
    rename: ToAsync<GroupRenameFun>
  }
  /** ====================  会话  ==================== */
  conversation: {
    // ========== 会话列表
    list: ToAsync<ConversationListFun>
    // ========== 新建对话
    create: ToAsync<ConversationCreateFun>
    // ========== 获取对话信息
    info: ToAsync<ConversationInfoFun>
  }
  /** ====================  消息  ==================== */
  message: {
    // ========== 消息列表
    list: ToAsync<MessageListFun>
  }
}

/**
 * 会话域的三个子域，对应列表三层：工作区 → 分组 → 对话。
 * 保持扁平的 { workspace, group, conversation } 结构，
 * 由 mount.ts 展开进 api，渲染层的 window.api.workspace 等路径不变。
 */
const conversationApi: ConversationPreload = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC.workspace.list)
  },
  group: {
    list: () => ipcRenderer.invoke(IPC.group.list),
    create: (request) => ipcRenderer.invoke(IPC.group.create, request),
    expand: (request) => ipcRenderer.invoke(IPC.group.expand, request),
    folder: (request) => ipcRenderer.invoke(IPC.group.folder, request),
    delete: (request) => ipcRenderer.invoke(IPC.group.delete, request),
    rename: (request) => ipcRenderer.invoke(IPC.group.rename, request)
  },
  conversation: {
    list: () => ipcRenderer.invoke(IPC.conversation.list),
    create: (request) => ipcRenderer.invoke(IPC.conversation.create, request),
    info: (request) => ipcRenderer.invoke(IPC.conversation.info, request)
  },
  message: {
    list: (request) => ipcRenderer.invoke(IPC.message.list, request)
  }
}

export default conversationApi
