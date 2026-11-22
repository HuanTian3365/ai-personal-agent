import { useParams } from 'react-router'
import ChatHeader from './components/ChatHeader'
import MessageList from './components/MessageList'
import { useChat } from './hooks/useChat'

export default function ChatIndex(): React.JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>()
  const chat = useChat(conversationId ?? null)

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
      <div className="border-b border-border px-5 pt-5">
        <ChatHeader title={chat.title} />
      </div>
      <div className="flex-1 h-full overflow-hidden">
        <MessageList
          conversationId={conversationId ?? null}
          messages={chat.messages}
          queue={chat.queue}
          isLoading={chat.isLoading}
          isSending={chat.isSending}
          isReplying={chat.isReplying}
          error={chat.error}
          onSend={chat.send}
          onAbort={chat.abort}
          onInsert={(itemId) => void chat.insert(itemId)}
        />
      </div>
    </div>
  )
}
