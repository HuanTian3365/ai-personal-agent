import { TerminalIcon } from 'lucide-react'
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
import { MTool } from '@shared/types/newMessages'

interface Props {
  context: MTool
}

/** 一次工具调用：默认折叠，标题是「工具名(参数)」，点开看返回内容 */
export default function MessageBlockTool({ context }: Props): React.JSX.Element {
  const argsContent = context.args === null ? '' : JSON.stringify(context.args, null, 2)
  /** 获取思考内容状态 */
  function getStatus(): 'running' | 'error' | undefined {
    if (context.status === 'running') return 'running'
    else if (context.status === 'error') return 'error'
    else return undefined
  }
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={getStatus()}>
            <TraceIcon>
              <TerminalIcon />
            </TraceIcon>
            <TraceTitle>
              调用工具 - {context.name}
              {context.description && ' : ' + context.description}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {context.args != null && Object.keys(context.args).length > 0 && (
            <div>
              输入:
              <CodeBlock size="sm">
                <CodeBlockContent wrap className="max-h-64">
                  <pre>{argsContent}</pre>
                </CodeBlockContent>
              </CodeBlock>
            </div>
          )}
          {context.result != null && (
            <div>
              输出:
              <CodeBlock size="sm">
                <CodeBlockContent wrap className="max-h-64">
                  {context.result}
                </CodeBlockContent>
              </CodeBlock>
            </div>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
