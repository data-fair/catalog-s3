import type { S3Config } from '#types'
import type capabilities from './capabilities.ts'
import type { ListContext, Folder, CatalogPlugin } from '@data-fair/types-catalogs'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getS3Client } from './client.ts'

type ResourceList = Awaited<ReturnType<CatalogPlugin['list']>>['results']

/**
 * Lists the contents of a folder on an S3 server.
 *
 * @param context   The context containing catalog configuration and parameters
 * @returns   An object containing the count of items, the list of results (folders and resources), and the path as an array of folders
 */
export const list = async ({ catalogConfig, secrets, params }: ListContext<S3Config, typeof capabilities>): ReturnType<CatalogPlugin['list']> => {
  // We don't call sendS3Command() directly because of a potential loop if we get a lot of results;
  // this avoids a perpetual destruction and reconstruction of the S3 client.
  const client = getS3Client(catalogConfig, secrets)

  const results: (Folder | ResourceList[number])[] = []
  let continuationToken: string | undefined

  // We retrieve the data as long as there is still some available (limit of 1000 by default per query)
  do {
    const data = await client.send(new ListObjectsV2Command({
      Bucket: catalogConfig.bucket,
      Prefix: params.currentFolderId ? params.currentFolderId.substring(1) + '/' : '',
      Delimiter: '/',
      ContinuationToken: continuationToken  // undefined for the first request
      // MaxKeys: 1000 by default
    }))

    // The output is designed to always send directories (prefixes) before files (contents), in the same way as a classic file explorer.

    // Get the directories
    if (data.CommonPrefixes) {
      for (const prefix of data.CommonPrefixes) {
        const name = prefix.Prefix ? prefix.Prefix.substring(0, prefix.Prefix.length - 1).split('/').pop()! : 'unnamed'
        const folder: Folder = {
          // This corresponds to prefix.Prefix; however, if the prefix (directory) is not named, the path from which it was extracted must be retained.
          id: (params.currentFolderId ?? '') + '/' + name,
          title: name,
          type: 'folder',
          updatedAt: undefined
        }
        results.push(folder)
      }
    }

    // Get the files
    if (data.Contents) {
      for (const file of data.Contents) {
        const name = file.Key ? file.Key.split('/').pop()! : 'unnamed'
        const pointPos = name.lastIndexOf('.')
        const resourceList: ResourceList[number] = {
          // This corresponds to file.key; however, if the file is not named, the path from which it was extracted must be retained.
          id: (params.currentFolderId ?? '') + '/' + name,
          title: name,
          type: 'resource',
          description: '',
          format: (pointPos === -1) ? '' : (name.substring(pointPos + 1)),
          mimeType: '',
          size: file.Size ?? 0,
          updatedAt: file.LastModified ? file.LastModified.toISOString() : undefined
        }
        results.push(resourceList)
      }
    }

    // We retrieve the next token. If there isn't one, it becomes undefined and the loop stops.
    continuationToken = data.NextContinuationToken
  } while (continuationToken)

  // Get the path location
  const pathFolder: Folder[] = []
  let parentId: string | undefined = params.currentFolderId
  while (parentId && parentId !== '') {
    pathFolder.unshift({
      id: parentId,
      title: parentId.substring(parentId.lastIndexOf('/') + 1),
      type: 'folder'
    })
    parentId = parentId.substring(0, parentId.lastIndexOf('/'))
  }

  client.destroy()

  return {
    count: results.length,
    results,
    path: pathFolder
  }
}
