import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Input } from '@renderer/components/ui/input'
import type { QueueItem } from '@shared/types/agentEvent'
import {
  CheckIcon,
  ChevronDownIcon,
  MessageSquareShare,
  Send,
  SquarePen,
  Trash,
  XIcon
} from 'lucide-react'
import { useState } from 'react'

interface Props {
  /** 排队内容 | 真相在 main 这里只负责画 */
  queue: QueueItem[]
  /** 把一条改成插队 */
  onInsert: (itemId: string) => void
  /** 改一条的文案 */
  onEdit: (itemId: string, text: string) => void
  /** 删一条 */
  onRemove: (itemId: string) => void
}

/**
 * 排队区：一条直接显示 多条默认收起成「x 条消息排队」
 *
 * 只画 next-turn。next-step(已经点了插队的)不在这里显示 它们已经作为用户消息
 * 出现在当前轮里了 再画一遍就是同一条消息两个地方
 * 条目全部由外面传进来 这里不持有队列 也不做乐观更新
 */
export default function InputQueue({
  queue,
  onInsert,
  onEdit,
  onRemove
}: Props): React.JSX.Element {
  /** 只显示还在排队的 */
  const rows = queue.filter((item) => item.target === 'next-turn')

  function getRender(): React.JSX.Element {
    if (rows.length === 0) {
      return <></>
    }

    const first = rows[0]
    if (rows.length === 1 && first !== undefined) {
      return (
        <Card className="mx-2 px-4 py-1 rounded-b-none">
          <QueueRow
            item={first}
            onSave={(text) => onEdit(first.id, text)}
            onInsert={() => onInsert(first.id)}
            onRemove={() => onRemove(first.id)}
          />
        </Card>
      )
    }

    return (
      <Card className="mx-2 p-0 rounded-b-none">
        <Collapsible>
          <CollapsibleTrigger className="group/collapsible w-full px-4 py-1">
            <div className="flex flex-row items-center gap-2">
              <MessageSquareShare size={16} />
              {rows.length} 条消息排队
              <Button size="icon-sm" variant="link" className="ml-auto">
                <ChevronDownIcon className="group-data-panel-open/collapsible:rotate-180" />
              </Button>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {rows.map((item) => (
              <Card key={item.id} className="m-0 py-0 px-2">
                <QueueRow
                  item={item}
                  onSave={(text) => onEdit(item.id, text)}
                  onInsert={() => onInsert(item.id)}
                  onRemove={() => onRemove(item.id)}
                />
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </Card>
    )
  }
  return getRender()
}

function QueueRow({
  item,
  onSave,
  onInsert,
  onRemove
}: {
  item: QueueItem
  onSave: (text: string) => void
  onInsert: () => void
  onRemove: () => void
}): React.JSX.Element {
  /** 是否正在编辑这一条 */
  const [editing, setEditing] = useState(false)
  /** 编辑中的草稿：每次进入编辑都从当前值重新开始，取消就丢掉 */
  const [draft, setDraft] = useState(item.text)

  function startEdit(): void {
    setDraft(item.text)
    setEditing(true)
  }

  function cancelEdit(): void {
    setDraft(item.text)
    setEditing(false)
  }

  /** 保存：空内容不落，留在编辑态等用户继续写 */
  function saveEdit(): void {
    const text = draft.trim()
    if (text === '') return
    onSave(text)
    setEditing(false)
  }

  return (
    <div className="flex flex-row items-center justify-between  px-2">
      <div className="flex-1 w-full flex">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 编辑态里回车保存、Esc 取消，比去点按钮快
              if (e.key === 'Enter') {
                e.preventDefault()
                saveEdit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelEdit()
              }
            }}
            // 无边框、无背景：看起来就是一段能直接改的文字
            className="border-0 px-2 shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        ) : (
          <p className="flex-1 py-1 text-sm break-all whitespace-pre-wrap">{item.text}</p>
        )}
      </div>
      <div className="flex flex-row gap-2 py-1">
        {editing ? (
          <>
            <Button size="icon-sm" variant="link" disabled={draft.trim() === ''} onClick={saveEdit}>
              <CheckIcon />
            </Button>
            <Button size="icon-sm" variant="link" onClick={cancelEdit}>
              <XIcon />
            </Button>
          </>
        ) : (
          <>
            <Button size="icon-sm" variant="link" onClick={startEdit} aria-label="改文案">
              <SquarePen />
            </Button>
            <Button size="icon-sm" variant="link" onClick={onRemove} aria-label="删除">
              <Trash />
            </Button>
            <Button size="icon-sm" variant="link" onClick={onInsert} aria-label="插队">
              <Send />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
