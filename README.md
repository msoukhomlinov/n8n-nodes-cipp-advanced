# n8n-nodes-cipp-advanced

[![npm version](https://badge.fury.io/js/n8n-nodes-cipp-advanced.svg)](https://www.npmjs.com/package/n8n-nodes-cipp-advanced)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Advanced n8n community node for [CIPP.app](https://cipp.app) — comprehensive Microsoft 365 multi-tenant management for MSPs.

![CIPP Node](https://img.shields.io/badge/n8n-Community%20Node-ff6d5a)
![Beta](https://img.shields.io/badge/Status-Beta-orange)

> **Based on** [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith). This project was originally forked from the upstream node, then substantially rewritten — modularised architecture, API alignment audit, and expanded from ~133 to **460 operations** across **28 resources** (~87% of the CIPP API surface).

## Features

**460 operations** across 28 resources covering:

- **Identity Management** — Users (50 ops), Groups (11), Contacts (11), Identity (9)
- **Email & Exchange** — Mailbox (46), Transport rules (20), Spam filters (18), Safe Links (12), Exchange Resources (9), Quarantine (4)
- **Security & Compliance** — Policies/Intune (32), Conditional Access (14), Alerts (14), GDAP (13)
- **Tenant Administration** — Tenants (33), Standards/BPA/Drift (23)
- **Devices** — Devices (10), Autopilot (12)
- **Apps** — Applications (24)
- **Teams & SharePoint** — Teams (12), Teams Shifts (28), Voice (4)
- **CIPP Platform** — Tools (11), CIPP Admin (19), CIPP Core (11), Scheduled Items (4), Backups (4), OneDrive (2)

### User-Friendly Design

- **Tenant Selector** — Searchable dropdown to select tenants by name
- **Field Picker** — Multi-select for user properties (no need to memorise Graph API field names)
- **Smart Defaults** — Sensible default selections to keep responses fast and small

## Installation

### n8n (Self-hosted)

```bash
npm install n8n-nodes-cipp-advanced
```

Or add to your n8n Docker container:

```bash
# In your Dockerfile
RUN npm install -g n8n-nodes-cipp-advanced
```

## Credentials Setup

1. **Create an Azure AD App Registration** for CIPP API access
2. Configure the following in n8n:
   - **CIPP Instance URL**: Your CIPP deployment URL (e.g., `https://cipp.yourdomain.com`)
   - **Azure AD Tenant ID**: The tenant where your CIPP app registration lives
   - **Application (Client) ID**: From your Azure AD app registration
   - **Client Secret**: Generated from your app registration

For detailed authentication setup, see the [CIPP API Documentation](https://docs.cipp.app/api-documentation/setup-and-authentication).

## Resources & Operations

| Resource | Ops | Key Operations |
|----------|-----|----------------|
| **User** | 50 | CRUD, edit (23 fields), guest/bulk add, BEC check, JIT admin, 9 detail lists, photo, licenses |
| **Mailbox** | 46 | 9 list ops, permissions, settings, holds, archive, shared/mobile, message trace, EXO request, restore |
| **Tenant** | 33 | Details, edit, add/onboard/offboard, domains, service health, secure score, tenant groups |
| **Policy** | 32 | Assignment filters, Intune templates/scripts/settings, Defender deployment, compliance lists |
| **Teams Shift** | 28 | Shifts, open shifts, scheduling groups, time-off, swap/offer requests (requires custom CIPP-API fork) |
| **Application** | 24 | WinGet/Store/Choco/MSP/Office/Win32 apps, VPP sync, app approval, multi-tenant apps |
| **Standard** | 23 | Standards, BPA, domain analyser, drift, run/convert, templates |
| **Transport** | 20 | Transport rules/templates, Exchange connectors/templates, connection filters |
| **CIPP Admin** | 19 | Settings, setup, extensions config/sync/test |
| **Spamfilter** | 18 | Spam filters/templates, quarantine policies, allow/block lists |
| **Conditional Access** | 14 | CA policies/templates, named locations, exclusions, policy check |
| **Alert** | 14 | Security alerts/incidents, audit log, MDO alerts, webhooks |
| **GDAP** | 13 | Access assignments, invites, roles, auto-extend, trace |
| **Autopilot** | 12 | Devices, configs, enrollment, rename, group tags |
| **Safe Links** | 12 | Policies/templates, deployment |
| **Team** | 12 | Teams, SharePoint sites/quota/settings/admin |
| **Group** | 11 | CRUD, templates, Teams conversion, sender auth |
| **CIPP Core** | 11 | Diagnostics, functions, GitHub actions, version |
| **Tools** | 11 | Breach search, Graph requests, GeoIP, universal search, compliance |
| **Contact** | 11 | Contacts/templates, deploy, permissions |
| **Device** | 10 | List, manage, actions, LAPS/recovery, detected apps |
| **Exchange Resource** | 9 | Rooms, room lists, equipment |
| **Identity** | 9 | Audit logs, deleted items, roles, Azure AD Connect, directory objects |
| **Voice** | 4 | Phone numbers, locations, assign/unassign |
| **Scheduled Item** | 4 | Add, list, remove, details |
| **Backup** | 4 | List, run, restore, auto-backup |
| **Quarantine** | 4 | List, release, deny, get many |
| **OneDrive** | 2 | Provision, add shortcut |

## Example Usage

### List All Tenants

```
Resource: Tenant
Operation: Get Many
Return All: true
```

### List Users with Sign-In Activity

```
Resource: User
Operation: Get Many
Tenant: Select from dropdown
Fields to Return: Display Name, User Principal Name, Mail, Sign-In Activity
Return All: true
```

### Custom Graph Request

```
Resource: Tools
Operation: Graph Request (List)
Tenant: Select from dropdown
Endpoint: users
$select: id,displayName,userPrincipalName
$filter: startsWith(displayName,'John')
```

### Teams Shifts

```
Resource: Teams Shift
Operation: List Shifts
Tenant: Select from dropdown
Team ID: <team-guid>
```

> **CIPP-API Requirement**: The Teams Shift resource and the Exec Graph Request tool both use `POST /api/ExecGraphRequest`, which is **not part of the standard CIPP API**. You must be running a custom fork of [CIPP-API](https://github.com/KelvinTegelaar/CIPP-API) that exposes the `ExecGraphRequest` endpoint.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint

# Link for local testing
npm link
```

## Acknowledgements

This project is based on [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith), which provided the initial CIPP n8n integration. The original node covered ~133 operations across 14 resources. This fork was substantially rewritten with a modularised architecture, full API alignment audit against the CIPP OpenAPI spec, and expanded to 460 operations across 28 resources.

## Links

- [CIPP.app](https://cipp.app)
- [CIPP Documentation](https://docs.cipp.app)
- [CIPP API Endpoints](https://docs.cipp.app/api-documentation/endpoints/)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
- [Original n8n-nodes-cipp](https://github.com/ajoshuasmith/n8n-nodes-cipp)

## License

MIT - see [LICENSE](LICENSE) for details.
