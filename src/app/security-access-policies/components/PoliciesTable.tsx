"use client";

import React, { useState } from "react";
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
import { Trash2, Eye, FileText, Users } from "lucide-react";
import type { GroupedPolicy } from "@/types/authorization";
import { PolicyDetailsDialog } from "./PolicyDetailsDialog";

interface PoliciesTableProps {
  groupedPolicies: GroupedPolicy[];
  onDeletePolicy: (policyId: string) => void;
  isDeleting?: boolean;
}

export function PoliciesTable({
  groupedPolicies,
  onDeletePolicy,
  isDeleting,
}: PoliciesTableProps) {
  const [selectedPolicy, setSelectedPolicy] = useState<GroupedPolicy | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const handleViewDetails = (policy: GroupedPolicy) => {
    setSelectedPolicy(policy);
    setDetailsDialogOpen(true);
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
              <TableCell className="font-mono text-sm font-medium">
                {policy.policy_id}
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
                          {principal}
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

      <PolicyDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        policy={selectedPolicy}
      />
    </>
  );
}
