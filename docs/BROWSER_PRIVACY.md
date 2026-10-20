# What this web phone can keep private

This release uses libsignal/PQXDH with Ed25519 application signatures. [Install](INSTALL.md) · [Security](SECURITY.md) · [Olm upgrade planning](APPROVED_CUTOVER.md).

The app minimizes traces it creates, but it cannot make use of a website invisible to someone inspecting an unlocked phone or browser.

## What the app does

- Conversations open inside the page, without creating a new browser-history entry for each contact/message.
- Notification routing IDs are handed to the app through a short-lived one-use local record, rather than URL query/fragment parameters. Notices say **New message**, without names, message text or file names.
- Owner setup fragments are cleared on entry; invitation fragments are retained only when needed for the iPhone Home Screen handoff and cleared after acceptance. This does not guarantee that an earlier URL was never recorded by a browser or copied elsewhere.
- Responses use `Cache-Control: no-store`; the service worker has no page/message fetch cache. The app adds no analytics or browser-history log.
- Messages/drafts and decrypted media are cleared from memory when the page is hidden. Saved attachment bytes remain encrypted, with deletion/expiry enforcement, so reopening does not redownload them. Keys, contacts and settings persist to keep this phone usable.
- Upload progress is encrypted and temporary, without server message-history records. Disappearing countdowns reflect the original deadline and do not extend it.

## What remains outside the website’s control

The browser can retain the base site address, visit times, tab titles, synced history, website storage, service-worker registration and notification permission. The OS can retain notifications, screenshots and device backups. Push, DNS, hosting and relay providers can retain metadata. Someone with access to the unlocked browser profile may also have access to this app’s keys and identity. Encryption does not make an unlocked authorized phone invisible.

The [standard History interface](https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-history-interface) manipulates page navigation; it does not expose a website operation to erase global browsing history. Chrome’s separate [history deletion API](https://developer.chrome.com/docs/extensions/reference/api/history) requires a browser extension and explicit history permission. This project remains an ordinary web app and does not install such an extension.

## Practical choices

**Settings → Page title** changes the tab name on this device, with a neutral default of **Home**. An operator can also choose an inconspicuous app path such as `/com`. These reduce descriptive labels; they do not hide a visit, erase older history or conceal website storage from somebody inspecting an unlocked browser. Existing Home Screen labels are managed by the phone.

Keep the phone locked with a passcode and use the phone’s notification privacy controls when other people can see its screen. To remove a saved site address from ordinary browsing history, use the browser’s own history controls. Deleting only a history entry is different from clearing all website data: clearing site data can lose this phone’s identity, contacts and cached media and require a new invitation.

Private/Incognito windows reduce retained browsing state, but can discard this phone’s identity when closed and restrict background notifications. They are not a substitute for a persistent web phone that must receive calls while closed. [Chromium Incognito design](https://www.chromium.org/user-experience/incognito/), [WebKit storage isolation](https://webkit.org/tracking-prevention/), [iPhone Home Screen push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Disappearing messages remove what this app controls. They do not guarantee zero forensic traces, undo a recipient’s copy or erase browser/OS history.

## Ratcheted storage (v0.13)

The secure IndexedDB database separately seals message/event/call-setup history and ratchet state. This permits reopening chats after transport keys are discarded. Deletion/expiry clears history, while a minimal contact verification fingerprint intentionally survives removal to prevent a server-induced key reset. Forget this device clears the secure account and trust records too. Same-origin scripts can use the wrapping key; local retention is not protection against origin/profile compromise. Do not clear this database during an upgrade. See SECURITY.md for migration and forensic limitations.
