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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AddPolicyWithMetaRequest, HierarchyType, PrincipalDefinition } from "@/types/authorization";
import { listPrincipals } from "@/lib/authz-api";
import { useAuth } from "@/contexts/AuthContext";

interface AddPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPolicy: (policy: AddPolicyWithMetaRequest) => Promise<void>;
  isLoading?: boolean;
}

export function AddPolicyDialog({
  open,
  onOpenChange,
  onAddPolicy,
  isLoading,
}: AddPolicyDialogProps) {
  const [policyId, setPolicyId] = useState("");
  const [subject, setSubject] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [action, setAction] = useState("");
  const [hierarchy, setHierarchy] = useState<HierarchyType>("none");
  const [principals, setPrincipals] = useState<PrincipalDefinition[]>([]);
  const [loadingPrincipals, setLoadingPrincipals] = useState(false);
  
  const { user } = useAuth();
  const token = user?.access_token;

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
      setPrincipals([]);
    } finally {
      setLoadingPrincipals(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const object = `${resourceType}:${resourceId}`;
    await onAddPolicy({ policy_id: policyId, subject, object, action, hierarchy });
    resetForm();
  };

  const resetForm = () => {
    setPolicyId("");
    setSubject("");
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
            Create a new access policy rule. Policies define who (subject) can do what (action) on
            which resources (object).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="policyId">Policy ID</Label>
              <Input
                id="policyId"
                placeholder="e.g., alice-device-policy"
                value={policyId}
                onChange={(e) => setPolicyId(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                A unique identifier to group related policy rules
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subject">Principal Selector</Label>
              <Select value={subject} onValueChange={setSubject} disabled={loadingPrincipals}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingPrincipals ? "Loading principals..." : "Select a principal"} />
                </SelectTrigger>
                <SelectContent>
                  {principals.length === 0 && !loadingPrincipals ? (
                    <SelectItem value="none" disabled>No principals available</SelectItem>
                  ) : (
                    principals.map((principal) => (
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
              <p className="text-xs text-muted-foreground">
                Select which principal will be granted access
              </p>
            </div>
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
            <Button type="submit" disabled={isLoading || !policyId || !subject || !resourceType || !resourceId || !action}>
              {isLoading ? "Adding..." : "Add Policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
