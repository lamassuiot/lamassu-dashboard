'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Upload, Search, Shield } from 'lucide-react';
import { CBOMList } from '@/components/cbom/CBOMList';
import { CBOMUpload } from '@/components/cbom/CBOMUpload';
import { CBOMScan } from '@/components/cbom/CBOMScan';
import { CBOMCompliance } from '@/components/cbom/CBOMCompliance';
import { Skeleton } from '@/components/ui/skeleton';

export default function CBOMPage() {
  const { isAuthenticated, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setIsLoading(false);
    }
  }, [user]);

  if (!isAuthenticated()) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to access CBOM management.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-6 w-[500px]" />
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Package className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-4xl font-bold">CBOM Manager</h1>
          <p className="text-muted-foreground text-lg">
            Manage Cryptographic Bill of Materials (CBOM) for your projects
          </p>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            CBOMs
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="scan" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Scan Repository
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Compliance Check
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent CBOMs</CardTitle>
              <CardDescription>
                View and manage stored Cryptographic Bill of Materials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CBOMList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload CBOM</CardTitle>
              <CardDescription>
                Store a new CBOM by uploading a JSON file or pasting CBOM data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CBOMUpload />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Scan Repository</CardTitle>
              <CardDescription>
                Generate a CBOM by scanning a Git repository
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CBOMScan />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Check</CardTitle>
              <CardDescription>
                Verify CBOM compliance against security policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CBOMCompliance />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
