"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Shield, Key, Fingerprint, FileText } from "lucide-react";
import type { PrincipalDefinition, PrincipalType } from "@/types/authorization";

interface PrincipalsTableProps {
  principals: PrincipalDefinition[];
  onDeletePrincipal: (principal: PrincipalDefinition) => void;
  onManagePolicies: (principal: PrincipalDefinition) => void;
  onToggleEnabled: (principal: PrincipalDefinition, enabled: boolean) => void;
  isDeleting?: boolean;
  isUpdating?: boolean;
}

const getPrincipalTypeIcon = (type: PrincipalType) => {
  switch (type) {
    case "oidc":
      return <Shield className="h-4 w-4" />;
    case "x509":
      return <Fingerprint className="h-4 w-4" />;
    case "apikey":
      return <Key className="h-4 w-4" />;
  }
};

const getPrincipalTypeBadgeVariant = (type: PrincipalType): "default" | "secondary" | "outline" => {
  switch (type) {
    case "oidc":
      return "default";
    case "x509":
      return "secondary";
    case "apikey":
      return "outline";
  }
};

const getPrincipalTypeLabel = (type: PrincipalType): string => {
  switch (type) {
    case "oidc":
      return "OIDC/JWT";
    case "x509":
      return "X.509";
    case "apikey":
      return "API Key";
  }
};

const getMatcherSummary = (principal: PrincipalDefinition): string => {
  const config = principal.matcher_config;
  
  if (principal.type === "oidc") {
    if ("mode" in config) {
      if (config.mode === "sub") {
        const subConfig = config as { mode: "sub"; value?: string; values?: string[] };
        if (subConfig.value) return `Subject: ${subConfig.value}`;
        if (subConfig.values) return `Subjects: ${subConfig.values.length} values`;
      }
      if (config.mode === "claim") {
        const claimConfig = config as { mode: "claim"; claim_matchers?: { claim_name: string }[] };
        if (claimConfig.claim_matchers) {
          return `Claims: ${claimConfig.claim_matchers.map(m => m.claim_name).join(", ")}`;
        }
      }
    }
  }
  
  if (principal.type === "x509") {
    if ("mode" in config) {
      const x509Config = config as { mode: string; value?: string; values?: string[] };
      const modeLabels: Record<string, string> = {
        aki: "Authority Key ID",
        ski: "Subject Key ID",
        subject_cn: "Common Name",
        subject_ou: "Organizational Unit",
        san: "Subject Alt Name",
        issuer: "Issuer",
        thumbprint: "Thumbprint",
      };
      const label = modeLabels[x509Config.mode] || x509Config.mode;
      if (x509Config.value) return `${label}: ${x509Config.value.substring(0, 20)}...`;
      if (x509Config.values) return `${label}: ${x509Config.values.length} values`;
    }
  }
  
  if (principal.type === "apikey") {
    const apiConfig = config as { key_id?: string; key_ids?: string[]; key_hash?: string };
    if (apiConfig.key_id) return `Key ID: ${apiConfig.key_id}`;
    if (apiConfig.key_ids) return `Key IDs: ${apiConfig.key_ids.length} keys`;
    if (apiConfig.key_hash) return `Key Hash: ${apiConfig.key_hash.substring(0, 16)}...`;
  }
  
  return "Custom matcher";
};

export function PrincipalsTable({
  principals,
  onDeletePrincipal,
  onManagePolicies,
  onToggleEnabled,
  isDeleting,
  isUpdating,
}: PrincipalsTableProps) {
  if (principals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No principals configured. Create a principal to define identity matchers.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Matcher</TableHead>
          <TableHead>Enabled</TableHead>
          <TableHead className="w-[120px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {principals.map((principal) => (
          <TableRow key={principal.name}>
            <TableCell className="font-medium">{principal.name}</TableCell>
            <TableCell>
              <Badge variant={getPrincipalTypeBadgeVariant(principal.type)} className="flex items-center gap-1 w-fit">
                {getPrincipalTypeIcon(principal.type)}
                {getPrincipalTypeLabel(principal.type)}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
              {principal.description}
            </TableCell>
            <TableCell className="font-mono text-xs max-w-[200px] truncate">
              {getMatcherSummary(principal)}
            </TableCell>
            <TableCell>
              <Switch
                checked={principal.enabled}
                onCheckedChange={(checked) => onToggleEnabled(principal, checked)}
                disabled={isUpdating}
              />
            </TableCell>
            <TableCell>
              <div className="flex space-x-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onManagePolicies(principal)}
                  title="Manage Policies"
                >
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeletePrincipal(principal)}
                  disabled={isDeleting}
                  title="Delete Principal"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
