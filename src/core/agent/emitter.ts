import type { AETurnEnd, AgentEvent } from '@shared/types/agentEvent'
import type { ContentBlock, MessageUsage } from '@shared/types/message'
import type { MessageEventSend } from '@shared/types/messageService'

interface Result {
  turnStart: (turnId: string, message: MessageEventSend) => void
  turnEnd: (turnId: string, status: AETurnEnd['status'], usage?: AETurnEnd['usage']) => void
  blockAdd: (turnId: string, block: ContentBlock) => void
  reasoningStart: (turnId: string, blockId: string) => void
  reasoningDelta: (turnId: string, blockId: string, text: string) => void
  reasoningEnd: (turnId: string, blockId: string) => void
  assistantStart: (turnId: string, blockId: string) => void
  assistantDelta: (turnId: string, blockId: string, text: string) => void
  assistantEnd: (turnId: string, blockId: string, usage?: MessageUsage) => void
  toolStart: (turnId: string, blockId: string, name: string) => void
  toolArgs: (turnId: string, blockId: string, args: Record<string, unknown> | null) => void
  toolEnd: (turnId: string, blockId: string, status: 'done' | 'error', result: string) => void
}

export default function createEmitter(
  emit: (event: AgentEvent) => void,
  conversationId: string
): Result {
  const emitter = {
    /** 启动轮 */
    turnStart: (turnId: string, message: MessageEventSend) =>
      emit({
        type: 'turn-start',
        conversationId,
        turn: {
          id: turnId,
          user: {
            ...message,
            time: Date.now(),
            id: turnId,
            type: 'user'
          },
          items: [],
          status: 'running',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 0
          },
          startTime: Date.now(),
          endTime: 0
        }
      }),
    /** 结束轮 */
    turnEnd: (turnId: string, status: AETurnEnd['status'], usage?: AETurnEnd['usage']) =>
      emit({
        type: 'turn-end',
        conversationId,
        turnId,
        status,
        usage,
        endTime: Date.now()
      }),
    /** 一次性块,应对一些特殊消息 */
    blockAdd: (turnId: string, block: ContentBlock) =>
      emit({ type: 'block-add', conversationId, turnId, block }),
    /** 开始思考 */
    reasoningStart: (turnId: string, blockId: string) =>
      emit({ type: 'reasoning-start', conversationId, turnId, blockId }),
    /** 思考中 */
    reasoningDelta: (turnId: string, blockId: string, text: string) =>
      emit({ type: 'reasoning-delta', conversationId, turnId, blockId, text }),
    /** 思考结束 */
    reasoningEnd: (turnId: string, blockId: string) =>
      emit({ type: 'reasoning-end', conversationId, turnId, blockId }),

    /** 开始回复 */
    assistantStart: (turnId: string, blockId: string) =>
      emit({ type: 'assistant-start', conversationId, turnId, blockId }),
    /** 回复中 */
    assistantDelta: (turnId: string, blockId: string, text: string) =>
      emit({ type: 'assistant-delta', conversationId, turnId, blockId, text }),
    /** 回复结束 */
    assistantEnd: (turnId: string, blockId: string, usage?: MessageUsage) =>
      emit({ type: 'assistant-end', conversationId, turnId, blockId, usage }),

    /** 开始调用工具 */
    toolStart: (turnId: string, blockId: string, name: string) =>
      emit({ type: 'tool-start', conversationId, turnId, blockId, name }),
    /** 工具传参 */
    toolArgs: (turnId: string, blockId: string, args: Record<string, unknown> | null) =>
      emit({ type: 'tool-args', conversationId, turnId, blockId, args }),
    /** 工具结果 */
    toolEnd: (turnId: string, blockId: string, status: 'done' | 'error', result: string) =>
      emit({ type: 'tool-end', conversationId, turnId, blockId, status, result })
  }

  return emitter
}
