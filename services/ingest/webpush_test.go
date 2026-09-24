package ingest

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/SherClockHolmes/webpush-go"
)

func TestEndpointGone(t *testing.T) {
	for status, want := range map[int]bool{404: true, 410: true, 400: false, 429: false, 500: false, 0: false} {
		if got := EndpointGone(status); got != want {
			t.Errorf("EndpointGone(%d) = %v, want %v", status, got, want)
		}
	}
}

// device is a browser's push subscription keys, real enough for webpush-go to encrypt to.
func device(t *testing.T) (p256dh, auth string) {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	secret := make([]byte, 16)
	rand.Read(secret)
	return base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()), base64.RawURLEncoding.EncodeToString(secret)
}

func pushTo(t *testing.T, url string) PushResult {
	t.Helper()
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	p256dh, auth := device(t)
	pusher := NewWebPushPusher(VapidDetails{Subject: "mailto:you@example.com", PublicKey: public, PrivateKey: private})
	return pusher.Send(context.Background(), PushEndpoint{ID: "one", Endpoint: url, P256dh: p256dh, Auth: auth}, LeakWarning{Title: "t"})
}

func TestWebPushPusherReadsThePushServicesAnswer(t *testing.T) {
	for status, want := range map[int]PushResult{201: Sent, 404: Gone, 410: Gone, 400: Failed, 429: Failed, 500: Failed} {
		service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("TTL") != "21600" {
				t.Errorf("TTL = %q", r.Header.Get("TTL"))
			}
			w.WriteHeader(status)
		}))
		if got := pushTo(t, service.URL); got != want {
			t.Errorf("answered %d: got %s, want %s", status, got, want)
		}
		service.Close()
	}
}

func TestWebPushPusherFailsWhenThePushServiceIsUnreachable(t *testing.T) {
	service := httptest.NewServer(http.NotFoundHandler())
	service.Close()
	if got := pushTo(t, service.URL); got != Failed {
		t.Errorf("got %s, want failed", got)
	}
}
