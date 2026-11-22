import { useParams } from 'react-router'
import ChatHeader from './components/ChatHeader'
import TurnList from './components/TurnList'
import { useTurns } from './hooks/useTurns'
import InputBox from './components/InputBox'
import InputQueue from './components/InputQueue'

/**
 * 对话页：读历史 + 发送 + 流式。
 *
 * 排队、插入还没做（见 docs/待实现/03.TODO-发起-消息排队.md）。
 */
export default function ChatIndex(): React.JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { turns, title, send, abort, isReplying } = useTurns(conversationId ?? null)

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
      {/* 聊天头部 */}
      <div className="border-b border-border px-5 pt-5">
        <ChatHeader title={title} />
      </div>
      {/* 消息列表 */}
      <div className="flex-1 h-full overflow-hidden">
        <TurnList turns={turns}>
          <div>
            {/* 排队框 */}
            <InputQueue />
            {/* 输入框 */}
            <InputBox isSending={isReplying} onSend={send} onAbort={abort} />
          </div>
        </TurnList>
      </div>
    </div>
  )
}
