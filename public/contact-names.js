// Labels belong to this browser identity. They never replace a contact's
// server name, public keys, trust pins or ratchet account.
export function contactName(device, contact) {
  return device?.contactNames?.[contact?.id] || contact?.name || 'Contact';
}

export function renameContact(device, contact, value) {
  if (!contact || !/^[a-f0-9-]{36}$/.test(contact.id) || !device?.contacts?.some(c => c.id === contact.id)) throw new Error('This contact is no longer available.');
  if (typeof value !== 'string') throw new Error('Enter a contact name.');
  const name = value.trim().replace(/\s+/gu, ' ');
  if (name.length > 48 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new Error('Use a name of up to 48 characters without hidden control characters.');
  const labels = { ...device.contactNames };
  if (!name || name === contact.name) delete labels[contact.id];
  else labels[contact.id] = name;
  device.contactNames = labels;
  return contactName(device, contact);
}
