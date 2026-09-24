// Package ingest turns rtl_433's MQTT transmissions into stored Readings and Leak Warnings.
package ingest

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
)

// Flags are what a Meter reports alongside its counter, each a small bucketed code.
type Flags struct {
	// ActiveLeak is `leaknow`: 0 none, 1 intermittent, 2 continuous — a rolling 24-hour assessment.
	ActiveLeak int
	// LeakHistory is `leak`: days on which a leak was seen, bucketed 0-6, never an exact number of days.
	LeakHistory int
	Backflow    int
	NoUse       int
}

// Signal is how well the receiver heard one transmission. Only present when rtl_433 reports levels (`-M level`).
type Signal struct {
	// RSSI is received signal strength in dBm.
	RSSI *float64
	// SNR is signal-to-noise ratio in dB.
	SNR *float64
}

// Reading is one decoded R900 transmission.
type Reading struct {
	MeterID int64
	// Consumption is in tenths of a gallon, the R900 counter's own unit (ADR-0002), so it compares exactly.
	Consumption int64
	Flags       Flags
	Signal      Signal
}

// Gallons formats tenths of a gallon to one decimal place, the form Postgres stores.
func Gallons(tenths int64) string {
	return fmt.Sprintf("%d.%d", tenths/10, tenths%10)
}

// r900Model is how rtl_433 names the R900 decoder's model; anything else shares the topic by accident.
const r900Model = "Neptune-R900"

const (
	maxMeterID  = 0xffffffff
	maxFlag     = 0xff
	maxSafeJSON = 1<<53 - 1
)

// ParseR900 decodes one rtl_433 MQTT payload into a Reading, or false for anything this service
// has no business storing. rtl_433 sends more fields than a Reading needs, so unknown keys are left alone.
func ParseR900(payload []byte) (Reading, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(payload, &fields) != nil {
		return Reading{}, false
	}

	var model string
	if json.Unmarshal(fields["model"], &model) != nil || model != r900Model {
		return Reading{}, false
	}

	id, okID := count(fields["id"], maxMeterID)
	consumption, okConsumption := count(fields["consumption"], maxSafeJSON)
	leaknow, okLeaknow := count(fields["leaknow"], maxFlag)
	leak, okLeak := count(fields["leak"], maxFlag)
	backflow, okBackflow := count(fields["backflow"], maxFlag)
	nouse, okNouse := count(fields["nouse"], maxFlag)
	rssi, okRSSI := level(fields["rssi"])
	snr, okSNR := level(fields["snr"])
	if !(okID && okConsumption && okLeaknow && okLeak && okBackflow && okNouse && okRSSI && okSNR) {
		return Reading{}, false
	}

	return Reading{
		MeterID:     id,
		Consumption: consumption,
		Flags:       Flags{ActiveLeak: int(leaknow), LeakHistory: int(leak), Backflow: int(backflow), NoUse: int(nouse)},
		Signal:      Signal{RSSI: rssi, SNR: snr},
	}, true
}

// number is a JSON number and nothing else: null, a numeric string, or an absent field is not one.
func number(raw json.RawMessage) (float64, bool) {
	if raw == nil || bytes.Equal(raw, []byte("null")) {
		return 0, false
	}
	var n float64
	if json.Unmarshal(raw, &n) != nil {
		return 0, false
	}
	return n, true
}

func count(raw json.RawMessage, max int64) (int64, bool) {
	n, ok := number(raw)
	if !ok || n != math.Trunc(n) || n < 0 || n > float64(max) {
		return 0, false
	}
	return int64(n), true
}

// level is absent from every payload rtl_433 sends without `-M level`, which is not the same as null.
func level(raw json.RawMessage) (*float64, bool) {
	if raw == nil {
		return nil, true
	}
	n, ok := number(raw)
	if !ok {
		return nil, false
	}
	return &n, true
}
