import type { CheckpointMetadata } from '@langchain/langgraph-checkpoint'

/**
 * LangChain 消息的扩展属性 | 声明合并到 BaseMessage
 *
 * 两个属性都挂在消息对象上 不写进序列化内容:
 * - hyField 是数据库行级字段 由转换层读写
 * - hyCustom 是业务自定义字段 由业务层读写 存进 kwargs.hy_custom
 *
 * 注意 | 流式阶段的 chunk 还没有行级信息 hyField 可能不存在
 * 所以类型上是可选 业务层用 msg.hyField?. 访问
 */

/** 底层扩展 | 转换层专用 不参与业务语义 */
export interface HyExpand {
  /** 'message' 普通消息 | 'compact' 压缩起点(预留) */
  status?: 'message' | 'compact'
}

/** 业务自定义字段 | 加字段只改这一个接口 */
export interface HyCustom {
  /** 用户中断了这条回复 */
  aborted?: boolean
  /** 这条是插入的消息(生成中追加) */
  insertFlag?: boolean
}

/** 数据库行级字段 | 挂在 message.hyField */
export interface HyField {
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
  expand: HyExpand
  /** 写入时间 Unix 毫秒 */
  createdAt: number
}

// 声明合并 | 让所有 LangChain 消息都带上这两个属性
declare module '@langchain/core/messages' {
  interface BaseMessage {
    hyField?: HyField
    hyCustom?: HyCustom
  }
}
