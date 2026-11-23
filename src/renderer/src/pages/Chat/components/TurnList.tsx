import type { TurnMessage } from '@shared/types/message'
import TurnItem from './TurnItem'

interface Props {
  turns: TurnMessage[]
  children?: React.ReactNode
}

/** 历史轮列表：一轮一块，轮与轮之间留出间隔 */
export default function TurnList({ turns, children }: Props): React.JSX.Element {
  return (
    <div className="scrollbar-subtle h-full overflow-y-auto overscroll-contain pt-4">
      <div className="flex min-h-full flex-col gap-3 px-10">
        {turns.map((turn) => (
          <div key={turn.id} className="min-w-0 shrink-0">
            <TurnItem turn={turn} />
          </div>
        ))}
        <div className="sticky bottom-0 z-10 -mx-10 mt-auto bg-background px-10 pb-5">
          {children}
        </div>
      </div>
    </div>
  )
}
