"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = void 0;
const database_1 = __importDefault(require("../config/database"));
const logActivity = async (params) => {
    try {
        await database_1.default.activityLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId,
                oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
                newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
                description: params.description,
                ipAddress: params.ipAddress,
            },
        });
    }
    catch (error) {
        console.error('Failed to log activity:', error);
    }
};
exports.logActivity = logActivity;
exports.default = exports.logActivity;
//# sourceMappingURL=activityLogger.js.map