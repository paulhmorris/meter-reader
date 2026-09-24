package ingest

import (
	"context"
	"time"
)

type PipelineDeps struct {
	Store ReadingStore
	// Warn is nil where no VAPID keys are configured, which leaves the app with no way to warn anyone.
	Warn *WarnDeps
}

// HandlePayload turns one MQTT payload into a stored Reading, ignoring anything that is not an R900
// transmission, and warns subscribed devices about any leak the Reading opened.
func HandlePayload(ctx context.Context, deps PipelineDeps, payload []byte, receivedAt time.Time) (Result, error) {
	reading, ok := ParseR900(payload)
	if !ok {
		return Result{Status: Ignored}, nil
	}

	result, err := RecordReading(ctx, deps.Store, reading, receivedAt)
	if err != nil {
		return Result{}, err
	}
	if result.Status == Stored && deps.Warn != nil {
		if err := WarnAboutLeaks(ctx, *deps.Warn, reading.MeterID, result.Events); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}
