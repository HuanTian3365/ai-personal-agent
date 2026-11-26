import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { GroupDeleteFun, ToAsync } from '@shared/types/ipcContract'
import { useState } from 'react'

/** 删除分组：只移除分组这一层 组内会话落到未分组 文件夹与消息都不动 */
interface Props {
  open: boolean
  groupId: string
  groupName: string
  onOpenChange: (open: boolean) => void
  onSubmit: ToAsync<GroupDeleteFun>
}

export default function GroupDelete({
  open,
  groupId,
  groupName,
  onOpenChange,
  onSubmit
}: Props): React.JSX.Element {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  /** 弹窗开关切换状态 | 关闭时清掉残留错误 */
  const handleOpenChange = (next: boolean): void => {
    setError('')
    onOpenChange(next)
  }

  /** 提交 */
  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true)
    const res = await onSubmit({ id: groupId })
    setSubmitting(false)
    if (res.success) {
      handleOpenChange(false)
      return
    }
    setError(res.error)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除分组</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {`将把“${groupName}”从分组列表中移除。文件夹与会话记录会保留，其会话将显示在“未分组”下。`}
        </p>
        {error !== '' && <p className="text-destructive text-xs">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" disabled={submitting} onClick={() => void handleSubmit()}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
