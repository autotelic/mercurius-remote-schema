'use strict'

const { test } = require('tap')
const { RenameRootFields } = require('@graphql-tools/wrap')
const {
  sleep,
  createRemoteService,
  createBaseGQLService,
  createTestExecutor
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
