import { initChatModel } from 'langchain'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { tools } from '../tools'

/** 基础模型,只能对话,单例 */
let baseModel: BaseChatModel | null = null

/** 获取基础模型 */
export async function getBaseModel(): Promise<BaseChatModel> {
  if (baseModel !== null) return baseModel

  const apiKey = process.env.API_KEY
  const baseUrl = process.env.API_URL
  const modelId = process.env.API_MODEL

  if (!apiKey) throw new Error('缺少 API_KEY：请在 ~/.huanyu/config.json 中配置')
  if (!baseUrl) throw new Error('缺少 API_URL：请在 ~/.huanyu/config.json 中配置')
  if (!modelId) throw new Error('缺少 API_MODEL：请在 ~/.huanyu/config.json 中配置')

  baseModel = await initChatModel(modelId, {
    modelProvider: 'openai',
    baseUrl,
    apiKey
  })
  return baseModel
}

/**
 * BaseChatModel['bindTools'] 是方法本身的类型（(tools) => Runnable）
 * NonNullable  → 剥 undefined，满足 ReturnType 约束
 * ReturnType<...> 是调用它之后的返回类型（Runnable）
 */
type BoundChatModel = ReturnType<NonNullable<BaseChatModel['bindTools']>>
/** 工具模型,基础模型添加工具,单例 */
let toolModel: BoundChatModel | null = null

/** 获取工具模型 */
export async function getModelWithTools(): Promise<BoundChatModel> {
  if (toolModel !== null) return toolModel

  const base = await getBaseModel()
  const bound = base.bindTools?.(tools)
  if (bound === undefined) throw new Error('当前模型不支持工具调用：bindTools 不可用')

  toolModel = bound
  return toolModel
}
