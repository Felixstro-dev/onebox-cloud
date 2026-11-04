import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  quotaBytes: integer('quota_bytes').notNull().default(0),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  recoveryCodes: text('recovery_codes'),
  totpLastCounter: integer('totp_last_counter'),
  createdAt: integer('created_at').notNull().default(now),
  lastLoginAt: integer('last_login_at'),
}, (t) => [uniqueIndex('users_username_uq').on(sql`lower(${t.username})`)]);

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at').notNull().default(now),
});

export const groupMembers = sqliteTable('group_members', {
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] })]);

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  kind: text('kind', { enum: ['file', 'folder'] }).notNull(),
  name: text('name').notNull(),
  nameKey: text('name_key').notNull(),
  size: integer('size').notNull().default(0),
  mime: text('mime').notNull().default('application/octet-stream'),
  hash: text('hash'),
  storageId: text('storage_id').notNull().default('local'),
  objectKey: text('object_key'),
  width: integer('width'),
  height: integer('height'),
  takenAt: integer('taken_at'),
  trashedAt: integer('trashed_at'),
  trashedFrom: text('trashed_from'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, (t) => [
  index('nodes_parent_idx').on(t.ownerId, t.parentId, t.trashedAt, t.nameKey),
  index('nodes_search_idx').on(t.ownerId, t.nameKey),
  index('nodes_trash_idx').on(t.ownerId, t.trashedAt),
  index('nodes_photo_idx').on(t.ownerId, t.mime, t.takenAt),
  index('nodes_page_name_idx').on(t.ownerId, t.trashedAt, t.parentId, t.kind, t.nameKey, t.id),
  index('nodes_page_size_idx').on(t.ownerId, t.trashedAt, t.parentId, t.kind, t.size, t.id),
  index('nodes_page_updated_idx').on(t.ownerId, t.trashedAt, t.parentId, t.kind, t.updatedAt, t.id),
  index('nodes_parent_folder_idx').on(t.ownerId, t.parentId, t.trashedAt, t.kind),
]);

export const shares = sqliteTable('shares', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  kind: text('kind', { enum: ['link', 'upload'] }).notNull().default('link'),
  nodeId: text('node_id').references(() => nodes.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash'),
  expiresAt: integer('expires_at'),
  maxDownloads: integer('max_downloads'),
  downloadCount: integer('download_count').notNull().default(0),
  maxFileSize: integer('max_file_size'),
  maxTotalSize: integer('max_total_size'),
  allowedTypes: text('allowed_types'),
  totalUploaded: integer('total_uploaded').notNull().default(0),
  revokedAt: integer('revoked_at'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [
  uniqueIndex('shares_token_uq').on(t.tokenHash),
  index('shares_owner_idx').on(t.ownerId),
  index('shares_node_idx').on(t.nodeId),
]);

export const uploadSessions = sqliteTable('upload_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  offset: integer('offset').notNull().default(0),
  tempKey: text('temp_key').notNull(),
  shareId: text('share_id').references(() => shares.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, (t) => [index('uploads_user_idx').on(t.userId, t.updatedAt)]);

export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: integer('created_at').notNull().default(now),
  lastSeenAt: integer('last_seen_at').notNull().default(now),
  expiresAt: integer('expires_at').notNull(),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)]);

export const storageLocations = sqliteTable('storage_locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('local'),
  rootPath: text('root_path').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(now),
});

export const backupJobs = sqliteTable('backup_jobs', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceNodeId: text('source_node_id').references(() => nodes.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull().default('local'),
  targetConfig: text('target_config').notNull().default('{}'),
  schedule: text('schedule'),
  retention: integer('retention').notNull().default(7),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  preRun: text('pre_run'),
  postRun: text('post_run'),
  lastRunAt: integer('last_run_at'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('backup_jobs_owner_idx').on(t.ownerId)]);

export const backupRuns = sqliteTable('backup_runs', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => backupJobs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  trigger: text('trigger').notNull().default('manual'),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  fileCount: integer('file_count').notNull().default(0),
  size: integer('size').notNull().default(0),
  manifest: text('manifest'),
  error: text('error'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('backup_runs_job_idx').on(t.jobId, t.createdAt)]);

export const backupAgents = sqliteTable('backup_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  rootFolderId: text('root_folder_id').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastSeenAt: integer('last_seen_at'),
  schedule: text('schedule'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(sql`(1)`),
  agentVersion: text('agent_version'),
  preRun: text('pre_run'),
  postRun: text('post_run'),
  excludes: text('excludes'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [uniqueIndex('agents_token_uq').on(t.tokenHash)]);

export const agentPaths = sqliteTable('agent_paths', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => backupAgents.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
}, (t) => [index('agent_paths_agent_idx').on(t.agentId)]);

export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  coverNodeId: text('cover_node_id'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('albums_owner_idx').on(t.ownerId)]);

export const albumItems = sqliteTable('album_items', {
  albumId: text('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.albumId, t.nodeId] })]);

export const activityLogs = sqliteTable('activity_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  detail: text('detail'),
  ip: text('ip'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('activity_user_idx').on(t.userId, t.createdAt)]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(now),
});

// Phase 8 — Dokumente. Der Knoten bleibt eine echte .md-Datei im Baum; diese
// Tabelle hält nur den Live-Zustand (Yjs) und die Review-Metadaten.
export const documents = sqliteTable('documents', {
  nodeId: text('node_id').primaryKey().references(() => nodes.id, { onDelete: 'cascade' }),
  ystate: text('ystate'),
  status: text('status', { enum: ['draft', 'review', 'changes', 'approved'] }).notNull().default('draft'),
  reviewBy: text('review_by'),
  revision: integer('revision').notNull().default(0),
  lastEditorId: text('last_editor_id'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const documentVersions = sqliteTable('document_versions', {
  id: text('id').primaryKey(),
  nodeId: text('node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
  label: text('label'),
  kind: text('kind', { enum: ['auto', 'named', 'restore'] }).notNull().default('auto'),
  content: text('content').notNull(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  size: integer('size').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('doc_versions_node_idx').on(t.nodeId, t.createdAt)]);

export const documentComments = sqliteTable('document_comments', {
  id: text('id').primaryKey(),
  nodeId: text('node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  anchor: text('anchor'),
  body: text('body').notNull(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  mentions: text('mentions'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, (t) => [index('doc_comments_node_idx').on(t.nodeId, t.createdAt)]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('mention'),
  nodeId: text('node_id').references(() => nodes.id, { onDelete: 'cascade' }),
  actorId: text('actor_id'),
  body: text('body').notNull(),
  readAt: integer('read_at'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)]);
