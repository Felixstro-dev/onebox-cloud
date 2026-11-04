# Onebox Design Review

## Review Date: 2026-11-02

### Review Scope
This document captures the design review of the Onebox self-hosted cloud storage application, covering backend API design, frontend UI/UX, security, and accessibility.

### Review Status: ✅ PASSED

## Changes Since Last Review

### Public Share Polish (P0)
- **Before**: Header showed "0 Elemente · geteilt mit dir" for single file shares; duplicate filename in heading + card; download limit field started at 0 with odd `valuemax=0`
- **After**: 
  - File shares now show size instead of "0 Elemente"
  - Heading uses node name with proper singular/plural "1 Element" / "N Elemente"
  - Inline image preview for shared images
  - Download limit field starts at minimum 1, constraint validated
  - Duplicate heading resolved

### Accessibility Fixes
- **Before**: `autofocus` HTML attribute used across 12+ input fields; `<div>` in Dialog with pointer handlers but no `role="presentation"`; `<video>` without `<track kind="captions">`; drag-and-drop area without `role="region"`; file row without `tabindex`; photo viewer img without keyboard handler
- **After**: 
  - All `autofocus` replaced with Svelte `use:autofocus` directive
  - Dialog grab handler has `role="presentation"`
  - Video tracks added for caption support
  - Files area has `role="region"` and `aria-label`
  - File rows have `tabindex="-1"` for keyboard navigation
  - Photo viewer img wrapped in clickable button with keyboard handler
  - Button `svelte:element` now has explicit `role` based on href

### Design System
- **Before**: `.view` class collided with vendor `.view`; `.section` added 96px padding; ProgressBar used width animation; hardcoded colors/spacing
- **After**: 
  - App class renamed to `.app-view`
  - Vendor `.section` padding overridden with `.section { padding-block: 0; }`
  - ProgressBar uses transform-based animation
  - All spacing via CSS variables `--space-*`
  - No hardcoded colors or spacing values in component styles

### Performance
- **Before**: ~88 kB CSS / ~235 kB JS production build
- **After**: ~89 kB CSS / ~236 kB JS (minor increase due to new directives, within tolerance)

### Security
- **Before**: CSRF token only in header; no rate limiting on some share endpoints; raw tokens returned
- **After**: 
  - Rate limiting added on share unlock endpoints (10 attempts/300s)
  - Hashed share/agent/session tokens
  - CSRF protection on all state-changing endpoints
  - Path traversal protection in path resolution
  - Security headers via Fastify plugin

## Pending Items
1. Dockerfile and docker-compose.yml creation
2. Agent CLI: agent/bin/onebox-backup.js
3. Integration tests suite (tests/)
4. README generation
5. Final Unslop pass over UI copy

## Reviewers
- Design: felix-modern-ui compliance verified
- Accessibility: Svelte a11y warnings resolved (build passes clean)
- Security: CSP, rate limits, token hashing verified
- Performance: Build times, bundle sizes within targets