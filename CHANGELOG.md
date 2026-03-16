# Changelog

All notable changes to `n8n-nodes-cipp-advanced` will be documented in this file.

## [1.0.1] - 2026-03-16

### Fixed

- Removed legacy `.eslintrc.js` (conflicted with flat `eslint.config.mjs`)
- Aligned tsconfig with `@n8n/node-cli` template: `es2019` target, dropped `DOM` lib, removed `rootDir` and `index.ts` from include
- Added `typecheck`, `format`, `format:fix` scripts and `prepublishOnly` publish gate

## [1.0.0] - 2026-03-16

First public release of `n8n-nodes-cipp-advanced` — a comprehensive n8n community node for [CIPP.app](https://cipp.app) Microsoft 365 multi-tenant management.

> **Acknowledgement:** This project builds on the foundation of [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith). The codebase was substantially rewritten with a modularised architecture, full API alignment audit, and greatly expanded endpoint coverage.

### Added

- **License MSP Summary mode** — `Tenant > Get Licenses` now has an Output Mode dropdown (`Full` / `MSP Summary`). MSP Summary flattens each license into a single row with computed columns: `UnusedLicenses`, `UtilizationPct`, `RenewalUrgency` (Critical/Soon/Normal/Distant), `AssignedUserCount`, `AssignedGroupCount`, `AssignmentMethod` (Direct Only/Group Only/Mixed/Unassigned), and extracted `Term`/`DaysUntilRenew`/`RenewalDate`/`IsTrial` from TermInfo. Full mode returns the raw API response unchanged (backward-compatible default).

### Highlights

- **460 operations** across **28 resources** covering ~87% of the CIPP API surface
- Modularised action/description architecture for maintainability
- Full API alignment audit against the CIPP OpenAPI spec
- Azure AD OAuth2 client credentials authentication with in-memory token caching

### Resources & Operations

| Category | Resources | Total Ops |
|----------|-----------|-----------|
| **Identity Management** | User (50), Group (11), Contact (11), Identity (9) | 81 |
| **Email & Exchange** | Mailbox (46), Transport (20), Spamfilter (18), Safe Links (12), Exchange Resource (9), Quarantine (4) | 109 |
| **Security & Compliance** | Policy/Intune (32), Conditional Access (14), Alert (14), GDAP (13) | 73 |
| **Tenant Administration** | Tenant (33), Standard/BPA/Drift (23) | 56 |
| **Devices** | Autopilot (12), Device (10) | 22 |
| **Applications** | Application (24) | 24 |
| **Teams & SharePoint** | Teams Shift (28), Team (12), Voice (4) | 44 |
| **CIPP Platform** | CIPP Admin (19), CIPP Core (11), Tools (11), Scheduled Item (4), Backup (4), OneDrive (2) | 51 |

### Architecture

- `actions/router.ts` — maps resource string to handler module with compile-time `ResourceName` validation
- `actions/{resource}.ts` — 28 resource handlers, each exports `execute(context, operation, i)`
- `descriptions/{Resource}Description.ts` — 24 description files with shared helper builders
- `GenericFunctions.ts` — API helpers: OAuth2 token cache, `cippApiRequest`, `listWithSlice`, `postAction`, `buildOdataQuery`
- `types.ts` — 3 core interfaces: `ICippCredentials`, `IAuthToken`, `ITenant`

### User-Friendly Design

- Searchable tenant selector dropdown
- Multi-select field picker for Graph API properties
- Smart defaults to keep responses fast and small

### Hardening

- Token cache with `MAX_CACHE_SIZE` (50) and automatic expired-token eviction
- Credential validation helper with clear error messages
- Primitive response guard — wraps null/string/boolean API responses in objects
- Two-stage credential test: distinguishes "Authentication failed" from "API connection failed (token OK)"
- Manual-slice error guards in list operations

### Known Limitations

- **Teams Shift** (28 ops) and **Exec Graph Request** tool require a custom CIPP-API fork exposing `/api/ExecGraphRequest` — not part of the standard CIPP API
- ~65 CIPP API endpoints remain unimplemented (mostly admin/setup and testing endpoints)
- No automated test suite
