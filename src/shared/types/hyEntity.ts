/**
 * hy_ 表的行 -> 业务形状 (HY)
 *
 * 放: 某张表的一行 转换后代码里直接能用的样子 snake_case -> camelCase | 0/1 -> boolean
 * 不放: json列里包着的形状(-> hyExpand.ts) | 一次请求或响应的形状(-> ipcContract.ts)
 *       只在进程内活的运行态
 */

import type { HYEConversationExpand, HYEMessageExpand } from './hyExpand'

/** ====================  hy_conversation 会话表  ==================== */

/** 工作区 | 侧栏第一层 可命名可排序 不绑磁盘目录 */
export interface HYWorkspace {
  id: string
  /** 用户可改 前端先按id查i18n 查不到用这个 */
  title: string
  /** 升序 数字小的在前 | 种子值从1起 */
  sortIndex: number
}

/** 分组 | 侧栏第二层 两种形态共用一张表: 绑目录的普通分组 和每工作区独一条的默认分组 */
export interface HYGroup {
  /** 默认分组固定是 '<workspaceId>:ungrouped' */
  id: string
  workspaceId: string
  /** 默认取目录最后一段 可改 */
  title: string
  /** 已经fs.realpath过 | null表示虚拟分组 */
  path: string | null
  /** 每工作区至多一条 | 不可删不可改名 初始叫[未分组] */
  defaultFlag: boolean
  /** 是否展开 */
  openStatus: boolean
  /** 同工作区内顺序 降序 数字大的在前 | 默认分组恒0 普通分组恒>=1 */
  sortIndex: number
  /** Unix毫秒 */
  createdAt: number
  /** Unix毫秒 */
  updatedAt: number
}

/** 对话 | 只含列表要的元数据 正文不在这 */
export interface HYConversation {
  id: string
  /** 冗余字段 | 未分组的对话靠它定级 */
  workspaceId: string
  /** null表示未分组 显示在所属工作区的默认分组里 */
  groupId: string | null
  title: string
  /** 组内顺序 降序 数字大的在前 | 新建取MAX+1 恒排最前 */
  sortIndex: number
  /** 库里是json 见hyExpand.ts */
  expand: HYEConversationExpand
  /** Unix毫秒 */
  createdAt: number
  /** Unix毫秒 */
  updatedAt: number
}

/** ====================  hy_message 消息表  ==================== */

/** 一条消息的行级信息 | 挂在消息对象上 不会发给模型 */
export interface HYMessage {
  id: string
  /** 即LangGraph的thread_id */
  conversationId: string
  /** 从1起 */
  seq: number
  /** LangChain的序列化外壳 { lc, type, id } */
  sourceData: Record<string, unknown>
  /** 库里是json 原样读出来 */
  metadata: {
    /** input loop update fork */
    source: string
    step: number
    parents: Record<string, string>
  }
  /** 见hyExpand.ts */
  expand: HYEMessageExpand
  /** Unix毫秒 */
  createdAt: number
}
