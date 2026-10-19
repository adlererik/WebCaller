# Call by code

Experimental branch: use the separate installation in [Install](INSTALL.md). New encrypted transport is libsignal/PQXDH with Ed25519 application signatures; the normal workflow remains. Stable Olm accounts are not imported. [Security](SECURITY.md).

A calling code is a public address inside this WebCaller server. You can keep using invitations too. There is no SIM, mobile number, account password or app-store download to arrange.

## Choose your code

1. Open your usual WebCaller browser or Home Screen icon.
2. Tap **Settings → Your calling code**.
3. Enter an available code of **4 to 12 digits** and tap **Save my code**. For example, choose `4826` if it is available. Spaces and hyphens are ignored; leading zeroes are kept.
4. Tell your friend the website and your code. You can also press **Copy my calling link**. A link only fills the dial pad; it never places or answers a call automatically.

**Choose a code for me** generates six random digits. Short memorable codes are fine as public addresses, but are easy to guess. A code is not a password, recovery secret or proof of who you are.

Existing users stay unlisted until they choose a code. **Turn my code off** prevents new code lookups while keeping your saved conversations and identity. Changing a code also keeps those conversations. Old codes remain reserved to that same identity while it exists, so someone else cannot immediately claim your old number. Each identity can reserve up to ten codes; reuse one of your own previous codes if needed. Forgetting the identity deletes its reservations.

## Dial someone

1. Open the website and tap **Dial a code**.
2. Enter their code. Your name is optional on the first visit.
3. Tap **Video call** (the default), **Voice call** for audio only, or **Message**. Pressing Enter defaults to video.

The first successful connection creates and saves your own device identity automatically. It does not sign you in as the owner of that code. No invitation is consumed. Unknown or disabled codes cannot create an account. If setup is interrupted, the saved identity and random access token let the same browser retry; a retry does not replace your keys.

On **iPhone or iPad**, first-time visitors are guided to save the website to the Home Screen, then open its icon and enter the code. This avoids creating conversations in Safari and later accidentally starting a separate identity in the Home Screen app. This is a website shortcut, not an app-store download. Microphone/camera and notification permissions still require the phone user's permission.

## Accept or block a new person

A person who dials your code appears as a **New contact request**. They can call you or send up to **five encrypted text messages** while waiting. They cannot upload files or media before acceptance. Delivery/read receipts and typing updates are withheld by the current client until accepted.

Tap **Accept**, reply to a message, call them back, or answer their incoming call to connect. The contact is then saved on both phones. You do not have to compare the security words or press a separate verification button for a call to work. Once connected, the ordinary chat, media sharing and call controls apply.

To refuse a request, tap **Block** and confirm **Block and delete history**. This ends an active call and removes the shared connection/history using the same deletion rules as contact removal. It also prevents that device identity from reconnecting through your code or an invitation. Saved copies outside WebCaller cannot be recalled. **Settings → Your calling code → Blocked people → Unblock** allows a new request; it does not restore deleted history.

Blocking identifies the browser identity. A determined person can create a different identity; this is not verified-person blocking. Repeated attempts are rate limited and pending requests are capped, but public-code enrollment is a larger abuse surface than invitation-only enrollment.

## Continue the same conversation later

Use the same browser or Home Screen icon. You can tap the saved person or dial the same code again. WebCaller reuses your existing identity, contact, ratchet sessions and unexpired history; it does not start a fresh account for each call. Encrypted media caching and disappearing timers continue to apply. Reopening a conversation cannot restore expired or deleted messages.

A code finds the other person; it cannot restore your previous messages after clearing browser data, changing browsers or moving to another phone. No password recovery or multi-device identity synchronization is added. If a previously used code unexpectedly resolves to another device identity, the returning browser refuses the change and asks you to use your saved conversation. Existing identity-pin checks remain in force.

## Encryption and first-contact trust

Calling codes use the existing libsignal PQXDH/Triple Ratchet, signed message envelopes, persistent identity pins, authenticated signaling and DTLS-SRTP media. No encryption keys are derived from the digits. Neither the code nor a calling link can read history, replace an identity, recover a token, or authorize microphone/camera capture or answering by itself.

There is one important difference from an invitation: an invitation carries the inviter's fingerprint, which can be delivered over a trusted channel. A code relies on this server's initial directory mapping. HTTPS protects that lookup in transit, but a malicious server/directory could misdirect first contact. Compare **all four call words aloud** with the person you recognize on your first call, before sharing sensitive information. Matching words authenticate the bound call context under the documented SAS assumptions; they do not retroactively protect earlier unverified text. Verification stays optional. This feature is not equivalent to a key-transparency directory or an independent security audit.

## Operator notes

The normal application update adds `dial_codes`, `contact_requests` and `contact_blocks` tables. Existing user keys, access-token hashes, contacts, messages, ratchet accounts, media and notification subscriptions are not replaced. No new runtime dependency is required. Native systemd and Docker distributions use the same feature; this does not convert an existing native installation to Docker.

Codes and pending/block relationships are server metadata. Requests use authenticated, origin-checked POSTs rather than codes in HTTP query strings. Shared links use a fragment (`#dial=4826`) that is removed from the ordinary page address after use; it may be retained during iPhone Home Screen setup. Clipboard, Home Screen metadata, browser history and OS records can still retain links. There is no public directory-listing endpoint.

Set `DIAL_CODES_ENABLED=false` to disable code lookup/enrollment and code changes on a server. Existing invitations, accepted contacts and conversations keep working. By default the feature is available, with each identity unlisted until it opts in. Public enrollment is bounded by request/account/call rate limits, a five-message request limit, and pending-request caps. Consider the additional guest/notification/storage abuse exposure before advertising a short public code widely.
