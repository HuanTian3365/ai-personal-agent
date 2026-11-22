/**
 * 配置实现：模型接入参数从用户数据目录的 `config.json` 读，注入 `process.env`。
 *
 * 这个文件归 `config/file/` 管——一个配置文件一个实现，新增配置（语音、外观之类）
 * 就往同一目录里加文件，再回 `config/index.ts` 的注册里挂一行。
 *
 * 为什么不编进代码、也不打进安装包：apiKey 跟着安装包分发出去就没法给别人传了。
 * 配置落在用户数据目录（见 ../paths.ts），装完填一次就长期有效；开发时走
 * `~/.huanyu-dev/config.json`，跟正式记忆库分开，和数据库、日志同一套路。
 *
 * core 只认 `process.env`（core/llm/model.ts），注入这一步在 main 做——core 不依赖
 * Electron、拿不到 app.getPath，路径只能从这边给。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paths } from '../paths'

/** 需要的字段，名字与 core 读的 env 变量一致（见 core/llm/model.ts） */
const KEYS = ['API_URL', 'API_KEY', 'API_MODEL'] as const
type ConfigKey = (typeof KEYS)[number]

/** 配置文件路径：`~/.huanyu/config.json`，开发时 `~/.huanyu-dev/config.json` */
export const CONFIG_PATH = join(paths.home, 'config.json')

/** 首次启动写出来的模板，字段留空等用户填 */
function template(): Record<ConfigKey, string> {
  return { API_URL: '', API_KEY: '', API_MODEL: '' }
}

/**
 * 读配置并注入 `process.env`。必须在 `ensureDirs()` 之后调用——要保证家目录已存在。
 *
 * 任何异常都只警告、不抛出：配置有问题时让她照常起来，错误落到具体那次请求上，
 * 比整个应用起不来好排查。
 */
export async function loadConfig(): Promise<void> {
  let raw: string
  try {
    raw = await readFile(CONFIG_PATH, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[config] 读取失败，本次忽略：${CONFIG_PATH}`, error)
      return
    }
    // 首次启动：留一份空模板，省得用户去猜字段名
    try {
      await writeFile(CONFIG_PATH, `${JSON.stringify(template(), null, 2)}\n`, 'utf8')
      console.warn(`[config] 已生成配置模板：${CONFIG_PATH}，填入后重启生效`)
    } catch (writeError) {
      console.warn(`[config] 模板写入失败：${CONFIG_PATH}`, writeError)
    }
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn(`[config] 不是合法 JSON，本次忽略：${CONFIG_PATH}`)
    return
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.warn(`[config] 内容不是对象，本次忽略：${CONFIG_PATH}`)
    return
  }

  const config = parsed as Record<string, unknown>
  const missing: ConfigKey[] = []
  for (const key of KEYS) {
    const value = config[key]
    if (typeof value === 'string' && value.trim() !== '') {
      process.env[key] = value.trim()
    } else if (!process.env[key]) {
      // 外部注入的环境变量也算数，两边都空才算缺
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    console.warn(`[config] ${CONFIG_PATH} 里 ${missing.join(' / ')} 还没填`)
  }
}
