import type { S3Config } from '#types'
import type { CatalogPlugin, GetResourceContext, Resource } from '@data-fair/types-catalogs'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { pipeline } from 'stream/promises'
import fs from 'fs-extra'

/**
 * Downloads a specific resource locally from an S3 server and retrieves metadata from the downloaded file path.
 *
 * @param catalogConfig   The S3 configuration object
 * @param resourceId      The identifier (path) of the resource
 * @returns   A `Resource` object representing the file
 */
export const getResource = async (context: GetResourceContext<S3Config>): ReturnType<CatalogPlugin['getResource']> => {
  const resource = await getMetaData(context)
  resource.filePath = await downloadResource(context)
  return resource
}

/**
 * Allows you to retrieve the metadata of the resource to be downloaded
 *
 * @param resourceId  The identifier (path) of the resource.
 * @returns  An object containing the identifier, title (name), format and file path (empty).
 */
export const getMetaData = async ({ resourceId }: GetResourceContext<S3Config>): Promise<Resource> => {
  const pointPos = resourceId.lastIndexOf('.')
  return {
    id: resourceId,
    title: resourceId.substring(resourceId.lastIndexOf('/') + 1),
    format: (pointPos === -1) ? '' : (resourceId.substring(pointPos + 1)),
    filePath: ''
  }
}

/**
 * Downloads a resource (file) from the S3 server to a temporary directory.
 *
 * @param context   The context containing catalog configuration, resource ID, import configuration, and temporary directory path
 * @returns   The local path to the downloaded file, or `undefined` if the download fails
 */
const downloadResource = async ({ catalogConfig, resourceId, secrets, tmpDir }:GetResourceContext<S3Config>) => {
  const accessKeyId = catalogConfig.accessKeys.accessKeyId
  const secretAccessKey = secrets.secretAccessKey

  const client = new S3Client({
    region: catalogConfig.region,
    credentials: { accessKeyId, secretAccessKey },
    endpoint: catalogConfig.endpoint,
    forcePathStyle: catalogConfig.forcePathStyle
  })

  const data = await client.send(new GetObjectCommand({
    Bucket: catalogConfig.bucket,
    Key: resourceId
  }))

  const filename = resourceId.substring(resourceId.lastIndexOf('/') + 1)
  const destinationPath = tmpDir + '/' + filename

  // We are not explicitly retrieving a file but a stream, which must be read in order to import the resource.
  await pipeline(
    data.Body as NodeJS.ReadableStream,
    fs.createWriteStream(destinationPath)
  )

  client.destroy()
  return destinationPath
}
