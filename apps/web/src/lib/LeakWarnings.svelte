<script lang="ts">
  import { dev } from "$app/environment";
  import { onMount } from "svelte";

  let { meterId, publicKey }: { meterId: string; publicKey: string } = $props();

  type Warnings = "unsupported" | "blocked" | "off" | "on" | "working";

  let warnings = $state<Warnings>("working");
  let failure = $state("");

  const supported = () =>
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // The build is a module in dev and a bundle in production, and registering says which it is.
  const register = () =>
    navigator.serviceWorker.register("/service-worker.js", { type: dev ? "module" : "classic" });

  const warningsUrl = $derived(`/meter/${meterId}/warnings`);

  /** The key a subscription was made with, telling one this app can still push to from one it cannot. */
  function subscribedKey(subscription: PushSubscription): string {
    const key = subscription.options.applicationServerKey;
    if (!key) return "";

    const bytes = String.fromCharCode(...new Uint8Array(key));
    return btoa(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  /** What this device is already subscribed with, dropping one no push of ours could reach. */
  async function held(
    registration: ServiceWorkerRegistration | undefined,
  ): Promise<PushSubscription | null> {
    const subscription = (await registration?.pushManager.getSubscription()) ?? null;
    if (!subscription) return null;

    // A key this app no longer signs with can never be pushed to, and blocks subscribing again.
    if (subscribedKey(subscription) !== publicKey) {
      await subscription.unsubscribe();
      return null;
    }
    return subscription;
  }

  onMount(async () => {
    if (!supported()) {
      warnings = "unsupported";
      return;
    }
    if (Notification.permission === "denied") {
      warnings = "blocked";
      return;
    }

    const subscription = await held(await navigator.serviceWorker.getRegistration());
    // The browser can hold a subscription this app has since dropped — a revoked Grant, or an
    // endpoint a push service declared gone — so the page says on only once it is held both ends.
    warnings = subscription && (await tell(subscription)) ? "on" : "off";
  });

  /** Whether the app took the endpoint, which is the only thing that decides it will be warned. */
  async function tell(subscription: PushSubscription): Promise<boolean> {
    const response = await fetch(warningsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription),
    });
    return response.ok;
  }

  async function turnOn(): Promise<void> {
    warnings = "working";
    failure = "";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      warnings = permission === "denied" ? "blocked" : "off";
      return;
    }

    const registration = await register();
    await navigator.serviceWorker.ready;
    const subscription =
      (await held(registration)) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      }));

    if (!(await tell(subscription))) {
      // Nothing here can reach this device, so leave the browser holding nothing either.
      await subscription.unsubscribe();
      throw new Error("Turning on leak warnings failed");
    }

    warnings = "on";
  }

  async function turnOff(): Promise<void> {
    warnings = "working";
    failure = "";

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      const response = await fetch(warningsUrl, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      // Unsubscribing while the app still holds the endpoint would leave it pushing into nothing.
      if (!response.ok) throw new Error("Turning off leak warnings failed");

      await subscription.unsubscribe();
    }

    warnings = "off";
  }

  function attempt(change: () => Promise<void>): () => Promise<void> {
    return async () => {
      try {
        await change();
      } catch (error) {
        console.error(error);
        failure = "That did not work. Try again, or reload the page.";
        warnings = Notification.permission === "denied" ? "blocked" : "off";
      }
    };
  }
</script>

<h2>Leak warnings</h2>

{#if warnings === "unsupported"}
  <p class="muted">This browser cannot show leak warnings.</p>
{:else if warnings === "blocked"}
  <p class="muted">
    This browser is blocking notifications from us. Allow them in its site settings to get leak
    warnings.
  </p>
{:else}
  <p class="muted">
    {#if warnings === "on"}
      This device is warned when the meter starts reporting a leak, even with the page closed.
    {:else}
      Get a warning on this device when the meter starts reporting a leak, even with the page
      closed. Nothing else is sent.
    {/if}
  </p>
  <button onclick={attempt(warnings === "on" ? turnOff : turnOn)} disabled={warnings === "working"}>
    {warnings === "on" ? "Turn off leak warnings" : "Turn on leak warnings"}
  </button>
{/if}

{#if failure}
  <p class="warning">{failure}</p>
{/if}

<style>
  button {
    font: inherit;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: none;
    color: inherit;
  }

  .warning {
    font-size: 0.875rem;
    color: var(--danger);
  }
</style>
