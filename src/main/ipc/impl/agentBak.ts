import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc'
import type { QueueItem, SendResult } from '../../../shared/types/agents'
import type { ContentBlock } from '../../../shared/types/messages'
import { sendMessage } from '../../../core/export'
import type { InsertInput } from '../../../core/export'
import { MessageEventSend } from '@shared/types/newMessageService'
import { AgentEvent } from '@shared/types/newEvent'

/**
 * 正在运行的对话
 *
 * key: 会话ID
 *
 * value: 停止信号
 */
const running = new Map<string, AbortController>()

/** 一个对话的待发输入 */
interface Inbox {
  /** 等本轮结束再发（界面上的排队条就是它） */
  queued: QueueItem[]
  /** 已经点了「插入」，等模型在下一个 step 边界取走 */
  inserted: QueueItem[]
}

/**
 * 排队内容，只活在进程里：应用一重启就没了。
 * 架构上它就是 main 侧的 Inbox——放这儿而不是渲染层，是为了切走对话、开第二个窗口时都还在。
 */
const inboxes = new Map<string, Inbox>()

/** 取（或新建）某个对话的排队 */
function inboxOf(conversationId: string): Inbox {
  let box = inboxes.get(conversationId)
  if (box === undefined) {
    box = { queued: [], inserted: [] }
    inboxes.set(conversationId, box)
  }
  return box
}

/**
 * 正在生成中的一轮 → 已生成的内容
 *
 * assistant-start 建
 *
 * assistant-end 删
 */
const live = new Map<
  string,
  {
    conversationId: string
    blocks: ContentBlock[]
  }
>()

/** 把一段 delta 追加到最后一个 text block 上 */
function appendDeltaText(blocks: ContentBlock[], text: string): ContentBlock[] {
  const last = blocks[blocks.length - 1]
  if (last !== undefined && last.type === 'text') {
    return [...blocks.slice(0, -1), { type: 'text', text: last.text + text }]
  }
  return [...blocks, { type: 'text', text }]
}

/** 把一段思考追加到开头的 reasoning block 上（思考永远排在正文上面） */
function appendReasoningText(blocks: ContentBlock[], text: string): ContentBlock[] {
  const first = blocks[0]
  if (first !== undefined && first.type === 'reasoning') {
    return [{ type: 'reasoning', text: first.text + text }, ...blocks.slice(1)]
  }
  return [{ type: 'reasoning', text }, ...blocks]
}

/**
 * 把 core 推出来的事件转发给所有渲染进程。
 * 用 getAllWindows() 而不是把窗口实例传进 mount()，
 * 因为 main/index.ts 里 mount(ipcMain) 在 createWindow() 之前调用，那时还没有窗口。
 */
function broadcast(event: AgentEvent): void {
  // switch (event.type) {
  //   case 'turn-start':
  //     console.log('Ciallooooo')
  //   case 'assistant-start':
  //     live.set(event.conversationId, {
  //       conversationId: event.conversationId,
  //       blocks: []
  //     })
  //     break
  //   case 'assistant-delta': {
  //     // 一个会话同时只有一轮：running 挡住了并发，这里不用再靠消息 id 区分
  //     const current = live.get(event.conversationId)
  //     if (current !== undefined) current.blocks = appendDeltaText(current.blocks, event.text)
  //     break
  //   }
  //   case 'reasoning-delta': {
  //     const current = live.get(event.conversationId)
  //     if (current !== undefined) current.blocks = appendReasoningText(current.blocks, event.text)
  //     break
  //   }
  //   case 'tool-start': {
  //     // 工具调用也记进快照：切回对话时占位气泡要能重建出同样的一块
  //     const current = live.get(event.conversationId)
  //     if (current !== undefined) {
  //       current.blocks = [
  //         ...current.blocks,
  //         {
  //           type: 'tool',
  //           id: event.id,
  //           name: event.name,
  //           args: event.args,
  //           result: null,
  //           status: 'running'
  //         }
  //       ]
  //     }
  //     break
  //   }
  //   case 'tool-end': {
  //     const current = live.get(event.conversationId)
  //     if (current !== undefined) {
  //       current.blocks = current.blocks.map((block) =>
  //         block.type === 'tool' && block.id === event.id
  //           ? { ...block, result: event.result, status: event.status }
  //           : block
  //       )
  //     }
  //     break
  //   }
  //   case 'assistant-end':
  //     live.delete(event.conversationId)
  //     break
  //   default:
  //     break
  // }

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.agent.event, event)
  }
}

/** 排队变化推给界面 */
function broadcastQueue(conversationId: string): void {
  broadcast({
    type: 'queue',
    conversationId,
    queue: [...inboxOf(conversationId).queued]
  })
}

/**
 * 图在 step 边界调这个，把这一刻的插入消息取走。
 * 取走即从队里删掉：同一条不能喂给模型两次。
 */
function takeInserts(conversationId: string): InsertInput[] {
  const box = inboxes.get(conversationId)
  if (box === undefined || box.inserted.length === 0) return []
  const items = box.inserted
  box.inserted = []
  return items.map((item) => ({ id: item.id, text: item.text }))
}

// /**
//  * 一个对话的发送循环：先发首条，本轮结束后接着发排队里的下一条。
//  *
//  * 优先发 `inserted` 里剩下的——那是「插入」时界面已经显示出来、但本轮没跑到那一步的消息，
//  * 不能丢。它此时已经是新一轮的发起（不再算插入），id 与界面上那条一致，前端按 id 去重。
//  */
// async function runConversation(
//   conversationId: string,
//   first: QueueItem,
//   controller: AbortController
// ): Promise<void> {
//   const box = inboxOf(conversationId)
//   let next: QueueItem | undefined = first

//   while (next !== undefined) {
//     await sendMessage({}
//       conversationId,
//       next.text,
//       broadcast,
//       controller.signal,
//       () => takeInserts(conversationId),
//       next.id
//     )
//     if (controller.signal.aborted) return
//     next = box.inserted.shift() ?? box.queued.shift()
//     broadcastQueue(conversationId)
//   }
// }

export default function registerAgentIpc(ipcMain: Electron.IpcMain): void {
  /**
   * 发送对话。
   * 正在生成时不再报错，而是进排队，等本轮结束自动发。
   */
  ipcMain.handle(
    IPC.agent.send,
    async (_event, conversationId: unknown, message: MessageEventSend): Promise<SendResult> => {
      // 参数校验
      if (typeof conversationId !== 'string' || conversationId.trim() === '') {
        throw new Error('agent.send: conversationId 必须是非空字符串')
      }
      if (typeof message.content !== 'string' || message.content.trim() === '') {
        throw new Error('agent.send: text 必须是非空字符串')
      }

      // // 队列判断
      // if (running.has(conversationId)) {
      //   const box = inboxOf(conversationId)
      //   box.queued.push({ id: randomUUID(), text })
      //   broadcastQueue(conversationId)
      //   return { status: 'queued', queue: [...box.queued] }
      // }

      // 设置中断信号
      const controller = new AbortController()
      running.set(conversationId, controller)

      console.log(`src/main/ipc/impl/agent.ts:`, conversationId, message)
      await sendMessage({
        conversationId,
        message,
        messageId: randomUUID(),
        emit: broadcast,
        signal: controller.signal,
        takeInserts: () => takeInserts(conversationId)
      })

      return { status: 'sent' }
      // try {
      //   await runConversation(conversationId, { id: randomUUID(), text }, controller)
      //   return { status: 'sent' }
      // } finally {
      //   // 停下后剩下的排队不再有意义：留着会在下次发送时突然冒出来
      //   const box = inboxes.get(conversationId)
      //   if (box !== undefined) {
      //     box.queued = []
      //     box.inserted = []
      //   }
      //   broadcastQueue(conversationId)
      //   running.delete(conversationId)
      // }
    }
  )

  /** 中断对话 */
  ipcMain.handle(IPC.agent.abort, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string') {
      throw new Error('agent.abort: conversationId 必须是字符串')
    }
    running.get(conversationId)?.abort()
  })

  /** 快照 */
  ipcMain.handle(IPC.agent.snapshot, (_event, conversationId: unknown) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('agent.snapshot: conversationId 必须是非空字符串')
    }
    // 流已经结束就不给快照：那一轮已经落库，客户端重读历史就能拿到，
    // 再补一条占位会变成永远填不上的空气泡
    return running.has(conversationId) ? (live.get(conversationId) ?? null) : null
  })

  /**
   * 把排队里的一条插入当前轮。
   *
   * 两条动作：从排队挪进 inserted，以及立刻把这条消息推给界面——视觉上它已经进了对话，
   * 但模型要等当前这一轮的下一个 step 边界才收到（正在吐的那段文字不会被打断）。
   */
  ipcMain.handle(IPC.agent.insert, (_event, conversationId: unknown, itemId: unknown) => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('agent.insert: conversationId 必须是非空字符串')
    }
    if (typeof itemId !== 'string' || itemId.trim() === '') {
      throw new Error('agent.insert: itemId 必须是非空字符串')
    }

    const box = inboxes.get(conversationId)
    if (box === undefined) return
    const at = box.queued.findIndex((item) => item.id === itemId)
    if (at === -1) return

    const [item] = box.queued.splice(at, 1)
    if (item === undefined) return
    box.inserted.push(item)

    broadcast({
      type: 'user-insert',
      conversationId,
      message: {
        id: item.id,
        role: 'user',
        content: [{ type: 'text', text: item.text }],
        status: 'done',
        metadata: null,
        insertFlag: true
      }
    })
    broadcastQueue(conversationId)
  })

  /** 取排队内容（切回对话时拉一次） */
  ipcMain.handle(IPC.agent.queue, (_event, conversationId: unknown): QueueItem[] => {
    if (typeof conversationId !== 'string' || conversationId.trim() === '') {
      throw new Error('agent.queue: conversationId 必须是非空字符串')
    }
    return [...inboxOf(conversationId).queued]
  })
}
