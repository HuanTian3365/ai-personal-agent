/**
 * 会话消息队列
 *
 * 生成期间用户再次发送时先落在这里
 * next-turn:等本轮结束作为新一轮发出
 * next-step:在下一个step边界推进当前轮(界面上的插队)。
 *
 * 只做队列本身,内存是唯一真相,每次变更写回hy_conversation.expand的sendMessage层。
 * 不推事件,不知道core存在,不知道驱动怎么跑
 * 首次访问某会话时从库懒加载,之后只走内存
 */

import { randomUUID } from 'node:crypto'
import type { HYEQueueItemView } from '@shared/types/hyExpand'
import { getDatabase, getRepository } from '../database'

/** 每会话一条队列 | key: 会话ID */
const queues = new Map<string, HYEQueueItemView[]>()

const SCOPE = 'sendMessage'

/**
 * 从获取目标会话的队列信息
 *
 * 过滤掉已经落到消息表的数据
 */
function load(conversationId: string): HYEQueueItemView[] {
  // 获取会话扩展字段
  const expand = getRepository().readExpand(conversationId)
  // 获取队列列表
  const queue = expand.sendMessage?.queue ?? []
  if (!Array.isArray(queue)) return []
  // sql,获取对应id的消息
  const saved = getDatabase().prepare('SELECT 1 FROM hy_message WHERE id = ?')
  return (
    queue
      .filter((item) => {
        // 过滤掉不是队列消息的数据
        if (item === null || typeof item !== 'object') return false
        const { id, text, target } = item
        if (typeof id !== 'string' || typeof text !== 'string') return false
        if (target !== 'next-turn' && target !== 'next-step') return false
        // 查一下这条id在消息表里有没有,没有就留在队列里(还没发出去),有就扔掉(已经发过了)
        return saved.get(id) === undefined
      })
      // 逐字段重建: 库里不该有claimed 旧数据带进来也丢掉 重启后一律当没领走
      .map(({ id, text, target }) => ({ id, text, target, claimed: false }))
  )
}

/** 取某会话的队列,首次访问从库加载 */
export function listQueue(conversationId: string): HYEQueueItemView[] {
  const cached = queues.get(conversationId)
  if (cached !== undefined) return cached
  const loaded = load(conversationId)
  queues.set(conversationId, loaded)
  return loaded
}

/** 更新队列 */
function write(conversationId: string, queue: HYEQueueItemView[]): void {
  queues.set(conversationId, queue)
}

/** 把内存里的队列写回库 */
function persist(conversationId: string): Promise<void> {
  const queue = queues.get(conversationId) ?? []
  // 只写库里有的三个字段 | claimed是运行态 落库后没人回滚 重启就成幽灵项
  const stored = queue.map(({ id, text, target }) => ({ id, text, target }))
  return getRepository().updateExpand(conversationId, SCOPE, { queue: stored })
}

/** 新增队列消息,返回写入后的整条队列 */
export async function pushQueue(
  conversationId: string,
  text: string,
  target: HYEQueueItemView['target']
): Promise<HYEQueueItemView[]> {
  const queue = [...listQueue(conversationId), { id: randomUUID(), text, target }]
  write(conversationId, queue)
  await persist(conversationId)
  return queue
}

/** 删除指定队列信息,返回是否删掉了 */
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

/** 改一条的文案,空文案不落,返回是否改成功了 */
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

/** 把一条改成插队,已经是插队算成功(幂等),找不到返回 false */
export async function markInsert(conversationId: string, itemId: string): Promise<boolean> {
  const queue = listQueue(conversationId)
  const hit = queue.find((item) => item.id === itemId)
  if (hit === undefined) return false
  // 已经是插队了:重复点击不该报错,界面靠block-add去重
  if (hit.target === 'next-step') return true
  write(
    conversationId,
    queue.map((item) => (item.id === itemId ? { ...item, target: 'next-step' } : item))
  )
  await persist(conversationId)
  return true
}

/** 从队列里拿走第一条排队消息,没有返回null */
export function claimNextTurn(conversationId: string): HYEQueueItemView | null {
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

/** 获取所有插入的没有被领的消息,并且标记为已领取 */
export function claimInserts(conversationId: string): HYEQueueItemView[] {
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

/** 有没有还没被领取的插入消息,条件边用它决定本轮要不要继续 */
export function hasUnclaimedInserts(conversationId: string): boolean {
  return listQueue(conversationId).some(
    (item) => item.target === 'next-step' && item.claimed !== true
  )
}

/**
 * 本轮失败或中断,把领取标记去掉,让它们回到待领取,返回被退回的那些
 *
 * 同时把target改回next-turn:这一轮没领走,说明它没插进去,下次当普通排队发
 */
export function releaseInserts(conversationId: string): HYEQueueItemView[] {
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
 * 本轮正常结束,把没被领走的插队退回排队,返回被退回的那些
 *
 * 走到这里说明这一轮没有下一个step边界,插队项等不到了.退回排队才不会丢
 */
export function revertInserts(conversationId: string): HYEQueueItemView[] {
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

/** 本轮成功,删掉已经领取的插入项 */
export function dropClaimed(conversationId: string): void {
  const queue = listQueue(conversationId)
  if (!queue.some((item) => item.claimed === true)) return
  write(
    conversationId,
    queue.filter((item) => item.claimed !== true)
  )
  void persist(conversationId)
}
