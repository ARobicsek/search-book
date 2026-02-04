import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="shadow-lg border-primary">
        <CardContent className="flex items-center gap-3 p-4">
          <RefreshCw className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Update available</p>
            <p className="text-xs text-muted-foreground">
              A new version of SearchBook is ready
            </p>
          </div>
          <Button size="sm" onClick={() => updateServiceWorker(true)}>
            Update
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
