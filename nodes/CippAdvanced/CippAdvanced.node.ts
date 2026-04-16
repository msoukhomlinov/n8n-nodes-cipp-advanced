import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { getTenantList, normalizeNumericValues } from './GenericFunctions';
import { router } from './actions/router';

import { operationFields, resourceFields } from './descriptions';

export class CippAdvanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CIPP Advanced',
		name: 'cippAdvanced',
		icon: 'file:cipp.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Advanced Microsoft 365 multi-tenant management via CIPP.app (465 operations, 29 resources)',
		defaults: {
			name: 'CIPP Advanced',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'cippAdvancedApi',
				required: true,
				testedBy: 'cippAdvancedApiCredentialTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Alert',
						value: 'alert',
						description: 'Manage alerts and security incidents',
					},
					{
						name: 'Application',
						value: 'application',
						description: 'Manage Intune applications, app approval, and multi-tenant app deployment',
					},
					{
						name: 'Autopilot',
						value: 'autopilot',
						description: 'Manage Autopilot devices',
					},
					{
						name: 'Backup',
						value: 'backup',
						description: 'Manage CIPP backups',
					},
					{
						name: 'CIPP Admin',
						value: 'cippAdmin',
						description: 'CIPP platform settings, setup, and extension management',
					},
					{
						name: 'CIPP Core',
						value: 'cippCore',
						description: 'CIPP version, diagnostics, function management, and GitHub',
					},
					{
						name: 'Conditional Access',
						value: 'conditionalAccess',
						description: 'Manage conditional access policies, templates, and named locations',
					},
					{
						name: 'Contact',
						value: 'contact',
						description: 'Manage Exchange contacts, contact templates, and contact permissions',
					},
					{
						name: 'Device',
						value: 'device',
						description: 'Manage Intune devices',
					},
					{
						name: 'Exchange Resource',
						value: 'exchangeResource',
						description: 'Manage Exchange room mailboxes, room lists, and equipment mailboxes',
					},
					{
						name: 'GDAP',
						value: 'gdap',
						description: 'Manage GDAP partner relationships',
					},
					{
						name: 'Group',
						value: 'group',
						description: 'Manage Azure AD groups',
					},
					{
						name: 'Identity',
						value: 'identity',
						description: 'Manage audit logs, roles, and deleted items',
					},
					{
						name: 'Mailbox',
						value: 'mailbox',
						description: 'Manage Exchange mailboxes and retention policies',
					},
					{
						name: 'OneDrive',
						value: 'onedrive',
						description: 'Provision and manage OneDrive',
					},
					{
						name: 'Policy',
						value: 'policy',
						description: 'Manage Intune policies, assignment filters, scripts, reusable settings, and Defender',
					},
					{
						name: 'Quarantine',
						value: 'quarantine',
						description: 'Manage quarantined email messages',
					},
					{
						name: 'Safe Link',
						value: 'safeLinks',
						description: 'Manage Safe Links policies and templates',
					},
					{
						name: 'Scheduled Item',
						value: 'scheduledItem',
						description: 'Manage scheduled jobs',
					},
					{
						name: 'Spam Filter',
						value: 'spamfilter',
						description: 'Manage spam filters, quarantine policies, allow/block lists, and email protection filters',
					},
					{
						name: 'Standard',
						value: 'standard',
						description: 'Manage tenant standards, BPA, domain analysis, and drift',
					},
					{
						name: 'Team',
						value: 'team',
						description: 'Manage Teams, SharePoint sites, quotas, and settings',
					},
					{
						name: 'Teams Shift',
						value: 'teamsShift',
						description: 'Manage Teams Shifts schedule — shifts, open shifts, groups, time off',
					},
					{
						name: 'Tenant',
						value: 'tenant',
						description: 'List, manage, onboard/offboard tenants, licenses, auth methods, and service health',
					},
					{
						name: 'Tool',
						value: 'tools',
						description: 'Breach search and Graph requests',
					},
					{
						name: 'Transport',
						value: 'transport',
						description: 'Manage Exchange transport rules, connectors, and connection filters',
					},
					{
						name: 'User',
						value: 'user',
						description: 'Manage Azure AD users',
					},
					{
						name: 'Voice',
						value: 'voice',
						description: 'Manage Teams Voice',
					},
					{
						name: 'Workflows',
						value: 'workflows',
						description: 'Multi-step composite workflows: license audit, security posture, BEC investigation, user 360, cross-tenant sweep',
					},
				],
				default: 'tenant',
			},
			...operationFields,
			...resourceFields,
			{
				displayName: 'Normalize Numeric Strings',
				name: 'normalizeNumbers',
				type: 'boolean',
				default: false,
				description: 'Whether to convert string values that contain numbers (e.g. "4") to actual numbers. Useful when the API returns inconsistent types.',
			},
		],
		usableAsTool: true,
	};

	methods = {
		credentialTest: {
			async cippAdvancedApiCredentialTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const creds = credential.data as IDataObject;
				const baseUrl = (creds.baseUrl as string).replace(/\/$/, '');
				const tenantId = creds.tenantId as string;
				const clientId = creds.clientId as string;
				const clientSecret = creds.clientSecret as string;

				// Step 1: Get OAuth token from Azure AD
				let accessToken: string;
				try {
					const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
					const scope = `api://${clientId}/.default`;

					const tokenBody = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=${encodeURIComponent(scope)}`;

					// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions -- httpRequest not available in ICredentialTestFunctions
					const tokenResponse = (await this.helpers.request({
						method: 'POST',
						uri: tokenUrl,
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
						},
						body: tokenBody,
						json: true,
					})) as IDataObject;

					accessToken = tokenResponse.access_token as string;
					if (!accessToken) {
						return {
							status: 'Error',
							message: 'Failed to obtain access token from Azure AD. Check your Tenant ID, Client ID, and Client Secret.',
						};
					}
				} catch (error) {
					const err = error as { message?: string };
					return {
						status: 'Error',
						message: `Authentication failed: ${err.message || 'Could not obtain token from Azure AD. Check Tenant ID, Client ID, and Client Secret.'}`,
					};
				}

				// Step 2: Test API connection with the token
				try {
					// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
					await this.helpers.request({
						method: 'POST',
						uri: `${baseUrl}/api/ListTenants`,
						headers: {
							Authorization: `Bearer ${accessToken}`,
							Accept: 'application/json',
						},
						json: true,
					});

					return {
						status: 'OK',
						message: 'Connection successful!',
					};
				} catch (error) {
					const err = error as { message?: string; statusCode?: number };
					return {
						status: 'Error',
						message: `API connection failed (token OK): ${err.message || 'Could not reach CIPP API. Check your Base URL.'}`,
					};
				}
			},
		},
		listSearch: {
			async tenantSearch(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const tenants = await getTenantList.call(this);

				const results = tenants
					.filter((tenant) => {
						if (!filter) return true;
						const searchTerm = filter.toLowerCase();
						return (
							tenant.displayName?.toLowerCase().includes(searchTerm) ||
							tenant.defaultDomainName?.toLowerCase().includes(searchTerm)
						);
					})
					.map((tenant) => ({
						name: tenant.displayName || tenant.defaultDomainName || '',
						value: tenant.defaultDomainName || '',
						url: `https://portal.azure.com/${tenant.defaultDomainName || ''}`,
					}));

				return { results };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let responseData = await router(this, resource, operation, i);

				const normalizeNumbers = this.getNodeParameter('normalizeNumbers', i, false) as boolean;
				if (normalizeNumbers && responseData) {
					responseData = normalizeNumericValues(responseData);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData as IDataObject[]),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					const executionErrorData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: (error as Error).message }),
						{ itemData: { item: i } },
					);
					returnData.push(...executionErrorData);
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
