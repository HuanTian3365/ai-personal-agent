import './assets/main.css'

// TODO(优化): 2026-11-22 理逻辑期间临时关掉 StrictMode，dev 下 effect 只跑一次；
// 理完把这行 import 与下面 render 里的 <StrictMode> 包裹一起恢复。
// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import routers from './router/routers'

// 和普通 React 项目完全一样的挂载方式。
// StrictMode 在开发环境会把组件渲染两次、effect 也会执行两次（用于暴露副作用问题）。
// 在 Electron 里要留意这一点：如果将来在 effect 里「注册 IPC 监听」，
// 必须返回清理函数，否则开发环境会重复监听、导致一次操作触发两次。
createRoot(document.getElementById('root')!).render(<RouterProvider router={routers} />)
