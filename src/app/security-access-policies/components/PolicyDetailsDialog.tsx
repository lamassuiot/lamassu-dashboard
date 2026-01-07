"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Shield } from "lucide-react";
import type { GroupedPolicy } from "@/types/authorization";

interface PolicyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: GroupedPolicy | null;
}

export function PolicyDetailsDialog({
  open,
  onOpenChange,
  policy,
}: PolicyDetailsDialogProps) {
  if (!policy) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Policy Details: <span className="font-mono text-primary">{policy.policy_id}</span>
          </DialogTitle>
          <DialogDescription>
            Complete policy definition with all rules and assigned principals
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{policy.rule_count}</div>
                <p className="text-xs text-muted-foreground">
                  Access control rules defined
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assigned Principals</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{policy.principals.length}</div>
                <p className="text-xs text-muted-foreground">
                  Principals with this policy
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Assigned Principals Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Assigned Principals
            </h3>
            {policy.principals.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground border rounded-md">
                No principals assigned to this policy
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {policy.principals.map((principal) => (
                  <Badge key={principal} variant="secondary" className="font-mono">
                    {principal}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Policy Rules Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Policy Rules
            </h3>
            {policy.rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                No rules defined in this policy
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Subject (Who)</TableHead>
                      <TableHead className="w-[30%]">Object (What)</TableHead>
                      <TableHead className="w-[20%]">Action</TableHead>
                      <TableHead className="w-[20%]">Effect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policy.rules.map((rule, index) => (
                      <TableRow key={`${rule.sub}-${rule.obj}-${rule.act}-${index}`}>
                        <TableCell className="font-mono text-sm">{rule.sub}</TableCell>
                        <TableCell className="font-mono text-sm">{rule.obj}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-medium">
                            {rule.act}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={rule.eft === "children" ? "default" : "secondary"}>
                            {rule.eft === "children" ? "Children" : "None"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
