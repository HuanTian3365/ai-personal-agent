import type { TurnMessage } from '@shared/types/message'
import TurnItem from './TurnItem'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@renderer/components/ui/message-scroller'

interface Props {
  turns: TurnMessage[]
  children?: React.ReactNode
}

/** 历史轮列表：一轮一块，轮与轮之间留出间隔 */
export default function TurnList({ turns, children }: Props): React.JSX.Element {
  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport
          style={{ maskImage: 'none', WebkitMaskImage: 'none', scrollbarWidth: 'auto' }}
          className={[
            'scrollbar-gutter-stable',
            '[&::-webkit-scrollbar]:w-2.5',
            '[&::-webkit-scrollbar-track]:bg-transparent',
            '[&::-webkit-scrollbar-corner]:bg-transparent',
            '[&::-webkit-scrollbar-thumb]:rounded-full',
            '[&::-webkit-scrollbar-thumb]:border-2',
            '[&::-webkit-scrollbar-thumb]:border-transparent',
            '[&::-webkit-scrollbar-thumb]:bg-clip-content',
            '[&::-webkit-scrollbar-thumb]:bg-foreground/20',
            '[&::-webkit-scrollbar-thumb:hover]:bg-foreground/35',
            'pt-4!'
          ].join(' ')}
        >
          <MessageScrollerContent className="px-10 gap-3">
            {turns.map((turn) => (
              <MessageScrollerItem key={turn.id}>
                <TurnItem turn={turn} />
              </MessageScrollerItem>
            ))}
            <div className="sticky bottom-0 z-10 right-0 -mx-10 mt-auto bg-background px-10 pb-5">
              <MessageScrollerButton className="data-[direction=end]:bottom-[calc(100%+0.75rem)] data-[direction=end]:right-0" />
              {children}
            </div>
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
