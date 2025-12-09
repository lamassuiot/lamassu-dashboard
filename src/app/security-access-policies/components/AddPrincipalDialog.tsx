"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import type {
  CreatePrincipalRequest,
  PrincipalType,
  OidcClaimMatcher,
} from "@/types/authorization";

interface AddPrincipalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPrincipal: (principal: CreatePrincipalRequest) => Promise<void>;
  isLoading?: boolean;
}

type OidcMode = "sub" | "claim";
type X509Mode = "aki" | "ski" | "subject_cn" | "subject_ou" | "san" | "issuer" | "thumbprint";
type MatcherOperator = "equals" | "contains" | "prefix" | "suffix" | "regex";

export function AddPrincipalDialog({
  open,
  onOpenChange,
  onAddPrincipal,
  isLoading,
}: AddPrincipalDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [principalType, setPrincipalType] = useState<PrincipalType>("oidc");
  const [enabled, setEnabled] = useState(true);

  // OIDC config
  const [oidcMode, setOidcMode] = useState<OidcMode>("sub");
  const [oidcSubValue, setOidcSubValue] = useState("");
  const [oidcSubValues, setOidcSubValues] = useState<string[]>([]);
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcClaimMatchers, setOidcClaimMatchers] = useState<OidcClaimMatcher[]>([
    { claim_name: "", operator: "equals", value: "" }
  ]);

  // X509 config
  const [x509Mode, setX509Mode] = useState<X509Mode>("aki");
  const [x509Value, setX509Value] = useState("");
  const [x509Values, setX509Values] = useState<string[]>([]);
  const [x509Operator, setX509Operator] = useState<MatcherOperator>("equals");

  // API Key config
  const [apiKeyId, setApiKeyId] = useState("");
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([]);
  const [apiKeyHash, setApiKeyHash] = useState("");
  const [apiKeyMode, setApiKeyMode] = useState<"single" | "multiple" | "hash">("single");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let matcherConfig;

    if (principalType === "oidc") {
      if (oidcMode === "sub") {
        matcherConfig = oidcSubValues.length > 0
          ? { mode: "sub" as const, values: oidcSubValues }
          : { mode: "sub" as const, value: oidcSubValue };
      } else {
        matcherConfig = {
          mode: "claim" as const,
          ...(oidcIssuer && { issuer: oidcIssuer }),
          claim_matchers: oidcClaimMatchers.filter(m => m.claim_name && m.value),
        };
      }
    } else if (principalType === "x509") {
      matcherConfig = x509Values.length > 0
        ? { mode: x509Mode, values: x509Values, ...(x509Operator !== "equals" && { operator: x509Operator }) }
        : { mode: x509Mode, value: x509Value, ...(x509Operator !== "equals" && { operator: x509Operator }) };
    } else {
      // API Key
      if (apiKeyMode === "single") {
        matcherConfig = { key_id: apiKeyId };
      } else if (apiKeyMode === "multiple") {
        matcherConfig = { key_ids: apiKeyIds };
      } else {
        matcherConfig = { key_hash: apiKeyHash };
      }
    }

    await onAddPrincipal({
      name,
      description,
      type: principalType,
      enabled,
      matcher_config: matcherConfig,
    });

    resetForm();
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrincipalType("oidc");
    setEnabled(true);
    setOidcMode("sub");
    setOidcSubValue("");
    setOidcSubValues([]);
    setOidcIssuer("");
    setOidcClaimMatchers([{ claim_name: "", operator: "equals", value: "" }]);
    setX509Mode("aki");
    setX509Value("");
    setX509Values([]);
    setX509Operator("equals");
    setApiKeyId("");
    setApiKeyIds([]);
    setApiKeyHash("");
    setApiKeyMode("single");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const addClaimMatcher = () => {
    setOidcClaimMatchers([...oidcClaimMatchers, { claim_name: "", operator: "equals", value: "" }]);
  };

  const removeClaimMatcher = (index: number) => {
    setOidcClaimMatchers(oidcClaimMatchers.filter((_, i) => i !== index));
  };

  const updateClaimMatcher = (index: number, field: keyof OidcClaimMatcher, value: string) => {
    const updated = [...oidcClaimMatchers];
    updated[index] = { ...updated[index], [field]: value };
    setOidcClaimMatchers(updated);
  };

  const addToList = (list: string[], setList: (v: string[]) => void, value: string, setValue: (v: string) => void) => {
    if (value.trim()) {
      setList([...list, value.trim()]);
      setValue("");
    }
  };

  const removeFromList = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Principal</DialogTitle>
          <DialogDescription>
            Define a principal identity matcher to match incoming authentication credentials.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., admin-users, production-devices"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe this principal..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enabled</Label>
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            {/* Principal Type */}
            <div className="grid gap-2">
              <Label>Principal Type</Label>
              <Tabs value={principalType} onValueChange={(v) => setPrincipalType(v as PrincipalType)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="oidc">OIDC/JWT</TabsTrigger>
                  <TabsTrigger value="x509">X.509 Cert</TabsTrigger>
                  <TabsTrigger value="apikey">API Key</TabsTrigger>
                </TabsList>

                {/* OIDC Configuration */}
                <TabsContent value="oidc" className="space-y-4 mt-4">
                  <div className="grid gap-2">
                    <Label>Match Mode</Label>
                    <Select value={oidcMode} onValueChange={(v) => setOidcMode(v as OidcMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sub">By Subject (sub claim)</SelectItem>
                        <SelectItem value="claim">By Claims</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {oidcMode === "sub" && (
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Subject Value(s)</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="e.g., alice-uuid-12345"
                            value={oidcSubValue}
                            onChange={(e) => setOidcSubValue(e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => addToList(oidcSubValues, setOidcSubValues, oidcSubValue, setOidcSubValue)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {oidcSubValues.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {oidcSubValues.map((v, i) => (
                              <Badge key={i} variant="secondary" className="flex items-center gap-1">
                                {v}
                                <Trash2
                                  className="h-3 w-3 cursor-pointer"
                                  onClick={() => removeFromList(oidcSubValues, setOidcSubValues, i)}
                                />
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {oidcMode === "claim" && (
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Issuer (optional)</Label>
                        <Input
                          placeholder="e.g., https://keycloak.example.com/realms/lamassu"
                          value={oidcIssuer}
                          onChange={(e) => setOidcIssuer(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Claim Matchers</Label>
                        {oidcClaimMatchers.map((matcher, index) => (
                          <div key={index} className="flex gap-2 items-start">
                            <Input
                              placeholder="Claim name"
                              value={matcher.claim_name}
                              onChange={(e) => updateClaimMatcher(index, "claim_name", e.target.value)}
                              className="flex-1"
                            />
                            <Select
                              value={matcher.operator}
                              onValueChange={(v) => updateClaimMatcher(index, "operator", v)}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                                <SelectItem value="prefix">Prefix</SelectItem>
                                <SelectItem value="suffix">Suffix</SelectItem>
                                <SelectItem value="regex">Regex</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Value"
                              value={matcher.value}
                              onChange={(e) => updateClaimMatcher(index, "value", e.target.value)}
                              className="flex-1"
                            />
                            {oidcClaimMatchers.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeClaimMatcher(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addClaimMatcher}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Claim Matcher
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* X509 Configuration */}
                <TabsContent value="x509" className="space-y-4 mt-4">
                  <div className="grid gap-2">
                    <Label>Match Mode</Label>
                    <Select value={x509Mode} onValueChange={(v) => setX509Mode(v as X509Mode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aki">Authority Key Identifier (AKI)</SelectItem>
                        <SelectItem value="ski">Subject Key Identifier (SKI)</SelectItem>
                        <SelectItem value="subject_cn">Subject Common Name (CN)</SelectItem>
                        <SelectItem value="subject_ou">Subject Organizational Unit (OU)</SelectItem>
                        <SelectItem value="san">Subject Alternative Name (SAN)</SelectItem>
                        <SelectItem value="issuer">Issuer DN</SelectItem>
                        <SelectItem value="thumbprint">Certificate Thumbprint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!["aki", "ski", "thumbprint"].includes(x509Mode) && (
                    <div className="grid gap-2">
                      <Label>Operator</Label>
                      <Select value={x509Operator} onValueChange={(v) => setX509Operator(v as MatcherOperator)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">Equals</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="prefix">Prefix</SelectItem>
                          <SelectItem value="suffix">Suffix</SelectItem>
                          <SelectItem value="regex">Regex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label>Value(s)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={`Enter ${x509Mode} value...`}
                        value={x509Value}
                        onChange={(e) => setX509Value(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => addToList(x509Values, setX509Values, x509Value, setX509Value)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {x509Values.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {x509Values.map((v, i) => (
                          <Badge key={i} variant="secondary" className="flex items-center gap-1">
                            {v.length > 20 ? `${v.substring(0, 20)}...` : v}
                            <Trash2
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => removeFromList(x509Values, setX509Values, i)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* API Key Configuration */}
                <TabsContent value="apikey" className="space-y-4 mt-4">
                  <div className="grid gap-2">
                    <Label>Match Mode</Label>
                    <Select value={apiKeyMode} onValueChange={(v) => setApiKeyMode(v as "single" | "multiple" | "hash")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single Key ID</SelectItem>
                        <SelectItem value="multiple">Multiple Key IDs</SelectItem>
                        <SelectItem value="hash">By Key Hash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {apiKeyMode === "single" && (
                    <div className="grid gap-2">
                      <Label>Key ID</Label>
                      <Input
                        placeholder="e.g., admin-api-key-001"
                        value={apiKeyId}
                        onChange={(e) => setApiKeyId(e.target.value)}
                      />
                    </div>
                  )}

                  {apiKeyMode === "multiple" && (
                    <div className="grid gap-2">
                      <Label>Key IDs</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add key ID..."
                          value={apiKeyId}
                          onChange={(e) => setApiKeyId(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => addToList(apiKeyIds, setApiKeyIds, apiKeyId, setApiKeyId)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {apiKeyIds.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {apiKeyIds.map((v, i) => (
                            <Badge key={i} variant="secondary" className="flex items-center gap-1">
                              {v}
                              <Trash2
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => removeFromList(apiKeyIds, setApiKeyIds, i)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {apiKeyMode === "hash" && (
                    <div className="grid gap-2">
                      <Label>Key Hash (SHA256)</Label>
                      <Input
                        placeholder="e.g., c1bbf7920c49d000..."
                        value={apiKeyHash}
                        onChange={(e) => setApiKeyHash(e.target.value)}
                      />
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name}>
              {isLoading ? "Creating..." : "Create Principal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
