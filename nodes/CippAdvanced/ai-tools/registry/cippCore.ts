import type { ResourceConfig } from './types'
import { P, TENANT } from './types'

export const resourceConfig: ResourceConfig = {
	label: 'CIPP Core',
	description: 'CIPP version, diagnostics, functions, and GitHub integration',
	operations: {
		getVersion: {
			method: 'GET',
			endpoint: '/api/GetVersion',
			isWrite: false,
			isList: false,
			tenant: TENANT.none,
			params: {
				LocalVersion: P.qs('Local version'),
			},
			description: 'Get CIPP version',
		},
		getAppStatus: {
			method: 'GET',
			endpoint: '/api/ListAppStatus',
			isWrite: false,
			isList: true,
			tenant: TENANT.qs,
			params: {
				AppFilter: P.qs('App filter'),
			},
			description: 'Get app status',
		},
		getExternalTenantInfo: {
			method: 'GET',
			endpoint: '/api/ListExternalTenantInfo',
			isWrite: false,
			isList: false,
			tenant: TENANT.none,
			params: {
				tenant: P.qs('Tenant domain or ID', true),
			},
			description: 'Get external tenant info',
		},
		testFunction: {
			method: 'GET',
			endpoint: '/api/ListGenericTestFunction',
			isWrite: false,
			isList: false,
			tenant: TENANT.none,
			params: {},
			description: 'Test generic function',
		},
		manageDurableFunctions: {
			method: 'GET',
			endpoint: '/api/ExecDurableFunctions',
			isWrite: true,
			isList: false,
			tenant: TENANT.none,
			params: {
				Action: P.qs('Action'),
				PartitionKey: P.qs('Partition key'),
			},
			description: 'Manage durable functions',
		},
		execCippFunction: {
			method: 'POST',
			endpoint: '/api/ExecCippFunction',
			isWrite: true,
			isList: false,
			tenant: TENANT.none,
			params: {
				FunctionName: P.body('Function name', true),
				Parameters: P.body('Parameters'),
			},
			description: 'Execute CIPP function',
		},
		listFunctionParameters: {
			method: 'GET',
			endpoint: '/api/ListFunctionParameters',
			isWrite: false,
			isList: false,
			tenant: TENANT.none,
			params: {
				Function: P.qs('Function name'),
				Module: P.qs('Module name'),
				Compliance: P.qs('Compliance flag'),
			},
			description: 'List function parameters',
		},
		listFunctionStats: {
			method: 'GET',
			endpoint: '/api/ListFunctionStats',
			isWrite: false,
			isList: true,
			tenant: TENANT.qs,
			params: {
				FunctionType: P.qs('Function type'),
				Interval: P.qs('Interval'),
				Time: P.qs('Time'),
			},
			description: 'List function stats',
		},
		offloadFunctions: {
			method: 'POST',
			endpoint: '/api/ExecOffloadFunctions',
			isWrite: true,
			isList: false,
			tenant: TENANT.none,
			params: {
				Action: P.qs('Action'),
				OffloadFunctions: P.bodyBool('Enable offload'),
			},
			description: 'Offload functions',
		},
		execGitHubAction: {
			method: 'POST',
			endpoint: '/api/ExecGitHubAction',
			isWrite: true,
			isList: false,
			tenant: TENANT.none,
			params: {
				Action: P.body('Action', true),
				repoName: P.body('Repository name'),
				Description: P.body('Description'),
			},
			description: 'Execute GitHub action',
		},
		listGitHubReleaseNotes: {
			method: 'GET',
			endpoint: '/api/ListGitHubReleaseNotes',
			isWrite: false,
			isList: false,
			tenant: TENANT.none,
			params: {
				Owner: P.qs('GitHub owner'),
				Repository: P.qs('Repository name'),
			},
			description: 'List GitHub release notes',
		},
	},
}
