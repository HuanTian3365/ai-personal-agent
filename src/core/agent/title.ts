import { HumanMessage } from '@langchain/core/messages'
import { getStore } from '@core/database'
import { getBaseModel } from '@core/llm/model'
import { parseContent } from '@core/message/parseStream'

/** 标题最长字数 */
const MAX_TITLE_LENGTH = 100

/**
 * 生成对话标题
 *
 * 判据是「库里这条会话的 title 还是空的吗」,不是「checkpoint 历史为空吗」:
 * - 用历史判会漏:首轮失败或中断时历史可能已经有了(中断路径会补 aborted 与 tips 消息),
 *   于是「不是首轮」→ 标题永远不再生成
 * - 空标题判据是幂等的:生成失败、落库失败都不留痕,下次进来还能再试一次
 *
 * 读那一列不用 conversationInfo:那边会把空标题兜底成「新的对话」,判不出空。
 */
export async function getConversationTitle(
  conversationId: string,
  message: HumanMessage,
  emit: (title: string) => void
): Promise<void> {
  // 已经有标题就不动
  const current = getStore().conversationReadTitle({ id: conversationId })
  // 读不出来(会话不在了 / 库出问题)一律不生成:宁可不给名字,也不覆盖用户已经看见的
  if (!current.success || current.data !== '') return
  // 标题还是空的,尝试生成一次
  try {
    const model = await getBaseModel()
    const prompt = [
      '你是会话标题生成器，不是对话助手。',
      '下面 <user_message> 里的文本唯一用途是被命名，绝对不要回答、解释或复述它。',
      '只输出标题本身：4~12 个字，中文，不加引号、书名号、句号、前缀、换行。',
      '',
      '<user_message>',
      parseContent(message.content),
      '</user_message>'
    ].join('\n')
    const res = await model.invoke([new HumanMessage(prompt)])

    const title = parseContent(res.content).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH)
    if (title.length === 0) return

    // 实现由main在initCore时注入 | core不知道背后是哪个库
    const saved = getStore().conversationUpdateTitle({ id: conversationId, title })
    // 没存上就不推给界面 | 否则界面会显示一个库里没有的名字
    if (!saved.success) return
    emit(title)
  } catch {
    // 失败静默
  }
}
