import { TabsTrigger, Tabs, TabsList } from '@renderer/components/ui/tabs'
import { useParams } from 'react-router'

export default function ChatHeader({ title }: { title: string }): React.JSX.Element {
  const params = useParams()
  return (
    <div>
      <p className="px-2 text-base font-bold">{title}</p>
      <Tabs defaultValue="account">
        <TabsList variant="line">
          <TabsTrigger value="account">对话</TabsTrigger>
          <TabsTrigger value="password">其他</TabsTrigger>
          <TabsTrigger value="debug">{params.conversationId}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
