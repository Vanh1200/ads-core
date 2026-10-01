const DEFAULT_MIN_EXTENSION_VERSION = '1.7.9';

function numericVersion(value: unknown) {
    return String(value || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left: string, right: string) {
    const a = numericVersion(left);
    const b = numericVersion(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        const difference = (a[index] || 0) - (b[index] || 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

function disabledFeatures() {
    return new Set(String(process.env.XOY_DISABLED_FEATURES || '')
        .split(',')
        .map((feature) => feature.trim())
        .filter(Boolean));
}

const tagToCategory = {
    5: 1,
    10: 2, 11: 2, 12: 2,
    14: 3, 193: 3, 44: 3, 202: 3,
    43: 5, 46: 5, 219: 5, 236: 5, 296: 5,
    51: 7, 272: 7,
    61: 8, 62: 8, 194: 8, 210: 8, 271: 8, 293: 8, 297: 8, 299: 8, 300: 8, 303: 8,
    294: 11, 239: 11, 255: 11,
    218: 13,
    162: 58, 238: 58, 263: 58,
    288: 59,
    198: 60, 264: 60,
    267: 53,
    270: 24,
    254: 19,
    253: 64,
};

const rpc = {
    renameBatch: {
        path: '/aw_mcc/_/rpc/BatchService/Batch',
        buildVersion: 'awn_mcc_ui_auto_20260830-1458_RC002',
        trackingId: 'BatchService.Batch[AccountService.Mutate]',
    },
    verifyCreateSession: {
        path: '/aw_identity/_/rpc/AssistantService/CreateSession',
        buildVersion: 'awn_identity_ui_server_auto_20260907-0731_RC000',
        trackingId: 'AssistantService.CreateSession',
    },
    verifyGetConversation: {
        path: '/aw_identity/_/rpc/AssistantService/GetConversation',
        buildVersion: 'awn_identity_ui_server_auto_20260907-0731_RC000',
        trackingId: 'AssistantService.GetConversation',
    },
    verifyCloseSession: {
        path: '/aw_identity/_/rpc/AssistantService/CloseSession',
        buildVersion: 'awn_identity_ui_server_auto_20260907-0731_RC000',
        trackingId: 'AssistantService.CloseSession',
    },
    verifyIdentityCreate: {
        path: '/aw_identity/_/rpc/BatchService/Batch',
        buildVersion: 'awn_identity_ui_server_auto_20260907-0731_RC000',
        trackingId: 'BatchService.Batch[CustomerIdentityService.Create]',
    },
    appealList: {
        path: '/ga/_/AwSupportPlatform/_/rpc/AccountSuspensionAppealService/List',
        buildVersion: 'boq_google-ads-supportplatform_20260920.03_p0',
        trackingId: 'AccountSuspensionAppealService.List',
    },
    appealPreflightSignals: {
        path: '/ga/_/AwSupportPlatform/_/rpc/EducationFeatureService/GetSignals',
        buildVersion: 'boq_google-ads-supportplatform_20260920.03_p0',
        trackingId: 'EducationFeatureService.GetSignals',
    },
    appealSubmitSignals: {
        path: '/ga/_/AwSupportPlatform/_/rpc/EducationFeatureService/GetSignals',
        buildVersion: 'boq_google-ads-supportplatform_20260830.04_p0',
        trackingId: 'EducationFeatureService.GetSignals',
    },
    appealSubmit: {
        path: '/ga/_/AwSupportPlatform/_/rpc/AccountSuspensionAppealService/Submit',
        buildVersion: 'boq_google-ads-supportplatform_20260830.04_p0',
        trackingId: 'AccountSuspensionAppealService.Submit',
    },
    accountList: {
        path: '/aw_mcc/_/rpc/AccountService/List',
    },
    reactivate: {
        path: '/aw_accountsettings/_/rpc/CustomerService/Mutate',
        buildVersion: 'awn_mcc_ui_auto_20260830-1458_RC002',
        trackingId: 'CustomerService.Mutate',
    },
    reportDownload: {
        path: '/aw_reporting/dashboard/_/rpc/ReportDownloadService',
        buildVersion: 'aw_essentials_ui_auto_20260902-1824_RC001',
        trackingId: 'ReportDownloadService.DownloadReport',
        stateTrackingId: 'ReportDownloadService.GetState',
    },
};

export class XoyRuntimeConfigService {
    create(entitlement: any, extensionVersion: string) {
        const minimumVersion = process.env.XOY_MIN_EXTENSION_VERSION || DEFAULT_MIN_EXTENSION_VERSION;
        if (!extensionVersion || compareVersions(extensionVersion, minimumVersion) < 0) {
            throw new Error(`EXTENSION_UPDATE_REQUIRED:${minimumVersion}`);
        }

        const disabled = disabledFeatures();
        const licensedFeatures = entitlement?.features || {};
        const features = Object.fromEntries(Object.entries(licensedFeatures)
            .map(([feature, enabled]) => [feature, Boolean(enabled) && !disabled.has(feature)]));
        const issuedAt = new Date();

        return {
            schemaVersion: 1,
            configVersion: process.env.XOY_RUNTIME_CONFIG_VERSION || '2026-09-30.1',
            issuedAt: issuedAt.toISOString(),
            extensionVersion,
            minExtensionVersion: minimumVersion,
            features,
            rpc,
            protocol: {
                appealSignalId: 149,
                tagToCategory,
                supportedAppealCategories: [8, 11, 58, 59],
                appealStatus: { 1: 'PENDING', 2: 'SIGNALS', 3: 'REJECTED' },
            },
        };
    }
}

export const xoyRuntimeConfigService = new XoyRuntimeConfigService();
