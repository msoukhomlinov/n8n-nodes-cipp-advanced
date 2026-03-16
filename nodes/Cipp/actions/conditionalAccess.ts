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

	if (operation === 'listPolicies') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListConditionalAccessPolicies',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'addPolicy') {
		const templateList = context.getNodeParameter('templateList', i) as string;
		const additionalFields = context.getNodeParameter('addPolicyFields', i, {}) as IDataObject;

		responseData = await postAction(
			context,
			i,
			'/api/AddCAPolicy',
			{
				TemplateList: parseJsonPayload(context.getNode(), templateList, 'Template', i),
				...additionalFields,
			},
		);
	} else if (operation === 'editPolicy') {
		const policyGuid = context.getNodeParameter('policyGuid', i) as string;
		const additionalFields = context.getNodeParameter('editPolicyFields', i, {}) as IDataObject;

		responseData = await postAction(
			context,
			i,
			'/api/EditCAPolicy',
			{
				GUID: policyGuid,
				...additionalFields,
			},
		);
	} else if (operation === 'removePolicy') {
		const policyGuid = context.getNodeParameter('removePolicyGuid', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/RemoveCAPolicy',
			{ GUID: policyGuid },
		);
	} else if (operation === 'addTemplate') {
		const name = context.getNodeParameter('templateName', i) as string;
		const policySource = context.getNodeParameter('policySource', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/AddCATemplate',
			{
				name,
				policySource: parseJsonPayload(context.getNode(), policySource, 'Policy Source', i),
			},
		);
	} else if (operation === 'removeTemplate') {
		// No tenantFilter — uses ID only
		const templateId = context.getNodeParameter('templateId', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/RemoveCATemplate',
			{ ID: templateId },
			{},
		);
	} else if (operation === 'listTemplates') {
		const returnAll = context.getNodeParameter('returnAll', i) as boolean;
		const filters = context.getNodeParameter('listTemplatesFilters', i, {}) as IDataObject;

		const qs: IDataObject = {};
		if (filters.GUID) qs.GUID = filters.GUID;
		if (filters.ID) qs.ID = filters.ID;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListCAtemplates',
			{},
			qs,
		);

		if (Array.isArray(responseData) && !returnAll) {
			const limit = context.getNodeParameter('limit', i) as number;
			responseData = responseData.slice(0, limit);
		}
	} else if (operation === 'addNamedLocation') {
		// Uses selectedTenants instead of tenantFilter — direct cippApiRequest
		const tenantFilter = getTenantFilter(context, i);
		const policyName = context.getNodeParameter('policyName', i) as string;
		const locationType = context.getNodeParameter('locationType', i) as string;
		const additionalFields = context.getNodeParameter('namedLocationFields', i, {}) as IDataObject;

		const body: IDataObject = {
			selectedTenants: tenantFilter,
			policyName,
			Type: locationType,
		};

		if (additionalFields.Countries) {
			body.Countries = parseJsonPayload(
				context.getNode(),
				additionalFields.Countries,
				'Countries',
				i,
			);
		}
		if (additionalFields.includeUnknownCountriesAndRegions !== undefined) {
			body.includeUnknownCountriesAndRegions = additionalFields.includeUnknownCountriesAndRegions;
		}
		if (additionalFields.Ips) body.Ips = additionalFields.Ips;
		if (additionalFields.Trusted !== undefined) body.Trusted = additionalFields.Trusted;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddNamedLocation',
			body,
			{},
		);
	} else if (operation === 'editNamedLocation') {
		// ExecNamedLocation uses query params
		const tenantFilter = getTenantFilter(context, i);
		const namedLocationId = context.getNodeParameter('namedLocationId', i) as string;
		const change = context.getNodeParameter('change', i) as string;
		const input = context.getNodeParameter('input', i, '') as string;

		const qs: IDataObject = {
			tenantFilter,
			namedLocationId,
			change,
		};
		if (input) qs.input = input;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecNamedLocation',
			{},
			qs,
		);
	} else if (operation === 'checkPolicy') {
		const userID = context.getNodeParameter('userID', i) as string;
		const additionalFields = context.getNodeParameter('checkPolicyFields', i, {}) as IDataObject;

		const body: IDataObject = { userID };

		// Parse LabelValue JSON fields
		const labelValueFields = [
			'ClientAppType',
			'Country',
			'DevicePlatform',
			'IncludeApplications',
			'SignInRiskLevel',
			'UserRiskLevel',
		];
		for (const field of labelValueFields) {
			if (additionalFields[field]) {
				body[field] = parseJsonPayload(
					context.getNode(),
					additionalFields[field],
					field,
					i,
				);
			}
		}
		if (additionalFields.IpAddress) body.IpAddress = additionalFields.IpAddress;

		responseData = await postAction(
			context,
			i,
			'/api/ExecCACheck',
			body,
		);
	} else if (operation === 'addExclusion') {
		const userID = context.getNodeParameter('exclusionUserId', i) as string;
		const policyId = context.getNodeParameter('exclusionPolicyId', i) as string;
		const additionalFields = context.getNodeParameter('exclusionFields', i, {}) as IDataObject;

		const body: IDataObject = {
			UserID: userID,
			PolicyId: policyId,
		};

		// Copy simple fields
		const simpleFields = [
			'EndDate',
			'StartDate',
			'excludeLocationAuditAlerts',
			'ExclusionType',
			'reference',
			'Username',
			'vacation',
			'value',
			'addedFields',
		];
		for (const field of simpleFields) {
			if (additionalFields[field] !== undefined && additionalFields[field] !== '') {
				body[field] = additionalFields[field];
			}
		}

		// Parse JSON array fields
		if (additionalFields.Users) {
			body.Users = parseJsonPayload(context.getNode(), additionalFields.Users, 'Users', i);
		}
		if (additionalFields.postExecution) {
			body.postExecution = parseJsonPayload(
				context.getNode(),
				additionalFields.postExecution,
				'Post Execution',
				i,
			);
		}

		responseData = await postAction(
			context,
			i,
			'/api/ExecCAExclusion',
			body,
		);
	} else if (operation === 'addServiceExclusion') {
		const guid = context.getNodeParameter('serviceExclusionGuid', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/ExecCAServiceExclusion',
			{ GUID: guid },
		);
	} else if (operation === 'listNamedLocations') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListNamedLocations',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'listPolicyChanges') {
		const tenantFilter = getTenantFilter(context, i);
		const filters = context.getNodeParameter('policyChangesFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.displayName) qs.displayName = filters.displayName;
		if (filters.id) qs.id = filters.id;

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListConditionalAccessPolicyChanges',
			{},
			qs,
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, {
			itemIndex: i,
		});
	}

	return responseData;
}
