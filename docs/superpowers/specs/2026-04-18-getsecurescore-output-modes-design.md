# getSecureScore Output Modes — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Problem

`getSecureScore` returns 3–5MB of raw JSON (55,000+ lines for 90-day history). The bulk is `description` fields (~469 bytes avg) across 70 controlScores × N daily entries. This makes the operation unusable for AI agents (context window cost), n8n workflow branching (decision logic doesn't need descriptions), and health dashboards (only need headline scores).

## Solution

Add an `outputMode` dropdown to `secureScoreOptions` (standard node) and a typed `outputMode` param to the AI registry. All transformation is post-processing in `tenant.ts` — no new API calls. Default changes from raw to `summary`.

## Output Modes

Sizes relative to `categoryBreakdown` (smallest, ~1KB baseline):

| Mode | Relative Size | Description |
|------|--------------|-------------|
| `categoryBreakdown` | 1× | Scores grouped by Identity/Apps/Data/Device category |
| `summary` | 2× | Top-level scores + comparative averages, no per-control data |
| `implementationStatus` | 15× | Per-control name/category/score/implementationStatus |
| `averaged` | 15× | Single record averaged across historyCount days |
| `slim` | 150× per history entry | All controls, descriptions stripped |
| `full` | 4000× | Complete raw API response |

`includeDescriptions` boolean (default `false`) re-adds `description` to controlScores for modes that strip them (`slim`, `implementationStatus`, `averaged`). Adds ~500 bytes/control (~35KB for latest entry). Ignored for `summary`, `categoryBreakdown`, `full`.

## Output Shapes

### `summary`
```json
{
  "createdDateTime": "2026-04-17T00:00:00Z",
  "currentScore": 102.83,
  "maxScore": 272,
  "scorePercent": "37.8",
  "activeUserCount": 6,
  "licensedUserCount": 0,
  "enabledServices": ["HasSPOP1", "HasAADFree"],
  "averageComparativeScores": [...],
  "Tenant": "...",
  "CippStatus": "..."
}
```

### `implementationStatus`
Array of per-control objects:
```json
[
  {
    "controlName": "AdminMFAV2",
    "controlCategory": "Identity",
    "score": 10,
    "scoreInPercentage": 100,
    "implementationStatus": "You have 0 out of 0 users...",
    "on": "true"
  }
]
```
`description` added when `includeDescriptions: true`.

### `categoryBreakdown`
```json
{
  "createdDateTime": "2026-04-17T00:00:00Z",
  "currentScore": 102.83,
  "maxScore": 272,
  "scorePercent": "37.8",
  "categories": {
    "Identity": { "score": 50, "maxScore": 120, "controlCount": 25, "scorePercent": "41.7" },
    "Apps": { "score": 30, "maxScore": 80, "controlCount": 20, "scorePercent": "37.5" },
    "Data": { "score": 10, "maxScore": 40, "controlCount": 12, "scorePercent": "25.0" },
    "Device": { "score": 12, "maxScore": 32, "controlCount": 13, "scorePercent": "37.5" }
  }
}
```

### `slim`
All N daily entries with `description` removed from each controlScore. Shape identical to `full` otherwise.

### `averaged`
Single record:
```json
{
  "periodStart": "2026-03-18T00:00:00Z",
  "periodEnd": "2026-04-17T00:00:00Z",
  "daysAveraged": 30,
  "currentScore": 101.2,
  "maxScore": 272,
  "scorePercent": "37.2",
  "controlScores": [
    {
      "controlName": "AdminMFAV2",
      "controlCategory": "Identity",
      "score": 10,
      "scoreInPercentage": 100
    }
  ]
}
```
`description` added per control when `includeDescriptions: true`.

### `full`
Raw API response, unchanged. `includeControlProfiles` option removed (use `getSecureScoreControlProfiles` operation).

## Architecture

### New file: `nodes/CippAdvanced/actions/helpers/secureScoreTransform.ts`

Pure functions, no n8n dependencies, ~120–150 lines:

```
applyOutputMode(results, mode, includeDescriptions) → IDataObject | IDataObject[]
  ├── toSummary(result) → IDataObject
  ├── toImplementationStatus(result, includeDescriptions) → IDataObject[]
  ├── toCategoryBreakdown(result) → IDataObject
  ├── toSlim(results, includeDescriptions) → IDataObject[]
  └── toAveraged(results, includeDescriptions) → IDataObject
```

### `tenant.ts` change

Replaces current `if (!includeControlProfiles)` block with:

```typescript
import { applyOutputMode } from './helpers/secureScoreTransform';

const outputMode = (opts.outputMode as string) ?? 'summary';
const includeDescriptions = (opts.includeDescriptions as boolean) ?? false;
const raw = (scoreData as IDataObject[]) ?? [scoreData as IDataObject];
responseData = applyOutputMode(raw, outputMode, includeDescriptions);
```

`includeControlProfiles` option and its API call removed. ~10 lines net change in `tenant.ts`.

### `TenantDescription.ts` changes

`secureScoreOptions` collection:
- `historyCount` — unchanged
- `outputMode` — new options dropdown, default `summary`
- `includeDescriptions` — new boolean, default `false`
- `includeControlProfiles` — **removed**

### `ai-tools/registry/tenant.ts` changes

`getSecureScore` params:
```typescript
outputMode: P.qs(
  'Controls response size. Default: summary. ' +
  'Sizes relative to smallest: ' +
  'categoryBreakdown (1x — scores grouped by Identity/Apps/Data/Device), ' +
  'summary (2x — top-level scores + comparative averages), ' +
  'implementationStatus (15x — per-control name/category/score/status), ' +
  'averaged (15x — single record averaged across historyCount days), ' +
  'slim (150x per history entry — all controls minus descriptions), ' +
  'full (4000x — complete raw response, use only when all detail needed).'
),
includeDescriptions: P.qs(
  'Add verbose control descriptions to modes that strip them (slim/implementationStatus/averaged). ' +
  'Adds ~500 bytes per control (~35KB for latest entry). Ignored for summary/categoryBreakdown/full. Default: false'
),
```

`$top` param description updated: *"Number of historical days to fetch. Only meaningful for slim, averaged, and full modes."*

## Breaking Changes

- Default output changes from raw full data to `summary` — existing workflows relying on full data must set `outputMode: full`
- `includeControlProfiles` option removed — use `getSecureScoreControlProfiles` operation instead

## File Size Impact

| File | Before | After | Delta |
|------|--------|-------|-------|
| `tenant.ts` | ~350 lines | ~355 lines | +5 |
| `TenantDescription.ts` | ~810 lines | ~825 lines | +15 |
| `ai-tools/registry/tenant.ts` | ~220 lines | ~230 lines | +10 |
| `helpers/secureScoreTransform.ts` | — | ~140 lines | new |

All files remain well under 500-line target.
