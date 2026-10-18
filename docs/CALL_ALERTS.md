# Hear incoming calls

## Send an easy invitation

1. Tap **Invite someone**.
2. Type their name if you want it filled in for them.
3. Tap **Create invitation**, then **Share invitation** or **Copy link**.

The other person opens your link. They never need your owner setup code, a password or a phone number. Microphone/camera permission is requested when a call is made or answered.

## On Android

Open the invitation in Chrome, tap **Accept invitation**, then **Enable call alerts** and allow notifications. Tap **Send test alert**. Close the page and lock the phone; a test should arrive after about eight seconds. Tap the alert and confirm **I heard it** only if it made a sound. If it did not, **I didn’t hear anything** shows the settings to check.

You can use the browser normally afterward. Force-stopping it, disabled notifications, battery restrictions, Do Not Disturb, offline state or OS throttling can prevent alerts.

## On iPhone or iPad

The invitation detects iPhone/iPad and shows three steps before accepting:

1. Tap the browser’s **Share** button.
2. Choose **Add to Home Screen**, then **Add**. Keep **Open as Web App** switched on if shown.
3. Open the new phone icon and finish the invitation.

Then enable call alerts and perform the same locked-phone sound test. Use this icon for later calls. This is a saved website, without an App Store download, but it is still a Home Screen web app installation. iOS/iPadOS 16.4 or later is required for Home Screen push. [Apple’s requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

If the new icon asks for an invitation, return to the original invitation, tap **Copy invitation for setup**, then tap **Paste invitation** in the new icon. If clipboard access is blocked, paste the complete link into the revealed field and press **Open invitation**. Links last 24 hours and work once. Ask for a fresh link if it has expired.

An existing Safari/browser identity does not automatically move into the Home Screen version. Do not clear its data. Ask a contact for a fresh invitation for the new icon; the old browser keeps its own conversations.

## When a call arrives

An initial alert and up to two reminders request your phone’s normal notification sound. Where the browser supports notification actions, press **Answer** to open the phone and accept that waiting call. The page may still need microphone permission or a playback tap. Press **Decline** to dismiss the waiting call without opening the page. If buttons are absent, tap the alert, then press the large **Answer** button on the page. While open, the page repeats a recognisable two-burst ringtone. If sound is blocked, tap **Tap to hear ringing**. **Decline** stops the call.

Reminder attempts happen at the start, 15 seconds and 35 seconds. Each attempt has at most 20 seconds of push-provider queue life (bounded by the original call deadline). They expire quickly in the push provider queue and stop when the call is answered, declined, cancelled or timed out. The phone does not flood the device with unlimited pushes. On browsers supporting renotify, reminders update one notification for that call with sound requested again (`renotify: true`, `silent: false`). Browsers without renotify receive a fresh reminder tag; cleanup removes older notices after the new one is displayed. A page claiming that its audio is running no longer silences those reminders: a sleeping phone can retain misleading page/audio state. The worker bounds the complete device-storage and server-status lookup to 1.5 seconds, so a blocked lookup cannot prevent notification display. The original waiting-call deadline is checked after that lookup; the shorter provider queue deadline does not incorrectly mark a still-waiting call as ended. Confirmed answered/ended calls and calls past their original deadline are shown silently. Cleanup failure cannot block that silent result. An already queued or displayed alert cannot always be recalled.

The server already requests `Urgency: high`, which asks the push provider for prompt delivery of a time-sensitive call; it does not select an OS notification channel or override its sound rules. The worker requests sound, vibration and a notification that remains available until acted on where supported. Heads-up banners, action buttons, lock-screen visibility and sound are chosen by the browser/OS and user settings. [Web Push urgency](https://www.rfc-editor.org/rfc/rfc8030.html#section-5.3), [Notification preferences](https://notifications.spec.whatwg.org/), [Apple sound and Focus controls](https://developer.apple.com/videos/play/wwdc2023/10120/).

The website cannot select a custom background ringtone, force notification volume, override Silent mode/Focus, or guarantee delivery or continuous ringing while closed. Repeated alerts may be quieted by the OS. The practical check is the sound test on each actual locked phone, followed by a real call from another device/network. Notification/history traces may remain.

## Check it again

Open **Settings → Set up call alerts → Send test alert**. If notifications were denied, enable them in the phone/browser settings, then return and try again. Check notification volume, Silent mode, Focus/Do Not Disturb and internet connectivity. On iPhone, open from the saved icon. A push registration alone does not prove the sound works.

## How the Answer button stays safe

A push arrival or a URL never grants permission to answer or starts the microphone. Only a notification-button click records a one-use answer decision for the current local identity and call ID. The decision expires in at most 30 seconds. The page consumes it atomically, waits for the signed encrypted offer, verifies the current server state and answers only that incoming call while visible. Stale, answered, foreign-device and duplicate decisions do not answer calls. Storage/network failure leaves the normal Answer button available. Expired decision metadata is removed the next time the app consumes/clears this store; a suspended browser cannot physically purge it on a deadline. No message text, caller name, credentials or media enters this decision store.

A notification decline uses an authenticated, origin-checked request restricted to the intended recipient of a waiting call. It cannot end an already answered call. If the request fails, a silent notice offers to open the page and decline there. Remaining reminder jobs stop on successful decline; already delivered/in-flight notifications cannot always be recalled.

## Opening a message notification

Message notices now say **New message**, without “Private,” names or content. Tapping one opens that sender’s conversation and scrolls to the still-available, verified message. If the message expired or was deleted, the conversation opens without recovering the vanished content. Removed/untrusted contacts cannot be opened. Older notices lacking the new routing metadata retain the contact-list fallback.

The worker transfers opaque IDs through a short-lived, one-use local record scoped to the current identity. The app URL stays at the phone’s base address; no chat ID, sender name or message text is placed in a URL. The decision is valid for at most two minutes and cleared when consumed or the device is removed; suspended browsers can retain expired metadata until running again. Notification metadata and browser/OS history are not forensic-proof deletion. See [Browser privacy](BROWSER_PRIVACY.md).

## If sound stopped after an update

Open this phone once on the receiving device and reload the page to pick up the latest notification worker. Worker registration bypasses its import cache during updates. In **Settings → Call alerts**, press **Send test alert**, close the page and lock the phone. Then have another device make a real call and leave it waiting for at least 35 seconds to exercise all three attempts. Confirm **I heard it** only after a real sound. A closed browser does not need an open WebSocket for these server push attempts.

A silent visible notice points to phone/browser notification sound controls; no notice can also mean delivery or subscription trouble. If needed, **Enable call alerts** registers the browser's current subscription again. Do not clear site data to troubleshoot: that removes the phone's identity and conversations. Notification delivery and audible sound still require an actual device test; automated tests verify sound requests, not the OS's output. [Chrome notification replacement and sound requests](https://developer.chrome.com/blog/notifications).

## Optional extra ringing

If enabled by your server operator, **Settings → Extra ringing · ntfy** adds another alert through the free ntfy app. It does not replace these browser alerts or change call encryption. Call and test alerts use **priority 5 (Max / urgent)**. Complete the locked-phone test before relying on it. Android sound is selected in ntfy’s Max priority notification channel; stock iPhone ntfy does not have a separate ringtone picker. See [Extra ringing](EXTRA_RINGING.md) for exact phone steps, sound settings, browser-opening differences and troubleshooting. Installing the optional relay is the operator’s job; invited people never need its publishing token.
