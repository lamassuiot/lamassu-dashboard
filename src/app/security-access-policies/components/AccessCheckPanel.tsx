"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle, Shield, List, Database } from "lucide-react";
import type {
  CheckAccessRequest,
  CheckAccessResponse,
  ListResourcesRequest,
  ListResourcesResponse,
  PrincipalDefinition,
  Entity,
} from "@/types/authorization";
import { listPrincipals, listEntities } from "@/lib/authz-api";
import { useAuth } from "@/contexts/AuthContext";

interface AccessCheckPanelProps {
  onCheckAccess: (request: CheckAccessRequest) => Promise<CheckAccessResponse>;
  onListResources?: (request: ListResourcesRequest) => Promise<ListResourcesResponse>;
}

export function AccessCheckPanel({ onCheckAccess, onListResources }: AccessCheckPanelProps) {
  const [activeTab, setActiveTab] = useState("check");
  
  // Check Access Tab State
  const [checkPrincipal, setCheckPrincipal] = useState("");
  const [checkResource, setCheckResource] = useState("");
  const [checkAction, setCheckAction] = useState("");
  const [checkResult, setCheckResult] = useState<CheckAccessResponse | null>(null);
  const [isCheckLoading, setIsCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // List Resources Tab State
  const [listPrincipal, setListPrincipal] = useState("");
  const [listEntityType, setListEntityType] = useState("");
  const [listResult, setListResult] = useState<ListResourcesResponse | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Principals for selectors
  const [principals, setPrincipalsList] = useState<PrincipalDefinition[]>([]);
  const [loadingPrincipals, setLoadingPrincipals] = useState(false);
  
  // Entities for action options
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  
  const { user } = useAuth();
  const token = user?.access_token;

  useEffect(() => {
    fetchPrincipals();
    fetchEntities();
  }, []);

  const fetchPrincipals = async () => {
    setLoadingPrincipals(true);
    try {
      const response = await listPrincipals(undefined, token);
      setPrincipalsList(response.principals || []);
    } catch (error) {
      console.error("Failed to fetch principals:", error);
      setPrincipalsList([]);
    } finally {
      setLoadingPrincipals(false);
    }
  };

  const fetchEntities = async () => {
    setLoadingEntities(true);
    try {
      const response = await listEntities(token);
      setEntities(response.entities || []);
    } catch (error) {
      console.error("Failed to fetch entities:", error);
      // Fallback to default entities if API fails
      setEntities([
        { name: "ca", description: "CA", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "create", "update", "delete", "import", "revoke"] },
        { name: "dms", description: "DMS", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "create", "update", "delete"] },
        { name: "device", description: "Device", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "create", "update", "delete", "enroll", "revoke"] },
        { name: "certificate", description: "Certificate", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "create", "delete", "revoke", "renew"] },
        { name: "device_group", description: "Device Group", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "create", "update", "delete"] },
      ]);
    } finally {
      setLoadingEntities(false);
    }
  };

  // Get actions relevant to the current resource type
  const getRelevantActions = () => {
    // Extract resource type from resource string (e.g., "device:DEV-001" -> "device")
    const resourceType = checkResource.split(':')[0]?.toLowerCase().trim();
    
    if (!resourceType) {
      // No resource type specified, return common actions
      return ["read", "write", "create", "update", "delete", "list", "manage"];
    }
    
    // Find matching entity
    const entity = entities.find(e => e.name === resourceType);
    
    if (entity) {
      const actions = [...entity.actions];
      if (entity.supports_list_action) {
        actions.push("list");
      }
      return actions.sort();
    }
    
    // Fallback to common actions
    return ["read", "write", "create", "update", "delete", "list", "manage"];
  };

  const handleCheckAccess = async () => {
    if (!checkPrincipal || !checkResource || !checkAction) return;

    setIsCheckLoading(true);
    setCheckError(null);
    try {
      const response = await onCheckAccess({
        principal: checkPrincipal,
        resource: checkResource,
        action: checkAction,
      });
      setCheckResult(response);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Failed to check access");
      setCheckResult(null);
    } finally {
      setIsCheckLoading(false);
    }
  };

  const handleListResources = async () => {
    if (!listPrincipal || !listEntityType || !onListResources) return;

    setIsListLoading(true);
    setListError(null);
    try {
      const response = await onListResources({
        principal: listPrincipal,
        entity_type: listEntityType,
        action: "list",
      });
      setListResult(response);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to list resources");
      setListResult(null);
    } finally {
      setIsListLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Test Access Control
        </CardTitle>
        <CardDescription>
          Test authorization checks and list accessible resources
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="check" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Check Access
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              List Resources
            </TabsTrigger>
          </TabsList>

          {/* Check Access Tab */}
          <TabsContent value="check" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Principal</Label>
                <Select value={checkPrincipal} onValueChange={setCheckPrincipal} disabled={loadingPrincipals}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingPrincipals ? "Loading..." : "Select principal"} />
                  </SelectTrigger>
                  <SelectContent>
                    {principals.map((p) => (
                      <SelectItem key={p.name} value={p.id || p.name}>
                        {p.name} ({p.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Resource</Label>
                  <Input
                    placeholder="e.g., device:DEV-001"
                    value={checkResource}
                    onChange={(e) => setCheckResource(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Format: type:id</p>
                </div>
                <div className="grid gap-2">
                  <Label>Action</Label>
                  <Select value={checkAction} onValueChange={setCheckAction} disabled={!checkResource}>
                    <SelectTrigger>
                      <SelectValue placeholder={checkResource ? "Select action" : "Enter resource first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {getRelevantActions().map((action) => (
                        <SelectItem key={action} value={action}>
                          {action.charAt(0).toUpperCase() + action.slice(1)}
                        </SelectItem>
                      ))}
                      <SelectItem value="*">* (All actions)</SelectItem>
                    </SelectContent>
                  </Select>
                  {checkResource && (
                    <p className="text-xs text-muted-foreground">
                      Actions for: {checkResource.split(':')[0] || 'resource type'}
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={handleCheckAccess}
                disabled={isCheckLoading || !checkPrincipal || !checkResource || !checkAction}
              >
                {isCheckLoading ? "Checking..." : "Check Access"}
              </Button>

              {checkError && (
                <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                  {checkError}
                </div>
              )}

              {checkResult && (
                <div
                  className={`p-4 rounded-lg border ${
                    checkResult.allowed
                      ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                      : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {checkResult.allowed ? (
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
                  <p className="text-sm mb-2">{checkResult.reason}</p>
                  {checkResult.access_check_sql && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                        View SQL Query
                      </summary>
                      <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto font-mono">
                        {checkResult.access_check_sql}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* List Resources Tab */}
          <TabsContent value="list" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Principal</Label>
                <Select value={listPrincipal} onValueChange={setListPrincipal} disabled={loadingPrincipals}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingPrincipals ? "Loading..." : "Select principal"} />
                  </SelectTrigger>
                  <SelectContent>
                    {principals.map((p) => (
                      <SelectItem key={p.name} value={p.id || p.name}>
                        {p.name} ({p.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label>Entity Type</Label>
                <Select value={listEntityType} onValueChange={setListEntityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="certificate">Certificate</SelectItem>
                    <SelectItem value="dms">DMS</SelectItem>
                    <SelectItem value="device_group">Device Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleListResources}
                disabled={isListLoading || !listPrincipal || !listEntityType}
              >
                {isListLoading ? "Loading..." : "List Resources"}
              </Button>

              {listError && (
                <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                  {listError}
                </div>
              )}

              {listResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      <span className="font-medium">
                        Found {listResult.count} {listResult.entity_type}(s)
                      </span>
                    </div>
                  </div>

                  {listResult.resources && listResult.resources.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(listResult.resources[0]).map((key) => (
                              <TableHead key={key} className="capitalize">
                                {key.replace(/_/g, " ")}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listResult.resources.slice(0, 10).map((resource, idx) => (
                            <TableRow key={idx}>
                              {Object.values(resource).map((value, i) => (
                                <TableCell key={i} className="font-mono text-xs">
                                  {String(value)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {listResult.resources.length > 10 && (
                        <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                          Showing first 10 of {listResult.resources.length} resources
                        </div>
                      )}
                    </div>
                  )}

                  {listResult.sql && (
                    <details>
                      <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                        View SQL Query
                      </summary>
                      <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto font-mono">
                        {listResult.sql}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
