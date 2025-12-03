// src/app/updates/launch/[launchId]/strategy/page.tsx
import { LaunchStrategyClient } from './client';

interface LaunchStrategyPageProps {
  params: Promise<{
    launchId: string;
  }>;
}

export function generateStaticParams() {
  // For static export, we need to provide at least one placeholder
  // since launch IDs are dynamic and can't be known at build time
  // This placeholder won't be used in practice as the page uses client-side routing
  return [
    { launchId: 'placeholder-launch-id' }
  ];
}

export default function LaunchStrategyPage({ params }: LaunchStrategyPageProps) {
  return <LaunchStrategyClient params={params} />;
}
