// Command fake-leak is dev-only: it pretends the SDR heard the Meter reporting a leak, running the real
// ingest pipeline so real Leak Warnings go out. Usage: go run ./cmd/fake-leak [meterId] [0|1|2]
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/paulhmorris/meter-reader/services/ingest"
)

func main() {
	meterID := arg(1, 1234567890)
	leaknow := arg(2, 2)
	ctx := context.Background()

	db, err := ingest.OpenDB(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	readings := ingest.PostgresReadingStore{DB: db}
	endpoints := ingest.PostgresPushEndpointStore{DB: db}
	last, err := readings.LastReading(ctx, meterID)
	if err != nil {
		log.Fatal(err)
	}
	if last == nil {
		last = &ingest.StoredReading{}
	}

	payload, err := json.Marshal(map[string]any{
		"model": "Neptune-R900",
		"id":    meterID,
		// One tenth of a gallon above the last Reading, so it is stored rather than suppressed.
		"consumption": last.Consumption + 1,
		"leaknow":     leaknow,
		"leak":        last.Flags.LeakHistory,
		"backflow":    0,
		"nouse":       0,
	})
	if err != nil {
		log.Fatal(err)
	}

	subject := os.Getenv("VAPID_SUBJECT")
	if subject == "" {
		subject = "mailto:you@example.com"
	}
	result, err := ingest.HandlePayload(ctx, ingest.PipelineDeps{
		Store: readings,
		Warn: &ingest.WarnDeps{
			Store: endpoints,
			Pusher: ingest.NewWebPushPusher(ingest.VapidDetails{
				Subject:    subject,
				PublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
				PrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
			}),
		},
	}, payload, time.Now())
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("meter %d: leaknow %d -> %d, %+v\n", meterID, last.Flags.ActiveLeak, leaknow, result)
	live, err := endpoints.LiveEndpoints(ctx, meterID)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("live endpoints: %+v\n", live)
}

func arg(i int, fallback int64) int64 {
	if len(os.Args) <= i {
		return fallback
	}
	n, err := strconv.ParseInt(os.Args[i], 10, 64)
	if err != nil {
		log.Fatalf("argument %d: %v", i, err)
	}
	return n
}
