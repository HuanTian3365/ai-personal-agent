import { Loader } from 'lucide-react'

export default function MessageLoading(): React.JSX.Element {
  return (
    <div className="mb-5">
      <hr className="border-t border-gray-500 m-0 my-2" />
      <div className="flex gap-2 items-center  text-gray-500">
        <Loader className=" animate-spin" size={12} style={{ animationDuration: '2.5s' }} />
        <p className="text-sm">Ciallo......</p>
      </div>
    </div>
  )
}
