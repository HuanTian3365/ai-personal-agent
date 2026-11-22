import { useParams } from 'react-router'
import ChatHeader from './components/ChatHeader'
import TurnList from './components/TurnList'
import { useTurns } from './hooks/useTurns'
import InputBox from './components/InputBox'
import InputQueue from './components/InputQueue'

/**
 * 对话页：现在只做「读历史并回显」。
 *
 * 发送、流式、排队、插入那套逻辑整体下掉了（原件在 `pages/ChatBak`），
 * 等发送链路改成轮结构再接回来。
 */
export default function ChatIndex(): React.JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { turns, title, send, abort } = useTurns(conversationId ?? null)

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
            <InputBox isSending={false} onSend={send} onQueue={() => {}} onAbort={abort} />
          </div>
        </TurnList>
      </div>
    </div>
  )
}
