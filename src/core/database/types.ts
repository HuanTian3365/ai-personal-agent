/**
 * core要存储层做什么
 *
 * 只有这一个store | 新能力往Store加方法 不新增xxxStore 不动注入点
 * 方法只登记core真正调用的 多了是抄表 | 实现由main在initCore时注入
 */

/** 改会话标题 | 标题生成后由core回写 */
export interface Store {
  updateConversationTitle(id: string, title: string): Promise<void>
}
