import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'

interface Props {
  rawType: string
  raw: unknown
}

/** 未知 block：降级提示 + 可展开看原始数据，不崩、不丢信息 */
export default function MessageBlockUnknown({ rawType, raw }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rawText = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRightIcon
          className={open ? 'size-3 rotate-90 transition-transform' : 'size-3 transition-transform'}
        />
        [不支持的内容类型: {rawType}]
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs text-muted-foreground">
          {rawText ?? String(raw)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
