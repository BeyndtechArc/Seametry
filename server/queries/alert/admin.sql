-- name: AdminOptInCounts :many
-- Live and withdrawn consents by the page that asked and the first-touch
-- ref code, unknown when none was kept. A withdrawn row has kept its page
-- and ref code but no address.
SELECT (address IS NOT NULL)::boolean AS live,
       COALESCE(page, 'unrecorded')::text AS page,
       COALESCE(ref_code, 'unknown')::text AS ref_code,
       count(*) AS optins
FROM alert.email_optins
WHERE deployment = sqlc.arg(deployment)
  AND consented_at >= sqlc.arg(period_from)::timestamptz AND consented_at < sqlc.arg(period_to)::timestamptz
GROUP BY 1, 2, 3
ORDER BY live DESC, optins DESC, page, ref_code;

-- name: AdminRecentOptIns :many
-- The caller masks each address before it leaves the Gateway.
SELECT address::text AS address, consented_at, COALESCE(page, 'unrecorded')::text AS page, COALESCE(ref_code, 'unknown')::text AS ref_code
FROM alert.email_optins
WHERE address IS NOT NULL AND deployment = sqlc.arg(deployment)
  AND consented_at >= sqlc.arg(period_from)::timestamptz AND consented_at < sqlc.arg(period_to)::timestamptz
ORDER BY consented_at DESC
LIMIT 20;
