'use strict'

const fp = require('fastify-plugin')
const { introspectSchema } = require('@graphql-tools/wrap')
const { stitchSchemas } = require('@graphql-tools/stitch')
const { buildFederationSchema } = require('mercurius')
const { printSDL } = require('@autotelic/graphql-schema-tools')

async function mercuriusRemoteSchema (fastify, options) {
  const {
    schema: baseServiceSchema,
    replaceSchema,
    defineResolvers
  } = fastify.graphql

  const {
    pollingInterval = null,
    stitchSchemaOpts = {},
    localSubschemaOpts = {},
    subschemas = [],
    federationMetadata
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

    const localSubschema = {
      ...localSubschemaOpts,
      schema: baseServiceSchema
    }

    const stitchedSchemas = stitchSchemas({
      ...stitchSchemaOpts,
      mergeDirectives: true,
      subschemas: [...subschemas, localSubschema]
    })

    if (federationMetadata) {
      const SDL = printSDL(stitchedSchemas, {
        filterDirectives: [
          'external',
          'requires',
          'provides',
          'key',
          'extends'
        ],
        filterTypes: [
          '_Any',
          '_FieldSet',
          '_Service'
        ],
        filterFields: {
          Query: ['_service', '_entities']
        }
      })

      const federatedSchema = buildFederationSchema(SDL)

      const { _entities, _service } = federatedSchema.getType('Query').getFields()

      const federatedResolvers = {}
      /* istanbul ignore next */
      if (_service && _service.resolve) { federatedResolvers._service = _service.resolve }
      if (_entities && _entities.resolve) { federatedResolvers._entities = _entities.resolve }

      replaceSchema(stitchedSchemas)
      defineResolvers({ Query: federatedResolvers })
    } else {
      replaceSchema(stitchedSchemas)
    }
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

  let intervalId
  function autoRefreshRemoteSchemas (interval = pollingInterval) {
    stopAutoRefreshRemoteSchemas()
    intervalId = setTimeout(async () => {
      await buildSchema()
      intervalId = null
      autoRefreshRemoteSchemas(interval)
    }, interval)
  }

  function stopAutoRefreshRemoteSchemas () {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  if (pollingInterval !== null) {
    autoRefreshRemoteSchemas()
  }

  fastify.graphql.addRemoteSchemas = addRemoteSchemas
  fastify.graphql.refreshRemoteSchemas = refreshRemoteSchemas
  fastify.graphql.autoRefreshRemoteSchemas = autoRefreshRemoteSchemas
  fastify.graphql.stopAutoRefreshRemoteSchemas = stopAutoRefreshRemoteSchemas
}

module.exports = fp(mercuriusRemoteSchema, {
  name: 'mercurius-remote-schema',
  decorators: {
    fastify: ['graphql']
  },
  dependencies: ['mercurius']
})
