/**
 * 数据层与IPC共用的返回形状
 *
 * 放: 成功与失败的判别结果 判success即可收窄到各自分支的字段
 * 不放: 实体形状(-> hyEntity.ts) | 通道出入参(-> ipcContract.ts)
 */

/**
 * 成功带data 失败带error | 两分支各自只有一个字段 判success必定收窄
 *
 * T默认undefined是给无返回值的方法用 | E默认string因为业务失败一律给一句能显示的文案
 * 不写T就用默认值 表示这个方法成功时不返回东西
 */
export type Result<T = undefined, E = string> =
  { success: true; data: T } | { success: false; error: E }
