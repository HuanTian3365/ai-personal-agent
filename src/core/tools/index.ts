import { editTool, globTool, grepTool, readTool, writeTool } from './impl/file'
import { pwshTool } from './impl/shell'
import { getCurrentTimeTool } from './impl/time'

/**
 * Agent 能调用的工具 | 这里只做注册 实现放 impl/
 *
 * 这一层必须是纯 Node: core 不依赖 Electron 工具也一样
 * 工具**出错不抛异常**: 抛出去会让整轮对话断掉 而模型其实有办法自己纠正(换个路径 换个参数)
 * 失败时返回 toolError(...) 即 error 状态的 ToolMessage | 既保留原始错误文案
 * 又让数据库里能看出这次调用失败了(直接返回字符串会被记成 success) 见 error.ts
 */

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
