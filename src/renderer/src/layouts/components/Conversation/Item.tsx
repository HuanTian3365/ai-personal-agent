import * as React from 'react'
import { SidebarMenuSubButton } from '@renderer/components/ui/sidebar'
import type { HYConversation } from '@shared/types/hyEntity'
import { NavLink } from 'react-router'

interface Props {
  conversation: HYConversation
}

export default function Item({ conversation }: Props): React.JSX.Element {
  return (
    <SidebarMenuSubButton
      className="[&.active]:bg-sidebar-accent [&.active]:text-sidebar-accent-foreground"
      title={conversation.title}
      render={<NavLink to={'/chat/' + conversation.id} end />}
    >
      <span className="truncate">{conversation.title}</span>
    </SidebarMenuSubButton>
  )
}
