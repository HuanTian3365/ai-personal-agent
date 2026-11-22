import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Input } from '@renderer/components/ui/input'
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

interface QueueItem {
  id: string
  text: string
}

export default function InputQueue(): React.JSX.Element {
  const [queue, setQueue] = useState<QueueItem[]>([])

  /** 保存某条排队消息改过的内容 */
  function updateText(id: string, text: string): void {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)))
  }

  function getRender(): React.JSX.Element {
    if (queue.length === 0) {
      return <></>
    }

    const first = queue[0]
    if (queue.length === 1 && first !== undefined) {
      return (
        <Card className="mx-2 px-4 py-1 rounded-b-none">
          <QueueItem item={first} onSave={(text) => updateText(first.id, text)} />
        </Card>
      )
    }

    return (
      <Card className="mx-2 p-0 rounded-b-none">
        <Collapsible>
          <CollapsibleTrigger className="group/collapsible w-full px-4 py-1">
            <div className="flex flex-row items-center gap-2">
              <MessageSquareShare size={16} />
              {queue.length} 条消息排队
              <Button size="icon-sm" variant="link" className="ml-auto">
                <ChevronDownIcon className="group-data-panel-open/collapsible:rotate-180" />
              </Button>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {queue.map((item) => (
              <Card key={item.id} className="m-0 py-0 px-2">
                <QueueItem item={item} onSave={(text) => updateText(item.id, text)} />
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </Card>
    )
  }
  return getRender()
}

function QueueItem({
  item,
  onSave
}: {
  item: QueueItem
  onSave: (text: string) => void
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
            <Button size="icon-sm" variant="link" onClick={startEdit}>
              <SquarePen />
            </Button>
            <Button size="icon-sm" variant="link">
              <Trash />
            </Button>
            <Button size="icon-sm" variant="link">
              <Send />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
