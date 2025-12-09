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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AddPolicyRequest, HierarchyType } from "@/types/authorization";

interface AddPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPolicy: (policy: AddPolicyRequest) => Promise<void>;
  isLoading?: boolean;
}

export function AddPolicyDialog({
  open,
  onOpenChange,
  onAddPolicy,
  isLoading,
}: AddPolicyDialogProps) {
  const [subject, setSubject] = useState("");
  const [object, setObject] = useState("");
  const [action, setAction] = useState("");
  const [hierarchy, setHierarchy] = useState<HierarchyType>("none");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAddPolicy({ subject, object, action, hierarchy });
    resetForm();
  };

  const resetForm = () => {
    setSubject("");
    setObject("");
    setAction("");
    setHierarchy("none");
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
          <DialogTitle>Add Policy</DialogTitle>
          <DialogDescription>
            Create a new access policy rule. Policies define who (subject) can do what (action) on
            which resources (object).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="e.g., user:alice, dms:DMS-PROD"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The principal that will be granted access (format: type:identifier)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="object">Object</Label>
              <Input
                id="object"
                placeholder="e.g., device:*, certificate:CERT-123"
                value={object}
                onChange={(e) => setObject(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The resource to grant access to. Use * for wildcard (format: type:identifier)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="action">Action</Label>
              <Input
                id="action"
                placeholder="e.g., read, write, delete"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The action that will be allowed on the resource
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hierarchy">Hierarchy</Label>
              <Select value={hierarchy} onValueChange={(v) => setHierarchy(v as HierarchyType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select hierarchy behavior" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None - Exact resource only</SelectItem>
                  <SelectItem value="children">Children - Include child resources</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Whether access extends to child resources in the hierarchy
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !subject || !object || !action}>
              {isLoading ? "Adding..." : "Add Policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
