import * as React from 'react'
import { DndContext, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import Group from './Group'
import type { GroupNode } from '@renderer/hooks/useConversationList'
import type { GroupDeleteFun, GroupRenameFun, ToAsync } from '@shared/types/ipcContract'

/**
 * 一个工作区内的分组列表 | 拖动排序只在同一个工作区内部生效
 *
 * 默认分组不进sortable列表: 它在DOM里排在所有普通分组之后 又不在items里
 * 所以拖动时既不能拿它当落点 也不会越过它 这就是「默认分组恒末尾」的界面侧保障
 * 数据侧还有一道 sort_index约束(默认分组恒0 普通分组恒>=1) 见 规范与定义/02 §3
 */
interface Props {
  /** 所属工作区 | 重排提交时带上 用于校验分组归属 */
  workspaceId: string
  /** 该工作区的分组，已按显示顺序排好 */
  groups: GroupNode[]
  onAddConversation: (groupId: string | null) => Promise<void>
  onToggleOpen: (id: string, open: boolean) => Promise<void>
  onGroupRename: ToAsync<GroupRenameFun>
  onGroupDelete: ToAsync<GroupDeleteFun>
  onGroupReorder: (workspaceId: string, ids: string[]) => Promise<void>
}

export default function WorkspaceGroupList({
  workspaceId,
  groups,
  onAddConversation,
  onToggleOpen,
  onGroupRename,
  onGroupDelete,
  onGroupReorder
}: Props): React.JSX.Element {
  // 移动超过5px才算拖动 | 否则点标题行会先被当成拖拽 展开收起就点不动了
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  /** 可拖的分组 | 顺序即界面顺序 | 默认分组不参与 */
  const sortableIds = React.useMemo(
    () => groups.filter((group) => !group.isDefault).map((group) => group.key),
    [groups]
  )

  /** 松手 | 算出新顺序整体提交 不做「移动到某处」的增量语义 */
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    // 落在自己身上或落在列表外 都是没动
    if (over === null || active.id === over.id) return
    const from = sortableIds.indexOf(String(active.id))
    const to = sortableIds.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    void onGroupReorder(workspaceId, arrayMove(sortableIds, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin而不是closestCenter: 指针必须落在某个分组行内才算命中
      // 拖到默认分组或列表空白处 over就是null 松手不变
      // 换成closestCenter会把「拖到默认分组上」判成最近的那个普通分组 表现为莫名跳位
      collisionDetection={pointerWithin}
      // 只许上下动 免得分组被拖出工作区块
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {groups.map((group) => (
          <Group
            key={group.key}
            group={group}
            onAddConversation={onAddConversation}
            onToggleOpen={onToggleOpen}
            onGroupRename={onGroupRename}
            onGroupDelete={onGroupDelete}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}
