import type { EuropeParis } from '#type/catalogConfig/index.ts'

import { strict as assert } from 'node:assert'
import { describe, it, beforeEach, before, after } from 'node:test'

import { mockClient } from 'aws-sdk-client-mock'
import { S3Client, ListObjectsV2Command, ListBucketsCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import fs from 'fs-extra'
import { mkdir, rm } from 'node:fs/promises'

import prepare from '../lib/prepare.ts'
import { list } from './../lib/imports.ts'
import type { S3Capabilities } from '../lib/capabilities.ts'
import { getResource } from '../lib/download.ts'
import { logFunctions } from './test-utils.ts'

const s3Mock = mockClient(S3Client)
const testDirectory = './test-it/data-test/'

// No real data, the data isn't real, it's mocked.
const catalogConfig = {
  region: 'eu-west-3' as EuropeParis,
  bucket: 'test-bucket',
  accessKeys: {
    accessKeyId: 'test-key',
    secretAccessKey: 'cle-secrete'
  },
  endpoint: 'http://localhost:9000',
  forcePathStyle: true
}

const secrets = {
  secretAccessKey: 'cle-secrete'
}

describe('test the S3 catalog', () => {
  beforeEach(() => {
    s3Mock.reset()
  })

  describe('test the prepare() function', () => {
    it('mask the secret key during verification', async () => {
      s3Mock.on(ListBucketsCommand).resolves({ Buckets: [] })

      const secrets = {}
      const capabilities = {} as S3Capabilities
      const result = await prepare({ catalogConfig, capabilities, secrets })

      assert.deepEqual(result.secrets.secretAccessKey, 'cle-secrete')
      assert.deepEqual(result.catalogConfig.accessKeys.secretAccessKey, '***************')
    })

    it('creates an error if the connection fails', async () => {
      s3Mock.on(ListBucketsCommand).rejects(new Error('Connection failed'))

      await assert.rejects(
        async () => {
          const capabilities = {} as S3Capabilities
          await prepare({ catalogConfig, capabilities, secrets })
        }
      )
    })
  })

  describe('test the list() function', () => {
    it('read the contents of the bucket at the root', async () => {
      s3Mock
        .on(ListObjectsV2Command, { Prefix: '' })
        .resolves({
          Contents: [{ Key: 'test.xlsx', Size: 500 }],
          CommonPrefixes: [{ Prefix: 'hello-world/' }]
        })

      const params = {}
      const result = await list({ catalogConfig, secrets, params })

      assert.equal(result.count, 2)
      assert.deepEqual(result.results[0], { id: '/hello-world', title: 'hello-world', type: 'folder', updatedAt: undefined })
      assert.deepEqual(result.results[1], { id: '/test.xlsx', title: 'test.xlsx', type: 'resource', description: '', format: 'xlsx', mimeType: '', size: 500, updatedAt: undefined })
      assert.deepEqual(result.path, [])
    })

    it('read the contents of the bucket in a subfolder', async () => {
      s3Mock
        .on(ListObjectsV2Command, { Prefix: 'data/' })
        .resolves({
          Contents: [{ Key: 'data/fichier.csv', Size: 500 }]
        })

      const params = { currentFolderId: '/data' }
      const result = await list({ catalogConfig, secrets, params })

      assert.equal(result.count, 1)
      assert.deepEqual(result.results[0], { id: '/data/fichier.csv', title: 'fichier.csv', type: 'resource', description: '', format: 'csv', mimeType: '', size: 500, updatedAt: undefined })
      assert.deepEqual(result.path, [{ id: '/data', title: 'data', type: 'folder' }])
    })

    it('read an empty bucket', async () => {
      s3Mock
        .on(ListObjectsV2Command, { Prefix: '' })
        .resolves({
          Contents: [],
          CommonPrefixes: []
        })

      const params = {}
      const result = await list({ catalogConfig, secrets, params })

      assert.equal(result.count, 0)
      assert.deepEqual(result.path, [])
    })

    it('read connection error', async () => {
      s3Mock.on(ListObjectsV2Command).rejects(new Error('Connection refused'))
      await assert.rejects(
        async () => {
          const params = { currentFolderId: '' }
          await list({ catalogConfig, secrets, params })
        }
      )
    })
  })

  describe('test the getResource() function', () => {
    before(async () => {
      await mkdir(testDirectory, { recursive: true })
    })

    after(async () => {
      await rm(testDirectory, { recursive: true, force: true })
    })

    it('retrieving the test.xlsx file', async () => {
      s3Mock
        .on(GetObjectCommand, {
          Bucket: 'test-bucket',
          Key: 'data/test.xlsx'
        })
        .resolves({
          Body: Readable.from('Hello, I\'m a test') as any
        })

      const importConfig: Record<string, any> = {}
      const update = { metadata: false, schema: false }
      const result = await getResource({ catalogConfig, secrets, importConfig, resourceId: '/data/test.xlsx', tmpDir: testDirectory, log: logFunctions, update })

      assert.ok(result)
      assert.strictEqual(result.title, 'test.xlsx')
      assert.strictEqual(result.id, '/data/test.xlsx')
      assert.strictEqual(result.format, 'xlsx')
      const fileExists = await fs.pathExists(result.filePath)
      assert.ok(fileExists, 'The downloaded file should exist')
    })

    it('error when the file does not exist', async () => {
      s3Mock
        .on(GetObjectCommand, {
          Bucket: 'test-bucket',
          Key: 'data/test.xlsx'
        })
        .rejects(new Error('This file doesn\'t exist'))

      await assert.rejects(
        async () => {
          const importConfig: Record<string, any> = {}
          const update = { metadata: false, schema: false }
          await getResource({ catalogConfig, secrets, importConfig, resourceId: '/data/test.xlsx', tmpDir: testDirectory, log: logFunctions, update })
        }
      )
    })

    it('resource connection error', async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error('Connection refused'))
      await assert.rejects(
        async () => {
          const params = { currentFolderId: '' }
          await list({ catalogConfig, secrets, params })
        }
      )
    })
  })
})
