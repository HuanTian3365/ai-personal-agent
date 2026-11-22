import { ArrowUpIcon, ChevronDownIcon, Square } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '@renderer/components/ui/input-group'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  /** 发生状态 true:发送中 false:等待输入 */
  isSending: boolean
  onSend: (value: string) => Promise<boolean>
  onQueue: (value: string) => void
  onInterrupt: () => void
}

/**
 * TODO: 11-17: 发送按钮连击保护,防止快速点击
 */
export default function Composer({
  isSending,
  onSend,
  onQueue,
  onInterrupt
}: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [model, setModel] = useState('gpt-5')
  const [effort, setEffort] = useState('medium')

  async function handleAction(): Promise<void> {
    if (!isSending) {
      const pending = text
      if (pending.trim() === '') return
      // 先清空：agent:send 的 Promise 要等整轮结束才 resolve，不能等它
      setText('')
      const sent = await onSend(pending)
      // 没发出去就把原文放回（用户已重新输入则不覆盖）
      if (!sent) setText((current) => (current === '' ? pending : current))
    } else if (text.length > 0) {
      console.log('queue', text)
      onQueue(text) // 排队
      setText('')
    } else {
      onInterrupt() // 中断
    }
  }

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
          placeholder="Ask the agent to change your code..."
        />
        {/* 底部扩展 */}
        <InputGroupAddon align="block-end">
          {/* 模型选择 */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<InputGroupButton size="sm" />}>
              GPT-5
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
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
          {/* 思考强度选择 */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<InputGroupButton size="sm" />}>
              Medium
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={effort} onValueChange={setEffort}>
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
            disabled={text.length === 0 && !isSending}
            onClick={() => void handleAction()}
            type="submit"
            size="icon"
            variant="default"
            className="ml-auto rounded-full"
          >
            {!isSending || text.length > 0 ? <ArrowUpIcon /> : <Square />}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
