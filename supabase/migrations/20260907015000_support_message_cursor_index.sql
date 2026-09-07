CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_createdAt_id_idx"
ON public."SupportMessage"("ticketId", "createdAt" DESC, id DESC);
