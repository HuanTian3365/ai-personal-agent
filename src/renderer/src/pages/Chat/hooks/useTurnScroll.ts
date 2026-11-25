import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** 距底多少px内算在底部 */
const BOTTOM_THRESHOLD = 8
/** 离底多少px外才显示回到底部按钮 */
const BUTTON_THRESHOLD = 80

interface Options {
  /** true:内容变高时跟随底部 | 流式期间传true */
  follow?: boolean
}

interface TurnScroll {
  /** 滚动容器 */
  viewportRef: RefObject<HTMLDivElement | null>
  /** 内容容器 | 观察它的高度变化 */
  contentRef: RefObject<HTMLDivElement | null>
  /** 是否显示回到底部按钮 */
  showButton: boolean
  /** 滚动事件处理 | 挂到viewport的onScroll */
  handleScroll: () => void
  /** 滚到底部 */
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

/**
 * 历史轮列表的滚动控制
 *
 * 只做三件事:判断是否在底部 / 内容变高时跟随 / 提供滚到底部
 */
export function useTurnScroll({ follow = false }: Options = {}): TurnScroll {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /** 是否在底部 | 用ref避免ResizeObserver读到旧值 */
  const atBottomRef = useRef(true)
  /** rAF句柄 | scroll事件节流 */
  const frameRef = useRef<number | null>(null)
  const [showButton, setShowButton] = useState(false)

  /** 滚到底部 | auto立即 smooth平滑 */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = viewportRef.current
    if (!el) return
    atBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  /** 滚动时更新底部状态 | 只在按钮显隐翻转时setState */
  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const el = viewportRef.current
      if (!el) return
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      atBottomRef.current = distance <= BOTTOM_THRESHOLD
      setShowButton(distance > BUTTON_THRESHOLD)
    })
  }, [])

  /** 内容高度变化时跟随底部 | ResizeObserver比依赖turns准 */
  useEffect(() => {
    const el = viewportRef.current
    const content = contentRef.current
    if (!el || !content) return
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  /** 开始流式时强制到底 | 自己发的消息在视口外也能看到 */
  useEffect(() => {
    if (!follow) return
    scrollToBottom('auto')
  }, [follow, scrollToBottom])

  /** 卸载时清理rAF */
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    []
  )

  return { viewportRef, contentRef, showButton, handleScroll, scrollToBottom }
}
