import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { FieldSet, FieldGroup, Field, FieldLabel, FieldError } from '@renderer/components/ui/field'
import type { GroupRenameFun, ToAsync } from '@shared/types/ipcContract'
import { useState } from 'react'

/** 重命名分组：名称必填 失败原因回显在输入框下 */
interface Props {
  open: boolean
  groupId: string
  groupName: string
  onOpenChange: (open: boolean) => void
  onSubmit: ToAsync<GroupRenameFun>
}

export default function GroupRename({
  open,
  groupId,
  groupName,
  onOpenChange,
  onSubmit
}: Props): React.JSX.Element {
  // draft=null 表示没编辑过 显示props里的分组名 | 关闭时置null 下次打开自动回填最新名字 不用effect同步
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 显示名称
  const name = draft ?? groupName
  // 能否提交
  const canSubmit = name.trim() !== ''

  /** 弹窗开关切换状态 | 关闭时清掉草稿与残留错误 */
  const handleOpenChange = (next: boolean): void => {
    setError('')
    if (!next) {
      setDraft(null)
    }
    onOpenChange(next)
  }

  /** 提交 */
  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    const res = await onSubmit({ id: groupId, title: name.trim() })
    setSubmitting(false)
    if (res.success) {
      handleOpenChange(false)
      return
    }
    setError(res.error ?? '重命名失败')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名分组</DialogTitle>
        </DialogHeader>
        <FieldSet>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="path">分组名称</FieldLabel>
              <div className="flex flex-row gap-2">
                <Input id="path" value={name} onChange={(e) => setDraft(e.target.value)} />
              </div>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
