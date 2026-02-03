'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Trash2, AlertCircle, ChevronRight, Loader2, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { Rule, RelationRule, SchemaDefinition } from '@/types/authz';
import { getSchemas } from '@/lib/authz-api';

interface PolicyBuilderFormProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

export function PolicyBuilderForm({ rules, onChange, error }: PolicyBuilderFormProps) {
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(true);

  useEffect(() => {
    const fetchSchemas = async () => {
      try {
        const data = await getSchemas();
        setSchemas(data);
      } catch (err) {
        console.error('Failed to fetch schemas:', err);
      } finally {
        setLoadingSchemas(false);
      }
    };
    fetchSchemas();
  }, []);

  const addRule = () => {
    onChange([
      ...rules,
      {
        entityType: '',
        actions: [],
        relations: [],
        directGrants: [],
      },
    ]);
  };

  const updateRule = (index: number, updated: Rule) => {
    const newRules = [...rules];
    newRules[index] = updated;
    onChange(newRules);
  };

  const deleteRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rules.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No rules defined yet. Click the button below to add your first rule.</p>
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full">
          {rules.map((rule, index) => (
            <AccordionItem key={index} value={`rule-${index}`}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2 flex-1">
                  <Badge variant="outline">Rule {index + 1}</Badge>
                  <span className="text-sm">
                    {rule.entityType || 'Untitled'} - {rule.actions.length} action(s)
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <RuleEditor
                  rule={rule}
                  onChange={(updated) => updateRule(index, updated)}
                  onDelete={() => deleteRule(index)}
                  schemas={schemas}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <Button onClick={addRule} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Add Rule
      </Button>
    </div>
  );
}

interface RuleEditorProps {
  rule: Rule;
  onChange: (rule: Rule) => void;
  onDelete: () => void;
  schemas: SchemaDefinition[];
}

function RuleEditor({ rule, onChange, onDelete, schemas }: RuleEditorProps) {
  const [grantInput, setGrantInput] = useState('');

  const selectedSchema = schemas.find((s) => s.entityType === rule.entityType);
  const availableActions = selectedSchema
    ? [
        ...(selectedSchema.atomicActions || []),
        ...(selectedSchema.globalActions || []),
      ]
    : [];

  const toggleAction = (action: string) => {
    const newActions = rule.actions.includes(action)
      ? rule.actions.filter((a) => a !== action)
      : [...rule.actions, action];
    onChange({ ...rule, actions: newActions });
  };

  const removeAction = (action: string) => {
    onChange({ ...rule, actions: rule.actions.filter((a) => a !== action) });
  };

  const addGrant = () => {
    if (grantInput.trim() && !rule.directGrants?.includes(grantInput.trim())) {
      onChange({
        ...rule,
        directGrants: [...(rule.directGrants || []), grantInput.trim()],
      });
      setGrantInput('');
    }
  };

  const removeGrant = (grant: string) => {
    onChange({
      ...rule,
      directGrants: rule.directGrants?.filter((g) => g !== grant) || [],
    });
  };

  const addRelation = () => {
    onChange({
      ...rule,
      relations: [
        ...rule.relations,
        { to: '', via: '', actions: [], relations: [] },
      ],
    });
  };

  const updateRelation = (index: number, updated: RelationRule) => {
    const newRelations = [...rule.relations];
    newRelations[index] = updated;
    onChange({ ...rule, relations: newRelations });
  };

  const deleteRelation = (index: number) => {
    onChange({
      ...rule,
      relations: rule.relations.filter((_, i) => i !== index),
    });
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Entity Type */}
        <div className="space-y-2">
          <Label>Entity Type *</Label>
          <Select
            value={rule.entityType}
            onValueChange={(value) => onChange({ ...rule, entityType: value, actions: [] })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select entity type..." />
            </SelectTrigger>
            <SelectContent>
              {schemas.map((schema) => (
                <SelectItem key={schema.entityType} value={schema.entityType}>
                  {schema.entityType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Label>Actions *</Label>
          {!rule.entityType ? (
            <p className="text-sm text-muted-foreground italic">Select an entity type first</p>
          ) : availableActions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No actions available for this entity type</p>
          ) : (
            <>
              <div className="border rounded-md p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {availableActions.map((action) => (
                  <div key={action} className="flex items-center space-x-2">
                    <Checkbox
                      id={`action-${action}`}
                      checked={rule.actions.includes(action)}
                      onCheckedChange={() => toggleAction(action)}
                    />
                    <label
                      htmlFor={`action-${action}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {action}
                    </label>
                  </div>
                ))}
              </div>
              {rule.actions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {rule.actions.map((action) => (
                    <Badge key={action} variant="default" className="bg-green-600 hover:bg-green-700">
                      {action}
                      <button
                        onClick={() => toggleAction(action)}
                        className="ml-1.5 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Direct Grants */}
        <div className="space-y-2">
          <Label>Direct Grants (Optional)</Label>
          <div className="flex gap-2">
            <Input
              value={grantInput}
              onChange={(e) => setGrantInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addGrant()}
              placeholder="Enter principal ID"
            />
            <Button onClick={addGrant} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {rule.directGrants && rule.directGrants.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {rule.directGrants.map((grant) => (
                <Badge key={grant} variant="outline" className="flex items-center gap-1">
                  {grant}
                  <button
                    onClick={() => removeGrant(grant)}
                    className="ml-1 hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Relations */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Relations</Label>
            <Button onClick={addRelation} size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Relation
            </Button>
          </div>
          {rule.relations.length > 0 && (
            <div className="space-y-2 mt-2">
              {rule.relations.map((relation, index) => (
                <RelationEditor
                  key={index}
                  relation={relation}
                  onChange={(updated) => updateRelation(index, updated)}
                  onDelete={() => deleteRelation(index)}
                  depth={0}
                  schemas={schemas}
                  parentEntityType={rule.entityType}
                />
              ))}
            </div>
          )}
        </div>

        {/* Delete Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onDelete} variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface RelationEditorProps {
  relation: RelationRule;
  onChange: (relation: RelationRule) => void;
  onDelete: () => void;
  depth: number;
  schemas: SchemaDefinition[];
  parentEntityType: string;
}

function RelationEditor({ relation, onChange, onDelete, depth, schemas, parentEntityType }: RelationEditorProps) {
  // Find all entities that have relations pointing TO the parent entity
  // Relations are defined from child to parent (e.g., building -> organization)
  const entitiesPointingToParent = schemas.filter((schema) =>
    Object.values(schema.relations || {}).some(
      (rel) => rel.targetEntity === parentEntityType
    )
  );
  
  // Get all relations from entities that point to the parent
  const availableTargetEntities = entitiesPointingToParent.map((schema) => ({
    entityType: schema.entityType,
    relations: Object.values(schema.relations || {}).filter(
      (rel) => rel.targetEntity === parentEntityType
    ),
  }));
  
  // Get target entity's schema for available actions
  const targetSchema = schemas.find((s) => s.entityType === relation.to);
  const availableActions = targetSchema
    ? [
        ...(targetSchema.atomicActions || []),
        ...(targetSchema.globalActions || []),
      ]
    : [];

  // Get available relation names from the target entity pointing to parent
  const targetEntityData = availableTargetEntities.find((e) => e.entityType === relation.to);
  const relationsForTarget = targetEntityData ? targetEntityData.relations : [];

  const toggleAction = (action: string) => {
    const newActions = relation.actions.includes(action)
      ? relation.actions.filter((a) => a !== action)
      : [...relation.actions, action];
    onChange({ ...relation, actions: newActions });
  };

  const addNestedRelation = () => {
    onChange({
      ...relation,
      relations: [
        ...(relation.relations || []),
        { to: '', via: '', actions: [], relations: [] },
      ],
    });
  };

  const updateNestedRelation = (index: number, updated: RelationRule) => {
    const newRelations = [...(relation.relations || [])];
    newRelations[index] = updated;
    onChange({ ...relation, relations: newRelations });
  };

  const deleteNestedRelation = (index: number) => {
    onChange({
      ...relation,
      relations: relation.relations?.filter((_, i) => i !== index) || [],
    });
  };

  const indentClass = depth > 0 ? `ml-${depth * 4} pl-4 border-l-2` : '';

  return (
    <Card className={indentClass}>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
          <span>Relation {depth > 0 ? `(Nested Level ${depth})` : ''}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Target Entity *</Label>
            {availableTargetEntities.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No entities point to {parentEntityType}</p>
            ) : (
              <Select
                value={relation.to}
                onValueChange={(value) => onChange({ ...relation, to: value, via: '', actions: [] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target entity..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTargetEntities.map((entity) => (
                    <SelectItem key={entity.entityType} value={entity.entityType}>
                      {entity.entityType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Via Relation *</Label>
            {!relation.to ? (
              <p className="text-sm text-muted-foreground italic">Select target entity first</p>
            ) : relationsForTarget.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No relations to {relation.to}</p>
            ) : (
              <Select
                value={relation.via}
                onValueChange={(value) => onChange({ ...relation, via: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select relation..." />
                </SelectTrigger>
                <SelectContent>
                  {relationsForTarget.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Actions *</Label>
          {!relation.to ? (
            <p className="text-sm text-muted-foreground italic">Select target entity first</p>
          ) : availableActions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No actions available for {relation.to}</p>
          ) : (
            <>
              <div className="border rounded-md p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {availableActions.map((action) => (
                  <div key={action} className="flex items-center space-x-2">
                    <Checkbox
                      id={`relation-action-${action}-${depth}`}
                      checked={relation.actions.includes(action)}
                      onCheckedChange={() => toggleAction(action)}
                    />
                    <label
                      htmlFor={`relation-action-${action}-${depth}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {action}
                    </label>
                  </div>
                ))}
              </div>
              {relation.actions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {relation.actions.map((action) => (
                    <Badge key={action} variant="default" className="bg-green-600 hover:bg-green-700">
                      {action}
                      <button
                        onClick={() => toggleAction(action)}
                        className="ml-1.5 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Nested Relations */}
        {depth < 3 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Nested Relations</Label>
              <Button onClick={addNestedRelation} size="sm" variant="outline">
                <Plus className="mr-2 h-3 w-3" />
                Add Nested
              </Button>
            </div>
            {relation.relations && relation.relations.length > 0 && (
              <div className="space-y-2 mt-2">
                {relation.relations.map((nested, index) => (
                  <RelationEditor
                    key={index}
                    relation={nested}
                    onChange={(updated) => updateNestedRelation(index, updated)}
                    onDelete={() => deleteNestedRelation(index)}
                    depth={depth + 1}
                    schemas={schemas}
                    parentEntityType={relation.to}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={onDelete} variant="ghost" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
