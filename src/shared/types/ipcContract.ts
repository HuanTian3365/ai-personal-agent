/**
 * IPC 契约 | 每个通道的入参和出参
 *
 * 放: 描述[一次请求或响应长什么样]的类型 按ipc.ts的域分组
 * 不放: 描述[某个东西是什么]的实体 轮-> message.ts | 表行-> hyEntity.ts | 排队项-> hyExpand.ts
 * 响应里带的实体从各实体文件引用 不在这里重定义
 */

import type { AgentEventEnvelope } from './agentEvent'
import type { HYEQueueItem } from './hyExpand'

/** ====================  agent  ==================== */

/** agent:send 的入参 | 形状归core定义 见message.ts */
export type { MessageEventSend } from './message'

/** agent:send 的投递方式 | queue: 排队等本轮结束 insert: 推进当前轮 */
export type SendMode = 'queue' | 'insert'

/** agent:send 的返回 | sent: 已受理 queued: 正在生成 这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: HYEQueueItem[] }

/** agent:queue:update 的入参 | 改文案或删一条 插队走agent:insert */
export type QueueEditAction = { kind: 'edit'; text: string } | { kind: 'remove' }

/** agent:snapshot 的返回 | 正在生成中的那一轮 重启即失效 */
export interface StreamSnapshot {
  conversationId: string
  /** 按序重放一遍就能重建整轮 */
  events: AgentEventEnvelope[]
}

/** ====================  group  ==================== */

/** group:create 的入参 | 传原始值 规范化与缺省由main决定 */
export interface CreateGroupInput {
  /** 不传落缺省工作区 */
  workspaceId?: string
  /** null = 不绑目录 | 空串由main归一成null */
  path: string | null
  /** 绑了文件夹时留空取文件夹名 不绑时必填 */
  title: string
}

/** group:create 新建分组返回值*/
export interface CreateGroupOutput {
  success: boolean
  error?: {
    path?: string
    another?: string
  }
}

/** 成功|失败 | 判别式 收窄后 data/error 必有一个为真值 */
type Result<T = undefined, E = string> = { success: true; data: T } | { success: false; error: E }

export interface GroupRenameI {
  id: string
  title: string
}
export type GroupRenameR = Result

export type GroupRenameF = (input: GroupRenameI) => Promise<GroupRenameR>
