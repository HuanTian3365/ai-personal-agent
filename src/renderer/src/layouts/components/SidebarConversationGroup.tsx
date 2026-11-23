import * as React from 'react'
import { Folder, FolderOpen, Plus } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem
} from '@renderer/components/ui/sidebar'
import SidebarConversationItem from './SidebarConversationItem'
import type { GroupNode } from '@renderer/hooks/useConversationList'

/** 第二层分组的行：可折叠，展开后列出该分组下的对话（第三层） */
interface Props {
  /** 分组节点 */
  group: GroupNode
  /** 新建对话 */
  onAddConversation: (groupId: string | null) => Promise<void>
  /** 切换展开状态 */
  onToggleOpen: (id: string, open: boolean) => Promise<void>
}

export default function SidebarConversationGroup({
  group,
  onAddConversation,
  onToggleOpen
}: Props): React.JSX.Element {
  return (
    <SidebarMenuItem>
      <Collapsible open={group.isOpen} onOpenChange={(open) => void onToggleOpen(group.key, open)}>
        {/* 展开状态图标 */}
        <CollapsibleTrigger title={group.title} render={<SidebarMenuButton />}>
          {group.isOpen ? <FolderOpen /> : <Folder />}
          <span className="truncate">{group.title}</span>
        </CollapsibleTrigger>
        {/* 对话列表 */}
        <CollapsibleContent>
          {group.conversations.length > 0 && (
            <SidebarMenuSub className="mr-0 pr-0">
              {group.conversations.map((conversation) => (
                <SidebarMenuSubItem className=" pr-0" key={conversation.id}>
                  <SidebarConversationItem conversation={conversation} />
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          )}
        </CollapsibleContent>
      </Collapsible>
      {/* 扩展按钮 */}
      {!group.isDefault && (
        <SidebarMenuAction
          title="在此分组新建对话"
          onClick={() => void onAddConversation(group.groupId)}
        >
          <Plus />
        </SidebarMenuAction>
      )}
    </SidebarMenuItem>
  )
}
