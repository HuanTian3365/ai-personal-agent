/**
 * 当前DDL版本
 *
 * 版本号一变，migrate 会删光业务表重建（旧数据不留）。
 * 所以只有「表结构不兼容、旧数据没救了」才升它。
 *
 * 加表、加列这类兼容变更不要升版本号：
 * - 加表：直接写进下面的 DDL，都是 IF NOT EXISTS
 * - 加列：写进 DDL 管新库，老库靠 migrate 的补列逻辑（PRAGMA table_info + ALTER）
 */
export const SCHEMA_VERSION = 8
/** 建表语句 */
export const DDL = `
-- 元信息（schema 版本、以后的杂项开关）
CREATE TABLE IF NOT EXISTS hy_meta
(
    key   TEXT PRIMARY KEY, -- 元信息键名。
    value TEXT NOT NULL     -- 键对应的值，统一存字符串，读取方自行解析
);

-- 工作区：对话列表第一层，侧栏上的一个区块
CREATE TABLE IF NOT EXISTS hy_workspace
(
    id         TEXT PRIMARY KEY, -- 工作区标识。内置 'workspace'/'ciallo'，允许自定义；用可读字符串便于代码直接引用
    title      TEXT    NOT NULL, -- 显示名，用户可改名；前端优先按 id 查 i18n 字典，查不到回落此值
    sort_index INTEGER NOT NULL, -- 工作区显示顺序，升序从 0 起
    created_at BIGINT  NOT NULL, -- 创建时间，Unix 毫秒
    updated_at BIGINT  NOT NULL  -- 最后修改时间，Unix 毫秒
);

-- 分组：对话列表第二层，工作区内部的一层（目录分组 + 每个工作区独有一条的默认分组）
CREATE TABLE IF NOT EXISTS hy_group
(
    id           TEXT PRIMARY KEY,                                                -- 普通分组 UUID v4；默认分组固定为 '<workspaceId>:ungrouped'
    workspace_id TEXT    NOT NULL REFERENCES hy_workspace (id) ON DELETE RESTRICT, -- 所属工作区；该工作区下仍有分组时禁止删除它
    title        TEXT    NOT NULL,                                                -- 显示名；默认分组由 seed 显式写「未分组」
    path         TEXT,                                                            -- 目录绝对路径；NULL 表示默认分组（虚拟分组）
    default_flag INTEGER NOT NULL DEFAULT 0,                                      -- 1=默认分组(收未分组对话)，0=普通分组
    open_status  INTEGER NOT NULL DEFAULT 1,                                      -- 展开状态：0 收起 / 1 展开
    sort_index   INTEGER NOT NULL,                                                -- 同一工作区内显示顺序，升序
    created_at   BIGINT  NOT NULL,                                                -- 创建时间，Unix 毫秒
    updated_at   BIGINT  NOT NULL,                                                -- 最后修改时间，Unix 毫秒
    CHECK ((default_flag = 1 AND path IS NULL) OR (default_flag = 0 AND path IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_path ON hy_group (path); -- 同一目录只登记一次；NULL 不参与，默认分组可多条
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_default ON hy_group (workspace_id) WHERE default_flag = 1; -- 每个工作区最多一条默认分组
CREATE INDEX IF NOT EXISTS ix_group_workspace ON hy_group (workspace_id, sort_index); -- 按工作区取分组并按显示顺序排

-- 对话：对话列表第三层
CREATE TABLE IF NOT EXISTS hy_conversation
(
    id             TEXT PRIMARY KEY,                                                -- 对话 id，UUID v4
    workspace_id   TEXT    NOT NULL REFERENCES hy_workspace (id) ON DELETE RESTRICT, -- 所属工作区；冗余字段，未分组对话靠它定级
    group_id       TEXT,                                                            -- 所属分组；NULL=未分组，显示在该工作区的默认分组内
    title          TEXT    NOT NULL,                                                -- 标题，默认「新对话」
    sort_index     INTEGER NOT NULL,                                                -- 组内手动排序，升序=显示顺序；新对话取 MIN-1 插到最前，允许负数
    created_at     BIGINT  NOT NULL,                                                -- 创建时间，Unix 毫秒
    updated_at     BIGINT  NOT NULL,                                                -- 最后修改时间，Unix 毫秒；「最近更新」视图排序依据
    langgraph_state TEXT   NOT NULL DEFAULT '{}',                                   -- LangGraph 执行账本 JSON：{ checkpoint_id, channel_versions, versions_seen, 其余 channel }
    FOREIGN KEY (group_id) REFERENCES hy_group (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_conversation_manual ON hy_conversation (group_id, sort_index); -- 手动排序视图
CREATE INDEX IF NOT EXISTS ix_conversation_recent ON hy_conversation (group_id, updated_at DESC); -- 最近更新视图
CREATE INDEX IF NOT EXISTS ix_conversation_workspace ON hy_conversation (workspace_id, updated_at DESC); -- 按工作区取对话

-- 消息：一条消息一行，LangChain 序列化格式原样保存
-- 取代原来的 hy_checkpoints（每步一份全量快照，O(n^2)）
CREATE TABLE IF NOT EXISTS hy_message
(
    id              TEXT PRIMARY KEY,                -- 消息主键，本地生成 UUID v4
    conversation_id TEXT    NOT NULL,                -- 所属对话，即 LangGraph 的 thread_id
    seq             INTEGER NOT NULL,                -- 会话内序号，从 1 起单调递增

    source_data     TEXT    NOT NULL,                -- LangChain 序列化外壳 { lc, type, id }
    message         TEXT    NOT NULL,                -- kwargs 完整 JSON，含 hy_custom

    metadata        TEXT    NOT NULL DEFAULT '{}',   -- LangGraph 的 CheckpointMetadata { source, step, parents }
    expand          TEXT    NOT NULL DEFAULT '{}',   -- 底层扩展 { status }，转换层专用
    created_at      BIGINT  NOT NULL,                -- 写入时间，Unix 毫秒

    UNIQUE (conversation_id, seq)                    -- 同一会话内 seq 唯一，取数靠它排序
);
`
