package ingest

import (
	"crypto/rand"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/getsentry/sentry-go"
)

type BrokerConfig struct {
	URL      string
	Topic    string
	Username string
	Password string
}

const (
	initialReconnect = time.Second
	maxReconnect     = time.Minute
	// attemptsBeforeReporting is how many reconnects to tolerate before an outage is worth waking a human over.
	attemptsBeforeReporting = 5
)

func reconnectDelay(attempts int) time.Duration {
	if attempts >= 6 {
		return maxReconnect
	}
	return min(initialReconnect<<attempts, maxReconnect)
}

// Broker holds the subscription SubscribeToBroker opened.
type Broker struct {
	client mqtt.Client
	stop   chan struct{}
}

// SubscribeToBroker subscribes to the rtl_433 topic and hands every payload to onPayload, one at a
// time and in order, reconnecting on its own with exponential backoff and reporting a sustained
// outage to Sentry once.
func SubscribeToBroker(config BrokerConfig, onPayload func([]byte)) *Broker {
	lost := make(chan struct{}, 1)
	options := mqtt.NewClientOptions().
		AddBroker(config.URL).
		SetClientID("meter-reader-ingest-" + rand.Text()[:8]).
		SetUsername(config.Username).
		SetPassword(config.Password).
		// paho retries on a fixed interval before its first connection, so backoff has to be driven here.
		SetAutoReconnect(false).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			log.Printf("ingest: MQTT connection lost: %v", err)
			lost <- struct{}{}
		}).
		SetOnConnectHandler(func(client mqtt.Client) {
			token := client.Subscribe(config.Topic, 0, func(_ mqtt.Client, message mqtt.Message) {
				onPayload(message.Payload())
			})
			if token.Wait(); token.Error() != nil {
				sentry.CaptureException(token.Error())
				log.Printf("ingest: cannot subscribe to %s: %v", config.Topic, token.Error())
				return
			}
			log.Printf("ingest: subscribed to %s", config.Topic)
		})

	broker := &Broker{client: mqtt.NewClient(options), stop: make(chan struct{})}
	go broker.stayConnected(config.URL, lost)
	return broker
}

func (b *Broker) stayConnected(url string, lost <-chan struct{}) {
	attempts := 0
	outageReported := false
	for {
		token := b.client.Connect()
		if token.Wait(); token.Error() == nil {
			attempts = 0
			outageReported = false
			select {
			case <-lost:
			case <-b.stop:
				return
			}
		} else {
			log.Printf("ingest: MQTT error: %v", token.Error())
		}

		delay := reconnectDelay(attempts)
		attempts++
		if attempts >= attemptsBeforeReporting && !outageReported {
			outageReported = true
			sentry.WithScope(func(scope *sentry.Scope) {
				scope.SetLevel(sentry.LevelError)
				scope.SetContext("broker", sentry.Context{"url": url, "attempts": attempts})
				sentry.CaptureMessage("ingest: cannot reach the MQTT broker")
			})
		}

		log.Printf("ingest: MQTT broker unreachable, retrying in %s", delay)
		select {
		case <-time.After(delay):
		case <-b.stop:
			return
		}
	}
}

// Close disconnects and stops reconnecting.
func (b *Broker) Close() {
	close(b.stop)
	b.client.Disconnect(250)
}
