package ingest

import (
	"context"
	"reflect"
	"testing"
	"time"
)

var (
	quiet      = Flags{}
	receivedAt = time.Date(2026, 8, 18, 12, 0, 0, 0, time.UTC)
)

type fakeReadingStore struct {
	last   map[int64]*StoredReading
	saved  []Reading
	events [][]EventDraft
}

func storeWith(last *StoredReading) *fakeReadingStore {
	return &fakeReadingStore{last: map[int64]*StoredReading{1: last, 1234567: last}}
}

func (s *fakeReadingStore) LastReading(_ context.Context, meterID int64) (*StoredReading, error) {
	return s.last[meterID], nil
}

func (s *fakeReadingStore) Save(_ context.Context, reading Reading, _ time.Time, events []EventDraft) error {
	s.saved = append(s.saved, reading)
	s.events = append(s.events, events)
	return nil
}

func reading(consumption int64, flags Flags) Reading {
	return Reading{MeterID: 1, Consumption: consumption, Flags: flags}
}

func lastStored(consumption int64, flags Flags) *StoredReading {
	return &StoredReading{Consumption: consumption, Flags: flags, ReceivedAt: receivedAt}
}

func after(d time.Duration) time.Time { return receivedAt.Add(d) }

func record(t *testing.T, store ReadingStore, r Reading, at time.Time) Result {
	t.Helper()
	result, err := RecordReading(context.Background(), store, r, at)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func assertEqual[T any](t *testing.T, got, want T) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got  %+v\nwant %+v", got, want)
	}
}

func TestStoresAReadingWhoseConsumptionRose(t *testing.T) {
	store := storeWith(lastStored(1000, quiet))
	assertEqual(t, record(t, store, reading(1001, quiet), receivedAt), Result{Status: Stored, Events: []EventDraft{}})
	assertEqual(t, store.saved, []Reading{reading(1001, quiet)})
}

func TestStoresTheFirstReadingFromANewMeter(t *testing.T) {
	store := storeWith(nil)
	assertEqual(t, record(t, store, reading(80, Flags{ActiveLeak: 2, NoUse: 1}), receivedAt), Result{Status: Stored, Events: []EventDraft{}})
	assertEqual(t, store.saved, []Reading{reading(80, Flags{ActiveLeak: 2, NoUse: 1})})
	assertEqual(t, store.events, [][]EventDraft{{}})
}

func TestRejectsAFallTooFarToBeNoise(t *testing.T) {
	for name, c := range map[string]struct{ last, now int64 }{
		"a fall past the tolerance": {1000, 989},
		"a wrapped counter":         {5490946, 4},
	} {
		t.Run(name, func(t *testing.T) {
			store := storeWith(lastStored(c.last, quiet))
			fallen := reading(c.now, quiet)
			assertEqual(t, record(t, store, fallen, receivedAt), Result{Status: Rejected, Reading: fallen, LastConsumption: c.last})
			assertEqual(t, store.saved, nil)
		})
	}
}

func TestDropsAFallWithinTheToleranceAsNoise(t *testing.T) {
	for _, now := range []int64{999, 995, 990} {
		store := storeWith(lastStored(1000, quiet))
		jittered := reading(now, quiet)
		assertEqual(t, record(t, store, jittered, receivedAt), Result{Status: Noise, Reading: jittered, LastConsumption: 1000})
		assertEqual(t, store.saved, nil)
	}
}

func TestKeepsAFlappingTenthsDigitOutOfTheStore(t *testing.T) {
	store := storeWith(lastStored(5490946, quiet))
	jittered := reading(5490945, quiet)
	for i := range 3 {
		assertEqual(t, record(t, store, jittered, after(time.Duration(i)*20*time.Minute)),
			Result{Status: Noise, Reading: jittered, LastConsumption: 5490946})
	}
	assertEqual(t, store.saved, nil)
}

func TestSuppressesAnIdenticalReadingUntil15Minutes(t *testing.T) {
	for _, at := range []time.Time{after(time.Minute), after(15*time.Minute - time.Millisecond)} {
		store := storeWith(lastStored(1000, quiet))
		assertEqual(t, record(t, store, reading(1000, quiet), at), Result{Status: Suppressed})
		assertEqual(t, store.saved, nil)
	}
}

func TestStoresAnIdenticalReadingAsAHeartbeatAfter15Minutes(t *testing.T) {
	store := storeWith(lastStored(1000, Flags{ActiveLeak: 1}))
	assertEqual(t, record(t, store, reading(1000, Flags{ActiveLeak: 1}), after(15*time.Minute)), Result{Status: Heartbeat})
	assertEqual(t, store.saved, []Reading{reading(1000, Flags{ActiveLeak: 1})})
	assertEqual(t, store.events, [][]EventDraft{{}})
}

func TestMeasuresTheHeartbeatPerMeter(t *testing.T) {
	store := &fakeReadingStore{last: map[int64]*StoredReading{
		1: {Consumption: 1000, ReceivedAt: after(-30 * time.Minute)},
		2: {Consumption: 1000, ReceivedAt: after(-time.Minute)},
	}}
	second := Reading{MeterID: 2, Consumption: 1000}

	assertEqual(t, record(t, store, reading(1000, quiet), receivedAt), Result{Status: Heartbeat})
	assertEqual(t, record(t, store, second, receivedAt), Result{Status: Suppressed})
	assertEqual(t, store.saved, []Reading{reading(1000, quiet)})
}

func TestRecordsAMeterEventPerFlagThatMoved(t *testing.T) {
	for name, c := range map[string]struct {
		last, now Flags
		events    []EventDraft
	}{
		"Active Leak opening":  {quiet, Flags{ActiveLeak: 2}, []EventDraft{{ActiveLeak, 0, 2}}},
		"Active Leak clearing": {Flags{ActiveLeak: 2}, quiet, []EventDraft{{ActiveLeak, 2, 0}}},
		"backflow starting":    {quiet, Flags{Backflow: 1}, []EventDraft{{Backflow, 0, 1}}},
		"backflow stopping":    {Flags{Backflow: 1}, quiet, []EventDraft{{Backflow, 1, 0}}},
		"no-use starting":      {quiet, Flags{NoUse: 5}, []EventDraft{{NoUse, 0, 5}}},
		"no-use stopping":      {Flags{NoUse: 1}, quiet, []EventDraft{{NoUse, 1, 0}}},
		"Leak History moving":  {quiet, Flags{LeakHistory: 3}, []EventDraft{}},
		"several at once": {
			Flags{ActiveLeak: 1},
			Flags{LeakHistory: 2, Backflow: 1},
			[]EventDraft{{ActiveLeak, 1, 0}, {Backflow, 0, 1}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			store := storeWith(lastStored(1000, c.last))
			changed := reading(1000, c.now)
			assertEqual(t, record(t, store, changed, after(time.Minute)), Result{Status: Stored, Events: c.events})
			assertEqual(t, store.saved, []Reading{changed})
			assertEqual(t, store.events, [][]EventDraft{c.events})
		})
	}
}

func TestRecordsNoMeterEventWhenOnlyConsumptionRose(t *testing.T) {
	store := storeWith(lastStored(1000, quiet))
	record(t, store, reading(1001, quiet), after(time.Minute))
	assertEqual(t, store.events, [][]EventDraft{{}})
}
