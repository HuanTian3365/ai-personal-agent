import { MError } from '@shared/types/newMessages'

interface Props {
  context: MError
}

export default function MessageBlockError({ context }: Props): React.JSX.Element {
  return (
    <div className="text-sm text-red-600">
      <div>
        {context.source}: {context.message}
      </div>
    </div>
  )
}
