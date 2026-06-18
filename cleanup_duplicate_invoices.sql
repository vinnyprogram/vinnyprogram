-- STEP 1: Preview the duplicates first (run this alone, check the results)
SELECT hi.id, hi.created_at, hi.status, hi.grand_total, hi.hers_estimate_id
FROM hers_invoices hi
JOIN customers c ON c.id = hi.customer_id
WHERE c.name = 'William Anderson' AND hi.address = '111 Francis Street, Boston, MA, USA'
ORDER BY hi.created_at;

-- STEP 2: Once you've confirmed the rows above are the 4 duplicates with no real
-- payments on them, run this to keep the most recent one and delete the other 3.
WITH target_estimate AS (
  SELECT he.id FROM hers_estimates he
  JOIN customers c ON c.id = he.customer_id
  WHERE c.name = 'William Anderson' AND he.address = '111 Francis Street, Boston, MA, USA'
  LIMIT 1
),
keep_invoice AS (
  SELECT id FROM hers_invoices
  WHERE hers_estimate_id = (SELECT id FROM target_estimate)
  ORDER BY created_at DESC
  LIMIT 1
)
DELETE FROM hers_invoices
WHERE hers_estimate_id = (SELECT id FROM target_estimate)
AND id NOT IN (SELECT id FROM keep_invoice);
