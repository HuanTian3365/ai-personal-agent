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
import type { MessageEventSend } from '@shared/types/messageService'
import { ChevronDownIcon, ArrowUpIcon, Square } from 'lucide-react'
import { useState } from 'react'
interface Props {
  /** 生成状态 true:她正在回复 false:等待输入 */
  isSending: boolean
  onSend: (message: MessageEventSend) => Promise<boolean>
  /** 生成中且有内容时交给排队 */
  onQueue: (text: string) => void
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
  /**
   * 点击行为
   *
   * 输入状态: 无内容禁用 | 有内容发送
   * 生成状态: 无内容中断 | 有内容排队
   */
  async function handleAction(): Promise<void> {
    // 生成中 -> 有内容排队 | 无内容中断
    if (isSending) {
      if (!hasInput) {
        onAbort()
        return
      }
      onQueue(text)
      setText('')
      return
    }
    // 等待输入 -> 发送
    const pending = text
    if (pending.trim() === '') return
    setText('')
    const sent = await onSend({ content: pending })
    // 没发出去就把原文放回,用户已重新输入则不覆盖
    if (!sent) setText((current) => (current === '' ? pending : current))
  }

  /**
   * 排队:默认未展开,只有一条消息就显示,多条就显示x条排队中
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
            // 回车发送 | Shift+Enter 换行 | isComposing 是输入法组字中的回车(选词) 不能当发送
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              // 生成中空输入不接回车: 那时回车等于中断 太容易误触 | 有内容才放行去排队
              if (isSending && !hasInput) return
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
            {/* 生成中且有内容仍是发送箭头(按下去排队) | 生成中无内容才是停止 */}
            {!isSending || hasInput ? <ArrowUpIcon /> : <Square />}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
