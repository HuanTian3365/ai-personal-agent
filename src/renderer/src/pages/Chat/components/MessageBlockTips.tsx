import {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger
} from '@renderer/components/ui/trace'
import type { TMTips } from '@shared/types/message'
import { MonitorCog } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  context: TMTips
}

export default function MessageBlockTips({ context }: Props): React.JSX.Element {
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <MonitorCog />
            </TraceIcon>
            <TraceTitle className="">提示 - {context.content} </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-sm [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
          <Markdown remarkPlugins={[remarkGfm]}>{context.content}</Markdown>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
