package ingest

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OpenDB connects to the database Prisma migrates, whose tables and quoted camelCase columns it names.
func OpenDB(ctx context.Context, url string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	// Prisma's own parameter: Postgres refuses it as a setting, and node-postgres never sent it.
	delete(config.ConnConfig.RuntimeParams, "schema")
	return pgxpool.NewWithConfig(ctx, config)
}

// PostgresReadingStore creates the Meter the first time it is heard from.
type PostgresReadingStore struct{ DB *pgxpool.Pool }

func (s PostgresReadingStore) LastReading(ctx context.Context, meterID int64) (*StoredReading, error) {
	var last StoredReading
	err := s.DB.QueryRow(ctx, `
		SELECT ("consumption" * 10)::bigint, "activeLeak", "leakHistory", "backflow", "noUse", "receivedAt"
		FROM "Reading"
		WHERE "meterId" = $1
		ORDER BY "receivedAt" DESC, "id" DESC
		LIMIT 1`, meterID,
	).Scan(&last.Consumption, &last.Flags.ActiveLeak, &last.Flags.LeakHistory, &last.Flags.Backflow, &last.Flags.NoUse, &last.ReceivedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &last, nil
}

// Save writes receivedAt as UTC, since the columns are `timestamp` without a zone and Prisma reads them as UTC.
func (s PostgresReadingStore) Save(ctx context.Context, reading Reading, receivedAt time.Time, events []EventDraft) error {
	receivedAt = receivedAt.UTC()
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO "Meter" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`, reading.MeterID); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO "Reading" ("meterId", "consumption", "activeLeak", "leakHistory", "backflow", "noUse", "rssi", "snr", "receivedAt")
			VALUES ($1, $2::numeric, $3, $4, $5, $6, $7, $8, $9)`,
			reading.MeterID, Gallons(reading.Consumption),
			reading.Flags.ActiveLeak, reading.Flags.LeakHistory, reading.Flags.Backflow, reading.Flags.NoUse,
			reading.Signal.RSSI, reading.Signal.SNR, receivedAt,
		); err != nil {
			return err
		}

		for _, event := range events {
			if _, err := tx.Exec(ctx, `
				INSERT INTO "MeterEvent" ("meterId", "flag", "from", "to", "occurredAt")
				VALUES ($1, $2::text::"MeterEventFlag", $3, $4, $5)`,
				reading.MeterID, string(event.Flag), event.From, event.To, receivedAt,
			); err != nil {
				return err
			}
		}
		return nil
	})
}

// PostgresPushEndpointStore: a revoked Grant's endpoints are simply unseen.
type PostgresPushEndpointStore struct{ DB *pgxpool.Pool }

func (s PostgresPushEndpointStore) LiveEndpoints(ctx context.Context, meterID int64) ([]PushEndpoint, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT p."id", p."endpoint", p."p256dh", p."auth"
		FROM "PushEndpoint" p
		JOIN "Grant" g ON g."id" = p."grantId"
		WHERE g."meterId" = $1 AND g."revokedAt" IS NULL`, meterID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (PushEndpoint, error) {
		var e PushEndpoint
		err := row.Scan(&e.ID, &e.Endpoint, &e.P256dh, &e.Auth)
		return e, err
	})
}

func (s PostgresPushEndpointStore) Forget(ctx context.Context, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM "PushEndpoint" WHERE "id" = $1`, id)
	return err
}
