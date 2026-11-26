import { Message, MessageContent, MessageFooter } from '@renderer/components/ui/message'
import type { TMUser } from '@shared/types/message'
import { Bubble, BubbleContent } from '@renderer/components/ui/bubble'
import { Button } from '@renderer/components/ui/button'
import { CopyIcon } from 'lucide-react'
import { cn } from 'cn'
import { formatClock } from '@renderer/utils/format'
import { copyText } from '@renderer/lib/copy'

interface Props {
  context: TMUser
  isLast?: boolean
}

export default function MessageBlockUser({ context, isLast }: Props): React.JSX.Element {
  return (
    <Message align="end">
      <MessageContent className="gap-0 group">
        <Bubble align="end" variant="muted">
          <BubbleContent className="whitespace-pre-wrap">{context.content}</BubbleContent>
        </Bubble>
        <MessageFooter
          className={cn(
            'p-0 flex gap-2',
            !isLast && 'opacity-0 transition-opacity duration-200 group-hover:opacity-100'
          )}
        >
          <div>{context.time ? formatClock(context.time) : null}</div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy"
            onClick={() => {
              copyText(context.content || '')
            }}
          >
            <CopyIcon className="-scale-x-100" />
          </Button>
        </MessageFooter>
      </MessageContent>
    </Message>
  )
}
