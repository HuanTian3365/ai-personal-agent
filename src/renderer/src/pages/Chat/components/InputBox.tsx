import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioItem
} from '@renderer/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton
} from '@renderer/components/ui/input-group'
import { MessageEventSend } from '@shared/types/newMessageService'
import { ChevronDownIcon, ArrowUpIcon, Square } from 'lucide-react'
import { useState } from 'react'
interface Props {
  /** 发送状态 true:发送中 false:等待输入 */
  isSending: boolean
  onSend: (message: MessageEventSend) => Promise<boolean>
  onQueue: (value: string) => void
  onAbort: () => void
}

export default function InputBox({
  isSending,
  onSend,
  onQueue,
  onAbort
}: Props): React.JSX.Element {
  /** 用户输入内容 */
  const [text, setText] = useState('')
  /** 是否有输入 */
  const hasInput = text.trim().length > 0
  /** 点击行为 */
  async function handleAction(): Promise<void> {
    // 未发送->发送
    if (!isSending) {
      const pending = text
      setText('')
      const sent = await onSend({
        content: pending
      })
      // 没发出去就把原文放回,用户已重新输入则不覆盖
      if (!sent) setText((current) => (current === '' ? pending : current))
    }
    // 发送中,且输入框有内容->排队
    else if (text.length > 0) {
      onQueue(text)
      setText('')
    }
    // 发送中,且输入框没内容->中断
    else {
      onAbort()
    }
  }

  /**
   * 排队:默认未展开,只有一条消息就显示,多条就显示x条排队中
   *
   */

  return (
    <div>
      <InputGroup>
        {/* 输入框 */}
        <InputGroupTextarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
          }}
          onKeyDown={(e) => {
            // 回车发送、Shift+Enter 换行。isComposing 是输入法组字中的回车（选词），不能当发送；
            // 生成中不接回车：那时按钮是「停止」，敲个回车就中断太容易误触
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void handleAction()
            }
          }}
          placeholder="请输入你的内容......"
        />
        {/* 底部扩展 */}
        <InputGroupAddon align="block-end">
          {/* 模型选择
          TODO: 先占位,后期实现
          */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<InputGroupButton size="sm" />}>
              GPT-5
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>OpenAI</DropdownMenuLabel>
                  <DropdownMenuRadioItem value="gpt-5" closeOnClick>
                    GPT-5
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="gpt-5-mini" closeOnClick>
                    GPT-5 mini
                  </DropdownMenuRadioItem>
                </DropdownMenuGroup>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* 思考强度选择
          TODO: 先占位,后期实现
          */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<InputGroupButton size="sm" />}>
              Medium
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup>
                <DropdownMenuRadioItem value="low" closeOnClick>
                  Low
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="medium" closeOnClick>
                  Medium
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="high" closeOnClick>
                  High
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            disabled={!hasInput && !isSending}
            onClick={() => void handleAction()}
            type="submit"
            size="icon"
            variant="default"
            className="ml-auto rounded-full"
          >
            {!isSending || hasInput ? <ArrowUpIcon /> : <Square />}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
