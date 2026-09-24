package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/getsentry/sentry-go"
)

type VapidDetails struct {
	// Subject is who the push service should contact about this app, as a mailto: or https: URL.
	Subject    string
	PublicKey  string
	PrivateKey string
}

// ttlSeconds: a leak warning is stale once the leak has had time to be seen on the page.
const ttlSeconds = 6 * 60 * 60

// EndpointGone is whether the push service has given up on this endpoint, as opposed to merely
// failing us: both codes mean the device will never accept another push, however long we keep it.
func EndpointGone(status int) bool {
	return status == http.StatusNotFound || status == http.StatusGone
}

type webPushPusher struct{ vapid VapidDetails }

func NewWebPushPusher(vapid VapidDetails) Pusher { return webPushPusher{vapid} }

func (p webPushPusher) Send(ctx context.Context, endpoint PushEndpoint, warning LeakWarning) PushResult {
	status, err := p.send(ctx, endpoint, warning)
	if EndpointGone(status) {
		return Gone
	}
	if err != nil {
		// One unreachable push service must not cost the other devices their warning.
		log.Printf("ingest: pushing a leak warning to %s failed: %v", endpoint.Endpoint, err)
		sentry.CaptureException(err)
		return Failed
	}
	return Sent
}

func (p webPushPusher) send(ctx context.Context, endpoint PushEndpoint, warning LeakWarning) (int, error) {
	message, err := json.Marshal(warning)
	if err != nil {
		return 0, err
	}

	response, err := webpush.SendNotificationWithContext(ctx, message, &webpush.Subscription{
		Endpoint: endpoint.Endpoint,
		Keys:     webpush.Keys{P256dh: endpoint.P256dh, Auth: endpoint.Auth},
	}, &webpush.Options{
		// webpush-go adds the mailto: itself unless the subject is an https: URL.
		Subscriber:      strings.TrimPrefix(p.vapid.Subject, "mailto:"),
		VAPIDPublicKey:  p.vapid.PublicKey,
		VAPIDPrivateKey: p.vapid.PrivateKey,
		TTL:             ttlSeconds,
	})
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode > 299 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return response.StatusCode, fmt.Errorf("push service answered %d: %s", response.StatusCode, body)
	}
	return response.StatusCode, nil
}
