import { BrainIcon } from 'lucide-react'

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceCollapsibleContent
} from '@renderer/components/ui/trace'
import type { TMReasoning } from '@shared/types/message'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  context: TMReasoning
}

/** 思考过程 */
export default function MessageBlockReasoning({ context }: Props): React.JSX.Element {
  const lines = context.content.split('\n')
  /** 头部:思考中实时展示最新一行,否则就是第一行 */
  const header = (context.status === 'running' ? lines.at(-1) : lines.at(0)) ?? ''

  /** 获取思考内容状态 */
  function getStatus(): 'running' | undefined {
    if (context.status === 'running') return 'running'
    else return undefined
  }

  return (
    <Trace className="w-full overflow-hidden">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={getStatus()}>
            <TraceIcon>
              <BrainIcon />
            </TraceIcon>
            <TraceTitle className="">思考 - {header} </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-sm [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
          <Markdown remarkPlugins={[remarkGfm]}>{context.content}</Markdown>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
