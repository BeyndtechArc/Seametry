-- name: UpsertEmailOptIn :one
-- Consenting again replaces the consent and the token, so a link from
-- before stops working, and keeps the first-touch ref code and wallet
-- already kept when the new consent carries none.
INSERT INTO alert.email_optins (id, address, consent_version, consented_at, ref_code, wallet, page, deployment, unsubscribe_token)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (lower(address)) WHERE address IS NOT NULL DO UPDATE SET
    address           = EXCLUDED.address,
    consent_version   = EXCLUDED.consent_version,
    consented_at      = EXCLUDED.consented_at,
    ref_code          = COALESCE(alert.email_optins.ref_code, EXCLUDED.ref_code),
    wallet            = COALESCE(EXCLUDED.wallet, alert.email_optins.wallet),
    page              = EXCLUDED.page,
    deployment        = EXCLUDED.deployment,
    unsubscribe_token = EXCLUDED.unsubscribe_token
RETURNING unsubscribe_token;

-- name: WithdrawEmailOptIn :execrows
UPDATE alert.email_optins
SET address = NULL, wallet = NULL, unsubscribe_token = NULL, unsubscribed_at = sqlc.arg(withdrawn_at)
WHERE unsubscribe_token = sqlc.arg(token);
