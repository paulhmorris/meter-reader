package ingest

import (
	"testing"
	"time"
)

func TestReconnectDelayDoublesUpToAMinute(t *testing.T) {
	want := []time.Duration{1, 2, 4, 8, 16, 32, 60, 60}
	for attempts, seconds := range want {
		if got := reconnectDelay(attempts); got != seconds*time.Second {
			t.Errorf("reconnectDelay(%d) = %s, want %ds", attempts, got, seconds)
		}
	}
	if got := reconnectDelay(1000); got != time.Minute {
		t.Errorf("reconnectDelay(1000) = %s", got)
	}
}
