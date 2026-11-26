import * as React from 'react'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import Group from './Group'
import WorkspaceHeader from './WorkspaceHeader'
import { CircleX, Loader } from 'lucide-react'
import type { WorkspaceSection } from '@renderer/hooks/useConversationList'
import type { HYWorkspace } from '@shared/types/hyEntity'
import type { GroupDeleteFun, GroupRenameFun, ToAsync } from '@shared/types/ipcContract'

/**
 * 侧栏内容区 三层渲染: 工作区(SidebarGroup区块) -> 分组(Group) -> 对话(Item)
 * 领域是整棵树 不是单指会话 | 所以内部成员各用本级名字 不再共享Conversation前缀
 */
interface Props {
  /** 每个工作区一个区块 */
  sections: WorkspaceSection[]
  isLoading: boolean
  error: string | null
  onAddConversation: (groupId: string | null) => Promise<void>
  onAddGroup: (workspace: HYWorkspace) => void
  onToggleOpen: (id: string, open: boolean) => Promise<void>
  onGroupRename: ToAsync<GroupRenameFun>
  onGroupDelete: ToAsync<GroupDeleteFun>
}

export default function Workspace({
  sections,
  isLoading,
  error,
  onAddConversation,
  onAddGroup,
  onToggleOpen,
  onGroupRename,
  onGroupDelete
}: Props): React.JSX.Element {
  return (
    <SidebarContent>
      {/* 加载状态 */}
      {isLoading && (
        <div className="px-2">
          <hr className="border-t border-muted-foreground my-4" />
          <div className="flex flex-row gap-2 items-center">
            <Loader size={12} />
            <p className=" text-xs text-muted-foreground">加载对话中...</p>
          </div>
        </div>
      )}
      {/* 错误信息 */}
      {error !== null && (
        <div className="px-2">
          <hr className="border-t border-muted-foreground my-4" />
          <div className="flex flex-row gap-2 items-center text-destructive">
            <CircleX size={12} />
            <p className=" text-xs text-destructive">加载失败: {error}</p>
          </div>
        </div>
      )}
      {/* 会话列表：第一层工作区 */}
      {sections.map((section) => (
        <SidebarGroup className="py-0" key={section.workspace.id}>
          <WorkspaceHeader
            title={section.workspace.title}
            onAddGroup={() => onAddGroup(section.workspace)}
          />
          <SidebarGroupContent>
            <SidebarMenu>
              {section.groups.length === 0 && (
                <SidebarMenuItem>
                  <span className="block px-2 py-1 text-xs text-muted-foreground">暂无分组</span>
                </SidebarMenuItem>
              )}
              {section.groups.map((group) => (
                <Group
                  key={group.key}
                  group={group}
                  onAddConversation={onAddConversation}
                  onToggleOpen={onToggleOpen}
                  onGroupRename={onGroupRename}
                  onGroupDelete={onGroupDelete}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}
