
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Workflow } from 'lucide-react';
import type { DeviceJob, JobDetail, JobHistoryEntry } from '@/types/iot';
import { JobWorkflowGraph } from './JobWorkflowGraph';
import { format, parseISO, isValid } from 'date-fns';

interface UpdateStatusTabProps {
  allRawEvents: any[];
}

export const UpdateStatusTab: React.FC<UpdateStatusTabProps> = ({ allRawEvents }) => {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const jobs: JobDetail[] = useMemo(() => {
    if (!allRawEvents) return [];
    
    const jobMap = new Map<string, JobDetail>();

    allRawEvents.forEach(event => {
        if (event.type === 'STATUS-UPDATED') {
            try {
                const parsedData = JSON.parse(event.description);
                if (parsedData.data?.job) {
                    const jobData = parsedData.data.job as DeviceJob;
                    const eventTime = event.timestampStr || new Date().toISOString();
                    
                    const historyEntry: JobHistoryEntry = {
                        mtime: eventTime,
                        status: {
                          state: jobData.status.state,
                          message: jobData.status.message,
                          clientId: jobData.clientId,
                          definitionHash: jobData.status.definitionHash,
                          progress: jobData.status.progress,
                          context: jobData.status.context,
                        }
                    };

                    let jobDetail = jobMap.get(jobData.id);

                    if (jobDetail) {
                        // Update mtime if this event is newer
                        if (isValid(parseISO(eventTime)) && (!jobDetail.mtime || !isValid(parseISO(jobDetail.mtime)) || parseISO(eventTime) > parseISO(jobDetail.mtime))) {
                           jobDetail.status = jobData.status;
                           jobDetail.mtime = eventTime;
                        }
                        jobDetail.history.push(historyEntry);
                    } else {
                        // Create new JobDetail entry
                        jobDetail = {
                            ...jobData,
                            history: [historyEntry],
                            mtime: eventTime, // Set initial mtime
                        };
                        jobMap.set(jobData.id, jobDetail);
                    }
                }
            } catch {
                // Ignore non-JSON or malformed descriptions
            }
        }
    });

    // Sort history for each job and then sort jobs by most recent event
    const jobArray = Array.from(jobMap.values());
    jobArray.forEach(job => {
        job.history.sort((a,b) => parseISO(a.mtime).getTime() - parseISO(b.mtime).getTime());
    });
    
    return jobArray.sort((a, b) => 
        parseISO(b.mtime).getTime() - parseISO(a.mtime).getTime()
    );

  }, [allRawEvents]);

  useEffect(() => {
    // Select the most recent job by default when the jobs list is populated
    if (jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    } else if (jobs.length > 0 && selectedJobId && !jobs.find(j => j.id === selectedJobId)) {
      // If the previously selected job is no longer in the list, select the new first one
      setSelectedJobId(jobs[0].id);
    } else if (jobs.length === 0) {
      setSelectedJobId(null);
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
                  jobHistory={selectedJob.history} // Now correctly passing the history array
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
