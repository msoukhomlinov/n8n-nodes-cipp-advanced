# Changelog

All notable changes to `n8n-nodes-cipp-advanced` will be documented in this file.

> **Note:** This project was forked from [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith). Versions 0.0.6 through 0.0.14 below reflect work done in the original repository. From 0.1.0 onwards, the node was substantially rewritten and rebranded as `n8n-nodes-cipp-advanced`.

## [0.1.0] - 2026-03-14

Major release: rebranded as `n8n-nodes-cipp-advanced`. Modularized architecture, full API alignment audit, and endpoint coverage expansion. Grew from 133 to 460 operations across 28 resources (~87% of CIPP API).

### Architecture — Modularization

- **Refactored monolithic `Cipp.node.ts` into modular action/description pattern**
  - `actions/router.ts` — maps resource string → handler module with compile-time `ResourceName` validation
  - `actions/{resource}.ts` — 28 resource handlers, each exports `execute(context, operation, i)`
  - `descriptions/{Resource}Description.ts` — 24 description files (some bundle multiple resources)
  - `descriptions/DescriptionHelpers.ts` — shared `tenantField()`, `returnAllField()`, `limitField()`, `idField()` builders
  - `descriptions/index.ts` — aggregates all operation + field arrays
- **Added shared API helpers** in `GenericFunctions.ts`: `listWithSlice()`, `postAction()`, `buildOdataQuery()`, `validateCredentials()`, `parseJsonPayload()`, `parseJsonObjectPayload()`
- **Reduced `types.ts`** from 16 interfaces to 3 (`ICippCredentials`, `IAuthToken`, `ITenant`)
- **Icon migrated** from PNG to SVG; node renamed to `CippApp.node.ts` per n8n naming convention
- **Node group** changed from `transform` to `output` (correct for API integration nodes)

### Added — 10 New Resources (187 operations)

| Resource | Ops | Description |
|----------|-----|-------------|
| **conditionalAccess** | 14 | CA policies, templates, named locations, exclusions, policy check |
| **transport** | 20 | Transport rules/templates, Exchange connectors/templates, connection filters |
| **spamfilter** | 18 | Spam filters/templates, quarantine policies, allow/block lists, anti-phishing/malware/safe-attachments edits |
| **safeLinks** | 12 | Safe Links policies/templates, deployment from templates |
| **exchangeResource** | 9 | Rooms, room lists, equipment (CRUD + calendar/booking settings) |
| **contact** | 11 | Contacts/templates, deploy templates, contact permissions |
| **standard** | 23 | Standards, BPA, domain analyser, drift, standards run/convert |
| **cippAdmin** | 19 | CIPP settings (backup/log/password retention, branding, DNS, extensions, JIT admin, notifications) |
| **cippCore** | 11 | Diagnostics, function management, GitHub actions, version/status |
| **voice** | 4 | Phone numbers, locations, assign/unassign (extracted from Team) |

### Added — Expanded Existing Resources (+140 operations)

| Resource | Before → After | Key additions |
|----------|---------------|---------------|
| **user** | 19 → 50 | Edit user (23 fields), guest/bulk add, BEC check/remediate, JIT templates CRUD, 9 user detail lists, photo, license/password management |
| **mailbox** | 4 → 46 | 9 list operations, permissions (5), settings (8), hold/archive (7), shared/mobile (2), message trace, EXO request, retention management (3), mailbox restore |
| **tenant** | 7 → 33 | Details, edit, add/onboard/offboard, domains (3), service health, app consent, OAuth apps, secure score, auth method, tenant groups, allow/block lists |
| **policy** | 5 → 32 | Assignment filters CRUD+templates, Intune templates/scripts/reusable settings CRUD, compliance/app-protection lists, Defender deployment, passcode action, Intune intents |
| **gdap** | 2 → 13 | Access assignments, invites, approved invites, role management, auto-extend, relationship/mapping delete, GA role removal, trace access |
| **alert** | 6 → 14 | Audit log search/list/test, webhook alerts, queued alert removal, MDO alerts, alert rules |
| **application** | 10 → 24 | Win32 script app, VPP sync, app upload, apps repository, multi-tenant apps, app approval templates, app IDs, excluded licenses, potential apps |
| **autopilot** | 6 → 12 | Add device, config/enrollment management, rename device, set group tag |
| **group** | 6 → 11 | Add Team, group templates CRUD, sender authentication |
| **team** | 8 → 12 | SharePoint delete/admin URL/quota/settings |
| **identity** | 4 → 9 | Azure AD Connect status, basic auth, org info, partner relationships, directory objects |
| **device** | 7 → 10 | Detected apps/devices, device details, cloud managed, package tag |
| **tools** | 6 → 11 | GeoIP lookup, universal search v1/v2, all-tenant device compliance, send test email |

### Breaking Changes
- **Group `add`**: `groupType` enum values changed to match API (`"Microsoft 365"` → `"m365"`, `"Security"` → `"security"`, `"Distribution"` → `"distribution"`, `"Mail-Enabled Security"` → `"generic"`). Workflows referencing old values must be updated.
- **Group `edit`**: HTTP method changed from POST to PATCH. Body params renamed to PascalCase singular (`addMembers` → `AddMember`, etc.).
- **Mailbox `setForwarding`**: Replaced single `ForwardTo` field with `forwardOption` (internal/external) + `ForwardInternal`/`ForwardExternal`. Existing workflows using `ForwardTo` must be updated.
- **Tenant `getAll`**: Changed from GET to POST per API spec.
- **Application `addOfficeApp`**: Replaced `use64bit` boolean with `arch` string option (`x64`/`x86`).

### Fixed — Runtime Crashes (11 operations)
- **Tools**: Fixed 6 parameter name mismatches that caused all 3 Graph Request operations to crash
- **Teams Shift**: Fixed `approveTimeOffRequest`/`declineTimeOffRequest` (`requestId` → `timeOffRequestId`), `createShift`/`createOpenShift` (read options from collections)
- **Team `manageSiteMember`**: Fixed crash reading nonexistent `action` parameter (→ `memberAction`)

### Fixed — Wrong Endpoint URLs
- **Tenant `listCspSkus`**: `/api/ListCSPSKUs` → `/api/ListCSPsku`
- **Policy `assign`**: `/api/AssignPolicy` → `/api/ExecAssignPolicy`
- **OneDrive `provision`**: `/api/ExecOneDriveProvision` → `/api/ExecOnedriveProvision`
- **Mailbox `setOutOfOffice`**: `/api/ExecSetOOO` → `/api/ExecSetOoO`
- **Autopilot `getConfigurations`**: `ListAutopilotConfig` → `ListAutopilotconfig` (lowercase `c`)

### Fixed — Wrong HTTP Methods
- **Tenant `getAll`**: GET → POST
- **Group `edit`**: POST → PATCH
- **Backup `run`**: POST → GET
- **Scheduled Item `getAll`**: GET → POST
- **Tools `breachSearch`**: GET → POST
- **Teams Shift `deleteSchedulingGroup`**: PUT → DELETE

### Fixed — API Parameter Alignment (24+ operations)
- **User**: `add` (`givenName`/`surname`/`PrimDomain`/`DisplayName`), `sendMfaPush` (`UserEmail`/`TenantFilter`), `dismissRiskyUser` (`userId`), `disable`/`enable` (Enable as string not boolean)
- **Device**: `executeAction` Rename (`input`), `getLapsPassword` (`guid`/`TenantFilter`)
- **Autopilot**: `assign` (`device`/`user`)
- **Group**: `delete`/`hideFromGal`/`deliveryManagement` (`GroupType` PascalCase), removed nonexistent `groupEmail`, boolean → string for `HideFromGAL`/`OnlyAllowInternal`
- **Mailbox**: `setForwarding` (`userID`/`ForwardInternal`/`ForwardExternal`/`KeepCopy` as string), `setOutOfOffice` (`userId`), `enableArchive` (`id` lowercase)
- **Quarantine**: `release`/`deny` (`Identity`/`AllowSender` as string)
- **Alert**: `setSecurityAlertStatus`/`setSecurityIncidentStatus` (`GUID`/`Assigned`)
- **Application**: `addMspApp` (`RMMName`/`params`/`DisplayName`), `addStoreApp` (`PackageName`), `addChocoApp`/`addOfficeApp` (PascalCase), `assign` (`GroupNames`)
- **Tenant**: `cspLicenseAction` (`SKU`), `clearCache` (strings not booleans), `getTenantList` GET → POST
- **Policy**: `assign` (`GroupNames`)
- **Scheduled Item**: `remove` (`id`), `getAll` (`ShowHidden`/`Name` PascalCase)
- **OneDrive**: `addShortcut` (`userid`/`siteUrl`, removed `ShortcutName`)
- **Team**: `manageSiteMember` (`Add`/`user`), `addSitesBulk` (`bulkSites`), `addSite` (`siteOwner`/`templateName`), `manageSitePermissions` (`user`)

### Hardening
- **Token cache** — added `MAX_CACHE_SIZE` (50) + `evictExpiredTokens()` to prevent memory leaks
- **Credential validation** — `validateCredentials()` helper extracts + validates 4 required fields
- **Primitive response guard** — `cippApiRequest` wraps null/string/boolean responses in `{ result }` objects
- **Compile-time validation** — `ResourceName` union type + `satisfies Record<ResourceName, ResourceHandler>` in router
- **Credential test** — split into two try-catches: "Authentication failed" vs "API connection failed (token OK)"
- **`expires_in` handling** — explicit `Number()` conversion instead of implicit coercion
- **Manual-slice error guard** — checks for error/Error keys before `Array.isArray` wrapping in 5 action files
- **Standardized helper calls** — all `listWithSlice()`/`postAction()` use direct calls (no `.call()`); `cippApiRequest.call` retained (uses `this`)

## [0.0.14] - 2026-02-20

### Added
- **Teams Shift resource** with 28 operations covering shifts, open shifts, scheduling groups, time-off reasons/requests, and swap/offer shift requests (requires custom CIPP-API fork)
- **ExecGraphRequest tool** for unrestricted Microsoft Graph API calls with fallback to `/api/GraphRequest`
- **Sync DEP** (Apple Business Manager) operation for Autopilot (requires CIPP v10.1.0+)
- Date/time filters on all list operations

## [0.0.7] - 2026-02-05

### Added
- **Identity resource:** List Audit Logs, List Deleted Items, List Roles, Restore Deleted
- **Policy resource:** Get Many, Add, Assign, Remove, List Defender TVM
- **OneDrive resource:** Provision, Add Shortcut
- **GDAP resource:** List Roles, Send Invite

### Changed
- **User resource:** added List Inactive Accounts, List Sign-Ins, List MFA Users, Dismiss Risky User, List JIT Admin, Execute JIT Admin
- **Tenant resource:** added List Defender State, List CSP SKUs
- **Team resource:** added Add Sites Bulk

## [0.0.6] - 2026-01-15

### Added
- Initial release with full CIPP API integration for Microsoft 365 multi-tenant management
- **Tenant:** Get Many, Get Licenses, CSP Licenses, Clear Cache
- **User:** Get Many, Add, Disable, Enable, Reset Password/MFA, Offboard, and more
- **Group:** Add, Edit Members, Delete, Hide from GAL, Delivery Management
- **Device:** Get Many, Manage, Execute Action, Recovery Key, LAPS Password
- **Autopilot:** Get Many, Assign, Remove, Sync, Configurations
- **Mailbox:** Convert, Enable Archive, Out of Office, Email Forwarding
- **Alert:** Security Alerts, Incidents, Status Management
- **Application:** WinGet, Store, Chocolatey, MSP, Office Apps
- **Team:** Teams, Sites, Activity, Member/Permission Management
- **Voice:** Phone Numbers, Locations, Assignment
- **Scheduled Item & Backup Management**
- **Tools:** Breach Search, Graph API Requests
- Searchable tenant selector dropdown
- User-friendly field picker for Graph API properties
- Azure AD OAuth2 client credentials authentication with in-memory token caching
