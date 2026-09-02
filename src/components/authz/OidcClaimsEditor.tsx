'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Info } from 'lucide-react';
import type { ClaimCondition } from '@/types/authz';
import { FormFieldError } from '@/components/shared/FormValidationSummary';

interface OidcClaimsEditorProps {
  claims: ClaimCondition[];
  disabled?: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof ClaimCondition, value: string) => void;
}

export function OidcClaimsEditor({ claims, disabled, onAdd, onRemove, onUpdate }: OidcClaimsEditorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Define claim conditions used to match the JWT of an incoming authentication request.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} className="shrink-0" disabled={disabled}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Claim
        </Button>
      </div>

      {claims.length === 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          disabled={disabled}
          aria-invalid
          aria-describedby="oidc-claims-required-error"
          className="h-auto w-full flex-col gap-2 border-dashed py-6"
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Add your first claim condition</span>
          <span className="text-xs text-muted-foreground">At least one claim is required to identify this principal</span>
        </Button>
      )}
      {claims.length === 0 && (
        <FormFieldError id="oidc-claims-required-error" title="Claim condition required." description="Add at least one claim before saving." />
      )}

      <div className="rounded-lg border divide-y">
        {claims.map((claim, index) => (
          <div key={index} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Claim condition {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(index)}
                disabled={disabled}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Claim Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="sub, email, groups"
                  value={claim.claim}
                  onChange={(e) => onUpdate(index, 'claim', e.target.value)}
                  required
                  disabled={disabled}
                  className="font-mono text-sm"
                  aria-invalid={!claim.claim.trim()}
                  aria-describedby={!claim.claim.trim() ? `oidc-claim-name-${index}-error` : undefined}
                />
                {!claim.claim.trim() && <FormFieldError id={`oidc-claim-name-${index}-error`} title="Claim Name required." />}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Operator</Label>
                <Select
                  value={claim.operator}
                  onValueChange={(value: 'equals' | 'contains' | 'matches') =>
                    onUpdate(index, 'operator', value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="matches">Matches (Regex)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">
                  Value <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder={
                    claim.operator === 'matches' ? '^[a-z]+@example\\.com$' : 'Claim value'
                  }
                  value={claim.value}
                  onChange={(e) => onUpdate(index, 'value', e.target.value)}
                  required
                  disabled={disabled}
                  className="font-mono text-sm"
                  aria-invalid={!claim.value.trim()}
                  aria-describedby={!claim.value.trim() ? `oidc-claim-value-${index}-error` : undefined}
                />
                {!claim.value.trim() && <FormFieldError id={`oidc-claim-value-${index}-error`} title="Claim Value required." />}
              </div>
            </div>

            {claim.operator === 'matches' && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Regex pattern. Ensure it is valid before saving.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
