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
import type { GroupRenameR, GroupRenameI } from '@shared/types/ipcContract'
import { useState } from 'react'

/** 新建分组：文件夹可选、名称可选，但两者不能同时为空 */
interface Props {
  open: boolean
  groupId: string
  groupName: string
  /** 返回 true 表示建成功，弹窗自行关闭 */
  onSubmit: (input: GroupRenameI) => Promise<GroupRenameR>
}

export default function GroupRename({
  open,
  groupId,
  groupName,
  onSubmit
}: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  /** 弹窗切切换状态 */
  const handleOpenChange = (next: boolean): void => {
    setName(next ? groupName : '')
  }

  /** 提交 */
  const handleSubmit = async (): Promise<void> => {}

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`在「${groupName}」下新建分组`}</DialogTitle>
        </DialogHeader>
        <FieldSet>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="path">分组名称</FieldLabel>
              <div className="flex flex-row gap-2">
                <Input id="path" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button disabled onClick={() => void handleSubmit()}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
