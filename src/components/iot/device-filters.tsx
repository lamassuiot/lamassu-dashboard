// src/components/iot/device-filters.tsx
"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter } from 'lucide-react';

export function DeviceFilters() {
  // Placeholder state and handlers
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [firmwareFilter, setFirmwareFilter] = React.useState<string>("");
  const [locationFilter, setLocationFilter] = React.useState<string>("");

  const handleApplyFilters = () => {
    console.log({ statusFilter, firmwareFilter, locationFilter });
    // Implement filter logic here
  };

  const handleClearFilters = () => {
    setStatusFilter("");
    setFirmwareFilter("");
    setLocationFilter("");
    // Implement clear filter logic here
  };

  return (
    <div className="mb-6 p-4 bg-card rounded-lg shadow">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
        <div className="space-y-1">
          <label htmlFor="status-filter" className="text-sm font-medium text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="updating">Updating</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="firmware-filter" className="text-sm font-medium text-muted-foreground">Firmware Version</label>
          <Input 
            id="firmware-filter" 
            placeholder="e.g., v1.2.3" 
            value={firmwareFilter} 
            onChange={(e) => setFirmwareFilter(e.target.value)} 
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="location-filter" className="text-sm font-medium text-muted-foreground">Location</label>
          <Input 
            id="location-filter" 
            placeholder="e.g., Building A" 
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
        </div>
        
        <div className="space-y-1">
           <label htmlFor="last-seen-filter" className="text-sm font-medium text-muted-foreground">Last Seen</label>
           <Select>
            <SelectTrigger id="last-seen-filter">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleApplyFilters} className="w-full sm:w-auto">
            <Filter className="mr-2 h-4 w-4" /> Apply
          </Button>
          <Button variant="outline" onClick={handleClearFilters} className="w-full sm:w-auto">
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
