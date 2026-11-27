import { useParams } from 'react-router'
import ChatHeader from './components/ChatHeader'
import TurnList from './components/TurnList'
import { useTurns } from './hooks/useTurns'
import InputBox from './components/InputBox'
import InputQueue from './components/InputQueue'

/**
 * 对话页：读历史 + 发送 + 流式 + 排队。
 *
 * 设计见 docs/99-归档/计划/04.已完成-排队与插队/V1/01.开发.md
 */
export default function ChatIndex(): React.JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { turns, title, send, abort, isReplying, queue, insert, editQueue, removeQueue } = useTurns(
    conversationId ?? null
  )

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
      {/* 聊天头部 */}
      <div className="border-b border-border px-5 pt-5">
        <ChatHeader title={title} />
      </div>
      {/* 消息列表 */}
      <div className="flex-1 h-full overflow-hidden">
        <TurnList turns={turns} follow={isReplying}>
          <div>
            {/* 排队框 */}
            <InputQueue
              queue={queue}
              onInsert={(itemId) => void insert(itemId)}
              onEdit={(itemId, text) => void editQueue(itemId, text)}
              onRemove={(itemId) => void removeQueue(itemId)}
            />
            {/* 输入框 | 生成中再发一条默认进排队 */}
            <InputBox
              isSending={isReplying}
              onSend={send}
              onQueue={(text) => void send({ content: text }, 'queue')}
              onAbort={abort}
            />
          </div>
        </TurnList>
      </div>
    </div>
  )
}
