/** Map Prisma `id` fields to `_id` for frontend API compatibility. */
export const toApiResponse = <T>(input: T): T => {
  if (input === null || input === undefined) return input;
  if (input instanceof Date) return input;
  if (Array.isArray(input)) return input.map((item) => toApiResponse(item)) as T;
  if (typeof input !== 'object') return input;

  const obj = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id' && typeof value === 'string') {
      result._id = value;
      continue;
    }
    if (
      key.endsWith('Id') &&
      typeof value === 'string' &&
      !key.startsWith('_') &&
      key !== 'familyId'
    ) {
      const legacyKey = key.replace(/Id$/, '');
      if (legacyKey === 'subcategory' || legacyKey === 'category' || legacyKey === 'user' || legacyKey === 'product' || legacyKey === 'coupon' || legacyKey === 'parent') {
        result[legacyKey] = value;
        continue;
      }
    }
    result[key] = toApiResponse(value);
  }

  return result as T;
};
