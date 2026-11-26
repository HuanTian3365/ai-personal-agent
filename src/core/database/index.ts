import type { TitleStore } from './types'

/** 标题存储 | 由main在initCore时注入 同lib/log.ts的setLogDir */
let titleStore: TitleStore | null = null

/** 注入实现 */
export function setTitleStore(store: TitleStore): void {
  titleStore = store
}

/** 取实现 | 没注入就抛 避免拿到半个系统 */
export function getTitleStore(): TitleStore {
  if (titleStore === null) throw new Error('标题存储尚未注入: 请先在main中调用initCore()')
  return titleStore
}

/** 只置空引用 | 连接的关闭归main的closeDatabase() 这里不能碰 */
export function clearTitleStore(): void {
  titleStore = null
}
