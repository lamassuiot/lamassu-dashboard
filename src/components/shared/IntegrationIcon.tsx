import React from 'react';
import Image from 'next/image';
import { Blocks } from 'lucide-react';
import type { DiscoveredIntegration } from '@/lib/integrations-api';
import AwsIcon from '@/app/aws.svg';
import AwsIconWhite from '@/app/aws-white.svg';

export const IntegrationIcon: React.FC<{ type: DiscoveredIntegration['type'] }> = ({ type }) => {
  switch (type) {
    case 'AWS_IOT_CORE':
      return (
        <>
          <Image src={AwsIcon} alt="AWS IoT Core Icon" className="h-5 w-5 dark:hidden" width={20} height={20} />
          <Image src={AwsIconWhite} alt="AWS IoT Core Icon" className="hidden h-5 w-5 dark:block" width={20} height={20} />
        </>
      );
    default:
      return <Blocks className="h-5 w-5 text-muted-foreground" />;
  }
};
