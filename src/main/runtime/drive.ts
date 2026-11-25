/**
 * 一轮接一轮的驱动循环。
 *
 * 每轮从队头领一条 next-turn 当发起消息 队列空就退出 用户中断也退出(队列留着等手动发)。
 * 只做编排: 队列归 queue.ts 台账与推送归 run.ts 一轮里干什么归 core。
 */

import { sendMessage, setInsertSource } from '@core/export'
import type { AgentEvent } from '@shared/types/agentEvent'
import type { MessageEventSend, SendMode, SendResult } from '@shared/types/messageService'
import { broadcast } from '../ipc/broadcast'
import {
  claimInserts,
  claimNextTurn,
  dropClaimed,
  hasUnclaimedInserts,
  listQueue,
  pushQueue,
  releaseInserts,
  revertInserts
} from './queue'
import {
  beginTurn,
  emitInsertBlock,
  emitQueue,
  finishRun,
  isRunning,
  recordEvent,
  revokeInsertBlock,
  startRun
} from './run'

/**
 * 提交一条消息。
 *
 * 会话空闲 -> 入队并起驱动(队列里若有上次中断留下的 会先发它们 先进先出)
 * 会话在跑 + insert -> 入队 next-step 并立即画进当前轮
 * 会话在跑 + queue -> 入队 next-turn 等本轮结束
 */
export async function submitMessage(props: {
  conversationId: string
  message: MessageEventSend
  mode: SendMode
}): Promise<SendResult> {
  const { conversationId, message, mode } = props
  const text = message.content ?? ''

  // 生成中
  if (isRunning(conversationId)) {
    if (mode === 'insert') {
      const queue = await pushQueue(conversationId, text, 'next-step')
      const item = queue.at(-1)
      if (item !== undefined) emitInsertBlock(conversationId, item)
      emitQueue(conversationId, queue)
      return { status: 'sent' }
    }
    const queue = await pushQueue(conversationId, text, 'next-turn')
    emitQueue(conversationId, queue)
    return { status: 'queued', queue }
  }

  // 空闲:新消息也走队列 让上次中断留下的旧消息天然排在新消息前面
  const pendingBefore = listQueue(conversationId).length
  const queue = await pushQueue(conversationId, text, 'next-turn')
  // 只有队列里本来就有东西(上次中断留下的)才推给界面
  // 否则这一条马上会被驱动领走 推出去只会在排队区闪一下
  if (pendingBefore > 0) emitQueue(conversationId, queue)
  const controller = startRun(conversationId)
  if (controller === null) return { status: 'queued', queue }
  void drive(conversationId, controller)
  return { status: 'sent' }
}

/**
 * 驱动循环。
 *
 * 每轮领一条 next-turn 跑一轮 跑完再领 领不到就退出
 */
async function drive(conversationId: string, controller: AbortController): Promise<void> {
  const emit = (event: AgentEvent): void => {
    broadcast(recordEvent(event))
  }
  try {
    while (true) {
      const next = claimNextTurn(conversationId)
      if (next === null) break
      emitQueue(conversationId, listQueue(conversationId))
      beginTurn(conversationId, next.id)
      // 把待插入的来源交给core 每个step开头来取
      const unregister = setInsertSource(conversationId, {
        take: () => claimInserts(conversationId).map((item) => ({ id: item.id, text: item.text })),
        release: () => {
          for (const item of releaseInserts(conversationId)) {
            revokeInsertBlock(conversationId, item.id)
          }
        },
        hasUnclaimed: () => hasUnclaimedInserts(conversationId)
      })
      try {
        await sendMessage({
          conversationId,
          message: { content: next.text },
          messageId: next.id,
          emit,
          signal: controller.signal
        })
        if (controller.signal.aborted) {
          // 中断: 这一轮没用完的插队项还回去
          for (const item of releaseInserts(conversationId)) {
            revokeInsertBlock(conversationId, item.id)
          }
        } else {
          // 正常跑完: 领过的删掉 没领走的退回排队并撤回界面上那块
          dropClaimed(conversationId)
          for (const item of revertInserts(conversationId)) {
            revokeInsertBlock(conversationId, item.id)
          }
        }
      } catch {
        // 这一轮失败: 把领走的插队项放回 消息不丢
        for (const item of releaseInserts(conversationId)) {
          revokeInsertBlock(conversationId, item.id)
        }
      } finally {
        unregister()
      }
      emitQueue(conversationId, listQueue(conversationId))
      // 用户中断就不接着发下一条
      if (controller.signal.aborted) break
    }
  } finally {
    finishRun(conversationId)
    emitQueue(conversationId, listQueue(conversationId))
  }
}
