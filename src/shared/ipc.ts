/**
 * IPC 通道名 | main和renderer约定用哪些字符串
 *
 * 按域分块: agent 对话执行 | workspace/group/conversation 侧栏三层 | message 对话正文 | expand 杂项
 */
export const IPC = {
  /** 测试用 */
  ping: 'ping',
  /** 对话执行 */
  agent: {
    /** 整轮结束才resolve */
    send: 'agent:send',
    /** 中断正在生成的一轮 */
    abort: 'agent:abort',
    /** main -> renderer */
    event: 'agent:event',
    /** 取进行中那一轮的快照 */
    snapshot: 'agent:snapshot',
    /** 把排队里的一条立刻推进当前轮 */
    insert: 'agent:insert',
    /** 取该对话的排队内容 */
    queue: 'agent:queue',
    /** 改排队里的一条 | 改文案或删除 */
    queueUpdate: 'agent:queue:update'
  },
  /** 侧栏第一层 */
  workspace: {
    list: 'workspace:list'
  },
  /** 侧栏第二层 */
  group: {
    list: 'group:list',
    create: 'group:create',
    expand: 'group:expand',
    delete: 'group:delete',
    rename: 'group:rename',
    folder: 'group:folder'
  },
  /** 侧栏第三层 */
  conversation: {
    list: 'conversation:list',
    create: 'conversation:create',
    info: 'conversation:info'
  },
  /** 对话正文 */
  message: {
    /** 值挂在conversation下 因为消息属于对话 */
    list: 'conversation:message:list'
  },
  /** 杂项 | 不属于对话本身的能力 */
  expand: {
    /** 选一个目录 */
    pickDirectory: 'expand:pickDirectory',
    /** 校验路径是否存在 返回boolean */
    validPath: 'expand:validPath'
  }
} as const
