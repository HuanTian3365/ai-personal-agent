/**
 * 运行期数据目录的唯一事实来源。
 *
 * 数据库、日志这些**用户数据**不能放在应用目录里：打包后 `app.getAppPath()`
 * 指向 `app.asar`，是只读的。所以统一落到用户家目录下的点目录，和 `.dsh` /
 * `.codex` 一个路子——跨平台一致，用户随时能翻到、能备份。
 *
 * 开发用的目录名带 `-dev`：`pnpm dev` 折腾出来的测试对话不会写进正式记忆库。
 */
import { app } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { createDir } from '@main/lib/file'

/** 数据根目录：打包 `~/.huanyu`，开发 `~/.huanyu-dev`；`HUANYU_HOME` 可整体覆盖 */
export const HUANYU_HOME =
  process.env.HUANYU_HOME || join(app.getPath('home'), is.dev ? '.huanyu-dev' : '.huanyu')

/** 各处用到的具体路径 */
export const paths = {
  home: HUANYU_HOME,
  /** 数据库目录（业务表与 checkpoint 表共用的 workSpace.db 在这里） */
  data: join(HUANYU_HOME, 'data'),
  /** 调试日志目录（core 的 log/log.txt） */
  logs: join(HUANYU_HOME, 'logs'),
  /** 数据库文件 */
  db: join(HUANYU_HOME, 'data', 'memory.db')
}

/** 建好运行时要用的目录。已存在就跳过，重复调用无副作用 */
export async function ensureDirs(): Promise<void> {
  await Promise.all([paths.data, paths.logs].map((dir) => createDir(dir)))
}
