# Onebox Design Decisions

## Architecture Decisions

### Backend: Node.js + Fastify + SQLite
- **Runtime**: Node.js LTS
- **Web Framework**: Fastify for its performance and extensibility
- **Database**: SQLite via `better-sqlite3` with WAL mode, `foreign_keys=ON`, `busy_timeout`
- **ORM**: Drizzle ORM + Kit for type-safe migrations
- **Rationale**: Single-container deployment, no external DB required, excellent for self-hosted scenarios

### Frontend: Svelte + Vite
- **Framework**: Svelte (legacy syntax, not TypeScript)
- **Build**: Vite for fast HMR and production builds
- **Styling**: Tailwind-derived CSS variables + custom components
- **Rationale**: Small bundle size (~235 kB JS gzipped), reactive by default, familiar HTML-like syntax

### Upload Protocol: tus-like
- **POST /api/v1/uploads**: Initialize upload
- **PATCH with Upload-Offset**: Chunked upload progress
- **HEAD**: Check status
- **POST /complete**: Finalize upload
- **Rationale**: Standardized resumable upload pattern, works with client-side interruption recovery

### Authentication: Argon2id Passwords
- Password hashing via Argon2id
- Session cookies with `httpOnly`, `sameSite: 'lax'`
- CSRF protection via `x-onebox-csrf` header
- Rate limiting on auth endpoints

### Public Share URLs
- Structure: `/s/<token>` for file shares, `/u/<token>` for upload requests
- Tokens: 8-character random prefix, hashed on server
- Share metadata includes expiry, download limits, allowed types
- Password protection optional, unlock returns one-time access token

## UI/UX Decisions

### Design Source: felix-modern-ui
- Binding design system with warm sand accent `#c9a26b`
- Overridden from default brand colors
- Inter + Source Serif 4 self-hosted fonts (no Google Fonts)
- Dark mode default with responsive breakpoints 1440/820/390

### Accessibility
- All form inputs use `use:autofocus` directive instead of HTML `autofocus`
- Dialogs use `role="dialog"` with proper labeling
- Images have meaningful alt text, decorative images empty alt
- Keyboard navigation, focus management
- ARIA roles on interactive elements
- Reduced motion support via CSS variables
- Color contrast meets minimum standards

### Layout Patterns
- **Bottom sheets** on mobile for dialogs (not modal overlays)
- **Bottom navigation** on main views
- **Sidebar** on desktop, hidden on mobile
- **Grid layouts** for files (adaptive: 1440 -> 3 columns, 820 -> 2 columns, 390 -> 1 column)
- **Card-based** file presentation

### State Management
- Svelte stores for global state (`$auth`, `$uploadsOpen`, etc.)
- Upload queue manager with pause/resume/retry
- Smoothed ETA calculations
- Performance profiles affecting job concurrency

### Empty/Loading/Error States
- All views have dedicated EmptyState component
- Skeleton loaders during data fetching
- Inline error messages with icon + description
- Action buttons to retry failed operations

## Technical Decisions

### CSP Compliance
- Inline script replaced with `/theme-init.js` external file
- Hashed-asset static serving with `wildcard: true`
- No `eval()` or dangerous inline scripts

### Security Headers
- Helmet-like headers via Fastify security plugin
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy with appropriate directives

### File Serving
- Stream files directly, no base64 encoding
- Thumbnail generation via worker threads with Sharp
- Caching via Cache-Control headers
- Range header support for partial downloads

### Database Migrations
- Snapshot-based migration system
- Fail-start on migration error (rollback on failure)
- Versioned SQL migrations under `server/db/migrations/`
- Automatic detection of pending migrations

### Backup System
- **Local**: Directory copy with timestamp
- **Remote**: onebox push via ingest token
- **Agents**: Bearer token authenticated CLI (`agent/bin/onebox-backup.js`)
- **Restore**: Recreates tree under `Restored <timestamp>` directory
- **Schedules**: hourly|daily|weekly, checked every 60 seconds

### API Versioning
- All API routes under `/api/v1/`
- Public shares under `/api/v1/public/shares/`
- Upload requests under `/api/v1/public/uploads/`
- Versioned REST API for future compatibility

## UI Copy (German)
- All user-facing text in German
- Consistent terminology across views
- "Elemente" for count (singular/plural distinction)
- Action labels: "Hochladen", "Herunterladen", "Teilen", "Widerrufen"