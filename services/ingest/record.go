package ingest

import (
	"context"
	"time"
)

// StoredReading is what the Meter's last stored Reading says, which every new transmission is judged against.
type StoredReading struct {
	// Consumption is in tenths of a gallon, like Reading's.
	Consumption int64
	Flags       Flags
	ReceivedAt  time.Time
}

// EventFlag names a flag whose transitions are recorded as Meter Events; Leak History is a bucket, not a state.
type EventFlag string

const (
	ActiveLeak EventFlag = "activeLeak"
	Backflow   EventFlag = "backflow"
	NoUse      EventFlag = "noUse"
)

// EventDraft is one flag's move from one value to another, to be recorded alongside the Reading that showed it.
type EventDraft struct {
	Flag EventFlag
	From int
	To   int
}

type ReadingStore interface {
	// LastReading is the Meter's last stored Reading, or nil if it has never been heard from.
	LastReading(ctx context.Context, meterID int64) (*StoredReading, error)
	// Save writes the Reading and its Meter Events together, so neither can survive without the other.
	Save(ctx context.Context, reading Reading, receivedAt time.Time, events []EventDraft) error
}

type Status string

const (
	Ignored    Status = "ignored"
	Stored     Status = "stored"
	Heartbeat  Status = "heartbeat"
	Suppressed Status = "suppressed"
	Noise      Status = "noise"
	Rejected   Status = "rejected"
)

// Result says what became of one transmission. Events is set when Stored; Reading and
// LastConsumption when Noise or Rejected.
type Result struct {
	Status          Status
	Events          []EventDraft
	Reading         Reading
	LastConsumption int64
}

const heartbeatInterval = 15 * time.Minute

// JitterToleranceTenths is how far Consumption may fall and still be read as a mis-decoded transmission
// rather than a counter that really moved backwards (ADR-0002). A weak signal flips the counter's low
// digits, which shows up as a fall of a tenth or two; a wrap or a swapped meter falls by whole orders
// of magnitude, so nothing that needs a human is anywhere near this line.
const JitterToleranceTenths = 10

func transitions(previous, next Flags) []EventDraft {
	events := []EventDraft{}
	for _, f := range []struct {
		flag     EventFlag
		from, to int
	}{
		{ActiveLeak, previous.ActiveLeak, next.ActiveLeak},
		{Backflow, previous.Backflow, next.Backflow},
		{NoUse, previous.NoUse, next.NoUse},
	} {
		if f.from != f.to {
			events = append(events, EventDraft{Flag: f.flag, From: f.from, To: f.to})
		}
	}
	return events
}

// RecordReading stores one transmission and reports the Meter Events it produced, unless it says
// nothing new — an identical one is dropped except as the 15-minute Heartbeat, which is what tells a
// silent Meter apart from an unused one. Each flag that moved since the Meter's last stored Reading is
// recorded as a Meter Event alongside it.
//
// A Consumption that has fallen too far to be decode noise means a wrapped counter, a swapped meter,
// or a corrupt packet, all of which need a human; a smaller fall is dropped as noise (ADR-0002).
// Neither is stored, so Consumption never moves backwards either way.
func RecordReading(ctx context.Context, store ReadingStore, reading Reading, receivedAt time.Time) (Result, error) {
	last, err := store.LastReading(ctx, reading.MeterID)
	if err != nil {
		return Result{}, err
	}
	if last == nil {
		if err := store.Save(ctx, reading, receivedAt, []EventDraft{}); err != nil {
			return Result{}, err
		}
		return Result{Status: Stored, Events: []EventDraft{}}, nil
	}

	fall := last.Consumption - reading.Consumption
	if fall > JitterToleranceTenths {
		return Result{Status: Rejected, Reading: reading, LastConsumption: last.Consumption}, nil
	}
	if fall > 0 {
		return Result{Status: Noise, Reading: reading, LastConsumption: last.Consumption}, nil
	}

	if reading.Consumption != last.Consumption || reading.Flags != last.Flags {
		events := transitions(last.Flags, reading.Flags)
		if err := store.Save(ctx, reading, receivedAt, events); err != nil {
			return Result{}, err
		}
		return Result{Status: Stored, Events: events}, nil
	}

	if receivedAt.Sub(last.ReceivedAt) < heartbeatInterval {
		return Result{Status: Suppressed}, nil
	}

	if err := store.Save(ctx, reading, receivedAt, []EventDraft{}); err != nil {
		return Result{}, err
	}
	return Result{Status: Heartbeat}, nil
}
