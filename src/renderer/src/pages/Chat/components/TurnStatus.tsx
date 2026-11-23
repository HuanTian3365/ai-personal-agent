import { useEffect, useState } from 'react'
import { TurnMessage } from '@shared/types/message'
import { CopyIcon, Database, Loader } from 'lucide-react'

import { cn } from '@renderer/lib/utils'
import { formatClock, formatDuration, formatTokenCount } from '@renderer/lib/format'
import { MessageFooter } from '@renderer/components/ui/message'
import { copyText } from '@renderer/lib/copy'
import { Button } from '@renderer/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@renderer/components/ui/hover-card'

interface Props {
  turn: TurnMessage
  isLast: boolean
  children?: React.ReactNode
}
export default function TurnStatus({ turn, isLast, children }: Props): React.JSX.Element {
  // 本轮使用时间
  const elapsedMs = (turn.endTime ?? 0) - (turn.startTime ?? 0)

  // 获取agent正文
  function getCopyContent(): string {
    const last = turn.items.at(-1)
    if (last?.type === 'assistant' && last.content.length > 0 && turn.status === 'done') {
      return last.content
    }
    return ''
  }
  return (
    <div className="flex flex-col">
      {/* 中断/完成状态 */}
      {turn.status != 'running' && (
        <div className="mb-2">
          <p
            className={cn(
              'font-bold italic text-sm text-gray-500',
              turn.status === 'aborted' && 'text-red-600'
            )}
          >
            {turn.status === 'done' ? `已完成, 用时${formatDuration(elapsedMs)}` : '已中断'}
          </p>
          <hr className="border-t border-gray-500 m-0 my-2" />
        </div>
      )}
      <div className="w-full f-full">{children}</div>
      {/* 运行状态 */}
      {turn.status === 'running' ? (
        // 正在生成中
        <div>
          <hr className="border-t border-gray-500 m-0 my-2" />
          <div className="flex gap-2 items-center  text-gray-500">
            <Loader className=" animate-spin" size={12} style={{ animationDuration: '2.5s' }} />
            <p className="text-sm">生成中......</p>
            <TurnStatusTimer startTime={turn.startTime} />
          </div>
        </div>
      ) : (
        // 生成结束
        <MessageFooter
          className={cn(
            'p-0 flex gap-2 pt-2',
            !isLast && 'opacity-0 transition-opacity duration-200 hover:opacity-100'
          )}
        >
          {/* 复制按钮,只有最后消息包含agent正文时才能复制 */}
          {getCopyContent() && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy"
              onClick={() => {
                copyText(getCopyContent())
              }}
            >
              <CopyIcon />
            </Button>
          )}
          {/* 用量展示 */}
          <div>
            <HoverCard>
              <HoverCardTrigger>
                <div className="flex flex-row items-center gap-1">
                  <Database size={16} />
                  用量{formatTokenCount(turn.usage.totalTokens, true)}
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="p-4">
                <div className="flex flex-row items-center justify-between gap-1">
                  <div className="flex flex-row items-center gap-1">
                    <Database size={16} />
                    本轮用量
                  </div>
                  {formatTokenCount(turn.usage.totalTokens)}
                </div>
                <hr className="border-t border-gray-500 m-0 my-2" />
                <div className="*:flex *:flex-row *:items-center *:justify-between *:w-full *:text-sm *:text-gray-300 *:mt-1">
                  <div>
                    <p>缓存命中</p>
                    <p>
                      {((turn.usage.cacheReadTokens / turn.usage.inputTokens) * 100).toFixed(2) +
                        '%'}
                    </p>
                  </div>
                  <div>
                    <p>未缓存输入</p>
                    <p>{turn.usage.cacheWriteTokens}</p>
                  </div>
                  <div>
                    <p>缓存读取</p>
                    <p>{turn.usage.cacheReadTokens}</p>
                  </div>
                  <div>
                    <p>输出</p>
                    <p>{turn.usage.outputTokens}</p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
          {/* 结束时间 */}
          <div>{turn.endTime ? formatClock(turn.endTime) : null}</div>
        </MessageFooter>
      )}
    </div>
  )
}

/** 运行中计时 | 每秒刷新自己 不带着整轮重渲染 */
function TurnStatusTimer({ startTime }: { startTime?: number }): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 没有开始时间就没法算
  if (startTime === undefined || startTime <= 0) return null
  return <p className="text-sm">{formatDuration(now - startTime)}</p>
}
