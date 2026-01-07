'use client';

import React from 'react';
import { TestTube } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AdvancedTestingComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Test Examples
        </CardTitle>
        <CardDescription>
          Common test scenarios you can try
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="border rounded p-3 text-sm">
            <div className="font-medium mb-1">Admin Certificate Signing</div>
            <div>Principal: Admin JWT Principal</div>
            <div>Policy: CA Administrator Policy</div>
            <div>Action: lamassu:sign_certificate</div>
            <div>Resource: lamassu.io/v1/ca/certificates/*</div>
            <div className="text-green-600 mt-1">Expected: Allow - Admin can sign certificates</div>
          </div>
          
          <div className="border rounded p-3 text-sm">
            <div className="font-medium mb-1">Auditor Reading Certificates</div>
            <div>Principal: Alice Certificate Principal</div>
            <div>Policy: Auditor Read-Only Policy</div>
            <div>Action: lamassu:read_certificate</div>
            <div>Resource: lamassu.io/v1/ca/certificates/*</div>
            <div className="text-green-600 mt-1">Expected: Allow - Auditor can read certificates</div>
          </div>
          
          <div className="border rounded p-3 text-sm">
            <div className="font-medium mb-1">Unauthorized Action</div>
            <div>Principal: Alice Certificate Principal</div>
            <div>Policy: Auditor Read-Only Policy</div>
            <div>Action: lamassu:revoke_certificate</div>
            <div>Resource: lamassu.io/v1/ca/certificates/*</div>
            <div className="text-red-600 mt-1">Expected: Deny - Auditor cannot revoke certificates</div>
          </div>
          
          <div className="border rounded p-3 text-sm">
            <div className="font-medium mb-1">Wrong Resource Access</div>
            <div>Principal: Admin JWT Principal</div>
            <div>Policy: CA Administrator Policy</div>
            <div>Action: lamassu:sign_certificate</div>
            <div>Resource: lamassu.io/v1/unauthorized-resource</div>
            <div className="text-red-600 mt-1">Expected: Deny - Resource not in policy scope</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
