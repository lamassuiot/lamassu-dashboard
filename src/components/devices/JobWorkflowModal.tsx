
// src/components/devices/JobWorkflowModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { JobWorkflowGraph } from './JobWorkflowGraph';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { DeviceJob } from '@/types/iot';
import { format, isValid, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceJobsForLaunch } from '@/lib/iot-api';

interface JobWorkflowModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  deviceId: string;
  initialJobs: DeviceJob[];
}

export const JobWorkflowModal: React.FC<JobWorkflowModalProps> = ({
  isOpen,
  onOpenChange,
  deviceId,
  initialJobs,
}) => {
  const { user } = useAuth();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [allJobsForDevice, setAllJobsForDevice] = useState<DeviceJob[]>(initialJobs);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [errorJobs, setErrorJobs] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Set initial state from the passed-in jobs
      setAllJobsForDevice(initialJobs);
      if (initialJobs.length > 0) {
        setSelectedJobId(initialJobs[0].id);
      } else {
        setSelectedJobId(null);
        // If no initial jobs, fetch all for the device to populate the selector
        const fetchAllJobs = async () => {
          if (!user?.access_token) return;
          setIsLoadingJobs(true);
          setErrorJobs(null);
          try {
            const jobs = await fetchDeviceJobsForLaunch({ dmsId: '*', deviceIds: [deviceId], accessToken: user.access_token });
            const statusUpdateJobs = jobs.filter(job => job.definition.type.includes("wfx.workflow.dau.direct"));
            setAllJobsForDevice(statusUpdateJobs);
            if (statusUpdateJobs.length > 0) {
                setSelectedJobId(statusUpdateJobs[0].id);
            }
          } catch (e: any) {
            setErrorJobs(e.message || "Failed to fetch device jobs.");
          } finally {
            setIsLoadingJobs(false);
          }
        };
        fetchAllJobs();
      }
    }
  }, [isOpen, initialJobs, deviceId, user?.access_token]);

  const selectedJob = allJobsForDevice.find(job => job.id === selectedJobId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Job Workflow Visualizer</DialogTitle>
          <DialogDescription>
            Visual representation of the state machine for a device update job.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 flex-grow flex flex-col gap-4 min-h-0">
            {isLoadingJobs ? (
                 <div className="flex items-center space-x-2 p-2 h-10 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading jobs...</span>
                </div>
            ) : errorJobs ? (
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{errorJobs}</AlertDescription>
                </Alert>
            ) : allJobsForDevice.length > 0 ? (
                 <Select value={selectedJobId || ''} onValueChange={setSelectedJobId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a job..." />
                    </SelectTrigger>
                    <SelectContent>
                        {allJobsForDevice.map(job => (
                            <SelectItem key={job.id} value={job.id}>
                                {job.id} ({job.stime && isValid(parseISO(job.stime)) ? format(parseISO(job.stime), 'PPp') : 'No start time'}) - {job.workflow.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : null}
         
          <div className="flex-grow w-full h-full border rounded-md bg-muted/20 relative">
            {selectedJob ? (
              <JobWorkflowGraph 
                workflow={selectedJob.workflow}
                jobHistory={selectedJob.history}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {isLoadingJobs ? 'Loading...' : allJobsForDevice.length === 0 ? 'No update jobs found for this device.' : 'Select a job to view its workflow.'}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
