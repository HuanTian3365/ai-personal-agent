import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Conversation, Group, Workspace } from '@shared/types/conversationDefinition'
import { agentApi, conversationApi } from '@renderer/lib/ipc'
import { useNavigate } from 'react-router'
import type { CreateGroupInput } from '@shared/types/conversationRealize'

/**
 * 侧栏要用的三种形状（下面两个接口 + 这个返回类型）与文件末尾的 buildWorkspaceSections 是一套，
 * 故意留在同一个文件里：它们只服务 useConversationList 这一个数据源，没有第二个生产者；
 * 为独享的纯函数单开 lib 文件，只会让「数据怎么变成树」多一次跳转。
 * SidebarConversationList / SidebarConversationGroup 只从这里取类型，不另外复制一份。
 */
export interface UseWorkspaceListResult {
  /** 侧栏要显示的树状结构：工作区 → 分组 → 对话 */
  sections: WorkspaceSection[]
  /** 首次加载时为 true；后续 refresh 只会在结束时置 false，不会重新变 true */
  isLoading: boolean
  /** 错误信息 */
  error: string | null
  /** 新建分组；成功返回 true（弹窗据此关闭），失败写进 error 并返回 false */
  createGroup: (input: CreateGroupInput) => Promise<boolean>
  /** 分组展开|收起 */
  toggleGroupOpen: (id: string, open: boolean) => Promise<void>
  /** 新建一个对话 */
  addConversation: (groupId: string | null) => Promise<void>
}

/** 一个工作区下的分组节点；默认分组（未分组）也占一个位置 */
export interface GroupNode {
  /**
   * 分组唯一标识，直接用分组记录 id；默认分组为 '<workspaceId>:ungrouped'。
   * 同时当 React key 和「切换展开」的入参，所以必须是库里真实存在的分组 id：
   * setGroupOpen 按 id 更新，传一个只在渲染层存在的虚拟 key 会静默更新 0 行，
   * 界面上表现为「点了没反应」，且不会报错。
   */
  key: string
  title: string
  /** 该分组 id；默认分组传 null（未分组对话的 group_id 就是 NULL） */
  groupId: string | null
  /** 是否为默认分组（未分组）：不可删、不可改名、永远排在同工作区最后 */
  isDefault: boolean
  /** 展开状态 */
  isOpen: boolean
  /** 对话列表 */
  conversations: Conversation[]
}

/** 一个工作区块（侧栏的顶层区块） */
export interface WorkspaceSection {
  /** 工作区信息 */
  workspace: Workspace
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  // 加载状态|错误信息
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 拉取侧边栏数据 */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextWorkspaces, nextGroups, nextConversations] = await Promise.all([
        conversationApi.listWorkspaces(),
        conversationApi.listGroups(),
        conversationApi.listConversations()
      ])
      setWorkspaces(nextWorkspaces)
      setGroups(nextGroups)
      setConversations(nextConversations.map((c) => ({ ...c, title: c.title || 'TODO:新对话' })))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 第一次打开时拉取侧边栏数据
  useEffect(() => {
    // 这条规则以为下面会同步改状态；refresh 里第一个 setState 在 await 之后，实际不会
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // 标题更新：core 在第一轮聊完后把新标题推过来。
  // 只改这一条的标题，不整个重新加载——为了一个字段重拉三张表，不划算。
  useEffect(() => {
    const off = agentApi.onEvent((event) => {
      if (event.type !== 'title') return
      setConversations((prev) =>
        prev.map((c) => (c.id === event.conversationId ? { ...c, title: event.title } : c))
      )
    })
    return off
  }, [])

  /** 新增分组 */
  const createGroup = useCallback(
    async (input: CreateGroupInput): Promise<boolean> => {
      try {
        await conversationApi.createGroup(input)
        await refresh()
        setError(null)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    [refresh]
  )

  /** 新建对话 */
  const addConversation = useCallback(
    async (groupId: string | null): Promise<void> => {
      const res = await conversationApi.createConversation(groupId)
      await refresh()
      navigate(`/chat/${res.id}`)
    },
    [navigate, refresh]
  )

  /**
   * 分组展开状态切换。
   * 先改界面让它立刻有反应，再后台存库；存失败就翻回来并报错。
   * 不整个重新加载——折叠是常做的事，每次都重拉列表太浪费。
   */
  const toggleGroupOpen = useCallback(async (id: string, open: boolean): Promise<void> => {
    const flip = (target: boolean): void => {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, openStatus: target } : g)))
    }
    flip(open)
    try {
      await conversationApi.setGroupExpand(id, open)
      setError(null)
    } catch (err) {
      flip(!open)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  /** 侧边栏树状数据 */
  const sections = useMemo<WorkspaceSection[]>(
    () => buildWorkspaceSections(workspaces, groups, conversations),
    [workspaces, groups, conversations]
  )

  return {
    sections,
    isLoading,
    error,
    createGroup,
    addConversation,
    toggleGroupOpen
  }
}

/** 构建侧边栏树状数据：工作区 → 分组 → 对话 */
function buildWorkspaceSections(
  workspaces: Workspace[],
  groups: Group[],
  conversations: Conversation[]
): WorkspaceSection[] {
  return workspaces.map((workspace) => {
    // 普通分组：顺序由 listGroups 给出，这里不再排
    const nodes: GroupNode[] = groups
      .filter((group) => group.workspaceId === workspace.id && !group.defaultFlag)
      .map((group) => ({
        key: group.id,
        title: group.title,
        groupId: group.id,
        isDefault: false,
        isOpen: group.openStatus,
        conversations: conversations.filter((c) => c.groupId === group.id)
      }))

    // 默认分组（未分组）最后 push，所以永远排在同工作区末尾
    const virtual = groups.find((group) => group.workspaceId === workspace.id && group.defaultFlag)
    if (virtual !== undefined) {
      nodes.push({
        key: virtual.id,
        title: virtual.title,
        groupId: null, // 未分组对话的 group_id 是 NULL，不指向这条记录
        isDefault: true,
        isOpen: virtual.openStatus,
        conversations: conversations.filter(
          (c) => c.groupId === null && c.workspaceId === workspace.id
        )
      })
    }
    return { workspace, groups: nodes }
  })
}
