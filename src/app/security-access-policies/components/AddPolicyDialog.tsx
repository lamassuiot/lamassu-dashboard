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
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [action, setAction] = useState("");
  const [hierarchy, setHierarchy] = useState<HierarchyType>("none");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const object = `${resourceType}:${resourceId}`;
    await onAddPolicy({ object, action, hierarchy });
    resetForm();
  };

  const resetForm = () => {
    setResourceType("");
    setResourceId("");
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
            Create a new access policy rule. Policies define what actions can be performed on
            which resources.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Resource</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Select value={resourceType} onValueChange={setResourceType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dms">DMS</SelectItem>
                      <SelectItem value="device">Device</SelectItem>
                      <SelectItem value="certificate">Certificate</SelectItem>
                      <SelectItem value="device_group">Device Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Input
                    id="resourceId"
                    placeholder="Resource ID (e.g., *, DEVICE-123)"
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Select the resource type and specify the identifier. Use * for wildcard
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="action">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="write">Write</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="manage">Manage</SelectItem>
                  <SelectItem value="*">* (All actions)</SelectItem>
                </SelectContent>
              </Select>
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
            <Button type="submit" disabled={isLoading || !resourceType || !resourceId || !action}>
              {isLoading ? "Adding..." : "Add Policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
