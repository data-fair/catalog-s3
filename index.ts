import type CatalogPlugin from '@data-fair/types-catalogs'
import { type S3Config, configSchema, assertConfigValid } from '#types'
import { type S3Capabilities, capabilities } from './lib/capabilities.ts'

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<S3Config, S3Capabilities> = {
  async prepare (context) {
    const prepare = (await import('./lib/prepare.ts')).default
    return prepare(context)
  },

  async list (context) {
    const { list } = await import('./lib/imports.ts')
    return list(context)
  },

  async getResource (context) {
    const { getResource } = await import('./lib/download.ts')
    return getResource(context)
  },

  metadata: {
    title: 'S3',
    capabilities
  },
  configSchema,
  assertConfigValid
}
export default plugin
