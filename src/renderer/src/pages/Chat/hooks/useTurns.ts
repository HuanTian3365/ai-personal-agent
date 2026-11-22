import { agentApi, conversationApi } from '@renderer/lib/ipc'
import { useEffect, useRef, useState } from 'react'
import type { ContentBlock, TurnMessage } from '@shared/types/newMessages'
import { MessageEventSend } from '@shared/types/newMessageService'
import { AgentEvent } from '@shared/types/newEvent'

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
  /** 发送消息 */
  send: (message: MessageEventSend) => Promise<boolean>
  /** 中断消息 */
  abort: () => Promise<void>
}

/**
 * 只负责「读历史轮」。
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
  /** 当前对话ID */
  const currentIdRef = useRef(conversationId)

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
      if (conversationId === null) {
        setIsLoading(false)
        return
      }
      setIsSending(false)
      setIsLoading(true)
      // 加载数据
      try {
        const [list, info] = await Promise.all([
          // 获取消息列表
          conversationApi.listMessages(conversationId),
          // 获取会话信息
          conversationApi.getConversation(conversationId)
        ])
        if (cancelled) return
        // 设置消息列表和会话信息
        setTurns(list)
        setTitle(info?.title ?? conversationId)
      } catch (err) {
        if (cancelled) return
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
    const off = agentApi.onEvent((event) => {
      // 忽略其他会话消息
      if (event.conversationId !== conversationId) return
      // 将当前消息列表和事件消息交给事件处理器
      setTurns((prev) => turnEventHandler(prev, event))
      if (event.type === 'turn-start') setIsReplying(true)
      if (event.type === 'turn-end') setIsReplying(false)
    })
    return off
  }, [conversationId])

  /** 发送消息 */
  async function send(message: MessageEventSend): Promise<boolean> {
    // 初始化
    if (conversationId === null) return false
    setIsSending(true)
    setError(null)
    // 记录调用时的会话ID
    const targetId = conversationId

    try {
      // 等模型全部说完才返回
      await agentApi.send(targetId, message)
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

  return { turns, title, isLoading, isSending, isReplying, error, send, abort }
}
/**
 * 事件处理器
 *
 * TODO: title事件
 */
function turnEventHandler(
  /** 当前消息列表 */
  turns: TurnMessage[],
  /** 接收到的事件 */
  event: AgentEvent
): TurnMessage[] {
  console.log('[TurnEvent]:', event)
  switch (event.type) {
    case 'turn-start': {
      const at = turns.findIndex((turn) => turn.id === event.turn.id)
      // 首次见到：直接追加（新的一轮）
      if (at === -1) return [...turns, event.turn]
      // 已经存在（历史里已拉回来 / 快照重复投递）：只把它标成正在跑，别动已有的 items
      return turns.map((turn, index) => (index === at ? { ...turn, status: 'running' } : turn))
    }
    case 'turn-end':
      return patchTurn(turns, event.turnId, (turn) => ({
        ...turn,
        status: event.status,
        usage: event.usage ?? turn.usage,
        endTime: event.endTime ?? Date.now()
      }))

    case 'block-add':
      return patchTurn(turns, event.turnId, (turn) => ({
        ...turn,
        items: [...turn.items, event.block]
      }))

    case 'reasoning-start':
      return patchTurn(turns, event.turnId, (turn) => ({
        ...turn,
        items: [
          ...turn.items,
          { type: 'reasoning', id: event.blockId, content: '', status: 'running' }
        ]
      }))

    case 'reasoning-delta':
      return patchBlock(turns, event.turnId, event.blockId, (block) =>
        block.type === 'reasoning' ? { ...block, content: block.content + event.text } : block
      )

    case 'reasoning-end':
      return patchBlock(turns, event.turnId, event.blockId, (block) =>
        block.type === 'reasoning' ? { ...block, status: 'done' } : block
      )

    case 'assistant-start':
      return patchTurn(turns, event.turnId, (turn) => {
        // 同一 blockId 的思考块并进助手块
        const at = turn.items.findIndex((b) => b.id === event.blockId)
        const hit = at === -1 ? undefined : turn.items[at]
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
      return patchBlock(turns, event.turnId, event.blockId, (block) =>
        block.type === 'assistant' ? { ...block, content: block.content + event.text } : block
      )

    case 'assistant-end':
      // MAssistant 没有状态字段，这里只把用量记到轮上
      return patchTurn(turns, event.turnId, (turn) => ({
        ...turn,
        usage: event.usage ?? turn.usage
      }))

    case 'tool-start':
      return patchTurn(turns, event.turnId, (turn) => ({
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
      }))

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

function patchTurn(
  turns: TurnMessage[],
  turnId: string,
  fn: (turn: TurnMessage) => TurnMessage
): TurnMessage[] {
  const at = turns.findIndex((turn) => turn.id === turnId)
  if (at === -1) return turns
  return turns.map((turn, index) => (index === at ? fn(turn) : turn))
}

function patchBlock(
  turns: TurnMessage[],
  turnId: string,
  blockId: string,
  fn: (block: ContentBlock) => ContentBlock
): TurnMessage[] {
  return patchTurn(turns, turnId, (turn) => ({
    ...turn,
    items: turn.items.map((block) => (block.id === blockId ? fn(block) : block))
  }))
}
