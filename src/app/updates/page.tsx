
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Search, MoreVertical, Plus, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';

// Define update pack data structure
interface UpdatePack {
  id: string;
  name: string;
  version: string;
  description: string;
  targetTags: string[];
  status: 'Rolling Out' | 'Completed' | 'Scheduled' | 'Failed';
  progress: number;
  errorRate: number;
  totalDevices: number;
  updatedDevices: number;
  createdAt: string;
}

// Mock data for update packs
const mockUpdatePacks: UpdatePack[] = [
  {
    id: '1',
    name: 'Firmware Update',
    version: 'v2.4.1',
    description: 'Security patches and performance improvements',
    targetTags: ['production', 'eu-west'],
    status: 'Rolling Out',
    progress: 65,
    errorRate: 2.3,
    totalDevices: 1250,
    updatedDevices: 813,
    createdAt: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    name: 'Configuration Update',
    version: 'v1.2.0',
    description: 'Updated network configuration and certificates',
    targetTags: ['staging', 'us-east'],
    status: 'Completed',
    progress: 100,
    errorRate: 0.5,
    totalDevices: 450,
    updatedDevices: 450,
    createdAt: '2024-01-14T08:15:00Z',
  },
  {
    id: '3',
    name: 'Firmware Update',
    version: 'v2.4.2',
    description: 'Critical bug fixes for sensor data collection',
    targetTags: ['production', 'us-west'],
    status: 'Scheduled',
    progress: 0,
    errorRate: 0,
    totalDevices: 890,
    updatedDevices: 0,
    createdAt: '2024-01-16T14:00:00Z',
  },
  {
    id: '4',
    name: 'Security Update',
    version: 'v3.0.0',
    description: 'Major security enhancements and TLS updates',
    targetTags: ['production', 'all-regions'],
    status: 'Failed',
    progress: 25,
    errorRate: 45.2,
    totalDevices: 2100,
    updatedDevices: 525,
    createdAt: '2024-01-13T16:45:00Z',
  },
];

// Status badge styling helper
function getStatusBadgeVariant(status: UpdatePack['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'Rolling Out':
      return 'default';
    case 'Completed':
      return 'secondary';
    case 'Scheduled':
      return 'outline';
    case 'Failed':
      return 'destructive';
    default:
      return 'default';
  }
}

// Status icon helper
function getStatusIcon(status: UpdatePack['status']) {
  switch (status) {
    case 'Rolling Out':
      return <Clock className="h-3 w-3" />;
    case 'Completed':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'Scheduled':
      return <Clock className="h-3 w-3" />;
    case 'Failed':
      return <XCircle className="h-3 w-3" />;
    default:
      return null;
  }
}

export default function UpdatesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [updatePacks] = useState<UpdatePack[]>(mockUpdatePacks);

  // Filter update packs based on search query
  const filteredPacks = updatePacks.filter(pack =>
    pack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pack.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pack.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">IoT Firmware Updates</h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor firmware updates across your device fleet
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Update Pack
        </Button>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search update packs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Update packs table */}
      <div className="border rounded-lg flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name / Version</TableHead>
              <TableHead className="w-[300px]">Description</TableHead>
              <TableHead className="w-[180px]">Target Tags</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[200px]">Rollout Progress</TableHead>
              <TableHead className="w-[100px]">Error Rate</TableHead>
              <TableHead className="w-[70px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPacks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No update packs found. Create your first update pack to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredPacks.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{pack.name}</span>
                      <span className="text-sm text-muted-foreground">{pack.version}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-2">
                      {pack.description}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {pack.targetTags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(pack.status)} className="flex items-center gap-1 w-fit">
                      {getStatusIcon(pack.status)}
                      {pack.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pack.updatedDevices} / {pack.totalDevices} devices</span>
                        <span>{pack.progress}%</span>
                      </div>
                      <Progress value={pack.progress} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {pack.errorRate > 10 ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : null}
                      <span className={pack.errorRate > 10 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {pack.errorRate.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>View Devices</DropdownMenuItem>
                        {pack.status === 'Rolling Out' && (
                          <DropdownMenuItem>Pause Rollout</DropdownMenuItem>
                        )}
                        {pack.status === 'Scheduled' && (
                          <DropdownMenuItem>Edit Schedule</DropdownMenuItem>
                        )}
                        {pack.status === 'Failed' && (
                          <DropdownMenuItem>Retry Failed Devices</DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive">Cancel Update</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
