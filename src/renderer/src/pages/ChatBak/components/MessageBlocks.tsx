import type { ContentBlock, MessageRole } from '@shared/types/messages'
import MessageBlockError from './MessageBlockError'
import MessageBlockReasoning from './MessageBlockReasoning'
import MessageBlockText from './MessageBlockText'
import MessageBlockTool from './MessageBlockTool'
import MessageBlockUnknown from './MessageBlockUnknown'
import { Fragment } from 'react'

interface Props {
  blocks: ContentBlock[]
  role: MessageRole
}
export default function MessageBlocks({ blocks, role }: Props): React.JSX.Element {
  function renderBlock(block: ContentBlock): React.JSX.Element | null {
    switch (block.type) {
      case 'text':
        return <MessageBlockText text={block.text} role={role} />
      case 'reasoning':
        return <MessageBlockReasoning text={block.text} />
      case 'tool':
        return <MessageBlockTool block={block} />
      case 'error':
        return <MessageBlockError source={block.source} message={block.message} />
      case 'unknown':
        return <MessageBlockUnknown rawType={block.rawType} raw={block.raw} />
      default:
        return null
    }
  }

  return (
    blocks && (
      <div className="flex flex-col gap-2">
        {blocks.map((block, index) => (
          <Fragment key={index}>{renderBlock(block)}</Fragment>
        ))}
      </div>
    )
  )
}
