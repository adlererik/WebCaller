# Optional extra ringing with self-hosted ntfy

WebCaller keeps its normal Web Push and encrypted WebSocket signaling. After a recipient confirms the locked-phone ntfy sound test, incoming calls prefer ntfy and suppress duplicate browser call alerts. Phones without confirmed ntfy use Web Push as before. This is an optional notification service, not a native telephone-call service or a guarantee of ringing through Silent mode, Focus, no connectivity, force-stop, denied permissions or battery restrictions.

## One call-alert method per phone

- **ntfy tested and selected:** call notifications use ntfy. Successful ntfy publishing suppresses browser call pushes, including later reminders.
- **No ntfy, untested ntfy, or browser alerts selected:** call notifications use Web Push. Text-message pushes and encrypted live call signaling continue normally.
- **ntfy publishing fails or times out:** browser call pushes take over for the rest of that call. The next call can try ntfy again. Ended calls cannot trigger a late fallback.

Use **Settings → Extra ringing · ntfy → Use browser call alerts instead** to switch this phone back. **Use ntfy call alerts** switches back without changing the subscription or repeating a successful sound test. If ntfy has been uninstalled, muted or stopped by the phone, choose browser alerts or run **Test the sound** again. Passing a new sound test selects ntfy again.

The server can detect a failed publishing request; it cannot prove that the phone displayed or sounded an accepted alert. A lost publishing response can also cause an ambiguous fallback. Zero duplicate notifications and guaranteed failover cannot both be promised with stock notification clients. Existing browser push subscriptions stay saved for fallback and messages.

## Open and answer a call

Tap **Open call** in the ntfy notification, then **Answer** in WebCaller. The button opens that specific waiting call, using the existing saved browser identity and verified encrypted offer. It does not answer in the background or request microphone/camera access. The phone may need to be unlocked and permissions allowed. If the link opens a different browser or Safari instead of the existing Home Screen phone, open your usual phone icon; identities and conversation keys are never copied between profiles. Expired, unrelated and already answered calls cannot be opened as new calls.

## Set up a phone

1. In WebCaller, open **Settings → Extra ringing · ntfy**. It is also offered in the normal call-alert guide when the server has enabled it.
2. Tap **Get the free ntfy app**, install it, allow notifications, then return to WebCaller and tap **I have ntfy**.
3. On **Android**, tap **Connect this phone**. This opens ntfy and subscribes automatically. Leave its instant delivery service running. If the link cannot open the app, the same screen has copy buttons for the server and subscription topic: add them with ntfy's **+** button.
4. On **iPhone**, open ntfy and tap **+**. Paste WebCaller's **Subscription topic** into **Topic name**, turn on **Use another server**, then paste WebCaller's **Server** into **Service URL**. Tap **Subscribe**. The topic is the long value beginning `wc_`; “Incoming calls” is only its friendly display name. Copy the values from WebCaller on **that same phone**. No username/password is needed for this installer's read-only subscriptions. [The iPhone subscription form](https://github.com/binwiederhier/ntfy-ios/blob/main/ntfy/Views/Subscriptions/SubscriptionAddView.swift).
5. Return to WebCaller and tap **Test the sound**. Close the page and lock the phone. About eight seconds later, tap the ntfy test notification. Confirm **I heard it and opened my phone** only if it made a sound and opened the same WebCaller identity. If it opened Safari or a different browser, return to your usual phone icon and choose **I heard it · use my phone icon** instead. This explicitly enables the sound with a manual return to the phone; it does not claim the link was verified. Merely allowing notifications does not mark setup as tested. ntfy becomes the preferred call-alert method after the heard-sound confirmation.

### Choose the sound

WebCaller sends both ntfy call alerts and sound tests at **priority 5 — Max / urgent**, the highest ntfy priority. This is separate from the normal browser alerts' high urgency. The phone still decides what makes a sound.

**Android:** in ntfy, open **Settings → Notifications → Channel settings → Max priority → Sound**, then choose your sound. Names vary with Android version; some show “Urgent.” Enable sound and pop-up/banner alerts in that channel. ntfy also offers **Keep alerting for highest priority** if you want repeated sound until the notification is dismissed. Answering the web call does not guarantee dismissal of an already delivered ntfy notification, so you may need to dismiss it yourself. These channel settings affect other priority-5 subscriptions in ntfy too. [Android channel labels and repeat option](https://github.com/binwiederhier/ntfy-android/blob/main/app/src/main/res/values/strings.xml), [priority behavior](https://docs.ntfy.sh/publish/#message-priority).

**iPhone:** first enable **Settings → Notifications → ntfy → Sounds**. Stock ntfy does not currently have its own ringtone picker. On iOS versions offering **Settings → Sounds & Haptics → Default Alerts**, that setting changes the ordinary default alert sound for ntfy and other apps using it. Critical Alerts, if separately enabled in ntfy and allowed by iOS, use the client's critical sound instead; changing Default Alerts does not choose that sound. Maximum priority alone does not grant Critical Alerts permission or promise continuous ringing. Test with the phone locked after changing settings. [Apple notification controls](https://support.apple.com/en-mt/guide/iphone/iph7c3d96bab/ios), [ntfy's iPhone sound selection](https://github.com/binwiederhier/ntfy-ios/blob/main/ntfy/Utils/NotificationContent.swift), [custom sound request](https://github.com/binwiederhier/ntfy/issues/1317).

### If setup gets stuck

| What you see | What to do |
|---|---|
| “Switching to WebSockets…” | Choose **Enable now** when the operator has configured WebSocket forwarding. It can improve battery use. If it stops connecting, ask the operator to check the proxy; this does not require new router ports. |
| “Login required” | Go back and re-copy the **Server** and full `wc_` **Subscription topic** from this phone's WebCaller. Do not enter “Incoming calls” as the topic or use the public ntfy.sh server. If correct values still fail, the operator should check relay/proxy authorization. Never give the phone the server publishing token. |
| “Unable to resolve host” | Check the spelling and ask the operator to check DNS. A newly added hostname can remain cached as missing on Wi-Fi for a while. Once DNS is correct, wait for its cache to expire and reconnect the phone. Keep HTTPS; do not replace the hostname with a proxy IP. |
| Alert is visible but silent | Check the priority-5 channel on Android; Sounds, Silent mode and Focus on iPhone; then repeat WebCaller's locked-phone sound test. |
| ntfy cannot send its own test | Expected with these read-only subscriptions. Use **Test the sound** inside WebCaller, not ntfy's publish box. |
| Alert opens a different identity | Use the usual WebCaller icon and the explicit phone-icon fallback below. Do not clear site data or register again. |

The WebSocket recommendation and instant-delivery service are documented by the [Android client](https://docs.ntfy.sh/subscribe/phone/). A family member can help with setup once; the recipient normally only taps an alert or their usual phone icon, then **Answer**.

**Different browser warning:** iPhone ntfy may open Safari instead of an existing Home Screen phone, and Android may open a different default browser. Browser profiles have separate identities. WebCaller detects a mismatch and tells you to open your usual phone icon/browser. It never transfers keys or resets identity pins to make the link work. If the direct opening link cannot reach your phone, the sound can still be enabled with the explicit phone-icon fallback. Use your usual icon after hearing an alert. Normal Web Push remains available too. Do not delete an existing identity to troubleshoot notification links. Physical-phone verification is required; desktop tests cannot certify native app routing.

To stop extra alerts, use **Disconnect extra ringing** in WebCaller. Remove the old Incoming calls subscription in ntfy too. Reconnecting creates a fresh read address; normal browser alerts stay enabled.

## Prebuilt Docker installation

For a fresh all-container installation, follow the [prebuilt Docker guide](../docker/README.md) and enable ntfy in its setup wizard. That package initializes a separate ntfy state volume and publisher-secret volume automatically. Do not run the native installer below inside Docker. Its exact private-network HTTP destination requires the package’s explicit server-only opt-in; ordinary native validation remains HTTPS/loopback only. Phone subscription, sound tests, read capabilities and encryption boundaries remain as described above.

## Install on Debian

This section is for the person running the server, not an invited caller. This optional installer is separate from the main phone installer. It works with an existing **systemd** WebCaller installation on Debian amd64/arm64; start with the [native installation guide](INSTALL_NATIVE.md) for a fresh setup. It does not configure Docker installations or change router forwarding. If you already use Docker, keep that working installation; do not run a second phone server to add alerts. The manual Docker requirements are below. The helper installs a pinned official ntfy 2.31.1 binary after verifying the pinned architecture-specific SHA-256 checksum.

1. Choose a **separate hostname**, such as `ntfy.example.com`, replacing `example.com` with your existing domain. This adds a subdomain, not a new domain registration. A path on the phone's existing hostname is not origin isolation.
2. With Cloudflare Tunnel, go to **Networking → Tunnels → your existing tunnel → Routes → Add route → Published application**. Set **Subdomain** to `ntfy`, select your own **Domain**, leave **Path** empty and enter **Service URL** `http://127.0.0.1:8094`. Older screens use type **HTTP** and URL **127.0.0.1:8094**. Preserve existing routes. This assumes cloudflared runs directly on the same host. No router port needs to be opened for ntfy. Do not put interactive Cloudflare Access login in front of this route: native clients must maintain subscriptions. WebSockets and long-lived HTTP subscriptions must reach ntfy. With a conventional reverse proxy, send this hostname to loopback port 8094 with streaming/WebSocket support and a valid HTTPS certificate; do not log topic paths. [Cloudflare route guide](https://developers.cloudflare.com/tunnel/get-started/#publish-an-application).
3. Run from the project directory, adjusting the `.env` path and existing systemd phone service name:

   ```sh
   python3 deploy/install-ntfy.py --host ntfy.example.com --app-env /opt/webcaller/.env --app-service webcaller.service --ios --check
   sudo python3 deploy/install-ntfy.py --host ntfy.example.com --app-env /opt/webcaller/.env --app-service webcaller.service --ios
   ```

   `--check` makes no changes. `--ios` enables the wake-up metadata relay described below. Omit it for Android-only delivery without that relay. Do not post the `.env`, account database, read address or installer backups publicly.
4. Check `sudo systemctl status webcaller-ntfy.service` and the phone's health endpoint. From outside your Wi-Fi, verify `https://ntfy.example.com/v1/health`, then use the phone setup/test above. HTTP publishing without a credential must return 401/403.

The service listens only on `127.0.0.1:8094`. A dedicated systemd **DynamicUser** has access to its own state directory, with `ProtectHome`, `ProtectSystem`, no capabilities and no privilege escalation. It has no WebCaller data/configuration mounts. The installer generates a publishing account with **write-only** permission on `wc_*`, a server-side token, deny-all default access and anonymous **read-only** permission on that namespace. It checks actual read/write access before adding the private environment values and restarting the phone. It backs up only the previous `.env` under the ignored `.runtime` directory and restores it if the phone fails its health check. It refuses to replace a configured ntfy installation; upgrades require reviewing the existing service and binary checksum. No existing identities, pins, ratchet state, TURN configuration or router ports are reset.

For another ntfy deployment, set these three private WebCaller environment values together:

```dotenv
NTFY_PUBLIC_URL=https://ntfy.example.com
NTFY_PUBLISH_URL=http://127.0.0.1:8094
NTFY_PUBLISH_TOKEN=
NTFY_IOS_UPSTREAM=true
```

The empty token in this example is intentional: use the real write-only publisher token only in your private configuration. `NTFY_IOS_UPSTREAM=true` tells onboarding that your ntfy service actually has `upstream-base-url: https://ntfy.sh`; it does not configure ntfy by itself. HTTPS publishing URLs are supported; plaintext HTTP is accepted only for loopback. Browser clients cannot choose the server URL, topic or publishing token. A partial configuration fails startup rather than enabling unsafe defaults. Leave all three values empty to disable the integration. Docker operators need a separately isolated ntfy container/host, an HTTPS publishing endpoint reachable by WebCaller, the same ACLs, retention and public reverse-proxy configuration; the systemd installer should not be run inside the app container.

## Security and privacy boundary

- Each browser identity receives a random **256-bit read capability**, encoded in a subscription topic. Possessing this address allows reading its generic alerts without a separate password, making Android enrollment one tap. It is not an authenticated user account: **keep the address private**. Anyone who learns it can observe the device's alert timing and opaque call references until disconnected. Other users cannot obtain it through WebCaller's authenticated setup API. Guessing another device's independent random topic is infeasible.
- Anonymous clients cannot publish. The publishing credential stays on the WebCaller server and has no access to chat content or encryption keys. An ntfy credential/service compromise could cause fake/noisy/stale alerts or denial of alerts; it does not authenticate a caller. Isolation reduces host access; it is not protection from full host compromise.
- Alerts contain a generic Incoming call title/body, an opaque call ID and recipient ID in a URL fragment, and an **Open call** action. No caller names, chat/media, SDP/ICE, TURN credentials, private keys, Olm state, SAS secrets or WebCaller login tokens are sent to ntfy. The external URL cannot create an answer intent or request microphone/camera access. The authenticated recipient can fetch the exact waiting encrypted offer to open its call screen. Existing signature, contact identity and encryption checks, plus an explicit in-page Answer action, remain necessary.
- Olm Double Ratchet, existing identity pins, per-call SAS and DTLS-SRTP media encryption are unchanged. Adding an alert path does not upgrade or replace those protections. Trust in browser-delivered application code and endpoint security remains necessary.
- Call alerts select ntfy or browser push per recipient. A failed ntfy publish selects browser push for the rest of that call; accepted ntfy publishes suppress duplicate browser call pushes. Publishing has a bounded timeout. At most three attempts are scheduled while a call is still waiting: immediately, after 15 seconds and after 35 seconds. Answer, decline, hang-up, expiry, contact removal and device removal stop later attempts and abort outstanding ntfy requests where possible. An already accepted/queued native notification may still sound after cancellation; there is no cross-platform guarantee of retracting it. Opening an expired alert cannot answer an ended call.
- ntfy retains **generic alerts in memory for two minutes**, with periodic cleanup, to allow iPhone wake-up fetches. This is not a per-notification delivery TTL. OS/native app queues and records can last longer; ntfy has its own history/settings. WebCaller does not claim zero traces or erase another app's notification history. Do not enable request-path/debug logs on the relay/proxy if subscription-address privacy matters.

### Self-hosting and iPhone wake-up

The actual alert is stored/fetched on your server. Stock ntfy **Android** self-hosted subscriptions use its foreground instant-delivery service. Stock ntfy **iPhone** needs `ntfy.sh` as an upstream wake-up relay plus Firebase/Apple push infrastructure for prompt background delivery. The upstream receives a hash of the subscription URL and an opaque message ID; the phone fetches the actual generic alert from your own ntfy server. It receives no call media/chat/key material from this integration. Without the upstream, iPhone notification delivery can be delayed by many minutes or hours. Therefore this setup is self-hosted for the application/alert contents, **not a promise of zero third-party push infrastructure**.

Official references: [Phone clients and Android deep links](https://docs.ntfy.sh/subscribe/phone/), [access control](https://docs.ntfy.sh/config/#access-control), [iPhone instant notifications](https://docs.ntfy.sh/config/#ios-instant-notifications), [message caching](https://docs.ntfy.sh/publish/#message-caching), [priority and sound](https://docs.ntfy.sh/publish/#message-priority).
