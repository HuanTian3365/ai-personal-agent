import { Outlet } from 'react-router'
import { ThemeProvider } from './components/ThemeProvider'

export default function App(): React.JSX.Element {
  return (
    <div className="w-screen h-screen overflow-hidden">
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Outlet />
      </ThemeProvider>
    </div>
  )
}
