import { TurnMessage } from '@shared/types/message'
import { Loader } from 'lucide-react'

import { cn } from '@renderer/lib/utils'

interface Props {
  turn: TurnMessage
  children?: React.ReactNode
}
export default function TurnStatus({ turn, children }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {/* 中断/完成状态 */}
      {turn.status != 'running' && (
        <div>
          <p
            className={cn('font-bold italic text-sm', turn.status === 'aborted' && 'text-red-600')}
          >
            {turn.status === 'done' ? '已完成' : '已中断'}
          </p>
          <hr className="border-t border-gray-500 m-0 my-2" />
        </div>
      )}
      <div className="w-full f-full">{children}</div>
      {/* 运行状态 */}
      {turn.status === 'running' && (
        <div>
          <hr className="border-t border-gray-500 m-0 my-2" />
          <div className="flex gap-2 items-center  text-gray-500">
            <Loader className=" animate-spin" size={12} style={{ animationDuration: '2.5s' }} />
            <p className="text-sm">生成中......</p>
          </div>
        </div>
      )}
      {/* 运行完成特殊展示状态 */}
      {/* TODO: 用量统计,时间 */}
      {/* {turn.status === 'done' && <div>{turn?.usage?.totalTokens}</div>} */}
    </div>
  )
}
