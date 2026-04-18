# getSecureScore Output Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six `outputMode` options to `getSecureScore` (summary/categoryBreakdown/implementationStatus/averaged/slim/full) reducing default output from ~4MB to ~2KB, with full data still available on demand.

**Architecture:** All transformation is client-side post-processing in a new pure-function helper file. A new `P.local` param type prevents post-processing directives from leaking to the CIPP API. Both the standard node and AI Tools paths call the same transform functions.

**Tech Stack:** TypeScript, n8n-workflow types (IDataObject), existing cippApiRequest/wrapSuccess/wrapError pattern.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `nodes/CippAdvanced/actions/helpers/secureScoreTransform.ts` | **Create** | Pure transform functions for all 6 output modes |
| `nodes/CippAdvanced/ai-tools/registry/types.ts` | **Modify** | Add `'local'` to `ParamDef.location`; add `P.localBool`, `P.localEnum` helpers; add `transform?` to `OperationDef` |
| `nodes/CippAdvanced/ai-tools/tool-executor.ts` | **Modify** | Extract `local` params before qs/body build; call `opDef.transform` after unwrapping results |
| `nodes/CippAdvanced/ai-tools/registry/tenant.ts` | **Modify** | Update `getSecureScore`: add `outputMode`/`includeDescriptions` as `P.localEnum`/`P.localBool`; add `transform` fn; update `$top` description |
| `nodes/CippAdvanced/actions/tenant.ts` | **Modify** | Replace `includeControlProfiles` branch with `applyOutputMode` call |
| `nodes/CippAdvanced/descriptions/TenantDescription.ts` | **Modify** | Replace `includeControlProfiles` with `outputMode` dropdown + `includeDescriptions` boolean |
| `package.json` | **Modify** | Bump 1.2.3 → 1.3.0 |
| `CHANGELOG.md` | **Modify** | Add 1.3.0 entry |

---

## Task 1: Create `secureScoreTransform.ts`

**Files:**
- Create: `nodes/CippAdvanced/actions/helpers/secureScoreTransform.ts`

- [ ] **Step 1: Create the file with all transform functions**

```typescript
// nodes/CippAdvanced/actions/helpers/secureScoreTransform.ts
import type { IDataObject } from 'n8n-workflow';

/** Modes that only ever need the latest daily entry — ignore historyCount */
const SINGLE_ENTRY_MODES = new Set(['summary', 'categoryBreakdown', 'implementationStatus']);

/**
 * Returns the effective $top value to send to the API.
 * Single-entry modes always fetch 1 to avoid over-fetching.
 */
export function effectiveTop(outputMode: string, historyCount: number): number {
	return SINGLE_ENTRY_MODES.has(outputMode) ? 1 : Math.max(1, historyCount);
}

function scorePercent(current: number, max: number): string {
	return max === 0 ? '0.0' : (current / max * 100).toFixed(1);
}

function toSummary(result: IDataObject): IDataObject {
	const current = (result.currentScore as number) ?? 0;
	const max = (result.maxScore as number) ?? 0;
	return {
		createdDateTime: result.createdDateTime,
		currentScore: current,
		maxScore: max,
		scorePercent: scorePercent(current, max),
		activeUserCount: result.activeUserCount,
		licensedUserCount: result.licensedUserCount,
		enabledServices: result.enabledServices,
		averageComparativeScores: result.averageComparativeScores,
		Tenant: result.Tenant,
		CippStatus: result.CippStatus,
	};
}

function toImplementationStatus(result: IDataObject, includeDescriptions: boolean): IDataObject[] {
	const controls = (result.controlScores as IDataObject[]) ?? [];
	return controls.map((c) => {
		const out: IDataObject = {
			controlName: c.controlName,
			controlCategory: c.controlCategory,
			score: c.score,
			scoreInPercentage: c.scoreInPercentage,
			implementationStatus: c.implementationStatus,
			on: c.on,
		};
		if (includeDescriptions && c.description) out.description = c.description;
		return out;
	});
}

function toCategoryBreakdown(result: IDataObject): IDataObject {
	const current = (result.currentScore as number) ?? 0;
	const max = (result.maxScore as number) ?? 0;
	const controls = (result.controlScores as IDataObject[]) ?? [];
	const categories: Record<string, { score: number; controlCount: number }> = {};
	for (const c of controls) {
		const cat = (c.controlCategory as string) ?? 'Unknown';
		if (!categories[cat]) categories[cat] = { score: 0, controlCount: 0 };
		categories[cat].score += (c.score as number) ?? 0;
		categories[cat].controlCount += 1;
	}
	// Round category scores to 2dp for readability
	for (const cat of Object.values(categories)) {
		cat.score = parseFloat(cat.score.toFixed(2));
	}
	return {
		createdDateTime: result.createdDateTime,
		currentScore: current,
		maxScore: max,
		scorePercent: scorePercent(current, max),
		categories,
	};
}

function toSlim(results: IDataObject[], includeDescriptions: boolean): IDataObject[] {
	return results.map((entry) => {
		const controls = (entry.controlScores as IDataObject[]) ?? [];
		return {
			...entry,
			controlScores: includeDescriptions
				? controls
				: controls.map(({ description: _d, ...rest }) => rest as IDataObject),
		};
	});
}

function toAveraged(results: IDataObject[], includeDescriptions: boolean): IDataObject {
	if (results.length === 0) return {};
	const n = results.length;
	const first = results[0];
	const last = results[n - 1];

	const avgCurrent = results.reduce((s, r) => s + ((r.currentScore as number) ?? 0), 0) / n;
	const avgMax = results.reduce((s, r) => s + ((r.maxScore as number) ?? 0), 0) / n;

	// Accumulate per-control totals across all days (sparse-safe: average across days present)
	const acc: Record<string, {
		score: number; pct: number; count: number;
		category: string; description?: string;
	}> = {};
	for (const entry of results) {
		for (const c of (entry.controlScores as IDataObject[]) ?? []) {
			const name = c.controlName as string;
			if (!acc[name]) {
				acc[name] = {
					score: 0, pct: 0, count: 0,
					category: (c.controlCategory as string) ?? '',
					description: c.description as string | undefined,
				};
			}
			acc[name].score += (c.score as number) ?? 0;
			acc[name].pct += (c.scoreInPercentage as number) ?? 0;
			acc[name].count += 1;
		}
	}

	const controlScores = Object.entries(acc).map(([name, s]) => {
		const out: IDataObject = {
			controlName: name,
			controlCategory: s.category,
			score: parseFloat((s.score / s.count).toFixed(2)),
			scoreInPercentage: parseFloat((s.pct / s.count).toFixed(1)),
		};
		if (includeDescriptions && s.description) out.description = s.description;
		return out;
	});

	return {
		periodStart: last.createdDateTime,
		periodEnd: first.createdDateTime,
		daysAveraged: n,
		currentScore: parseFloat(avgCurrent.toFixed(2)),
		maxScore: parseFloat(avgMax.toFixed(1)),
		scorePercent: scorePercent(avgCurrent, avgMax),
		controlScores,
	};
}

/**
 * Apply output mode transformation to raw secureScores API results.
 * Unknown mode values fall through to 'summary' (safe default).
 * Empty results return an appropriate empty shape per mode.
 */
export function applyOutputMode(
	results: IDataObject[],
	mode: string,
	includeDescriptions: boolean,
): IDataObject | IDataObject[] {
	if (results.length === 0) {
		return (mode === 'implementationStatus' || mode === 'slim' || mode === 'full') ? [] : {};
	}
	switch (mode) {
		case 'categoryBreakdown': return toCategoryBreakdown(results[0]);
		case 'implementationStatus': return toImplementationStatus(results[0], includeDescriptions);
		case 'slim': return toSlim(results, includeDescriptions);
		case 'averaged': return toAveraged(results, includeDescriptions);
		case 'full': return results;
		case 'summary':
		default: return toSummary(results[0]);
	}
}
```

- [ ] **Step 2: Verify file is TypeScript-clean (build)**

```bash
npm run build
```
Expected: no errors. If `description` destructure causes a lint issue, use `const { description: _d, ...rest } = c as IDataObject & { description?: unknown }; return rest as IDataObject;`

- [ ] **Step 3: Commit**

```bash
git add nodes/CippAdvanced/actions/helpers/secureScoreTransform.ts
git commit -m "feat(secureScore): add output mode transform helper"
```

---

## Task 2: Extend `registry/types.ts` — `local` param type + `transform` field

**Files:**
- Modify: `nodes/CippAdvanced/ai-tools/registry/types.ts`

- [ ] **Step 1: Add `'local'` to `ParamDef.location` and `transform` to `OperationDef`**

Change line 9 (the `location` field):
```typescript
// BEFORE
location: 'body' | 'qs';

// AFTER
location: 'body' | 'qs' | 'local';
```

Add `transform` to `OperationDef` (after the `operationLabel` field, around line 30):
```typescript
	/** Post-processing transform applied after API response, before result wrapping.
	 *  Return IDataObject for single-object output, IDataObject[] for list output.
	 *  Receives raw unwrapped results array and any params declared with location 'local'. */
	transform?: (results: IDataObject[], localParams: Record<string, unknown>) => IDataObject | IDataObject[];
```

Add the import for `IDataObject` at the top (it's needed for the `transform` signature). Add after line 4:
```typescript
import type { IDataObject } from 'n8n-workflow';
```

- [ ] **Step 2: Add `P.localBool` and `P.localEnum` helpers**

In the `P` object (starting around line 73), add after `qsEnum`:
```typescript
	localEnum: (desc: string, values: string[], required = false): ParamDef =>
		({ location: 'local', type: 'string', required, description: desc, enumValues: values }),
	localBool: (desc: string, required = false): ParamDef =>
		({ location: 'local', type: 'boolean', required, description: desc }),
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add nodes/CippAdvanced/ai-tools/registry/types.ts
git commit -m "feat(registry): add local param location and transform field to OperationDef"
```

---

## Task 3: Update `tool-executor.ts` — extract local params + call transform

**Files:**
- Modify: `nodes/CippAdvanced/ai-tools/tool-executor.ts`

- [ ] **Step 1: Extract `local` params before qs/body build**

Find the comment `// ── Generic execution path ──` (around line 84). Just after `const qs: IDataObject = {};`, add:

```typescript
		// Extract local (post-processing) params — not sent to API
		const localParams: Record<string, unknown> = {};
		for (const [paramName, paramDef] of Object.entries(regularOpDef.params)) {
			if (paramDef.location === 'local' && params[paramName] !== undefined) {
				localParams[paramName] = params[paramName];
				delete params[paramName];
			}
		}
```

- [ ] **Step 2: Skip `local` params in the qs/body mapping loop**

In the param mapping loop (around line 101), add a guard for `local` location:

```typescript
		// Map params to body/qs based on registry
		for (const [paramName, paramDef] of Object.entries(regularOpDef.params)) {
			const value = params[paramName];
			if (value === undefined || value === null || value === '') continue;
			if (paramDef.location === 'local') continue; // already extracted above

			const apiName = paramDef.apiName ?? paramName;
			// ... rest unchanged
```

- [ ] **Step 3: Call transform after unwrapping, before items/limit wrapping**

In the `isList` path, find this line (around line 163):
```typescript
		const arr = Array.isArray(result) ? result : [];
```

Add immediately after it:
```typescript
			// Apply post-processing transform if defined (e.g., getSecureScore output modes)
			if (regularOpDef.transform) {
				const transformed = regularOpDef.transform(arr, localParams);
				if (Array.isArray(transformed)) {
					const items = (transformed as IDataObject[]).slice(0, limit);
					return JSON.stringify(wrapSuccess(resource, operation, { items, count: items.length }));
				}
				return JSON.stringify(wrapSuccess(resource, operation, transformed));
			}
```

- [ ] **Step 4: Build to verify**

```bash
npm run build
```
Expected: no errors. The `delete params[paramName]` is safe because `params` is a local copy already stripped of metadata.

- [ ] **Step 5: Commit**

```bash
git add nodes/CippAdvanced/ai-tools/tool-executor.ts
git commit -m "feat(executor): support local params and post-processing transform"
```

---

## Task 4: Update `registry/tenant.ts` — wire `getSecureScore` transform

**Files:**
- Modify: `nodes/CippAdvanced/ai-tools/registry/tenant.ts`

- [ ] **Step 1: Add import for `applyOutputMode`**

At the top of the file, add after existing imports:
```typescript
import type { IDataObject } from 'n8n-workflow';
import { applyOutputMode } from '../../actions/helpers/secureScoreTransform';
```

- [ ] **Step 2: Replace the `getSecureScore` entry**

Find the `getSecureScore` entry (around line 162) and replace it entirely:

```typescript
		getSecureScore: {
			method: 'GET',
			endpoint: '/api/ListGraphRequest',
			isWrite: false,
			isList: true,
			tenant: TENANT.qs,
			defaults: { qs: { Endpoint: 'security/secureScores', '$top': 1 } },
			params: {
				'$top': P.qsNum(
					'Number of historical days to fetch. Meaningful for slim, averaged, and full modes only — ' +
					'other modes always use the latest entry. Default: 1.',
				),
				outputMode: P.localEnum(
					'Controls response size. Default: summary. ' +
					'Sizes relative to smallest (historyCount=1): ' +
					'categoryBreakdown (1x — scores grouped by Identity/Apps/Data/Device), ' +
					'summary (2x — top-level scores + comparative averages), ' +
					'implementationStatus (15x — per-control name/category/score/status), ' +
					'averaged (15x — single record averaged across $top days), ' +
					'slim (150x per entry, scales with $top — all controls minus descriptions), ' +
					'full (4000x per entry, scales with $top — complete raw response, use only when all detail needed).',
					['summary', 'categoryBreakdown', 'implementationStatus', 'averaged', 'slim', 'full'],
				),
				includeDescriptions: P.localBool(
					'Add verbose control descriptions to modes that strip them (slim/implementationStatus/averaged). ' +
					'Adds ~500 bytes per control (~35KB for latest entry). ' +
					'Ignored for summary/categoryBreakdown/full. Default: false.',
				),
			},
			description:
				'Get Microsoft Secure Score for a tenant. Default output: summary (~2KB — currentScore, maxScore, ' +
				'scorePercent, enabledServices, averageComparativeScores). Use outputMode to control detail level. ' +
				'Requires SecurityEvents.Read.All on the SAM app and Security Reader GDAP role.',
			transform: (results: IDataObject[], localParams: Record<string, unknown>) =>
				applyOutputMode(
					results,
					(localParams.outputMode as string) ?? 'summary',
					(localParams.includeDescriptions as boolean) ?? false,
				),
		},
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```
Expected: no errors. If TypeScript complains about the `transform` signature, verify `IDataObject` is imported from `n8n-workflow`.

- [ ] **Step 4: Commit**

```bash
git add nodes/CippAdvanced/ai-tools/registry/tenant.ts
git commit -m "feat(registry/tenant): wire getSecureScore output mode transform"
```

---

## Task 5: Update `actions/tenant.ts` — standard node handler

**Files:**
- Modify: `nodes/CippAdvanced/actions/tenant.ts`

- [ ] **Step 1: Add import**

Add at the top of `tenant.ts` with the other imports:
```typescript
import { applyOutputMode, effectiveTop } from './helpers/secureScoreTransform';
```

- [ ] **Step 2: Replace the `getSecureScore` handler block**

Find the `getSecureScore` block (lines 246–272) and replace it:

```typescript
	} else if (operation === 'getSecureScore') {
		// GET /api/ListGraphRequest → security/secureScores
		const opts = context.getNodeParameter('secureScoreOptions', i, {}) as IDataObject;
		const historyCount = Math.max(1, (opts.historyCount as number) ?? 1);
		const outputMode = (opts.outputMode as string) ?? 'summary';
		const includeDescriptions = (opts.includeDescriptions as boolean) ?? false;

		const tenantFilter = getTenantFilter(context, i);
		const qs: IDataObject = {
			tenantFilter,
			Endpoint: 'security/secureScores',
			'$top': effectiveTop(outputMode, historyCount),
		};
		const scoreData = await cippApiRequest.call(context, 'GET', '/api/ListGraphRequest', {}, qs);
		const raw = Array.isArray(scoreData)
			? scoreData as IDataObject[]
			: (scoreData ? [scoreData as IDataObject] : []);
		responseData = applyOutputMode(raw, outputMode, includeDescriptions);
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add nodes/CippAdvanced/actions/tenant.ts
git commit -m "feat(actions/tenant): apply output mode transform to getSecureScore"
```

---

## Task 6: Update `TenantDescription.ts` — UI fields

**Files:**
- Modify: `nodes/CippAdvanced/descriptions/TenantDescription.ts`

- [ ] **Step 1: Replace `secureScoreOptions` collection**

Find the `secureScoreOptions` collection (lines 748–779) and replace the entire collection options array. The `historyCount` option stays; `includeControlProfiles` is removed; `outputMode` and `includeDescriptions` are added:

```typescript
	// ── Get Secure Score ──
	{
		displayName: 'Options',
		name: 'secureScoreOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['tenant'],
				operation: ['getSecureScore'],
			},
		},
		options: [
			{
				displayName: 'Output Mode',
				name: 'outputMode',
				type: 'options',
				default: 'summary',
				description: 'Controls the amount and shape of returned data',
				options: [
					{
						name: 'Category Breakdown (1× — smallest, scores by category)',
						value: 'categoryBreakdown',
					},
					{
						name: 'Summary (2× — top-level scores + comparative averages)',
						value: 'summary',
					},
					{
						name: 'Implementation Status (15× — per-control status)',
						value: 'implementationStatus',
					},
					{
						name: 'Averaged (15× — single record averaged across history)',
						value: 'averaged',
					},
					{
						name: 'Slim (150× per entry — all controls, descriptions stripped)',
						value: 'slim',
					},
					{
						name: 'Full (4000× per entry — complete raw data)',
						value: 'full',
					},
				],
			},
			{
				displayName: 'History Count',
				name: 'historyCount',
				type: 'number',
				default: 1,
				description: 'Number of historical score entries to fetch (used by slim, averaged, full modes)',
				typeOptions: {
					minValue: 1,
				},
			},
			{
				displayName: 'Include Descriptions',
				name: 'includeDescriptions',
				type: 'boolean',
				default: false,
				description:
					'Whether to include verbose control descriptions (applies to slim/implementationStatus/averaged modes only)',
			},
		],
	},
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add nodes/CippAdvanced/descriptions/TenantDescription.ts
git commit -m "feat(descriptions): update getSecureScore options — outputMode dropdown, remove includeControlProfiles"
```

---

## Task 7: Version bump + CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version in `package.json`**

Change `"version": "1.2.3"` to `"version": "1.3.0"`.

- [ ] **Step 2: Add CHANGELOG entry**

Add at the top of `CHANGELOG.md` (after the `# Changelog` header):

```markdown
## [1.3.0] - 2026-04-18

### Breaking Changes
- `getSecureScore` default output changed from raw API response (~4MB) to `summary` mode (~2KB). Existing workflows that rely on the raw response must set `outputMode: Full` in options.
- `includeControlProfiles` option removed. Use the `getSecureScoreControlProfiles` operation instead.

### Added
- `getSecureScore`: six output modes — `summary`, `categoryBreakdown`, `implementationStatus`, `averaged`, `slim`, `full`
- `getSecureScore`: `includeDescriptions` option to re-add control descriptions to stripped modes
- `getSecureScore` (AI Tools): `outputMode` and `includeDescriptions` params with relative-size guidance in descriptions
- New internal `P.localEnum` / `P.localBool` param helpers for post-processing directives not forwarded to the API
- New post-processing `transform` hook on `OperationDef` for AI Tools executor
```

- [ ] **Step 3: Build + verify version**

```bash
npm run build && node -p "require('./package.json').version"
```
Expected: `1.3.0` and no build errors.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 1.3.0 — getSecureScore output modes (breaking)"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Verify transform produces correct shapes**

Run this Node.js snippet against the example file to confirm transform output:

```bash
node -e "
const { applyOutputMode } = require('./dist/nodes/CippAdvanced/actions/helpers/secureScoreTransform');
const raw = require('C:/Users/maxs/Downloads/Get_secure_score.json');
const results = raw[0].json.Results;
const summary = applyOutputMode(results, 'summary', false);
console.log('summary keys:', Object.keys(summary));
console.log('scorePercent:', summary.scorePercent);
const cat = applyOutputMode(results, 'categoryBreakdown', false);
console.log('categories:', Object.keys(cat.categories));
const impl = applyOutputMode(results, 'implementationStatus', false);
console.log('impl count:', impl.length, 'first keys:', Object.keys(impl[0]));
const avg = applyOutputMode(results, 'averaged', false);
console.log('averaged keys:', Object.keys(avg), 'daysAveraged:', avg.daysAveraged);
const slim = applyOutputMode(results.slice(0,2), 'slim', false);
console.log('slim entries:', slim.length, 'has description:', 'description' in slim[0].controlScores[0]);
"
```

Expected output (approximate):
```
summary keys: [ 'createdDateTime', 'currentScore', 'maxScore', 'scorePercent', 'activeUserCount', 'licensedUserCount', 'enabledServices', 'averageComparativeScores', 'Tenant', 'CippStatus' ]
scorePercent: 37.8
categories: [ 'Apps', 'Identity', ... ]
impl count: 70  first keys: [ 'controlName', 'controlCategory', 'score', 'scoreInPercentage', 'implementationStatus', 'on' ]
averaged keys: [ 'periodStart', 'periodEnd', 'daysAveraged', 'currentScore', 'maxScore', 'scorePercent', 'controlScores' ]  daysAveraged: 90
slim entries: 2  has description: false
```

- [ ] **Step 2: Verify `includeDescriptions` re-adds descriptions**

```bash
node -e "
const { applyOutputMode } = require('./dist/nodes/CippAdvanced/actions/helpers/secureScoreTransform');
const raw = require('C:/Users/maxs/Downloads/Get_secure_score.json');
const results = raw[0].json.Results;
const slim = applyOutputMode(results.slice(0,1), 'slim', true);
console.log('slim with desc has description:', 'description' in slim[0].controlScores[0]);
const impl = applyOutputMode(results, 'implementationStatus', true);
console.log('impl with desc has description:', 'description' in impl[0]);
"
```

Expected: both `true`.

- [ ] **Step 3: Verify empty input safety**

```bash
node -e "
const { applyOutputMode } = require('./dist/nodes/CippAdvanced/actions/helpers/secureScoreTransform');
['summary','categoryBreakdown','implementationStatus','averaged','slim','full'].forEach(mode => {
  const r = applyOutputMode([], mode, false);
  console.log(mode, ':', Array.isArray(r) ? 'array' : 'object', JSON.stringify(r).length + 'b');
});
"
```

Expected: `implementationStatus`, `slim`, `full` → array; others → object.

- [ ] **Step 4: Final build + lint**

```bash
npm run build && npm run lint
```
Expected: no errors, no warnings.

- [ ] **Step 5: Commit verification note**

No code change — verification only. Proceed to push/tag if all checks pass.
