import { z } from "zod"

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
})

export type ApiEnvironment = z.infer<typeof environmentSchema>

export function loadApiEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return environmentSchema.parse(source)
}
