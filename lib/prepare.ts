import type { S3Config } from '#types'
import s3 from '@aws-sdk/client-s3'
import type { PrepareContext } from '@data-fair/types-catalogs'
import type { S3Capabilities } from './capabilities.ts'
import { sendS3Command } from './client.ts'

/**
 * Extracts the region code from a label like "Europe (Paris) - (eu-west-3)"
 * or returns the value as-is if it's already a plain code like "eu-west-3".
 *
 * @param region  Raw value coming from the form
 * @returns       The normalized region code
 */
const normalizeRegion = (region: string): string => {
  const match = region.match(/ - (.+)$/)
  return match ? match[1] : region.trim()
}

/**
 * This allows you to verify that you can create the catalog by testing a connection to an S3 server.
 * The secret key used for the connection is also hidden.
 *
 * @param context   The context containing catalog configuration and secrets fields
 */
export default async ({ catalogConfig, secrets }: PrepareContext<S3Config, S3Capabilities>) => {
  // Normalize region: extract code from label if user picked from the list,
  // or keep the raw value if they typed a custom region code directly.
  catalogConfig.region = normalizeRegion(catalogConfig.region)

  if (catalogConfig.accessKeys.secretAccessKey === '') {
    delete secrets.secretAccessKey
  } else if (catalogConfig.accessKeys.secretAccessKey && catalogConfig.accessKeys.secretAccessKey !== '***************') {
    secrets.secretAccessKey = catalogConfig.accessKeys.secretAccessKey
    catalogConfig.accessKeys.secretAccessKey = '***************'
  }

  // try the S3 connection
  try {
    // We use a minimal command to test if everything is correct
    await sendS3Command<s3.ListBucketsCommandOutput>(
      catalogConfig, secrets,
      new s3.ListBucketsCommand({})
    )
  } catch (error) {
    console.error('Connection test failed:', error)
    const err = error as Error
    throw new Error('Connection test failed: ' + err.message)
  }

  return {
    catalogConfig,
    secrets
  }
}
