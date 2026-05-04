import type { S3Config } from '#types'
import type capabilities from './capabilities.ts'
import type { ListContext, Folder, CatalogPlugin } from '@data-fair/types-catalogs'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

type ResourceList = Awaited<ReturnType<CatalogPlugin['list']>>['results']

/**
 * Lists the contents of a folder on an S3 server.
 *
 * @param context   The context containing catalog configuration and parameters
 * @returns   An object containing the count of items, the list of results (folders and resources), and the path as an array of folders
 */
export const list = async ({ catalogConfig, secrets, params }: ListContext<S3Config, typeof capabilities>): ReturnType<CatalogPlugin['list']> => {
  const accessKeyId = catalogConfig.accessKeys.accessKeyId
  const secretAccessKey = secrets.secretAccessKey

  const client = new S3Client({
    region: catalogConfig.region,
    credentials: { accessKeyId, secretAccessKey },
    endpoint: catalogConfig.endpoint,
    forcePathStyle: catalogConfig.forcePathStyle
  })

  const data = await client.send(new ListObjectsV2Command({
    Bucket: catalogConfig.bucket,
    Prefix: params.currentFolderId ? params.currentFolderId.substring(1, params.currentFolderId.length) + '/' : '',
    Delimiter: '/'
  }))

  const results: (Folder | ResourceList[number])[] = []

  // Get the files
  if (data.Contents) {
    for (const file of data.Contents) {
      const name = file.Key ? file.Key.substring(0, file.Key.length).split('/').pop()! : 'unnamed'
      const resourceList: ResourceList[number] = {
        id: (params.currentFolderId ?? '') + '/' + name,
        title: name,
        type: 'resource',
        description: '',
        // The return value of `pop` cannot be undefined, even if the filename doesn't have an extension (no `.`),
        // the split will return an array of length 1, therefore with a last element
        format: file.Key ? file.Key.split('.').pop()! : '',
        mimeType: '',
        size: file.Size ?? 0,
        updatedAt: file.LastModified ? file.LastModified.toISOString() : undefined
      }
      results.push(resourceList)
    }
  }

  // Get the directories
  if (data.CommonPrefixes) {
    for (const prefix of data.CommonPrefixes) {
      const name = prefix.Prefix ? prefix.Prefix.substring(0, prefix.Prefix.length - 1).split('/').pop()! : 'unnamed'
      const folder: Folder = {
        id: (params.currentFolderId ?? '') + '/' + name,
        title: name,
        type: 'folder',
        updatedAt: undefined
      }
      results.push(folder)
    }
  }

  // Alphanumeric sorting
  results.sort((a, b) => {
    if (a.title < b.title) {
      return -1
    } else if (b.title < a.title) {
      return 1
    }
    return 0
  })

  // Get the path location
  const pathFolder: Folder[] = []
  let parentId: string | undefined = (params.currentFolderId?.indexOf('./')) === -1 ? params.currentFolderId : params.currentFolderId?.substring(params.currentFolderId.indexOf('./') + 2)
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
