/**
 * core需要存储层提供什么
 *
 * core按用途声明接口 不import main的实现 | 实现由main在initCore时注入
 * 方法数等于core实际调用点数: 多了是抄表 少了是不够 | 需要新能力就再加一个窄接口
 */

/** 改会话标题 | 标题生成后由core回写 */
export interface StoreFunction {
  updateConversationTitle(id: string, title: string): Promise<void>
}
