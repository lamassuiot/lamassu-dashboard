'use client';

import React, { useState } from 'react';
import { TestTube, Play, Check, X, Info, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Sample data - in a real app, this would come from props or context
const samplePolicies = [
  {
    id: 'policy-1',
    name: 'CA Administrator Policy',
    statements: [
      {
        effect: 'Allow',
        actions: ['lamassu:sign_certificate', 'lamassu:revoke_certificate'],
        resources: ['lamassu.io/v1/ca/*', 'lamassu.io/v1/ca/certificates/*']
      }
    ]
  },
  {
    id: 'policy-2',
    name: 'Auditor Read-Only Policy',
    statements: [
      {
        effect: 'Allow',
        actions: ['lamassu:read_certificate', 'lamassu:read_crl'],
        resources: ['lamassu.io/v1/ca/certificates/*', 'lamassu.io/v1/ca/crl/*']
      }
    ]
  }
];

const predefinedActions = [
  'lamassu:sign_certificate',
  'lamassu:revoke_certificate',
  'lamassu:read_certificate',
  'lamassu:read_crl',
  'lamassu:create_ca',
  'lamassu:delete_ca',
  'lamassu:import_ca',
  'lamassu:export_ca',
  'lamassu:enroll_device',
  'lamassu:revoke_device',
  'lamassu:read_device',
  'lamassu:update_device',
  'lamassu:manage_users',
  'lamassu:read_audit_logs',
  'lamassu:configure_system',
  'lamassu:backup_system',
  'lamassu:restore_system'
];

const samplePrincipals = [
  {
    id: 'principal-1',
    name: 'Alice Certificate Principal',
    type: 'certificate',
    subject: 'cn=alice@example.com,ou=engineering'
  },
  {
    id: 'principal-2',
    name: 'Admin JWT Principal',
    type: 'jwt',
    subject: 'sub=admin@company.com',
    roles: ['ca-admin', 'super-admin']
  }
];

interface TestResult {
  decision: 'Allow' | 'Deny';
  matchedPolicies: string[];
  reason: string;
  details: string[];
}

export function AdvancedTestingComponent() {
  const [selectedPrincipal, setSelectedPrincipal] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [customPrincipal, setCustomPrincipal] = useState('');
  const [useCustomPrincipal, setUseCustomPrincipal] = useState(false);
  const [testAction, setTestAction] = useState('');
  const [testResource, setTestResource] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runTest = async () => {
    if (!selectedPolicy || (!selectedPrincipal && !customPrincipal) || !testAction || !testResource) {
      return;
    }

    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock evaluation logic
    const principal = useCustomPrincipal 
      ? JSON.parse(customPrincipal)
      : samplePrincipals.find(p => p.id === selectedPrincipal);
    
    // Get the selected policy
    const selectedPolicyObj = samplePolicies.find(p => p.id === selectedPolicy);
    if (!selectedPolicyObj) {
      setIsLoading(false);
      return;
    }
    
    let decision: 'Allow' | 'Deny' = 'Deny';
    let matchedPolicies: string[] = [];
    let reason = 'Policy does not apply to this principal';
    let details: string[] = [];

    // Evaluate the selected policy against the principal, action, and resource
    for (const statement of selectedPolicyObj.statements) {
      // Check if principal type is compatible
      let principalMatches = false;
      
      if (principal?.type === 'jwt' && principal.roles) {
        // For JWT principals, we could check if roles match policy requirements
        // For now, we'll assume compatibility
        principalMatches = true;
        details.push(`JWT Principal with roles: ${principal.roles.join(', ')}`);
      } else if (principal?.type === 'certificate') {
        // For certificate principals, we could check subject/issuer
        // For now, we'll assume compatibility
        principalMatches = true;
        details.push(`Certificate Principal with subject: ${principal.subject}`);
      }

      // Check if action matches
      const actionMatches = statement.actions.some(action => 
        action === testAction || action.includes('*') || testAction.includes(action)
      );
      
      // Check if resource matches  
      const resourceMatches = statement.resources.some(resource => 
        resource === testResource || resource.includes('*') || testResource.includes(resource.replace('*', ''))
      );

      if (principalMatches && actionMatches && resourceMatches) {
        matchedPolicies.push(selectedPolicyObj.name);
        decision = statement.effect as 'Allow' | 'Deny';
        reason = `Policy '${selectedPolicyObj.name}' allows this action on the resource for this principal`;
        details.push(`Policy effect: ${statement.effect}`);
        details.push(`Action '${testAction}' matches allowed actions: ${statement.actions.join(', ')}`);
        details.push(`Resource '${testResource}' matches allowed resources: ${statement.resources.join(', ')}`);
        break; // Take the first matching statement
      } else if (principalMatches) {
        reason = `Policy '${selectedPolicyObj.name}' applies to principal but not for the specified action/resource`;
        if (!actionMatches) {
          details.push(`Action '${testAction}' does not match allowed actions: ${statement.actions.join(', ')}`);
        }
        if (!resourceMatches) {
          details.push(`Resource '${testResource}' does not match allowed resources: ${statement.resources.join(', ')}`);
        }
      }
    }

    setTestResult({
      decision,
      matchedPolicies,
      reason,
      details
    });
    
    setIsLoading(false);
  };

  const resetTest = () => {
    setSelectedPrincipal('');
    setSelectedPolicy('');
    setCustomPrincipal('');
    setTestAction('');
    setTestResource('');
    setTestResult(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Test Configuration */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TestTube className="h-5 w-5" />
              <span>Test Configuration</span>
            </CardTitle>
            <CardDescription>
              Configure the access control test scenario
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="checkbox"
                  id="use-custom"
                  checked={useCustomPrincipal}
                  onChange={(e) => setUseCustomPrincipal(e.target.checked)}
                />
                <Label htmlFor="use-custom">Use Custom Principal JSON</Label>
              </div>
              
              {useCustomPrincipal ? (
                <div>
                  <Label htmlFor="custom-principal">Custom Principal JSON</Label>
                  <Textarea
                    id="custom-principal"
                    value={customPrincipal}
                    onChange={(e) => setCustomPrincipal(e.target.value)}
                    placeholder='{"type": "jwt", "subject": "sub=test@example.com", "roles": ["user"]}'
                    rows={4}
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="test-principal">Select Principal</Label>
                  <Select value={selectedPrincipal} onValueChange={setSelectedPrincipal}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a principal to test" />
                    </SelectTrigger>
                    <SelectContent>
                      {samplePrincipals.map((principal) => (
                        <SelectItem key={principal.id} value={principal.id}>
                          {principal.name} ({principal.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="test-policy">Select Policy *</Label>
              <Select value={selectedPolicy} onValueChange={setSelectedPolicy}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a policy to test" />
                </SelectTrigger>
                <SelectContent>
                  {samplePolicies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="test-action">Action *</Label>
              <Select value={testAction} onValueChange={setTestAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an action to test" />
                </SelectTrigger>
                <SelectContent>
                  {predefinedActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="test-resource">Resource *</Label>
              <Input
                id="test-resource"
                value={testResource}
                onChange={(e) => setTestResource(e.target.value)}
                placeholder="e.g., lamassu.io/v1/ca/certificates/*"
              />
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button 
                onClick={runTest}
                disabled={isLoading || !selectedPolicy || (!selectedPrincipal && !customPrincipal) || !testAction || !testResource}
                className="flex-1"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Testing...</span>
                  </div>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Test
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={resetTest}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selected Policy Details</CardTitle>
            <CardDescription>
              {selectedPolicy 
                ? "Details of the policy that will be tested"
                : "Select a policy to see its details"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedPolicy ? (
              <div className="space-y-3">
                {samplePolicies
                  .filter(p => p.id === selectedPolicy)
                  .map((policy) => (
                  <div 
                    key={policy.id} 
                    className="border rounded p-3 border-primary bg-primary/5"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">{policy.name}</span>
                      </div>
                      <Badge variant="default" className="text-xs">
                        Selected for Test
                      </Badge>
                    </div>
                    {policy.statements.map((statement, index) => (
                      <div key={index} className="text-sm space-y-1">
                        <div className="flex items-center space-x-2">
                          <Badge variant={statement.effect === 'Allow' ? 'default' : 'destructive'}>
                            {statement.effect}
                          </Badge>
                        </div>
                        <div>
                          <span className="font-medium">Actions: </span>
                          {statement.actions.join(', ')}
                        </div>
                        <div>
                          <span className="font-medium">Resources: </span>
                          {statement.resources.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Please select a policy from the test configuration to see its details.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {testResult?.decision === 'Allow' ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : testResult?.decision === 'Deny' ? (
                <X className="h-5 w-5 text-red-500" />
              ) : (
                <Info className="h-5 w-5 text-muted-foreground" />
              )}
              <span>Test Results</span>
            </CardTitle>
            <CardDescription>
              Access control decision and evaluation details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testResult ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div>
                    <Label className="text-sm font-medium">Decision:</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge 
                        variant={testResult.decision === 'Allow' ? 'default' : 'destructive'}
                        className="text-lg px-3 py-1"
                      >
                        {testResult.decision}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Reason:</Label>
                  <p className="text-sm mt-1">{testResult.reason}</p>
                </div>

                {testResult.matchedPolicies.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Matched Policies:</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {testResult.matchedPolicies.map((policy, index) => (
                        <Badge key={index} variant="outline">
                          {policy}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {testResult.details.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Evaluation Details:</Label>
                    <ul className="text-sm mt-1 space-y-1">
                      {testResult.details.map((detail, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Configure a test scenario and click "Run Test" to see the access control decision.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle>Test Summary</CardTitle>
              <CardDescription>
                Summary of the access control evaluation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Principal</TableCell>
                    <TableCell>
                      {useCustomPrincipal ? 'Custom JSON' : 
                        samplePrincipals.find(p => p.id === selectedPrincipal)?.name || 'Unknown'
                      }
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Policy</TableCell>
                    <TableCell>
                      {samplePolicies.find(p => p.id === selectedPolicy)?.name || 'Unknown'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Action</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-1 py-0.5 rounded">{testAction}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Resource</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-1 py-0.5 rounded">{testResource}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Decision</TableCell>
                    <TableCell>
                      <Badge variant={testResult.decision === 'Allow' ? 'default' : 'destructive'}>
                        {testResult.decision}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Policies Evaluated</TableCell>
                    <TableCell>
                      1
                      <Badge variant="outline" className="ml-2 text-xs">
                        Specific Policy
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Policies Matched</TableCell>
                    <TableCell>{testResult.matchedPolicies.length}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Test Examples</CardTitle>
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
      </div>
    </div>
  );
}