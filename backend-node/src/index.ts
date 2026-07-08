import cors from 'cors'
import express from 'express'
import { apiRouter } from './routes/api.js'

const PORT = Number(process.env.PORT ?? 8003)

const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/api', apiRouter)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Node PDF diff server listening on http://localhost:${PORT}`)
})
