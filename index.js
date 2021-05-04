'use strict'

const fp = require('fastify-plugin')
const { introspectSchema } = require('@graphql-tools/wrap')
const { stitchSchemas } = require('@graphql-tools/stitch')

async function mercuriusRemoteSchema (fastify, options) {
  const {
    subschemas = [],
    stitchSchemaOpts = {}
  } = options

  async function createSubschema (subschemaConfig) {
    // TODO(jkirkpatrick24): Enforce existence of an executor.
    const { executor, ...restConfig } = subschemaConfig

    return {
      schema: await introspectSchema(executor),
      executor,
      ...restConfig
    }
  }

  async function addRemoteSchemas (subschemaConfigs) {
    const { schema, replaceSchema } = fastify.graphql
    const subschemas = await Promise.all(subschemaConfigs.map(createSubschema))

    replaceSchema(stitchSchemas({
      ...stitchSchemaOpts,
      subschemas: [...subschemas, schema]
    }))
  }

  if (subschemas.length > 0) {
    await addRemoteSchemas(subschemas)
  }

  fastify.graphql.addRemoteSchemas = addRemoteSchemas
}

module.exports = fp(mercuriusRemoteSchema, {
  name: 'mercurius-remote-schema',
  decorators: {
    fastify: ['graphql']
  },
  dependencies: ['mercurius']
})
