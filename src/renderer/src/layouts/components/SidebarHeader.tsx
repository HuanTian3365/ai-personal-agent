import {
  SidebarHeader as SidebarHeaderShell,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { Plus } from 'lucide-react'
import { NavLink } from 'react-router'
import iconUrl from '@renderer/assets/icon.png'

interface Props {
  isLoading: boolean
  onAddConversation: (groupId: string | null) => Promise<void>
}

export default function SidebarHeader({ isLoading, onAddConversation }: Props): React.JSX.Element {
  return (
    <SidebarHeaderShell className="pb-0">
      <SidebarMenu>
        {/* Logo */}
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" render={<NavLink to="/setting" end />}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <img className="size-full rounded-lg object-cover" src={iconUrl} alt="幻雨" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">幻雨</span>
              <span className="truncate text-xs">{'Ciallo～(∠・ω   < )⌒★'}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* 新的对话 */}
        <SidebarMenuItem>
          <SidebarMenuButton
            disabled={isLoading}
            className="bg-[#aaaaaa33] mt-4"
            onClick={() => void onAddConversation(null)}
          >
            <div className="w-full flex justify-center items-center gap-2">
              <Plus />
              <span className="group-data-[collapsible=icon]:hidden">新的对话</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderShell>
  )
}
