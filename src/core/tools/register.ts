import { DynamicStructuredTool } from '@langchain/core/tools'
import { TOOL_INTENT_KEY } from '@shared/types/constant'
import { z } from 'zod'

/**
 * 工具注册器|给所有工具统一注入横切字段
 *
 * 工具实现只管自己的参数与逻辑 横切的东西都在这一层
 * 现在只注入一个intent:agent自己说明[为什么调这个工具]
 */

/** 意图字段|可选,不填也能正常调用 */
const INTENT = z
  .string()
  .optional()
  .describe('一句话说明你为什么要调用这个工具、想达成什么。不要复述工具名，说原因')

/** 给工具注入intent参数|返回新工具,原工具不动 */
function withIntent<T extends DynamicStructuredTool>(t: T): T {
  // 把原来的参数拿过来再追加一个新参数
  const schema = (t.schema as z.ZodObject<z.ZodRawShape>).extend({ [TOOL_INTENT_KEY]: INTENT })
  return new DynamicStructuredTool({
    name: t.name,
    description: t.description,
    schema,
    func: t.func as never
  }) as unknown as T
}

/** 注册一批工具|统一注入横切字段 */
export function registerTools<T extends DynamicStructuredTool>(list: T[]): T[] {
  return list.map((t) => withIntent(t))
}
