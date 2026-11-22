import { conversationApi, agentApi } from '@renderer/lib/ipc'
import { startTransition, useEffect, useRef, useState } from 'react'
import type { ContentBlock, MessageView } from '@shared/types/messages'
import type { ActiveStream, AgentEvent, QueueItem } from '@shared/types/agents'

/** 占位气泡的临时 id 前缀：既当 React 的列表 key，也用来认出「这条还没落库」；落库后会被真身的 id 顶掉 */
const PENDING_PREFIX = 'pending:'

/**
 * 造一张新占位气泡的 id。
 *
 * 一轮里被「插入」切过段之后会有好几段回复，一段一张占位气泡，
 * 所以不能再用一个固定 id 认人——只靠前缀区分「还没落库」，靠位置区分是哪一段。
 */
function makePendingId(): string {
  return `${PENDING_PREFIX}${crypto.randomUUID()}`
}

/** 这条是不是还没落库的占位气泡 */
function isPending(message: MessageView): boolean {
  return message.id.startsWith(PENDING_PREFIX)
}

/** 最后一张占位气泡的下标：流式增量永远落在它上面 */
function lastPendingAt(messages: MessageView[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isPending(messages[i])) return i
  }
  return -1
}

export interface UseChatResult {
  /** 当前对话的标题 */
  title: string
  /** 当前对话的消息，按顺序排好 */
  messages: MessageView[]
  /** 排队中、等本轮结束再发的消息 */
  queue: QueueItem[]
  /** 第一次加载、或者刚切换对话时为 true */
  isLoading: boolean
  /** 发生状态 true:发送中 false:等待输入 */
  isSending: boolean
  /** 回复状态:assistant-start开始,assistant-end结束 */
  isReplying: boolean
  /** 错误信息 */
  error: string | null
  /** 发一条消息。回复不从这里返回，而是通过事件一条条推过来 */
  send: (text: string) => Promise<boolean>
  /** 停止当前对话的生成 */
  abort: () => Promise<void>
  /** 把排队里的一条插入当前轮 */
  insert: (itemId: string) => Promise<void>
}

/** 一个对话的全部状态：消息列表、排队、发送中、错误、发送、停止、插入 */
export function useChat(conversationId: string | null): UseChatResult {
  const [title, setTitle] = useState('')
  const [messages, setMessages] = useState<MessageView[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 当前对话,异步操作后判断用户是否切对话 */
  const currentIdRef = useRef(conversationId)

  // 监听会话ID变动
  useEffect(() => {
    currentIdRef.current = conversationId
  }, [conversationId])

  // 切换对话时重新加载
  useEffect(() => {
    let cancelled = false
    // 加载历史消息记录
    async function load(): Promise<void> {
      setMessages([])
      setQueue([])
      setIsSending(false)
      setIsReplying(false)

      if (conversationId == null) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const [res, snap, queued] = await Promise.all([
          // 备份文件：主链路已切到 TurnMessage，这里强转回旧形状，只为让这份备份能编译
          conversationApi.listMessages(conversationId) as unknown as Promise<MessageView[]>,
          agentApi.snapshot(conversationId),
          agentApi.queue(conversationId)
        ])
        console.log('[对话列表]:', res)
        if (cancelled) return
        setMessages(snap === null ? res : applySnapshot(res, snap))
        setQueue(queued)
        // 后端还在跑 → 按钮显示「停止」而不是「发送」
        setIsSending(snap !== null)
        // 有快照说明这一轮还没结束，加载提示照旧挂着
        setIsReplying(snap !== null)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    async function loadTitle(): Promise<void> {
      if (conversationId == null) return
      const res = await conversationApi.getConversation(conversationId)
      if (res == null) return
      setTitle(res.title)
    }
    void loadTitle()
    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  // 订阅Agent输出
  useEffect(() => {
    const off = agentApi.onEvent((event) => {
      // 别的对话发来的事件直接忽略（另一个对话可能还在生成）
      if (event.conversationId !== conversationId) return
      // 排队内容不进消息列表，单独维护
      if (event.type === 'queue') {
        setQueue(event.queue)
        return
      }
      // 流式增量是高频更新，降成 transition
      if (event.type === 'assistant-delta') {
        startTransition(() => setMessages((prev) => applyAgentEvent(prev, event)))
      } else {
        setMessages((prev) => applyAgentEvent(prev, event))
      }
      switch (event.type) {
        // user-message 说明 main 已经受理了这条，之后才轮到她在回，加载提示从这时开始挂
        case 'user-message':
        case 'assistant-start':
          setIsReplying(true)
          break
        case 'assistant-end':
          setIsSending(false)
          setIsReplying(false)
          break
        default:
          break
      }
    })

    // 返回的函数会在组件卸载时调用，用来取消订阅
    return off
  }, [conversationId])

  // 发送消息
  async function send(text: string): Promise<boolean> {
    if (conversationId === null) return false
    const targetId = conversationId

    setIsSending(true)
    setError(null)

    /** 这一轮是不是真的跑完了：排队返回时本轮还在生成，不能收掉发送态 */
    let finished = false

    try {
      // 等模型全部说完才返回；正在生成时返回 queued，这条已经进排队
      const result = await agentApi.send(targetId, text)
      finished = result.status === 'sent'
      if (result.status === 'queued') setQueue(result.queue)
      return true
    } catch (err) {
      // 走到这里的都是「没发出去」。模型报错时 loop 会先落一条 error 消息，
      // 气泡里已经看得到，这里再补一条顶部提示是为了 main 侧拒绝的情况
      if (currentIdRef.current === targetId) {
        setError(err instanceof Error ? err.message : String(err))
      }
      return false
    } finally {
      // 用户已经切走了，别去改新对话的状态
      if (finished && currentIdRef.current === targetId) {
        setIsSending(false)
        // 兜底：这一轮无论怎么结束（正常、报错、中断），await 一返回就说明没人再往外推东西了
        setIsReplying(false)
      }
    }
  }

  // 中断对话
  async function abort(): Promise<void> {
    if (conversationId === null) return
    await agentApi.abort(conversationId)
    // 这里不关发送状态，等真正停下来再关（见 send 的 finally）
  }

  // 把排队里的一条插入当前轮
  async function insert(itemId: string): Promise<void> {
    if (conversationId === null) return
    await agentApi.insert(conversationId, itemId)
  }

  return {
    title,
    messages,
    queue,
    isLoading,
    isSending,
    isReplying,
    error,
    send,
    abort,
    insert
  }
}

/**
 * 把增量文本拼到已有 content 上。
 * 单独写一个函数而不是内联断言，是因为 content 可能是空数组，
 * 直接 (content[0] as {text:string}).text 在空数组上会抛错。
 */
function appendDelta(content: MessageView['content'], delta: string): MessageView['content'] {
  const last = content[content.length - 1]
  if (last !== undefined && last.type === 'text') {
    return [...content.slice(0, -1), { type: 'text', text: last.text + delta }]
  }
  return [...content, { type: 'text', text: delta }]
}

/**
 * 把思考增量拼到最前面的 reasoning 块上。
 *
 * 思考永远排在正文上面，和历史投影（mappingMessage 里 reasoning 是 unshift 到最前）一致，
 * 所以这里不往后追加，而是针对第一块合并。
 */
function appendReasoning(content: MessageView['content'], delta: string): MessageView['content'] {
  const first = content[0]
  if (first !== undefined && first.type === 'reasoning') {
    return [{ type: 'reasoning', text: first.text + delta }, ...content.slice(1)]
  }
  return [{ type: 'reasoning', text: delta }, ...content]
}

/**
 * 把一条 agent 事件应用到消息数组上，返回新数组。
 *
 * 纯函数：不读 state、不调 setState，可以脱离 React 单独验证。
 * 所有「事件怎么改列表」的规则都收在这里，useChat 只负责订阅和过滤。
 */
function applyAgentEvent(messages: MessageView[], event: AgentEvent): MessageView[] {
  switch (event.type) {
    case 'user-message': {
      // 同 id 已经在列表里：要么切对话时 listMessages 已经拉到了，要么它先以「插入」露过一次。
      // 两种情况都用事件里的真身覆盖——否则会重复一条，或者留着已经过期的插入标记
      const at = messages.findIndex((m) => m.id === event.message.id)
      if (at === -1) return [...messages, event.message]
      return messages.map((m, index) => (index === at ? event.message : m))
    }

    case 'assistant-start': {
      // 上一张占位还空着（点过「插入」、新的一段还没开始吐字）就接着用它，
      // 别再造一张，否则列表末尾会多一个永远填不上的空气泡
      const last = messages[messages.length - 1]
      if (last !== undefined && isPending(last) && last.content.length === 0) return messages
      return [...messages, pendingMessage([])]
    }

    case 'assistant-delta': {
      const at = lastPendingAt(messages)
      if (at === -1) return messages
      return messages.map((m, index) =>
        index === at ? { ...m, content: appendDelta(m.content, event.text) } : m
      )
    }

    case 'reasoning-delta': {
      const at = lastPendingAt(messages)
      if (at === -1) return messages
      return messages.map((m, index) =>
        index === at ? { ...m, content: appendReasoning(m.content, event.text) } : m
      )
    }

    case 'assistant-end': {
      // 找到占位就整条替换成库里的真身（含真 id / metadata）
      const at = lastPendingAt(messages)
      if (at === -1) {
        // 找不到说明中途切走又切回来了，占位已经被 listMessages 覆盖掉。
        // 直接追加，保证最终能看到这条消息。
        return [...messages, event.message]
      }
      const target = messages[at]
      // 插入之后新开的那张一直没等到输出：说明本轮就到这儿结束了，把它收掉。
      // 换成上一段的内容会让同一段话显示两遍
      if (target !== undefined && target.content.length === 0) {
        return messages.filter((_message, index) => index !== at)
      }
      return messages.map((m, index) => (index === at ? event.message : m))
    }

    case 'tool-start': {
      // 工具调用挂在正在生成的那条占位里：先出一块「执行中」，等 tool-end 补结果
      const at = lastPendingAt(messages)
      if (at === -1) return messages
      return messages.map((m, index) =>
        index === at
          ? {
              ...m,
              content: [
                ...m.content,
                {
                  type: 'tool',
                  id: event.id,
                  name: event.name,
                  args: event.args,
                  result: null,
                  status: 'running'
                } satisfies ContentBlock
              ]
            }
          : m
      )
    }

    case 'tool-end': {
      // 把结果填回对应的那一块；找不到（比如占位已被替换）就不动
      const at = lastPendingAt(messages)
      if (at === -1) return messages
      return messages.map((m, index) =>
        index === at
          ? {
              ...m,
              content: m.content.map((block) =>
                block.type === 'tool' && block.id === event.id
                  ? { ...block, result: event.result, status: event.status }
                  : block
              )
            }
          : m
      )
    }

    case 'user-insert': {
      // 「插入」的消息：界面上立刻出现，它前面那一段回复就此收尾，
      // 后面来的增量要落到一张新的占位气泡上——不然新内容会顶在插入行上方
      const existed = messages.some((m) => m.id === event.message.id)
      const at = lastPendingAt(messages)
      const previous = at === -1 ? undefined : messages[at]
      // 前一段一个字都还没吐出来就被插断：那张空占位收掉，留着只会是个空气泡
      const base =
        at !== -1 && previous !== undefined && previous.content.length === 0
          ? messages.filter((_message, index) => index !== at)
          : messages
      const appended = existed ? base : [...base, event.message]
      return [...appended, pendingMessage([])]
    }

    case 'queue':
    case 'title':
      // 排队与标题不归消息列表管
      return messages
  }
}

/**
 * 把「正在生成中的一轮」做成占位气泡接到历史末尾。
 *
 * 同一个会话同时只有一轮，所以列表里已经有占位就不再造第二条。
 */
function applySnapshot(messages: MessageView[], snapshot: ActiveStream): MessageView[] {
  if (lastPendingAt(messages) !== -1) return messages
  return [...messages, pendingMessage(snapshot.blocks)]
}

/**
 * 造一条「还没落库」的占位气泡。
 *
 * 它靠 id 前缀被认出来：delta 往里拼字、assistant-end 把它整条换成库里那份。
 */
function pendingMessage(blocks: MessageView['content']): MessageView {
  return {
    id: makePendingId(),
    role: 'assistant',
    content: blocks,
    status: 'done',
    metadata: null
  }
}
