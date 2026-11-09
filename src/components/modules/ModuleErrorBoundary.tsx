'use client';

import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Error shown inside the content area when a module cannot be loaded or crashes. */
export function ModuleErrorPanel({ moduleName, message, onRetry }: Readonly<{ moduleName: string; message: string; onRetry: () => void }>) {
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert />
      <AlertTitle>Module &quot;{moduleName}&quot; is unavailable</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

interface Props {
  moduleName: string;
  /** When this value changes (e.g. the pathname) a previous error is cleared. */
  resetKey: string;
  onRetry: () => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ModuleErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`Module "${this.props.moduleName}" crashed:`, error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ModuleErrorPanel
          moduleName={this.props.moduleName}
          message={this.state.error.message}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}
