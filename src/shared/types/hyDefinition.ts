import type { CheckpointMetadata } from '@langchain/langgraph-checkpoint'
import { QueueItem } from './agentEvent'

/**
 * 底层扩展
 * 这里主要是定义数据库那边的相关字段
 */

/** ====================  hy_conversation 会话表  ==================== */
/**
 * 会话列表扩展字段
 */
export interface HyConversationExpand {
  /** 发送消息相关的扩展信息 */
  sendMessage?: { queue?: QueueItem[] }
}

/** ====================  hy_message 消息表  ==================== */
/**
 * 消息表扩展字段
 * 目前转换层专用,不参与业务语义
 */
export interface HyMessageExpand {
  /** 'message' 普通消息 | 'compact' 压缩起点(预留) */
  status?: 'message' | 'compact'
}

/**
 * 消息表消息自定义字段
 * 业务自定义字段,加字段只改这一个接口
 */
export interface HyMessageCustom {
  /** 用户中断了这条回复 */
  aborted?: boolean
  /** 这条是插入的消息(生成中追加) */
  insertFlag?: boolean
  /** tips 不参与界面渲染 只发给模型 */
  tipsIsHide?: boolean
}

/**
 * hy_message表其余字段
 * - 这里把可能会用到的字段放在这里
 */
export interface HyMessageField {
  /** 消息主键 本地生成 */
  id: string
  /** 所属对话 id 即 LangGraph 的 thread_id */
  conversationId: string
  /** 会话内序号 从1起 */
  seq: number
  /** LangChain 序列化外壳 { lc, type, id } */
  sourceData: Record<string, unknown>
  /** LangGraph 的 CheckpointMetadata { source, step, parents } */
  metadata: CheckpointMetadata
  /** 底层扩展 */
  expand: HyMessageExpand
  /** 写入时间 Unix 毫秒 */
  createdAt: number
}

// 声明合并,让所有LangChain消息都带上这两个属性
// 这样所有消息都带上这两个属性,拥有更多操作空间
declare module '@langchain/core/messages' {
  interface BaseMessage {
    HyMessageField?: HyMessageField
    HyMessageCustom?: HyMessageCustom
  }
}
