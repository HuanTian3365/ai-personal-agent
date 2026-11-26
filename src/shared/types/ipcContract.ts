/**
 * IPC 契约 | 每个通道的入参和出参
 *
 * 通道名在ipc.ts 形状在这里 按那边的域分组
 * 每个IPC.xxx.yyy的出入参都能在这一份里查到
 */

import type { AgentEventEnvelope } from './agentEvent'
import type { HYEQueueItem } from './hyExpand'

/** ====================  agent  ==================== */

/** agent:send 的入参 | 形状归core定义 见message.ts */
export type { MessageEventSend } from './message'

/** agent:send 的投递方式 | queue: 排队等本轮结束 insert: 推进当前轮 */
export type SendMode = 'queue' | 'insert'

/**
 * 排队项 | 推给渲染层的样子
 *
 * 比库里多一个claimed 它不落库: 落库后重启没人回滚 那条排队项就成了幽灵
 * 库里的形状见hyExpand.ts
 */
export interface HYEQueueItemView extends HYEQueueItem {
  /** 已被本轮领走 | 渲染层靠它判断这条插队还等不等得到位置 */
  claimed?: boolean
}

/** agent:send 的返回 | sent: 已受理 queued: 正在生成 这条已进排队 */
export type SendResult = { status: 'sent' } | { status: 'queued'; queue: HYEQueueItemView[] }

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
  /** null或不传 = 不绑目录 */
  path?: string | null
  /** 绑了文件夹时留空取文件夹名 不绑时必填 */
  title?: string | null
}
