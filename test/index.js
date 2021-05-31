'use strict'

const { test } = require('tap')
const { RenameRootFields } = require('@graphql-tools/wrap')
const {
  sleep,
  createRemoteService,
  createBaseGQLService,
  createTestExecutor,
  createGatewayService
} = require('./utils')

const plugin = require('..')

test('Stitches the remote and service schema together', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    await remoteService.close()
    await gql.close()
  })
  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService()

  gql.register(plugin, {
    subschemas: [{ executor }]
  })

  await gql.ready()

  const actual = await gql.inject.query(`{
    add(x: 1, y: 3)
    subtract(x: 4, y: 3)
  }`)

  const expected = {
    data: {
      add: 4,
      subtract: 1
    }
  }

  t.same(actual, expected)
})

test('Stitches the remote and service schema together using the addRemoteSchema decorator', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    await remoteService.close()
    await gql.close()
  })
  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService()

  gql.register(plugin)

  await gql.after()
  await gql.graphql.addRemoteSchemas([{ executor }])

  await gql.ready()

  const actual = await gql.inject.query(`{
    add(x: 1, y: 3)
    subtract(x: 4, y: 3)
  }`)

  const expected = {
    data: {
      add: 4,
      subtract: 1
    }
  }

  t.same(actual, expected)
})

test('"addRemoteSchema" decorator is additive when stitching together remote schemas', async (t) => {
  const testSchema = `
    type Query {
      multiply(x: Int, y: Int): Int
    }
  `

  const testResolvers = {
    Query: {
      multiply: async (_, { x, y }) => x * y
    }
  }
  const [remoteService, remoteServicePort] = await createRemoteService()
  const [remoteService2, remoteServicePort2] = await createRemoteService(testSchema, testResolvers)
  t.teardown(async () => {
    await remoteService.close()
    await remoteService2.close()
    await gql.close()
  })
  const executor = createTestExecutor(remoteServicePort)
  const executor2 = createTestExecutor(remoteServicePort2)
  const gql = createBaseGQLService()

  gql.register(plugin, { subschemas: [{ executor }] })
  await gql.after()

  await gql.graphql.addRemoteSchemas([{ executor: executor2 }])

  await gql.ready()

  const actual = await gql.inject.query(`{
    subtract(x: 4, y: 3)
    multiply(x: 4, y: 3)
    add(x: 1, y: 3)
  }`)

  const expected = {
    data: {
      add: 4,
      subtract: 1,
      multiply: 12
    }
  }

  t.same(actual, expected)
})

test('"plugin" - Supports transforms at the subschema level', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    await remoteService.close()
    await gql.close()
  })
  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService()

  gql.register(plugin, {
    subschemas: [{
      executor,
      transforms: [
        new RenameRootFields((operationName, fieldName, fieldConfig) => `new_${fieldName}`)
      ]
    }]
  })

  await gql.ready()

  const actual = await gql.inject.query(`{
    new_add(x: 1, y: 3)
    subtract(x: 4, y: 3)
  }`)

  const expected = {
    data: {
      new_add: 4,
      subtract: 1
    }
  }

  t.same(actual, expected)
})

test('"plugin" - Allows local subschema configuration through plugin option "localSubschemaOpts"', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    await remoteService.close()
    await gql.close()
  })
  const executor = createTestExecutor(remoteServicePort)

  const gql = createBaseGQLService()

  const localSubschemaOpts = {
    transforms: [
      new RenameRootFields((operationName, fieldName, fieldConfig) => `local_${fieldName}`)
    ]
  }

  gql.register(plugin, {
    subschemas: [{ executor }],
    localSubschemaOpts
  })

  await gql.ready()

  const actual = await gql.inject.query(`{
    add(x: 1, y: 3)
    local_subtract(x: 4, y: 2)
  }`)

  const expected = {
    data: {
      add: 4,
      local_subtract: 2
    }
  }

  t.same(actual, expected)
})

test('"refreshRemoteSchemas" refreshes the remote schemas', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    if (remoteService && remoteService.close) {
      await remoteService.close()
    }
    await gql.close()
    await updatedRemoteService.close()
  })
  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService()

  gql.register(plugin, {
    subschemas: [{ executor }]
  })

  await gql.ready()

  const actual = await gql.inject.query(`{
    add(x: 1, y: 3)
    subtract(x: 4, y: 3)
  }`)

  const expected = {
    data: {
      add: 4,
      subtract: 1
    }
  }

  t.same(actual, expected)
  await remoteService.close()
  const testSchema = `
    type Query {
      divide(x: Int, y: Int): Int
    }
  `

  const testResolvers = {
    Query: {
      divide: async (_, { x, y }) => x / y
    }
  }
  const [updatedRemoteService] = await createRemoteService(
    testSchema,
    testResolvers,
    remoteServicePort
  )

  await gql.graphql.refreshRemoteSchemas()

  const actual2 = await gql.inject.query(`{
    divide(x: 4, y: 2)
    subtract(x: 4, y: 3)
  }`)

  const expected2 = {
    data: {
      divide: 2,
      subtract: 1
    }
  }

  t.same(actual2, expected2)
})

test('automatically refreshes the remote schemas when the "autoRefreshRemoteSchemas" decorator is used', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    if (remoteService && remoteService.close) {
      await remoteService.close()
    }
    await gql.close()
    await updatedRemoteService.close()
    gql.graphql.stopAutoRefreshRemoteSchemas()
  })
  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService()

  gql.register(plugin, {
    subschemas: [{ executor }]
  })

  await gql.ready()

  const actual = await gql.inject.query(`{
    add(x: 1, y: 3)
    subtract(x: 4, y: 3)
  }`)

  const expected = {
    data: {
      add: 4,
      subtract: 1
    }
  }

  t.same(actual, expected)
  await remoteService.close()
  const testSchema = `
    type Query {
      divide(x: Int, y: Int): Int
    }
  `

  const testResolvers = {
    Query: {
      divide: async (_, { x, y }) => x / y
    }
  }
  const [updatedRemoteService] = await createRemoteService(
    testSchema,
    testResolvers,
    remoteServicePort
  )

  const INTERVAL = 1000
  gql.graphql.autoRefreshRemoteSchemas(INTERVAL)

  await sleep(2000)
  const actual2 = await gql.inject.query(`{
    divide(x: 4, y: 2)
    subtract(x: 4, y: 3)
  }`)

  const expected2 = {
    data: {
      divide: 2,
      subtract: 1
    }
  }

  t.same(actual2, expected2)
})

test('automatically refreshes the remote schemas when the pollingInterval plugin opt is set', async (t) => {
  const [remoteService, remoteServicePort] = await createRemoteService()
  t.teardown(async () => {
    if (remoteService && remoteService.close) {
      await remoteService.close()
    }
    await gql.close()
    await updatedRemoteService.close()
    gql.graphql.stopAutoRefreshRemoteSchemas()
  })
  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService()

  gql.register(plugin, {
    pollingInterval: 1500,
    subschemas: [{ executor }]
  })

  await gql.ready()

  const actual = await gql.inject.query(`{
    add(x: 1, y: 3)
    subtract(x: 4, y: 3)
  }`)

  const expected = {
    data: {
      add: 4,
      subtract: 1
    }
  }

  t.same(actual, expected)
  await remoteService.close()
  const testSchema = `
    type Query {
      divide(x: Int, y: Int): Int
    }
  `

  const testResolvers = {
    Query: {
      divide: async (_, { x, y }) => x / y
    }
  }
  const [updatedRemoteService] = await createRemoteService(
    testSchema,
    testResolvers,
    remoteServicePort
  )

  await sleep(2000)
  const actual2 = await gql.inject.query(`{
    divide(x: 4, y: 2)
    subtract(x: 4, y: 3)
  }`)

  const expected2 = {
    data: {
      divide: 2,
      subtract: 1
    }
  }

  t.same(actual2, expected2)
})

test('plugin opts - federationMetadata true supports federated services', async (t) => {
  const federatedSchema = `
    type Review {
      author: ID!
      title: String
      stars: Int
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      reviews: [Review]
    }
`

  const reviews = [
    {
      author: '1a',
      title: 'MovieA',
      stars: 1
    },
    {
      author: '2b',
      title: 'MovieB',
      stars: 5
    }
  ]
  const federatedResolvers = {
    User: {
      reviews: ({ id }) => reviews.filter(({ author }) => author === id)
    }
  }

  const [federatedService, federatedServicePort] = await createRemoteService(
    federatedSchema,
    federatedResolvers,
    0,
    { federationMetadata: true }
  )

  const testSchema = `
    extend type Query {
      me: User
    }

    type User @key(fields: "id") {
      id: ID!
    }
  `
  const testResolvers = {
    Query: {
      me: async () => ({ id: '1a' })
    }
  }

  t.teardown(async () => {
    await remoteService.close()
    await gql.close()
    await federatedService.close()
    await gatewayService.close()
  })

  const [remoteService, remoteServicePort] = await createRemoteService()

  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService(
    testSchema,
    testResolvers,
    { federationMetadata: true }
  )

  gql.register(plugin, {
    subschemas: [{ executor }],
    federationMetadata: true
  })

  await gql.ready()
  await gql.listen(0)
  const { port } = gql.server.address()

  const [gatewayService] = await createGatewayService([
    {
      name: 'base',
      url: `http://localhost:${port}/graphql`
    },
    {
      name: 'user',
      url: `http://localhost:${federatedServicePort}/graphql`
    }
  ])

  const actual = await gql.inject.query(`{
    _service {
      sdl
    }
  }`)

  const sdl = `type Query {
  add(x: Int, y: Int): Int
  me: User
}

type User @key(fields: "id") {
  id: ID!
}

union _Entity = User
`

  const expected = {
    data: {
      _service: {
        sdl
      }
    }
  }

  t.same(actual, expected)

  const gatewayActual = await gatewayService.inject.query(`{
    me {
      id
      reviews {
        stars
        title
      }
    }
  }`)

  const gatewayExpected = {
    data: {
      me: {
        id: '1a',
        reviews: [
          {
            stars: 1,
            title: 'MovieA'
          }
        ]
      }
    }
  }

  t.same(gatewayActual, gatewayExpected)
})

test('plugin opts - federationMetadata true supports federated services with no _entities resolver defined', async (t) => {
  const testSchema = `
    extend type Query {
      multiply(x: Int, y: Int): Result
    }

    type Result {
      result: Int
    }
  `
  const testResolvers = {
    Query: {
      multiply: async (_, { x, y }) => ({ result: x * y })
    }
  }

  t.teardown(async () => {
    await remoteService.close()
    await gql.close()
    await gatewayService.close()
  })

  const [remoteService, remoteServicePort] = await createRemoteService()

  const executor = createTestExecutor(remoteServicePort)
  const gql = createBaseGQLService(
    testSchema,
    testResolvers,
    { federationMetadata: true }
  )

  gql.register(plugin, {
    subschemas: [{ executor }],
    federationMetadata: true
  })

  await gql.ready()
  await gql.listen(0)
  const { port } = gql.server.address()

  const [gatewayService] = await createGatewayService([
    {
      name: 'base',
      url: `http://localhost:${port}/graphql`
    }
  ])

  const actual = await gatewayService.inject.query(`{
    multiply(x: 2 y: 2) {
      result
    }
  }`)

  const expected = {
    data: {
      multiply: { result: 4 }
    }
  }

  t.same(actual, expected)
})
