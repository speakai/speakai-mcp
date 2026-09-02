/**
 * Static manifest of every Speak MCP tool name exposed by `registerAllTools`.
 *
 * This list is the single source of truth that consumers (e.g. speak-server's
 * orchestrator bridge) can import to route or validate tool calls without
 * spinning up an `McpServer` instance and inspecting its private
 * `_registeredTools` map.
 *
 * Keep this list in sync with `src/tools/*.ts`. A coverage test in
 * `tests/tools-coverage.test.ts` asserts that `SPEAK_MCP_TOOL_NAMES` matches
 * the actual tools registered by `registerAllTools`, so adding or removing a
 * tool without updating this constant will fail CI.
 */
export const SPEAK_MCP_TOOL_NAMES = [
  // analytics
  "get_media_statistics",

  // automations
  "list_automations",
  "list_automation_names",
  "get_automation",
  "get_automation_runs",
  "create_automation",
  "update_automation",
  "toggle_automation_status",
  "bulk_update_automation_status",
  "bulk_assign_automation_folders",
  "run_automations",
  "delete_automation",
  "list_automation_apps",
  "list_automation_triggers",
  "list_automation_actions",

  // clips
  "get_clips",
  "create_clip",
  "update_clip",
  "delete_clip",

  // embed
  "create_embed",
  "update_embed",
  "check_embed",
  "get_embed_iframe_url",

  // exports
  "export_media",
  "export_multiple_media",

  // fields
  "list_fields",
  "create_field",
  "update_field",
  "update_multiple_fields",

  // folders
  "list_folders",
  "create_folder",
  "update_folder",
  "delete_folder",
  "get_folder_info",
  "clone_folder",
  "get_folder_views",
  "get_all_folder_views",
  "create_folder_view",
  "update_folder_view",
  "clone_folder_view",

  // media
  "get_signed_upload_url",
  "upload_media",
  "get_media_status",
  "get_media_insights",
  "get_transcript",
  "list_media",
  "search_media",
  "delete_media",
  "update_media_metadata",
  "toggle_media_favorite",
  "reanalyze_media",
  "get_captions",
  "list_supported_languages",
  "update_transcript_speakers",
  "update_transcription",
  "bulk_update_transcript_speakers",
  "bulk_move_media",

  // meeting
  "list_meeting_events",
  "schedule_meeting_event",
  "remove_assistant_from_meeting",
  "delete_scheduled_assistant",
  "get_live_meeting_transcript",

  // prompt
  "ask_ai_chat",
  "get_analysis_quote",
  "list_prompts",
  "get_favorite_prompts",
  "toggle_prompt_favorite",
  "get_chat_history",
  "get_chat_messages",
  "update_chat_title",
  "delete_chat_message",
  "submit_chat_feedback",
  "retry_ai_chat",
  "export_chat_answer",
  "get_chat_statistics",

  // recorder
  "list_recorders",
  "create_recorder",
  "update_recorder_settings",
  "update_recorder_questions",
  "delete_recorder",
  "generate_recorder_url",
  "get_recorder_info",
  "get_recorder_recordings",
  "check_recorder_status",
  "clone_recorder",

  // text
  "create_text_note",
  "update_text_note",
  "get_text_insight",
  "reanalyze_text",

  // webhooks
  "list_webhooks",
  "create_webhook",
  "update_webhook",
  "provision_inbound_webhook",
  "get_inbound_webhook",
  "get_webhook_attempts",
  "delete_webhook",

  // workflows (high-level wrappers around media + upload + automation tools)
  "build_automation",
  "upload_and_analyze",
  "upload_and_analyze_batch",
  "upload_local_file",

  // users / team management
  "list_users",
  "list_user_groups",
  "create_user_group",
  "update_user_group",
  "delete_user_group",

  // dashboards
  "list_dashboard_widgets",
  "list_dashboards",
  "get_dashboard",
  "create_dashboard",
  "update_dashboard",
  "delete_dashboard",
  "duplicate_dashboard",
  "share_dashboard",
  "get_dashboard_speakers_insight",
] as const satisfies readonly string[];

export type SpeakMcpToolName = (typeof SPEAK_MCP_TOOL_NAMES)[number];
