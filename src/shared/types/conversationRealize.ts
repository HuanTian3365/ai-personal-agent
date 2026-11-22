/**
 * 侧边栏数据源的实现定义
 * 这里只存放实现定义,对侧边栏的操作参数|返回值都在这里定义
 */

/** 新建分组的输入：path 与 title 都传「原始值」，规范化与缺省由 main 侧决定 */
export interface CreateGroupInput {
  /** 所属工作区；不传则落缺省工作区 */
  workspaceId?: string
  /** 文件夹原始路径；null / 不传 = 不绑目录 */
  path?: string | null
  /** 显示名；绑了文件夹时留空取文件夹名，不绑文件夹时必填 */
  title?: string | null
}
