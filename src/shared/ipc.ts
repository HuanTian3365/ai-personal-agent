/**
 * IPC 通道名。
 *
 * 三块并列：`agent`（对话执行）、`conversation`（列表三层：工作区 / 分组 / 对话）、`dialog`。
 * 以前这三层挂在 `session` 这个壳下面，而「会话」在本项目里统一叫 conversation，
 * 壳既没有额外语义又和通道名重复，就拍平成三个顶层域了。
 */
export const IPC = {
  /** 测试用 */
  ping: 'ping',
  /** 对话执行 */
  agent: {
    /** 发送一条消息，整轮结束才 resolve */
    send: 'agent:send',
    /** 中断正在生成的一轮 */
    abort: 'agent:abort',
    /** 事件推送（main → renderer） */
    event: 'agent:event',
    /** 取进行中那一轮的快照 */
    snapshot: 'agent:snapshot',
    /** 把排队里的一条立即插入当前轮 */
    insert: 'agent:insert',
    /** 取该对话的排队内容 */
    queue: 'agent:queue'
  },
  /** 工作区：列表第一层 */
  workspace: {
    list: 'workspace:list'
  },
  /** 分组：列表第二层 */
  group: {
    list: 'group:list',
    create: 'group:create',
    expand: 'group:expand'
  },
  /** 对话：列表第三层 */
  conversation: {
    list: 'conversation:list',
    create: 'conversation:create',
    info: 'conversation:info'
  },
  message: {
    list: 'conversation:message:list'
  },
  /** 系统对话框 */
  dialog: {
    /** 选一个目录 */
    pickDirectory: 'dialog:pickDirectory'
  }
} as const
