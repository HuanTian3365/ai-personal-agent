/**
 * agent 域的进程内运行时台账。
 *
 * 只存「跨 IPC 调用要共享的状态」,不承担顺序编排(一轮里先做什么、再做什么归 core)。
 * 每会话一条记录:中断信号 + 本轮已发出的事件。
 * 事件是切回会话时的重放源(见 docs/待实现/02.BUG) core 不知道它存在。
 */

import type { AgentEvent, AgentEventEnvelope } from '@shared/types/agentEvent'
import type { StreamSnapshot } from '@shared/types/messageService'

/** 一个会话正在进行中的一轮 */
interface SessionRun {
  /** 停止信号 */
  controller: AbortController
  /** 本轮已发出的事件(带推送序号) | 切回时重放给晚加入的订阅者 */
  events: AgentEventEnvelope[]
}

/** 正在运行的对话 | key: 会话ID */
const running = new Map<string, SessionRun>()

/** 事件序号 | 全局单调 渲染层靠它区分快照已包含与之后到达 */
let nextSeq = 0

/**
 * 开一轮:登记中断信号
 *
 * 同一会话已经在跑就直接拒绝 否则会覆盖上一条的中断信号 两个图还会跑同一个 thread_id
 * 排队入口做好后这里改成入队(见 docs/待实现/03.TODO-消息排队.md)
 */
export function startRun(conversationId: string): AbortController {
  if (running.has(conversationId)) {
    throw new Error('该对话正在生成中')
  }
  const controller = new AbortController()
  running.set(conversationId, { controller, events: [] })
  return controller
}

/** 收一轮:清掉该会话登记的信号与事件缓冲 */
export function finishRun(conversationId: string): void {
  running.delete(conversationId)
}

/** 中断一轮:该会话没有登记就什么都不做 */
export function abortRun(conversationId: string): void {
  running.get(conversationId)?.controller.abort()
}

/**
 * 给一条要发出去的事件装上推送序号
 *
 * 装好就存进本轮缓冲 再交给调用方广播 | 没有登记的会话(已经收尾)只装号不存
 */
export function recordEvent(event: AgentEvent): AgentEventEnvelope {
  const envelope: AgentEventEnvelope = { seq: ++nextSeq, event }
  const run = running.get(event.conversationId)
  if (run !== undefined) {
    run.events.push(envelope)
  }
  return envelope
}

/** 取某会话进行中那一轮的快照 | 没在跑返回 null */
export function getSnapshot(conversationId: string): StreamSnapshot | null {
  const run = running.get(conversationId)
  if (run === undefined) return null
  return { conversationId, events: [...run.events] }
}
