/**
 * 侧边栏数据源的定义
 * 这里只存放数据定义,跟数据库存储相对应
 */

/** 工作区：对话列表的第一层，侧栏上的一个区块。可命名、可排序，不绑磁盘目录 */
export interface Workspace {
  /** 工作区标识，主键 */
  id: string
  /** 显示名，用户可改名；前端优先按 id 查 i18n 字典，查不到回落此值 */
  title: string
  /** 工作区显示顺序，升序，0 起 */
  sortIndex: number
}

/**
 * 分组：对话列表的第二层，工作区内部的一层。
 * 两种形态共用一张表：绑定目录的普通分组，与每个工作区独有一条的默认分组（收未分组对话）。
 */
export interface Group {
  /** 分组标识，主键；默认分组固定为 '<workspaceId>:ungrouped' */
  id: string
  /** 所属工作区 */
  workspaceId: string
  /** 显示名，默认取目录最后一段，可改；默认分组由 seed 显式写「未分组」 */
  title: string
  /** 目录绝对路径，已经过 fs.realpath 规范化；null 表示虚拟分组 */
  path: string | null
  /** 是否为默认分组（收未分组对话）：每个工作区至多一条，不可删、不可改名 */
  defaultFlag: boolean
  /** 展开状态 */
  openStatus: boolean
  /** 同一工作区内的分组显示顺序，升序，0 起 */
  sortIndex: number
  /** 创建时间，Unix 毫秒 */
  createdAt: number
  /** 最后修改时间，Unix 毫秒 */
  updatedAt: number
}

/** 对话（只含列表所需的元数据，正文不在此） */
export interface Conversation {
  id: string
  /** 所属工作区；冗余字段，未分组对话（groupId 为 null）靠它定级 */
  workspaceId: string
  /** 所属分组；null 表示未分组，显示在所属工作区的默认分组里 */
  groupId: string | null
  /** 标题，默认「新对话」 */
  title: string
  /** 组内手动排序，升序=显示顺序；新对话为负数（插到最前） */
  sortIndex: number
  /** 创建时间，Unix 毫秒 */
  createdAt: number
  /** 最后修改时间，Unix 毫秒 */
  updatedAt: number
}
