import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { editTool, globTool, grepTool, readTool, writeTool } from './file'
import { pwshTool } from './shell'

/**
 * Agent 能调用的工具。
 *
 * 这一层必须是纯 Node：core 不依赖 Electron，工具也一样。
 * 工具**出错不抛异常**：抛出去会让整轮对话断掉，而模型其实有办法自己纠正（换个路径、换个参数）。
 * 失败时返回 `toolError(...)`——即 error 状态的 ToolMessage：既保留原始错误文案，
 * 又让数据库里能看出这次调用失败了（直接返回字符串会被记成 success）。
 */

/** 取当前时间 */
export const getCurrentTimeTool = tool(async (): Promise<string> => new Date().toISOString(), {
  name: 'get_current_time',
  description:
    '取当前本地时间（ISO 8601 字符串）。需要知道现在几点、今天几号时用它，不要凭记忆猜。',
  schema: z.object({})
})

/** 交给模型和图使用的工具清单 */
export const tools = [
  getCurrentTimeTool,
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  pwshTool
]
