import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getModel } from '@core/llm/model'
import { parseContent } from '@core/utils/parseStream'
// 只依赖 main 的仓储层，不走 `@main`（门面）：门面会拉起 mount → ipc/*，
// 而 ipc 又反过来 import core/export，绕回去就是循环依赖。
import { getRepository } from '@main/database'
import { AgentEvent } from '@shared/types/newEvent'

/** 标题最长字数 */
const MAX_TITLE_LENGTH = 40

/**
 * 生成对话标题
 *
 * 根据用户输入内容反推对话标题
 */
export async function getConversationTitle(
  isFirstTurn: boolean,
  conversationId: string,
  message: HumanMessage,
  emit: (event: AgentEvent) => void
): Promise<void> {
  // 非首次对话,不处理
  if (!isFirstTurn) return
  // 首次对话,尝试生成标题
  try {
    const model = await getModel()
    const res = await model.invoke([
      message,
      new SystemMessage(
        '为上面用户发送的内容起一个简短标题。' +
          '不超过 15 个字，概括核心意思即可。' +
          '只输出标题本身：不要引号、书名号、前缀（如“标题：”）、标点、换行或任何解释。'
      )
    ])

    const title = parseContent(res.content).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH)
    if (title.length === 0) return

    await getRepository().updateConversationTitle(conversationId, title)
    emit({ type: 'title', conversationId, title })
  } catch {
    // 失败静默
  }
}
