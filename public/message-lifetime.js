// Off is an explicit signed sentinel, not a rolling long-lived timer. Keeping
// a safe integer preserves existing envelope framing and SQLite comparisons.
export const NO_EXPIRY = 8_640_000_000_000_000;
export const MAX_MESSAGE_SECONDS = 28 * 86400;
export const DEFAULT_MESSAGE_SECONDS = 86400;
export const isPermanent = expiresAt => expiresAt === NO_EXPIRY;
export const persistentLane = lane => ['chat', 'events', 'files'].includes(lane);
export function timerValue(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return DEFAULT_MESSAGE_SECONDS;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_MESSAGE_SECONDS ? n : DEFAULT_MESSAGE_SECONDS;
}
export function messageExpiry(createdAt, seconds, lane = 'chat') {
  if (seconds === 0 && persistentLane(lane)) return NO_EXPIRY;
  const ms = Math.round(seconds * 1000), max = persistentLane(lane) ? MAX_MESSAGE_SECONDS * 1000 : 120000;
  if (!Number.isFinite(seconds) || seconds <= 0 || ms < 1 || ms > max) throw new Error('Invalid message lifetime.');
  return createdAt + ms;
}
export const hasViewTimer=e=>e?.v===3&&e.lifetime?.mode==='after-view';
export const isViewReceipt=e=>e?.v===3&&e.lifetime?.mode==='view-receipt';
export function validLifetime(e, signaling = false) {
  if (!Number.isSafeInteger(e?.createdAt) || !Number.isSafeInteger(e?.expiresAt) || e.expiresAt <= e.createdAt) return false;
  if(e.v===3){
    const policy=e.lifetime;if(signaling||e.expiresAt!==NO_EXPIRY||!policy||typeof policy!=='object'||Array.isArray(policy))return false;
    if(hasViewTimer(e))return Object.keys(policy).length===2&&['chat','files'].includes(e.ratchet?.lane)&&Number.isInteger(policy.seconds)&&policy.seconds>=1&&policy.seconds<=MAX_MESSAGE_SECONDS;
    return isViewReceipt(e)&&Object.keys(policy).length===3&&e.ratchet?.lane==='events'&&typeof policy.target==='string'&&/^[a-f0-9-]{36}$/.test(policy.target)&&Number.isSafeInteger(policy.startedAt)&&policy.startedAt>0&&policy.startedAt<=e.createdAt;
  }
  const long = !signaling && e.v === 2 && persistentLane(e.ratchet?.lane);
  if (isPermanent(e.expiresAt)) return long;
  return e.expiresAt - e.createdAt <= (signaling ? 120000 : e.v === 1 ? 604800000 : long ? MAX_MESSAGE_SECONDS * 1000 : 120000);
}
export function timerLabel(seconds) {
  if (seconds === 0) return 'Off';
  if (seconds === 86400) return '1 day';
  if (seconds === 604800) return '1 week';
  for (const [unit, size] of [['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]) {
    if (seconds >= size && seconds % size === 0) { const n = seconds / size; return `${n} ${unit}${n === 1 ? '' : 's'}`; }
  }
  return `${seconds} seconds`;
}
export const timerDescription = seconds => seconds === 0 ? 'Your new messages won’t disappear' : `Your messages disappear after ${timerLabel(seconds)}`;

// Four weeks exceeds the browser's maximum timeout; Off never arms one.
export function expiryAlarm(expiresAt, onExpire, {now = Date.now, schedule = setTimeout, cancel = clearTimeout} = {}) {
  let timer, stopped = false;
  function tick() {
    if (stopped || isPermanent(expiresAt)) return;
    const delay = expiresAt - now();
    if (delay <= 0) { stopped = true; onExpire(); }
    else timer = schedule(tick, Math.min(delay, 2147483647));
  }
  tick();
  return () => { stopped = true; cancel(timer); };
}
