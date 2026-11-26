import { agentApi, conversationApi } from '@renderer/lib/ipc'
import { useEffect, useRef, useState } from 'react'
import type { TurnMessageBlock, TMReasoning, TurnMessage } from '@shared/types/message'
import type { MessageEventSend } from '@shared/types/message'
import type { SendMode } from '@shared/types/ipcContract'
import type { AgentEvent, AgentEventEnvelope } from '@shared/types/agentEvent'
import type { HYEQueueItemView } from '@shared/types/ipcContract'

export interface UseTurnsResult {
  /** 当前对话的历史轮 */
  turns: TurnMessage[]
  /** 对话标题 */
  title: string
  /** 第一次加载,或刚切换对话时为 true */
  isLoading: boolean
  /** 发送状态 true:发送中 false:等待输入 */
  isSending: boolean
  /** 回复状态,Agent是否在进行回复 */
  isReplying: boolean
  /** 读历史失败时的错误 */
  error: string | null
  /** 排队区内容 | 生成期间发出去还没发的那些 */
  queue: HYEQueueItemView[]
  /** 发送消息 | mode=queue 排队 mode=insert 插队 */
  send: (message: MessageEventSend, mode?: SendMode) => Promise<boolean>
  /** 中断消息 */
  abort: () => Promise<void>
  /** 把排队里的一条改成插队 */
  insert: (itemId: string) => Promise<void>
  /** 改排队项的文案 */
  editQueue: (itemId: string, text: string) => Promise<void>
  /** 删掉排队项 */
  removeQueue: (itemId: string) => Promise<void>
}

/**
 * 只负责[读历史轮]
 *
 * 发送与流式那套还没接到轮结构上，这里不做——等发送链路改造时再补。
 */
export function useTurns(conversationId: string | null): UseTurnsResult {
  /** 当前对话的历史轮 */
  const [turns, setTurns] = useState<TurnMessage[]>([])
  /** 对话标题 */
  const [title, setTitle] = useState('')
  /** 加载状态 */
  const [isLoading, setIsLoading] = useState(true)
  /** 发送状态 */
  const [isSending, setIsSending] = useState(false)
  /** 回复状态 */
  const [isReplying, setIsReplying] = useState(false)
  /** 错误信息 */
  const [error, setError] = useState<string | null>(null)
  /** 排队区内容 */
  const [queue, setQueue] = useState<HYEQueueItemView[]>([])

  /** 当前对话ID */
  const currentIdRef = useRef(conversationId)
  /** 队列的即时镜像,事件处理器要用最新值 React的state会滞后一帧 */
  const queueRef = useRef<HYEQueueItemView[]>([])
  /** 最后一条事件的全局序号|丢弃seq小于等于它的事件(已经重放完了) */
  const snapSeqRef = useRef(0)
  /** 读历史期间收到的事件,快照之后才到事件的要在快照重放完后补上 */
  const pendingRef = useRef<AgentEventEnvelope[]>([])
  /** 历史是否已就绪,没就绪时事件只攒不应用(此时turns还是空的) */
  const readyRef = useRef(false)

  /** 同时更新状态与镜像 */
  function applyQueue(next: HYEQueueItemView[]): void {
    queueRef.current = next
    setQueue(next)
  }

  /** 还在等下一个 step 边界的插队项 | 这些块要跟着输出往后挪 */
  function pendingInserts(): Set<string> {
    return new Set(
      queueRef.current
        .filter((item) => item.target === 'next-step' && item.claimed !== true)
        .map((item) => item.id)
    )
  }

  /**
   * 会话窗口监听
   *
   * 监听当前打开的会话窗口,并且拉取该会话的消息轮,且及时丢弃旧数据
   */
  useEffect(() => {
    currentIdRef.current = conversationId
    // 这次结果是否作废
    let cancelled = false
    async function load(): Promise<void> {
      // 初始化
      setTurns([])
      setTitle('')
      setError(null)
      setIsReplying(false)
      applyQueue([])
      readyRef.current = false
      pendingRef.current = []
      snapSeqRef.current = 0
      if (conversationId === null) {
        setIsLoading(false)
        return
      }
      setIsSending(false)
      setIsLoading(true)
      // 加载数据
      try {
        const [list, info, snap, queued] = await Promise.all([
          // 获取消息列表
          conversationApi.listMessages(conversationId),
          // 获取会话信息
          conversationApi.getConversation(conversationId),
          // 获取进行中那一轮的快照
          agentApi.snapshot(conversationId),
          // 获取排队区内容
          agentApi.queue(conversationId)
        ])
        if (cancelled) return

        /** 数据库已经落地的消息id,重放时跳过这些块的增量事件,防止重复消息 */
        const savedBlockIds = new Set<string>()
        // 把所有消息(除用户)的id取出来
        for (const turn of list) {
          for (const item of turn.items) savedBlockIds.add(item.id)
        }

        let next = list
        // 快照不为空,重放事件
        if (snap !== null) {
          snapSeqRef.current = snap.events.at(-1)?.seq ?? 0
          for (const envelope of snap.events) {
            next = turnEventHandler(next, envelope.event, savedBlockIds)
          }
        }

        // 补上快照之后再处理期间到达,还没来得及应用的事件
        for (const envelope of pendingRef.current) {
          if (envelope.seq > snapSeqRef.current) {
            next = turnEventHandler(next, envelope.event, savedBlockIds)
            // 队列事件不属于任何一轮 单独走 state
            if (envelope.event.type === 'queue') applyQueue(envelope.event.queue)
          }
        }
        pendingRef.current = []
        readyRef.current = true
        // 设置消息列表和会话信息
        setTurns(next)
        setTitle(info?.title ?? conversationId)
        applyQueue(queued)
        // 最后一轮还在跑 按钮才是「停止」
        setIsReplying(next.at(-1)?.status === 'running')
      } catch (err) {
        if (cancelled) return
        readyRef.current = true
        pendingRef.current = []
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  /**
   * 订阅来着core侧发送的AgentEvent消息
   */
  useEffect(() => {
    const off = agentApi.onEvent(({ seq, event }) => {
      // 忽略其他会话消息
      if (event.conversationId !== conversationId) return
      // 快照已经包含的事件直接丢,否则内容会重复追加
      if (seq <= snapSeqRef.current) return
      // 历史还没拉回来,先攒着,等重放完再补
      if (!readyRef.current) {
        pendingRef.current.push({ seq, event })
        return
      }
      // 将当前消息列表和事件消息交给事件处理器
      setTurns((prev) => turnEventHandler(prev, event, undefined, pendingInserts()))
      if (event.type === 'turn-start') setIsReplying(true)
      if (event.type === 'turn-end') setIsReplying(false)
      if (event.type === 'title') setTitle(event.title)
      // 队列不属于任何一轮,单独一份 state
      if (event.type === 'queue') applyQueue(event.queue)
    })
    return off
  }, [conversationId])

  /** 发送消息 | 受理即返回 整轮跑完靠事件推 */
  async function send(message: MessageEventSend, mode: SendMode = 'queue'): Promise<boolean> {
    // 初始化
    if (conversationId === null) return false
    setIsSending(true)
    setError(null)
    // 记录调用时的会话ID
    const targetId = conversationId

    try {
      await agentApi.send(targetId, message, mode)
      return true
    } catch {
      // 发送失败,模型会自动落一条错误消息,这里不用管
      return false
    } finally {
      setIsSending(false)
    }
  }
  /** 中断消息 */
  async function abort(): Promise<void> {
    if (conversationId === null) return
    await agentApi.abort(conversationId)
  }
  /** 把排队里的一条改成插队 */
  async function insert(itemId: string): Promise<void> {
    if (conversationId === null) return
    try {
      await agentApi.insert(conversationId, itemId)
    } catch {
      // 这条可能刚被本轮领走 队列事件会把界面纠正回来
    }
  }
  /** 改排队项的文案 */
  async function editQueue(itemId: string, text: string): Promise<void> {
    if (conversationId === null) return
    try {
      await agentApi.updateQueue(conversationId, itemId, { kind: 'edit', text })
    } catch {
      // 同上
    }
  }
  /** 删掉排队项 */
  async function removeQueue(itemId: string): Promise<void> {
    if (conversationId === null) return
    try {
      await agentApi.updateQueue(conversationId, itemId, { kind: 'remove' })
    } catch {
      // 同上
    }
  }

  return {
    turns,
    title,
    isLoading,
    isSending,
    isReplying,
    error,
    queue,
    send,
    abort,
    insert,
    editQueue,
    removeQueue
  }
}
/**
 * 事件处理器
 *
 * 实时与重放共用一份逻辑 | 重放时传 savedBlockIds 跳过已经落库的块的增量
 */
function turnEventHandler(
  /** 当前消息列表 */
  turns: TurnMessage[],
  /** 接收到的事件 */
  event: AgentEvent,
  /** 已经落库的块ID | 这些块内容已完整 增量事件不再追加 */
  savedBlockIds?: Set<string>,
  /** 还在等下一个step边界的插队块ID | 输出结束时要把它们挪到这次输出之后 */
  pendingInserts?: Set<string>
): TurnMessage[] {
  console.log('[TurnEvent]:', event)
  switch (event.type) {
    case 'turn-start': {
      // 事件给出的轮是否在本地
      const at = turns.findIndex((turn) => turn.id === event.turn.id)
      // 首次见到:直接追加
      if (at === -1) return [...turns, event.turn]
      // 已经存在(历史里已拉回来|快照重复投递),只把它标成正在跑,别动已有的items
      return turns.map((turn, index) => (index === at ? { ...turn, status: 'running' } : turn))
    }
    case 'turn-end':
      return patchTurn(turns, event.turnId, (turn) => ({
        ...turn,
        status: event.status,
        usage: event.usage ?? turn.usage,
        endTime: event.endTime ?? Date.now(),
        // 思考块兜一层 | 思考与正文交错时end事件可能没发出 不能让界面一直转圈
        // 工具块不在这里收尾:没等到结果就保持running 由工具块按轮状态显示未完成
        items: turn.items.map((block) => {
          if (block.type === 'reasoning' && block.status === 'running') {
            return { ...block, status: 'done' }
          }
          if (block.type === 'assistant' && block.reasoning?.status === 'running') {
            return { ...block, reasoning: { ...block.reasoning, status: 'done' } }
          }
          return block
        })
      }))

    case 'block-add':
      // 已经落库的块重放时别再塞一个
      if (savedBlockIds?.has(event.block.id) === true) return turns
      return patchTurn(turns, event.turnId, (turn) =>
        // 同id的块已经在列表里了就不再加一个
        turn.items.some((block) => block.id === event.block.id)
          ? turn
          : { ...turn, items: [...turn.items, event.block] }
      )

    case 'block-remove':
      return patchTurn(turns, event.turnId, (turn) => ({
        ...turn,
        items: turn.items.filter((block) => block.id !== event.blockId)
      }))

    case 'reasoning-start':
      return patchTurn(turns, event.turnId, (turn) => {
        const at = turn.items.findIndex((block) => block.id === event.blockId)
        const hit = at === -1 ? undefined : turn.items[at]
        // 这条消息还没有任何块 正常开一个独立思考块
        if (hit === undefined) {
          return {
            ...turn,
            items: [
              ...turn.items,
              { type: 'reasoning', id: event.blockId, content: '', status: 'running' }
            ]
          }
        }
        // 思考已经并进助手块 重新打开它的reasoning 内容留着继续往后写
        if (hit.type === 'assistant') {
          const reasoning: TMReasoning = hit.reasoning ?? {
            type: 'reasoning',
            id: event.blockId,
            content: '',
            status: 'running'
          }
          return {
            ...turn,
            items: turn.items.map((block, index) =>
              index === at ? { ...hit, reasoning: { ...reasoning, status: 'running' } } : block
            )
          }
        }
        // 还是独立思考块 重新打开
        if (hit.type === 'reasoning') {
          return {
            ...turn,
            items: turn.items.map((block, index) =>
              index === at ? { ...hit, status: 'running' } : block
            )
          }
        }
        return turn
      })

    case 'reasoning-delta':
      // 已经落库的块内容已完整 重放时不再追加
      if (savedBlockIds?.has(event.blockId) === true) return turns
      return patchBlock(turns, event.turnId, event.blockId, (block) => {
        if (block.type === 'reasoning') return { ...block, content: block.content + event.text }
        // 已并进助手块 追加到它的reasoning上
        if (block.type === 'assistant' && block.reasoning !== undefined) {
          return {
            ...block,
            reasoning: { ...block.reasoning, content: block.reasoning.content + event.text }
          }
        }
        return block
      })

    case 'reasoning-end':
      return patchBlock(turns, event.turnId, event.blockId, (block) => {
        if (block.type === 'reasoning') return { ...block, status: 'done' }
        if (block.type === 'assistant' && block.reasoning !== undefined) {
          return { ...block, reasoning: { ...block.reasoning, status: 'done' } }
        }
        return block
      })

    case 'assistant-start':
      return patchTurn(turns, event.turnId, (turn) => {
        // 本轮回复的消息里是否已经存在这个块
        const at = turn.items.findIndex((b) => b.id === event.blockId)
        const hit = at === -1 ? undefined : turn.items[at]
        // 这条消息的正文块已经建过了
        if (hit?.type === 'assistant') return turn
        if (hit?.type === 'reasoning') {
          const items = turn.items.filter((_, i) => i !== at)
          return {
            ...turn,
            items: [...items, { type: 'assistant', id: event.blockId, content: '', reasoning: hit }]
          }
        }
        return {
          ...turn,
          items: [...turn.items, { type: 'assistant', id: event.blockId, content: '' }]
        }
      })

    case 'assistant-delta':
      // 已经落库的块内容已完整 重放时不再追加
      if (savedBlockIds?.has(event.blockId) === true) return turns
      return patchBlock(turns, event.turnId, event.blockId, (block) =>
        block.type === 'assistant' ? { ...block, content: block.content + event.text } : block
      )

    case 'assistant-end': {
      /**
       * 这次输出结束: 还没被领走的插队块挪到它后面。
       *
       * 插队块是「下一次模型调用的输入」 点的那一刻它被塞在当时的末尾
       * 但那次调用还没开始 所以它会先排在这段输出前面。这里把它挪到最后 位置就对了
       * 已经被领走(claimed)的不动: 它正是这段输出的输入 就该在前面
       */
      const pending = pendingInserts
      if (pending === undefined || pending.size === 0) return turns
      return patchTurn(turns, event.turnId, (turn) => {
        const moving = turn.items.filter((block) => pending.has(block.id))
        if (moving.length === 0) return turn
        return {
          ...turn,
          items: [...turn.items.filter((block) => !pending.has(block.id)), ...moving]
        }
      })
    }

    case 'tool-start':
      return patchTurn(turns, event.turnId, (turn) => {
        const at = turn.items.findIndex((b) => b.id === event.blockId)
        const hit = at === -1 ? undefined : turn.items[at]
        /**
         * 这个工具块已经在列表里了(历史投影会先给出一个)
         * 此时把状态改回运行中就行 不能再追加一个
         * 历史侧没有等到ToolMessage会把工具兜底成error 但事件说它还在跑
         */
        if (hit?.type === 'tool') {
          return {
            ...turn,
            items: turn.items.map((block, index) =>
              index === at ? { ...hit, status: 'running' } : block
            )
          }
        }
        return {
          ...turn,
          items: [
            ...turn.items,
            {
              type: 'tool',
              id: event.blockId,
              name: event.name,
              args: null,
              result: null,
              status: 'running'
            }
          ]
        }
      })

    case 'tool-args':
      return patchBlock(turns, event.turnId, event.blockId, (block) =>
        block.type === 'tool' ? { ...block, args: event.args } : block
      )

    case 'tool-end':
      return patchBlock(turns, event.turnId, event.blockId, (block) =>
        block.type === 'tool' ? { ...block, status: event.status, result: event.result } : block
      )

    default:
      return turns
  }
}

/**
 * 按轮ID改一轮
 *
 * 命中那一轮才执行fn 其余原样返回 | 未命中直接返回原数组 引用不变
 * 同引用setState会被React跳过 所以事件乱序或历史还没拉回来时不会白跑一次渲染
 */
function patchTurn(
  turns: TurnMessage[],
  turnId: string,
  fn: (turn: TurnMessage) => TurnMessage
): TurnMessage[] {
  const at = turns.findIndex((turn) => turn.id === turnId)
  if (at === -1) return turns
  return turns.map((turn, index) => (index === at ? fn(turn) : turn))
}

/**
 * 按「轮ID + 块ID」改一块
 *
 * patchTurn再套一层:进到轮里按块ID找 items命中才执行fn
 * fn内要按block.type守卫 类型不符就原样返回 避免往别的块上塞字段
 * 注意:块未命中时这一轮仍会被重建(引用变 内容不变) 只多一次无意义的渲染
 */
function patchBlock(
  turns: TurnMessage[],
  turnId: string,
  blockId: string,
  fn: (block: TurnMessageBlock) => TurnMessageBlock
): TurnMessage[] {
  return patchTurn(turns, turnId, (turn) => ({
    ...turn,
    items: turn.items.map((block) => (block.id === blockId ? fn(block) : block))
  }))
}
