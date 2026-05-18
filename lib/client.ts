import type { S3Config } from '#types'
import { S3Client } from '@aws-sdk/client-s3'
import type { LogFunctions } from '@data-fair/types-catalogs'

/**
 * Allows you to obtain the S3 Client instance to connect
 *
 * @param catalogConfig   The S3 configuration object
 * @param secrets         Secret elements for configuration (such as the login key)
 * @returns   The S3 Client instance
 */
export const getS3Client = (
  catalogConfig: S3Config,
  secrets: Record<string, string>
): S3Client => {
  const accessKeyId = catalogConfig.accessKeys.accessKeyId
  const secretAccessKey = secrets.secretAccessKey
  return new S3Client({
    region: catalogConfig.region,
    // Passing credentials as a provider function bypasses the SDK's
    // static format validation on accessKeyId (e.g. for Backblaze B2 keys)
    credentials: () => Promise.resolve({ accessKeyId, secretAccessKey }),
    endpoint: catalogConfig.endpoint,
    forcePathStyle: catalogConfig.forcePathStyle
  })
}

/**
 * Allows you to execute a command on an S3 client and return the result
 *
 * @param catalogConfig   The S3 configuration object
 * @param secrets         Secret elements for configuration (such as the login key)
 * @param command         The command to execute
 * @param Output          Command output type
 * @returns   Command result
 */
export const sendS3Command = async <Output>(
  catalogConfig: S3Config,
  secrets: Record<string, string>,
  command: any,
  log?: LogFunctions,
  treatment?: (data: Output) => Promise<void>
): Promise<Output> => {
  const client = getS3Client(catalogConfig, secrets)
  try {
    const data = await client.send(command) as Output
    if (treatment) await treatment(data)
    return data
  } catch (error: any) {
    console.error('S3 request failed: ' + error)
    if (log) await log.error('S3 request failed: ' + error.message)
    throw new Error('S3 request failed: ' + error.message)
  } finally {
    client.destroy()
  }
}
