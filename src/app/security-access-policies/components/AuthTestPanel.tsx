"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Shield, Key, Fingerprint, User } from "lucide-react";
import type {
  PrincipalType,
  CheckAccessWithAuthRequest,
  CheckAccessWithAuthResponse,
  ResolvePrincipalRequest,
  ResolvePrincipalResponse,
} from "@/types/authorization";

interface AuthTestPanelProps {
  onCheckAccessWithAuth: (request: CheckAccessWithAuthRequest) => Promise<CheckAccessWithAuthResponse>;
  onResolvePrincipal: (request: ResolvePrincipalRequest) => Promise<ResolvePrincipalResponse>;
}

export function AuthTestPanel({ onCheckAccessWithAuth, onResolvePrincipal }: AuthTestPanelProps) {
  const [authType, setAuthType] = useState<PrincipalType>("oidc");
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  
  // OIDC context
  const [oidcSub, setOidcSub] = useState("");
  const [oidcIss, setOidcIss] = useState("");
  const [oidcEmail, setOidcEmail] = useState("");
  const [jwtClaimsJson, setJwtClaimsJson] = useState("");
  
  // X509 context
  const [x509Ski, setX509Ski] = useState("");
  const [x509Aki, setX509Aki] = useState("");
  const [x509Cn, setX509Cn] = useState("");
  const [x509Subject, setX509Subject] = useState("");
  const [x509Issuer, setX509Issuer] = useState("");
  
  // API Key context
  const [apiKeyId, setApiKeyId] = useState("");
  
  const [accessResult, setAccessResult] = useState<CheckAccessWithAuthResponse | null>(null);
  const [resolveResult, setResolveResult] = useState<ResolvePrincipalResponse | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildAuthContext = () => {
    if (authType === "oidc") {
      let jwtClaims = {};
      if (jwtClaimsJson.trim()) {
        try {
          jwtClaims = JSON.parse(jwtClaimsJson);
        } catch {
          throw new Error("Invalid JWT claims JSON");
        }
      }
      return {
        ...(oidcSub && { oidc_sub: oidcSub }),
        ...(oidcIss && { oidc_iss: oidcIss }),
        ...(oidcEmail && { oidc_email: oidcEmail }),
        ...(Object.keys(jwtClaims).length > 0 && { jwt_claims: jwtClaims }),
      };
    } else if (authType === "x509") {
      return {
        ...(x509Ski && { x509_ski: x509Ski }),
        ...(x509Aki && { x509_aki: x509Aki }),
        ...(x509Cn && { x509_cn: x509Cn }),
        ...(x509Subject && { x509_subject: x509Subject }),
        ...(x509Issuer && { x509_issuer: x509Issuer }),
      };
    } else {
      return {
        ...(apiKeyId && { apikey_id: apiKeyId }),
      };
    }
  };

  const handleCheckAccess = async () => {
    if (!resource || !action) return;
    
    setIsCheckingAccess(true);
    setError(null);
    setAccessResult(null);
    
    try {
      const authContext = buildAuthContext();
      const response = await onCheckAccessWithAuth({
        auth_type: authType,
        auth_context: authContext,
        resource,
        action,
      });
      setAccessResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check access");
    } finally {
      setIsCheckingAccess(false);
    }
  };

  const handleResolve = async () => {
    setIsResolving(true);
    setError(null);
    setResolveResult(null);
    
    try {
      const authContext = buildAuthContext();
      const response = await onResolvePrincipal({
        type: authType,
        auth_context: authContext,
      });
      setResolveResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve principal");
    } finally {
      setIsResolving(false);
    }
  };

  const getAuthTypeIcon = (type: PrincipalType) => {
    switch (type) {
      case "oidc": return <User className="h-4 w-4" />;
      case "x509": return <Fingerprint className="h-4 w-4" />;
      case "apikey": return <Key className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Test Authentication & Access
        </CardTitle>
        <CardDescription>
          Test principal resolution and access control with different authentication types
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auth Type Selection */}
        <Tabs value={authType} onValueChange={(v) => setAuthType(v as PrincipalType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="oidc" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              OIDC/JWT
            </TabsTrigger>
            <TabsTrigger value="x509" className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" />
              X.509
            </TabsTrigger>
            <TabsTrigger value="apikey" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Key
            </TabsTrigger>
          </TabsList>

          {/* OIDC Auth Context */}
          <TabsContent value="oidc" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Subject (sub)</Label>
                <Input
                  placeholder="e.g., alice-uuid-12345"
                  value={oidcSub}
                  onChange={(e) => setOidcSub(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Issuer (iss)</Label>
                <Input
                  placeholder="e.g., https://keycloak.example.com/realms/lamassu"
                  value={oidcIss}
                  onChange={(e) => setOidcIss(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input
                  placeholder="e.g., alice@example.com"
                  value={oidcEmail}
                  onChange={(e) => setOidcEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>JWT Claims (JSON)</Label>
              <Textarea
                placeholder='{"roles": ["admin"], "tenant_id": "tenant-123"}'
                value={jwtClaimsJson}
                onChange={(e) => setJwtClaimsJson(e.target.value)}
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </TabsContent>

          {/* X509 Auth Context */}
          <TabsContent value="x509" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Subject Key Identifier (SKI)</Label>
                <Input
                  placeholder="e.g., device-001-ski"
                  value={x509Ski}
                  onChange={(e) => setX509Ski(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Authority Key Identifier (AKI)</Label>
                <Input
                  placeholder="e.g., a1b2c3d4..."
                  value={x509Aki}
                  onChange={(e) => setX509Aki(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Common Name (CN)</Label>
                <Input
                  placeholder="e.g., tenant-123-device-001"
                  value={x509Cn}
                  onChange={(e) => setX509Cn(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Subject DN</Label>
                <Input
                  placeholder="e.g., CN=device-001,O=Example Corp"
                  value={x509Subject}
                  onChange={(e) => setX509Subject(e.target.value)}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Issuer DN</Label>
                <Input
                  placeholder="e.g., CN=Example Corp CA,O=Example Corp"
                  value={x509Issuer}
                  onChange={(e) => setX509Issuer(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          {/* API Key Auth Context */}
          <TabsContent value="apikey" className="space-y-4 mt-4">
            <div className="grid gap-2">
              <Label>API Key ID</Label>
              <Input
                placeholder="e.g., admin-api-key-001"
                value={apiKeyId}
                onChange={(e) => setApiKeyId(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Access Check Inputs */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-4">Access Check Parameters</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Resource</Label>
              <Input
                placeholder="e.g., device:DEV-001"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Action</Label>
              <Input
                placeholder="e.g., read, write, delete"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleResolve} disabled={isResolving} variant="outline">
            {isResolving ? "Resolving..." : "Resolve Principal"}
          </Button>
          <Button onClick={handleCheckAccess} disabled={isCheckingAccess || !resource || !action}>
            {isCheckingAccess ? "Checking..." : "Check Access"}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
            {error}
          </div>
        )}

        {/* Resolve Result */}
        {resolveResult && (
          <div className="p-4 rounded-lg border bg-muted/50">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              {getAuthTypeIcon(authType)}
              Resolved Principals
            </h4>
            {resolveResult.matched_principals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching principals found</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {resolveResult.matched_principals.map((p, i) => (
                  <Badge key={i} variant="secondary">
                    {p.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Access Result */}
        {accessResult && (
          <div
            className={`p-4 rounded-lg border ${
              accessResult.allowed
                ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {accessResult.allowed ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <Badge variant="default" className="bg-green-600">
                    Access Granted
                  </Badge>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <Badge variant="destructive">Access Denied</Badge>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">{accessResult.reason}</p>
            {accessResult.matched_principals && accessResult.matched_principals.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">Matched Principals: </span>
                {accessResult.matched_principals.map((p, i) => (
                  <Badge key={i} variant="outline" className="ml-1 text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
            {accessResult.access_check_sql && (
              <details className="mt-2">
                <summary className="text-xs cursor-pointer text-muted-foreground">
                  View SQL Query
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                  {accessResult.access_check_sql}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
