
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  get_CA_API_BASE_URL,
  get_DEV_MANAGER_API_BASE_URL,
  get_DMS_MANAGER_API_BASE_URL,
  get_ALERTS_API_BASE_URL,
  get_VA_API_BASE_URL,
  get_KMS_API_BASE_URL
} from '@/lib/api-domains';

interface OpenAPISpecDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const servicesToCheck = [
    { name: 'CA Service', url: get_CA_API_BASE_URL() },
    { name: 'Device Manager', url: get_DEV_MANAGER_API_BASE_URL() },
    { name: 'DMS Manager', url: get_DMS_MANAGER_API_BASE_URL() },
    { name: 'Alerts Service', url: get_ALERTS_API_BASE_URL() },
    { name: 'Validation Authority', url: get_VA_API_BASE_URL() },
    { name: 'KMS Service', url: "http://localhost:5500/docs/kms-openapi.yaml" }
];

export const OpenAPISpecDialog: React.FC<OpenAPISpecDialogProps> = ({ isOpen, onOpenChange }) => {
    const [selectedService, setSelectedService] = useState(servicesToCheck[0].url);
    const apiReferenceRef = useRef<HTMLDivElement>(null);

    const getOpenAPIUrl = (baseUrl: string) => {
        // Remove the /v1 suffix and add /api.json
        return `${baseUrl.substring(0, baseUrl.lastIndexOf('/'))}/api.json`;
    };

    useEffect(() => {
        if (!isOpen || !apiReferenceRef.current) return;

        // Dynamically import and initialize the Scalar API Reference
        import('@scalar/api-reference').then((module) => {
            if (apiReferenceRef.current) {
                apiReferenceRef.current.innerHTML = '';
                
                const container = document.createElement('div');
                apiReferenceRef.current.appendChild(container);
                
                module.createApiReference(container, {
                    url: getOpenAPIUrl(selectedService),
                });
            }
        }).catch(error => {
            console.error('Failed to load API Reference:', error);
        });
    }, [isOpen, selectedService]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>OpenAPI Specification</DialogTitle>
                    <DialogDescription>
                        Interactive API documentation for backend services.
                    </DialogDescription>
                </DialogHeader>

                <div className="mb-4">
                    <Select value={selectedService} onValueChange={setSelectedService}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a service" />
                        </SelectTrigger>
                        <SelectContent>
                            {servicesToCheck.map(service => (
                                <SelectItem key={service.url} value={service.url}>
                                    {service.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div ref={apiReferenceRef} className="flex-1 overflow-auto min-h-[60vh]" />
            </DialogContent>
        </Dialog>
    );
};
