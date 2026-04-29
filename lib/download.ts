import type { SFTPConfig } from '#types'
import type { CatalogPlugin, GetResourceContext, Resource } from '@data-fair/types-catalogs'
import { type Config, NodeSSH } from 'node-ssh'

/**
 * Download localy a specific resource from a SFTP server, and retrieves the metadata with the filepath of the downloaded file.
 *
 * @param catalogConfig - The SFTP configuration object.
 * @param resourceId - The identifier (path) of the resource.
 * @returns A `Resource` object representing the file.
 */
export const getResource = async (context: GetResourceContext<SFTPConfig>): ReturnType<CatalogPlugin['getResource']> => {
  const resource = await getMetaData(context)
  resource.filePath = await downloadResource(context)
  return resource
}

export const getMetaData = async ({ catalogConfig, resourceId }: GetResourceContext<SFTPConfig>): Promise<Resource> => {
  const pointPos = resourceId.lastIndexOf('.')
  return {
    id: resourceId,
    title: resourceId.substring(resourceId.lastIndexOf('/') + 1),
    format: (pointPos === -1) ? '' : (resourceId.substring(pointPos + 1)),
    filePath: ''
  }
}

/**
 * Downloads a resource (file) from the SFTP server to a temporary directory.
 *
 * @param context - The context containing catalog configuration, resource ID, import configuration, and temporary directory path.
 * @returns The local path to the downloaded file, or `undefined` if the download fails.
 * @throws Will throw an error if the connection configuration is invalid or not supported.
 */
const downloadResource = async ({ catalogConfig, resourceId, secrets, tmpDir }:GetResourceContext<SFTPConfig>) => {
  const ssh = new NodeSSH()

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

  try {
    await ssh.connect(paramsConnection)
  } catch (err) {
    throw new Error('Configuration invalide')
  }

  // const fs = await import('node:fs/promises')
  resourceId = resourceId.substring(resourceId.indexOf('./') + 2)
  const destinationPath = tmpDir + '/' + resourceId.substring(resourceId.lastIndexOf('/') + 1)

  // creation du dossier pour stocker le fichier distant
  // await fs.mkdir(destinationPath.substring(0, destinationPath.lastIndexOf('/')), { recursive: true })

  try {
    await ssh.getFile(destinationPath, resourceId)
    return destinationPath
  } catch (error) {
    console.error('Error downloading file:', error)
    throw error
  }
}
