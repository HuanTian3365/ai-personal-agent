/**
 * 会话消息队列。
 *
 * 生成期间用户再次发送时先落在这里：next-turn 等本轮结束作为新一轮发出
 * next-step 在下一个 step 边界推进当前轮(界面上的插队)。
 *
 * 只做队列本身。内存是唯一真相 每次变更写回 hy_conversation.expand 的 sendMessage 层。
 * 不推事件、不知道 core 存在、不知道驱动怎么跑。
 * 首次访问某会话时从库懒加载 之后只走内存。
 */

import { randomUUID } from 'node:crypto'
import type { QueueItem } from '@shared/types/agentEvent'
import { getDatabase, getRepository } from '../database'

/** 队列所属职责 | expand 第一层 key */
const SCOPE = 'sendMessage'

/** 每会话一条队列 | key: 会话ID */
const queues = new Map<string, QueueItem[]>()

/** 解析 expand JSON | 失败或不是对象一律当空 */
function parseExpand(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * 从库读该会话的队列。
 *
 * 过滤掉已经落进 hy_message 的项：队列项的 id 就是最终的消息 id
 * 崩在「已落库、还没从队列删掉」之间时 恢复出来不能重复。
 */
function load(conversationId: string): QueueItem[] {
  const row = getDatabase()
    .prepare('SELECT expand FROM hy_conversation WHERE id = ?')
    .get(conversationId) as { expand: string } | undefined
  if (row === undefined) return []
  const layer = parseExpand(row.expand)[SCOPE]
  if (layer === null || typeof layer !== 'object' || Array.isArray(layer)) return []
  const raw = (layer as { queue?: unknown }).queue
  if (!Array.isArray(raw)) return []
  const saved = getDatabase().prepare('SELECT 1 FROM hy_message WHERE id = ?')
  return raw.filter((item): item is QueueItem => {
    if (item === null || typeof item !== 'object') return false
    const { id, text, target } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof text !== 'string') return false
    if (target !== 'next-turn' && target !== 'next-step') return false
    // 已经落库的说明这一条发过了
    return saved.get(id) === undefined
  })
}

/** 取某会话的队列 | 首次访问从库加载 */
export function listQueue(conversationId: string): QueueItem[] {
  const cached = queues.get(conversationId)
  if (cached !== undefined) return cached
  const loaded = load(conversationId)
  queues.set(conversationId, loaded)
  return loaded
}

/** 改内存 | 不落库 */
function write(conversationId: string, queue: QueueItem[]): void {
  queues.set(conversationId, queue)
}

/** 把内存里的队列写回库 | 内存已经改好 这里只做持久化 */
function persist(conversationId: string): Promise<void> {
  const queue = queues.get(conversationId) ?? []
  return getRepository().updateExpand(conversationId, SCOPE, { queue })
}

/** 入队 | 返回写入后的整条队列 */
export async function pushQueue(
  conversationId: string,
  text: string,
  target: QueueItem['target']
): Promise<QueueItem[]> {
  const queue = [...listQueue(conversationId), { id: randomUUID(), text, target }]
  write(conversationId, queue)
  await persist(conversationId)
  return queue
}

/** 删一条 | 返回是否删掉了 */
export async function removeQueueItem(conversationId: string, itemId: string): Promise<boolean> {
  const queue = listQueue(conversationId)
  if (!queue.some((item) => item.id === itemId)) return false
  write(
    conversationId,
    queue.filter((item) => item.id !== itemId)
  )
  await persist(conversationId)
  return true
}

/** 改一条的文案 | 空文案不落 返回是否改成功了 */
export async function editQueueItem(
  conversationId: string,
  itemId: string,
  text: string
): Promise<boolean> {
  const trimmed = text.trim()
  if (trimmed === '') return false
  const queue = listQueue(conversationId)
  if (!queue.some((item) => item.id === itemId)) return false
  write(
    conversationId,
    queue.map((item) => (item.id === itemId ? { ...item, text: trimmed } : item))
  )
  await persist(conversationId)
  return true
}

/** 把一条改成插队 | 已经是插队算成功(幂等) 找不到返回 false */
export async function markInsert(conversationId: string, itemId: string): Promise<boolean> {
  const queue = listQueue(conversationId)
  const hit = queue.find((item) => item.id === itemId)
  if (hit === undefined) return false
  // 已经是插队了: 重复点击不该报错 界面靠 block-add 去重
  if (hit.target === 'next-step') return true
  write(
    conversationId,
    queue.map((item) => (item.id === itemId ? { ...item, target: 'next-step' } : item))
  )
  await persist(conversationId)
  return true
}

/** 取队头的一条排队消息 | 没有返回 null */
export function claimNextTurn(conversationId: string): QueueItem | null {
  const queue = listQueue(conversationId)
  const at = queue.findIndex((item) => item.target === 'next-turn')
  const hit = at === -1 ? undefined : queue[at]
  if (hit === undefined) return null
  write(
    conversationId,
    queue.filter((_, index) => index !== at)
  )
  // 这一条马上就要发出去 落库慢一步也有 id 去重兜底 不等它
  void persist(conversationId)
  return hit
}

/**
 * 领取待插入 | 只打标记不删。
 *
 * 不删是为了「本轮失败能把它们放回」；条件边看的是「有没有未领取的」
 * 所以打完标记本轮就不会再因为同一条继续续轮 见 core/graph/nodes.ts
 */
export function claimInserts(conversationId: string): QueueItem[] {
  const queue = listQueue(conversationId)
  const pending = queue.filter((item) => item.target === 'next-step' && item.claimed !== true)
  if (pending.length === 0) return []
  const ids = new Set(pending.map((item) => item.id))
  write(
    conversationId,
    queue.map((item) => (ids.has(item.id) ? { ...item, claimed: true } : item))
  )
  void persist(conversationId)
  return pending
}

/** 有没有还没被领取的插入 | 条件边用它决定本轮要不要继续 */
export function hasUnclaimedInserts(conversationId: string): boolean {
  return listQueue(conversationId).some(
    (item) => item.target === 'next-step' && item.claimed !== true
  )
}

/**
 * 本轮失败或中断 把领取标记去掉 让它们回到待领取 | 返回被退回的那些
 *
 * 同时把 target 改回 next-turn: 这一轮没领走 说明它没插进去 下次当普通排队发
 */
export function releaseInserts(conversationId: string): QueueItem[] {
  const queue = listQueue(conversationId)
  const released = queue.filter((item) => item.claimed === true)
  if (released.length === 0) return []
  write(
    conversationId,
    queue.map((item) =>
      item.claimed === true ? { ...item, claimed: false, target: 'next-turn' } : item
    )
  )
  void persist(conversationId)
  return released
}

/**
 * 本轮正常结束 把没被领走的插队退回排队 | 返回被退回的那些
 *
 * 走到这里说明这一轮没有下一个 step 边界 插队项等不到了 退回排队才不会丢
 */
export function revertInserts(conversationId: string): QueueItem[] {
  const queue = listQueue(conversationId)
  const pending = queue.filter((item) => item.target === 'next-step')
  if (pending.length === 0) return []
  write(
    conversationId,
    queue.map((item) =>
      item.target === 'next-step' ? { ...item, target: 'next-turn', claimed: false } : item
    )
  )
  void persist(conversationId)
  return pending
}

/** 本轮成功 删掉已经领取的插入项 */
export function dropClaimed(conversationId: string): void {
  const queue = listQueue(conversationId)
  if (!queue.some((item) => item.claimed === true)) return
  write(
    conversationId,
    queue.filter((item) => item.claimed !== true)
  )
  void persist(conversationId)
}
