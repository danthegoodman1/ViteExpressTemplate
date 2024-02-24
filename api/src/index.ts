import * as dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { WebSocket, WebSocketServer } from 'ws'

import { logger } from './logger/index.js'
import { extractError } from './utils.js'
import { createServer } from 'http'
import { randomUUID } from 'crypto'

const listenPort = process.env.PORT || '8080'

declare global {
	namespace Express {
		interface Request {
			id: string
		}
	}

	namespace NodeJS {
		interface ProcessEnv {}
	}
}

interface IDWebsocket extends WebSocket {
	id: string
	isAlive: boolean
}

// socket ID to instance
const sockets: { [key: string]: WebSocket } = {}

// room-socket index
const rooms: { [roomID: string]: string[] } = {}

process.on('unhandledRejection', (reason: any, p: Promise<any>) => {
	logger.error(
		{
			err: reason instanceof Error ? extractError(reason) : reason,
		},
		'unhandled promise rejection'
	)
})

async function main() {
	const app = express()
	app.all('*', (req, res, next) => {
		const corsHeaders = {
			'Access-Control-Allow-Origin': req.headers['origin'] || req.headers['referer']?.replace(/\/$/, '') || '*',
			'Access-Control-Allow-Methods': 'GET,HEAD,PUT,POST,OPTIONS',
			'Access-Control-Max-Age': '86400',
			'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
			'Access-Control-Allow-Credentials': 'true',
			'Access-Control-Expose-Headers': '*',
		}
		for (const [key, val] of Object.entries(corsHeaders)) {
			res.setHeader(key, val)
		}
		if (req.method === 'OPTIONS') {
			return res.sendStatus(204)
		}
		next()
	})
	const server = createServer(app)
	const wss = new WebSocketServer({ noServer: true })

	server.on('upgrade', (request, socket, head) => {
		if (request.url && new URL('http://temp' + request.url).pathname === '/ws') {
			wss.handleUpgrade(request, socket, head, (ws) => {
				wss.emit('connection', ws, request)
			})
		} else {
			socket.destroy()
		}
	})

	// Set up connection event for new WebSocket connections
	wss.on('connection', (ws: IDWebsocket, request) => {
		ws.id = randomUUID() // give the socket some unique ID
		ws.isAlive = true
		sockets[ws.id] = ws // store it in the index
		ws.on('message', (message) => {
			console.log(`Received message from ws ${ws.id}`)
		})

		// https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
		function heartbeat(this: WebSocket) {
			;(this as IDWebsocket).isAlive = true
		}
		ws.on('pong', heartbeat)
		ws.on('close', handleClose)
	})

	function handleClose(this: WebSocket) {
		// Gracefull close (like reload)
		console.log('disconnected, removing', (this as IDWebsocket).id, 'from all rooms')
		// Remove from all rooms
		for (const roomID of Object.keys(rooms)) {
			if (!rooms[roomID]) {
				rooms[roomID] = []
			}

			rooms[roomID] = rooms[roomID].filter((socketID) => socketID !== (this as IDWebsocket).id)
		}
	}

	wss.on('close', function close() {
		clearInterval(interval)
	})

	const interval = setInterval(function ping() {
		wss.clients.forEach(function each(s) {
			const ws = s as IDWebsocket
			if (ws.isAlive === false) {
				console.log('disconnected, removing', ws.id, 'from all rooms')
				// Remove from all rooms
				for (const roomID of Object.keys(rooms)) {
					if (!rooms[roomID]) {
						rooms[roomID] = []
					}

					rooms[roomID] = rooms[roomID].filter((socketID) => socketID !== ws.id)
				}
				return ws.terminate()
			}

			ws.isAlive = false
			ws.ping()
		})
	}, 1000)

	app.use(express.json())
	app.use(
		express.urlencoded({
			extended: true,
		})
	)
	app.disable('x-powered-by')

	app.use((req, res, next) => {
		const reqID = uuidv4()
		req.id = reqID
		next()
	})

	if (process.env.HTTP_LOG === '1') {
		logger.debug('using HTTP logger')
		app.use((req: any, res, next) => {
			req.log.info({ req })
			res.on('finish', () => req.log.info({ res }))
			next()
		})
	}

	app.get('/hc', (req, res) => {
		res.send('up')
		return
	})

	app.all('*', (req, res) => {
		logger.debug(
			{
				path: req.path,
				method: req.method,
			},
			'unknown route'
		)
		return res.status(404).send('unknown route')
	})

	server.listen(listenPort, () => {
		logger.info(`Listening on port ${listenPort}`)
	})

	const signals = {
		SIGHUP: 1,
		SIGINT: 2,
		SIGTERM: 15,
	}

	let stopping = false
	Object.keys(signals).forEach((signal) => {
		process.on(signal, async () => {
			if (stopping) {
				return
			}
			stopping = true
			logger.info(`Received signal ${signal}, shutting down...`)
			logger.info('exiting...')
			logger.flush() // pino actually fails to flush, even with awaiting on a callback
			server.close()
			process.exit(0)
		})
	})
}

main()
