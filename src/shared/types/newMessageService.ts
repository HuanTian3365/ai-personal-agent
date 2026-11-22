/**
 * 此处存放消息处理逻辑
 */

import { MUser } from './newMessages'

export type MessageEventSend = Omit<MUser, 'type' | 'id'>
