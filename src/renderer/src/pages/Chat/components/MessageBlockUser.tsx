import { Message, MessageContent } from '@renderer/components/ui/message'
import { MUser } from '@shared/types/newMessages'
import { Bubble, BubbleContent } from '@renderer/components/ui/bubble'

interface Props {
  context: MUser
}

export default function MessageBlockUser({ context }: Props): React.JSX.Element {
  return (
    <Message align="end">
      <MessageContent>
        <Bubble align="end" variant="muted">
          <BubbleContent className="whitespace-pre-wrap">{context.content}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}
