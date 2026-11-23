import { ArrowDownIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  /** 是否显示 */
  visible: boolean
  /** 点击回到底部 */
  onClick: () => void
}

/** 回到底部按钮 | 浮在输入框上方 | 离底超过阈值才出现 */
export default function ScrollToBottomButton({ visible, onClick }: Props): React.JSX.Element {
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
