import {
  MessageScrollerProvider,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  MessageScroller
} from '@renderer/components/ui/message-scroller'

import type { MessageView } from '@shared/types/messages'
import type { QueueItem } from '@shared/types/agents'
import clsx from 'clsx'
import { useCallback, useEffect, useRef } from 'react'
import Composer from './Composer'
import ComposerQueue from './ComposerQueue'
import MessageItem from './MessageItem'
import MessageLoading from './MessageLoading'

/** 距底部多少像素之内算「贴着底部」（跟着内容走）；超过就当成用户在翻历史 */
const BOTTOM_GAP = 32
/** 自己贴底之后的这段时间里，scroll 事件当作是程序造成的，不参与「是否在底部」的判断 */
const STICK_SETTLE_MS = 0

interface Props {
  /** 当前对话 id：切对话后要重新贴底，列表得知道自己换的是哪个对话 */
  conversationId: string | null
  messages: MessageView[]
  /** 排队中、等本轮结束再发的消息 */
  queue: QueueItem[]
  isLoading: boolean
  isSending: boolean
  /** 本轮是否真的在回复中（不含发送的瞬间），加载提示只看它 */
  isReplying: boolean
  error: string | null
  onSend: (text: string) => Promise<boolean>
  onAbort: () => Promise<void>
  /** 把排队里的一条插入当前轮 */
  onInsert: (itemId: string) => void
}
export default function MessageList({
  conversationId,
  messages,
  queue,
  isLoading,
  isSending,
  isReplying,
  onSend,
  onAbort,
  onInsert
}: Props): React.JSX.Element {
  //
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  /** 是否跟着内容往下走：只有视口贴着底部时才跟随，用户往上翻就停手 */
  const stickRef = useRef(true)
  /** 上一次「程序贴底」的时间，用来忽略自己引起的 scroll 事件 */
  const stuckAtRef = useRef(0)

  /** 贴到底。记时间戳，免得下面把这次滚动误判成「用户翻上去了」 */
  const stickToBottom = useCallback((): void => {
    const el = viewportRef.current
    if (el === null) return
    stuckAtRef.current = performance.now()
    el.scrollTop = el.scrollHeight
  }, [])

  // 用户滚动 → 重新判断贴不贴底。刚贴底那几百毫秒的 scroll 事件跳过：
  // 那时消息块可能还在补布局，落点偏小，不能当成用户离开了底部
  useEffect(() => {
    const el = viewportRef.current
    if (el === null) return
    const onScroll = (): void => {
      if (performance.now() - stuckAtRef.current < STICK_SETTLE_MS) return
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_GAP
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // 内容尺寸一变就重新贴底：首屏之外的消息块是惰性布局（content-visibility），
  // 进场时按 contain-intrinsic-size 的估算高度算出来偏小，滚完会差一截；
  // 跟着真实高度多校正几次，才真的停在底部
  useEffect(() => {
    const el = contentRef.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stickRef.current) stickToBottom()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [stickToBottom])

  // 切换对话自动滚动到底部
  useEffect(() => {
    if (isLoading) return
    stickRef.current = true
    const raf = requestAnimationFrame(stickToBottom)
    return () => cancelAnimationFrame(raf)
  }, [conversationId, isLoading, stickToBottom])

  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport
          ref={viewportRef}
          style={{ maskImage: 'none', WebkitMaskImage: 'none', scrollbarWidth: 'auto' }}
          className={[
            'scrollbar-gutter-stable',
            '[&::-webkit-scrollbar]:w-2.5',
            '[&::-webkit-scrollbar-track]:bg-transparent',
            '[&::-webkit-scrollbar-corner]:bg-transparent',
            '[&::-webkit-scrollbar-thumb]:rounded-full',
            '[&::-webkit-scrollbar-thumb]:border-2',
            '[&::-webkit-scrollbar-thumb]:border-transparent',
            '[&::-webkit-scrollbar-thumb]:bg-clip-content',
            '[&::-webkit-scrollbar-thumb]:bg-foreground/20',
            '[&::-webkit-scrollbar-thumb:hover]:bg-foreground/35'
          ].join(' ')}
        >
          <MessageScrollerContent ref={contentRef} className="px-10 gap-0">
            {/* 状态区 */}
            {isLoading && (
              <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
            )}
            {!isLoading && messages.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">开始对话吧</div>
            )}

            {/* 消息区 */}
            {messages.map((m, i) => (
              <MessageScrollerItem
                key={m.id}
                messageId={m.id}
                className={clsx({
                  'mt-2': true,
                  'mb-5': i === messages.length - 1 && !isReplying
                })}
              >
                <MessageItem message={m} />
                {isReplying && messages.length - 1 === i && <MessageLoading />}
              </MessageScrollerItem>
            ))}
            {/* 输入区 */}
            <div className="sticky bottom-0 z-10 right-0 -mx-10 mt-auto bg-background px-10 pb-5">
              <MessageScrollerButton className="data-[direction=end]:bottom-[calc(100%+0.75rem)] data-[direction=end]:right-0" />
              <ComposerQueue items={queue} onInsert={onInsert} />
              <Composer
                isSending={isSending}
                onSend={onSend}
                onInterrupt={() => void onAbort()}
                // 生成中再发的也走 send：main 会把它放进排队，等本轮结束自动发
                onQueue={(value) => void onSend(value)}
              />
            </div>
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
