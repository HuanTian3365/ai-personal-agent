/**
 * agent 域的进程内运行时台账。
 *
 * 只存「跨 IPC 调用要共享的状态」,不承担顺序编排(一轮里先做什么、再做什么归 core)。
 * 现在只有每会话一个中断信号;排队(03.TODO)与快照(02.BUG)落地后,
 * 这里扩成每会话一条运行时记录,调用方仍然只认这几个动作函数。
 */

/**
 * 正在运行的对话
 *
 * key: 会话ID
 *
 * value: 停止信号
 */
const running = new Map<string, AbortController>()

/** 开一轮:登记新的中断信号并交给 core,core 靠它响应中断 */
export function startRun(conversationId: string): AbortController {
  const controller = new AbortController()
  running.set(conversationId, controller)
  return controller
}

/** 收一轮:清掉该会话登记的信号 */
export function finishRun(conversationId: string): void {
  running.delete(conversationId)
}

/** 中断一轮:该会话没有登记就什么都不做 */
export function abortRun(conversationId: string): void {
  running.get(conversationId)?.abort()
}
