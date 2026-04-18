# getSecureScore Output Modes — Design Spec

**Date:** 2026-04-18
**Status:** Approved (v2 — post Opus review)
**Version bump:** 1.3.0 (breaking change to default output)

## Problem

`getSecureScore` returns 3–5MB of raw JSON (55,000+ lines for 90-day history). The bulk is `description` fields (~469 bytes avg) across 70 controlScores × N daily entries. This makes the operation unusable for AI agents (context window cost), n8n workflow branching (decision logic doesn't need descriptions), and health dashboards (only need headline scores).

## Solution

Add an `outputMode` dropdown to `secureScoreOptions` (standard node) and typed params to the AI registry. All transformation is post-processing — no new API calls. Default changes from raw full data to `summary`. New `P.local()` param type added to registry types so `outputMode`/`includeDescriptions` are NOT forwarded to the CIPP API.

## Output Modes

All sizes are for `historyCount: 1` (single day). `slim` and `full` scale linearly with `historyCount`. All other modes always use the latest entry only — `historyCount` only affects how many days are fetched for `averaged`, `slim`, and `full`.

Sizes relative to `categoryBreakdown` (smallest):

| Mode | Relative Size (historyCount=1) | historyCount effect |
|------|-------------------------------|---------------------|
| `categoryBreakdown` | 1× (~1KB) | ignored, always latest |
| `summary` | 2× (~2KB) | ignored, always latest |
| `implementationStatus` | 15× (~15KB) | ignored, always latest |
| `averaged` | 15× (~15KB) | all N entries averaged → 1 output |
| `slim` | 150× (~150KB) per entry | scales × historyCount |
| `full` | 4,000× (~4MB) per entry | scales × historyCount |

`includeDescriptions` boolean (default `false`) re-adds `description` to controlScores for modes that strip them (`slim`, `implementationStatus`, `averaged`). Adds ~500 bytes/control. Ignored for `summary`, `categoryBreakdown`, `full`.

## Per-Mode Behaviour with historyCount

| Mode | Uses historyCount? | Output count |
|------|-------------------|--------------|
| `summary` | No — fetches 1 entry always | Single object |
| `categoryBreakdown` | No — fetches 1 entry always | Single object |
| `implementationStatus` | No — fetches 1 entry always | Array of control objects |
| `averaged` | Yes — fetches N, averages to 1 | Single object |
| `slim` | Yes — returns all N entries | Array of N entry objects |
| `full` | Yes — returns all N entries | Array of N entry objects (raw) |

For modes that ignore `historyCount`, `$top` is internally forced to `1` in the QS to avoid over-fetching.

## Output Shapes

### `summary`
Single object from the latest (index 0) daily entry:
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
`scorePercent` formula: `maxScore === 0 ? "0.0" : (currentScore / maxScore * 100).toFixed(1)`

### `implementationStatus`
Array of per-control objects from the latest entry's `controlScores`:
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
`description` added to each item when `includeDescriptions: true`.

### `categoryBreakdown`
Single object. Derived from latest entry's `controlScores` by grouping on `controlCategory` and summing `score`. No per-category `maxScore` (unreliably derivable when `scoreInPercentage === 0` — requires control profiles endpoint). Consumers wanting per-category max should use `getSecureScoreControlProfiles`.
```json
{
  "createdDateTime": "2026-04-17T00:00:00Z",
  "currentScore": 102.83,
  "maxScore": 272,
  "scorePercent": "37.8",
  "categories": {
    "Identity": { "score": 50, "controlCount": 25 },
    "Apps":     { "score": 30, "controlCount": 20 },
    "Data":     { "score": 10, "controlCount": 12 },
    "Device":   { "score": 12, "controlCount": 13 }
  }
}
```

### `slim`
Array of N daily entries, `description` deleted from each `controlScores` item. Shape identical to `full` otherwise.

### `averaged`
Single record averaged across all N fetched entries. `currentScore`/`maxScore` averaged across days. Per-control `score`/`scoreInPercentage` averaged across days where the control appears. Controls not present in all days are averaged across days where present (sparse-safe).
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
`description` added per control from first entry where control appears, when `includeDescriptions: true`.

### `full`
Raw API response, unchanged. `historyCount` controls `$top`. `includeControlProfiles` option removed — use `getSecureScoreControlProfiles` operation instead.

## Architecture

### New param type: `P.local()` in `registry/types.ts`

`outputMode` and `includeDescriptions` are post-processing directives, NOT API query params. Declaring them as `P.qs` would forward them to the CIPP API. Instead, add:

```typescript
local: (description: string): ParamDef => ({ location: 'local', description }),
```

`tool-executor.ts` is updated to strip `local` params from QS/body before calling `cippApiRequest`, and pass them separately to an optional post-processor hook.

### AI Tools executor path

The transform must apply in BOTH code paths:
- **Standard node**: `tenant.ts` action handler reads `outputMode`/`includeDescriptions` from `secureScoreOptions` collection and calls `applyOutputMode()`
- **AI Tools node**: `tool-executor.ts` reads `local` params, calls `cippApiRequest`, then calls `applyOutputMode()` for `getSecureScore` operations

`tool-executor.ts` gets a new optional `postProcess` field in the registry operation def (or a lookup by operation name). Simpler: registry `getSecureScore` entry gets a `transform` function reference that `tool-executor.ts` calls if present.

### New file: `nodes/CippAdvanced/actions/helpers/secureScoreTransform.ts`

Pure functions, no n8n dependencies, ~150 lines:

```
applyOutputMode(results, mode, includeDescriptions) → IDataObject | IDataObject[]
  ├── toSummary(result) → IDataObject
  ├── toImplementationStatus(result, includeDescriptions) → IDataObject[]
  ├── toCategoryBreakdown(result) → IDataObject
  ├── toSlim(results, includeDescriptions) → IDataObject[]
  └── toAveraged(results, includeDescriptions) → IDataObject
```

`applyOutputMode` validates `mode` string — unknown values fall through to `summary` (safe default, no throw). Handles empty `results[]` by returning appropriate empty shape per mode.

### `tenant.ts` change

```typescript
import { applyOutputMode } from './helpers/secureScoreTransform';

const outputMode = (opts.outputMode as string) ?? 'summary';
const includeDescriptions = (opts.includeDescriptions as boolean) ?? false;
// Force $top=1 for modes that only use latest entry
const effectiveTop = ['summary','categoryBreakdown','implementationStatus'].includes(outputMode)
  ? 1 : historyCount;
const qs: IDataObject = { tenantFilter, Endpoint: 'security/secureScores', '$top': effectiveTop };
const scoreData = await cippApiRequest.call(context, 'GET', '/api/ListGraphRequest', {}, qs);
const raw = Array.isArray(scoreData) ? scoreData : (scoreData ? [scoreData as IDataObject] : []);
responseData = applyOutputMode(raw, outputMode, includeDescriptions);
```

`includeControlProfiles` branch removed.

### `TenantDescription.ts` changes

`secureScoreOptions` collection:
- `historyCount` — unchanged
- `outputMode` — new options dropdown, default `summary`
- `includeDescriptions` — new boolean, default `false`
- `includeControlProfiles` — **removed**

### `ai-tools/registry/tenant.ts` changes

New `getSecureScore` params (using `P.local`):
```typescript
outputMode: P.local(
  'Controls response size. Default: summary. ' +
  'Sizes relative to smallest (historyCount=1): ' +
  'categoryBreakdown (1x — scores grouped by Identity/Apps/Data/Device), ' +
  'summary (2x — top-level scores + comparative averages), ' +
  'implementationStatus (15x — per-control name/category/score/status), ' +
  'averaged (15x — single record averaged across historyCount days), ' +
  'slim (150x per history entry, scales with historyCount — all controls minus descriptions), ' +
  'full (4000x per history entry, scales with historyCount — complete raw response).'
),
includeDescriptions: P.local(
  'Add verbose control descriptions to modes that strip them (slim/implementationStatus/averaged). ' +
  'Adds ~500 bytes per control. Ignored for summary/categoryBreakdown/full. Default: false'
),
```

`$top` description updated: *"Number of historical days to fetch. Meaningful for slim, averaged, and full modes only — other modes always use the latest entry."*

## Breaking Changes

1. **Default output shape changes**: Previous default returned array of raw daily entries; new default (`summary`) returns a single flat object. Workflows reading `items[0].json[0].currentScore` break — must set `outputMode: full` or update field references.
2. **`includeControlProfiles` removed**: Use `getSecureScoreControlProfiles` operation for control profile metadata.
3. **`includeControlProfiles: true` combined-envelope gone**: Previous `{ scores: [...], controlProfiles: [...] }` shape is not reproducible — no migration path, use two separate operations.
4. **Version bump to 1.3.0** (semver breaking change in a 1.x package).

## File Size Impact

| File | Before | After | Delta |
|------|--------|-------|-------|
| `tenant.ts` | ~350 lines | ~358 lines | +8 |
| `TenantDescription.ts` | ~810 lines | ~820 lines | +10 |
| `ai-tools/registry/tenant.ts` | ~220 lines | ~230 lines | +10 |
| `ai-tools/registry/types.ts` | ~30 lines | ~35 lines | +5 |
| `ai-tools/tool-executor.ts` | ~TBD | ~TBD+15 | +15 |
| `helpers/secureScoreTransform.ts` | — | ~150 lines | new |

All files remain well under 500-line target.

## Open Items (resolve during implementation)

- Confirm `tool-executor.ts` current line count and exact hook pattern for `transform` field.
- Confirm `P.local` doesn't require Zod schema change in `schema-generator.ts` (local params should not appear in tool input schema visible to LLM — or should they? TBD with implementer).
- Confirm `controlCategory` is always present on `controlScores[]` items in live API response (spec assumes CIPP projects it; check against example file).
