interface Props {
  source: string
  message: string
}

export default function MessageBlockError({ source, message }: Props): React.JSX.Element {
  return (
    <div className="text-sm text-red-600">
      <div>
        {source}: {message}
      </div>
    </div>
  )
}
