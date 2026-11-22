import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter as SidebarFooterShell
} from '@renderer/components/ui/sidebar'
import { Settings } from 'lucide-react'
import { NavLink } from 'react-router'

export default function SidebarFooter(): React.JSX.Element {
  return (
    <SidebarFooterShell>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<NavLink to="/setting" end />}>
            <Settings />
            <span>设置</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooterShell>
  )
}
