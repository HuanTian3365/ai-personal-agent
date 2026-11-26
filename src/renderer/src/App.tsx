import { Outlet } from 'react-router'
import { ThemeProvider } from './components/ThemeProvider'
import { Toaster } from './components/ui/sonner'

export default function App(): React.JSX.Element {
  return (
    <div className="w-screen h-screen overflow-hidden">
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Outlet />
        <Toaster /> {/* 根节点挂一次 全局共用 */}
      </ThemeProvider>
    </div>
  )
}
