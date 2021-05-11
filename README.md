# mercurius-remote-schema

A plugin for using remote schemas with [Mercurius](https://mercurius.dev).

## Usage

```sh
npm i @autotelic/mercurius-remote-schema
```
#### Example

```js
const remoteSchema = require('@autotelic/mercurius-remote-schema')

function myPlugin (fastify, opts) {
  // Create an [executor](https://www.graphql-tools.com/docs/remote-schemas/#creating-an-executor) for interacting with the remote schema.
  const createExecutor = (url) => async ({ document, variables }) => {
    const query = print(document);
    const { body } = await got.post(url, {
      json: { query, variables },
      responseType: 'json'
    });
    return body
  };

  const executor = createExecutor('http://example.com/graphql')

  // Introspect the remote schema and stitch it together with the existing mercurius
  // service schema.
  fastify.register(remoteSchema, {
    subschemas: [{ executor }]
  })
  // Once the remote schema plugin has been loaded, you may also use the graphql.
  // addRemoteSchemas decorator.
  fastify.graphql.addRemoteSchemas([{ someOtherRemoteSchemaExecutor }])
```

## API

### Plugin `options`

mercurius-remote-schema accepts the following *optional* configuration:

 - #### `subschemas`

   - An array of subschema [configuration objects](https://www.graphql-tools.com/docs/stitch-combining-schemas#subschema-configs)

      | field | description | required |
      |-------|-------------|----------|
      | executor | A graphql remote schema [executor](https://www.graphql-tools.com/docs/remote-schemas/#creating-an-executor) | yes |
      |transforms| An array of graphql [transforms](https://www.graphql-tools.com/docs/schema-wrapping/#built-in-transforms) | no |
      | subscriber | A graphql [subscriber](https://www.graphql-tools.com/docs/remote-schemas#creating-a-subscriber) | no |

 - #### `stitchSchemaOpts`
   - Options object to be passed to [stitchSchemas](https://www.graphql-tools.com/docs/stitch-api#stitchschemas)

 - #### `pollingInterval`
   - The interval (in milliseconds) in which service should poll the remote services to refresh its schema. If left undefined there will be no automated refresh behavior
   configured unless the `autoRefreshRemoteSchemas` decorator is used.

 - #### `localSubschemaOpts`
   - A subschema [configuration object](https://www.graphql-tools.com/docs/stitch-combining-schemas#subschema-configs). Note `schema` is pre-configured and will not
   be overridden.

### `Decorators`

*Note* All decorators are added to the `graphql` namespace.

#### `addRemoteSchemas`

`mercurius-remote-schema` adds a `fastify.graphql.addRemoteSchemas` decorator to allow
adding additional remote schemas after plugin initialization.

It accepts the following arguments:

- `subschemas`: An array of subschema configuration objects.

#### `refreshRemoteSchemas`

May be invoked to trigger a refetch of all registered remote schemas and re-stitch the service schema.

#### `autoRefreshRemoteSchemas`

Used to enable automatic polling and refreshing of remote schemas.

It accepts the following arguments:

- `interval`: The polling interval (in milliseconds)

#### `stopAutoRefreshRemoteSchemas`

Used to stop the automated remote schema refresh behavior.
