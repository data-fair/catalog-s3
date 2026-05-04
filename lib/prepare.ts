import type { S3Config } from '#types'
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3'
import type { PrepareContext } from '@data-fair/types-catalogs'
import type { S3Capabilities } from './capabilities.ts'

/**
 * This allows you to verify that you can create the catalog by testing a connection to an S3 server.
 * The secret key used for the connection is also hidden.
 *
 * @param context   The context containing catalog configuration and secrets fields
 */
export default async ({ catalogConfig, secrets }: PrepareContext<S3Config, S3Capabilities>) => {
  if (catalogConfig.accessKeys.secretAccessKey === '') {
    delete secrets.secretAccessKey
  } else if (catalogConfig.accessKeys.secretAccessKey && catalogConfig.accessKeys.secretAccessKey !== '***************') {
    secrets.secretAccessKey = catalogConfig.accessKeys.secretAccessKey
    catalogConfig.accessKeys.secretAccessKey = '***************'
  }

  // try the S3 connection
  try {
    const accessKeyId = catalogConfig.accessKeys.accessKeyId
    const secretAccessKey = secrets.secretAccessKey

    const client = new S3Client({
      region: catalogConfig.region,
      credentials: { accessKeyId, secretAccessKey },
      endpoint: catalogConfig.endpoint,
      forcePathStyle: catalogConfig.forcePathStyle
    })

    // We use a minimal command to test if everything is correct
    await client.send(new ListBucketsCommand({}))

    client.destroy()
  } catch (error) {
    console.error('Connection test failed:', error)
    throw new Error('Connection test failed', { cause: error })
  }

  return {
    catalogConfig,
    secrets
  }
}
