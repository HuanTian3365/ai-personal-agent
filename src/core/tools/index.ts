import { editTool, globTool, grepTool, readTool, writeTool } from './impl/file'
import { pwshTool } from './impl/shell'
import { getCurrentTimeTool } from './impl/time'
import { registerTools } from './register'

/** 交给模型和图使用的工具清单 */
export const tools = registerTools([
  getCurrentTimeTool,
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  pwshTool
])
