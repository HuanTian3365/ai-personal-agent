import { CircleCheckIcon } from 'lucide-react'

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
  text: string
}

/** 思考过程：默认折叠，点开看全文 */
export default function MessageBlockReasoning({ text }: Props): React.JSX.Element {
  return (
    <Trace className="w-full overflow-hidden">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <CircleCheckIcon />
            </TraceIcon>
            <TraceTitle className="">思考 - {text} </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="whitespace-pre-wrap">{text}</TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
