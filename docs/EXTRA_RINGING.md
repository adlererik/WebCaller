# Optional extra ringing with self-hosted ntfy

WebCaller keeps its normal Web Push and encrypted WebSocket signaling. A recipient can optionally install the free ntfy app for another incoming-call sound. Recipients without ntfy can continue calling and messaging normally. This is an extra notification path, not a native telephone-call service or a guarantee of ringing through Silent mode, Focus, no connectivity, force-stop, denied permissions or battery restrictions.

## Set up a phone

1. In WebCaller, open **Settings → Extra ringing · ntfy**. It is also offered in the normal call-alert guide when the server has enabled it.
2. Tap **Get the free ntfy app**, install it, allow notifications, then return to WebCaller and tap **I have ntfy**.
3. On **Android**, tap **Connect this phone**. This opens ntfy and subscribes automatically. Leave its instant delivery service running. If the link cannot open the app, the same screen has copy buttons for the server and subscription topic: add them with ntfy's **+** button.
4. On **iPhone**, open ntfy and use **+**, choose a different server, then paste **Server** and **Subscription topic** using the two copy buttons. No account password is needed. The stock iPhone client does not provide the documented Android subscription deep link, so these two pastes cannot safely be removed.
5. Return to WebCaller and tap **Test the sound**. Close the page and lock the phone. About eight seconds later, tap the ntfy test notification. Confirm **I heard it and opened my phone** only if it made a sound and opened the same WebCaller identity. If it opened Safari or a different browser, return to your usual phone icon and choose **I heard it · use my phone icon** instead. This explicitly enables the sound with a manual return to the phone; it does not claim the link was verified. Merely allowing notifications does not mark setup as tested. Extra call alerts start after the heard-sound confirmation.

Android notification channels let the user choose the Urgent sound and banners. The website cannot change those settings. iPhone uses the stock client's permitted notification behavior.

**Different browser warning:** iPhone ntfy may open Safari instead of an existing Home Screen phone, and Android may open a different default browser. Browser profiles have separate identities. WebCaller detects a mismatch and tells you to open your usual phone icon/browser. It never transfers keys or resets identity pins to make the link work. If the direct opening link cannot reach your phone, the sound can still be enabled with the explicit phone-icon fallback. Use your usual icon after hearing an alert. Normal Web Push remains available too. Do not delete an existing identity to troubleshoot notification links. Physical-phone verification is required; desktop tests cannot certify native app routing.

To stop extra alerts, use **Disconnect extra ringing** in WebCaller. Remove the old Incoming calls subscription in ntfy too. Reconnecting creates a fresh read address; normal browser alerts stay enabled.

## Install on Debian

This optional installer is separate from the main phone installer. It works with an existing **systemd** WebCaller installation on Debian amd64/arm64; it does not configure Docker installations or change router forwarding. It installs a pinned official ntfy 2.31.1 binary after verifying the pinned architecture-specific SHA-256 checksum.

1. Choose a **separate hostname**, such as `ntfy.example.com`. A path on the phone's existing hostname is not origin isolation.
2. With Cloudflare Tunnel, add a **published application route** on your existing tunnel: hostname `ntfy.example.com`, service type **HTTP**, URL **127.0.0.1:8094**. Preserve existing routes. No router port needs to be opened for ntfy. Do not put interactive Cloudflare Access login in front of this route: native clients must maintain subscriptions. WebSockets and long-lived HTTP subscriptions must reach ntfy. With a conventional reverse proxy, send this hostname to loopback port 8094 with streaming/WebSocket support and a valid HTTPS certificate; do not log topic paths.
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
- Alerts contain a generic Incoming call title/body, an opaque call ID and recipient ID in a URL fragment, and an **Open call** action. No caller names, chat/media, SDP/ICE, TURN credentials, private keys, Olm state, SAS secrets or WebCaller login tokens are sent to ntfy. The external URL cannot create an answer intent or request microphone/camera access. The existing signed encrypted offer, contact identity checks and an explicit in-page Answer action remain necessary.
- Olm Double Ratchet, existing identity pins, per-call SAS and DTLS-SRTP media encryption are unchanged. Adding an alert path does not upgrade or replace those protections. Trust in browser-delivered application code and endpoint security remains necessary.
- Browser push and ntfy send independently, with bounded requests. At most three attempts are scheduled while a call is still waiting: immediately, after 15 seconds and after 35 seconds. Answer, decline, hang-up, expiry, contact removal and device removal stop later attempts and abort outstanding ntfy requests where possible. An already accepted/queued native notification may still sound after cancellation; there is no cross-platform guarantee of retracting it. Opening an expired alert cannot answer an ended call.
- ntfy retains **generic alerts in memory for two minutes**, with periodic cleanup, to allow iPhone wake-up fetches. This is not a per-notification delivery TTL. OS/native app queues and records can last longer; ntfy has its own history/settings. WebCaller does not claim zero traces or erase another app's notification history. Do not enable request-path/debug logs on the relay/proxy if subscription-address privacy matters.

### Self-hosting and iPhone wake-up

The actual alert is stored/fetched on your server. Stock ntfy **Android** self-hosted subscriptions use its foreground instant-delivery service. Stock ntfy **iPhone** needs `ntfy.sh` as an upstream wake-up relay plus Firebase/Apple push infrastructure for prompt background delivery. The upstream receives a hash of the subscription URL and an opaque message ID; the phone fetches the actual generic alert from your own ntfy server. It receives no call media/chat/key material from this integration. Without the upstream, iPhone notification delivery can be delayed by many minutes or hours. Therefore this setup is self-hosted for the application/alert contents, **not a promise of zero third-party push infrastructure**.

Official references: [Phone clients and Android deep links](https://docs.ntfy.sh/subscribe/phone/), [access control](https://docs.ntfy.sh/config/#access-control), [iPhone instant notifications](https://docs.ntfy.sh/config/#ios-instant-notifications), [message caching](https://docs.ntfy.sh/publish/#message-caching), [priority and sound](https://docs.ntfy.sh/publish/#message-priority).
