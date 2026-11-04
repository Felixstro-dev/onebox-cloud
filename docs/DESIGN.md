# Onebox Design Documentation

## Design Philosophy
Onebox is a self-hosted cloud storage application built with a focus on privacy, usability, and modern design aesthetics. The design follows the `felix-modern-ui` style guidelines with warm sand accent color `#c9a26b` (light `#8a6230`).

## Color System
- **Background**: Light surfaces use off-white, dark surfaces use warm neutral dark gray
- **Accent**: Warm sand `#c9a26b` (applied to primary buttons, focus states, interactive elements)
- **Text**: Primary black/white on light/dark surfaces, secondary gray for metadata
- **Borders**: Subtle divide using color-mix tints

## Typography
- **Font family**: Inter (sans) + Source Serif 4 (serif), both self-hosted as WOFF2
- **Scale**: Modular scale based on CSS variables `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`
- **Headings**: Use scales `--text-title`, `--text-h1` through `--text-h6`

## Spacing System
- Base unit: `var(--space-1)` = 4px, `--space-2` = 8px, `--space-3` = 12px, `--space-4` = 16px, etc.
- No hardcoded pixel values in component styles; all spacing via CSS variables
- Override vendor padding: `.section { padding-block: 0; }`

## Component Library
- **Buttons**: `Button` component with variants (primary, secondary, quiet, danger), sizes (sm, md, lg), loading state, icons from Lucide
- **Inputs**: `Field` component with label, hint, error state; supports `use:autofocus` directive
- **Dialogs**: Draggable bottom sheet on mobile, `Dialog` component with grab handle, pointer events, `role="dialog"`
- **Navigation**: Breadcrumbs, tab bars, segmented controls
- **Empty states**: Illustrated with Lucide icons, descriptive copy, optional action button
- **Progress**: Smoothly animated progress bars with transform-based progress (not width animation)

## Icon System
- **Source**: Lucide icon font sprite (1594 symbols)
- **Usage**: `<Icon name="name" size={n} />` component
- **CSS**: `.lucide-sprite` for base rendering

## Responsive Breakpoints
- **Desktop**: 1440px wide layout, two-column layouts where appropriate
- **Tablet**: 820px column width, adjusted spacing
- **Mobile**: 390px full-width stacks, bottom navigation, bottom sheets for dialogs

## Dark Mode
- **Default**: Dark theme (`data-theme="dark"`)
- **Light**: Available via system preference or manual toggle
- **No CSS media queries for color scheme** in component styles; uses CSS variables that flip

## Design Decisions (recorded in DECISIONS.md)
- `felix-modern-ui` as binding design source
- Brand accent overridden to warm sand `#c9a26b`
- Dev server port 8090 (8080 occupied)
- Tus-like upload protocol under `/api/v1`
- Backup targets: local directory and onebox remote push
- Schedules: hourly|daily|weekly, checked every 60s
- Frontend: Svelte legacy syntax, custom history router
- Share/agent/session tokens: hashed, returned once at creation
- Inline theme bootstrap replaced with `/theme-init.js` for CSP compliance
- Static asset serving: `wildcard: true` for rebuilt file serving
- App shell class renamed from `.view` to `.app-view` to avoid vendor collision
- Vendor `.section` padding overridden with `.section { padding-block: 0; }`