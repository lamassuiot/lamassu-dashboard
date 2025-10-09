
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertTriangle, Workflow } from 'lucide-react';
import type { DeviceJob, JobHistoryEntry } from '@/types/iot';
import { JobWorkflowGraph } from './JobWorkflowGraph';
import { format, parseISO } from 'date-fns';

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
                    // Add a history entry to the job
                    const historyEntry: JobHistoryEntry = {
                        mtime: event.timestampStr,
                        status: job.status,
                    };
                    
                    if (jobMap.has(job.id)) {
                        const existingJob = jobMap.get(job.id)!;
                        // Update with latest status and append history
                        existingJob.status = job.status;
                        existingJob.history.push(historyEntry);
                    } else {
                        // Create new job entry with initial history
                        job.history = [historyEntry];
                        jobMap.set(job.id, job);
                    }
                }
            } catch {
                // Ignore non-JSON or malformed descriptions
            }
        }
    });

    // Sort jobs by the most recent event timestamp (which is the job's last mtime)
    return Array.from(jobMap.values()).sort((a, b) => 
        parseISO(b.history[b.history.length-1].mtime).getTime() - parseISO(a.history[a.history.length-1].mtime).getTime()
    );
  }, [allRawEvents]);

  useEffect(() => {
    if (jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  const selectedJob = jobs.find(job => job.id === selectedJobId);

  const stateHistory = useMemo(() => {
    if (!selectedJob) return [];
    // Collect all unique states from the job's history
    return [...new Set(selectedJob.history.map(h => h.status.state))];
  }, [selectedJob]);


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
                    Job ID: {job.id} (Last updated: {format(parseISO(job.history[job.history.length-1].mtime), 'PPp')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="h-[500px] w-full border rounded-md bg-muted/20 relative">
              {selectedJob ? (
                <JobWorkflowGraph 
                  workflow={selectedJob.workflow}
                  historyStates={stateHistory}
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
