import type { Capability } from '@data-fair/types-catalogs'

/**
 * The list of capabilities of the plugin.
 * These capabilities define the actions that can be performed with the plugin.
 * The capabilities must satisfy the `Capability` type.
 */
export const capabilities = [
  'import'
  // Pagination and search are impossible; both require retrieving all results
  // with each request or page reload, which is not optimized in terms of memory.
  // Note that there is visual pagination, but it's only visual; the UI handles it. In reality, all results are loaded.
] satisfies Capability[]

export type S3Capabilities = typeof capabilities
export default capabilities
