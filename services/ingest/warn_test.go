package ingest

import (
	"context"
	"testing"
)

type pushed struct {
	id      string
	warning LeakWarning
}

type fakeWarn struct {
	live      []PushEndpoint
	results   map[string]PushResult
	pushed    []pushed
	forgotten []string
}

func (f *fakeWarn) LiveEndpoints(context.Context, int64) ([]PushEndpoint, error) { return f.live, nil }

func (f *fakeWarn) Forget(_ context.Context, id string) error {
	f.forgotten = append(f.forgotten, id)
	return nil
}

func (f *fakeWarn) Send(_ context.Context, endpoint PushEndpoint, warning LeakWarning) PushResult {
	f.pushed = append(f.pushed, pushed{endpoint.ID, warning})
	if result, ok := f.results[endpoint.ID]; ok {
		return result
	}
	return Sent
}

func (f *fakeWarn) deps() WarnDeps { return WarnDeps{Store: f, Pusher: f} }

func (f *fakeWarn) pushedIDs() []string {
	ids := []string{}
	for _, p := range f.pushed {
		ids = append(ids, p.id)
	}
	return ids
}

func endpoints(ids ...string) []PushEndpoint {
	var all []PushEndpoint
	for _, id := range ids {
		all = append(all, PushEndpoint{ID: id, Endpoint: "https://push.example.com/" + id, P256dh: "key", Auth: "secret"})
	}
	return all
}

var leakStarted = EventDraft{ActiveLeak, 0, 1}

func warnAbout(t *testing.T, f *fakeWarn, events ...EventDraft) {
	t.Helper()
	if err := WarnAboutLeaks(context.Background(), f.deps(), 42, events); err != nil {
		t.Fatal(err)
	}
}

func TestOpensActiveLeak(t *testing.T) {
	for event, want := range map[EventDraft]bool{
		leakStarted:        true,
		{ActiveLeak, 0, 2}: true,
		{ActiveLeak, 2, 0}: false,
		{ActiveLeak, 1, 2}: false,
		{Backflow, 0, 1}:   false,
		{NoUse, 0, 1}:      false,
	} {
		if got := OpensActiveLeak(event); got != want {
			t.Errorf("OpensActiveLeak(%+v) = %v, want %v", event, got, want)
		}
	}
}

func TestWarnsEveryLiveEndpointOnceDeepLinkingToTheMeter(t *testing.T) {
	f := &fakeWarn{live: endpoints("a", "b")}
	warnAbout(t, f, leakStarted)

	assertEqual(t, f.pushedIDs(), []string{"a", "b"})
	assertEqual(t, f.pushed[0].warning, LeakWarning{
		Title: "Meter 42 is reporting a leak",
		Body:  "Water has run through it for much of the day, in bursts.",
		URL:   "/meter/42",
	})
}

func TestSaysAContinuousLeakNeverStopped(t *testing.T) {
	f := &fakeWarn{live: endpoints("a")}
	warnAbout(t, f, EventDraft{ActiveLeak, 0, 2})
	assertEqual(t, f.pushed[0].warning.Body, "Water has run through it without a break for a day.")
}

func TestPushesNothingForBackflowNoUseOrALeakClearing(t *testing.T) {
	f := &fakeWarn{live: endpoints("a")}
	warnAbout(t, f, EventDraft{Backflow, 0, 1}, EventDraft{NoUse, 0, 1}, EventDraft{ActiveLeak, 1, 0})
	warnAbout(t, f)
	assertEqual(t, f.pushed, nil)
}

func TestForgetsAnEndpointThePushServiceHasGivenUpOn(t *testing.T) {
	f := &fakeWarn{live: endpoints("a", "b"), results: map[string]PushResult{"a": Gone}}
	warnAbout(t, f, leakStarted)
	assertEqual(t, f.forgotten, []string{"a"})
	assertEqual(t, f.pushedIDs(), []string{"a", "b"})
}

func TestKeepsAnEndpointThatMerelyFailedAndWarnsTheRest(t *testing.T) {
	f := &fakeWarn{live: endpoints("a", "b"), results: map[string]PushResult{"a": Failed}}
	warnAbout(t, f, leakStarted)
	assertEqual(t, f.forgotten, nil)
	assertEqual(t, f.pushedIDs(), []string{"a", "b"})
}
