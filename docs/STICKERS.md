# Stickers

Open a chat and tap the folded-corner sticker icon beside the message field. Choose a pack along the bottom, then tap a sticker to send it immediately. Tap a star for Favorites; Recent shows stickers sent in this device. Recent and favorite choices are saved in the existing encrypted device store; no plaintext localStorage history is added.

The picker opens in **Cutouts**, showing transparent stickers. Choose **All** to browse the full collection. Switching views does not delete Favorites, Recent entries or sent messages. Your choice is saved in the existing encrypted device store.

Sticker images are bundled locally. Missing source files are recorded in the catalog and never shown as broken tiles. Existing sticker IDs remain valid. Opening the picker does not download every pack: images are lazy-loaded as you browse. Pack headings show the count for the selected view; the bottom strip keeps its position when switching packs or adding Favorites. Opening the picker never contacts an external sticker catalog/CDN or tracking script. Sources, source/available counts, hashes, dimensions, cutout classification and edit provenance are in [the catalog](../public/stickers/catalog.json) and [artwork notice](../public/stickers/NOTICE.md). These are community collections, not official endorsements; artwork is separate from the code license.

Stickers render without a colored bubble. Reply, react, forward, pin, message information and deletion for both remain available. Forwarding generates a fresh attachment key and uses the destination chat's current timer. Stickers retain their original per-message disappearing duration, independent sender/recipient countdowns, Off option and encrypted local cache. Browser eviction may require another download.

## Size and layout

Artwork is WebP at up to 512×512 pixels and 512 KiB per sticker. The chat gives each sticker a transparent area up to 200 CSS pixels high and `min(200px, 50vw)` wide, preserving its aspect ratio. The responsive picker uses a grid, a bottom pack strip and stars for Favorites. This follows familiar WhatsApp-style patterns; it is not a pixel-for-pixel clone or a connection to WhatsApp/Signal accounts.

## Encryption and delivery

1. Sticker manifests advance the existing chat ratchet instead of claiming a fresh one-time bundle per image. Previously sent per-file stickers remain readable. Connection-control and transfer-progress packets reuse their own per-contact ratchets, while call signaling stays separate. A sticker is an authenticated attachment with an encrypted `sticker: true` marker. That marker, filename and random **AES-256-GCM** file key are inside the existing **libsignal PQXDH/Triple Ratchet** message. Image chunks use the existing attachment encryption and expiry binding. No new cryptographic algorithm or custom ratchet is introduced.
2. A separate low-priority **WebRTC data-only connection** carries encrypted chunks to an online recipient. SDP/ICE are signed and encrypted through the same pinned Signal identities. It requests no camera/microphone, creates no call/ringtone, and reuses existing STUN/TURN settings. Standard WebRTC direct connectivity may reveal network addresses to an accepted contact; TURN may relay it.
3. The receiver authenticates the Signal manifest and every AES-GCM chunk before caching. Its acknowledgement means the ciphertext cache accepted the sticker, not that a human has read it. Normal read receipts still determine viewed status.
4. Ciphertext is also retained through the normal authenticated attachment API for offline delivery, reopening, older clients, network changes and failed data channels. A bounded attempt falls back to this stored encrypted copy. Neither plaintext nor an external image URL is substituted. Bundled artwork itself is public; the host/CDN can observe asset requests and other routing metadata.

Frames are at most 16 KiB, with backpressure, bounded sizes, accepted-contact authorization, replay limits and idle/suspension cleanup. Stickers are limited to 512 KiB and use the existing audio-first pacing. Poor voice quality can pause sharing; instant delivery cannot be guaranteed through an unavailable connection. Call codecs, SAS, handover and notifications are unchanged. Key publication is requested automatically on reconnect/resume and retried after transient failures. An established chat can send stickers while the recipient is offline even when their unused one-time-key supply is empty. A brand-new chat still needs authenticated starter material; it waits/fails closed with a plain reconnect message rather than changing identities or sending plaintext.

## Emoji reactions

Tap or long-press a message, then choose a quick reaction or the three dots for the full emoji picker. Choosing your current emoji removes it. Reactions bind to the original signed wire lifetime while respecting local expiry; they never reset or extend a timer.

## Adding bundled artwork

Put appropriately authorized WebP files under `public/stickers/<pack-id>/<number>.webp` and add metadata to `catalog.json`. Pack IDs use lowercase letters, digits and hyphens; sticker IDs are numeric and filenames have three digits. Images must be at most 512×512 and 512 KiB. Record source, original rights, exact bytes and SHA-256. Set `cutout: true` only after checking the actual transparent silhouette; use `false` for screenshots. For edited artwork, retain the source hash as `originalSha256` and describe `editMethod`. Paths must remain inside the local directory. Run `node --test tests/stickers.test.mjs` and update the expected inventory when deliberately adding images. Preserve attribution and review redistribution terms before publishing more artwork.

## Updating an existing installation

Follow the normal [source update guide](OPERATIONS.md#native-libsignal-updates) and reload both browsers once. Accounts, identities, existing stickers and Favorites remain valid; this update does not require deleting conversations or resetting browser data. There is no new prebuilt Docker bundle for v0.19.0. The ready-made pack images are served by your own installation, so no sticker-provider account, bot token or external image API is required.
