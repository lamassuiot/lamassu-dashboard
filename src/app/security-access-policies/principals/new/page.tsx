'use client';

import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2, User, Key, Check, X, Copy, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

type PrincipalType = 'certificate' | 'jwt';

interface CertificatePrincipal {
  type: 'certificate';
  subject: string;
  ski?: string;
  issuer?: string;
  serialNumber?: string;
}

interface JWTPrincipal {
  type: 'jwt';
  subject: string;
  roles: string[];
  rolesClaim: string;
  additionalClaims?: Record<string, string>;
}

const predefinedRoles = [
  'ca-admin',
  'super-admin',
  'auditor',
  'operator',
  'user',
  'guest',
  'certificate-manager',
  'device-manager'
];

// Sample CAs for Authority Key ID selection
const sampleCAs = [
  {
    id: 'ca-1',
    name: 'Root CA',
    subject: 'cn=root-ca,o=company',
    keyId: '1a2b3c4d5e6f7890abcdef1234567890abcdef12'
  },
  {
    id: 'ca-2', 
    name: 'Intermediate CA',
    subject: 'cn=intermediate-ca,ou=pki,o=company',
    keyId: '9876543210fedcba0987654321fedcba09876543'
  },
  {
    id: 'ca-3',
    name: 'Device CA',
    subject: 'cn=device-ca,ou=iot,o=company', 
    keyId: 'abcdef1234567890fedcba0987654321fedcba09'
  }
];

type PrincipalType = 'certificate' | 'jwt';

interface CertificatePrincipal {
  type: 'certificate';
  subject: string;
  ski?: string;
  serialNumber?: string;
  authorityKeyId?: string;
  issuerCA?: string;
}

interface JWTPrincipal {
  type: 'jwt';
  subject: string;
  roles: string[];
  rolesClaim: string;
  additionalClaims?: Record<string, string>;
}

export default function NewPrincipalPage() {
  const [principalName, setPrincipalName] = useState('');
  const [description, setDescription] = useState('');
  const [principalType, setPrincipalType] = useState<PrincipalType>('jwt');
  
  // Certificate Principal State
  const [certSubject, setCertSubject] = useState('');
  const [certSKI, setCertSKI] = useState('');
  const [certSerialNumber, setCertSerialNumber] = useState('');
  const [certAuthorityKeyId, setCertAuthorityKeyId] = useState('');
  const [selectedCA, setSelectedCA] = useState('');
  
  // JWT Principal State
  const [jwtSubject, setJwtSubject] = useState('');
  const [jwtRoles, setJwtRoles] = useState<string[]>([]);
  const [jwtRolesClaim, setJwtRolesClaim] = useState('roles');
  const [additionalClaims, setAdditionalClaims] = useState<Record<string, string>>({});

  const handleCASelection = (caId: string) => {
    setSelectedCA(caId);
    const selectedCAData = sampleCAs.find(ca => ca.id === caId);
    if (selectedCAData) {
      setCertAuthorityKeyId(selectedCAData.keyId);
    }
  };

  const addRole = (role: string) => {
    if (role && !jwtRoles.includes(role)) {
      setJwtRoles([...jwtRoles, role]);
    }
  };

  const removeRole = (index: number) => {
    setJwtRoles(jwtRoles.filter((_, i) => i !== index));
  };

  const addClaim = (key: string, value: string) => {
    if (key && value) {
      setAdditionalClaims({ ...additionalClaims, [key]: value });
    }
  };

  const removeClaim = (key: string) => {
    const updated = { ...additionalClaims };
    delete updated[key];
    setAdditionalClaims(updated);
  };

  const generatePrincipalJSON = () => {
    if (principalType === 'certificate') {
      const principal: CertificatePrincipal = {
        type: 'certificate',
        subject: certSubject
      };
      
      if (certSubject) principal.subject = certSubject;
      if (certSKI) principal.ski = certSKI;
      if (certSerialNumber) principal.serialNumber = certSerialNumber;
      if (certAuthorityKeyId) principal.authorityKeyId = certAuthorityKeyId;
      if (selectedCA) principal.issuerCA = selectedCA;
      
      return JSON.stringify(principal, null, 2);
    } else {
      const principal: JWTPrincipal = {
        type: 'jwt',
        subject: jwtSubject,
        roles: jwtRoles,
        rolesClaim: jwtRolesClaim
      };
      
      if (Object.keys(additionalClaims).length > 0) {
        principal.additionalClaims = additionalClaims;
      }
      
      return JSON.stringify(principal, null, 2);
    }
  };

  const isValidPrincipal = () => {
    if (!principalName.trim()) return false;
    
    if (principalType === 'certificate') {
      return certSubject.trim() !== '';
    } else {
      return jwtSubject.trim() !== '' && jwtRoles.length > 0;
    }
  };

  const parseCertificateFile = (content: string) => {
    // This is a simplified parser - in a real implementation, you'd use PKI.js
    try {
      // Extract subject from certificate content (simplified)
      const subjectMatch = content.match(/Subject:\s*(.+)/i);
      if (subjectMatch) {
        setCertSubject(subjectMatch[1].trim());
      }
      
      // Extract serial number
      const serialMatch = content.match(/Serial Number:\s*(.+)/i);
      if (serialMatch) {
        setCertSerialNumber(serialMatch[1].trim());
      }
    } catch (error) {
      console.error('Error parsing certificate:', error);
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Register New Principal</h1>
          <p className="text-muted-foreground">
            Register identity principals that can be granted access through policies
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Principal Builder */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Principal Details</CardTitle>
              <CardDescription>
                Basic information about the identity principal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="principal-name">Principal Name *</Label>
                <Input
                  id="principal-name"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value)}
                  placeholder="e.g., Alice Certificate Principal"
                />
              </div>
              <div>
                <Label htmlFor="principal-description">Description</Label>
                <Textarea
                  id="principal-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this principal"
                  rows={2}
                />
              </div>
              <div>
                <Label>Principal Type *</Label>
                <Select value={principalType} onValueChange={(value: PrincipalType) => setPrincipalType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jwt">JWT Token</SelectItem>
                    <SelectItem value="certificate">X.509 Certificate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                {principalType === 'certificate' ? <Key className="h-5 w-5" /> : <User className="h-5 w-5" />}
                <span>{principalType === 'certificate' ? 'Certificate' : 'JWT'} Principal Configuration</span>
              </CardTitle>
              <CardDescription>
                Configure the {principalType === 'certificate' ? 'X.509 certificate' : 'JWT token'} identity details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={principalType} className="w-full">
                <TabsContent value="certificate" className="space-y-4">
                  <div>
                    <Label htmlFor="cert-subject">Subject (DN) *</Label>
                    <Input
                      id="cert-subject"
                      value={certSubject}
                      onChange={(e) => setCertSubject(e.target.value)}
                      placeholder="cn=alice@example.com,ou=engineering,o=company"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cert-ski">Subject Key Identifier (SKI)</Label>
                    <Input
                      id="cert-ski"
                      value={certSKI}
                      onChange={(e) => setCertSKI(e.target.value)}
                      placeholder="1234567890abcdef..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="cert-serial">Serial Number</Label>
                    <Input
                      id="cert-serial"
                      value={certSerialNumber}
                      onChange={(e) => setCertSerialNumber(e.target.value)}
                      placeholder="123456789"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="cert-authority-key">Authority Key Identifier</Label>
                    <div className="space-y-2">
                      <Select value={selectedCA} onValueChange={handleCASelection}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select issuing CA" />
                        </SelectTrigger>
                        <SelectContent>
                          {sampleCAs.map((ca) => (
                            <SelectItem key={ca.id} value={ca.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{ca.name}</span>
                                <span className="text-xs text-muted-foreground">{ca.subject}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        id="cert-authority-key"
                        value={certAuthorityKeyId}
                        onChange={(e) => setCertAuthorityKeyId(e.target.value)}
                        placeholder="Authority Key Identifier (auto-filled from CA selection)"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <Label>Upload Certificate (Optional)</Label>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload PEM File
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Auto-fill fields from certificate
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="jwt" className="space-y-4">
                  <div>
                    <Label htmlFor="jwt-subject">Subject (sub claim) *</Label>
                    <Input
                      id="jwt-subject"
                      value={jwtSubject}
                      onChange={(e) => setJwtSubject(e.target.value)}
                      placeholder="sub=admin@company.com"
                    />
                  </div>
                  
                  <div>
                    <Label>Roles *</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Select onValueChange={(value) => addRole(value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            {predefinedRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Or type custom role"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              addRole(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {jwtRoles.map((role, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {role}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 ml-2"
                              onClick={() => removeRole(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="roles-claim">Roles Claim Name</Label>
                    <Input
                      id="roles-claim"
                      value={jwtRolesClaim}
                      onChange={(e) => setJwtRolesClaim(e.target.value)}
                      placeholder="roles"
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label>Additional Claims (Optional)</Label>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Claim name" id="new-claim-key" />
                        <div className="flex gap-2">
                          <Input placeholder="Claim value" id="new-claim-value" />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const keyInput = document.getElementById('new-claim-key') as HTMLInputElement;
                              const valueInput = document.getElementById('new-claim-value') as HTMLInputElement;
                              if (keyInput && valueInput) {
                                addClaim(keyInput.value, valueInput.value);
                                keyInput.value = '';
                                valueInput.value = '';
                              }
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {Object.entries(additionalClaims).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between bg-muted p-2 rounded">
                          <span className="text-sm font-mono">{key}: {value}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeClaim(key)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button 
              onClick={() => console.log('Register principal')}
              disabled={!isValidPrincipal()}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              Register Principal
            </Button>
            <Button variant="outline" asChild>
              <Link href="/security-access-policies">
                Cancel
              </Link>
            </Button>
          </div>
        </div>

        {/* Principal Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Principal Preview
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(generatePrincipalJSON())}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy JSON
                </Button>
              </CardTitle>
              <CardDescription>
                Preview of the principal in JSON format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto">
                {generatePrincipalJSON()}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Principal Summary</CardTitle>
              <CardDescription>
                Human-readable summary of the principal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {principalName && (
                <div>
                  <Label className="text-sm font-medium">Principal Name:</Label>
                  <p className="text-sm">{principalName}</p>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">Type:</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant={principalType === 'certificate' ? 'default' : 'secondary'}>
                    {principalType === 'certificate' ? 'X.509 Certificate' : 'JWT Token'}
                  </Badge>
                </div>
              </div>

              {principalType === 'certificate' ? (
                <div className="space-y-2">
                  {certSubject && (
                    <div>
                      <Label className="text-sm font-medium">Subject:</Label>
                      <p className="text-sm font-mono">{certSubject}</p>
                    </div>
                  )}
                  {certSKI && (
                    <div>
                      <Label className="text-sm font-medium">SKI:</Label>
                      <p className="text-sm font-mono">{certSKI}</p>
                    </div>
                  )}
                  {certAuthorityKeyId && (
                    <div>
                      <Label className="text-sm font-medium">Authority Key ID:</Label>
                      <p className="text-sm font-mono">{certAuthorityKeyId}</p>
                      {selectedCA && (
                        <p className="text-xs text-muted-foreground mt-1">
                          From: {sampleCAs.find(ca => ca.id === selectedCA)?.name}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {jwtSubject && (
                    <div>
                      <Label className="text-sm font-medium">Subject:</Label>
                      <p className="text-sm font-mono">{jwtSubject}</p>
                    </div>
                  )}
                  {jwtRoles.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Roles:</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {jwtRoles.map((role, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.keys(additionalClaims).length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Additional Claims:</Label>
                      <div className="space-y-1 mt-1">
                        {Object.entries(additionalClaims).map(([key, value]) => (
                          <p key={key} className="text-sm font-mono">
                            {key}: {value}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isValidPrincipal() && (
                <Alert>
                  <AlertDescription>
                    Principal is incomplete. Please provide a name and the required identity information.
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