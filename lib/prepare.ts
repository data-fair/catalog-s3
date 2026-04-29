import type { SFTPConfig } from '#types'
import type { PrepareContext } from '@data-fair/types-catalogs'
import type { SFTPCapabilities } from './capabilities.ts'
import { type Config, NodeSSH } from 'node-ssh'

export default async ({ catalogConfig, secrets }: PrepareContext<SFTPConfig, SFTPCapabilities>) => {
  switch (catalogConfig.connectionKey.key) {
    case 'sshKey':
      delete secrets.password
      if (catalogConfig.connectionKey.sshKey === '') {
        delete secrets.sshKey
      } else if (catalogConfig.connectionKey.sshKey && catalogConfig.connectionKey.sshKey !== '********') {
        secrets.sshKey = catalogConfig.connectionKey.sshKey
        catalogConfig.connectionKey.sshKey = '********'
      }
      break
    case 'password':
      delete secrets.sshKey
      if (catalogConfig.connectionKey.password === '') {
        delete secrets.password
      } else if (catalogConfig.connectionKey.password && catalogConfig.connectionKey.password !== '********') {
        secrets.password = catalogConfig.connectionKey.password
        catalogConfig.connectionKey.password = '********'
      }
      break
    default: break
  }

  // try the SFTP connection
  try {
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
    await ssh.connect(paramsConnection)
    ssh.dispose()
  } catch (error) {
    console.error('Connection test failed:', error)
    throw new Error('Connection test failed', { cause: error })
  }

  return {
    catalogConfig,
    secrets
  }
}
