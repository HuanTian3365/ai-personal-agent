import {
  Folder,
  FolderOpen,
  Maximize,
  Minimize,
  MoreHorizontalIcon,
  Package,
  PackageOpen,
  Plus
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem
} from '@renderer/components/ui/sidebar'
import Item from './Item'
import type { GroupNode } from '@renderer/hooks/useConversationList'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { Button } from '@renderer/components/ui/button'
import { conversationApi } from '@renderer/lib/ipc'
import { toast } from 'sonner'
import GroupRename from './GroupRename'
import GroupDelete from './GroupDelete'
import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { GroupDeleteFun, GroupRenameFun, ToAsync } from '@shared/types/ipcContract'

/** 第二层分组的行: 可折叠 展开后列出该分组下的对话(第三层) */
interface Props {
  /** 分组节点 */
  group: GroupNode
  /** 新建对话 */
  onAddConversation: (groupId: string | null) => Promise<void>
  /** 切换展开状态 */
  onToggleOpen: (id: string, open: boolean) => Promise<void>
  onGroupRename: ToAsync<GroupRenameFun>
  onGroupDelete: ToAsync<GroupDeleteFun>
}

export default function Group({
  group,
  onAddConversation,
  onToggleOpen,
  onGroupRename,
  onGroupDelete
}: Props): React.JSX.Element {
  const [renameFlag, setRenameFlag] = useState(false)
  const [deleteFlag, setDeleteFlag] = useState(false)
  /** 拖动排序 | 整块(标题行 + 展开的子对话)一起动 默认分组恒末尾不注册 */
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.key,
    disabled: group.isDefault
  })
  /** 显示图标 */
  function showIcon(): React.JSX.Element {
    if (group.isDefault) {
      return group.isOpen ? <Maximize /> : <Minimize />
    } else if (group.path === null) {
      return group.isOpen ? <PackageOpen /> : <Package />
    } else {
      return group.isOpen ? <FolderOpen /> : <Folder />
    }
  }
  /** 重命名分组 */

  /** 删除分组 */

  /** 显示分组目录 */
  async function openGroupFolder(): Promise<void> {
    const path = group.path
    if (path == null) return
    // 走Result不抛 | 失败自己弹一句
    const res = await conversationApi.groupOpenFolder({ path })
    if (!res.success) toast.error(`打开失败: ${res.error}`)
  }

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      // 拖动中浮到上层 否则后面的分组会盖住它
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.6 : undefined
      }}
      {...listeners}
    >
      <Collapsible open={group.isOpen} onOpenChange={(open) => void onToggleOpen(group.key, open)}>
        {/* 右侧要放两个按钮 给标题留够空间 否则长标题钻到按钮下面 */}
        <CollapsibleTrigger
          title={group.title}
          className={group.isDefault ? undefined : 'pr-14'}
          render={<SidebarMenuButton />}
        >
          {showIcon()}
          <span className="truncate">{group.title}</span>
        </CollapsibleTrigger>
        {/* 对话列表 */}
        <CollapsibleContent>
          {group.conversations.length > 0 && (
            <SidebarMenuSub className="mr-0 pr-0">
              {group.conversations.map((conversation) => (
                <SidebarMenuSubItem className=" pr-0" key={conversation.id}>
                  <Item conversation={conversation} />
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          )}
        </CollapsibleContent>
      </Collapsible>
      {/* 扩展按钮: 分组菜单 + 新建对话 | 未分组不可改名删除,不给菜单 */}
      {!group.isDefault && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="分组操作" />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <DropdownMenuItem onClick={() => setRenameFlag(true)}>重命名</DropdownMenuItem>
              {group.path != null && (
                <DropdownMenuItem onClick={() => void openGroupFolder()}>
                  显示在文件夹
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDeleteFlag(true)}>删除分组</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="新建对话"
            onClick={() => void onAddConversation(group.groupId)}
          >
            <Plus />
          </Button>
        </div>
      )}
      <GroupRename
        open={renameFlag}
        /** 这里分组ID肯定非空--未分组打不开这个弹窗 */
        groupId={group.groupId as string}
        groupName={group.title}
        onOpenChange={setRenameFlag}
        onSubmit={onGroupRename}
      />
      <GroupDelete
        open={deleteFlag}
        /** 同上 未分组不给菜单 */
        groupId={group.groupId as string}
        groupName={group.title}
        onOpenChange={setDeleteFlag}
        onSubmit={onGroupDelete}
      />
    </SidebarMenuItem>
  )
}
