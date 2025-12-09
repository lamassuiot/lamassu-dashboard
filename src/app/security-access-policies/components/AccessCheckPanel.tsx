"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Shield } from "lucide-react";
import type { CheckAccessRequest, CheckAccessResponse } from "@/types/authorization";

interface AccessCheckPanelProps {
  onCheckAccess: (request: CheckAccessRequest) => Promise<CheckAccessResponse>;
}

export function AccessCheckPanel({ onCheckAccess }: AccessCheckPanelProps) {
  const [principal, setPrincipal] = useState("");
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState<CheckAccessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!principal || !resource || !action) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await onCheckAccess({ principal, resource, action });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check access");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Access Check
        </CardTitle>
        <CardDescription>
          Test if a principal can perform an action on a specific resource
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="check-principal">Principal</Label>
              <Input
                id="check-principal"
                placeholder="e.g., user:alice"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="check-resource">Resource</Label>
              <Input
                id="check-resource"
                placeholder="e.g., device:DEV-001"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="check-action">Action</Label>
              <Input
                id="check-action"
                placeholder="e.g., read"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleCheck}
            disabled={isLoading || !principal || !resource || !action}
            className="w-full md:w-auto"
          >
            {isLoading ? "Checking..." : "Check Access"}
          </Button>

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          {result && (
            <div
              className={`p-4 rounded-lg border ${
                result.allowed
                  ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                  : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {result.allowed ? (
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
              <p className="text-sm text-muted-foreground">{result.reason}</p>
              {result.access_check_sql && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-muted-foreground">
                    View SQL Query
                  </summary>
                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                    {result.access_check_sql}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
