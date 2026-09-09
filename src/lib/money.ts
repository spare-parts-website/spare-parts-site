export const EGP_MINOR_FACTOR = 100n
const DISCOUNT_SCALE = 10_000n
const DISCOUNT_DENOMINATOR = 100n * DISCOUNT_SCALE

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

export function multiplyMinor(unit: bigint, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('INVALID_QUANTITY')
  return unit * BigInt(quantity)
}

export function percentDiscountMinor(subtotal: bigint, percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('INVALID_DISCOUNT')
  const scaledPercent = BigInt(Math.round(percent * Number(DISCOUNT_SCALE)))
  return (subtotal * scaledPercent + DISCOUNT_DENOMINATOR / 2n) / DISCOUNT_DENOMINATOR
}
