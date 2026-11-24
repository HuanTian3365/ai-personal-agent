import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/** 取当前时间 */
export const getCurrentTimeTool = tool(async (): Promise<string> => new Date().toISOString(), {
  name: 'get_current_time',
  description:
    '取当前本地时间（ISO 8601 字符串）。需要知道现在几点、今天几号时用它，不要凭记忆猜。',
  schema: z.object({})
})
