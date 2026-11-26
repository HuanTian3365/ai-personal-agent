'use client'
import * as React from 'react'
import { Sidebar as SidebarShell, SidebarRail } from '@renderer/components/ui/sidebar'
import SidebarFooter from './SidebarFooter'
import SidebarHeader from './SidebarHeader'
import Workspace from './Conversation/Workspace'
import { useConversationList } from '@renderer/hooks/useConversationList'
import type { HYWorkspace } from '@shared/types/hyEntity'
import CreateGroupDialog from './Conversation/GroupCreate'

export default function Sidebar(): React.JSX.Element {
  const { sections, isLoading, error, addConversation, createGroup, toggleGroupOpen, groupRename } =
    useConversationList()
  const [createTarget, setCreateTarget] = React.useState<HYWorkspace | null>(null)
  return (
    <SidebarShell>
      <SidebarHeader onAddConversation={addConversation} isLoading={isLoading} />
      <Workspace
        sections={sections}
        isLoading={isLoading}
        error={error}
        onAddConversation={addConversation}
        onAddGroup={setCreateTarget}
        onToggleOpen={toggleGroupOpen}
        onGroupRename={groupRename}
      />
      <CreateGroupDialog
        open={createTarget !== null}
        workspaceTitle={createTarget?.title ?? ''}
        onOpenChange={(open) => {
          if (!open) setCreateTarget(null)
        }}
        onSubmit={(data) => {
          return createGroup({ ...data, workspaceId: createTarget?.id })
        }}
      />
      <SidebarFooter />
      <SidebarRail />
    </SidebarShell>
  )
}
