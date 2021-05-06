'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const { print } = require('graphql')
const got = require('got')

const testSchema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const testResolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
  }
}

const testSchema2 = `
  type Query {
    subtract(x: Int, y: Int): Int
  }
`

const testResolvers2 = {
  Query: {
    subtract: async (_, { x, y }) => x - y
  }
}

async function createRemoteService (schema = testSchema, resolvers = testResolvers, port = 0) {
  const service = Fastify()

  service.register(mercurius, {
    schema,
    resolvers
  })

  await service.listen(port)
  return [service, service.server.address().port]
}

function createBaseGQLService (schema = testSchema2, resolvers = testResolvers2) {
  const service = Fastify()

  service.inject.query = async (query) => {
    const res = await service.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })

    return res.json()
  }

  service.register(mercurius, {
    schema,
    resolvers
  })

  return service
}

function createTestExecutor (servicePort) {
  return async function executor ({ document, variables }) {
    const query = print(document)
    try {
      const { body } = await got.post(`http://localhost:${servicePort}/graphql`, {
        json: { query, variables },
        responseType: 'json'
      })
      return body
    } catch (error) {
      console.log(error)
    }
  }
}

module.exports = {
  createRemoteService,
  createBaseGQLService,
  createTestExecutor
}
