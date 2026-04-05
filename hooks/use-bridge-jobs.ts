"use client"

import { useCallback, useState } from "react"
import type { CronJob, JobOutput, BridgeEvent } from "@/types/hermes"

/**
 * Manages cron job state and CRUD actions.
 * Extracted from use-hermes-bridge.ts for clarity.
 */
export function useBridgeJobs(sendAction: (action: string, data?: Record<string, unknown>) => void) {
  const [jobsList, setJobsList] = useState<CronJob[]>([])
  const [jobOutputs, setJobOutputs] = useState<Record<string, JobOutput[]>>({})

  const handleEvent = useCallback((event: BridgeEvent): boolean => {
    switch (event.type) {
      case "jobs.list":
        setJobsList((event.jobs as CronJob[]) || [])
        return true
      case "job.created":
        return true
      case "job.output":
        setJobOutputs((prev) => ({
          ...prev,
          [event.job_id as string]: (event.outputs as JobOutput[]) || [],
        }))
        return true
      default:
        return false
    }
  }, [])

  const listJobs = useCallback(() => sendAction("list_jobs"), [sendAction])
  const createJob = useCallback(
    (data: { prompt: string; schedule: string; name?: string; repeat?: unknown; deliver?: string }) => {
      sendAction("create_job", data)
    },
    [sendAction],
  )
  const pauseJob = useCallback((jobId: string) => sendAction("pause_job", { job_id: jobId }), [sendAction])
  const resumeJob = useCallback((jobId: string) => sendAction("resume_job", { job_id: jobId }), [sendAction])
  const triggerJob = useCallback((jobId: string) => sendAction("trigger_job", { job_id: jobId }), [sendAction])
  const removeJob = useCallback((jobId: string) => sendAction("remove_job", { job_id: jobId }), [sendAction])
  const getJobOutput = useCallback((jobId: string) => sendAction("get_job_output", { job_id: jobId }), [sendAction])

  return {
    jobsList,
    jobOutputs,
    listJobs,
    createJob,
    pauseJob,
    resumeJob,
    triggerJob,
    removeJob,
    getJobOutput,
    handleEvent,
  }
}
