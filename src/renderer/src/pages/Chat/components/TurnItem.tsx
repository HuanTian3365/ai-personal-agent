import type { ContentBlock, TurnMessage } from '@shared/types/message'
import MessageBlockUser from './MessageBlockUser'
import MessageBlockAssistant from './MessageBlockAssistant'
import MessageBlockReasoning from './MessageBlockReasoning'
import MessageBlockTool from './MessageBlockTool'
import MessageBlockUnknown from './MessageBlockUnknown'
import MessageBlockError from './MessageBlockError'
import MessageBlockTips from './MessageBlockTips'
import TurnStatus from './TurnStatus'

interface Props {
  turn: TurnMessage
  isLast: boolean
}

/**
 * 一轮：发起消息（右对齐）+ 本轮的全部内容（思考、工具、插入、回复）。
 *
 * 一轮只占一个整体，内部按时间顺序排，不拆成一堆独立消息。
 */
export default function TurnItem({ turn, isLast }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {/* 用户消息 */}
      {turn.user !== null && <MessageBlockUser context={turn.user} isLast={isLast} />}
      {/* 状态条 + 本轮回复内容 */}
      <TurnStatus turn={turn} isLast={isLast}>
        {turn.items.length > 0 && (
          <div className="flex flex-col gap-2">
            {turn.items.map((block, index) => (
              <TurnBlock block={block} key={`${block.type}-${index}`} />
            ))}
          </div>
        )}
      </TurnStatus>
    </div>
  )

  /**
   * 轮内的一个块：按块类型挑对应的展示组件
   */
  function TurnBlock({ block }: { block: ContentBlock }): React.JSX.Element | null {
    switch (block.type) {
      /** 用户插入消息 */
      case 'user':
        return <MessageBlockUser context={block} isLast={isLast} />
      /** 助手回复消息 */
      case 'assistant':
        return <MessageBlockAssistant context={block} />
      /** 助手思考消息 */
      case 'reasoning':
        return <MessageBlockReasoning context={block} />
      /** 工具调用消息 */
      case 'tool':
        return <MessageBlockTool context={block} turnStatus={turn.status} />
      /** 提示消息 */
      case 'tips':
        return <MessageBlockTips context={block} />
      /** 错误消息 */
      case 'error':
        return <MessageBlockError context={block} />
      /** 未知消息 */
      case 'unknown':
        return <MessageBlockUnknown context={block} />
      default:
        return null
    }
  }
}
