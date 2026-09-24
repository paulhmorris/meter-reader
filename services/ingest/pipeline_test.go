package ingest

import (
	"context"
	"testing"
	"time"
)

func handle(t *testing.T, deps PipelineDeps, raw []byte, at time.Time) Result {
	t.Helper()
	result, err := HandlePayload(context.Background(), deps, raw, at)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

var transmitted = Reading{MeterID: 1234567, Consumption: 1234}

func TestHandlePayloadStoresTheReadingAnR900TransmissionCarries(t *testing.T) {
	store := storeWith(lastStored(1000, quiet))
	assertEqual(t, handle(t, PipelineDeps{Store: store}, payload(t, nil), receivedAt), Result{Status: Stored, Events: []EventDraft{}})
	assertEqual(t, store.saved, []Reading{transmitted})
}

func TestHandlePayloadIgnoresWhatIsNotAnR900Transmission(t *testing.T) {
	for name, raw := range map[string][]byte{
		"a malformed payload":             []byte("<not json>"),
		"another model on the same topic": []byte(`{"model": "Acurite-Tower", "id": 1, "temperature_C": 20}`),
	} {
		t.Run(name, func(t *testing.T) {
			store := storeWith(nil)
			assertEqual(t, handle(t, PipelineDeps{Store: store}, raw, receivedAt), Result{Status: Ignored})
			assertEqual(t, store.saved, nil)
		})
	}
}

func TestHandlePayloadSuppressesATransmissionIdenticalToTheLastReading(t *testing.T) {
	store := storeWith(lastStored(1234, quiet))
	assertEqual(t, handle(t, PipelineDeps{Store: store}, payload(t, nil), after(time.Minute)), Result{Status: Suppressed})
	assertEqual(t, store.saved, nil)
}

func TestHandlePayloadRejectsATransmissionWhoseConsumptionFell(t *testing.T) {
	store := storeWith(lastStored(2000, quiet))
	assertEqual(t, handle(t, PipelineDeps{Store: store}, payload(t, nil), receivedAt),
		Result{Status: Rejected, Reading: transmitted, LastConsumption: 2000})
	assertEqual(t, store.saved, nil)
}

func TestHandlePayloadWarnsAboutALeakTheReadingOpened(t *testing.T) {
	warn := &fakeWarn{live: endpoints("one")}
	deps := warn.deps()
	handle(t, PipelineDeps{Store: storeWith(lastStored(1000, quiet)), Warn: &deps}, payload(t, map[string]any{"leaknow": 2}), receivedAt)

	assertEqual(t, warn.pushed, []pushed{{"one", LeakWarning{
		Title: "Meter 1234567 is reporting a leak",
		Body:  "Water has run through it without a break for a day.",
		URL:   "/meter/1234567",
	}}})
}

func TestHandlePayloadWarnsNobodyAboutAReadingThatOpenedNoLeak(t *testing.T) {
	warn := &fakeWarn{live: endpoints("one")}
	deps := warn.deps()
	handle(t, PipelineDeps{Store: storeWith(lastStored(1000, quiet)), Warn: &deps}, payload(t, nil), receivedAt)
	assertEqual(t, warn.pushed, nil)
}
