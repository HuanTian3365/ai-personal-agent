/**
 * hy_ 表的扩展字段 (HYE)
 *
 * 库里是json文本 读出来就是这些形状 不做字段转换
 */

import type { HYMessageField } from './hyEntity'
// 没有这行 tsc在web侧解析不到这个模块 declare module会报TS2664
// type-only的副作用导入 不产生运行时代码
import type {} from '@langchain/core/messages'

/** ====================  hy_conversation 会话表  ==================== */

/** 一条还没发出去的消息 */
export interface HYEQueueItem {
  /** 落库后同时是hy_message的主键 */
  id: string
  text: string
  /** next-turn: 等本轮结束当新一轮发 next-step: 下一个step推进当前轮 即界面上的插队 */
  target: 'next-turn' | 'next-step'
}

/** 推给渲染层的排队项 | 比库里多一个claimed 它不落库 */
export interface HYEQueueItemView extends HYEQueueItem {
  /** 已被本轮领走 | 渲染层靠它判断这条插队还等不等得到位置 */
  claimed?: boolean
}

/** hy_conversation 的expand列 */
export interface HYEConversationExpand {
  sendMessage?: { queue?: HYEQueueItem[] }
}

/** ====================  hy_message 消息表  ==================== */

/** hy_message 的expand列 | 转换层专用 不参与业务语义 */
export interface HYEMessageExpand {
  /** compact是压缩起点 预留 目前恒为message */
  status?: 'message' | 'compact'
}

/** 我们自己挂在消息上的业务字段 */
export interface HYEMessageCustom {
  /** 用户中断了这条回复 */
  aborted?: boolean
  /** 这条是生成中插进来的 */
  insertFlag?: boolean
  /** 不参与界面渲染 只发给模型 */
  tipsIsHide?: boolean
}

// 让所有LangChain消息带上行级字段与业务自定义字段 只对类型生效 不产生运行时代码
// 副作用: 任何参与编译的单元里BaseMessage都多出这两个属性
// TODO(优化): 挪进core(只有node侧用得到BaseMessage) 让shared不再依赖@langchain
// 见 docs/讨论/10.2026-11-26-类型定义与存储选型及插队残留.md §1.4
declare module '@langchain/core/messages' {
  interface BaseMessage {
    HYMessageField?: HYMessageField
    HYEMessageCustom?: HYEMessageCustom
  }
}
