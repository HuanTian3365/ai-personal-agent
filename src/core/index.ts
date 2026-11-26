import type BetterSqlite3 from 'better-sqlite3'
import { clearTitleStore, setTitleStore } from './database'
import type { TitleStore } from './database/types'
import { closeCheckpointStore, openCheckpointStore } from './graph/checkpoint'
import { setLogDir } from './lib/log'

/** core 需要的运行期依赖，全部由 main 注入（core 不依赖 Electron，拿不到 app.getPath） */
export interface CoreDeps {
  /** 数据库连接 */
  database: BetterSqlite3.Database
  /** 存储层能力 | core只管声明自己要用什么 实现由main给 */
  titleStore: TitleStore
  /** 调试日志目录 */
  logDir: string
}

/** 初始化 core */
export function initCore(deps: CoreDeps): void {
  // 日志落盘位置
  setLogDir(deps.logDir)
  // 存储能力
  setTitleStore(deps.titleStore)
  // checkpoint初始化
  openCheckpointStore(deps.database)
}

/** 释放 core 持有的引用 */
export function disposeCore(): void {
  clearTitleStore()
  closeCheckpointStore()
}
