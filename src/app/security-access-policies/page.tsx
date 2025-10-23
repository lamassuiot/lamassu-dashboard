'use client';

import React, { useState } from 'react';
import { Shield, Plus, FileText, User, TestTube, Edit, Trash2, Copy, Download, Upload, UserCog, Key } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { AdvancedTestingComponent } from './components/AdvancedTestingComponent';
import RelationshipsFlowDiagram from '@/components/shared/RelationshipsFlowDiagram';

// Sample data for existing policies
const samplePolicies = [
  {
    id: 'policy-1',
    name: 'CA Administrator Policy',
    effect: 'Allow',
    actions: ['lamassu:sign_certificate', 'lamassu:revoke_certificate'],
    resources: ['lamassu.io/v1/ca/*', 'lamassu.io/v1/ca/certificates/*'],
    description: 'Allows CA administrators to sign and revoke certificates',
    created: '2024-10-01T10:00:00Z',
    lastModified: '2024-10-01T15:30:00Z'
  },
  {
    id: 'policy-2',
    name: 'Auditor Read-Only Policy',
    effect: 'Allow',
    actions: ['lamassu:read_certificate', 'lamassu:read_crl'],
    resources: ['lamassu.io/v1/ca/certificates/*', 'lamassu.io/v1/ca/crl/*'],
    description: 'Allows auditors to read certificates and CRLs',
    created: '2024-09-28T14:00:00Z',
    lastModified: '2024-09-28T14:00:00Z'
  }
];

// Sample data for existing principals
const samplePrincipals = [
  {
    id: 'principal-1',
    name: 'Alice Certificate Principal',
    type: 'certificate',
    subject: 'cn=alice@example.com,ou=engineering',
    ski: '1234567890abcdef1234567890abcdef12345678',
    created: '2024-10-01T09:00:00Z'
  },
  {
    id: 'principal-2',
    name: 'Admin JWT Principal',
    type: 'jwt',
    subject: 'sub=admin@company.com',
    roles: ['ca-admin', 'super-admin'],
    rolesClaim: 'roles',
    created: '2024-09-30T16:00:00Z'
  },
  {
    id: 'principal-3',
    name: 'Auditor JWT Principal',
    type: 'jwt',
    subject: 'sub=auditor@company.com',
    roles: ['auditor'],
    rolesClaim: 'roles',
    created: '2024-09-29T11:00:00Z'
  }
];

export default function SecurityAccessPoliciesPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Security Access & Policies</h1>
            <p className="text-muted-foreground">
              Manage access control policies and principals for your PKI infrastructure
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="principals">Principals</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="test">Test Access</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{samplePolicies.length}</div>
                <p className="text-xs text-muted-foreground">
                  Active access control policies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Principals</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{samplePrincipals.length}</div>
                <p className="text-xs text-muted-foreground">
                  Registered identity principals
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Certificate Principals</CardTitle>
                <Key className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {samplePrincipals.filter(p => p.type === 'certificate').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  X.509 certificate-based
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">JWT Principals</CardTitle>
                <UserCog className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {samplePrincipals.filter(p => p.type === 'jwt').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  JWT token-based
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Policy Changes</CardTitle>
                <CardDescription>Latest modifications to access policies</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex h-2 w-2 rounded-full bg-green-500"></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        CA Administrator Policy updated
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added revoke_certificate action - 2 hours ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex h-2 w-2 rounded-full bg-blue-500"></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        New Auditor Read-Only Policy created
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Restricts auditor access to read operations - 1 day ago
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Principal Activity</CardTitle>
                <CardDescription>Latest principal registrations and updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex h-2 w-2 rounded-full bg-green-500"></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Alice Certificate Principal registered
                      </p>
                      <p className="text-xs text-muted-foreground">
                        X.509 certificate-based identity - 3 hours ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex h-2 w-2 rounded-full bg-blue-500"></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Admin JWT Principal updated
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added super-admin role - 2 days ago
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Access Control Policies</h2>
              <p className="text-muted-foreground">
                Define what actions are allowed on which resources
              </p>
            </div>
            <Button asChild>
              <Link href="/security-access-policies/policies/new">
                <Plus className="h-4 w-4 mr-2" />
                Create Policy
              </Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Existing Policies</CardTitle>
              <CardDescription>
                Manage your access control policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy Name</TableHead>
                    <TableHead>Effect</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Resources</TableHead>
                    <TableHead>Last Modified</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samplePolicies.map((policy) => (
                    <TableRow key={policy.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{policy.name}</div>
                          <div className="text-sm text-muted-foreground">{policy.description}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={policy.effect === 'Allow' ? 'default' : 'destructive'}>
                          {policy.effect}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {policy.actions.map((action, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {policy.resources.map((resource, i) => (
                            <div key={i} className="text-xs font-mono">
                              {resource}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(policy.lastModified).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="principals" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Identity Principals</h2>
              <p className="text-muted-foreground">
                Manage certificate and JWT-based identity principals
              </p>
            </div>
            <Button asChild>
              <Link href="/security-access-policies/principals/new">
                <Plus className="h-4 w-4 mr-2" />
                Register Principal
              </Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Registered Principals</CardTitle>
              <CardDescription>
                View and manage identity principals that can be granted access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Principal Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Identity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samplePrincipals.map((principal) => (
                    <TableRow key={principal.id}>
                      <TableCell>
                        <div className="font-medium">{principal.name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={principal.type === 'certificate' ? 'default' : 'secondary'}>
                          {principal.type === 'certificate' ? 'X.509 Cert' : 'JWT Token'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">{principal.subject}</div>
                      </TableCell>
                      <TableCell>
                        {principal.type === 'certificate' ? (
                          <div className="text-xs">
                            <div>SKI: {principal.ski?.substring(0, 16)}...</div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {principal.roles?.map((role, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(principal.created).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relationships" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Entity Relationships</h2>
              <p className="text-muted-foreground">
                Visualize entity relationships and their access control permissions
              </p>
            </div>
          </div>
          
          <RelationshipsFlowDiagram />
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Test Access Control</h2>
              <p className="text-muted-foreground">
                Simulate access control decisions for principals and resources
              </p>
            </div>
          </div>

          <AdvancedTestingComponent />
        </TabsContent>
      </Tabs>
    </div>
  );
}