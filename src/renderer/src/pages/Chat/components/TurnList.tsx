import type { TurnMessage } from '@shared/types/message'
import TurnItem from './TurnItem'
import { useTurnScroll } from '../hooks/useTurnScroll'
import { ArrowDownIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  turns: TurnMessage[]
  /** 流式进行中 | true时内容变高跟随底部 */
  follow?: boolean
  children?: React.ReactNode
}

/** 历史轮列表：一轮一块，轮与轮之间留出间隔 */
export default function TurnList({ turns, follow = false, children }: Props): React.JSX.Element {
  const { viewportRef, contentRef, showButton, handleScroll, scrollToBottom } = useTurnScroll({
    follow
  })

  return (
    <div
      ref={viewportRef}
      onScroll={handleScroll}
      className="scrollbar-subtle h-full overflow-y-auto overscroll-contain pt-4"
    >
      <div ref={contentRef} className="flex min-h-full flex-col gap-3 px-10">
        {turns.map((turn, index) => (
          <div key={turn.id} className="min-w-0 shrink-0">
            <TurnItem turn={turn} isLast={index === turns.length - 1} />
          </div>
        ))}
        <div className="sticky bottom-0 z-10 -mx-10 mt-auto bg-background px-10 pb-5">
          <ScrollToBottomButton visible={showButton} onClick={() => scrollToBottom()} />
          {children}
        </div>
      </div>
    </div>
  )
}

/** 回到底部按钮 | 浮在输入框上方 | 离底超过阈值才出现 */
function ScrollToBottomButton({
  visible,
  onClick
}: {
  /** 是否显示 */
  visible: boolean
  /** 点击回到底部 */
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="secondary"
      size="icon-sm"
      aria-label="回到底部"
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      className={[
        'absolute left-1/2 bottom-[calc(100%+0.75rem)] -translate-x-1/2 border-border bg-background text-foreground hover:bg-muted',
        'transition-[translate,scale,opacity] duration-200',
        visible
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-2 scale-95 opacity-0'
      ].join(' ')}
    >
      <ArrowDownIcon />
    </Button>
  )
}
