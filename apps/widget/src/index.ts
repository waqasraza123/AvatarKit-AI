import { z } from "zod"
import { widgetBrowserScript } from "./browser-script"

export { widgetBrowserScript }

export const widgetBootstrapConfigSchema = z.object({
  avatarId: z.string().min(1),
  apiBaseUrl: z.string().url(),
  position: z.enum(["bottom-left", "bottom-right"]).default("bottom-right"),
  theme: z.enum(["light"]).default("light")
})

export type WidgetBootstrapConfig = z.infer<typeof widgetBootstrapConfigSchema>

export function validateWidgetBootstrapConfig(input: unknown): WidgetBootstrapConfig {
  return widgetBootstrapConfigSchema.parse(input)
}
