// Namespace is a CR storage concern, never part of the REST contract.
export function withoutNamespace(value) {
  if(Array.isArray(value))return value.map(withoutNamespace);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([key])=>key!=='namespace').map(([key,child])=>[key,withoutNamespace(child)]));
  return value;
}
export function hasNamespace(value) {
  return Boolean(value && typeof value==='object' &&
    (Object.hasOwn(value,'namespace') || Object.values(value).some(hasNamespace)));
}
