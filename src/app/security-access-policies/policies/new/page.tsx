'use client';

import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2, FileText, Check, X, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

interface PolicyStatement {
  effect: 'Allow' | 'Deny';
  actions: string[];
  resources: string[];
}

const predefinedActions = [
  'lamassu:sign_certificate',
  'lamassu:revoke_certificate',
  'lamassu:read_certificate',
  'lamassu:read_crl',
  'lamassu:publish_crl',
  'lamassu:create_ca',
  'lamassu:delete_ca',
  'lamassu:import_ca',
  'lamassu:update_ca_metadata'
];

const predefinedResources = [
  'lamassu.io/v1/ca/*',
  'lamassu.io/v1/ca/certificates/*',
  'lamassu.io/v1/ca/crl/*',
  'lamassu.io/v1/devices/*',
  'lamassu.io/v1/signing-profiles/*'
];

export default function NewPolicyPage() {
  const [policyName, setPolicyName] = useState('');
  const [description, setDescription] = useState('');
  const [statements, setStatements] = useState<PolicyStatement[]>([
    { effect: 'Allow', actions: [], resources: [] }
  ]);

  const addStatement = () => {
    setStatements([...statements, { effect: 'Allow', actions: [], resources: [] }]);
  };

  const removeStatement = (index: number) => {
    if (statements.length > 1) {
      setStatements(statements.filter((_, i) => i !== index));
    }
  };

  const updateStatement = (index: number, field: keyof PolicyStatement, value: any) => {
    const updated = [...statements];
    updated[index] = { ...updated[index], [field]: value };
    setStatements(updated);
  };

  const addAction = (statementIndex: number, action: string) => {
    if (action && !statements[statementIndex].actions.includes(action)) {
      const updated = [...statements];
      updated[statementIndex].actions.push(action);
      setStatements(updated);
    }
  };

  const removeAction = (statementIndex: number, actionIndex: number) => {
    const updated = [...statements];
    updated[statementIndex].actions.splice(actionIndex, 1);
    setStatements(updated);
  };

  const addResource = (statementIndex: number, resource: string) => {
    if (resource && !statements[statementIndex].resources.includes(resource)) {
      const updated = [...statements];
      updated[statementIndex].resources.push(resource);
      setStatements(updated);
    }
  };

  const removeResource = (statementIndex: number, resourceIndex: number) => {
    const updated = [...statements];
    updated[statementIndex].resources.splice(resourceIndex, 1);
    setStatements(updated);
  };

  const generatePolicyJSON = () => {
    return JSON.stringify(statements, null, 2);
  };

  const isValidPolicy = () => {
    return policyName.trim() !== '' && 
           statements.every(s => s.actions.length > 0 && s.resources.length > 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/security-access-policies">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Policies
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create New Policy</h1>
          <p className="text-muted-foreground">
            Define access control policies that specify what actions are allowed on which resources
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Policy Builder */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Policy Details</CardTitle>
              <CardDescription>
                Basic information about the access control policy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="policy-name">Policy Name *</Label>
                <Input
                  id="policy-name"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  placeholder="e.g., CA Administrator Policy"
                />
              </div>
              <div>
                <Label htmlFor="policy-description">Description</Label>
                <Textarea
                  id="policy-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this policy allows or denies"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Policy Statements
                <Button onClick={addStatement} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Statement
                </Button>
              </CardTitle>
              <CardDescription>
                Define what actions are allowed or denied on which resources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {statements.map((statement, statementIndex) => (
                <div key={statementIndex} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Statement {statementIndex + 1}</h4>
                    {statements.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStatement(statementIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <Label>Effect *</Label>
                    <Select
                      value={statement.effect}
                      onValueChange={(value) => updateStatement(statementIndex, 'effect', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Allow">Allow</SelectItem>
                        <SelectItem value="Deny">Deny</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Actions *</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Select
                          onValueChange={(value) => addAction(statementIndex, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an action" />
                          </SelectTrigger>
                          <SelectContent>
                            {predefinedActions.map((action) => (
                              <SelectItem key={action} value={action}>
                                {action}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Or type custom action"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              addAction(statementIndex, e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {statement.actions.map((action, actionIndex) => (
                          <Badge key={actionIndex} variant="outline" className="text-xs">
                            {action}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 ml-2"
                              onClick={() => removeAction(statementIndex, actionIndex)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Resources *</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Select
                          onValueChange={(value) => addResource(statementIndex, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a resource" />
                          </SelectTrigger>
                          <SelectContent>
                            {predefinedResources.map((resource) => (
                              <SelectItem key={resource} value={resource}>
                                {resource}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Or type custom resource"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              addResource(statementIndex, e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {statement.resources.map((resource, resourceIndex) => (
                          <Badge key={resourceIndex} variant="outline" className="text-xs font-mono">
                            {resource}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 ml-2"
                              onClick={() => removeResource(statementIndex, resourceIndex)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button 
              onClick={() => console.log('Save policy')}
              disabled={!isValidPolicy()}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              Create Policy
            </Button>
            <Button variant="outline" asChild>
              <Link href="/security-access-policies">
                Cancel
              </Link>
            </Button>
          </div>
        </div>

        {/* Policy Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Policy Preview
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(generatePolicyJSON())}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy JSON
                </Button>
              </CardTitle>
              <CardDescription>
                Preview of the policy in JSON format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto">
                {generatePolicyJSON()}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Policy Summary</CardTitle>
              <CardDescription>
                Human-readable summary of the policy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {policyName && (
                <div>
                  <Label className="text-sm font-medium">Policy Name:</Label>
                  <p className="text-sm">{policyName}</p>
                </div>
              )}
              
              {description && (
                <div>
                  <Label className="text-sm font-medium">Description:</Label>
                  <p className="text-sm">{description}</p>
                </div>
              )}

              <Separator />

              <div>
                <Label className="text-sm font-medium">Statements:</Label>
                <div className="space-y-3 mt-2">
                  {statements.map((statement, index) => (
                    <div key={index} className="border rounded p-3 text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={statement.effect === 'Allow' ? 'default' : 'destructive'}>
                          {statement.effect}
                        </Badge>
                        <span className="text-muted-foreground">Statement {index + 1}</span>
                      </div>
                      
                      {statement.actions.length > 0 && (
                        <div className="mb-2">
                          <span className="font-medium">Actions: </span>
                          {statement.actions.join(', ')}
                        </div>
                      )}
                      
                      {statement.resources.length > 0 && (
                        <div>
                          <span className="font-medium">Resources: </span>
                          {statement.resources.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {!isValidPolicy() && (
                <Alert>
                  <AlertDescription>
                    Policy is incomplete. Please provide a name and ensure all statements have at least one action and one resource.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}