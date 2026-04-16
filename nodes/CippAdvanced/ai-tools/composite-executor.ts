// ai-tools/composite-executor.ts
// Multi-step composite workflow executor — shared by both AI Tools and standard node surfaces.
import type { IExecuteFunctions, ISupplyDataFunctions, IDataObject } from 'n8n-workflow';
import type { IHttpRequestMethods } from 'n8n-workflow';
import { cippApiRequest, getTenantList } from '../GenericFunctions';
import type { ITenant } from '../types';
import { wrapSuccess, wrapError, ERROR_TYPES } from './error-formatter';

// Both node surfaces can call us — we cast to IExecuteFunctions for cippApiRequest
type CompositeContext = IExecuteFunctions | ISupplyDataFunctions;

// ── Internal types ───────────────────────────────────────────────────

interface StepResult {
	step: string;
	ok: boolean;
	data?: unknown;
	error?: string;
}

interface CompositeResult {
	composite: string;
	tenantFilter: string;
	steps: StepResult[];
	result: unknown;
}

/** Thrown by composite fns in fast mode when a step fails — caught by executeComposite */
class CompositeStepError extends Error {
	constructor(
		public readonly step: string,
		message: string,
	) {
		super(message);
		this.name = 'CompositeStepError';
	}
}

// ── Internal helpers ─────────────────────────────────────────────────

async function apiStep(
	ctx: IExecuteFunctions,
	step: string,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject,
	body: IDataObject = {},
): Promise<StepResult> {
	try {
		const data = await cippApiRequest.call(ctx, method, endpoint, body, qs);
		return { step, ok: true, data };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { step, ok: false, error: msg };
	}
}

/** Normalise any CIPP API response into an array of objects */
function toArray(data: unknown): IDataObject[] {
	if (!data) return [];
	if (Array.isArray(data)) return data as IDataObject[];
	const obj = data as IDataObject;
	if (Array.isArray(obj.Results)) return obj.Results as IDataObject[];
	if (Array.isArray(obj.value)) return obj.value as IDataObject[];
	return [obj];
}

function failFast(step: StepResult, failMode: 'fast' | 'bestEffort'): void {
	if (!step.ok && failMode === 'fast') {
		throw new CompositeStepError(step.step, step.error ?? 'Step failed');
	}
}

// ── Composite implementations ────────────────────────────────────────

async function licenseAudit(
	ctx: IExecuteFunctions,
	tenantFilter: string,
	params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
): Promise<CompositeResult> {
	const inactiveDays = typeof params.inactiveDays === 'number' ? params.inactiveDays : 90;
	const steps: StepResult[] = [];

	// Step 1: License inventory
	const s1 = await apiStep(ctx, 'tenant.getLicenses', 'GET', '/api/ListLicenses', { tenantFilter });
	steps.push(s1);
	failFast(s1, failMode);

	// Step 2: Disabled users (may hold licenses = waste)
	const s2 = await apiStep(ctx, 'user.listUsers', 'GET', '/api/ListUsers', {
		tenantFilter,
		graphFilter: 'accountEnabled eq false',
	});
	steps.push(s2);
	failFast(s2, failMode);

	// Step 3: Inactive accounts
	const s3 = await apiStep(ctx, 'user.listInactiveAccounts', 'GET', '/api/ListInactiveAccounts', {
		tenantFilter,
		InactiveDays: inactiveDays,
	});
	steps.push(s3);

	// Shape results
	const licenses = toArray(s1.data);
	const allDisabledUsers = toArray(s2.data);
	const inactive = toArray(s3.data);

	const disabledWithLicense = allDisabledUsers.filter((u) => {
		const assigned = u.assignedLicenses as unknown[] | undefined;
		return Array.isArray(assigned) && assigned.length > 0;
	});

	let totalSeats = 0;
	let usedSeats = 0;
	const unusedSkus: IDataObject[] = [];
	for (const sku of licenses) {
		const prepaid = sku.prepaidUnits as IDataObject | undefined;
		const total =
			(typeof prepaid?.enabled === 'number' ? prepaid.enabled : 0) ||
			(typeof sku.totalCount === 'number' ? sku.totalCount : 0);
		const used = typeof sku.consumedUnits === 'number' ? sku.consumedUnits : 0;
		totalSeats += total;
		usedSeats += used;
		if (total > used) {
			unusedSkus.push({
				skuId: sku.skuId,
				skuPartNumber: sku.skuPartNumber,
				friendlyName: sku.friendlyName ?? sku.productName,
				totalSeats: total,
				usedSeats: used,
				wastedSeats: total - used,
			});
		}
	}

	const wastedSeats = totalSeats - usedSeats;
	const estimatedMonthlySaving = wastedSeats * 8; // rough avg $8/seat/month

	return {
		composite: 'licenseAudit',
		tenantFilter,
		steps,
		result: {
			summary: { totalSeats, usedSeats, wastedSeats, estimatedMonthlySaving },
			disabledWithLicense,
			inactive,
			unusedSkus,
		},
	};
}

async function securityPosture(
	ctx: IExecuteFunctions,
	tenantFilter: string,
	_params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
): Promise<CompositeResult> {
	const steps: StepResult[] = [];

	// Step 1: MFA status for all users
	const s1 = await apiStep(ctx, 'user.listMfaUsers', 'GET', '/api/ListMFAUsers', { tenantFilter });
	steps.push(s1);
	failFast(s1, failMode);

	// Step 2: Basic auth usage
	const s2 = await apiStep(ctx, 'identity.listBasicAuth', 'GET', '/api/ListBasicAuth', { tenantFilter });
	steps.push(s2);
	failFast(s2, failMode);

	// Step 3: Conditional access policies
	const s3 = await apiStep(ctx, 'conditionalAccess.listPolicies', 'GET', '/api/ListConditionalAccessPolicies', { tenantFilter });
	steps.push(s3);
	failFast(s3, failMode);

	// Step 4: Defender state
	const s4 = await apiStep(ctx, 'tenant.listDefenderState', 'GET', '/api/ListDefenderState', { tenantFilter });
	steps.push(s4);

	// MFA analysis — CIPP returns users with MFAEnabled, PerUserMFAState, and role info
	const mfaUsers = toArray(s1.data);
	const usersWithoutMfa = mfaUsers
		.filter((u) => !u.MFAEnabled && !u.PerUserMFAState)
		.map((u) => (u.userPrincipalName ?? u.UPN ?? u.id) as string)
		.filter(Boolean);
	const adminGaps = mfaUsers
		.filter((u) => (u.isAdminUser || u.memberOf) && !u.MFAEnabled)
		.map((u) => (u.userPrincipalName ?? u.UPN) as string)
		.filter(Boolean);
	const coveredPct =
		mfaUsers.length > 0
			? Math.round(((mfaUsers.length - usersWithoutMfa.length) / mfaUsers.length) * 100)
			: 100;

	// Basic auth
	const basicAuthItems = toArray(s2.data);
	const basicAuthEnabled = basicAuthItems.length > 0;

	// CA policies — detect MFA grant and legacy-auth block
	const caPolicies = toArray(s3.data);
	const requireMfa = caPolicies.some((p) => {
		const controls = p.grantControls as IDataObject | undefined;
		const builtIn = controls?.builtInControls as string[] | undefined;
		return Array.isArray(builtIn) && builtIn.includes('mfa');
	});
	const blockLegacyAuth = caPolicies.some((p) => {
		const conditions = p.conditions as IDataObject | undefined;
		const clientAppTypes = (conditions?.clientAppTypes as string[]) ?? [];
		return clientAppTypes.includes('exchangeActiveSync') || clientAppTypes.includes('other');
	});

	// Defender state
	const defenderItems = toArray(s4.data);
	const defenderEnabled = defenderItems.some(
		(d) => d.status === 'Active' || d.onboardingStatus === 'Onboarded',
	);

	// Score: base 100 with deductions
	let score = 100;
	score -= Math.min(40, usersWithoutMfa.length * 5);
	if (basicAuthEnabled) score -= 20;
	if (!requireMfa) score -= 15;
	if (!blockLegacyAuth) score -= 10;
	if (!defenderEnabled) score -= 15;
	score = Math.max(0, score);

	return {
		composite: 'securityPosture',
		tenantFilter,
		steps,
		result: {
			score,
			mfa: { coveredPct, usersWithoutMfa, adminGaps },
			basicAuth: { enabled: basicAuthEnabled, usersAffected: basicAuthItems.length },
			caPolicies: { count: caPolicies.length, requireMfa, blockLegacyAuth },
			defender: { status: defenderEnabled ? 'Active' : 'Inactive' },
		},
	};
}

async function becInvestigation(
	ctx: IExecuteFunctions,
	tenantFilter: string,
	params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
): Promise<CompositeResult> {
	const userId = params.userId as string | undefined;
	const days = typeof params.days === 'number' ? params.days : 30;
	const steps: StepResult[] = [];

	// Step 1: Sign-ins (tenant-wide; filtered client-side when userId provided)
	const s1 = await apiStep(ctx, 'user.listSignIns', 'GET', '/api/ListSignIns', {
		tenantFilter,
		Days: days,
	});
	steps.push(s1);
	failFast(s1, failMode);

	// Step 2: Mailbox rules — UserID is the registry param name (capital I)
	const rulesQs: IDataObject = { tenantFilter };
	if (userId) rulesQs.UserID = userId;
	const s2 = await apiStep(ctx, 'user.listUserMailboxRules', 'GET', '/api/ListUserMailboxRules', rulesQs);
	steps.push(s2);
	failFast(s2, failMode);

	// Step 3: OAuth apps
	const s3 = await apiStep(ctx, 'tenant.listOAuthApps', 'GET', '/api/ListOAuthApps', { tenantFilter });
	steps.push(s3);
	failFast(s3, failMode);

	// Step 4: BEC check — only when userId provided; registry param is 'userid' (all lowercase)
	let s4: StepResult | null = null;
	if (userId) {
		s4 = await apiStep(ctx, 'user.execBecCheck', 'GET', '/api/ExecBECCheck', {
			tenantFilter,
			userid: userId,
		});
		steps.push(s4);
	}

	// Shape results
	let signIns = toArray(s1.data);
	if (userId) {
		signIns = signIns.filter(
			(s) => s.userId === userId || s.userPrincipalName === userId,
		);
	}
	const suspiciousSignIns = signIns.filter(
		(s) => s.riskState === 'atRisk' || s.riskDetail !== 'none' || (s.status as IDataObject)?.errorCode !== 0,
	);

	const mailboxRules = toArray(s2.data);
	const externalForwardingRules = mailboxRules.filter((r) => {
		const actions = r.Actions as IDataObject | undefined;
		return Boolean(actions?.ForwardTo || actions?.ForwardAsAttachmentTo || actions?.RedirectTo);
	});

	const oauthApps = toArray(s3.data);
	const suspiciousOAuthApps = oauthApps.filter(
		(a) => a.riskLevel === 'high' || a.consentType === 'AllPrincipals',
	);

	// Risk score: additive based on findings
	let riskScore = 0;
	riskScore += Math.min(40, suspiciousSignIns.length * 10);
	riskScore += Math.min(30, externalForwardingRules.length * 15);
	riskScore += Math.min(20, suspiciousOAuthApps.length * 5);
	if (s4?.ok && s4.data) riskScore = Math.min(100, riskScore + 10);
	riskScore = Math.min(100, riskScore);

	const result: IDataObject = {
		riskScore,
		suspiciousSignIns,
		externalForwardingRules,
		suspiciousOAuthApps,
	};
	if (s4 !== null) {
		result.becCheckResult = s4.ok ? (s4.data as IDataObject) : null;
	}

	return { composite: 'becInvestigation', tenantFilter, steps, result };
}

async function user360(
	ctx: IExecuteFunctions,
	tenantFilter: string,
	params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
): Promise<CompositeResult> {
	const userId = params.userId as string;
	const steps: StepResult[] = [];

	// Step 1: User profile — registry param UserID (capital I)
	const s1 = await apiStep(ctx, 'user.listUsers', 'GET', '/api/ListUsers', {
		tenantFilter,
		UserID: userId,
	});
	steps.push(s1);
	failFast(s1, failMode);

	// Step 2: Group memberships — registry param userId (lowercase i)
	const s2 = await apiStep(ctx, 'user.listUserGroups', 'GET', '/api/ListUserGroups', {
		tenantFilter,
		userId,
	});
	steps.push(s2);
	failFast(s2, failMode);

	// Step 3: Devices — registry param UserID (capital I)
	const s3 = await apiStep(ctx, 'user.listUserDevices', 'GET', '/api/ListUserDevices', {
		tenantFilter,
		UserID: userId,
	});
	steps.push(s3);
	failFast(s3, failMode);

	// Step 4: Mailbox details — registry param UserID (capital I)
	const s4 = await apiStep(ctx, 'user.listUserMailboxDetails', 'GET', '/api/ListUserMailboxDetails', {
		tenantFilter,
		UserID: userId,
	});
	steps.push(s4);
	failFast(s4, failMode);

	// Step 5: Per-user MFA — registry param userId (lowercase i)
	const s5 = await apiStep(ctx, 'user.listPerUserMfa', 'GET', '/api/ListPerUserMFA', {
		tenantFilter,
		userId,
	});
	steps.push(s5);
	failFast(s5, failMode);

	// Step 6: Sign-in logs — registry params UserID (capital I), top hardcoded to 10
	const s6 = await apiStep(ctx, 'user.listUserSigninLogs', 'GET', '/api/ListUserSigninLogs', {
		tenantFilter,
		UserID: userId,
		top: 10,
	});
	steps.push(s6);

	const userArr = toArray(s1.data);

	return {
		composite: 'user360',
		tenantFilter,
		steps,
		result: {
			user: s1.ok ? (userArr[0] ?? null) : null,
			groups: s2.ok ? toArray(s2.data) : null,
			devices: s3.ok ? toArray(s3.data) : null,
			mailbox: s4.ok ? (toArray(s4.data)[0] ?? null) : null,
			mfa: s5.ok ? (toArray(s5.data)[0] ?? null) : null,
			recentSignIns: s6.ok ? toArray(s6.data) : null,
		},
	};
}

async function crossTenantSweep(
	ctx: IExecuteFunctions,
	params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
): Promise<CompositeResult> {
	const composite = params.composite as string;
	const tenantIdsRaw = params.tenantIds as string | string[] | undefined;
	// Support comma-separated string (from UI) or array (from AI Tools path)
	const tenantIds: string[] =
		typeof tenantIdsRaw === 'string'
			? tenantIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
			: Array.isArray(tenantIdsRaw)
			? tenantIdsRaw
			: [];
	const maxTenants = Math.min(
		typeof params.maxTenants === 'number' ? params.maxTenants : 20,
		50,
	);

	const steps: StepResult[] = [];

	// Fetch tenant list
	let allTenants: ITenant[] = [];
	try {
		allTenants = await getTenantList.call(ctx);
		steps.push({ step: 'tenant.getAll', ok: true, data: { count: allTenants.length } });
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		steps.push({ step: 'tenant.getAll', ok: false, error: msg });
		return { composite: 'crossTenantSweep', tenantFilter: '', steps, result: null };
	}

	// Filter and cap
	let tenants = tenantIds.length > 0
		? allTenants.filter(
				(t) =>
					tenantIds.includes(t.customerId) ||
					(t.defaultDomainName !== undefined && tenantIds.includes(t.defaultDomainName)),
			)
		: allTenants;
	tenants = tenants.slice(0, maxTenants);

	const results: Record<string, unknown> = {};
	const errors: Record<string, string> = {};

	for (const tenant of tenants) {
		const tenantId = tenant.defaultDomainName ?? tenant.customerId;
		try {
			const subResult = await executeCompositeInternal(ctx, composite, tenantId, {}, failMode, true);
			results[tenantId] = subResult.result;
			// Tag sub-steps with the tenant domain for traceability
			for (const s of subResult.steps) {
				steps.push({ ...s, step: `${tenantId}:${s.step}` });
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			errors[tenantId] = msg;
		}
	}

	return {
		composite: 'crossTenantSweep',
		tenantFilter: '',
		steps,
		result: {
			tenantsScanned: tenants.length,
			tenantsErrored: Object.keys(errors).length,
			results,
			errors,
		},
	};
}

// ── Internal dispatch (bypasses JSON wrapping — used by crossTenantSweep) ──

async function executeCompositeInternal(
	ctx: IExecuteFunctions,
	operation: string,
	tenantFilter: string,
	params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
	insideSweep: boolean,
): Promise<CompositeResult> {
	if (insideSweep && operation === 'crossTenantSweep') {
		throw new Error('Recursive crossTenantSweep is not allowed');
	}
	if (insideSweep && operation === 'user360') {
		throw new Error('user360 cannot be used as a crossTenantSweep sub-composite');
	}
	switch (operation) {
		case 'licenseAudit':
			return licenseAudit(ctx, tenantFilter, params, failMode);
		case 'securityPosture':
			return securityPosture(ctx, tenantFilter, params, failMode);
		case 'becInvestigation':
			return becInvestigation(ctx, tenantFilter, params, failMode);
		case 'user360':
			return user360(ctx, tenantFilter, params, failMode);
		case 'crossTenantSweep':
			return crossTenantSweep(ctx, params, failMode);
		default:
			throw new Error(`Unknown composite operation: ${operation}`);
	}
}

// ── Public entry point ───────────────────────────────────────────────

/**
 * Execute a composite workflow operation.
 * Returns JSON string compatible with executeAiTool return type.
 * Called from tool-executor.ts (AI Tools path) and actions/workflows.ts (standard node path).
 */
export async function executeComposite(
	context: CompositeContext,
	resource: string,
	operation: string,
	tenantFilter: string,
	params: Record<string, unknown>,
	failMode: 'fast' | 'bestEffort',
): Promise<string> {
	const ctx = context as unknown as IExecuteFunctions;
	try {
		const compositeResult = await executeCompositeInternal(
			ctx,
			operation,
			tenantFilter,
			params,
			failMode,
			false,
		);
		// Include steps array in result for LLM transparency (partial failure visibility)
		const resultWithSteps: Record<string, unknown> = {
			...(compositeResult.result !== null && typeof compositeResult.result === 'object'
				? (compositeResult.result as Record<string, unknown>)
				: { data: compositeResult.result }),
			steps: compositeResult.steps,
		};
		return JSON.stringify(wrapSuccess(resource, operation, resultWithSteps));
	} catch (error) {
		if (error instanceof CompositeStepError) {
			return JSON.stringify(
				wrapError(resource, operation, ERROR_TYPES.API_ERROR, error.message, 'retry', {
					step: error.step,
				}),
			);
		}
		const msg = error instanceof Error ? error.message : String(error);
		return JSON.stringify(
			wrapError(resource, operation, ERROR_TYPES.API_ERROR, msg, 'Check parameters and retry.'),
		);
	}
}
