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
      {
        const awsVisuals =
          event.eventType === 'CONNECTED'
            ? {
                display: 'AWS Connected',
                iconClass: 'text-emerald-600 dark:text-emerald-400',
                lineClass: 'bg-emerald-200 dark:bg-emerald-900/50',
              }
            : event.eventType === 'DISCONNECTED'
              ? {
                  display: 'AWS Disconnected',
                  iconClass: 'text-rose-600 dark:text-rose-400',
                  lineClass: 'bg-rose-200 dark:bg-rose-900/50',
                }
              : {
                  display: 'AWS Event',
                  iconClass: 'text-sky-600 dark:text-sky-400',
                  lineClass: 'bg-sky-200 dark:bg-sky-900/50',
                };

      return {
        Component: AwsDeviceEventRenderer,
        Icon: AwsTimelineIcon,
        visuals: {
          ...awsVisuals,
          iconPresentation: 'plain',
          iconContainerClass: 'rounded-md bg-transparent scale-125',
        },
      };
      }
    default:
      return {
        Component: DefaultDeviceEventRenderer,
      };
  }
};
