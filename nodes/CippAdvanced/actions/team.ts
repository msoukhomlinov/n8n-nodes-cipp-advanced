import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { cippApiRequest, getTenantFilter, listWithSlice, postAction, parseJsonPayload } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};
	const tenantFilter = getTenantFilter(context, i);

	if (operation === 'getAll') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListTeams',
			{},
			{ tenantFilter, type: 'list' },
		);
	} else if (operation === 'add') {
		const displayName = context.getNodeParameter('displayName', i) as string;
		const teamDescription = context.getNodeParameter('teamDescription', i) as string;
		const owner = context.getNodeParameter('owner', i) as string;
		const visibility = context.getNodeParameter('visibility', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddTeam',
			{
				tenantid: tenantFilter,
				displayName,
				description: teamDescription,
				owner,
				visibility,
			},
			{},
		);
	} else if (operation === 'getSites') {
		const siteType = context.getNodeParameter('siteType', i) as string;

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListSites',
			{},
			{ tenantFilter, Type: siteType },
		);
	} else if (operation === 'addSite') {
		const siteName = context.getNodeParameter('siteName', i) as string;
		const siteDescription = context.getNodeParameter('siteDescription', i) as string;
		const siteOwner = context.getNodeParameter('siteOwner', i) as string;
		const templateName = context.getNodeParameter('templateName', i) as string;

		const body: IDataObject = {
			siteName,
			siteDescription,
			siteOwner,
			templateName,
		};

		if (templateName === 'communication') {
			const siteDesign = context.getNodeParameter('siteDesign', i) as string;
			body.siteDesign = siteDesign;
		}

		responseData = await postAction(
			context,
			i,
			'/api/AddSite',
			body,
		);
	} else if (operation === 'getActivity') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListTeamsActivity',
			{},
			{ tenantFilter, Type: 'TeamsUserActivityUser' },
		);
	} else if (operation === 'manageSiteMember') {
		const siteUrl = context.getNodeParameter('siteUrl', i) as string;
		const action = context.getNodeParameter('memberAction', i) as string;
		const siteUser = context.getNodeParameter('siteUser', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/ExecSetSharePointMember',
			{
				URL: siteUrl,
				Add: action === 'add',
				user: siteUser,
			},
		);
	} else if (operation === 'manageSitePermissions') {
		const siteUrl = context.getNodeParameter('siteUrl', i) as string;
		const removePermission = context.getNodeParameter('removePermission', i) as boolean;
		const siteUser = context.getNodeParameter('siteUser', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/ExecSharePointPerms',
			{
				URL: siteUrl,
				RemovePermission: removePermission,
				user: siteUser,
			},
		);
	} else if (operation === 'deleteSite') {
		const siteOptions = context.getNodeParameter('deleteSiteOptions', i, {}) as IDataObject;
		const body: IDataObject = {};

		if (siteOptions.SiteId) body.SiteId = siteOptions.SiteId;

		responseData = await postAction(
			context,
			i,
			'/api/DeleteSharepointSite',
			body,
		);
	} else if (operation === 'getAdminUrl') {
		const qs: IDataObject = { tenantFilter };
		const adminUrlOptions = context.getNodeParameter('adminUrlOptions', i, {}) as IDataObject;

		if (adminUrlOptions.ReturnUrl) qs.ReturnUrl = adminUrlOptions.ReturnUrl;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListSharepointAdminUrl',
			{},
			qs,
		);
	} else if (operation === 'getSharepointQuota') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListSharepointQuota',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'getSharepointSettings') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListSharepointSettings',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'addSitesBulk') {
		const sitesConfig = context.getNodeParameter('sitesConfig', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/AddSiteBulk',
			{
				bulkSites: parseJsonPayload(context.getNode(), sitesConfig, 'Sites Config', i),
			},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}
