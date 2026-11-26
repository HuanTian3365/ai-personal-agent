/**
 * 代码层索引字段名
 *
 * 放: 从别处推不出来 只能在这一处定义的字符串
 * 不放: 能从类型推出来的 | 通道名(-> ipc.ts) | 表名与库字段(-> hyEntity.ts / hyExpand.ts)
 *
 * TOOL_INTENT_KEY: 模型调工具时多带一个意图说明 注册时注入 回显时剔掉
 */
export const TOOL_INTENT_KEY = 'intent'
