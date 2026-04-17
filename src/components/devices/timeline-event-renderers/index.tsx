'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import AwsIcon from '@/app/aws.svg';
import AwsWhiteIcon from '@/app/aws-white.svg';
import { AwsDeviceEventRenderer } from './AwsDeviceEventRenderer';
import { DefaultDeviceEventRenderer } from './DefaultDeviceEventRenderer';
import type { TimelineEventDisplayData, TimelineEventRendererDefinition } from './types';

export * from './types';

const AwsTimelineIcon: React.FC<{ className?: string }> = ({ className }) => {
  const monacoTheme = useMonacoTheme();
  const iconSrc = monacoTheme === 'vs-dark' ? AwsWhiteIcon : AwsIcon;

  return (
    <span className={cn('relative block h-3.5 w-3.5', className)}>
      <Image src={iconSrc} alt="AWS" fill className="object-contain" />
    </span>
  );
};

export const getTimelineEventRenderer = (
  event: TimelineEventDisplayData,
): TimelineEventRendererDefinition => {
  switch (true) {
    case event.source.includes('lamassu.io/ctx/source/service/awsiot-connector'):
      return {
        Component: AwsDeviceEventRenderer,
        Icon: AwsTimelineIcon,
        visuals: {
          display: 'AWS Event',
          iconClass: 'text-amber-500 dark:text-amber-300',
          lineClass: 'bg-amber-200 dark:bg-amber-900/50',
          iconPresentation: 'plain',
          iconContainerClass: 'rounded-md bg-transparent scale-125',
        },
      };
    default:
      return {
        Component: DefaultDeviceEventRenderer,
      };
  }
};
