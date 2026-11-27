/**
 * 表结构 | main 与 core 共用的唯一一份
 *
 * 放: 每张表的建表语句(列 / 主键 / 唯一约束 / CHECK / 外键) 原样字符串
 * 不放: 索引、种子数据、版本号与迁移逻辑(-> main/database/init/sql.ts) | 行转业务形状(-> types/hyEntity.ts)
 *
 * 为什么单独放到 shared:
 * core 的转换层要能脱离 main 单独跑(pnpm test),得自己保证表在;
 * 而两份手抄的 DDL 必然漂(2026-11-27 校准发现已经漂过)。
 * 这里是「列定义」的唯一一份:main 拼完整 DDL、core 只取它用到的那张表,谁都不再抄。
 *
 * 外键与 CHECK 只能写在建表语句里(SQLite 不支持事后加表级约束),
 * 所以它们跟着表走;索引不在表内,归 init/sql.ts。
 *
 * 改这里等于改库结构:兼容变更(加表 / 加列)照常改,不兼容才升 SCHEMA_VERSION。
 */

/** 元信息(表名) */
export const TABLE_META = 'hy_meta'
/** 工作区(表名) */
export const TABLE_WORKSPACE = 'hy_workspace'
/** 分组(表名) */
export const TABLE_GROUP = 'hy_group'
/** 对话(表名) */
export const TABLE_CONVERSATION = 'hy_conversation'
/** 正文:一条消息一行(表名) */
export const TABLE_MESSAGE = 'hy_message'

/** 元信息: schema 版本、以后的杂项开关 */
export const DDL_META = `
-- 元信息（schema 版本、以后的杂项开关）
CREATE TABLE IF NOT EXISTS hy_meta
(
    key   TEXT PRIMARY KEY, -- 元信息键名。
    value TEXT NOT NULL     -- 键对应的值，统一存字符串，读取方自行解析
);`

/** 工作区: 对话列表第一层，侧栏上的一个区块 */
export const DDL_WORKSPACE = `
-- 工作区：对话列表第一层，侧栏上的一个区块
CREATE TABLE IF NOT EXISTS hy_workspace
(
    id         TEXT PRIMARY KEY, -- 工作区标识。内置 'workspace'/'ciallo'，允许自定义；用可读字符串便于代码直接引用
    title      TEXT    NOT NULL, -- 显示名，用户可改名；前端优先按 id 查 i18n 字典，查不到回落此值
    sort_index INTEGER NOT NULL, -- 工作区显示顺序，升序从 0 起
    created_at BIGINT  NOT NULL, -- 创建时间，Unix 毫秒
    updated_at BIGINT  NOT NULL  -- 最后修改时间，Unix 毫秒
);`

/** 分组: 对话列表第二层（绑目录分组 + 纯命名分组 + 每个工作区独有一条的默认分组） */
export const DDL_GROUP = `
-- 分组：对话列表第二层，工作区内部的一层（绑目录分组 + 纯命名分组 + 每个工作区独有一条的默认分组）
CREATE TABLE IF NOT EXISTS hy_group
(
    id           TEXT PRIMARY KEY,                                                -- 普通分组 UUID v4；默认分组固定为 '<workspaceId>:ungrouped'
    workspace_id TEXT    NOT NULL REFERENCES hy_workspace (id) ON DELETE RESTRICT, -- 所属工作区；该工作区下仍有分组时禁止删除它
    title        TEXT    NOT NULL,                                                -- 显示名；默认分组由 seed 显式写「未分组」
    path         TEXT,                                                            -- 目录绝对路径；NULL = 不绑目录的命名分组，或默认分组
    default_flag INTEGER NOT NULL DEFAULT 0,                                      -- 1=默认分组(收未分组对话)，0=普通分组
    open_status  INTEGER NOT NULL DEFAULT 1,                                      -- 展开状态：0 收起 / 1 展开
    sort_index   INTEGER NOT NULL,                                                -- 同一工作区内显示顺序，升序
    created_at   BIGINT  NOT NULL,                                                -- 创建时间，Unix 毫秒
    updated_at   BIGINT  NOT NULL,                                                -- 最后修改时间，Unix 毫秒
    -- 默认分组必须无路径；普通分组的 path 可空(纯命名分组)，非空时由应用层保证是规范化目录
    CHECK ((default_flag = 1 AND path IS NULL) OR default_flag = 0)
);`

/** 对话: 对话列表第三层 */
export const DDL_CONVERSATION = `
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
    expand         TEXT    NOT NULL DEFAULT '{}',                                   -- 会话级业务扩展 JSON：第一层 key 声明职责，如 sendMessage.queue / chatView
    FOREIGN KEY (group_id) REFERENCES hy_group (id) ON DELETE SET NULL
);`

/** 正文: 一条消息一行，LangChain 序列化格式原样保存（取代原来的 hy_checkpoints） */
export const DDL_MESSAGE = `
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
);`
