-- name: InsertNotice :exec
INSERT INTO alert.notices (id, kind, subject, body, created_at) VALUES ($1, $2, $3, $4, $5);

-- name: RecordNoticeDelivery :exec
UPDATE alert.notices SET delivery = $2, delivery_detail = $3, delivered_at = $4 WHERE id = $1;
