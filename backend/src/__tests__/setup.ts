import { PrismaClient } from '@prisma/client';
import { beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

import prisma from '../infrastructure/database/prisma';

vi.mock('../infrastructure/database/prisma', () => ({
    __esModule: true,
    default: mockDeep<PrismaClient>(),
}));

vi.mock('../config/database', () => ({
    __esModule: true,
    default: mockDeep<PrismaClient>(),
}));

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
    mockReset(prismaMock);
});
