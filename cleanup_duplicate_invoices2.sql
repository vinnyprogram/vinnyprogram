-- Preview first — confirm these are the rows to delete (status Unpaid, Jun 17)
SELECT id, status, grand_total, created_at
FROM hers_invoices
WHERE address = '111 Francis Street, Boston, MA, USA'
ORDER BY created_at DESC;

-- Delete the 3 unpaid duplicates, keeping the most recent (Paid, Jun 18)
DELETE FROM hers_invoices
WHERE address = '111 Francis Street, Boston, MA, USA'
  AND status = 'Unpaid';
