import { MessageEventSend } from '@shared/types/newMessageService'
import { ContentBlock, HumanMessage } from 'langchain'

/**
 * 构建用户信息
 *
 * 将前端传来的用户消息结构转换成LangChain的HumanMessage结构
 *
 * TODO: 当前只支持纯文本,未来接入多模态
 */
export default function buildHumanMessage(message: MessageEventSend, id: string): HumanMessage {
  const content: ContentBlock[] = []
  content.push({ type: 'text', text: message.content })
  return new HumanMessage({ id, content })
}
