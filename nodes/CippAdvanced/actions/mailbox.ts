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
	const tenantFilter = getTenantFilter(context, i);

	// ── List Operations ────────────────────────────────────────────────

	if (operation === 'listMailboxes') {
		return listWithSlice(context, i, 'GET', '/api/ListMailboxes', {}, { tenantFilter });
	}

	if (operation === 'listMailboxPermissions') {
		const qs: IDataObject = { tenantFilter };
		const filterUserId = context.getNodeParameter('listUserId', i, '') as string;
		if (filterUserId) qs.userId = filterUserId;
		return listWithSlice(context, i, 'GET', '/api/ListmailboxPermissions', {}, qs);
	}

	if (operation === 'listCalendarPermissions') {
		const qs: IDataObject = { tenantFilter };
		const filterUserId = context.getNodeParameter('listUserId', i, '') as string;
		if (filterUserId) qs.UserID = filterUserId;
		return listWithSlice(context, i, 'GET', '/api/ListCalendarPermissions', {}, qs);
	}

	if (operation === 'listMailboxRules') {
		const qs: IDataObject = { tenantFilter };
		const useReportDb = context.getNodeParameter('useReportDb', i, false) as boolean;
		if (!useReportDb) qs.UseReportDB = 'true';
		return listWithSlice(context, i, 'GET', '/api/ListMailboxRules', {}, qs);
	}

	if (operation === 'listMobileDevices') {
		const qs: IDataObject = { tenantFilter };
		const mailbox = context.getNodeParameter('mailboxFilter', i, '') as string;
		if (mailbox) qs.Mailbox = mailbox;
		return listWithSlice(context, i, 'GET', '/api/ListMailboxMobileDevices', {}, qs);
	}

	if (operation === 'listOutOfOffice') {
		const qs: IDataObject = { tenantFilter };
		const filterUserId = context.getNodeParameter('listUserId', i, '') as string;
		if (filterUserId) qs.userid = filterUserId;
		return listWithSlice(context, i, 'GET', '/api/ListOoO', {}, qs);
	}

	if (operation === 'listRestrictedUsers') {
		return listWithSlice(context, i, 'GET', '/api/ListRestrictedUsers', {}, { tenantFilter });
	}

	if (operation === 'listGlobalAddressList') {
		return listWithSlice(context, i, 'GET', '/api/ListGlobalAddressList', {}, { tenantFilter });
	}

	if (operation === 'listMailboxCAS') {
		return listWithSlice(context, i, 'GET', '/api/ListMailboxCAS', {}, { tenantFilter });
	}

	if (operation === 'listSharedMailboxAccountEnabled') {
		return listWithSlice(
			context, i, 'GET', '/api/ListSharedMailboxAccountEnabled', {}, { tenantFilter },
		);
	}

	if (operation === 'listSharedMailboxStats') {
		return listWithSlice(
			context, i, 'GET', '/api/ListSharedMailboxStatistics', {}, { tenantFilter },
		);
	}

	if (operation === 'listMailboxRestores') {
		const qs: IDataObject = { tenantFilter };
		const identity = context.getNodeParameter('restoreIdentity', i, '') as string;
		const includeReport = context.getNodeParameter('includeReport', i, false) as boolean;
		const statistics = context.getNodeParameter('statistics', i, false) as boolean;
		if (identity) qs.Identity = identity;
		if (includeReport) qs.IncludeReport = 'true';
		if (statistics) qs.Statistics = 'true';
		return listWithSlice(context, i, 'GET', '/api/ListMailboxRestores', {}, qs);
	}

	if (operation === 'listMessageTrace') {
		const dateFilter = context.getNodeParameter('dateFilter', i) as string;
		const body: IDataObject = { tenantFilter, dateFilter };
		if (dateFilter === 'relative') {
			body.days = context.getNodeParameter('days', i) as number;
		} else {
			body.startDate = context.getNodeParameter('startDate', i) as string;
			body.endDate = context.getNodeParameter('endDate', i) as string;
		}
		const options = context.getNodeParameter('messageTraceOptions', i, {}) as IDataObject;
		if (options.sender) {
			body.sender = (options.sender as string).split(',').map((s: string) => s.trim());
		}
		if (options.recipient) {
			body.recipient = (options.recipient as string).split(',').map((s: string) => s.trim());
		}
		if (options.status && (options.status as string[]).length > 0) body.status = options.status;
		if (options.fromIP) body.fromIP = options.fromIP;
		if (options.toIP) body.toIP = options.toIP;
		if (options.ID) body.ID = options.ID;
		if (options.MessageId) body.MessageId = options.MessageId;
		if (options.traceDetail) body.traceDetail = options.traceDetail;
		return listWithSlice(context, i, 'POST', '/api/ListMessageTrace', body, {});
	}

	if (operation === 'runExoRequest') {
		const body: IDataObject = {
			TenantFilter: tenantFilter,
			Cmdlet: context.getNodeParameter('cmdlet', i) as string,
		};
		const options = context.getNodeParameter('exoOptions', i, {}) as IDataObject;
		if (options.Anchor) body.Anchor = options.Anchor;
		if (options.AsApp !== undefined) body.AsApp = options.AsApp;
		if (options.AvailableCmdlets) body.AvailableCmdlets = options.AvailableCmdlets;
		if (options.cmdParams) body.cmdParams = options.cmdParams;
		if (options.Compliance !== undefined) body.Compliance = options.Compliance;
		if (options.Select) body.Select = options.Select;
		if (options.UseSystemMailbox) body.UseSystemMailbox = options.UseSystemMailbox;
		return listWithSlice(context, i, 'POST', '/api/ListExoRequest', body, {});
	}

	// ── Operations that don't use the shared userId field ──────────────

	if (operation === 'addSharedMailbox') {
		const displayName = context.getNodeParameter('displayName', i) as string;
		const username = context.getNodeParameter('username', i) as string;
		const domain = context.getNodeParameter('domain', i) as string;
		const addedAliases = context.getNodeParameter('addedAliases', i, '') as string;
		const body: IDataObject = { tenantID: tenantFilter, displayName, username, domain };
		if (addedAliases) body.addedAliases = addedAliases;
		return cippApiRequest.call(context, 'POST', '/api/AddSharedMailbox', body, {});
	}

	if (operation === 'createHighVolumeEmail') {
		return cippApiRequest.call(context, 'POST', '/api/ExecHVEUser', {
			TenantFilter: tenantFilter,
			displayName: context.getNodeParameter('displayName', i) as string,
			primarySMTPAddress: context.getNodeParameter('primarySMTPAddress', i) as string,
			password: context.getNodeParameter('password', i) as string,
		}, {});
	}

	if (operation === 'removeRestrictedUser') {
		return postAction(context, i, '/api/ExecRemoveRestrictedUser', {
			SenderAddress: context.getNodeParameter('senderAddress', i) as string,
		});
	}

	if (operation === 'restoreMailbox') {
		const body: IDataObject = {
			TenantFilter: tenantFilter,
			SourceMailbox: context.getNodeParameter('sourceMailbox', i) as string,
			TargetMailbox: context.getNodeParameter('targetMailbox', i) as string,
		};
		const options = context.getNodeParameter('restoreOptions', i, {}) as IDataObject;
		if (options.RequestName) body.RequestName = options.RequestName;
		if (options.BadItemLimit !== undefined && options.BadItemLimit !== 0) {
			body.BadItemLimit = options.BadItemLimit;
		}
		if (options.LargeItemLimit !== undefined && options.LargeItemLimit !== 0) {
			body.LargeItemLimit = options.LargeItemLimit;
		}
		if (options.AcceptLargeDataLoss !== undefined) body.AcceptLargeDataLoss = options.AcceptLargeDataLoss;
		if (options.AssociatedMessagesCopyOption) body.AssociatedMessagesCopyOption = options.AssociatedMessagesCopyOption;
		if (options.ExcludeFolders) {
			body.ExcludeFolders = (options.ExcludeFolders as string).split(',').map((s: string) => s.trim());
		}
		if (options.IncludeFolders) {
			body.IncludeFolders = (options.IncludeFolders as string).split(',').map((s: string) => s.trim());
		}
		if (options.BatchName) body.BatchName = options.BatchName;
		if (options.CompletedRequestAgeLimit !== undefined && options.CompletedRequestAgeLimit !== 0) {
			body.CompletedRequestAgeLimit = options.CompletedRequestAgeLimit;
		}
		if (options.ConflictResolutionOption) body.ConflictResolutionOption = options.ConflictResolutionOption;
		if (options.SourceRootFolder) body.SourceRootFolder = options.SourceRootFolder;
		if (options.TargetRootFolder) body.TargetRootFolder = options.TargetRootFolder;
		if (options.TargetType) body.TargetType = options.TargetType;
		if (options.ExcludeDumpster !== undefined) body.ExcludeDumpster = options.ExcludeDumpster;
		if (options.SourceIsArchive !== undefined) body.SourceIsArchive = options.SourceIsArchive;
		if (options.TargetIsArchive !== undefined) body.TargetIsArchive = options.TargetIsArchive;
		if (options.Action) body.Action = options.Action;
		if (options.Identity) body.Identity = options.Identity;
		return cippApiRequest.call(context, 'POST', '/api/ExecMailboxRestore', body, {});
	}

	// ── Retention Operations ──────────────────────────────────────────

	if (operation === 'manageRetentionPolicies') {
		const fields = context.getNodeParameter('retentionPolicyFields', i, {}) as IDataObject;
		const qs: IDataObject = {};
		const body: IDataObject = { tenantFilter };
		if (fields.name) qs.name = fields.name;
		if (fields.CreatePolicies) {
			body.CreatePolicies = parseJsonPayload(
				context.getNode(), fields.CreatePolicies, 'Create Policies', i,
			);
		}
		if (fields.ModifyPolicies) {
			body.ModifyPolicies = parseJsonPayload(
				context.getNode(), fields.ModifyPolicies, 'Modify Policies', i,
			);
		}
		if (fields.DeletePolicies) {
			body.DeletePolicies = parseJsonPayload(
				context.getNode(), fields.DeletePolicies, 'Delete Policies', i,
			);
		}
		return cippApiRequest.call(context, 'DELETE', '/api/ExecManageRetentionPolicies', body, qs);
	}

	if (operation === 'manageRetentionTags') {
		const fields = context.getNodeParameter('retentionTagFields', i, {}) as IDataObject;
		const qs: IDataObject = {};
		const body: IDataObject = { tenantFilter };
		if (fields.name) qs.name = fields.name;
		if (fields.Comment) body.Comment = fields.Comment;
		if (fields.CreateTags) {
			body.CreateTags = parseJsonPayload(
				context.getNode(), fields.CreateTags, 'Create Tags', i,
			);
		}
		if (fields.ModifyTags) {
			body.ModifyTags = parseJsonPayload(
				context.getNode(), fields.ModifyTags, 'Modify Tags', i,
			);
		}
		if (fields.DeleteTags) {
			body.DeleteTags = parseJsonPayload(
				context.getNode(), fields.DeleteTags, 'Delete Tags', i,
			);
		}
		return cippApiRequest.call(context, 'DELETE', '/api/ExecManageRetentionTags', body, qs);
	}

	if (operation === 'setMailboxRetentionPolicies') {
		const Mailboxes = context.getNodeParameter('Mailboxes', i) as string;
		const PolicyName = context.getNodeParameter('PolicyName', i) as string;
		return cippApiRequest.call(context, 'POST', '/api/ExecSetMailboxRetentionPolicies', {
			tenantFilter,
			Mailboxes,
			PolicyName,
		});
	}

	// ── All remaining operations use the shared userId field ───────────

	const userId = context.getNodeParameter('userId', i) as string;

	// Existing operations

	if (operation === 'convert') {
		return cippApiRequest.call(context, 'POST', '/api/ExecConvertMailbox', {
			tenantFilter,
			ID: userId,
			MailboxType: context.getNodeParameter('mailboxType', i) as string,
		}, {});
	}

	if (operation === 'enableArchive') {
		return cippApiRequest.call(
			context, 'POST', '/api/ExecEnableArchive', { tenantFilter, id: userId }, {},
		);
	}

	if (operation === 'setOutOfOffice') {
		const autoReplyState = context.getNodeParameter('autoReplyState', i) as string;
		const body: IDataObject = { tenantFilter, userId, AutoReplyState: autoReplyState };
		if (autoReplyState === 'Enabled' || autoReplyState === 'Scheduled') {
			body.input = context.getNodeParameter('autoReplyMessage', i) as string;
		}
		if (autoReplyState === 'Scheduled') {
			const startTime = context.getNodeParameter('startTime', i, '') as string;
			const endTime = context.getNodeParameter('endTime', i, '') as string;
			if (startTime) body.StartTime = startTime;
			if (endTime) body.EndTime = endTime;
		}
		return cippApiRequest.call(context, 'POST', '/api/ExecSetOoO', body, {});
	}

	if (operation === 'setForwarding') {
		const forwardOption = context.getNodeParameter('forwardOption', i) as string;
		const keepCopy = context.getNodeParameter('keepCopy', i) as boolean;
		const body: IDataObject = {
			tenantFilter,
			userID: userId,
			forwardOption,
			KeepCopy: keepCopy ? 'true' : 'false',
		};
		if (forwardOption === 'internal') {
			body.ForwardInternal = context.getNodeParameter('forwardInternal', i) as string;
		} else if (forwardOption === 'external') {
			body.ForwardExternal = context.getNodeParameter('forwardExternal', i) as string;
		}
		return cippApiRequest.call(context, 'POST', '/api/ExecEmailForward', body, {});
	}

	// Permission operations

	if (operation === 'editMailboxPermissions') {
		const options = context.getNodeParameter('permissionOptions', i) as IDataObject;
		return cippApiRequest.call(context, 'POST', '/api/ExecEditMailboxPermissions', {
			tenantfilter: tenantFilter,
			userID: userId,
			...options,
		}, {});
	}

	if (operation === 'editCalendarPermissions') {
		const body: IDataObject = {
			userid: userId,
			UserToGetPermissions: context.getNodeParameter('userToGetPermissions', i) as string,
			Permissions: context.getNodeParameter('permissions', i) as string,
		};
		const options = context.getNodeParameter('calendarPermOptions', i, {}) as IDataObject;
		if (options.FolderName) body.FolderName = options.FolderName;
		if (options.RemoveAccess) body.RemoveAccess = options.RemoveAccess;
		if (options.CanViewPrivateItems) body.CanViewPrivateItems = options.CanViewPrivateItems;
		return postAction(context, i, '/api/ExecEditCalendarPermissions', body);
	}

	if (operation === 'setDefaultCalendarPerms') {
		return postAction(context, i, '/api/ExecModifyCalPerms', {
			userID: userId,
			permissions: context.getNodeParameter('permissions', i) as string,
		});
	}

	if (operation === 'setDefaultContactPerms') {
		return postAction(context, i, '/api/ExecModifyContactPerms', {
			userID: userId,
			permissions: context.getNodeParameter('permissions', i) as string,
		});
	}

	if (operation === 'setDefaultMailboxPerms') {
		return postAction(context, i, '/api/ExecModifyMBPerms', {
			userID: userId,
			permissions: context.getNodeParameter('permissions', i) as string,
		});
	}

	// Settings operations

	if (operation === 'setMailboxQuota') {
		const options = context.getNodeParameter('quotaOptions', i) as IDataObject;
		return cippApiRequest.call(context, 'POST', '/api/ExecSetMailboxQuota', {
			tenantfilter: tenantFilter,
			user: userId,
			...options,
		}, {});
	}

	if (operation === 'setEmailSize') {
		return postAction(context, i, '/api/ExecSetMailboxEmailSize', {
			UPN: userId,
			maxSendSize: context.getNodeParameter('maxSendSize', i) as string,
			maxReceiveSize: context.getNodeParameter('maxReceiveSize', i) as string,
		});
	}

	if (operation === 'setLocale') {
		return postAction(context, i, '/api/ExecSetMailboxLocale', {
			user: userId,
			locale: context.getNodeParameter('locale', i) as string,
		});
	}

	if (operation === 'setMailboxRule') {
		const ruleState = context.getNodeParameter('ruleState', i) as string;
		const body: IDataObject = {
			TenantFilter: tenantFilter,
			userPrincipalName: userId,
			ruleName: context.getNodeParameter('ruleName', i) as string,
		};
		const ruleId = context.getNodeParameter('ruleId', i, '') as string;
		if (ruleId) body.ruleId = ruleId;
		if (ruleState === 'enable') body.Enable = 'true';
		else body.Disable = 'true';
		return cippApiRequest.call(context, 'POST', '/api/ExecSetMailboxRule', body, {});
	}

	if (operation === 'removeMailboxRule') {
		const body: IDataObject = {
			TenantFilter: tenantFilter,
			userPrincipalName: userId,
			ruleName: context.getNodeParameter('ruleName', i) as string,
		};
		const ruleId = context.getNodeParameter('ruleId', i, '') as string;
		if (ruleId) body.ruleId = ruleId;
		return cippApiRequest.call(context, 'POST', '/api/ExecRemoveMailboxRule', body, {});
	}

	if (operation === 'setRecipientLimits') {
		return postAction(context, i, '/api/ExecSetRecipientLimits', {
			userid: userId,
			recipientLimit: context.getNodeParameter('recipientLimit', i) as string,
		});
	}

	if (operation === 'setCopyForSent') {
		return postAction(context, i, '/api/ExecCopyForSent', {
			ID: userId,
			messageCopyState: context.getNodeParameter('messageCopyState', i) as string,
		});
	}

	if (operation === 'setCalendarProcessing') {
		const options = context.getNodeParameter('calendarProcessingOptions', i) as IDataObject;
		return postAction(context, i, '/api/ExecSetCalendarProcessing', {
			UPN: userId,
			...options,
		});
	}

	// Hold operations

	if (operation === 'setLitigationHold') {
		const holdAction = context.getNodeParameter('holdAction', i) as string;
		const body: IDataObject = { UPN: userId };
		if (holdAction === 'enable') {
			const days = context.getNodeParameter('holdDays', i, '') as string;
			if (days) body.days = days;
		} else {
			body.disable = 'true';
		}
		return postAction(context, i, '/api/ExecSetLitigationHold', body);
	}

	if (operation === 'setRetentionHold') {
		const holdAction = context.getNodeParameter('holdAction', i) as string;
		const body: IDataObject = { UPN: userId };
		if (holdAction === 'disable') body.disable = 'true';
		return postAction(context, i, '/api/ExecSetRetentionHold', body);
	}

	if (operation === 'startManagedFolderAssistant') {
		return postAction(context, i, '/api/ExecStartManagedFolderAssistant', {
			UserPrincipalName: userId,
		});
	}

	if (operation === 'enableAutoExpandArchive') {
		return postAction(context, i, '/api/ExecEnableAutoExpandingArchive', {
			ID: userId,
			username: userId,
		});
	}

	// Other operations

	if (operation === 'hideFromGAL') {
		return postAction(context, i, '/api/ExecHideFromGAL', {
			ID: userId,
			HideFromGAL: context.getNodeParameter('hideFromGAL', i) as string,
		});
	}

	if (operation === 'manageMobileDevice') {
		const deviceAction = context.getNodeParameter('deviceAction', i) as string;
		const qs: IDataObject = {
			tenantFilter,
			Userid: userId,
			deviceid: context.getNodeParameter('deviceId', i) as string,
		};
		if (deviceAction === 'delete') qs.Delete = 'true';
		else if (deviceAction === 'quarantine') qs.Quarantine = 'true';
		return cippApiRequest.call(context, 'GET', '/api/ExecMailboxMobileDevices', {}, qs);
	}

	if (operation === 'repairExchangeRole') {
		// Uses tenantId (not tenantFilter) in body
		const body: IDataObject = { tenantId: tenantFilter };

		return cippApiRequest.call(context, 'POST', '/api/ExecExchangeRoleRepair', body, {});
	}

	if (operation === 'sendOrgMessage') {
		// GET with tenantFilter QS + optional params
		const filters = context.getNodeParameter('sendOrgMessageFields', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.ID) qs.ID = filters.ID;
		if (filters.freq) qs.freq = filters.freq;
		if (filters.type) qs.type = filters.type;
		if (filters.URL) qs.URL = filters.URL;

		return cippApiRequest.call(context, 'GET', '/api/ExecSendOrgMessage', {}, qs);
	}

	throw new NodeOperationError(
		context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i },
	);
}
