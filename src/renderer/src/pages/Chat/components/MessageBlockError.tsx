import type { MError } from '@shared/types/message'

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
