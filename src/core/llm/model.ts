import { initChatModel } from 'langchain'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { tools } from '../tools'

let model: BaseChatModel | null = null

export async function getModel(): Promise<BaseChatModel> {
  if (model !== null) return model

  const apiKey = process.env.API_KEY
  const baseUrl = process.env.API_URL
  const modelId = process.env.API_MODEL

  if (!apiKey) throw new Error('缺少 API_KEY：请在 ~/.huanyu/config.json 中配置')
  if (!baseUrl) throw new Error('缺少 API_URL：请在 ~/.huanyu/config.json 中配置')
  if (!modelId) throw new Error('缺少 API_MODEL：请在 ~/.huanyu/config.json 中配置')

  model = await initChatModel(modelId, {
    modelProvider: 'openai',
    baseUrl,
    apiKey
  })
  return model
}

let toolModel: BoundChatModel | null = null
/** bindTools 之后拿到的是 Runnable，不再是 BaseChatModel，类型从原方法上取 */
type BoundChatModel = ReturnType<NonNullable<BaseChatModel['bindTools']>>

/**
 * 绑好工具的模型，只给对话图用。
 *
 * 不给 `getModel()` 直接绑：起标题（utils/title.ts）也走那个入口，
 * 一次性的标题请求带 tools 既没用，有些 OpenAI 兼容后端还会因为多余参数报错。
 */
export async function getModelWithTools(): Promise<BoundChatModel> {
  if (toolModel !== null) return toolModel

  const base = await getModel()
  const bound = base.bindTools?.(tools)
  if (bound === undefined) throw new Error('当前模型不支持工具调用：bindTools 不可用')

  toolModel = bound
  return toolModel
}
