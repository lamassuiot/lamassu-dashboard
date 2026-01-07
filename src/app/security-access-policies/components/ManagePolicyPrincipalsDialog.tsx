"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, UserPlus, Loader2 } from "lucide-react";
import type { GroupedPolicy, PrincipalDefinition } from "@/types/authorization";
import { listPrincipals, assignPolicyToPrincipal, removePolicyFromPrincipal } from "@/lib/authz-api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ManagePolicyPrincipalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: GroupedPolicy | null;
  onUpdate: () => void;
}

export function ManagePolicyPrincipalsDialog({
  open,
  onOpenChange,
  policy,
  onUpdate,
}: ManagePolicyPrincipalsDialogProps) {
  const [principals, setPrincipals] = useState<PrincipalDefinition[]>([]);
  const [selectedPrincipalId, setSelectedPrincipalId] = useState<string>("");
  const [loadingPrincipals, setLoadingPrincipals] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingPrincipalId, setRemovingPrincipalId] = useState<string | null>(null);
  
  const { user } = useAuth();
  const token = user?.access_token;
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchPrincipals();
    }
  }, [open]);

  const fetchPrincipals = async () => {
    setLoadingPrincipals(true);
    try {
      const response = await listPrincipals(undefined, token);
      setPrincipals(response.principals || []);
    } catch (error) {
      console.error("Failed to fetch principals:", error);
      toast({
        title: "Error",
        description: "Failed to fetch principals",
        variant: "destructive",
      });
      setPrincipals([]);
    } finally {
      setLoadingPrincipals(false);
    }
  };

  const handleAssignPrincipal = async () => {
    if (!selectedPrincipalId || !policy) return;

    setIsAssigning(true);
    try {
      await assignPolicyToPrincipal(
        selectedPrincipalId,
        { policy_id: policy.policy_id },
        token
      );
      toast({
        title: "Principal assigned",
        description: `Principal assigned to policy ${policy.policy_id} successfully`,
      });
      setSelectedPrincipalId("");
      onUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign principal";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemovePrincipal = async (principalId: string) => {
    if (!policy) return;

    setRemovingPrincipalId(principalId);
    try {
      await removePolicyFromPrincipal(principalId, policy.policy_id, token);
      toast({
        title: "Principal removed",
        description: `Principal removed from policy ${policy.policy_id} successfully`,
      });
      onUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove principal";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRemovingPrincipalId(null);
    }
  };

  const getPrincipalName = (principalId: string): string => {
    const principal = principals.find(p => p.id === principalId || p.name === principalId);
    return principal?.name || principalId;
  };

  const getAvailablePrincipals = () => {
    if (!policy) return principals;
    return principals.filter(p => !policy.principals.includes(p.id || p.name));
  };

  if (!policy) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Manage Policy Principals</DialogTitle>
          <DialogDescription>
            Assign or remove principals for policy: <span className="font-mono font-semibold">{policy.policy_id}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Assign New Principal Section */}
          <div className="space-y-3">
            <Label>Assign New Principal</Label>
            <div className="flex gap-2">
              <Select 
                value={selectedPrincipalId} 
                onValueChange={setSelectedPrincipalId}
                disabled={loadingPrincipals || isAssigning}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue 
                    placeholder={loadingPrincipals ? "Loading principals..." : "Select a principal to assign"} 
                  />
                </SelectTrigger>
                <SelectContent>
                  {getAvailablePrincipals().length === 0 ? (
                    <SelectItem value="none" disabled>
                      {loadingPrincipals ? "Loading..." : "No available principals"}
                    </SelectItem>
                  ) : (
                    getAvailablePrincipals().map((principal) => (
                      <SelectItem key={principal.id || principal.name} value={principal.id || principal.name}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{principal.name}</span>
                          <span className="text-xs text-muted-foreground">({principal.type})</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAssignPrincipal}
                disabled={!selectedPrincipalId || isAssigning || loadingPrincipals}
                size="default"
              >
                {isAssigning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Assigned Principals List */}
          <div className="space-y-3">
            <Label>Assigned Principals ({policy.principals.length})</Label>
            {loadingPrincipals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : policy.principals.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
                No principals assigned to this policy yet
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-md p-3">
                {policy.principals.map((principalId) => {
                  const principal = principals.find(p => p.id === principalId || p.name === principalId);
                  return (
                    <div
                      key={principalId}
                      className="flex items-center justify-between p-3 bg-muted rounded-md"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium text-sm">
                            {getPrincipalName(principalId)}
                          </div>
                          {principal && (
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {principal.type}
                              </Badge>
                              {principal.description && (
                                <span className="text-xs text-muted-foreground">
                                  {principal.description}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemovePrincipal(principalId)}
                        disabled={removingPrincipalId === principalId}
                        title="Remove principal from policy"
                      >
                        {removingPrincipalId === principalId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
