/**
 * IPC 契约 | 每个通道的入参和出参
 *
 * 放: 描述[一次请求或响应长什么样]的类型 按ipc.ts的域分组
 * 不放: 描述[某个东西是什么]的实体 轮-> message.ts | 表行-> hyEntity.ts | 排队项-> hyExpand.ts
 * 响应里带的实体从各实体文件引用 不在这里重定义
 *
 * 每个通道三件套: xxxReq入参(有参数才有) | xxxRes返回 | xxxFun函数签名 同组之间不空行
 * 入参一律聚成一个对象 参数名统一叫request | 跨进程传位置参数没法在main侧收窄 一个对象才好整体校验
 * Res里不放调用方用不上的data | 没人读就写Result不带泛型
 *
 * xxxFun是数据层的签名 同步返回 | 数据库本身同步 能同步就别包Promise
 * 渲染层拿到的必然是Promise(invoke跨进程) 它用 ToAsync<xxxFun> 不另起类型名
 */

import type { AgentEventEnvelope } from './agentEvent'
import type { HYConversation, HYGroup, HYWorkspace } from './hyEntity'
import type { HYEConversationExpand, HYEQueueItem } from './hyExpand'
import type { TurnMessage } from './message'
import type { Result } from './result'

/**
 * 同步签名转异步
 *
 * 渲染层跨进程拿到的必然是Promise(invoke天生异步) | 但不该为它另写一套同名类型
 * 用法: ToAsync<GroupRenameFun> 一眼看出这是哪个契约的异步版
 */
export type ToAsync<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<R>
  : never

/** ====================  agent  ==================== */

/** agent:send 的入参 | 形状归core定义 见message.ts */
export type { MessageEventSend } from './message'

// ========== agent发送的投递方式
/** queue: 排队等本轮结束 insert: 推进当前轮 */
export type SendMode = 'queue' | 'insert'

// ========== agent发送的返回
/** sent: 已受理 queued: 正在生成 这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: HYEQueueItem[] }

// ========== agent改排队项
/** kind: edit 改文案 | remove 删一条 插队走agent:insert */
export type QueueEditAction = { kind: 'edit'; text: string } | { kind: 'remove' }

// ========== agent取进行中那一轮的快照
export interface StreamSnapshot {
  conversationId: string
  /** 按序重放一遍就能重建整轮 */
  events: AgentEventEnvelope[]
}

/** ====================  workspace  ==================== */

// ========== 工作区列表
export type WorkspaceListRes = Result<HYWorkspace[]>
export type WorkspaceListFun = () => WorkspaceListRes

/** ====================  group  ==================== */

// ========== 分组列表
export type GroupListRes = Result<HYGroup[]>
export type GroupListFun = () => GroupListRes

// ========== 新增分组
export interface GroupCreateReq {
  /** 不传落缺省工作区 */
  workspaceId?: string
  /** null = 不绑目录 | 空串由main归一成null */
  path: string | null
  /** 绑了文件夹时留空取文件夹名 不绑时必填 */
  title: string
}
/** 新建成功不返回实体 列表由调用方重拉 */
export type GroupCreateRes = Result
export type GroupCreateFun = (request: GroupCreateReq) => GroupCreateRes

// ========== 新增分组的失败原因
/** 每个字段贴到对应输入框下面 只服务弹窗 */
export interface GroupCreateError {
  path?: string
  another?: string
}
/** 渲染层 hook 给弹窗的返回 | 只这一处与GroupCreateRes不同 */
export type GroupCreateOutput = Result<undefined, GroupCreateError>

// ========== 分组展开收起
export interface GroupExpandReq {
  id: string
  open: boolean
}
export type GroupExpandRes = Result
export type GroupExpandFun = (request: GroupExpandReq) => GroupExpandRes

// ========== 打开分组目录
export interface GroupFolderReq {
  path: string
}
export type GroupFolderRes = Result
/** shell.openPath是异步的 这个通道去不掉Promise */
export type GroupFolderFun = (request: GroupFolderReq) => Promise<GroupFolderRes>

// ========== 删除分组
export interface GroupDeleteReq {
  id: string
}
export type GroupDeleteRes = Result
export type GroupDeleteFun = (request: GroupDeleteReq) => GroupDeleteRes

// ========== 重命名分组
export interface GroupRenameReq {
  id: string
  title: string
}
export type GroupRenameRes = Result
export type GroupRenameFun = (request: GroupRenameReq) => GroupRenameRes

/** ====================  conversation  ==================== */

// ========== 会话列表
export type ConversationListRes = Result<HYConversation[]>
export type ConversationListFun = () => ConversationListRes

// ========== 新建对话
export interface ConversationCreateReq {
  /** null = 未分组 落所属工作区的默认分组 */
  groupId: string | null
}
/** 只给调用方真用得上的字段 */
export type ConversationCreateRes = Result<
  Omit<HYConversation, 'groupId' | 'title' | 'sortIndex' | 'expand' | 'createdAt' | 'updatedAt'>
>
export type ConversationCreateFun = (request: ConversationCreateReq) => ConversationCreateRes

// ========== 获取对话信息
export interface ConversationInfoReq {
  id: string
}
export type ConversationInfoRes = Result<HYConversation | null>
export type ConversationInfoFun = (request: ConversationInfoReq) => ConversationInfoRes

// ========== 更新对话标题 | 只在core内部用 没开IPC通道
export interface ConversationUpdateTitleReq {
  id: string
  title: string
}
export type ConversationUpdateTitleRes = Result
export type ConversationUpdateTitleFun = (
  request: ConversationUpdateTitleReq
) => ConversationUpdateTitleRes

// ========== 读会话扩展 | 只在queue内部用 没开IPC通道
export interface ConversationReadExpandReq {
  id: string
}
export type ConversationReadExpandRes = Result<HYEConversationExpand>
export type ConversationReadExpandFun = (
  request: ConversationReadExpandReq
) => ConversationReadExpandRes

// ========== 写会话扩展 | 只在queue内部用 没开IPC通道
export interface ConversationUpdateExpandReq {
  id: string
  scope: string
  patch: Record<string, unknown>
}
export type ConversationUpdateExpandRes = Result
export type ConversationUpdateExpandFun = (
  request: ConversationUpdateExpandReq
) => ConversationUpdateExpandRes

/** ====================  message  ==================== */

// ========== 消息列表
export interface MessageListReq {
  conversationId: string
}
export type MessageListRes = Result<TurnMessage[]>
export type MessageListFun = (request: MessageListReq) => MessageListRes

/** ====================  expand  ==================== */

// ========== 选择目录
/** 无参数 | 用户取消时 data 是 null 不是失败 与选了空路径区分 */
export type ExpandPickDirectoryRes = Result<string | null>
/** showOpenDialog 是异步的 这个通道去不掉Promise */
export type ExpandPickDirectoryFun = () => Promise<ExpandPickDirectoryRes>

// ========== 校验路径
export interface ExpandValidPathReq {
  path: string
}
/** 路径不存在算失败 原因直接给用户看 */
export type ExpandValidPathRes = Result
export type ExpandValidPathFun = (request: ExpandValidPathReq) => ExpandValidPathRes
