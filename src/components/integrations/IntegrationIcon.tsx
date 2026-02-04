import React from 'react';
import Image from 'next/image';
import { Blocks } from 'lucide-react';
import AwsIcon from '@/app/aws.svg';
import type { DiscoveredIntegration } from '@/lib/integrations-api';

export const IntegrationIcon: React.FC<{ type: DiscoveredIntegration['type'] }> = ({ type }) => {
    switch (type) {
        case 'AWS_IOT_CORE':
            return <Image src={AwsIcon} alt="AWS IoT Core Icon" className="h-6 w-6" width={24} height={24} />;
        default:
            return <Blocks className="h-6 w-6 text-primary" />;
    }
};
