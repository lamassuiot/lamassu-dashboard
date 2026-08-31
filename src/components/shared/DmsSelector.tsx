'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Loader2, Building2, X, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { fetchAllRegistrationAuthorities, type ApiRaItem } from '@/lib/dms-api';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';

export interface DmsOption {
  id: string;
  name: string;
  icon: string;
  iconColor: string;
  bgColor: string;
}

interface DmsSelectorProps {
  value: string | null;
  onChange: (value: string | null, dms?: DmsOption) => void;
  disabled?: boolean;
  className?: string;
  selectedDisplay?: 'single' | 'stacked';
  /** Whether to show "All Registration Authorities" option - default true */
  showAllOption?: boolean;
  /** Placeholder text when no selection - default varies by showAllOption */
  placeholder?: string;
  /** Whether to load options immediately when mounted - default false (loads on open) */
  loadOnMount?: boolean;
}

export const DmsSelector: React.FC<DmsSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className,
  selectedDisplay = 'single',
  showAllOption = true,
  placeholder,
  loadOnMount = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dmsOptions, setDmsOptions] = useState<DmsOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const defaultPlaceholder = showAllOption ? 'All Registration Authorities' : 'Select a Registration Authority...';
  const displayPlaceholder = placeholder || defaultPlaceholder;

  const loadDmsOptions = useCallback(async () => {
    

    setIsLoading(true);
    setLoadError(null);

    try {
      const ras: ApiRaItem[] = await fetchAllRegistrationAuthorities();
      
      const options: DmsOption[] = ras.map((ra) => {
        const profile = (ra.settings.protocol === 'CMP_RFC9483'
          ? ra.settings.cmp_settings.enrollment_settings
          : ra.settings.est_settings.enrollment_settings).device_provisioning_profile;
        const [iconColor, bgColor] = (profile.icon_color || '#888888-#e0e0e0').split('-');
        
        return {
          id: ra.id,
          name: ra.name,
          icon: profile.icon || 'Building2',
          iconColor,
          bgColor,
        };
      });

      setDmsOptions(options);
      setHasLoaded(true);
    } catch (error: any) {
      console.error('Failed to fetch DMS options:', error);
      setLoadError(error.message || 'Failed to load Registration Authorities');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount if requested
  useEffect(() => {
    if (loadOnMount && !hasLoaded) {
      loadDmsOptions();
    }
  }, [loadOnMount, hasLoaded, loadDmsOptions]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && !hasLoaded) {
      loadDmsOptions();
    }
  };

  const handleSelect = (dmsId: string) => {
    const selectedDms = dmsOptions.find((dms) => dms.id === dmsId);
    onChange(dmsId, selectedDms);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const selectedDms = dmsOptions.find((dms) => dms.id === value);

  const renderIcon = (icon: string, iconColor: string, bgColor: string, size: 'sm' | 'md' = 'sm') => {
    const IconComponent = getLucideIconByName(icon);
    const iconSizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    const containerSizeClass = size === 'sm' ? 'p-1' : 'p-1.5';

    return (
      <div
        className={cn('rounded-md inline-flex items-center justify-center flex-shrink-0', containerSizeClass)}
        style={{ backgroundColor: bgColor }}
      >
        {IconComponent ? (
          <IconComponent className={iconSizeClass} style={{ color: iconColor }} />
        ) : (
          <Building2 className={iconSizeClass} style={{ color: iconColor }} />
        )}
      </div>
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-left text-sm transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex min-w-0 items-center gap-2 truncate">
            {selectedDms ? (
              <>
                {renderIcon(selectedDms.icon, selectedDms.iconColor, selectedDms.bgColor)}
                {selectedDisplay === 'stacked' ? (
                  <div className="flex min-w-0 flex-col items-start">
                    <span className="truncate text-foreground">{selectedDms.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{selectedDms.id}</span>
                  </div>
                ) : (
                  <span className="truncate">{selectedDms.name}</span>
                )}
              </>
            ) : value ? (
              <>
                {renderIcon('Building2', '#888888', '#e0e0e0')}
                <span className="truncate">{value}</span>
              </>
            ) : (
              <span>{displayPlaceholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {value && !disabled && showAllOption && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={handleClear}
              />
            )}
            {(!value || !showAllOption) && (
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[300px] p-0 sm:w-[var(--radix-popover-trigger-width)]" align="start">
        <div className="max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : loadError ? (
            <div className="py-4 px-3 text-center">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button
                variant="link"
               
                onClick={() => loadDmsOptions()}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          ) : dmsOptions.length === 0 ? (
            <div className="py-4 px-3 text-center text-sm text-muted-foreground">
              No Registration Authorities found
            </div>
          ) : (
            <div className="py-1">
              {showAllOption && (
                <button
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors',
                    !value && 'bg-accent/50'
                  )}
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                >
                  <div className="p-1 rounded-md bg-muted">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span>All Registration Authorities</span>
                </button>
              )}
              {dmsOptions.map((dms) => (
                <button
                  key={dms.id}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors',
                    value === dms.id && 'bg-accent/50'
                  )}
                  onClick={() => handleSelect(dms.id)}
                >
                  {renderIcon(dms.icon, dms.iconColor, dms.bgColor)}
                  <div className="flex flex-col items-start truncate">
                    <span className="truncate font-medium">{dms.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{dms.id}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
