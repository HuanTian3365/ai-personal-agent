import { TerminalIcon } from 'lucide-react'
import type { ContentBlock } from '@shared/types/messages'
import { CodeBlock, CodeBlockContent } from '@renderer/components/ui/code-block'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceCollapsibleContent
} from '@renderer/components/ui/trace'

interface Props {
  block: Extract<ContentBlock, { type: 'tool' }>
}

/** 一次工具调用：默认折叠，标题是「工具名(参数)」，点开看返回内容 */
export default function MessageBlockTool({ block }: Props): React.JSX.Element {
  const args = block.args === null ? '' : JSON.stringify(block.args, null, 2)

  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <TerminalIcon />
            </TraceIcon>
            <TraceTitle>{block.name}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {Object.keys(block.args as object).length > 0 && (
            <div>
              输入:
              <CodeBlock size="sm">
                <CodeBlockContent wrap className="max-h-64">
                  <pre>{args}</pre>
                </CodeBlockContent>
              </CodeBlock>
            </div>
          )}
          <div>
            输出:
            <CodeBlock size="sm">
              <CodeBlockContent wrap className="max-h-64">
                {block.result}
              </CodeBlockContent>
            </CodeBlock>
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
