'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { checkStoredCBOMCompliance, checkCBOMCompliance, ComplianceCheckResult } from '@/lib/cbom-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Shield, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export const CBOMCompliance: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [projectIdentifier, setProjectIdentifier] = useState('');
  const [policyIdentifier, setPolicyIdentifier] = useState('');
  const [cbomData, setCbomData] = useState('');
  const [result, setResult] = useState<ComplianceCheckResult | null>(null);

  const handleCheckStored = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.access_token || !projectIdentifier || !policyIdentifier) {
      toast({
        title: 'Error',
        description: 'Please provide both project and policy identifiers',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    try {
      const complianceResult = await checkStoredCBOMCompliance(
        projectIdentifier,
        policyIdentifier,
        user.access_token
      );
      
      setResult(complianceResult);
      
      toast({
        title: 'Compliance Check Complete',
        description: complianceResult.compliant 
          ? 'CBOM is compliant' 
          : 'CBOM has compliance violations',
        variant: complianceResult.compliant ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error('Failed to check compliance:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check compliance',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckProvided = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.access_token || !cbomData || !policyIdentifier) {
      toast({
        title: 'Error',
        description: 'Please provide both CBOM data and policy identifier',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    try {
      const jsonData = JSON.parse(cbomData);
      const complianceResult = await checkCBOMCompliance(
        jsonData,
        policyIdentifier,
        user.access_token
      );
      
      setResult(complianceResult);
      
      toast({
        title: 'Compliance Check Complete',
        description: complianceResult.compliant 
          ? 'CBOM is compliant' 
          : 'CBOM has compliance violations',
        variant: complianceResult.compliant ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error('Failed to check compliance:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check compliance',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    return (
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {result.compliant ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Compliant
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Non-Compliant
                </>
              )}
            </CardTitle>
            <Badge variant={result.compliant ? 'default' : 'destructive'}>
              {result.compliant ? 'PASS' : 'FAIL'}
            </Badge>
          </div>
          <CardDescription>
            Compliance check results against the specified policy
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.violations && result.violations.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Violations:</h4>
              <ul className="list-disc list-inside space-y-1">
                {result.violations.map((violation, index) => (
                  <li key={index} className="text-sm text-destructive">
                    {violation}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {result.details && (
            <div className="mt-4">
              <h4 className="font-semibold text-sm mb-2">Details:</h4>
              <ScrollArea className="h-48 w-full rounded-md border p-4">
                <pre className="text-xs">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="stored" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stored">Check Stored CBOM</TabsTrigger>
          <TabsTrigger value="provided">Check Provided CBOM</TabsTrigger>
        </TabsList>

        <TabsContent value="stored">
          <form onSubmit={handleCheckStored} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-id-stored">Project Identifier</Label>
              <Input
                id="project-id-stored"
                placeholder="e.g., my-project or pkg:npm/my-package@1.0.0"
                value={projectIdentifier}
                onChange={(e) => setProjectIdentifier(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                The project identifier of the stored CBOM
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-id-stored">Policy Identifier</Label>
              <Input
                id="policy-id-stored"
                placeholder="e.g., security-policy-v1"
                value={policyIdentifier}
                onChange={(e) => setPolicyIdentifier(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                The policy to check compliance against
              </p>
            </div>

            <Button 
              type="submit" 
              disabled={isLoading || !projectIdentifier || !policyIdentifier}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Check Compliance
                </>
              )}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="provided">
          <form onSubmit={handleCheckProvided} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="policy-id-provided">Policy Identifier</Label>
              <Input
                id="policy-id-provided"
                placeholder="e.g., security-policy-v1"
                value={policyIdentifier}
                onChange={(e) => setPolicyIdentifier(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                The policy to check compliance against
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cbom-data-provided">CBOM JSON Data</Label>
              <Textarea
                id="cbom-data-provided"
                placeholder="Paste your CBOM JSON data here..."
                value={cbomData}
                onChange={(e) => setCbomData(e.target.value)}
                rows={12}
                className="font-mono text-sm"
                required
              />
              <p className="text-sm text-muted-foreground">
                Paste the CBOM data you want to check
              </p>
            </div>

            <Button 
              type="submit" 
              disabled={isLoading || !cbomData || !policyIdentifier}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Check Compliance
                </>
              )}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {renderResult()}
    </div>
  );
};
