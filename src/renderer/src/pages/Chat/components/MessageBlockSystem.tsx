import { MSystem } from '@shared/types/newMessages'
import { Card } from '@renderer/components/ui/card'

interface Props {
  context: MSystem
}

export default function MessageBlockSystem({ context }: Props): React.JSX.Element {
  return <Card title="system">{context.content}</Card>
}
