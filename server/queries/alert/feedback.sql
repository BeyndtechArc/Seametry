-- name: InsertFeedback :exec
INSERT INTO alert.feedback (id, message, reply_to, wallet, page, deployment, received_at)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: RecordDelivery :exec
UPDATE alert.feedback
SET delivery = $2, delivery_detail = $3, delivered_at = $4
WHERE id = $1;
