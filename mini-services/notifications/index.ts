import { createServer } from 'http'
import { Server } from 'socket.io'

// HTTP server for receiving notifications from Next.js API routes
const httpNotificationServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, connections: io.engine.clientsCount }))
    return
  }

  if (req.method === 'POST' && req.url === '/notify') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const { userId, notification } = data
        if (!userId || !notification) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'userId and notification are required' }))
          return
        }
        io.to(`user:${userId}`).emit('notification', notification)
        console.log(`[notifications] sent to user ${userId}: ${notification.title}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid JSON' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

// WebSocket server (separate from HTTP notification receiver)
const wsHttpServer = createServer()
const io = new Server(wsHttpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[notifications] ws connected: ${socket.id}`)

  socket.on('authenticate', (data: { userId: string }) => {
    const { userId } = data
    if (!userId) return

    socket.data.userId = userId
    socket.join(`user:${userId}`)
    console.log(`[notifications] user ${userId} authenticated on socket ${socket.id}`)
  })

  socket.on('disconnect', () => {
    const userId = socket.data.userId
    console.log(`[notifications] ws disconnected: ${socket.id} (user: ${userId || 'unknown'})`)
  })

  socket.on('error', (error) => {
    console.error(`[notifications] socket error (${socket.id}):`, error)
  })
})

// HTTP notification receiver on port 3004 - listen on all interfaces
httpNotificationServer.listen(3004, '0.0.0.0', () => {
  console.log('[notifications] HTTP receiver on port 3004')
})

// WebSocket on port 3003 - listen on all interfaces
wsHttpServer.listen(3003, '0.0.0.0', () => {
  console.log('[notifications] WebSocket on port 3003')
})

process.on('SIGTERM', () => {
  console.log('[notifications] received SIGTERM, shutting down...')
  httpNotificationServer.close()
  wsHttpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[notifications] received SIGINT, shutting down...')
  httpNotificationServer.close()
  wsHttpServer.close(() => process.exit(0))
})
