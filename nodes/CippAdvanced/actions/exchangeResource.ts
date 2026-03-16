import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	cippApiRequest,
	getTenantFilter,
	listWithSlice,
	postAction,
} from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	// ══════════════════════════════════════════════════════════════
	// Rooms
	// ══════════════════════════════════════════════════════════════

	if (operation === 'listRooms') {
		const tenantFilter = getTenantFilter(context, i);
		const filters = context.getNodeParameter('listRoomsFilters', i, {}) as IDataObject;
		const qs: IDataObject = { tenantFilter };
		if (filters.roomId) qs.roomId = filters.roomId;
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListRooms',
			{},
			qs,
		);

	} else if (operation === 'addRoom') {
		const tenantFilter = getTenantFilter(context, i);
		const displayName = context.getNodeParameter('displayName', i) as string;
		const username = context.getNodeParameter('username', i) as string;
		const domain = context.getNodeParameter('domain', i) as string;
		const additionalFields = context.getNodeParameter('addRoomFields', i, {}) as IDataObject;
		const body: IDataObject = {
			tenantid: tenantFilter,
			DisplayName: displayName,
			username,
			domain: { label: domain, value: domain },
		};
		if (additionalFields.ResourceCapacity) body.ResourceCapacity = additionalFields.ResourceCapacity;
		if (additionalFields.userPrincipalName) body.userPrincipalName = additionalFields.userPrincipalName;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddRoomMailbox',
			body,
			{},
		);

	} else if (operation === 'editRoom') {
		const tenantFilter = getTenantFilter(context, i);
		const roomId = context.getNodeParameter('roomId', i) as string;
		const roomFields = context.getNodeParameter('editRoomFields', i, {}) as IDataObject;
		const bookingFields = context.getNodeParameter('editRoomBookingFields', i, {}) as IDataObject;
		const body: IDataObject = {
			tenantID: tenantFilter,
			roomId,
		};
		// Room properties
		if (roomFields.DisplayName) body.DisplayName = roomFields.DisplayName;
		if (roomFields.userPrincipalName) body.userPrincipalName = roomFields.userPrincipalName;
		if (roomFields.capacity !== undefined && roomFields.capacity !== 0) body.capacity = roomFields.capacity;
		if (roomFields.building) body.building = roomFields.building;
		if (roomFields.floor !== undefined && roomFields.floor !== 0) body.floor = roomFields.floor;
		if (roomFields.floorLabel) body.floorLabel = roomFields.floorLabel;
		if (roomFields.street) body.street = roomFields.street;
		if (roomFields.city) body.city = roomFields.city;
		if (roomFields.state) body.state = roomFields.state;
		if (roomFields.postalCode) body.postalCode = roomFields.postalCode;
		if (roomFields.countryOrRegion) body.countryOrRegion = roomFields.countryOrRegion;
		if (roomFields.phone) body.phone = roomFields.phone;
		if (roomFields.tags) {
			body.tags = (roomFields.tags as string).split(',').map((t: string) => t.trim());
		}
		if (roomFields.audioDeviceName) body.audioDeviceName = roomFields.audioDeviceName;
		if (roomFields.videoDeviceName) body.videoDeviceName = roomFields.videoDeviceName;
		if (roomFields.displayDeviceName) body.displayDeviceName = roomFields.displayDeviceName;
		if (roomFields.hiddenFromAddressListsEnabled !== undefined) body.hiddenFromAddressListsEnabled = roomFields.hiddenFromAddressListsEnabled;
		if (roomFields.isWheelChairAccessible !== undefined) body.isWheelChairAccessible = roomFields.isWheelChairAccessible;
		// Calendar booking settings (PascalCase per spec)
		if (bookingFields.AllowConflicts !== undefined) body.AllowConflicts = bookingFields.AllowConflicts;
		if (bookingFields.AllowRecurringMeetings !== undefined) body.AllowRecurringMeetings = bookingFields.AllowRecurringMeetings;
		if (bookingFields.BookingWindowInDays !== undefined) body.BookingWindowInDays = bookingFields.BookingWindowInDays;
		if (bookingFields.MaximumDurationInMinutes !== undefined) body.MaximumDurationInMinutes = bookingFields.MaximumDurationInMinutes;
		if (bookingFields.ProcessExternalMeetingMessages !== undefined) body.ProcessExternalMeetingMessages = bookingFields.ProcessExternalMeetingMessages;
		if (bookingFields.EnforceCapacity !== undefined) body.EnforceCapacity = bookingFields.EnforceCapacity;
		if (bookingFields.ForwardRequestsToDelegates !== undefined) body.ForwardRequestsToDelegates = bookingFields.ForwardRequestsToDelegates;
		if (bookingFields.ScheduleOnlyDuringWorkHours !== undefined) body.ScheduleOnlyDuringWorkHours = bookingFields.ScheduleOnlyDuringWorkHours;
		if (bookingFields.AutomateProcessing) body.AutomateProcessing = bookingFields.AutomateProcessing;
		if (bookingFields.AddOrganizerToSubject !== undefined) body.AddOrganizerToSubject = bookingFields.AddOrganizerToSubject;
		if (bookingFields.DeleteSubject !== undefined) body.DeleteSubject = bookingFields.DeleteSubject;
		if (bookingFields.RemoveCanceledMeetings !== undefined) body.RemoveCanceledMeetings = bookingFields.RemoveCanceledMeetings;
		if (bookingFields.WorkDays) body.WorkDays = bookingFields.WorkDays;
		if (bookingFields.WorkHoursStartTime) body.WorkHoursStartTime = bookingFields.WorkHoursStartTime;
		if (bookingFields.WorkHoursEndTime) body.WorkHoursEndTime = bookingFields.WorkHoursEndTime;
		if (bookingFields.WorkingHoursTimeZone) body.WorkingHoursTimeZone = bookingFields.WorkingHoursTimeZone;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/EditRoomMailbox',
			body,
			{},
		);

	// ══════════════════════════════════════════════════════════════
	// Room Lists
	// ══════════════════════════════════════════════════════════════

	} else if (operation === 'listRoomLists') {
		const tenantFilter = getTenantFilter(context, i);
		const filters = context.getNodeParameter('listRoomListsFilters', i, {}) as IDataObject;
		const qs: IDataObject = { tenantFilter };
		if (filters.groupID) qs.groupID = filters.groupID;
		if (filters.members) qs.members = filters.members;
		if (filters.owners) qs.owners = filters.owners;
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListRoomLists',
			{},
			qs,
		);

	} else if (operation === 'addRoomList') {
		const tenantFilter = getTenantFilter(context, i);
		const displayName = context.getNodeParameter('displayName', i) as string;
		const username = context.getNodeParameter('username', i) as string;
		const primDomain = context.getNodeParameter('primDomain', i) as string;
		const body: IDataObject = {
			tenantFilter,
			displayName,
			username,
			primDomain: { label: primDomain, value: primDomain },
		};
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddRoomList',
			body,
			{},
		);

	} else if (operation === 'editRoomList') {
		const groupId = context.getNodeParameter('groupId', i) as string;
		const editFields = context.getNodeParameter('editRoomListFields', i, {}) as IDataObject;
		const extra: IDataObject = { groupId };
		if (editFields.displayName) extra.displayName = editFields.displayName;
		if (editFields.description) extra.description = editFields.description;
		if (editFields.mailNickname) extra.mailNickname = editFields.mailNickname;
		if (editFields.AddMember) {
			extra.AddMember = (editFields.AddMember as string).split(',').map((m: string) => m.trim());
		}
		if (editFields.RemoveMember) {
			extra.RemoveMember = (editFields.RemoveMember as string).split(',').map((m: string) => m.trim());
		}
		if (editFields.AddOwner) {
			extra.AddOwner = (editFields.AddOwner as string).split(',').map((m: string) => m.trim());
		}
		if (editFields.RemoveOwner) {
			extra.RemoveOwner = (editFields.RemoveOwner as string).split(',').map((m: string) => m.trim());
		}
		if (editFields.allowExternal !== undefined) extra.allowExternal = editFields.allowExternal;
		responseData = await postAction(
			context,
			i,
			'/api/EditRoomList',
			extra,
		);

	// ══════════════════════════════════════════════════════════════
	// Equipment
	// ══════════════════════════════════════════════════════════════

	} else if (operation === 'listEquipment') {
		const tenantFilter = getTenantFilter(context, i);
		const filters = context.getNodeParameter('listEquipmentFilters', i, {}) as IDataObject;
		const qs: IDataObject = { tenantFilter };
		if (filters.EquipmentId) qs.EquipmentId = filters.EquipmentId;
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListEquipment',
			{},
			qs,
		);

	} else if (operation === 'addEquipment') {
		const tenantFilter = getTenantFilter(context, i);
		const displayName = context.getNodeParameter('displayName', i) as string;
		const username = context.getNodeParameter('username', i) as string;
		const domain = context.getNodeParameter('domain', i) as string;
		const additionalFields = context.getNodeParameter('addEquipmentFields', i, {}) as IDataObject;
		const body: IDataObject = {
			tenantID: tenantFilter,
			displayName,
			username,
			domain: { label: domain, value: domain },
		};
		if (additionalFields.userPrincipalName) body.userPrincipalName = additionalFields.userPrincipalName;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddEquipmentMailbox',
			body,
			{},
		);

	} else if (operation === 'editEquipment') {
		const tenantFilter = getTenantFilter(context, i);
		const equipmentId = context.getNodeParameter('equipmentId', i) as string;
		const equipFields = context.getNodeParameter('editEquipmentFields', i, {}) as IDataObject;
		const bookingFields = context.getNodeParameter('editEquipmentBookingFields', i, {}) as IDataObject;
		const body: IDataObject = {
			tenantID: tenantFilter,
			equipmentId,
		};
		// Equipment properties (camelCase per spec)
		if (equipFields.DisplayName) body.DisplayName = equipFields.DisplayName;
		if (equipFields.userPrincipalName) body.userPrincipalName = equipFields.userPrincipalName;
		if (equipFields.department) body.department = equipFields.department;
		if (equipFields.company) body.company = equipFields.company;
		if (equipFields.streetAddress) body.streetAddress = equipFields.streetAddress;
		if (equipFields.city) body.city = equipFields.city;
		if (equipFields.stateOrProvince) body.stateOrProvince = equipFields.stateOrProvince;
		if (equipFields.postalCode) body.postalCode = equipFields.postalCode;
		if (equipFields.countryOrRegion) body.countryOrRegion = equipFields.countryOrRegion;
		if (equipFields.phone) body.phone = equipFields.phone;
		if (equipFields.tags) {
			body.tags = (equipFields.tags as string).split(',').map((t: string) => t.trim());
		}
		if (equipFields.hiddenFromAddressListsEnabled !== undefined) body.hiddenFromAddressListsEnabled = equipFields.hiddenFromAddressListsEnabled;
		// Calendar booking settings (camelCase per spec — different from Room which uses PascalCase)
		if (bookingFields.allowConflicts !== undefined) body.allowConflicts = bookingFields.allowConflicts;
		if (bookingFields.allowRecurringMeetings !== undefined) body.allowRecurringMeetings = bookingFields.allowRecurringMeetings;
		if (bookingFields.bookingWindowInDays !== undefined) body.bookingWindowInDays = bookingFields.bookingWindowInDays;
		if (bookingFields.maximumDurationInMinutes !== undefined) body.maximumDurationInMinutes = bookingFields.maximumDurationInMinutes;
		if (bookingFields.processExternalMeetingMessages !== undefined) body.processExternalMeetingMessages = bookingFields.processExternalMeetingMessages;
		if (bookingFields.forwardRequestsToDelegates !== undefined) body.forwardRequestsToDelegates = bookingFields.forwardRequestsToDelegates;
		if (bookingFields.scheduleOnlyDuringWorkHours !== undefined) body.scheduleOnlyDuringWorkHours = bookingFields.scheduleOnlyDuringWorkHours;
		if (bookingFields.automateProcessing) body.automateProcessing = bookingFields.automateProcessing;
		if (bookingFields.workDays) body.workDays = bookingFields.workDays;
		if (bookingFields.workHoursStartTime) body.workHoursStartTime = bookingFields.workHoursStartTime;
		if (bookingFields.workHoursEndTime) body.workHoursEndTime = bookingFields.workHoursEndTime;
		if (bookingFields.workingHoursTimeZone) body.workingHoursTimeZone = bookingFields.workingHoursTimeZone;
		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/EditEquipmentMailbox',
			body,
			{},
		);

	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, {
			itemIndex: i,
		});
	}

	return responseData;
}
