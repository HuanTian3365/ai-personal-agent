/**
 * agent 域的进程内运行台账
 *
 * 每会话一条记录:中断信号+本轮已发出的事件,事件是切回会话时的重放源
 * (见 docs/02-规范/04.流式快照与事件重放.md)。
 *
 * 只管台账与推送:队列在queue.ts驱动循环在drive.ts,core不知道这里存在。
 */

import type { AgentEvent, AgentEventEnvelope } from '@shared/types/agentEvent'
import type { HYEQueueItem } from '@shared/types/hyExpand'
import type { StreamSnapshot } from '@shared/types/ipcContract'
import { broadcast } from '../ipc/broadcast'

/** 一个会话正在进行中的一轮 */
interface SessionRun {
  /** 停止信号 */
  controller: AbortController
  /** 本轮已发出的事件(带推送序号) | 切回时重放给晚加入的订阅者 */
  events: AgentEventEnvelope[]
  /** 当前这一轮的id(用户消息id) | 插队要知道插进哪一轮 null=还没开跑 */
  turnId: string | null
}

/** 正在运行的对话 | key: 会话ID */
const running = new Map<string, SessionRun>()

/** 事件序号 | 全局单调 渲染层靠它区分快照已包含与之后到达 */
let nextSeq = 0

/**
 * 开一轮:登记中断信号。
 *
 * 同一会话已经在跑就返回null 调用方据此入队 不覆盖上一条的中断信号
 */
export function startRun(conversationId: string): AbortController | null {
  if (running.has(conversationId)) return null
  const controller = new AbortController()
  running.set(conversationId, { controller, events: [], turnId: null })
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

/** 该会话是否正在跑 */
export function isRunning(conversationId: string): boolean {
  return running.has(conversationId)
}

/** 开新一轮:清掉上一轮的事件缓冲 并记下这一轮的id | 快照只反映进行中的这一轮 */
export function beginTurn(conversationId: string, turnId: string): void {
  const run = running.get(conversationId)
  if (run === undefined) return
  run.events = []
  run.turnId = turnId
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

/**
 * 把排队列表推出去
 *
 * 不进本轮事件缓冲:队列不属于某一轮,切回会话时单独拉agent:queue
 */
export function emitQueue(conversationId: string, queue: HYEQueueItem[]): void {
  broadcast({ seq: ++nextSeq, event: { type: 'queue', conversationId, queue } })
}

/**
 * 插队消息立即画进当前轮(先显示)
 *
 * 这是整个流程里唯一推插入块的地方: 落库时不再推(会重复) 刷新后靠历史投影认 insertFlag
 * 本轮没领走就由 revokeInsertBlock 撤回 见 drive.ts 的收尾
 */
export function emitInsertBlock(conversationId: string, item: { id: string; text: string }): void {
  const run = running.get(conversationId)
  if (run === undefined || run.turnId === null) return
  broadcast(
    recordEvent({
      type: 'block-add',
      conversationId,
      turnId: run.turnId,
      block: {
        type: 'user',
        id: item.id,
        time: Date.now(),
        content: item.text,
        expandInfo: { insertFlag: true }
      }
    })
  )
}

/**
 * 把界面上那条提前画出来,但最终没发出去的消息块删掉(撤掉乐观显示的插队块,本轮没领走时用)
 */
export function revokeInsertBlock(conversationId: string, blockId: string): void {
  const run = running.get(conversationId)
  if (run === undefined || run.turnId === null) return
  broadcast(
    recordEvent({
      type: 'block-remove',
      conversationId,
      turnId: run.turnId,
      blockId
    })
  )
}

/** 取某会话进行中那一轮的快照,没在跑返回null */
export function getSnapshot(conversationId: string): StreamSnapshot | null {
  const run = running.get(conversationId)
  if (run === undefined) return null
  return { conversationId, events: [...run.events] }
}
