'use client'
import * as React from 'react'
import { Sidebar as SidebarShell, SidebarRail } from '@renderer/components/ui/sidebar'
import SidebarFooter from './SidebarFooter'
import SidebarHeader from './SidebarHeader'
import SidebarConversationList from './SidebarConversationList'
import { useConversationList } from '@renderer/hooks/useConversationList'
import { Workspace } from '@shared/types/conversationDefinition'
import SidebarCreateGroupDialog from './SidebarCreateGroupDialog'

export default function Sidebar(): React.JSX.Element {
  const { sections, isLoading, error, addConversation, createGroup, toggleGroupOpen } =
    useConversationList()
  const [createTarget, setCreateTarget] = React.useState<Workspace | null>(null)
  return (
    <SidebarShell>
      <SidebarHeader onAddConversation={addConversation} isLoading={isLoading} />
      <SidebarConversationList
        sections={sections}
        isLoading={isLoading}
        error={error}
        onAddConversation={addConversation}
        onAddGroup={setCreateTarget}
        onToggleOpen={toggleGroupOpen}
      />
      <SidebarCreateGroupDialog
        open={createTarget !== null}
        workspaceTitle={createTarget?.title ?? ''}
        onOpenChange={(open) => {
          if (!open) setCreateTarget(null)
        }}
        onSubmit={async (input) => {
          if (createTarget === null) return false
          return createGroup({ ...input, workspaceId: createTarget.id })
        }}
      />
      <SidebarFooter />
      <SidebarRail />
    </SidebarShell>
  )
}
