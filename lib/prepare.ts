import type { S3Config } from '#types'
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3'
import type { PrepareContext } from '@data-fair/types-catalogs'
import type { S3Capabilities } from './capabilities.ts'

export default async ({ catalogConfig, secrets }: PrepareContext<S3Config, S3Capabilities>) => {
  if (catalogConfig.accessKeys.secretAccessKey === '') {
    delete secrets.secretAccessKey
  } else if (catalogConfig.accessKeys.secretAccessKey && catalogConfig.accessKeys.secretAccessKey !== '***************') {
    secrets.secretAccessKey = catalogConfig.accessKeys.secretAccessKey
    catalogConfig.accessKeys.secretAccessKey = '***************'
  }

  // try the S3 connection
  try {
    const accessKeyId = catalogConfig.accessKeys.accessKeyId // '8qbrg7nhlQX930gAH49a'
    const secretAccessKey = secrets.secretAccessKey // '5Z9iDvVsfMooM1MUSev3MEKryKpNP7tFfksxW19Q'

    const client = new S3Client({
      region: catalogConfig.region, // 'eu-west-3',
      credentials: { accessKeyId, secretAccessKey },
      endpoint: catalogConfig.endpoint, // 'http://localhost:9000/',
      forcePathStyle: catalogConfig.forcePathStyle
    })

    // Try a connection
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
