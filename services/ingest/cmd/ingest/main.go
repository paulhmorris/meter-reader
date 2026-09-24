package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/paulhmorris/meter-reader/services/ingest"
	// node:slim has no system CA store, and push services and Sentry are only reachable over TLS.
	_ "golang.org/x/crypto/x509roots/fallback"
)

func main() {
	log.SetFlags(0)
	environment := os.Getenv("SENTRY_ENVIRONMENT")
	if environment == "" {
		environment = "development"
	}
	if err := sentry.Init(sentry.ClientOptions{Dsn: os.Getenv("SENTRY_DSN"), Environment: environment}); err != nil {
		log.Printf("ingest: Sentry disabled: %v", err)
	}

	if err := run(); err != nil {
		reportAndExit(err)
	}
}

func reportAndExit(err error) {
	log.Print(err)
	sentry.CaptureException(err)
	sentry.Flush(2 * time.Second)
	os.Exit(1)
}

func run() error {
	databaseURL, err := ingest.RequireEnv("DATABASE_URL", os.Getenv)
	if err != nil {
		return err
	}
	broker, err := brokerConfig()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := ingest.OpenDB(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	warn, err := leakWarnings(db)
	if err != nil {
		return err
	}
	deps := ingest.PipelineDeps{Store: ingest.PostgresReadingStore{DB: db}, Warn: warn}

	if err := db.Ping(ctx); err != nil {
		return err
	}
	log.Print("ingest: database reachable")

	// A Reading is compared against the Meter's last stored one, so payloads cannot overlap.
	payloads := make(chan []byte, 256)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			select {
			case payload := <-payloads:
				handle(deps, payload)
			case <-ctx.Done():
				return
			}
		}
	}()

	subscription := ingest.SubscribeToBroker(broker, func(payload []byte) {
		select {
		case payloads <- payload:
		case <-ctx.Done():
		}
	})
	defer subscription.Close()

	if os.Getenv("INGEST_DEBUG_SENTRY") == "1" {
		return errors.New("Sentry test error from the meter-reader ingest service")
	}

	<-done
	return nil
}

func brokerConfig() (ingest.BrokerConfig, error) {
	var config ingest.BrokerConfig
	for _, v := range []struct {
		name  string
		field *string
	}{
		{"MQTT_URL", &config.URL},
		{"MQTT_TOPIC", &config.Topic},
		{"MQTT_USERNAME", &config.Username},
		{"MQTT_PASSWORD", &config.Password},
	} {
		value, err := ingest.RequireEnv(v.name, os.Getenv)
		if err != nil {
			return config, err
		}
		*v.field = value
	}
	return config, nil
}

// leakWarnings is nil without VAPID keys: the app still stores every Reading, it just warns nobody.
func leakWarnings(db *pgxpool.Pool) (*ingest.WarnDeps, error) {
	publicKey := os.Getenv("VAPID_PUBLIC_KEY")
	privateKey := os.Getenv("VAPID_PRIVATE_KEY")
	if publicKey == "" || privateKey == "" {
		log.Print("ingest: VAPID keys unset, leak warnings will not be pushed")
		return nil, nil
	}

	subject, err := ingest.RequireEnv("VAPID_SUBJECT", os.Getenv)
	if err != nil {
		return nil, err
	}
	return &ingest.WarnDeps{
		Store:  ingest.PostgresPushEndpointStore{DB: db},
		Pusher: ingest.NewWebPushPusher(ingest.VapidDetails{Subject: subject, PublicKey: publicKey, PrivateKey: privateKey}),
	}, nil
}

// handle reports rather than returns: one bad payload must not stop the next. A panic is reported and
// then crashes the process, for compose to restart.
func handle(deps ingest.PipelineDeps, payload []byte) {
	defer func() {
		if r := recover(); r != nil {
			sentry.CurrentHub().Recover(r)
			sentry.Flush(2 * time.Second)
			panic(r)
		}
	}()

	result, err := ingest.HandlePayload(context.Background(), deps, payload, time.Now())
	if err != nil {
		log.Print(err)
		sentry.CaptureException(err)
		return
	}

	switch result.Status {
	case ingest.Noise:
		log.Printf("ingest: dropped a jittered Reading for meter %d: %s < %s gallons",
			result.Reading.MeterID, ingest.Gallons(result.Reading.Consumption), ingest.Gallons(result.LastConsumption))
	case ingest.Rejected:
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetLevel(sentry.LevelError)
			scope.SetContext("reading", sentry.Context{
				"meterId":         result.Reading.MeterID,
				"consumption":     ingest.Gallons(result.Reading.Consumption),
				"lastConsumption": ingest.Gallons(result.LastConsumption),
			})
			sentry.CaptureMessage("ingest: Reading rejected, Consumption fell")
		})
		log.Printf("ingest: rejected a Reading for meter %d: %s < %s gallons",
			result.Reading.MeterID, ingest.Gallons(result.Reading.Consumption), ingest.Gallons(result.LastConsumption))
	}
}
