import * as React from 'react'
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

/** 第二层分组的行: 可折叠 展开后列出该分组下的对话(第三层) */
interface Props {
  /** 分组节点 */
  group: GroupNode
  /** 新建对话 */
  onAddConversation: (groupId: string | null) => Promise<void>
  /** 切换展开状态 */
  onToggleOpen: (id: string, open: boolean) => Promise<void>
}

export default function Group({
  group,
  onAddConversation,
  onToggleOpen
}: Props): React.JSX.Element {
  function showIcon(): React.JSX.Element {
    if (group.isDefault) {
      return group.isOpen ? <Maximize /> : <Minimize />
    } else if (group.path === null) {
      return group.isOpen ? <PackageOpen /> : <Package />
    } else {
      return group.isOpen ? <FolderOpen /> : <Folder />
    }
  }
  return (
    <SidebarMenuItem>
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
      {/* 扩展按钮: 分组菜单 + 新建对话 | 未分组不可改名|删除 不给菜单 */}
      {!group.isDefault && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="分组操作" />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              {/* 两项只有占位 后端还没有 group:rename / group:delete 通路 */}
              <DropdownMenuItem>重命名</DropdownMenuItem>
              {group.path !== null && <DropdownMenuItem>显示在文件夹</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem>删除分组</DropdownMenuItem>
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
    </SidebarMenuItem>
  )
}
