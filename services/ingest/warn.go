package ingest

import (
	"context"
	"fmt"
	"slices"
)

// PushEndpoint is a browser's address for pushing to one device, with the keys the warning is encrypted to.
type PushEndpoint struct {
	ID       string
	Endpoint string
	P256dh   string
	Auth     string
}

// LeakWarning is what a device is shown when its Meter starts reporting a leak.
type LeakWarning struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

type PushResult string

const (
	Sent PushResult = "sent"
	// Gone only where the push service says this endpoint will never accept another push.
	Gone   PushResult = "gone"
	Failed PushResult = "failed"
)

type Pusher interface {
	Send(ctx context.Context, endpoint PushEndpoint, warning LeakWarning) PushResult
}

type PushEndpointStore interface {
	// LiveEndpoints is every Push Endpoint held against a Grant this Meter still honours.
	LiveEndpoints(ctx context.Context, meterID int64) ([]PushEndpoint, error)
	Forget(ctx context.Context, id string) error
}

type WarnDeps struct {
	Store  PushEndpointStore
	Pusher Pusher
}

// OpensActiveLeak: a leak opening is the only thing worth waking someone for. Backflow and no-use
// are not emergencies, a leak that changes kind is one they have already been told about, and a
// leak clearing is good news that can wait for the page.
func OpensActiveLeak(event EventDraft) bool {
	return event.Flag == ActiveLeak && event.From <= 0 && event.To > 0
}

const continuous = 2

func leakWarning(meterID int64, event EventDraft) LeakWarning {
	body := "Water has run through it for much of the day, in bursts."
	if event.To == continuous {
		body = "Water has run through it without a break for a day."
	}
	return LeakWarning{
		Title: fmt.Sprintf("Meter %d is reporting a leak", meterID),
		Body:  body,
		URL:   fmt.Sprintf("/meter/%d", meterID),
	}
}

// WarnAboutLeaks warns every device still entitled to hear about this Meter that a Meter Event opened
// an Active Leak — one Reading moves the flag once, so no device is warned twice for the same leak. An
// endpoint the push service has given up on is forgotten rather than retried forever; anything else
// is left in place, the next leak being the retry.
func WarnAboutLeaks(ctx context.Context, deps WarnDeps, meterID int64, events []EventDraft) error {
	opened := slices.IndexFunc(events, OpensActiveLeak)
	if opened < 0 {
		return nil
	}

	endpoints, err := deps.Store.LiveEndpoints(ctx, meterID)
	if err != nil {
		return err
	}
	warning := leakWarning(meterID, events[opened])
	for _, endpoint := range endpoints {
		if deps.Pusher.Send(ctx, endpoint, warning) != Gone {
			continue
		}
		if err := deps.Store.Forget(ctx, endpoint.ID); err != nil {
			return err
		}
	}
	return nil
}
