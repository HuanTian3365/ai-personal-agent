import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { expandApi } from '@renderer/lib/ipc'
import { FieldSet, FieldGroup, Field, FieldLabel, FieldError } from '@renderer/components/ui/field'
import type { CreateGroupInput, CreateGroupOutput } from '@shared/types/ipcContract'
import { useState } from 'react'

/** 新建分组：文件夹可选、名称可选，但两者不能同时为空 */
interface Props {
  open: boolean
  /** 所属工作区名，只用于标题文案 */
  workspaceTitle: string
  onOpenChange: (open: boolean) => void
  /** 返回 true 表示建成功，弹窗自行关闭 */
  onSubmit: (input: CreateGroupInput) => Promise<CreateGroupOutput>
}

export default function SidebarCreateGroupDialog({
  open,
  workspaceTitle,
  onOpenChange,
  onSubmit
}: Props): React.JSX.Element {
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<CreateGroupOutput['error']>()
  const [submitting, setSubmitting] = useState(false)

  // 能否提交
  const canSubmit = title.trim() !== ''

  /** 弹窗切切换状态 */
  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      setPath('')
      setTitle('')
      setSubmitting(false)
    }
    onOpenChange(next)
  }

  /** 选择文件夹 */
  const handlePick = async (): Promise<void> => {
    const picked = await expandApi.pickDirectory()
    if (picked === null) return // 用户取消
    // 当前标题为空或者为上一次选择的文件夹时,使用文件夹名称
    if ((title === '' || title === path.split(/[\\/]/).pop()) ?? '') {
      setTitle(picked.split(/[\\/]/).pop() ?? '')
    }
    setPath(picked)
  }

  /** 提交 */
  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    const ok = await onSubmit({ path: path.trim() || null, title: title })
    setSubmitting(false)
    if (ok.success) handleOpenChange(false)
    setError(ok.error)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`在「${workspaceTitle}」下新建分组`}</DialogTitle>
        </DialogHeader>
        <FieldSet>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="path">分组路径</FieldLabel>
              <div className="flex flex-row gap-2">
                <Input id="path" value={path} onChange={(e) => setPath(e.target.value)} />
                <Button onClick={handlePick}>选择</Button>
              </div>
              {error?.path && <FieldError>{error?.path}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="title">分组名称</FieldLabel>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              {error?.another && <FieldError>{error?.another}</FieldError>}
            </Field>
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {submitting ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
