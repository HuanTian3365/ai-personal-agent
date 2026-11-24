import {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger
} from '@renderer/components/ui/trace'
import type { MSystem } from '@shared/types/message'
import { MonitorCog } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  context: MSystem
}

export default function MessageBlockSystem({ context }: Props): React.JSX.Element {
  return (
    <Trace>
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <MonitorCog />
            </TraceIcon>
            <TraceTitle className="">系统 - {context.content} </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-sm [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
          <Markdown remarkPlugins={[remarkGfm]}>{context.content}</Markdown>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
