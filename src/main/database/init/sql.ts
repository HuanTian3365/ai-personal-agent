import { DDL_CONVERSATION, DDL_GROUP, DDL_MESSAGE, DDL_META, DDL_WORKSPACE } from '@shared/table'

/**
 * 当前DDL版本
 *
 * 版本号一变，migrate 会删光业务表重建（旧数据不留）。
 * 所以只有「表结构不兼容、旧数据没救了」才升它。
 *
 * 加表、加列这类兼容变更不要升版本号：
 * - 加表：直接写进 @shared/table.ts 的 DDL，都是 IF NOT EXISTS
 * - 加列：写进那里的 DDL 管新库，老库靠 migrate 的补列逻辑（PRAGMA table_info + ALTER）
 *
 * v9 升版本的原因: 放宽 hy_group 的 CHECK | 普通分组的 path 允许为空
 * SQLite 改不了约束 只能重建表 | migrate 的现有重建就是删表重来
 */
export const SCHEMA_VERSION = 9

/**
 * 索引
 *
 * 为什么索引留在这里、不跟表一起进 shared:SQLite 的建表语句只能装列与约束,
 * 索引本来就在表外;而 core 单独跑时只建 hy_message 那一张,不需要别人的索引。
 */
const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_path ON hy_group (path); -- 同一目录只登记一次；NULL 不参与，无路径的分组可多条
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_default ON hy_group (workspace_id) WHERE default_flag = 1; -- 每个工作区最多一条默认分组
CREATE INDEX IF NOT EXISTS ix_group_workspace ON hy_group (workspace_id, sort_index); -- 按工作区取分组并按显示顺序排

CREATE INDEX IF NOT EXISTS ix_conversation_manual ON hy_conversation (group_id, sort_index); -- 手动排序视图
CREATE INDEX IF NOT EXISTS ix_conversation_recent ON hy_conversation (group_id, updated_at DESC); -- 最近更新视图
CREATE INDEX IF NOT EXISTS ix_conversation_workspace ON hy_conversation (workspace_id, updated_at DESC); -- 按工作区取对话
`

/**
 * 建表语句
 *
 * 表结构本体在 `@shared/table.ts`（core 的转换层取同一份，不再手抄），
 * 这里只负责「按什么顺序拼起来」+ 索引。
 */
export const DDL = `
${DDL_META}
${DDL_WORKSPACE}
${DDL_GROUP}
${DDL_CONVERSATION}
${DDL_MESSAGE}
${INDEXES}
`
