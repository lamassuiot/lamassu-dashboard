
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertTriangle, Workflow } from 'lucide-react';
import type { DeviceJob } from '@/types/iot';
import { JobWorkflowGraph } from './JobWorkflowGraph';
import { format, parseISO, isValid } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceJobsForLaunch } from '@/lib/iot-api';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';

interface UpdateStatusTabProps {
  allRawEvents: any[];
}

export const UpdateStatusTab: React.FC<UpdateStatusTabProps> = ({ allRawEvents }) => {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const jobs: DeviceJob[] = useMemo(() => {
    if (!allRawEvents) return [];
    
    const jobMap = new Map<string, DeviceJob>();

    allRawEvents.forEach(event => {
        if (event.type === 'STATUS-UPDATED') {
            try {
                const parsedData = JSON.parse(event.description);
                if (parsedData.data?.job) {
                    const job = parsedData.data.job as DeviceJob;
                    const eventTime = event.timestampStr || new Date().toISOString();
                    
                    const historyEntry = {
                        mtime: eventTime,
                        status: {
                          state: job.status.state,
                          message: job.status.message,
                          clientId: job.clientId,
                          definitionHash: job.status.definitionHash,
                          progress: job.status.progress,
                          context: job.status.context,
                        }
                    };

                    const existingJob = jobMap.get(job.id);
                    if (existingJob) {
                        // Ensure mtime is valid before comparing
                        if (isValid(parseISO(eventTime)) && (!existingJob.mtime || !isValid(parseISO(existingJob.mtime)) || parseISO(eventTime) > parseISO(existingJob.mtime))) {
                           existingJob.status = job.status;
                           existingJob.mtime = eventTime;
                        }
                        existingJob.history.push(historyEntry);
                        // Re-sort history to ensure it's always chronological
                        existingJob.history.sort((a,b) => parseISO(a.mtime).getTime() - parseISO(b.mtime).getTime());

                    } else {
                        // Create new job entry with initial history and valid mtime
                        job.history = [historyEntry];
                        job.mtime = eventTime; // Set initial mtime
                        jobMap.set(job.id, job);
                    }
                }
            } catch {
                // Ignore non-JSON or malformed descriptions
            }
        }
    });

    // Sort jobs by the most recent event timestamp (which is the job's last mtime)
    return Array.from(jobMap.values())
        .filter(job => job.mtime && isValid(parseISO(job.mtime))) // Ensure jobs have a valid mtime
        .sort((a, b) => 
            parseISO(b.mtime).getTime() - parseISO(a.mtime).getTime()
        );
  }, [allRawEvents]);

  useEffect(() => {
    if (jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  const selectedJob = jobs.find(job => job.id === selectedJobId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5"/> Update Status</CardTitle>
        <CardDescription>
          Visualize the workflow status for device update jobs. Select a job to see its progress.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobs.length > 0 ? (
          <>
            <Select value={selectedJobId || ''} onValueChange={setSelectedJobId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a job to view its workflow..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    Job ID: {job.id} (Last updated: {format(parseISO(job.mtime), 'PPp')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="h-[500px] w-full border rounded-md bg-muted/20 relative">
              {selectedJob ? (
                <JobWorkflowGraph 
                  workflow={selectedJob.workflow}
                  jobHistory={selectedJob.history}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Select a job from the dropdown to see its workflow.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <Alert>
            <Info className="h-4 w-4"/>
            <AlertTitle>No Update Jobs Found</AlertTitle>
            <AlertDescription>
              There are no update-related jobs recorded in this device's event history.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
