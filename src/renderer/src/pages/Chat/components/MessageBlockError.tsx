import type { TMError } from '@shared/types/message'

interface Props {
  context: TMError
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
