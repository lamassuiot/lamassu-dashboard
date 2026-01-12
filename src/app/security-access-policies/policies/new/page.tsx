'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Plus, Trash2, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createPolicy, listEntities } from '@/lib/authz-api';
import type { Entity, ChildAccess } from '@/types/authorization';
import { ChildRulesBuilder } from '../../components/ChildRulesBuilder';

interface PolicyRule {
  resourceType: string;
  resourceId: string;
  action: string;
  child_rules?: Record<string, ChildAccess>;
}

export default function NewPolicyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const token = user?.access_token;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<PolicyRule[]>([
    { resourceType: '', resourceId: '', action: '', child_rules: undefined }
  ]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchEntities();
  }, [token]);

  const fetchEntities = async () => {
    setLoadingEntities(true);
    try {
      const response = await listEntities(token);
      setEntities(response.entities || []);
    } catch (error) {
      console.error('Failed to fetch entities:', error);
      // Fallback to default entities if API fails
      setEntities([
        { name: 'dms', description: 'DMS', db_name: '', schema: '', table: '', column_id: '', supports_list_action: true, actions: ['read', 'write'] },
        { name: 'device', description: 'Device', db_name: '', schema: '', table: '', column_id: '', supports_list_action: true, actions: ['read'] },
        { name: 'certificate', description: 'Certificate', db_name: '', schema: '', table: '', column_id: '', supports_list_action: true, actions: ['read', 'write', 'delete', 'revoke'] },
        { name: 'device_group', description: 'Device Group', db_name: '', schema: '', table: '', column_id: '', supports_list_action: true, actions: ['read', 'write', 'delete'] },
      ]);
    } finally {
      setLoadingEntities(false);
    }
  };

  const getAvailableActions = (resourceType: string) => {
    const selectedEntity = entities.find(e => e.name === resourceType);
    
    if (!selectedEntity) {
      return [];
    }
    
    const actions = [...selectedEntity.actions];
    
    if (selectedEntity.supports_list_action && !actions.includes('list')) {
      actions.unshift('list');
    }
    
    return actions;
  };

  const addRule = () => {
    setRules([...rules, { resourceType: '', resourceId: '', action: '', child_rules: undefined }]);
  };

  const removeRule = (index: number) => {
    if (rules.length > 1) {
      setRules(rules.filter((_, i) => i !== index));
    }
  };

  const updateRule = (index: number, field: keyof PolicyRule, value: string | Record<string, ChildAccess> | undefined) => {
    const updatedRules = [...rules];
    updatedRules[index] = { ...updatedRules[index], [field]: value };
    
    // Reset action if resource type changes
    if (field === 'resourceType') {
      updatedRules[index].action = '';
    }
    
    setRules(updatedRules);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const policyRules = rules.map(rule => {
        const policyRule: any = {
          object: `${rule.resourceType}:${rule.resourceId}`,
          action: rule.action,
        };
        
        // Only include child_rules if it's defined and has content
        if (rule.child_rules && Object.keys(rule.child_rules).length > 0) {
          policyRule.child_rules = rule.child_rules;
        }
        
        return policyRule;
      });

      const policy = { 
        name, 
        description, 
        rules: policyRules 
      };
      
      await createPolicy(policy, token);
      
      toast({
        title: 'Policy created',
        description: `Policy "${name}" has been created successfully`,
      });
      
      router.push('/security-access-policies');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create policy';
      toast({
        title: 'Error creating policy',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const isValid = name && description && rules.every(rule => 
    rule.resourceType && rule.resourceId && rule.action
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/security-access-policies">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Policies
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create New Policy</h1>
            <p className="text-muted-foreground">
              Define access control rules that specify what actions are allowed on which resources
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Basic Information */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Provide a name and description for your policy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Policy Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Device Management Policy"
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Allows device management operations"
                    className="h-11"
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Policy Rules */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Policy Rules</CardTitle>
                  <CardDescription className="mt-1.5">
                    Define the access control rules for this policy
                  </CardDescription>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={addRule}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.map((rule, index) => (
                <div key={index} className="border-2 rounded-lg p-6 space-y-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-semibold">
                        Rule {index + 1}
                      </Badge>
                      {rule.resourceType && rule.action && (
                        <span className="text-sm text-muted-foreground">
                          {rule.action} on {rule.resourceType}:{rule.resourceId || '*'}
                        </span>
                      )}
                    </div>
                    {rules.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Resource Type *</Label>
                      <Select 
                        value={rule.resourceType} 
                        onValueChange={(value) => updateRule(index, 'resourceType', value)}
                        disabled={loadingEntities}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder={loadingEntities ? 'Loading...' : 'Select type'} />
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
                    
                    <div className="space-y-2">
                      <Label>Resource ID *</Label>
                      <Input
                        placeholder="e.g., *, DEVICE-123"
                        value={rule.resourceId}
                        onChange={(e) => updateRule(index, 'resourceId', e.target.value)}
                        className="h-11 font-mono"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Action *</Label>
                      <Select 
                        value={rule.action} 
                        onValueChange={(value) => updateRule(index, 'action', value)}
                        disabled={!rule.resourceType}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder={rule.resourceType ? 'Select action' : 'Select type first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableActions(rule.resourceType).map((act) => (
                            <SelectItem key={act} value={act}>
                              {act.charAt(0).toUpperCase() + act.slice(1)}
                            </SelectItem>
                          ))}
                          <SelectItem value="*">* (All actions)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <ChildRulesBuilder
                    value={rule.child_rules}
                    onChange={(value: Record<string, ChildAccess> | undefined) => updateRule(index, 'child_rules', value)}
                    entities={entities}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-4 justify-end">
            <Button type="button" variant="outline" asChild>
              <Link href="/security-access-policies">
                Cancel
              </Link>
            </Button>
            <Button type="submit" disabled={!isValid || isCreating} size="lg" className="min-w-[200px]">
              <Check className="h-4 w-4 mr-2" />
              {isCreating ? 'Creating Policy...' : 'Create Policy'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}