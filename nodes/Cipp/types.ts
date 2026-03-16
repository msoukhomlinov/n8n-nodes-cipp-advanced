export interface ICippCredentials {
	baseUrl: string;
	tenantId: string;
	clientId: string;
	clientSecret: string;
}

export interface IAuthToken {
	accessToken: string;
	expiresAt: number;
}

export interface ITenant {
	customerId: string;
	defaultDomainName?: string;
	displayName?: string;
	domains?: string[];
}
