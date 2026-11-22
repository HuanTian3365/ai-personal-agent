/**
 * 配置层入口：注册各配置文件的加载，并把配置相关的符号集中在这里对外暴露。
 *
 * 具体实现都在 `file/` 下，一个配置文件一个实现（现在只有 `file/config.ts`）。
 * 以后新增配置就走同一套：在 `file/` 下写一个 load 函数，回来在 `initConfig` 里加一行。
 *
 * 和 `ipc/index.ts` 一个路子：这里只做编排，不写读文件的细节。
 */
import { loadConfig } from './file/config'

/** 配置文件路径：`~/.huanyu/config.json`，开发时 `~/.huanyu-dev/config.json` */
export { CONFIG_PATH } from './file/config'

/**
 * 按顺序加载所有配置。必须在 `ensureDirs()` 之后调用——要保证用户数据目录已存在。
 *
 * 各实现自己兜异常（只警告不抛），所以这里不额外包 try：一个配置文件坏掉
 * 不该连累其他配置，也不该让应用起不来。
 */
export async function initConfig(): Promise<void> {
  await loadConfig()
}
