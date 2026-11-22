import { SidebarInset, SidebarProvider } from '@renderer/components/ui/sidebar'
import Sidebar from './components/Sidebar'
import { Outlet } from 'react-router'

export default function RootLayout(): React.JSX.Element {
  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset className="overflow-hidden">
        <div className="w-full h-screen">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
