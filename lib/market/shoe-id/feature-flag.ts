export function shoeIdServerEnabled(): boolean {
  return process.env.SHOE_ID_ENABLED === 'true';
}

export function shoeIdClientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOE_ID_ENABLED === 'true';
}
