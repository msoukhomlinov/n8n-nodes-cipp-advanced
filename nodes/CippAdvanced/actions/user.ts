import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	buildOdataQuery,
	cippApiRequest,
	getTenantFilter,
	listWithSlice,
	parseJsonObjectPayload,
	parseJsonPayload,
	postAction,
} from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};
	const tenantFilter = getTenantFilter(context, i);

	if (operation === 'getAll') {
		const returnAll = context.getNodeParameter('returnAll', i) as boolean;
		const userFields = context.getNodeParameter('userFields', i, []) as string[];
		const filters = context.getNodeParameter('filters', i, {}) as IDataObject;

		const selectParts: string[] = [];
		if (userFields.length > 0) {
			selectParts.push(userFields.join(','));
		}
		if (filters.select) {
			selectParts.push(filters.select as string);
		}

		const qs = buildOdataQuery(
			{ tenantFilter, Endpoint: 'users' },
			{
				select: selectParts.length > 0 ? selectParts.join(',') : undefined,
				filter: filters.filter as string | undefined,
				top: !returnAll ? (context.getNodeParameter('limit', i) as number) : undefined,
			},
		);

		responseData = await cippApiRequest.call(context, 'GET', '/api/ListGraphRequest', {}, qs);

		if (Array.isArray(responseData) && !returnAll) {
			const limit = context.getNodeParameter('limit', i) as number;
			responseData = responseData.slice(0, limit);
		}
	} else if (operation === 'add') {
		const givenName = context.getNodeParameter('firstName', i) as string;
		const surname = context.getNodeParameter('lastName', i) as string;
		const domain = context.getNodeParameter('domain', i) as string;
		const additionalFields = context.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body: IDataObject = {
			tenantFilter,
			givenName,
			surname,
			PrimDomain: domain,
			...additionalFields,
		};

		// Map DisplayName to the correct API field name
		if (body.displayName) {
			body.DisplayName = body.displayName;
			delete body.displayName;
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddUser',
			body,
			{},
		);
	} else if (operation === 'edit') {
		const userId = context.getNodeParameter('userId', i) as string;
		const editFields = context.getNodeParameter('editFields', i, {}) as IDataObject;

		const body: IDataObject = {
			tenantFilter,
			id: userId,
			...editFields,
		};

		// Parse JSON array fields
		for (const key of ['AddToGroups', 'RemoveFromGroups', 'licenses']) {
			if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') {
				body[key] = parseJsonPayload(context.getNode(), body[key] as string, key, i);
			}
		}

		// Parse JSON LabelValue object fields
		for (const key of ['setManager', 'setSponsor']) {
			if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') {
				body[key] = parseJsonObjectPayload(context.getNode(), body[key] as string, key, i);
			}
		}

		responseData = await cippApiRequest.call(context, 'PATCH', '/api/EditUser', body, {});

	} else if (operation === 'disable' || operation === 'enable') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/ExecDisableUser', {
			ID: userId,
			Enable: operation === 'enable' ? 'true' : 'false',
		});
	} else if (operation === 'resetPassword') {
		const userId = context.getNodeParameter('userId', i) as string;
		const options = context.getNodeParameter('passwordOptions', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecResetPass', {
			ID: userId,
			MustChange: options.mustChangePass !== false,
		});
	} else if (operation === 'remove') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/RemoveUser', {
			ID: userId,
		});
	} else if (operation === 'resetMfa') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/ExecResetMFA', {
			ID: userId,
		});
	} else if (operation === 'sendMfaPush') {
		// Uses TenantFilter (PascalCase) — cannot use postAction
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecSendPush',
			{
				TenantFilter: tenantFilter,
				UserEmail: userId,
			},
			{},
		);
	} else if (operation === 'setPerUserMfa') {
		const userId = context.getNodeParameter('userId', i) as string;
		const mfaState = context.getNodeParameter('mfaState', i) as string;

		responseData = await postAction(context, i, '/api/ExecPerUserMFA', {
			userId,
			State: mfaState,
		});
	} else if (operation === 'createTap') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/ExecCreateTAP', {
			ID: userId,
		});
	} else if (operation === 'clearImmutableId') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/ExecClrImmId', {
			ID: userId,
		});
	} else if (operation === 'revokeSessions') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/ExecRevokeSessions', {
			ID: userId,
		});
	} else if (operation === 'offboard') {
		const users = context.getNodeParameter('usersToOffboard', i) as string;
		const scheduled = context.getNodeParameter('scheduledOffboard', i) as boolean;
		const offboardOptions = context.getNodeParameter('offboardOptions', i, {}) as IDataObject;

		const body: IDataObject = {
			tenantFilter,
			user: parseJsonPayload(context.getNode(), users, 'Users to Offboard', i),
			Scheduled: {
				enabled: scheduled,
			},
		};

		// Add offboard boolean flags
		const offboardFlags = [
			'ConvertToShared',
			'RevokeSessions',
			'RemoveLicenses',
			'DisableSignIn',
			'ResetPass',
			'RemoveGroups',
			'HideFromGAL',
			'DeleteUser',
		];
		for (const flag of offboardFlags) {
			if (offboardOptions[flag] !== undefined) {
				body[flag] = offboardOptions[flag];
			}
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecOffboardUser',
			body,
			{},
		);
	} else if (operation === 'listInactiveAccounts') {
		const inactiveFilters = context.getNodeParameter('inactiveFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (inactiveFilters.InactiveDays) {
			qs.InactiveDays = inactiveFilters.InactiveDays;
		}

		responseData = await listWithSlice(context, i, 'GET', '/api/ListInactiveAccounts', {}, qs,
		);
	} else if (operation === 'listSignIns') {
		const signInFilters = context.getNodeParameter('signInFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (signInFilters.Days) {
			qs.Days = signInFilters.Days;
		}
		if (signInFilters.failedLogonsOnly) {
			qs.failedLogonsOnly = signInFilters.failedLogonsOnly;
		}

		responseData = await listWithSlice(context, i, 'GET', '/api/ListSignIns', {}, qs,
		);
	} else if (operation === 'listMfaUsers') {
		responseData = await listWithSlice(context, i, 'GET', '/api/ListMFAUsers', {}, { tenantFilter },
		);
	} else if (operation === 'dismissRiskyUser') {
		const userId = context.getNodeParameter('userId', i) as string;

		responseData = await postAction(context, i, '/api/ExecDismissRiskyUser', {
			userId,
		});
	} else if (operation === 'listJitAdmin') {
		responseData = await listWithSlice(context, i, 'GET', '/api/ListJITAdmin', {}, { tenantFilter },
		);
	} else if (operation === 'execJitAdmin') {
		const userAction = context.getNodeParameter('userAction', i) as string;
		const adminRoles = context.getNodeParameter('AdminRoles', i) as string;
		const startDate = context.getNodeParameter('StartDate', i) as string;
		const endDate = context.getNodeParameter('EndDate', i) as string;
		const expireAction = context.getNodeParameter('ExpireAction', i) as string;
		const useTap = context.getNodeParameter('UseTAP', i) as boolean;
		const jitAdditionalFields = context.getNodeParameter('jitAdditionalFields', i, {}) as IDataObject;

		const body: IDataObject = {
			tenantFilter,
			userAction,
			AdminRoles: adminRoles,
			StartDate: startDate,
			EndDate: endDate,
			ExpireAction: expireAction,
			UseTAP: useTap,
		};

		if (userAction === 'select') {
			const existingUser = context.getNodeParameter('userId', i) as string;
			body.existingUser = existingUser;
		}

		Object.assign(body, jitAdditionalFields);

		// Parse LabelValue JSON fields per spec
		for (const key of ['AdminRoles', 'Domain', 'existingUser', 'ExpireAction', 'jitAdminTemplate']) {
			if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') {
				body[key] = parseJsonObjectPayload(context.getNode(), body[key] as string, key, i);
			}
		}

		// Parse PostExecution array field
		if (typeof body.PostExecution === 'string' && (body.PostExecution as string).trim() !== '') {
			body.PostExecution = parseJsonPayload(
				context.getNode(), body.PostExecution as string, 'PostExecution', i,
			);
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecJITAdmin',
			body,
			{},
		);

	// ── New operations (TODO-14f) ──

	} else if (operation === 'addGuest') {
		const displayName = context.getNodeParameter('guestDisplayName', i) as string;
		const mail = context.getNodeParameter('guestMail', i) as string;
		const guestOptions = context.getNodeParameter('guestOptions', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/AddGuest', {
			displayName,
			mail,
			...guestOptions,
		});

	} else if (operation === 'addUserBulk') {
		const bulkUser = context.getNodeParameter('BulkUser', i) as string;
		const bulkOptions = context.getNodeParameter('bulkUserOptions', i, {}) as IDataObject;

		const body: IDataObject = {
			tenantFilter,
			BulkUser: parseJsonPayload(context.getNode(), bulkUser, 'BulkUser', i),
		};

		if (typeof bulkOptions.usageLocation === 'string' && bulkOptions.usageLocation.trim() !== '') {
			body.usageLocation = parseJsonObjectPayload(
				context.getNode(), bulkOptions.usageLocation as string, 'usageLocation', i,
			);
		}
		if (typeof bulkOptions.licenses === 'string' && bulkOptions.licenses.trim() !== '') {
			body.licenses = (bulkOptions.licenses as string).split(',').map((s) => s.trim());
		}

		responseData = await cippApiRequest.call(context, 'POST', '/api/AddUserBulk', body, {});

	} else if (operation === 'execBecCheck') {
		const becFilters = context.getNodeParameter('becCheckFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		for (const key of ['GUID', 'userid', 'userName', 'overwrite']) {
			if (becFilters[key]) {
				qs[key] = becFilters[key];
			}
		}

		responseData = await cippApiRequest.call(context, 'GET', '/api/ExecBECCheck', {}, qs);

	} else if (operation === 'execBecRemediate') {
		const becFields = context.getNodeParameter('becRemediateFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecBECRemediate', {
			...becFields,
		});

	} else if (operation === 'triggerBulkLicense') {
		responseData = await cippApiRequest.call(context, 'GET', '/api/ExecBulkLicense', {}, {});

	} else if (operation === 'setPasswordNeverExpires') {
		const fields = context.getNodeParameter('passwordNeverExpiresFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecPasswordNeverExpires', {
			...fields,
		});

	} else if (operation === 'reprocessLicenses') {
		const fields = context.getNodeParameter('reprocessLicensesFields', i, {}) as IDataObject;

		const body: IDataObject = { tenantFilter, ...fields };

		responseData = await cippApiRequest.call(
			context, 'POST', '/api/ExecReprocessUserLicenses', body, {},
		);

	} else if (operation === 'setUserPhoto') {
		const photoAction = context.getNodeParameter('photoAction', i) as string;
		const photoFields = context.getNodeParameter('userPhotoFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecSetUserPhoto', {
			action: photoAction,
			...photoFields,
		});

	} else if (operation === 'listUserCaPolicies') {
		const filters = context.getNodeParameter('userListFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.UserID) qs.UserID = filters.UserID;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserConditionalAccessPolicies', {}, qs,
		);

	} else if (operation === 'listUserCounts') {
		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserCounts', {}, { tenantFilter },
		);

	} else if (operation === 'listUserDevices') {
		const filters = context.getNodeParameter('userListFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.UserID) qs.UserID = filters.UserID;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserDevices', {}, qs,
		);

	} else if (operation === 'listUserGroups') {
		const filters = context.getNodeParameter('userGroupsFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.userId) qs.userId = filters.userId;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserGroups', {}, qs,
		);

	} else if (operation === 'listUserMailboxDetails') {
		const filters = context.getNodeParameter('userListFilters', i, {}) as IDataObject;
		const mailFilter = context.getNodeParameter('userMailFilter', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.UserID) qs.UserID = filters.UserID;
		if (mailFilter.userMail) qs.userMail = mailFilter.userMail;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserMailboxDetails', {}, qs,
		);

	} else if (operation === 'listUserMailboxRules') {
		const filter = context.getNodeParameter('mailboxRulesFilter', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filter.userID) qs.UserID = filter.userID;
		if (filter.userEmail) qs.userEmail = filter.userEmail;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserMailboxRules', {}, qs,
		);

	} else if (operation === 'listUserSettings') {
		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserSettings', {}, { tenantFilter },
		);

	} else if (operation === 'listPerUserMfa') {
		const filters = context.getNodeParameter('perUserMfaFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.userId) qs.userId = filters.userId;
		if (filters.allUsers) qs.allUsers = filters.allUsers;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListPerUserMFA', {}, qs,
		);

	} else if (operation === 'listTrustedBlockedSenders') {
		const filters = context.getNodeParameter('userListFilters', i, {}) as IDataObject;
		const upnFilter = context.getNodeParameter('trustedBlockedUpnFilter', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.UserID) qs.UserID = filters.UserID;
		if (upnFilter.userPrincipalName) qs.userPrincipalName = upnFilter.userPrincipalName;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserTrustedBlockedSenders', {}, qs,
		);

	} else if (operation === 'removeTrustedBlockedSender') {
		const typeProperty = context.getNodeParameter('senderType', i) as string;
		const value = context.getNodeParameter('senderValue', i) as string;
		const userPrincipalName = context.getNodeParameter('senderUpn', i) as string;

		responseData = await postAction(context, i, '/api/RemoveTrustedBlockedSender', {
			typeProperty,
			value,
			userPrincipalName,
		});

	} else if (operation === 'addJitTemplate') {
		const templateName = context.getNodeParameter('jitTemplateName', i) as string;
		const templateFields = context.getNodeParameter('jitTemplateFields', i, {}) as IDataObject;

		const body: IDataObject = { templateName, ...templateFields };

		// Parse LabelValue JSON fields
		for (const key of [
			'defaultDomain', 'defaultDuration', 'defaultExistingUser',
			'defaultExpireAction', 'defaultRoles',
		]) {
			if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') {
				body[key] = parseJsonObjectPayload(context.getNode(), body[key] as string, key, i);
			}
		}

		// Parse notification actions array
		if (typeof body.defaultNotificationActions === 'string' && (body.defaultNotificationActions as string).trim() !== '') {
			body.defaultNotificationActions = parseJsonPayload(
				context.getNode(), body.defaultNotificationActions as string, 'defaultNotificationActions', i,
			);
		}

		responseData = await postAction(context, i, '/api/AddJITAdminTemplate', body);

	} else if (operation === 'editJitTemplate') {
		const templateName = context.getNodeParameter('jitTemplateName', i) as string;
		const guid = context.getNodeParameter('jitTemplateGuid', i) as string;
		const templateFields = context.getNodeParameter('jitTemplateFields', i, {}) as IDataObject;

		const body: IDataObject = { templateName, GUID: guid, ...templateFields };

		// Parse LabelValue JSON fields
		for (const key of [
			'defaultDomain', 'defaultDuration', 'defaultExistingUser',
			'defaultExpireAction', 'defaultRoles',
		]) {
			if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') {
				body[key] = parseJsonObjectPayload(context.getNode(), body[key] as string, key, i);
			}
		}

		// Parse notification actions array
		if (typeof body.defaultNotificationActions === 'string' && (body.defaultNotificationActions as string).trim() !== '') {
			body.defaultNotificationActions = parseJsonPayload(
				context.getNode(), body.defaultNotificationActions as string, 'defaultNotificationActions', i,
			);
		}

		responseData = await postAction(context, i, '/api/EditJITAdminTemplate', body);

	} else if (operation === 'removeJitTemplate') {
		const templateId = context.getNodeParameter('jitRemoveId', i) as string;

		responseData = await cippApiRequest.call(
			context, 'POST', '/api/RemoveJITAdminTemplate', { ID: templateId }, {},
		);

	} else if (operation === 'listJitTemplates') {
		// POST method but tenantFilter as QS — cannot use postAction
		const filters = context.getNodeParameter('jitTemplateListFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.GUID) qs.GUID = filters.GUID;
		if (filters.includeAllTenants) qs.includeAllTenants = filters.includeAllTenants;

		responseData = await listWithSlice(context, i, 'POST', '/api/ListJITAdminTemplates', {}, qs,
		);

	// ── New operations (ListUsers, EditUserAliases, ListUserPhoto, ListUserSigninLogs, PatchUser, AddUserDefaults, RemoveUserDefaultTemplate, ListNewUserDefaults) ──

	} else if (operation === 'listUsers') {
		const filters = context.getNodeParameter('listUsersFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.graphFilter) qs.graphFilter = filters.graphFilter;
		if (filters.IncludeLogonDetails) qs.IncludeLogonDetails = filters.IncludeLogonDetails;
		if (filters.UserID) qs.UserID = filters.UserID;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUsers', {}, qs);

	} else if (operation === 'editUserAliases') {
		const aliasUserId = context.getNodeParameter('aliasUserId', i) as string;
		const aliasFields = context.getNodeParameter('aliasFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/EditUserAliases', {
			id: aliasUserId,
			...aliasFields,
		});

	} else if (operation === 'listUserPhoto') {
		const filters = context.getNodeParameter('listUserPhotoFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.UserID) qs.UserID = filters.UserID;

		responseData = await cippApiRequest.call(context, 'GET', '/api/ListUserPhoto', {}, qs);

	} else if (operation === 'listUserSigninLogs') {
		const filters = context.getNodeParameter('listUserSigninLogsFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.top) qs.top = filters.top;
		if (filters.UserID) qs.UserID = filters.UserID;

		responseData = await listWithSlice(context, i, 'GET', '/api/ListUserSigninLogs', {}, qs);

	} else if (operation === 'patchUser') {
		const patchUserId = context.getNodeParameter('patchUserId', i) as string;
		const patchFields = context.getNodeParameter('patchFields', i, {}) as IDataObject;

		const body: IDataObject = {
			tenantFilter,
			id: patchUserId,
			...patchFields,
		};

		responseData = await cippApiRequest.call(context, 'PATCH', '/api/PatchUser', body, {});

	} else if (operation === 'addUserDefaults') {
		const fields = context.getNodeParameter('addUserDefaultsFields', i, {}) as IDataObject;

		const body: IDataObject = { tenantFilter, ...fields };

		// Parse LabelValue JSON fields
		for (const key of ['copyFrom', 'primDomain', 'setManager', 'setSponsor', 'usageLocation']) {
			if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') {
				body[key] = parseJsonObjectPayload(context.getNode(), body[key] as string, key, i);
			}
		}

		// Parse licenses as comma-separated array
		if (typeof body.licenses === 'string' && (body.licenses as string).trim() !== '') {
			body.licenses = (body.licenses as string).split(',').map((s) => s.trim());
		}

		// Parse otherMails as comma-separated array
		if (typeof body.otherMails === 'string' && (body.otherMails as string).trim() !== '') {
			body.otherMails = (body.otherMails as string).split(',').map((s) => s.trim());
		}

		responseData = await cippApiRequest.call(context, 'POST', '/api/AddUserDefaults', body, {});

	} else if (operation === 'removeUserDefaultTemplate') {
		const templateId = context.getNodeParameter('removeUserDefaultTemplateId', i) as string;

		responseData = await cippApiRequest.call(
			context, 'POST', '/api/RemoveUserDefaultTemplate', { ID: templateId }, {},
		);

	} else if (operation === 'listUsersAndGroups') {
		responseData = await listWithSlice(context, i, 'GET', '/api/ListUsersAndGroups', {}, { tenantFilter },
		);

	} else if (operation === 'listNewUserDefaults') {
		// POST method but tenantFilter as QS — cannot use postAction
		const filters = context.getNodeParameter('listNewUserDefaultsFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.ID) qs.ID = filters.ID;
		if (filters.includeAllTenants) qs.includeAllTenants = filters.includeAllTenants;

		const body: IDataObject = {};
		if (filters.includeAllTenants) body.includeAllTenants = filters.includeAllTenants;

		responseData = await listWithSlice(context, i, 'POST', '/api/ListNewUserDefaults', body, qs);

	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}
