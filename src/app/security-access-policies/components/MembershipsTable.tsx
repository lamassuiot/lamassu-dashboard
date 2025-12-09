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
import { Trash2 } from "lucide-react";
import type { PrincipalMembershipResponse } from "@/types/authorization";

interface MembershipsTableProps {
  memberships: PrincipalMembershipResponse[];
  onDeleteMembership: (membership: PrincipalMembershipResponse) => void;
  isDeleting?: boolean;
}

export function MembershipsTable({
  memberships,
  onDeleteMembership,
  isDeleting,
}: MembershipsTableProps) {
  if (memberships.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No memberships configured. Add a membership to assign principals to scopes.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Principal</TableHead>
          <TableHead>Scope</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {memberships.map((membership, index) => (
          <TableRow key={`${membership.principal}-${membership.scope}-${index}`}>
            <TableCell className="font-mono text-sm">{membership.principal}</TableCell>
            <TableCell className="font-mono text-sm">{membership.scope}</TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDeleteMembership(membership)}
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
