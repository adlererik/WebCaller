export function dialCode(value){
  if(typeof value!=='string'||value.length>40||!/^[0-9 -]+$/.test(value))return null;
  const code=value.replace(/[ -]/g,'');return /^[0-9]{4,12}$/.test(code)?code:null;
}
export function dialEntry(hash){const p=new URLSearchParams(hash.replace(/^#/,''));return p.has('invite')||p.has('setup')?null:dialCode(p.get('dial'));}
export function dialLink(home,code){const value=dialCode(code);if(!value)throw new Error('Use 4 to 12 digits');const url=new URL(home);url.hash='dial='+value;return url.href;}
export function checkDialTarget(expected,contact){
  if(!/^[a-f0-9-]{36}$/.test(contact?.id||'')||!contact.keys)throw new Error('Calling code could not be verified.');
  if(expected&&expected!==contact.id)throw new Error('This code has changed. Open your saved conversation instead.');
}
