import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Catches render-time errors anywhere below it and shows a recover UI instead
 * of white-screening the whole app (which would also lose in-progress edits).
 * "Reload" calls window.location.reload(), which preserves the current URL.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console trace for debugging; wire to Sentry later (Task 17).
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The app hit an unexpected error. Reloading usually fixes it — your saved
          data is safe.
        </p>
        {this.state.error?.message && (
          <pre className="max-w-md overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
        )}
        <Button onClick={this.handleReload}>Reload</Button>
      </div>
    )
  }
}
