/**
 * 排队项 | 推给渲染层的样子
 *
 * 比库里多一个claimed 它不落库: 落库后重启没人回滚 那条排队项就成了幽灵
 * 库里的形状见 hyExpand.ts
 */

import type { HYEQueueItem } from './hyExpand'

export interface HYEQueueItemView extends HYEQueueItem {
  /** 已被本轮领走 | 渲染层靠它判断这条插队还等不等得到位置 */
  claimed?: boolean
}
