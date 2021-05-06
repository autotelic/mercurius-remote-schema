'use strict'

const fp = require('fastify-plugin')
const { introspectSchema } = require('@graphql-tools/wrap')
const { stitchSchemas } = require('@graphql-tools/stitch')

async function mercuriusRemoteSchema (fastify, options) {
  const {
    schema: baseServiceSchema,
    replaceSchema
  } = fastify.graphql

  const {
    subschemas = [],
    stitchSchemaOpts = {}
  } = options

  const remoteSubschemas = subschemas

  async function createSubschema (subschemaConfig) {
    // TODO(jkirkpatrick24): Enforce existence of an executor.
    const { executor, ...restConfig } = subschemaConfig

    return {
      schema: await introspectSchema(executor),
      executor,
      ...restConfig
    }
  }

  async function buildSchema () {
    const subschemas = await Promise.all(remoteSubschemas.map(createSubschema))

    replaceSchema(stitchSchemas({
      ...stitchSchemaOpts,
      subschemas: [...subschemas, baseServiceSchema]
    }))
  }

  async function addRemoteSchemas (subschemaConfigs) {
    subschemaConfigs.forEach(config => remoteSubschemas.push(config))
    await buildSchema()
  }

  async function refreshRemoteSchemas () {
    await buildSchema()
  }

  if (remoteSubschemas.length > 0) {
    await buildSchema()
  }

  fastify.graphql.addRemoteSchemas = addRemoteSchemas
  fastify.graphql.refreshRemoteSchemas = refreshRemoteSchemas
}

module.exports = fp(mercuriusRemoteSchema, {
  name: 'mercurius-remote-schema',
  decorators: {
    fastify: ['graphql']
  },
  dependencies: ['mercurius']
})
