import type { QueueItem } from '@shared/types/agents'
import { Button } from '@renderer/components/ui/button'

interface Props {
  /** 排队中、等本轮结束再发的消息 */
  items: QueueItem[]
  /** 把某一条立即插入当前轮 */
  onInsert: (itemId: string) => void
}

/**
 * 输入框上方的排队条。
 *
 * 生成期间再发的一条会先躺在这里；点「插入」就立刻进对话，
 * 模型在当前这一轮的下一个 step 边界读到它。
 */
export default function ComposerQueue({ items, onInsert }: Props): React.JSX.Element | null {
  if (items.length === 0) return null

  return (
    <div className="mb-2 flex flex-col gap-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5"
        >
          <span className="shrink-0 text-xs text-muted-foreground">排队中</span>
          <span className="min-w-0 flex-1 truncate text-xs">{item.text}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-2 text-xs"
            onClick={() => onInsert(item.id)}
          >
            插入
          </Button>
        </div>
      ))}
    </div>
  )
}
