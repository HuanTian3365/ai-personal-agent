import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import api from './mount'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    // 自定义 API 单独挂在一个命名空间下，避免和 'electron' 混在一起。
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    // 常见原因：同一个 key 被重复暴露（例如热更新时 preload 被执行了两次）。
    console.error(error)
  }
} else {
  // @ts-ignore （类型声明写在 src/preload/index.d.ts 里）
  window.electron = electronAPI
  // @ts-ignore （类型声明写在 src/preload/index.d.ts 里）
  window.api = api
}
