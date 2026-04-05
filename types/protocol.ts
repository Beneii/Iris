/**
 * Iris WebSocket Protocol — canonical action and event type definitions.
 *
 * All actions (frontend → bridge) and events (bridge → frontend) are listed here.
 * Use these constants instead of string literals for type safety.
 */

/* ─── Actions (Frontend → Bridge) ─── */
export const WS_ACTIONS = {
  // Messaging
  SEND_MESSAGE: "send_message",
  CANCEL_RESPONSE: "cancel_response",

  // Sessions
  NEW_SESSION: "new_session",
  RESUME_SESSION: "resume_session",
  DELETE_SESSION: "delete_session",
  LIST_SESSIONS: "list_sessions",
  INSERT_DIVIDER: "insert_divider",
  FORK_SESSION: "fork_session",

  // Channels
  LIST_CHANNELS: "list_channels",
  CREATE_CHANNEL: "create_channel",
  ARCHIVE_CHANNEL: "archive_channel",
  UNARCHIVE_CHANNEL: "unarchive_channel",
  PIN_MESSAGE: "pin_message",
  UNPIN_MESSAGE: "unpin_message",
  GET_PINNED: "get_pinned",

  // Config
  GET_CONFIG: "get_config",
  SET_CONFIG: "set_config",
  LIST_PROVIDERS: "list_providers",

  // Data
  GET_MEMORY: "get_memory",
  GET_SKILLS: "get_skills",
  GET_TOOLSETS: "get_toolsets",
  GET_PERMISSIONS: "get_permissions",
  SET_PERMISSIONS: "set_permissions",

  // Agents
  GET_AGENTS: "get_agents",
  GET_HEALTH: "get_health",
  RESTART_AGENT: "restart_agent",
  GET_QUEUE_STATUS: "get_queue_status",
  GET_SESSION_ROSTER: "get_session_roster",

  // Jobs
  LIST_JOBS: "list_jobs",
  CREATE_JOB: "create_job",
  PAUSE_JOB: "pause_job",
  RESUME_JOB: "resume_job",
  TRIGGER_JOB: "trigger_job",
  REMOVE_JOB: "remove_job",

  // Projects
  LIST_PROJECTS: "list_projects",
  CREATE_PROJECT: "create_project",
  UPDATE_PROJECT: "update_project",
  DELETE_PROJECT: "delete_project",
  LINK_SESSION_TO_PROJECT: "link_session_to_project",
  UNLINK_SESSION_FROM_PROJECT: "unlink_session_from_project",
  GET_PROJECT_MEMORY: "get_project_memory",

  // App state
  APP_STATE: "app_state",
  GET_SOUL: "get_soul",
} as const

/* ─── Events (Bridge → Frontend) ─── */
export const WS_EVENTS = {
  // Connection
  CONNECTION_READY: "connection.ready",
  AUTH_FAILED: "auth.failed",

  // Messaging
  RESPONSE_STARTED: "response.started",
  MESSAGE_DELTA: "message.delta",
  MESSAGE_DELTA_END: "message.delta.end",
  REASONING_DELTA: "reasoning.delta",
  STEP: "step",
  RESPONSE_COMPLETED: "response.completed",
  RESPONSE_ERROR: "response.error",
  RESPONSE_CANCELLED: "response.cancelled",
  MESSAGE_USER: "message.user",
  MESSAGE_IMAGE: "message.image",
  HERMES_MESSAGE: "hermes.message",

  // Tools
  TOOL_PREPARING: "tool.preparing",
  TOOL_STARTED: "tool.started",

  // Sessions
  SESSION_CREATED: "session.created",
  SESSION_RESUMED: "session.resumed",
  SESSION_DELETED: "session.deleted",
  SESSIONS_LIST: "sessions.list",
  SESSION_ROSTER: "session.roster",
  SESSION_FORKED: "session.forked",

  // Channels
  CHANNELS_LIST: "channels.list",
  CHANNEL_CREATED: "channel.created",
  CHANNEL_ARCHIVED: "channel.archived",
  CHANNEL_UNARCHIVED: "channel.unarchived",
  CHANNEL_PINNED: "channel.pinned",

  // Config
  CONFIG_STATE: "config.state",
  CONFIG_UPDATED: "config.updated",
  CONFIG_ERROR: "config.error",
  PROVIDERS_LIST: "providers.list",

  // Data
  MEMORY_STATE: "memory.state",
  MEMORY_UPDATED: "memory.updated",
  SKILLS_LIST: "skills.list",
  TOOLSETS_LIST: "toolsets.list",
  PERMISSIONS_STATE: "permissions.state",

  // Agents
  AGENTS_LIST: "agents.list",
  AGENT_RESTARTED: "agent.restarted",
  AGENT_DELEGATED: "agent.delegated",
  HEALTH_STATE: "health.state",

  // Queue
  QUEUE_STATUS: "queue.status",
  QUEUE_JOB_QUEUED: "queue.job_queued",
  QUEUE_JOB_STARTED: "queue.job_started",

  // Jobs
  JOBS_LIST: "jobs.list",
  JOB_CREATED: "job.created",
  JOB_UPDATED: "job.updated",

  // Projects
  PROJECTS_LIST: "projects.list",
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  PROJECT_MEMORY: "project.memory",
} as const

export type WsAction = typeof WS_ACTIONS[keyof typeof WS_ACTIONS]
export type WsEvent = typeof WS_EVENTS[keyof typeof WS_EVENTS]
