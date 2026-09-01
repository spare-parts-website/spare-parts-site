export type PrivateImageSession = { id: string; role: string }

export type PrivateImageResource = {
  participantIds: Iterable<string>
}

/**
 * A private object must first be resolved to a known database resource. The
 * caller then supplies that resource's participants; an admin may inspect a
 * known resource, while an unrelated account never can.
 */
export function canAccessPrivateImage(session: PrivateImageSession, resource: PrivateImageResource | null) {
  if (!resource) return false
  if (session.role === 'ADMIN') return true
  for (const participantId of resource.participantIds) if (participantId === session.id) return true
  return false
}
