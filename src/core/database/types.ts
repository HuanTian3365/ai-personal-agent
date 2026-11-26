/**
 * core要存储层做什么
 *
 * 只有这一个store | 新能力往Store加方法 不新增xxxStore 不动注入点
 * 方法只登记core真正调用的 多了是抄表 | 实现由main在initCore时注入
 * 方法名与签名一律引用ipcContract的xxxF | 数据库本身同步 返回不包Promise
 */

import type { ConversationUpdateTitleF } from '@shared/types/ipcContract'

/** 改会话标题 | 标题生成后由core回写 */
export interface Store {
  conversationUpdateTitle: ConversationUpdateTitleF
}
