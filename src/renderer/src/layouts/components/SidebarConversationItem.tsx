import * as React from 'react'
import { SidebarMenuSubButton } from '@renderer/components/ui/sidebar'
import type { Conversation } from '@shared/types/conversation'
import { NavLink } from 'react-router'

interface Props {
  conversation: Conversation
}

export default function SidebarConversationItem({ conversation }: Props): React.JSX.Element {
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
