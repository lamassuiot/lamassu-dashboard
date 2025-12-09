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
import type { AddMembershipRequest } from "@/types/authorization";

interface AddMembershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddMembership: (membership: AddMembershipRequest) => Promise<void>;
  isLoading?: boolean;
}

export function AddMembershipDialog({
  open,
  onOpenChange,
  onAddMembership,
  isLoading,
}: AddMembershipDialogProps) {
  const [principal, setPrincipal] = useState("");
  const [scope, setScope] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAddMembership({ principal, scope });
    resetForm();
  };

  const resetForm = () => {
    setPrincipal("");
    setScope("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Membership</DialogTitle>
          <DialogDescription>
            Create a membership to assign a principal to a scope. Memberships allow principals to
            inherit permissions from a scope.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="principal">Principal</Label>
              <Input
                id="principal"
                placeholder="e.g., user:alice, service:ca-service"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The entity to add to the scope (format: type:identifier)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scope">Scope</Label>
              <Input
                id="scope"
                placeholder="e.g., dms:DMS-PROD, tenant:TENANT-123"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The scope to assign the principal to (format: type:identifier)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !principal || !scope}>
              {isLoading ? "Adding..." : "Add Membership"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
