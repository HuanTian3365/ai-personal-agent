import { ElectronAPI } from '@electron-toolkit/preload'
import api from './mount'

export type Api = typeof api

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
