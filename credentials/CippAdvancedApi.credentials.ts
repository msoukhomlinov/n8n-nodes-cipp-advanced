import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CippAdvancedApi implements ICredentialType {
	name = 'cippAdvancedApi';
	displayName = 'CIPP Advanced API';
	icon: Icon = 'file:cipp.svg';
	documentationUrl = 'https://docs.cipp.app/api-documentation/setup-and-authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'CIPP Instance URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://cipp.yourdomain.com',
			description: 'The base URL of your CIPP deployment (API URL)',
		},
		{
			displayName: 'Azure AD Tenant ID',
			name: 'tenantId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
			description: 'Your Azure AD Tenant ID (where the CIPP-SAM app registration lives)',
		},
		{
			displayName: 'Application (Client) ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
			description: 'The Application (Client) ID from your CIPP-SAM Azure AD App Registration',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'The Client Secret from your CIPP-SAM Azure AD App Registration',
		},
		{
			displayName: 'Enable Tenant List Cache',
			name: 'enableTenantCache',
			type: 'boolean',
			default: true,
			description:
				'Cache the tenant list to speed up the tenant dropdown. Disable if you need real-time tenant list updates.',
		},
		{
			displayName: 'Tenant Cache TTL (Minutes)',
			name: 'tenantCacheTtl',
			type: 'number',
			typeOptions: { minValue: 1, maxValue: 1440 },
			default: 30,
			displayOptions: {
				show: {
					enableTenantCache: [true],
				},
			},
			description:
				'How long to cache the tenant list in minutes. Newly onboarded tenants won\'t appear in the dropdown until the cache expires or n8n is restarted.',
		},
		{
			displayName: 'Enable Secure Score Cache',
			name: 'enableSecureScoreCache',
			type: 'boolean',
			default: true,
			description:
				'Cache raw Secure Score data per tenant. Allows different output modes to be re-run without re-fetching from the API.',
		},
		{
			displayName: 'Secure Score Cache TTL (Minutes)',
			name: 'secureScoreCacheTtl',
			type: 'number',
			typeOptions: { minValue: 1, maxValue: 1440 },
			default: 60,
			displayOptions: {
				show: {
					enableSecureScoreCache: [true],
				},
			},
			description:
				'How long to cache Secure Score data per tenant in minutes. Cached data is keyed by tenant and history depth ($top), so changing those parameters always triggers a fresh fetch.',
		},
	];

	// Credential testing is handled by the node via credentialTest method
	// This uses our custom OAuth flow to properly authenticate
}
