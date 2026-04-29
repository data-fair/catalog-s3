import type { SFTPConfig } from '#types'
import type { CatalogPlugin } from '@data-fair/types-catalogs'

import { strict as assert } from 'node:assert'
import { describe, it, before, after, beforeEach } from 'node:test'
import { logFunctions } from './test-utils.ts'

import fs from 'fs-extra'
import util from 'util'
import ssh2 from 'ssh2'
import { exec as execCallback } from 'child_process'

// Import plugin and use default type like it's done in Catalogs
import plugin from '../index.ts'
const catalogPlugin: CatalogPlugin = plugin as CatalogPlugin

const exec = util.promisify(execCallback)
const { generateKeyPairSync } = ssh2.utils

// Generate the SSH keys
const keysUser = generateKeyPairSync('ed25519')
const keysHost = generateKeyPairSync('ed25519')

/** Mock catalog configuration for testing purposes. */
const catalogConfig: SFTPConfig = {
  url: 'localhost',
  port: 31022,
  login: 'test3',
  connectionKey: {
    sshKey: '********',
    key: 'sshKey'
  }
}

const secrets = { sshKey: keysUser.private }

const getResourceDefaultConfig = {
  catalogConfig,
  secrets,
  importConfig: { },
  update: { metadata: true, schema: true },
  tmpDir: './test-it/test-dl',
  log: logFunctions
}

// Configurations invalides pour les tests d'erreur
const invalidTestsConfigs: { description: string, config: SFTPConfig, secret: Record<string, string> }[] = [
  {
    description: 'should throw an error with an invalid url',
    config: {
      url: 'exemple',
      port: 31022,
      login: 'test3',
      connectionKey: {
        sshKey: '***',
        key: 'sshKey'
      }
    },
    secret: secrets
  },
  {
    description: 'should throw an error with an invalid port',
    config: {
      url: 'localhost',
      port: 0,
      login: 'test3',
      connectionKey: {
        sshKey: '***',
        key: 'sshKey'
      }
    },
    secret: secrets
  },
  {
    description: 'should throw an error with an invalid login',
    config: {
      url: 'localhost',
      port: 31022,
      login: 'wrongLogin',
      connectionKey: {
        password: '***',
        key: 'password'
      }
    },
    secret: secrets
  },
  {
    description: 'should throw an error with an invalid password',
    config: {
      url: 'localhost',
      port: 31022,
      login: 'test3',
      connectionKey: {
        password: '***',
        key: 'password'
      }
    },
    secret: { password: '0000' }
  },
  {
    description: 'should throw an error with an invalid sshKey',
    config: {
      url: 'localhost',
      port: 31022,
      login: 'test3',
      connectionKey: {
        sshKey: '***',
        key: 'sshKey'
      }
    },
    secret: { sshKey: '0000' }
  }
]

describe('test the sftp catalog', () => {
  // Démarrage et initialisation du serveur SFTP avant les tests
  before(async () => {
    try {
      if (!fs.existsSync('./test-it/config/user_keys')) {
        fs.mkdirSync('./test-it/config/user_keys', { recursive: true })
      }
      if (!fs.existsSync('./test-it/config/ssh_host_keys')) {
        fs.mkdirSync('./test-it/config/ssh_host_keys', { recursive: true })
      }

      await fs.writeFile('./test-it/config/ssh_host_keys/test_key.pub', keysHost.public)
      await fs.writeFile('./test-it/config/ssh_host_keys/test_key', keysHost.private)
      await fs.writeFile('./test-it/config/user_keys/test_key.pub', keysUser.public)
      await fs.writeFile('./test-it/config/user_keys/test_key', keysUser.private)

      const { stdout, stderr } = await exec('docker compose up -d', { cwd: './test-it' })
      console.log(stdout)
      console.error(stderr)

      // Temps d'attente pour permettre au conteneur de vraiment se lancer
      await new Promise(resolve => setTimeout(resolve, 5000))
    } catch (err) {
      console.error('Erreur pendant le démarrage :', err)
      throw err
    }
  })

  // Arrêt du serveur SFTP après les tests
  after(async () => {
    try {
      const { stdout, stderr } = await exec('docker compose down', { cwd: './test-it' })
      console.log(stdout)
      console.error(stderr)
    } catch (err) {
      console.error("Erreur pendant l'arrêt", err)
    }
  })

  describe('test the list function', () => {
    it('should list resources and folder from landing-zone', async () => {
      const res = await catalogPlugin.list({ catalogConfig, secrets, params: { currentFolderId: './landing-zone' } })
      assert.strictEqual(res.count, res.results.length, 'la taille des resultats et du compte ne correspondent pas')
      assert.strictEqual(res.count, 3)
      assert.strictEqual(res.path.length, 1)
      assert.strictEqual(res.path[0].title, 'landing-zone')
      assert.ok(res.results.some((val) => val.title === 'test.txt'))
      assert.ok(res.results.some((val) => val.id === './landing-zone/test.txt'))
      assert.ok(res.results.some((val) => val.type === 'resource'))

      assert.ok(res.results.some((val) => val.title === 'donnees'))
      assert.ok(res.results.some((val) => val.id === './landing-zone/donnees'))
      assert.ok(res.results.some((val) => val.type === 'folder'))
    })

    it('should list resources and folder from a sub-folder', async () => {
      const res = await catalogPlugin.list({ catalogConfig, secrets, params: { currentFolderId: './landing-zone/donnees' } })
      assert.strictEqual(res.count, res.results.length, 'la taille des resultats et du compte ne correspondent pas')
      assert.strictEqual(res.count, 2)
      assert.strictEqual(res.path.length, 2)
      assert.strictEqual(res.path[1].title, 'donnees')
      assert.ok(res.results.some((val) => val.title === 'donnees.csv'))
      assert.ok(res.results.some((val) => val.id === './landing-zone/donnees/donnees.csv'))
      assert.ok(res.results.some((val) => val.type === 'resource'))
    })

    describe('SFTP list erreur', () => {
      invalidTestsConfigs.forEach(({ description, config, secret }) => {
        it('list ' + description, async () => {
          await assert.rejects(
            async () => {
              await catalogPlugin.list({
                catalogConfig: config,
                secrets: secret,
                params: { currentFolderId: './' }
              })
            },
            /Configuration invalide|Connection error/,
            'Doit renvoyer une erreur'
          )
        })
      })
    })
  })

  describe('test the getResource function', () => {
    before(() => {
      if (!fs.existsSync('./test-it/test-dl')) {
        fs.mkdirSync('./test-it/test-dl', { recursive: true })
      }
    })
    beforeEach(() => fs.emptyDirSync('./test-it/test-dl'))
    after(() => fs.removeSync('./test-it/test-dl'))

    it('should return the resource test.txt', async () => {
      const res = await catalogPlugin.getResource({
        ...getResourceDefaultConfig,
        resourceId: './landing-zone/test.txt',
      })
      assert.ok(res)
      assert.strictEqual(res.title, 'test.txt')
      assert.strictEqual(res.id, './landing-zone/test.txt')
      assert.strictEqual(res.format, 'txt')
      assert.strictEqual(res.filePath, './test-it/test-dl/test.txt')
      const fileExists = await fs.pathExists(res.filePath)
      assert.ok(fileExists, 'The downloaded file should exist')
    })
  })

  describe('SFTP getResource erreur', () => {
    invalidTestsConfigs.forEach(({ description, secret, config }) => {
      it('getResource ' + description, async () => {
        await assert.rejects(
          async () => {
            await catalogPlugin.getResource({
              ...getResourceDefaultConfig,
              catalogConfig: config,
              secrets: secret,
              resourceId: './landing-zone/test.txt'
            })
          },
          /Configuration invalide|Connection error/,
          'Doit renvoyer une erreur'
        )
      })
    })

    it('getResource should throw an error with an invalid resourceId', async () => {
      await assert.rejects(
        async () => {
          await catalogPlugin.getResource({
            ...getResourceDefaultConfig,
            resourceId: './landing-zone/something-wrong'
          })
        },
        /No such file/,
        'Doit renvoyer une erreur'
      )
    })
  })

  describe('prepare', () => {
    it('should mask sshKey and set secret when sshKey is provided', async () => {
      const catalogConfig: SFTPConfig = {
        url: 'localhost',
        port: 31022,
        login: 'test3',
        connectionKey: {
          sshKey: keysUser.private,
          key: 'sshKey'
        }
      }
      const secrets: Record<string, string> = {}

      const { catalogConfig: newConfig, secrets: newSecrets } = await catalogPlugin.prepare({
        catalogConfig: deepClone(catalogConfig),
        secrets,
        capabilities: []
      })

      assert.strictEqual((newConfig as SFTPConfig).connectionKey.sshKey, '********')
      assert.strictEqual(newSecrets?.sshKey, keysUser.private)
    })

    it('should mask password and set secret when password is provided', async () => {
      const catalogConfig: SFTPConfig = {
        url: 'localhost',
        port: 31022,
        login: 'test3',
        connectionKey: {
          password: '12345',
          key: 'password'
        }
      }
      const { catalogConfig: newConfig, secrets: newSecrets } = await catalogPlugin.prepare({
        catalogConfig: deepClone(catalogConfig),
        secrets,
        capabilities: []
      })

      assert.ok(newConfig, 'newConfig should not be undefined')
      assert.strictEqual((newConfig as SFTPConfig).connectionKey.password, '********')
      assert.strictEqual(newSecrets?.password, '12345')
    })

    it('should throw an error with invalid config', async () => {
      await assert.rejects(async () => {
        await catalogPlugin.prepare({
          catalogConfig: {
            ...deepClone(catalogConfig),
            url: 'invalid-url'
          },
          secrets: {},
          capabilities: []
        })
      }, /Connection test failed/, 'Doit renvoyer une erreur')
    })
  })

  function deepClone<T> (obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
})
