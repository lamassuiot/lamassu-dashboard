"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Trash2, Eye, FileText, Users, UserCog } from "lucide-react";
import type { GroupedPolicy, PrincipalDefinition } from "@/types/authorization";
import { ManagePolicyPrincipalsDialog } from "./ManagePolicyPrincipalsDialog";

interface PoliciesTableProps {
  groupedPolicies: GroupedPolicy[];
  principals: PrincipalDefinition[];
  onDeletePolicy: (policyId: string) => void;
  onUpdate?: () => void;
  isDeleting?: boolean;
}

export function PoliciesTable({
  groupedPolicies,
  principals,
  onDeletePolicy,
  onUpdate,
  isDeleting,
}: PoliciesTableProps) {
  const router = useRouter();
  const [managePrincipalsDialogOpen, setManagePrincipalsDialogOpen] = useState(false);
  const [policyToManage, setPolicyToManage] = useState<GroupedPolicy | null>(null);

  // Create a map from principal ID to principal name for quick lookup
  const principalIdToName = React.useMemo(() => {
    const map = new Map<string, string>();
    principals.forEach((principal) => {
      // Use id if available, otherwise use name as fallback
      const key = principal.id || principal.name;
      map.set(key, principal.name);
    });
    return map;
  }, [principals]);

  // Function to get principal display name
  const getPrincipalDisplayName = (principalId: string): string => {
    return principalIdToName.get(principalId) || principalId;
  };

  const handleViewDetails = (policy: GroupedPolicy) => {
    router.push(`/security-access-policies/policies/details?id=${encodeURIComponent(policy.policy_id)}`);
  };

  const handleManagePrincipals = (policy: GroupedPolicy) => {
    setPolicyToManage(policy);
    setManagePrincipalsDialogOpen(true);
  };

  if (groupedPolicies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No policies configured. Add a policy to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Policy ID</TableHead>
            <TableHead>Rules</TableHead>
            <TableHead>Assigned Principals</TableHead>
            <TableHead className="w-[150px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedPolicies.map((policy) => (
            <TableRow key={policy.policy_id}>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-lg font-semibold">{policy.name}</div>
                  {policy.description && (
                    <div className="text-sm text-muted-foreground">{policy.description}</div>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">{policy.policy_id}</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">
                    {policy.rule_count} {policy.rule_count === 1 ? 'rule' : 'rules'}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {policy.principals.length === 0 ? (
                    <span className="text-muted-foreground text-sm">No principals</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {policy.principals.slice(0, 3).map((principal) => (
                        <Badge key={principal} variant="outline" className="font-mono text-xs">
                          {getPrincipalDisplayName(principal)}
                        </Badge>
                      ))}
                      {policy.principals.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{policy.principals.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewDetails(policy)}
                    title="View full policy details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleManagePrincipals(policy)}
                    title="Manage principals"
                  >
                    <UserCog className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeletePolicy(policy.policy_id)}
                    disabled={isDeleting}
                    title="Delete policy"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ManagePolicyPrincipalsDialog
        open={managePrincipalsDialogOpen}
        onOpenChange={setManagePrincipalsDialogOpen}
        policy={policyToManage}
        onUpdate={() => {
          if (onUpdate) {
            onUpdate();
          }
        }}
      />
    </>
  );
}
