// src/components/devices/JobWorkflowModal.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { JobWorkflowGraph } from './JobWorkflowGraph';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { DeviceJob, JobHistoryEntry } from '@/types/iot';
import { format, isValid, parseISO } from 'date-fns';

interface JobWorkflowModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  deviceId: string;
  allDeviceEvents: any[]; // All events for the device
  initialEventData?: any; // The specific event that triggered the modal
}

export const JobWorkflowModal: React.FC<JobWorkflowModalProps> = ({
  isOpen,
  onOpenChange,
  deviceId,
  allDeviceEvents,
  initialEventData,
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [allJobs, setAllJobs] = useState<DeviceJob[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Process all events to construct the job list
      const jobMap = new Map<string, DeviceJob>();

      allDeviceEvents.forEach(event => {
        if (event.type === 'STATUS-UPDATED') {
          try {
            const parsedData = JSON.parse(event.description);
            if (parsedData.data?.job) {
              const job = parsedData.data.job as DeviceJob;
              const eventTime = event.timestampStr || new Date().toISOString();
              
              const historyEntry: JobHistoryEntry = {
                mtime: eventTime,
                status: {
                  clientId: job.clientId,
                  definitionHash: job.status.definitionHash,
                  state: job.status.state,
                  message: job.status.message,
                  progress: job.status.progress,
                  context: job.status.context,
                },
              };

              const existingJob = jobMap.get(job.id);
              if (existingJob) {
                if (isValid(parseISO(eventTime)) && (!existingJob.mtime || !isValid(parseISO(existingJob.mtime)) || parseISO(eventTime) > parseISO(existingJob.mtime))) {
                   existingJob.status = job.status;
                   existingJob.mtime = eventTime;
                }
                // Check for duplicates before pushing
                if (!existingJob.history.some(h => h.mtime === historyEntry.mtime && h.status.state === historyEntry.status.state)) {
                  existingJob.history.push(historyEntry);
                }
              } else {
                job.history = [historyEntry];
                job.mtime = eventTime;
                jobMap.set(job.id, job);
              }
            }
          } catch {
            // Ignore non-JSON descriptions
          }
        }
      });
      
      const jobsFromEvents = Array.from(jobMap.values())
        .sort((a, b) => parseISO(b.mtime).getTime() - parseISO(a.mtime).getTime());
        
      setAllJobs(jobsFromEvents);
      
      // Set the initial selected job ID from the event that opened the modal
      if (initialEventData?.job?.id) {
        setSelectedJobId(initialEventData.job.id);
      } else if (jobsFromEvents.length > 0) {
        setSelectedJobId(jobsFromEvents[0].id);
      } else {
        setSelectedJobId(null);
      }
    }
  }, [isOpen, allDeviceEvents, initialEventData]);
  
  const selectedJob = allJobs.find(job => job.id === selectedJobId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Job Workflow Visualizer</DialogTitle>
          <DialogDescription>
            Visual representation of the state machine for device update job on: {deviceId}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 flex-grow flex flex-col gap-4 min-h-0">
          {allJobs.length > 0 ? (
            <Select value={selectedJobId || ''} onValueChange={setSelectedJobId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a job to view its workflow..." />
              </SelectTrigger>
              <SelectContent>
                {allJobs.map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    Job ID: {job.id} (Last updated: {isValid(parseISO(job.mtime)) ? format(parseISO(job.mtime), 'PPp') : 'N/A'}) - {job.workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Update Jobs</AlertTitle>
              <AlertDescription>No update jobs found in this device's history.</AlertDescription>
            </Alert>
          )}

          <div className="flex-grow w-full h-full border rounded-md bg-muted/20 relative">
            {selectedJob ? (
              <JobWorkflowGraph 
                workflow={selectedJob.workflow}
                jobHistory={selectedJob.history}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>{allJobs.length > 0 ? 'Select a job to view its workflow.' : 'No update jobs to display.'}</p>
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
