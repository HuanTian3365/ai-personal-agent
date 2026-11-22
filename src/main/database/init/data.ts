// 初始化数据

/** 默认工作区 */
export const DEFAULT_WORKSPACE: ReadonlyArray<
  readonly [id: string, title: string, sortIndex: number]
> = [
  ['workspace', '工作区', 1],
  ['ciallo', 'Ciallo', 2]
]

/**
 * 缺省工作区：新建分组、以及未分组对话，都落在它下面。
 * 取列表第一条（与 sort_index 顺序一致）——不要在实现里写死字符串，改了 DEFAULT_WORKSPACE 就会对不上。
 */
export const DEFAULT_WORKSPACE_ID: string = DEFAULT_WORKSPACE[0]?.[0] ?? 'workspace'
