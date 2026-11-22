import { createHashRouter } from 'react-router'
import App from '@renderer/App'
import RootLayout from '@renderer/layouts'
import ChatIndex from '@renderer/pages/Chat'
import SettingIndex from '@renderer/pages/Setting'
import WelcomeIndex from '@renderer/pages/Welcome'

const routers = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        Component: RootLayout,
        children: [
          { index: true, element: <WelcomeIndex /> },
          { path: 'chat/:conversationId', element: <ChatIndex /> },
          { path: 'setting', element: <SettingIndex /> }
        ]
      }
    ]
  }
])

export default routers
