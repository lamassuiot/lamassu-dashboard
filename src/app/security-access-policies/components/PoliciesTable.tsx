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
import { Trash2 } from "lucide-react";
import type { PolicyWithMetaResponse } from "@/types/authorization";

interface PoliciesTableProps {
  policies: PolicyWithMetaResponse[];
  onDeletePolicy: (policy: PolicyWithMetaResponse) => void;
  isDeleting?: boolean;
}

export function PoliciesTable({
  policies,
  onDeletePolicy,
  isDeleting,
}: PoliciesTableProps) {
  if (policies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No policies configured. Add a policy to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Policy ID</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Object</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Hierarchy</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((policy, index) => (
          <TableRow key={`${policy.policy_id}-${policy.subject}-${policy.object}-${policy.action}-${index}`}>
            <TableCell className="font-mono text-sm">{policy.policy_id}</TableCell>
            <TableCell className="font-mono text-sm">{policy.subject}</TableCell>
            <TableCell className="font-mono text-sm">{policy.object}</TableCell>
            <TableCell>
              <Badge variant="outline">{policy.action}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={policy.hierarchy === "children" ? "default" : "secondary"}>
                {policy.hierarchy}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDeletePolicy(policy)}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
