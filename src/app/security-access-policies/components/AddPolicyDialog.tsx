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
import { useAuth } from "@/contexts/AuthContext";
import { listEntities } from "@/lib/authz-api";
import type { AddPolicyRequest, Entity, ChildAccess } from "@/types/authorization";

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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [action, setAction] = useState("");
  const [childRules, setChildRules] = useState<Record<string, ChildAccess> | undefined>(undefined);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  
  const { user } = useAuth();
  const token = user?.access_token;

  // Fetch entities when dialog opens
  useEffect(() => {
    if (open && entities.length === 0) {
      fetchEntities();
    }
  }, [open]);

  const fetchEntities = async () => {
    setLoadingEntities(true);
    try {
      const response = await listEntities(token);
      setEntities(response.entities || []);
    } catch (error) {
      console.error("Failed to fetch entities:", error);
      // Fallback to default entities if API fails
      setEntities([
        { name: "dms", description: "DMS", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write"] },
        { name: "device", description: "Device", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read"] },
        { name: "certificate", description: "Certificate", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "delete", "revoke"] },
        { name: "device_group", description: "Device Group", db_name: "", schema: "", table: "", column_id: "", supports_list_action: true, actions: ["read", "write", "delete"] },
      ]);
    } finally {
      setLoadingEntities(false);
    }
  };

  // Get available actions based on selected entity
  const getAvailableActions = () => {
    const selectedEntity = entities.find(e => e.name === resourceType);
    
    if (!selectedEntity) {
      return [];
    }
    
    // Start with entity-specific actions
    const actions = [...selectedEntity.actions];
    
    // Add "list" action if the entity supports it
    if (selectedEntity.supports_list_action && !actions.includes("list")) {
      actions.unshift("list");
    }
    
    return actions;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ruleWithChildRules: any = {
      object: `${resourceType}:${resourceId}`,
      action,
    };
    if (childRules && Object.keys(childRules).length > 0) {
      ruleWithChildRules.child_rules = childRules;
    }
    await onAddPolicy({ 
      name, 
      description, 
      rules: [ruleWithChildRules]
    });
    resetForm();
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setResourceType("");
    setResourceId("");
    setAction("");
    setChildRules(undefined);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleResourceTypeChange = (value: string) => {
    setResourceType(value);
    // Reset action when resource type changes since available actions may differ
    setAction("");
  };

  const availableActions = getAvailableActions();

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
              <Label htmlFor="name">Policy Name</Label>
              <Input
                id="name"
                placeholder="e.g., Device Read Policy"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name for this policy
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g., Allows reading device information"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                A brief description of what this policy allows
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Resource</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Select value={resourceType} onValueChange={handleResourceTypeChange} disabled={loadingEntities}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingEntities ? "Loading..." : "Type"} />
                    </SelectTrigger>
                    <SelectContent>
                      {entities.map((entity) => (
                        <SelectItem key={entity.name} value={entity.name}>
                          {entity.description || entity.name}
                        </SelectItem>
                      ))}
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
              <Select value={action} onValueChange={setAction} disabled={!resourceType}>
                <SelectTrigger>
                  <SelectValue placeholder={resourceType ? "Select action" : "Select resource type first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableActions.map((act) => (
                    <SelectItem key={act} value={act}>
                      {act.charAt(0).toUpperCase() + act.slice(1)}
                    </SelectItem>
                  ))}
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
            <Button type="submit" disabled={isLoading || !name || !description || !resourceType || !resourceId || !action}>
              {isLoading ? "Adding..." : "Add Policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
