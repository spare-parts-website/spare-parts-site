export async function deletePartWithDependencies(tx: any, partId: string) {
  const orderCount = await tx.order.count({ where: { partId } })
  if (orderCount > 0) throw new Error('PART_HAS_ORDERS')

  await tx.productReview.deleteMany({ where: { partId } })
  await tx.wishlist.deleteMany({ where: { partId } })
  await tx.part.delete({ where: { id: partId } })
}

export async function deleteStoreWithDependencies(tx: any, storeId: string) {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } })
  if (!store) throw new Error('STORE_NOT_FOUND')

  const orderCount = await tx.order.count({ where: { storeId } })
  if (orderCount > 0) throw new Error('STORE_HAS_ORDERS')

  const parts = await tx.part.findMany({ where: { storeId }, select: { id: true } })
  for (const part of parts) await deletePartWithDependencies(tx, part.id)

  await tx.storeReview.deleteMany({ where: { storeId } })
  await tx.coupon.deleteMany({ where: { storeId } })
  await tx.store.delete({ where: { id: storeId } })
}

export async function deleteUserWithDependencies(tx: any, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, store: { select: { id: true } } },
  })
  if (!user) throw new Error('USER_NOT_FOUND')

  const orderCount = await tx.order.count({ where: { buyerId: userId } })
  if (orderCount > 0) throw new Error('USER_HAS_ORDERS')
  if (user.store) await deleteStoreWithDependencies(tx, user.store.id)

  await tx.chatMessage.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } })
  await tx.productReview.deleteMany({ where: { userId } })
  await tx.storeReview.deleteMany({ where: { userId } })
  await tx.notification.deleteMany({ where: { userId } })
  await tx.wishlist.deleteMany({ where: { userId } })
  await tx.userCar.deleteMany({ where: { userId } })
  await tx.user.delete({ where: { id: userId } })
}
