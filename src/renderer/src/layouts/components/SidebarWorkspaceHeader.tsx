import { Button } from '@renderer/components/ui/button'
import { SidebarGroupLabel } from '@renderer/components/ui/sidebar'
import { FolderPlus } from 'lucide-react'

/** 第一层工作区的区块头：显示工作区名，右侧「+」在该工作区下新建分组 */
interface Props {
  /** 工作区显示名 */
  title: string
  onAddGroup: () => void
}
export default function SidebarWorkspaceHeader({ title, onAddGroup }: Props): React.JSX.Element {
  return (
    <SidebarGroupLabel>
      <div className="w-full flex justify-between items-center">
        {title}
        <div className="flex justify-end gap-2">
          <Button
            size={'lg'}
            variant="link"
            className={'p-0'}
            onClick={() => {
              onAddGroup()
            }}
          >
            <FolderPlus />
          </Button>
        </div>
      </div>
    </SidebarGroupLabel>
  )
}
