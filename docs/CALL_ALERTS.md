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

An initial alert and up to two reminders request your phone’s normal notification sound. Tap an alert, then press **Answer** on the page. While open, the page repeats a recognisable two-burst ringtone. If sound is blocked, tap **Tap to hear ringing**. **Decline** stops the call.

Reminder attempts happen at the start, 15 seconds and 35 seconds. They expire quickly in the push provider queue and stop when the call is answered, declined, cancelled or timed out. The phone does not flood the device with unlimited pushes. Older notifications are closed when the worker runs, and ended calls are shown silently if their delayed push arrives. An already queued or displayed alert cannot always be recalled.

The website cannot select a custom background ringtone, force notification volume, override Silent mode/Focus, or guarantee delivery or continuous ringing while closed. Repeated alerts may be quieted by the OS. The practical check is the sound test on each actual locked phone, followed by a real call from another device/network. Notification/history traces may remain.

## Check it again

Open **Settings → Set up call alerts → Send test alert**. If notifications were denied, enable them in the phone/browser settings, then return and try again. Check notification volume, Silent mode, Focus/Do Not Disturb and internet connectivity. On iPhone, open from the saved icon. A push registration alone does not prove the sound works.
