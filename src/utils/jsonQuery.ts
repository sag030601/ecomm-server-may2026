import { prisma } from '../lib/prisma';

/** Find product IDs that include a given size variant (PostgreSQL JSONB query). */
export const findProductIdsBySize = async (size: string): Promise<string[]> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM products
    WHERE is_active = true
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(sizes::jsonb) AS elem
        WHERE elem->>'size' = ${size}
      )
  `;

  return rows.map((row) => row.id);
};
