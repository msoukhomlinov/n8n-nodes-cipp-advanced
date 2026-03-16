import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	cippApiRequest,
	getTenantFilter,
	listWithSlice,
	parseJsonPayload,
	postAction,
} from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	// ══════════════════════════════════════════════════════════════
	// Safe Links Policies
	// ══════════════════════════════════════════════════════════════

	if (operation === 'listPolicies') {
		const tenantFilter = getTenantFilter(context, i);
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListSafeLinksPolicy',
			{},
			{ tenantFilter },
		);

	} else if (operation === 'getPolicyDetails') {
		const tenantFilter = getTenantFilter(context, i);
		const qs: IDataObject = {};
		const filters = context.getNodeParameter(
			'getPolicyDetailsFilters', i, {},
		) as IDataObject;
		if (filters.PolicyName) qs.PolicyName = filters.PolicyName;
		if (filters.RuleName) qs.RuleName = filters.RuleName;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ListSafeLinksPolicyDetails',
			{ tenantFilter },
			qs,
		);

	} else if (operation === 'addPolicy') {
		const tenantFilter = getTenantFilter(context, i);
		const PolicyName = context.getNodeParameter('policyName', i) as string;
		const body: IDataObject = { tenantFilter, PolicyName };
		const fields = context.getNodeParameter('addPolicyFields', i, {}) as IDataObject;
		assignPolicyFields(body, fields);
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecNewSafeLinksPolicy',
			body,
			{},
		);

	} else if (operation === 'editPolicy') {
		const tenantFilter = getTenantFilter(context, i);
		const PolicyName = context.getNodeParameter('policyName', i) as string;
		const body: IDataObject = { tenantFilter, PolicyName };
		const fields = context.getNodeParameter('editPolicyFields', i, {}) as IDataObject;
		assignPolicyFields(body, fields);
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/EditSafeLinksPolicy',
			body,
			{},
		);

	} else if (operation === 'deletePolicy') {
		const PolicyName = context.getNodeParameter('policyName', i) as string;
		const body: IDataObject = { PolicyName };
		const fields = context.getNodeParameter('deletePolicyFields', i, {}) as IDataObject;
		if (fields.RuleName) body.RuleName = fields.RuleName;
		responseData = await postAction(
			context,
			i,
			'/api/ExecDeleteSafeLinksPolicy',
			body,
		);

	// ══════════════════════════════════════════════════════════════
	// Safe Links Policy Templates
	// ══════════════════════════════════════════════════════════════

	} else if (operation === 'listTemplates') {
		const qs: IDataObject = {};
		const filters = context.getNodeParameter(
			'listTemplatesFilters', i, {},
		) as IDataObject;
		if (filters.id) qs.id = filters.id;
		const returnAll = context.getNodeParameter('returnAll', i) as boolean;
		const result = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListSafeLinksPolicyTemplates',
			{},
			qs,
		);
		if (!Array.isArray(result) && result !== null && typeof result === 'object') {
			const obj = result as IDataObject;
			if (obj.error || obj.Error) {
				throw new NodeOperationError(context.getNode(), (obj.error || obj.Error) as string, { itemIndex: i });
			}
		}
		const items = Array.isArray(result) ? result : [result as IDataObject];
		if (returnAll) {
			responseData = items;
		} else {
			const limit = context.getNodeParameter('limit', i) as number;
			responseData = items.slice(0, limit);
		}

	} else if (operation === 'getTemplateDetails') {
		const qs: IDataObject = {};
		const filters = context.getNodeParameter(
			'getTemplateDetailsFilters', i, {},
		) as IDataObject;
		if (filters.ID) qs.ID = filters.ID;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ListSafeLinksPolicyTemplateDetails',
			{},
			qs,
		);

	} else if (operation === 'addTemplate') {
		const fields = context.getNodeParameter('addTemplateFields', i, {}) as IDataObject;
		const body: IDataObject = {};
		for (const key of [
			'TemplateName', 'TemplateDescription', 'PolicyName',
			'AdminDisplayName', 'Name', 'Description',
		]) {
			if (fields[key]) body[key] = fields[key];
		}
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddSafeLinksPolicyTemplate',
			body,
			{},
		);

	} else if (operation === 'createTemplate') {
		const tenantFilter = getTenantFilter(context, i);
		const TemplateName = context.getNodeParameter('templateName', i) as string;
		const body: IDataObject = { tenantFilter, TemplateName };
		const fields = context.getNodeParameter('createTemplateFields', i, {}) as IDataObject;
		assignPolicyFields(body, fields);
		if (fields.TemplateDescription) body.TemplateDescription = fields.TemplateDescription;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/CreateSafeLinksPolicyTemplate',
			body,
			{},
		);

	} else if (operation === 'editTemplate') {
		const tenantFilter = getTenantFilter(context, i);
		const ID = context.getNodeParameter('templateID', i) as string;
		const body: IDataObject = { tenantFilter, ID };
		const fields = context.getNodeParameter('editTemplateFields', i, {}) as IDataObject;
		assignPolicyFields(body, fields);
		if (fields.TemplateName) body.TemplateName = fields.TemplateName;
		if (fields.TemplateDescription) body.TemplateDescription = fields.TemplateDescription;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/EditSafeLinksPolicyTemplate',
			body,
			{},
		);

	} else if (operation === 'removeTemplate') {
		const ID = context.getNodeParameter('templateID', i) as string;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/RemoveSafeLinksPolicyTemplate',
			{ ID },
			{},
		);

	// ══════════════════════════════════════════════════════════════
	// Template Deployment
	// ══════════════════════════════════════════════════════════════

	} else if (operation === 'deployFromTemplate') {
		const tenantFilter = getTenantFilter(context, i);
		const TemplateList = parseJsonPayload(
			context.getNode(),
			context.getNodeParameter('templateList', i) as string,
			'Template List',
			i,
		);
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddSafeLinksPolicyFromTemplate',
			{ selectedTenants: tenantFilter, TemplateList },
			{},
		);

	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, {
			itemIndex: i,
		});
	}

	return responseData;
}

/**
 * Assigns shared Safe Links policy fields from a collection to the request body.
 * Handles booleans, strings, integers, and array fields.
 */
function assignPolicyFields(body: IDataObject, fields: IDataObject): void {
	// Boolean settings
	for (const key of [
		'EnableSafeLinksForEmail', 'EnableSafeLinksForTeams', 'EnableSafeLinksForOffice',
		'TrackClicks', 'AllowClickThrough', 'ScanUrls', 'EnableForInternalSenders',
		'DeliverMessageAfterScan', 'DisableUrlRewrite', 'EnableOrganizationBranding', 'State',
	]) {
		if (fields[key] !== undefined) body[key] = fields[key];
	}

	// String settings
	for (const key of [
		'RuleName', 'AdminDisplayName', 'CustomNotificationText', 'Comments', 'PolicyName',
	]) {
		if (fields[key]) body[key] = fields[key];
	}

	// Integer settings
	if (fields.Priority !== undefined && fields.Priority !== '') {
		body.Priority = fields.Priority;
	}

	// Comma-separated → array fields (rule scoping)
	for (const key of [
		'DoNotRewriteUrls', 'SentTo', 'SentToMemberOf', 'RecipientDomainIs',
		'ExceptIfSentTo', 'ExceptIfSentToMemberOf', 'ExceptIfRecipientDomainIs',
	]) {
		if (fields[key]) {
			const val = fields[key] as string;
			body[key] = val.split(',').map((s) => s.trim()).filter(Boolean);
		}
	}
}
