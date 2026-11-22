import * as React from 'react'
import { FolderOpen, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { dialogApi } from '@renderer/lib/ipc'

/** 新建分组：文件夹可选、名称可选，但两者不能同时为空 */
interface Props {
  open: boolean
  /** 所属工作区名，只用于标题文案 */
  workspaceTitle: string
  onOpenChange: (open: boolean) => void
  /** 返回 true 表示建成功，弹窗自行关闭 */
  onSubmit: (input: { path: string | null; title: string }) => Promise<boolean>
}

export default function SidebarCreateGroupDialog({
  open,
  workspaceTitle,
  onOpenChange,
  onSubmit
}: Props): React.JSX.Element {
  const [path, setPath] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const trimmed = title.trim()
  // 不选文件夹时名称必填；选了文件夹名称可留空（main 侧取目录名）
  const missingTitle = path === null && trimmed === ''
  const canSubmit = !submitting && !missingTitle

  const reset = (): void => {
    setPath(null)
    setTitle('')
    setSubmitting(false)
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handlePick = async (): Promise<void> => {
    const picked = await dialogApi.pickDirectory()
    if (picked === null) return // 用户取消
    setPath(picked)
  }

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    const ok = await onSubmit({ path, title: trimmed })
    setSubmitting(false)
    if (ok) handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`在「${workspaceTitle}」下新建分组`}</DialogTitle>
        </DialogHeader>

        {/* 文件夹（可选） */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">文件夹（可选）</span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs">
              {path ?? '未选择：不绑定文件夹'}
            </span>
            <Button size="sm" variant="outline" onClick={() => void handlePick()}>
              <FolderOpen /> 选择
            </Button>
            {path !== null && (
              <Button size="sm" variant="ghost" onClick={() => setPath(null)}>
                <X /> 移除
              </Button>
            )}
          </div>
        </div>

        {/* 名称 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">分组名称</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit()
            }}
            placeholder={path === null ? '必填' : '留空则使用文件夹名称'}
          />
          {missingTitle && <p className="text-xs text-destructive">不选择文件夹时，分组名称必填</p>}
        </div>

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
