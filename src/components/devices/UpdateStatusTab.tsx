
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Info, Workflow, Settings, Eye, BookOpen } from 'lucide-react';
import type { DeviceJob, JobDetail, JobHistoryEntry, DeviceJobWorkflow } from '@/types/iot';
import { JobWorkflowGraph } from './JobWorkflowGraph';
import { format, parseISO, isValid } from 'date-fns';

import directWorkflow from '@/lib/workflows/direct.json';
import phasedWorkflow from '@/lib/workflows/phased.json';

interface UpdateStatusTabProps {
  allRawEvents: any[];
  selectedWorkflowName?: string;
  selectedJobId?: string;
  onWorkflowChange?: (workflowName: string) => void;
  onJobChange?: (jobId: string) => void;
}

export const UpdateStatusTab: React.FC<UpdateStatusTabProps> = ({ 
  allRawEvents, 
  selectedWorkflowName: externalWorkflowName = '', 
  selectedJobId: externalJobId = '', 
  onWorkflowChange, 
  onJobChange 
}) => {
  // Use external state if provided, otherwise use internal state
  const [internalSelectedJobId, setInternalSelectedJobId] = useState<string | null>(null);
  const [internalSelectedWorkflowName, setInternalSelectedWorkflowName] = useState<string>('');
  const [isWorkflowViewModalOpen, setIsWorkflowViewModalOpen] = useState(false);
  const [workflowViewSelection, setWorkflowViewSelection] = useState<string>('');
  
  const selectedJobId = externalJobId || internalSelectedJobId;
  const selectedWorkflowName = externalWorkflowName || internalSelectedWorkflowName;
  const setSelectedJobId = onJobChange || setInternalSelectedJobId;
  const setSelectedWorkflowName = onWorkflowChange || setInternalSelectedWorkflowName;
  
  // Handle "latest" value by treating it as null/empty for job selection logic
  const actualSelectedJobId = selectedJobId === 'latest' ? null : selectedJobId;

  // Available workflows - can be extended with more workflows
  const availableWorkflows = useMemo(() => {
    const workflows = [
      {
        name: 'wfx.workflow.dau.direct',
        displayName: 'Direct Update Workflow',
        description: 'Single-phase direct device update workflow',
        definition: directWorkflow as DeviceJobWorkflow
      },
      {
        name: 'wfx.workflow.dau.phased',
        displayName: 'Phased Update Workflow', 
        description: 'Multi-phase device update workflow with validation steps',
        definition: phasedWorkflow as DeviceJobWorkflow
      }
    ];
    
    return workflows;
  }, []);

  // Auto-select the first workflow if none selected
  useEffect(() => {
    if (!selectedWorkflowName && availableWorkflows.length > 0) {
      setSelectedWorkflowName(availableWorkflows[0].name);
    }
  }, [selectedWorkflowName, availableWorkflows, setSelectedWorkflowName]);

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
    if (jobs.length > 0 && !actualSelectedJobId) {
      setSelectedJobId(jobs[0].id);
    } else if (jobs.length > 0 && actualSelectedJobId && !jobs.find(j => j.id === actualSelectedJobId)) {
      // If the previously selected job is no longer in the list, select the new first one
      setSelectedJobId(jobs[0].id);
    } else if (jobs.length === 0) {
      setSelectedJobId('latest');
    }
  }, [jobs, actualSelectedJobId, setSelectedJobId]);

  // Auto-select latest job when workflow changes
  useEffect(() => {
    if (selectedWorkflowName && jobs.length > 0) {
      // Find the latest job for the selected workflow
      const jobsForWorkflow = jobs.filter(job => job.workflow.name === selectedWorkflowName);
      if (jobsForWorkflow.length > 0) {
        // Jobs are already sorted by mtime descending, so take the first one
        const latestJobForWorkflow = jobsForWorkflow[0];
        setSelectedJobId(latestJobForWorkflow.id);
      } else {
        // No jobs for this workflow, clear selection
        setSelectedJobId(null);
      }
    }
  }, [selectedWorkflowName, jobs]);

  const selectedJob = jobs.find(job => job.id === actualSelectedJobId);
  const selectedWorkflow = availableWorkflows.find(wf => wf.name === selectedWorkflowName);
  
  // Find the latest job for the selected workflow
  const latestJobForWorkflow = useMemo(() => {
    if (!selectedWorkflowName) return null;
    return jobs.find(job => job.workflow.name === selectedWorkflowName) || null;
  }, [jobs, selectedWorkflowName]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5"/> 
              Event workflow
            </CardTitle>
            <CardDescription>
              Track update job progress and view workflow definitions.
            </CardDescription>
          </div>
          
          {/* View Workflow button */}
          <Dialog open={isWorkflowViewModalOpen} onOpenChange={setIsWorkflowViewModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <BookOpen className="w-4 h-4 mr-2" />
                View Workflows
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Workflow Definitions</DialogTitle>
                <DialogDescription>
                  Select a workflow to view its complete definition and state flow.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Workflow Selector in Modal */}
                <Select value={workflowViewSelection} onValueChange={setWorkflowViewSelection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workflow to view..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorkflows.map(workflow => (
                      <SelectItem key={workflow.name} value={workflow.name}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{workflow.displayName}</span>
                          <span className="text-xs text-muted-foreground">{workflow.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Workflow Graph in Modal */}
                <div className="h-[600px] w-full border rounded-md bg-muted/20 relative">
                  {workflowViewSelection ? (
                    <JobWorkflowGraph 
                      workflow={availableWorkflows.find(w => w.name === workflowViewSelection)?.definition}
                      jobHistory={[]} // Empty history for pure workflow view
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Select a workflow above to view its definition.</p>
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">

        {/* Status Info */}
        {latestJobForWorkflow && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Info className="w-4 h-4" />
              <span className="font-medium">
                {selectedJob ? `Selected Job` : `Latest Job for ${selectedWorkflow?.displayName}`}
              </span>
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Job {(selectedJob || latestJobForWorkflow).id.slice(-8)} - Current State: <strong>{(selectedJob || latestJobForWorkflow).status.state}</strong>
              {(selectedJob || latestJobForWorkflow).status.message && (
                <span className="ml-2 italic">"{(selectedJob || latestJobForWorkflow).status.message}"</span>
              )}
            </p>
          </div>
        )}

        {/* Job Tracking Visualization */}
        <div className="h-[500px] w-full border rounded-md bg-muted/20 relative">
          {(() => {
            if (jobs.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
                  <Info className="w-8 h-8" />
                  <p className="font-medium">No Update Jobs Found</p>
                  <p className="text-sm text-center">
                    There are no update-related jobs recorded in this device's event history.
                  </p>
                </div>
              );
            }

            const jobsForWorkflow = jobs.filter(job => job.workflow.name === selectedWorkflowName);
            
            if (jobsForWorkflow.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
                  <Workflow className="w-8 h-8" />
                  <p className="font-medium">No Jobs for Selected Workflow</p>
                  <p className="text-sm text-center">
                    No jobs found for "{selectedWorkflow?.displayName}" workflow.
                  </p>
                </div>
              );
            }

            // Show selected job or latest job for workflow
            const jobToShow = selectedJob || latestJobForWorkflow;
            
            if (jobToShow) {
              return (
                <JobWorkflowGraph 
                  workflow={jobToShow.workflow}
                  jobHistory={jobToShow.history}
                />
              );
            } else {
              return (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Select a workflow type to view job progress.</p>
                </div>
              );
            }
          })()}
        </div>
      </CardContent>
    </Card>
  );
};
