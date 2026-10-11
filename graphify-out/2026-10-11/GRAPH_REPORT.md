# Graph Report - smartvault  (2026-07-31)

## Corpus Check
- 162 files · ~90,226 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 856 nodes · 994 edges · 119 communities (49 shown, 70 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50ef86be`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 90
- Community 93
- smartvault-api/check_schema2.js
- fix1.js
- fix_admin.js
- fix_backend4.js
- fix_backup.js
- fix_backup2.js
- fix_fy.js
- smartvault-api/fix_routes.js
- smartvault-api/fix_server.js
- list_cols.js
- list_tables.js
- test_query.js
- test_query2.js
- test_query5.js
- test_schema.js
- AGENTS.md
- rules/graphify.md
- workflows/graphify.md
- check_starred.js
- ensureAuditUndoSchema
- getCurrentFY
- parseStoragePathMap
- test_patch.js

## God Nodes (most connected - your core abstractions)
1. `apiUrl()` - 38 edges
2. `compilerOptions` - 16 edges
3. `SmartVault — bare-metal deploy guide` - 12 edges
4. `createBackupSnapshot()` - 11 edges
5. `useConfirm()` - 11 edges
6. `Design System Inspired by Apple` - 10 edges
7. `listBackups()` - 9 edges
8. `scripts` - 8 edges
9. `restoreBackup()` - 8 edges
10. `verifyToken()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `test()` --calls--> `getUsermasterfolderAccess()`  [EXTRACTED]
  check-auth.js → smartvault-api/src/services/usermasterfolderAccessService.js
- `scheduleBackup()` --calls--> `createBackupSnapshot()`  [EXTRACTED]
  smartvault-api/server.js → smartvault-api/src/services/backupService.js
- `FolderTreeNode()` --calls--> `apiUrl()`  [EXTRACTED]
  src/app/(app)/admin/structure/page.tsx → src/lib/api.ts
- `UsersPageContent()` --calls--> `apiUrl()`  [EXTRACTED]
  src/app/(app)/admin/users/page.tsx → src/lib/api.ts
- `StarredView()` --calls--> `apiUrl()`  [EXTRACTED]
  src/components/StarredView.tsx → src/lib/api.ts

## Import Cycles
- None detected.

## Communities (119 total, 70 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (42): backupTracker, env, express, fs, {
  listBackups,
  createBackupSnapshot,
  getBackupPreview,
  restoreBackup,
  getLatestBackup,
}, { logAction }, parseStoragePathMap(), pool (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (29): adminRoutes, app, archiver, auditRoutes, authRoutes, bcrypt, {
  checkFilePermission,
  canAccessCategory,
  getEffectiveUserSettings,
  hydrateRequestUser,
}, cors (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (36): archiver, bcryptjs, cors, dotenv, express, jsonwebtoken, minio, multer (+28 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (21): axios, @cyntler/react-doc-viewer, highlight.js, lightningcss-linux-x64-gnu, lucide-react, next, @next/swc-linux-x64-gnu, dependencies (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (11): DuplicateReport(), AdminDashboardContent(), LoginPage(), FolderPreviewPageInner(), AuthHeartbeat(), CategoryDashboard(), DeptStats, SearchFilters() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (28): eslint, eslint-config-next, node-ssh, devDependencies, eslint, eslint-config-next, node-ssh, tailwindcss (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (11): inter, metadata, ConfirmProvider(), Sidebar(), ThemeProvider(), decodeJwtPayload(), TopBar(), SidebarContext (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (10): bcrypt, {
  ensureUsermasterfolderAccessSchema,
  replaceUsermasterfolderAccess,
  getUsermasterfolderAccess,
}, env, express, { getEffectiveUserSettings }, jwt, { logAction }, pool (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (13): AdminBackupsPage(), BackupConfig, BackupItem, fmtBytes(), PreviewResponse, Masterfolder, MasterfoldersAdminPage(), AuditLog (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (29): assertWritableDir(), checkDbSnapshot(), checkMinio(), env, fail(), fs, main(), Minio (+21 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (6): FileGrid(), FileGridProps, formatBytes(), getFileIcon(), RecentView(), StarredView()

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (7): pool, pool, pool, env, { Pool }, pool, pool

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (9): env, jwt, pool, verifyToken(), express, { logAction }, pool, router (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (12): env, express, fs, { logAction }, Minio, minioClient, path, pool (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (11): DEFAULT_DEPTS, emptyForm, masterfolder, masterfolderAccess, roleMeta, ROLES, User, UsersPageContent() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.05
Nodes (30): adminRoutes, app, archiver, auditRoutes, authRoutes, bcrypt, byDept, categories (+22 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (41): 1. Visual Theme & Atmosphere, 2. Color Palette & Roles, 3. Typography Rules, 4. Component Stylings, 5. Layout Principles, 6. Depth & Elevation, 7. Do's and Don'ts, 8. Responsive Behavior (+33 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (23): 10. Script index (in repo), 11. Credentials reference (change in production), 1.1 What you need, 1.2 Layout (NVMe — default in scripts), 1.3 Ports, 1.4 Dev machine: sync backend into repo, 1. Before you start, 2. Deploy overview (order matters) (+15 more)

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (6): escapeCsv(), getCsvCell(), MainDashboard(), parseCsvTable(), StructureCategory, UploadQueueItem

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (6): express, multer, pool, router, upload, { verifyToken }

### Community 21 - "Community 21"
Cohesion: 0.19
Nodes (11): {
  ensureUsermasterfolderAccessSchema,
  replaceUsermasterfolderAccess,
}, express, { hydrateRequestUser }, { logAction }, pool, router, { verifyToken }, ensureUsermasterfolderAccessSchema() (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.29
Nodes (6): AdminStructureContent(), buildTree(), CategoryItem, FolderNode, FolderTreeNode(), FolderTreeNodeProps

### Community 23 - "Community 23"
Cohesion: 0.43
Nodes (5): { enabled, client, index, pingElastic }, pool, run(), { Client }, pingElastic()

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): content, fs, results, stack, tags

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (6): { getUsermasterfolderAccess }, pool, test(), getUsermasterfolderAccess(), { getUsermasterfolderAccess }, pool

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (4): { Client }, dotenv, fs, path

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (5): canAccessCategory(), checkFilePermission(), getEffectiveUserSettings(), hydrateRequestUser(), pool

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (7): 1. Database Installation Target (July 15, 2026), 2. Administrator Bootstrap Password (July 15, 2026), 3. MinIO Storage Credentials Mismatch (July 15, 2026), 4. MinIO Bucket Initialization (July 15, 2026), 5. CSV Export Path Separator Bug (July 15, 2026), 6. Missing API Route for Folders (July 15, 2026), SmartVault Deployment Fixes Log

### Community 29 - "Community 29"
Cohesion: 0.53
Nodes (4): canPreview(), PREVIEWABLE_MIME_TYPES, PREVIEWABLE_OFFICE_EXTS, PreviewPage()

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (7): 1) First-time setup, 2) Run one-command deploy, 3) Check health, 4) NGINX reverse proxy, 5) Update deploy, Bare-metal deploy (single Ubuntu server), Notes

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (3): { Client }, fs, minioClient

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (3): inter, metadata, viewport

### Community 34 - "Community 34"
Cohesion: 0.80
Nodes (4): displayFolderLabel(), displayFolderSegment(), folderAliasKey(), normalizeFolderPath()

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (4): fs, path, routes, services

### Community 37 - "Community 37"
Cohesion: 0.40
Nodes (3): fs, routes, services

### Community 38 - "Community 38"
Cohesion: 0.40
Nodes (3): fs, routes, services

### Community 39 - "Community 39"
Cohesion: 0.40
Nodes (3): files, fs, path

### Community 40 - "Community 40"
Cohesion: 0.40
Nodes (3): files, fs, path

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (3): files, fs, path

### Community 42 - "Community 42"
Cohesion: 0.40
Nodes (3): fileEntries, folderPaths, root

### Community 43 - "Community 43"
Cohesion: 0.50
Nodes (3): Automated Migrations, Database Migrations Guide, Manual Migration (If Needed)

### Community 44 - "Community 44"
Cohesion: 0.50
Nodes (3): content, fs, sideContent

### Community 45 - "Community 45"
Cohesion: 0.50
Nodes (3): content, fs, mainContent

## Knowledge Gaps
- **446 isolated node(s):** `pool`, `{ getUsermasterfolderAccess }`, `{ Pool }`, `eslintConfig`, `fs` (+441 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **70 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `apiUrl()` connect `Community 5` to `Community 7`, `Community 9`, `Community 11`, `Community 15`, `Community 19`, `Community 22`, `Community 29`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `createBackupSnapshot()` connect `Community 0` to `Community 16`, `Community 1`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 4` to `Community 6`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `pool`, `{ getUsermasterfolderAccess }`, `{ Pool }` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07890070921985816 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._