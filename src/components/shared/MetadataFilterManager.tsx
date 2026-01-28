"use client";

import React, { useState, useEffect } from 'react';
import { Search, Save, Edit, Trash2, BookMarked, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  getSavedMetadataFilters,
  saveMetadataFilter,
  updateMetadataFilter,
  deleteMetadataFilter,
  type MetadataFilterQuery,
} from '@/lib/metadata-filter-storage';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface MetadataFilter {
  filter: string;
  name?: string;
}

interface MetadataFilterManagerProps {
  value: MetadataFilter[];
  onChange: (value: MetadataFilter[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onFocusChange?: (isFocused: boolean) => void;
  id?: string;
}

export function MetadataFilterManager({
  value,
  onChange,
  disabled = false,
  placeholder = "e.g., $.key > value",
  className,
  onFocusChange,
  id,
}: MetadataFilterManagerProps) {
  const [savedFilters, setSavedFilters] = useState<MetadataFilterQuery[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<MetadataFilterQuery | null>(null);
  const [currentInput, setCurrentInput] = useState('');
  
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterDescription, setNewFilterDescription] = useState('');
  const [newFilterJsonPath, setNewFilterJsonPath] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load saved filters on mount and when popover opens
  useEffect(() => {
    if (isPopoverOpen) {
      loadSavedFilters();
    }
  }, [isPopoverOpen]);

  const loadSavedFilters = () => {
    const filters = getSavedMetadataFilters();
    setSavedFilters(filters);
  };

  const handleSaveCurrentFilter = () => {
    if (!currentInput.trim()) {
      setSaveError('Please enter a JSONPath query first');
      return;
    }
    setNewFilterJsonPath(currentInput);
    setNewFilterName('');
    setNewFilterDescription('');
    setSaveError(null);
    setIsSaveDialogOpen(true);
  };

  const handleConfirmSave = () => {
    if (!newFilterName.trim()) {
      setSaveError('Name is required');
      return;
    }
    
    if (!newFilterJsonPath.trim()) {
      setSaveError('JSONPath query is required');
      return;
    }

    try {
      saveMetadataFilter(newFilterName.trim(), newFilterJsonPath.trim(), newFilterDescription.trim() || undefined);
      loadSavedFilters();
      setIsSaveDialogOpen(false);
      setNewFilterName('');
      setNewFilterDescription('');
      setNewFilterJsonPath('');
      setSaveError(null);
    } catch (error) {
      setSaveError('Failed to save filter');
    }
  };

  const handleEditFilter = (filter: MetadataFilterQuery) => {
    setEditingFilter(filter);
    setNewFilterName(filter.name);
    setNewFilterDescription(filter.description || '');
    setNewFilterJsonPath(filter.jsonPath);
    setSaveError(null);
    setIsEditDialogOpen(true);
  };

  const handleConfirmEdit = () => {
    if (!editingFilter) return;

    if (!newFilterName.trim()) {
      setSaveError('Name is required');
      return;
    }
    
    if (!newFilterJsonPath.trim()) {
      setSaveError('JSONPath query is required');
      return;
    }

    try {
      updateMetadataFilter(editingFilter.id, {
        name: newFilterName.trim(),
        description: newFilterDescription.trim() || undefined,
        jsonPath: newFilterJsonPath.trim(),
      });
      loadSavedFilters();
      setIsEditDialogOpen(false);
      setEditingFilter(null);
      setNewFilterName('');
      setNewFilterDescription('');
      setNewFilterJsonPath('');
      setSaveError(null);
    } catch (error) {
      setSaveError('Failed to update filter');
    }
  };

  const handleDeleteFilter = (id: string) => {
    if (confirm('Are you sure you want to delete this saved filter?')) {
      deleteMetadataFilter(id);
      loadSavedFilters();
    }
  };

  const handleUseFilter = (filter: MetadataFilterQuery) => {
    if (!value.some(f => f.filter === filter.jsonPath)) {
      onChange([...value, { filter: filter.jsonPath, name: filter.name }]);
    }
    setIsPopoverOpen(false);
  };

  const handleAddFilter = () => {
    const trimmed = currentInput.trim();
    if (trimmed && !value.some(f => f.filter === trimmed)) {
      onChange([...value, { filter: trimmed }]);
      setCurrentInput('');
    }
  };

  const handleRemoveFilter = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    onChange([]);
    setCurrentInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddFilter();
    }
  };

  return (
    <>
      <div className={cn("space-y-2", className)}>
        {/* Active filters display */}
        {value.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {value.map((item, index) => (
              <Badge key={item.filter} variant="secondary" className={cn("text-xs", item.name ? "" : "font-mono")}>
                {item.name || item.filter}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => handleRemoveFilter(index)}
                  disabled={disabled}
                  title={item.name ? item.filter : undefined}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        
        {/* Input for adding new filters */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            id={id}
            type="text"
            placeholder={placeholder}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              onFocusChange?.(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              onFocusChange?.(false);
            }}
            className="w-full pl-10 pr-32"
            disabled={disabled}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {currentInput.trim() && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleAddFilter}
                  disabled={disabled}
                  title="Add filter"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleSaveCurrentFilter}
                  disabled={disabled}
                  title="Save filter for reuse"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </>
            )}
            {(value.length > 0 || currentInput) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleClearAll}
                disabled={disabled}
                title="Clear all filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  disabled={disabled}
                  title="Manage saved filters"
                >
                  <BookMarked className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-4" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Saved Filters</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveCurrentFilter}
                      disabled={!currentInput.trim()}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Save Current
                    </Button>
                  </div>
                  
                  {savedFilters.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No saved filters yet. Save your JSONPath queries for quick reuse.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {savedFilters.map((filter) => (
                        <div
                          key={filter.id}
                          className="p-3 border rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-sm truncate">{filter.name}</h5>
                              {filter.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {filter.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleEditFilter(filter)}
                                title="Edit filter"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteFilter(filter.id)}
                                title="Delete filter"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <code className="text-xs bg-muted px-2 py-1 rounded block truncate mb-2">
                            {filter.jsonPath}
                          </code>
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full h-7 text-xs"
                            onClick={() => handleUseFilter(filter)}
                          >
                            Add This Filter
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Save Filter Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Metadata Filter</DialogTitle>
            <DialogDescription>
              Save this JSONPath query for easy reuse in the future.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="filter-name">Name *</Label>
              <Input
                id="filter-name"
                placeholder="e.g., Production Environment"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-description">Description (optional)</Label>
              <Textarea
                id="filter-description"
                placeholder="Brief description of what this filter does..."
                value={newFilterDescription}
                onChange={(e) => setNewFilterDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-jsonpath">JSONPath Query *</Label>
              <Textarea
                id="filter-jsonpath"
                placeholder="$[?(@.key=='value')]"
                value={newFilterJsonPath}
                onChange={(e) => setNewFilterJsonPath(e.target.value)}
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Filter Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Metadata Filter</DialogTitle>
            <DialogDescription>
              Update the details of this saved filter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-filter-name">Name *</Label>
              <Input
                id="edit-filter-name"
                placeholder="e.g., Production Environment"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-filter-description">Description (optional)</Label>
              <Textarea
                id="edit-filter-description"
                placeholder="Brief description of what this filter does..."
                value={newFilterDescription}
                onChange={(e) => setNewFilterDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-filter-jsonpath">JSONPath Query *</Label>
              <Textarea
                id="edit-filter-jsonpath"
                placeholder="$[?(@.key=='value')]"
                value={newFilterJsonPath}
                onChange={(e) => setNewFilterJsonPath(e.target.value)}
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmEdit}>
              <Save className="h-4 w-4 mr-2" />
              Update Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
