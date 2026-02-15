/**
 * Formats data and pagination metadata into a standard response structure.
 */
export function formatPaginationResponse<T>(data: T[], total: number, page: number, limit: number) {
    return {
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
}
