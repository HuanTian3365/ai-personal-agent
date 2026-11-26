import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HYConversation, HYGroup, HYWorkspace } from '@shared/types/hyEntity'
import { agentApi, conversationApi, expandApi } from '@renderer/lib/ipc'
import { useNavigate } from 'react-router'
import type {
  GroupCreateReq,
  GroupCreateOutput,
  GroupDeleteFun,
  GroupRenameFun,
  ToAsync
} from '@shared/types/ipcContract'

/**
 * 侧栏要用的三种形状（下面两个接口 + 这个返回类型）与文件末尾的 buildWorkspaceSections 是一套，
 * 故意留在同一个文件里：它们只服务 useConversationList 这一个数据源，没有第二个生产者；
 * 为独享的纯函数单开 lib 文件，只会让「数据怎么变成树」多一次跳转。
 * Sidebar / Conversation/index / Conversation/Group 只从这里取类型，不另外复制一份。
 */
export interface UseWorkspaceListResult {
  /** 侧栏要显示的树状结构：工作区 → 分组 → 对话 */
  sections: WorkspaceSection[]
  /** 首次加载时为 true；后续 refresh 只会在结束时置 false，不会重新变 true */
  isLoading: boolean
  /** 错误信息 */
  error: string | null
  /** 新建分组 */
  createGroup: (request: GroupCreateReq) => Promise<GroupCreateOutput>
  /** 分组展开|收起 */
  toggleGroupOpen: (id: string, open: boolean) => Promise<void>
  /** 新建一个对话并跳转 */
  addConversation: (groupId: string | null) => Promise<void>
  /** 重命名分组 */
  groupRename: ToAsync<GroupRenameFun>
  /** 删除分组 */
  groupDelete: ToAsync<GroupDeleteFun>
}

/** 一个工作区下的分组节点；默认分组（未分组）也占一个位置 */
export interface GroupNode {
  /**
   * 分组唯一标识，直接用分组记录 id；默认分组为 '<workspaceId>:ungrouped'。
   * 同时当 React key 和「切换展开」的入参，所以必须是库里真实存在的分组 id：
   * groupExpand 按 id 更新，传一个只在渲染层存在的虚拟 key 会静默更新 0 行，
   * 界面上表现为「点了没反应」，且不会报错。
   */
  key: string
  title: string
  /** 该分组 id；默认分组传 null（未分组对话的 group_id 就是 NULL） */
  groupId: string | null
  /** 是否为默认分组（未分组）：不可删、不可改名、永远排在同工作区最后 */
  isDefault: boolean
  /** 目录指向路径 */
  path: string | null
  /** 展开状态 */
  isOpen: boolean
  /** 对话列表 */
  conversations: HYConversation[]
}

/** 一个工作区块（侧栏的顶层区块） */
export interface WorkspaceSection {
  /** 工作区信息 */
  workspace: HYWorkspace
  /** 分组节点列表 */
  groups: GroupNode[]
}

/**
 * 侧栏的数据源：工作区、分组、对话。
 *
 * 只能在 Sidebar 里调用一次，再通过 props 往下传。
 * 多调用几次会各拿一份数据，改了一处别处不知道。
 *
 * 怎么把三段数据摆成树，写在文件末尾的 buildWorkspaceSections 里，这里只负责拿数据和改数据。
 */
export function useConversationList(): UseWorkspaceListResult {
  const navigate = useNavigate()
  // 工作区|分组|对话
  const [workspaces, setWorkspaces] = useState<HYWorkspace[]>([])
  const [groups, setGroups] = useState<HYGroup[]>([])
  const [conversations, setConversations] = useState<HYConversation[]>([])
  // 加载状态|错误信息
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 侧边栏树状数据 */
  const sections = useMemo<WorkspaceSection[]>(
    () => buildWorkspaceSections(workspaces, groups, conversations),
    [workspaces, groups, conversations]
  )

  /** 拉取侧边栏数据 */
  const refresh = useCallback(async (): Promise<void> => {
    const [ws, groupRes, conversationRes] = await Promise.all([
      conversationApi.workspaceList(),
      conversationApi.groupList(),
      conversationApi.conversationList()
    ])
    setIsLoading(false)
    // 三个都要 | 任一个失败就整体报错 不拼半棵树
    if (!ws.success) return setError(ws.error)
    if (!groupRes.success) return setError(groupRes.error)
    if (!conversationRes.success) return setError(conversationRes.error)
    setWorkspaces(ws.data)
    setGroups(groupRes.data)
    setConversations(conversationRes.data)
    setError(null)
  }, [])

  // 第一次打开时拉取侧边栏数据
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // 事件监听
  useEffect(() => {
    const off = agentApi.onEvent(({ event }) => {
      // 标题更新
      if (event.type === 'title') {
        setConversations((prev) =>
          prev.map((c) => (c.id === event.conversationId ? { ...c, title: event.title } : c))
        )
      }
    })
    return off
  }, [])

  /** ====================  方法  ==================== */

  /** 新增分组 */
  const createGroup = useCallback(
    async (request: GroupCreateReq): Promise<GroupCreateOutput> => {
      // 不绑目录就不用校验路径
      if (request.path) {
        const checked = await expandApi.validPath({ path: request.path })
        // 路径不存在就是失败 | 原因直接贴到路径框下面
        if (!checked.success) {
          return { success: false, error: { path: checked.error } }
        }
      }
      const res = await conversationApi.groupCreate(request)
      // main只给一句话 这里按输入框分开贴 | 名称类的错统一落到另一个框下面
      if (!res.success) {
        return { success: false, error: { another: res.error } }
      }
      await refresh()
      setError(null)
      return { success: true, data: undefined }
    },
    [refresh]
  )

  /** 新建对话 */
  const addConversation = useCallback(
    async (groupId: string | null): Promise<void> => {
      // 新建对话
      const res = await conversationApi.conversationCreate({ groupId })
      if (!res.success) {
        setError(res.error)
        return
      }
      const created = res.data
      // 对话落在哪条分组上 | groupId为null时落该工作区的默认分组 按defaultFlag找不拼id
      const target =
        groupId === null
          ? groups.find((g) => g.defaultFlag && g.workspaceId === created.workspaceId)
          : groups.find((g) => g.id === groupId)
      // 收起就先展开 否则新对话建好了侧栏看不见
      // 展开失败不阻断 对话已经落地 最多是侧栏要手动点开
      if (target !== undefined && target.openStatus === false) {
        await conversationApi.groupExpand({ id: target.id, open: true })
      }
      // 刷新
      await refresh()
      navigate(`/chat/${created.id}`)
    },
    [groups, navigate, refresh]
  )

  /** 分组展开状态切换 */
  const toggleGroupOpen = useCallback(async (id: string, open: boolean): Promise<void> => {
    const flip = (target: boolean): void => {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, openStatus: target } : g)))
    }
    flip(open)
    const res = await conversationApi.groupExpand({ id, open })
    // 失败就翻回去 免得界面和库里对不上
    if (!res.success) {
      flip(!open)
      setError(res.error)
      return
    }
    setError(null)
  }, [])

  /** 重命名分组 */
  const groupRename = useCallback<ToAsync<GroupRenameFun>>(
    async (request) => {
      const res = await conversationApi.groupRename(request)
      if (res.success) {
        await refresh()
        return res
      } else {
        return res
      }
    },
    [refresh]
  )

  /** 删除分组 */
  const groupDelete = useCallback<ToAsync<GroupDeleteFun>>(
    async (request) => {
      const res = await conversationApi.groupDelete(request)
      // 删成功后整棵树要重拉 组内会话已落到未分组 侧栏位置会变
      if (res.success) await refresh()
      return res
    },
    [refresh]
  )

  return {
    sections,
    isLoading,
    error,
    createGroup,
    addConversation,
    toggleGroupOpen,
    groupRename,
    groupDelete
  }
}

/** 构建侧边栏树状数据：工作区 → 分组 → 对话 */
function buildWorkspaceSections(
  workspaces: HYWorkspace[],
  groups: HYGroup[],
  conversations: HYConversation[]
): WorkspaceSection[] {
  return workspaces.map((workspace) => {
    // 普通分组：顺序由 groupList 给出，这里不再排
    const nodes: GroupNode[] = groups
      .filter((group) => group.workspaceId === workspace.id && !group.defaultFlag)
      .map((group) => ({
        key: group.id,
        title: group.title,
        groupId: group.id,
        isDefault: false,
        path: group.path,
        isOpen: group.openStatus,
        conversations: conversations.filter((c) => c.groupId === group.id)
      }))

    // 默认分组（未分组）最后 push，所以永远排在同工作区末尾
    const virtual = groups.find((group) => group.workspaceId === workspace.id && group.defaultFlag)
    if (virtual !== undefined) {
      nodes.push({
        key: virtual.id,
        title: virtual.title,
        groupId: null, // 未分组对话
        isDefault: true,
        path: null,
        isOpen: virtual.openStatus,
        conversations: conversations.filter(
          (c) => c.groupId === null && c.workspaceId === workspace.id
        )
      })
    }
    return { workspace, groups: nodes }
  })
}
