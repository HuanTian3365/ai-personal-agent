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
import { TOOL_INTENT_KEY } from '@shared/types/constant'
import type { MTool } from '@shared/types/message'

interface Props {
  context: MTool
}

/** 一次工具调用：默认折叠，标题是「工具名(参数)」，点开看返回内容 */
export default function MessageBlockTool({ context }: Props): React.JSX.Element {
  // 调用原因是工具参数的一部分,直接在args里取,没填就是空串
  const rawIntent = context.args?.[TOOL_INTENT_KEY]
  const intent = typeof rawIntent === 'string' ? rawIntent : ''

  // 展开参数时把调用原因剔掉,标题已经显示了
  const visibleArgs = Object.fromEntries(
    Object.entries(context.args ?? {}).filter(([key]) => key !== TOOL_INTENT_KEY)
  )
  const hasArgs = Object.keys(visibleArgs).length > 0
  const argsContent = JSON.stringify(visibleArgs, null, 2)

  /** 获取工具运行状态 */
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
              {intent && ' : ' + intent}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {hasArgs && (
            <div>
              输入:
              <CodeBlock size="sm">
                <CodeBlockContent wrap className="max-h-64 scrollbar-subtle text-wrap ">
                  <pre className="text-wrap w-full">{argsContent}</pre>
                </CodeBlockContent>
              </CodeBlock>
            </div>
          )}
          {context.result != null && (
            <div>
              输出:
              <CodeBlock size="sm">
                <CodeBlockContent wrap className="max-h-64 scrollbar-subtle text-wrap ">
                  <pre className="text-wrap w-full">{context.result}</pre>
                </CodeBlockContent>
              </CodeBlock>
            </div>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
