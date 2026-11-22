import { Bubble, BubbleContent } from '@renderer/components/ui/bubble'
import { Message, MessageContent } from '@renderer/components/ui/message'
import type { MessageView } from '@shared/types/messages'
import MessageBlocks from './MessageBlocks'

interface Props {
  message: MessageView
}

export default function MessageItem({ message }: Props): React.JSX.Element {
  // system 不套气泡，居中灰字
  if (message.role === 'system') {
    return (
      <div className="text-center text-xs text-muted-foreground">
        <MessageBlocks blocks={message.content} role={message.role} />
      </div>
    )
  }

  const isUser = message.role === 'user'
  // 生成期间「插入」的那条：照样右对齐，但标出来——和正常发的一条区分开
  const isInsert = message.insertFlag === true

  return (
    <Message align={isUser ? 'end' : 'start'}>
      <MessageContent>
        {isUser ? (
          isInsert ? (
            <div className="flex w-full min-w-0 flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">插入</span>
              <UserBubble message={message} />
            </div>
          ) : (
            <UserBubble message={message} />
          )
        ) : (
          <MessageBlocks blocks={message.content} role={message.role} />
        )}
      </MessageContent>
    </Message>
  )
}

/** 用户消息的气泡（插入的那条与正常发的用同一个） */
function UserBubble({ message }: Props): React.JSX.Element {
  return (
    <Bubble align="end" variant="muted">
      <BubbleContent>
        <MessageBlocks blocks={message.content} role={message.role} />
      </BubbleContent>
    </Bubble>
  )
}
