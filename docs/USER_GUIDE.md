# Using WebCaller

## Your browser is your device

The first browser uses the owner's private setup QR/link. Other people accept an invitation. Device keys and your access token stay in that browser's IndexedDB. Use the same browser for later calls. Clearing site storage or changing browsers creates a new device; there is no password-based recovery or multi-device identity synchronization.

## Conversations and invitations

**Invite someone** creates a link for one person. **Share invitation** opens the device's normal share sheet when supported; **Copy link** copies it. A recipient opens the full link, optionally enters a name and presses **Accept invitation**. The link is single use and expires after 24 hours. Share it privately; its fragment contains the invite secret and inviter identity fingerprint.

The left conversation list shows your contacts and unread indicators. **Search people** filters it locally. Tap a person to open their conversation. On narrow screens the back arrow returns to the list. Only established contacts can route messages or calls to one another.

## Voice and video

The phone icon starts an audio-only call; the camera icon starts video. Allow the microphone when requested. An incoming call presents answer and decline buttons. Microphone/camera permissions are requested when making or answering, not when accepting an invitation.

During a call: **Mute microphone** toggles outgoing voice; **Toggle camera** stops/restarts the camera or upgrades audio to video; **Switch to back/front camera** changes the lens while keeping the microphone running; **End call** hangs up. The duration and quality stay at the top. Central caller details fade after video connects and return when reconnecting. If autoplay is blocked, tap **Tap to hear the call**. Settings remain available through the gear.

WebCaller uses full-duplex voice. On weak connections it reduces video first and may pause it completely. You can still talk while video is paused, if sufficient usable bandwidth remains. Reconnection attempts refresh ICE/TURN information. Long outages eventually end the call rather than leaving a false connected state.

## Messages

Type a message and use the send button. Text is encrypted for sender and recipient device identities. Delivery to an offline recipient is queued as ciphertext until its expiry. There is no persistent plaintext browser outbox or offline cache: sending needs a working connection. The UI clears displayed plaintext when backgrounded and loads/decrypts available unexpired messages again on return.

Settings → **Disappearing messages** chooses 30 seconds, 5 minutes, 1 hour, 24 hours (default), or 7 days for new messages you send in that conversation. The sender's signed timer starts at send time, including unread/offline messages. Changing the setting does not extend existing messages or override the other sender's timer. Copying/screenshotting content can preserve it outside WebCaller.

## Images and files

Tap the little **+** next to the message box, then **Photo** or **File**. Choose one item up to 10 MB. File contents, filename, type and file key are encrypted; the server sees transfer size and routing/expiry metadata. A progress line shows the transfer. Files use this chat’s disappearing timer starting when encryption begins; choose a longer timer for a large file on a slow link.

Received photos show **View photo**; other files show **Download file**. Contents load only when tapped, saving data and avoiding repeated downloads during chat sync. Common raster photos display inline. Other types, including SVG/HTML and unsupported photo formats, download rather than execute in chat. Once loaded, **Save file** downloads a copy. Saved copies remain outside WebCaller and are not erased by the disappearing timer.

Transfers are unavailable during calls and stop if a call starts or the page is hidden. Retry after the call or on returning to the page. This protects call audio and avoids leaving decrypted files in a background chat. Blob previews are revoked on expiry/backgrounding. Files awaiting completion and completed files share the server’s expiring storage quota; a full quota means wait for older items to expire.

A website cannot reliably prevent operating-system screenshots or another camera photographing the screen. This app clears background chat previews and hides chat in print layouts; those controls do not block screenshots.

## Settings

**Connection · Automatic:** always used. It selects Wi-Fi quality only if the browser explicitly reports Wi-Fi/Ethernet. Unknown networks, including Safari, use data saver. Video still adapts under congestion. Older saved manual modes are ignored.

**Ringing:** enabled automatically. The first ordinary tap or keypress unlocks browser sound. There is no separate Enable ringing step. Sound restrictions, device Focus/mute and OS suspension still apply.

**Enable browser notifications:** optional generic notifications where the browser supports them. Notification text contains no message bodies/contact names. iPhone push requires a Home Screen installation; this project does not ask you to install. Browser/OS notification history may remain.

**Check calling connection:** attempts a relay-only ICE allocation. Success means a relay candidate was allocated, not that every network or full media path works. Test a real call across separate networks.

**Remove this device and its conversations:** after confirmation, deletes that server identity, contacts, its invitations, queued messages and push subscription, then clears the local identity/settings. Other people's copies, browser history and OS traces may remain. You need a fresh invitation to rejoin, or private owner setup if no users remain.

## Safety number

Tap your contact's name to see the safety number. Compare it through a channel you trust. Known key changes are blocked. The original invitation still depends on trusting its delivery channel. This is custom encryption, not audited Signal Protocol; see [Security](SECURITY.md).
