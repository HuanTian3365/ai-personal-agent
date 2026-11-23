/**
 * main -> renderer 的事件出口。
 *
 * 从 ipc/impl/agent.ts 里搬出来的:它不属于某个域的事件注册,而是所有域共用的推送通道,
 * 以后语音、记忆这些域要往渲染层推事件,也走这里,不用各自再写一遍 getAllWindows() 循环。
 */
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { AgentEvent } from '@shared/types/agentEvent'

/**
 * 把一条 agent 事件转发给所有渲染进程。
 *
 * 用 getAllWindows() 而不是把窗口实例传进来,
 * 因为 main/index.ts 里 mount(ipcMain) 在 createWindow() 之前调用,那时还没有窗口。
 */
export function broadcast(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.agent.event, event)
  }
}
