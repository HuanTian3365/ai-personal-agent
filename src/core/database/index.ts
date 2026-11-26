import type { StoreFunction } from './types'

/** 标题存储 | 由main在initCore时注入 同lib/log.ts的setLogDir */
let store: StoreFunction | null = null

/** 注入实现 */
export function setStore(initStore: StoreFunction): void {
  store = initStore
}

/** 取实现 | 没注入就抛 避免拿到半个系统 */
export function getStore(): StoreFunction {
  if (store === null) throw new Error('标题存储尚未注入: 请先在main中调用initCore()')
  return store
}

/** 只置空引用 | 连接的关闭归main的closeDatabase() 这里不能碰 */
export function clearStore(): void {
  store = null
}
