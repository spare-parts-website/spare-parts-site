export const EGP_MINOR_FACTOR = 100n

export function toMinorUnits(value: number) {
  if (!Number.isFinite(value)) throw new Error('INVALID_MONEY')
  return BigInt(Math.round(value * Number(EGP_MINOR_FACTOR)))
}

export function fromMinorUnits(value: bigint | number | string) {
  const minor = typeof value === 'bigint' ? value : BigInt(value)
  return Number(minor) / Number(EGP_MINOR_FACTOR)
}

export function addMinor(...values: bigint[]) {
  return values.reduce((sum, value) => sum + value, 0n)
}

export function percentDiscountMinor(subtotal: bigint, percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('INVALID_DISCOUNT')
  return BigInt(Math.round(Number(subtotal) * percent / 100))
}
