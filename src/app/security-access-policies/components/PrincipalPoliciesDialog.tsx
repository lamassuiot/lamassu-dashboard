"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Shield } from "lucide-react";
import type { PrincipalDefinition, Policy } from "@/types/authorization";

interface PrincipalPoliciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  principal: PrincipalDefinition | null;
  assignedPolicies: string[];
  allPolicies: Policy[];
  onAssignPolicy: (principalName: string, policyName: string) => Promise<void>;
  onRemovePolicy: (principalName: string, policyName: string) => Promise<void>;
}

export function PrincipalPoliciesDialog({
  open,
  onOpenChange,
  principal,
  assignedPolicies,
  allPolicies,
  onAssignPolicy,
  onRemovePolicy,
}: PrincipalPoliciesDialogProps) {
  const [selectedPolicy, setSelectedPolicy] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingPolicy, setRemovingPolicy] = useState<string | null>(null);
  const [localAssigned, setLocalAssigned] = useState<string[]>([]);

  useEffect(() => {
    setLocalAssigned(assignedPolicies);
    setSelectedPolicy("");
  }, [assignedPolicies, open]);

  const availablePolicies = allPolicies.filter(
    (p) => !localAssigned.includes(p.name)
  );

  const handleAssign = async () => {
    if (!selectedPolicy || !principal) return;

    setIsAssigning(true);
    try {
      await onAssignPolicy(principal.name, selectedPolicy);
      setLocalAssigned([...localAssigned, selectedPolicy]);
      setSelectedPolicy("");
    } catch (error) {
      console.error("Failed to assign policy:", error);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemove = async (policyName: string) => {
    if (!principal) return;

    setRemovingPolicy(policyName);
    try {
      await onRemovePolicy(principal.name, policyName);
      setLocalAssigned(localAssigned.filter((p) => p !== policyName));
    } catch (error) {
      console.error("Failed to remove policy:", error);
    } finally {
      setRemovingPolicy(null);
    }
  };

  const getAssignedPolicyDetails = (name: string) => {
    return allPolicies.find((p) => p.name === name);
  };

  if (!principal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Policies for {principal.name}
          </DialogTitle>
          <DialogDescription>
            Assign or remove policies for this principal definition
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Assign new policy */}
          <div className="flex gap-2">
            <Select value={selectedPolicy} onValueChange={setSelectedPolicy}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a policy to assign" />
              </SelectTrigger>
              <SelectContent>
                {availablePolicies.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No available policies
                  </SelectItem>
                ) : (
                  availablePolicies.map((policy) => (
                    <SelectItem key={policy.name} value={policy.name}>
                      {policy.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAssign}
              disabled={!selectedPolicy || isAssigning}
            >
              <Plus className="h-4 w-4 mr-1" />
              {isAssigning ? "Adding..." : "Add"}
            </Button>
          </div>

          {/* Currently assigned policies */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Assigned Policies</h4>
            {localAssigned.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No policies assigned to this principal
              </p>
            ) : (
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2">
                  {localAssigned.map((policyName) => {
                    const policy = getAssignedPolicyDetails(policyName);
                    return (
                      <div
                        key={policyName}
                        className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {policyName}
                            </span>
                            {policy && (
                              <Badge variant="outline" className="text-xs">
                                {policy.effect}
                              </Badge>
                            )}
                          </div>
                          {policy && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {policy.resources.join(", ")} → {policy.actions.join(", ")}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemove(policyName)}
                          disabled={removingPolicy === policyName}
                          className="ml-2 flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
