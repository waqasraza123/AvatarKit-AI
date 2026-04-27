import { loadApiEnvironment } from "./config/environment.js"
import { createApiServer } from "./http/server.js"

const environment = loadApiEnvironment()
const server = createApiServer()

try {
  await server.listen({
    host: environment.API_HOST,
    port: environment.API_PORT
  })
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
