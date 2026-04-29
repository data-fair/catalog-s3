import type { SFTPConfig } from '#types'
import type { FileEntryWithStats } from 'ssh2'
import type capabilities from './capabilities.ts'
import type { ListContext, Folder, CatalogPlugin } from '@data-fair/types-catalogs'
import { type Config, NodeSSH } from 'node-ssh'

type ResourceList = Awaited<ReturnType<CatalogPlugin['list']>>['results']

/**
 * Prepares a list of files and folders from the SFTP directory listing.
 *
 * @param list - The array of file objects returned by the SFTP `readdir` method.
 * @param path - The current directory path.
 * @returns An array of `Folder` or `ResourceList` objects representing the files and folders.
 */
const prepareFiles = (list: FileEntryWithStats[], path: string): (Folder[] | ResourceList) => {
  return list.map((file: FileEntryWithStats) => {
    const pointPos = file.filename.lastIndexOf('.')
    if (file.longname.charAt(0) === 'd') {
      // Folder
      return {
        id: path + '/' + file.filename,
        title: file.filename,
        type: 'folder',
        updatedAt: file.attrs.mtime ? new Date(file.attrs.mtime * 1000) : undefined
      } as Folder
    } else {
      // ResourceList
      return {
        id: path + '/' + file.filename,
        title: file.filename,
        type: 'resource',
        description: '',
        format: (pointPos === -1) ? '' : (file.filename.substring(pointPos + 1)),
        mimeType: '',
        size: file.attrs.size,
        updatedAt: file.attrs.mtime ? new Date(file.attrs.mtime * 1000) : undefined
      } as ResourceList[number]
    }
  })
}

/**
 * Lists the contents of a folder on an SFTP server.
 *
 * @param context - The context containing catalog configuration and parameters.
 * @returns An object containing the count of items, the list of results (folders and resources), and the path as an array of folders.
 * @throws Will throw an error if the connection configuration is invalid or not supported.
 */
export const list = async ({ catalogConfig, secrets, params }: ListContext<SFTPConfig, typeof capabilities>): ReturnType<CatalogPlugin['list']> => {
  const paramsConnection: Config = {
    host: catalogConfig.url,
    username: catalogConfig.login,
    port: catalogConfig.port
  }
  if (catalogConfig.connectionKey.key === 'sshKey') {
    paramsConnection.privateKey = secrets.sshKey
  } else if (catalogConfig.connectionKey.key === 'password') {
    paramsConnection.password = secrets.password
  } else {
    throw new Error('format non pris en charge')
  }

  const ssh = new NodeSSH()

  try {
    await ssh.connect(paramsConnection)
  } catch (err) {
    console.error(err)
    throw new Error('Configuration invalide')
  }
  const clientSFTP = await ssh.requestSFTP()

  const path = params.currentFolderId ?? '.'
  const files: FileEntryWithStats[] = await new Promise((resolve, reject) => {
    if (!clientSFTP) {
      throw new Error('Configuration invalide (clientSFTP manquant)')
    }
    clientSFTP.readdir(path, (err: any, list: any) => {
      if (err) {
        console.error('Error reading directory:', err)
        return reject(err)
      }
      resolve(list)
    })
  })

  const results = prepareFiles(files, path)

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

  return {
    count: results.length,
    results,
    path: pathFolder
  }
}
