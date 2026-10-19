// Keep v2 byte-for-byte compatible. v3 additionally authenticates its lifetime.
export const envelopeHeader=e=>JSON.stringify({v:e.v,id:e.id,from:e.from,to:e.to,createdAt:e.createdAt,expiresAt:e.expiresAt,...(e.v===3?{lifetime:e.lifetime}:{})});
export const ratchetStatement=e=>JSON.stringify({header:envelopeHeader(e),ratchet:e.ratchet});
