package ingest

import (
	"encoding/json"
	"testing"
)

func payload(t *testing.T, fields map[string]any) []byte {
	t.Helper()
	transmission := map[string]any{
		"model": "Neptune-R900", "id": 1234567, "consumption": 1234,
		"leaknow": 0, "leak": 0, "backflow": 0, "nouse": 0,
	}
	for key, value := range fields {
		if value == omit {
			delete(transmission, key)
			continue
		}
		transmission[key] = value
	}
	encoded, err := json.Marshal(transmission)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

type omitted struct{}

// omit drops a field from the payload, where nil would send it as null.
var omit = omitted{}

func mustParse(t *testing.T, raw []byte) Reading {
	t.Helper()
	reading, ok := ParseR900(raw)
	if !ok {
		t.Fatalf("ParseR900(%s) ignored a transmission it should read", raw)
	}
	return reading
}

func TestParseR900NormalisesTheCounterToTenths(t *testing.T) {
	reading := mustParse(t, payload(t, map[string]any{"consumption": 1234}))
	if reading.Consumption != 1234 || Gallons(reading.Consumption) != "123.4" {
		t.Errorf("got %d tenths (%s gallons), want 1234 (123.4)", reading.Consumption, Gallons(reading.Consumption))
	}
}

func TestParseR900ReadsA32BitMeterID(t *testing.T) {
	if got := mustParse(t, payload(t, map[string]any{"id": 4294967295})).MeterID; got != 4294967295 {
		t.Errorf("MeterID = %d", got)
	}
}

func TestParseR900ReadsTheFlags(t *testing.T) {
	got := mustParse(t, payload(t, map[string]any{"leaknow": 1, "leak": 3, "backflow": 2, "nouse": 5})).Flags
	if want := (Flags{ActiveLeak: 1, LeakHistory: 3, Backflow: 2, NoUse: 5}); got != want {
		t.Errorf("Flags = %+v, want %+v", got, want)
	}
}

func TestParseR900ReadsLevelsWhenReported(t *testing.T) {
	signal := mustParse(t, payload(t, map[string]any{"rssi": -6.5, "snr": 18.25})).Signal
	if signal.RSSI == nil || *signal.RSSI != -6.5 || signal.SNR == nil || *signal.SNR != 18.25 {
		t.Errorf("Signal = %v, %v", signal.RSSI, signal.SNR)
	}
}

func TestParseR900ReadsAReadingWithNoLevels(t *testing.T) {
	signal := mustParse(t, payload(t, nil)).Signal
	if signal.RSSI != nil || signal.SNR != nil {
		t.Errorf("Signal = %v, %v, want none", signal.RSSI, signal.SNR)
	}
}

func TestParseR900Ignores(t *testing.T) {
	for name, raw := range map[string][]byte{
		"another model on the same topic": payload(t, map[string]any{"model": "Acurite-Tower"}),
		"a message that is not JSON":      []byte("not json"),
		"JSON that is not an object":      []byte("[1, 2]"),
		"a level that is a string":        payload(t, map[string]any{"rssi": "-6.5"}),
		"a level that is null":            payload(t, map[string]any{"snr": nil}),
		"missing fields":                  []byte(`{"model": "Neptune-R900", "id": 1}`),
		"an id that is a string":          payload(t, map[string]any{"id": "1234567"}),
		"a negative consumption":          payload(t, map[string]any{"consumption": -1}),
		"a fractional consumption":        payload(t, map[string]any{"consumption": 12.5}),
		"a missing flag":                  payload(t, map[string]any{"leaknow": omit}),
		"a negative flag":                 payload(t, map[string]any{"leak": -1}),
		"a flag that is a string":         payload(t, map[string]any{"backflow": "2"}),
		"a flag wider than a byte":        payload(t, map[string]any{"nouse": 256}),
		"an id wider than 32 bits":        payload(t, map[string]any{"id": 4294967296}),
	} {
		t.Run(name, func(t *testing.T) {
			if reading, ok := ParseR900(raw); ok {
				t.Errorf("ParseR900(%s) = %+v, want ignored", raw, reading)
			}
		})
	}
}
