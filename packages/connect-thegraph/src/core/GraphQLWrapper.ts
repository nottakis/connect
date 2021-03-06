import fetch from 'isomorphic-unfetch'
import {
  Client,
  GraphQLRequest,
  createRequest as createRequestUrql,
} from '@urql/core'
import { DocumentNode } from 'graphql'
import { pipe, subscribe } from 'wonka'
import { SubscriptionHandler } from '@aragon/connect-types'
import { ParseFunction, QueryResult } from '../types'

// Average block time is about 13 seconds on the 2020-08-14
// See https://etherscan.io/chart/blocktime
const POLL_INTERVAL_DEFAULT = 13 * 1000

function createRequest(query: DocumentNode, args: object): GraphQLRequest {
  // Make every operation type a query, until GraphQL subscriptions get added again.
  if (query.definitions) {
    query = {
      ...query,
      definitions: query.definitions.map((definition) => ({
        ...definition,
        operation: 'query',
      })),
    }
  }
  return createRequestUrql(query, args)
}

type GraphQLWrapperOptions = {
  pollInterval?: number
  verbose?: boolean
}

export default class GraphQLWrapper {
  #client: Client
  #pollInterval: number
  #verbose: boolean

  constructor(
    subgraphUrl: string,
    options: GraphQLWrapperOptions | boolean = {}
  ) {
    if (typeof options === 'boolean') {
      console.warn(
        'GraphQLWrapper: please use `new GraphQLWrapper(url, { verbose })` rather than `new GraphQLWrapper(url, verbose)`.'
      )
      options = { verbose: options }
    }
    options = options as GraphQLWrapperOptions

    this.#verbose = options.verbose ?? false
    this.#pollInterval = options.pollInterval ?? POLL_INTERVAL_DEFAULT

    this.#client = new Client({ maskTypename: true, url: subgraphUrl, fetch })
  }

  close(): void {
    // Do nothing for now.
    // Will be used when GraphQL subscriptions will be added again.
  }

  subscribeToQuery(
    query: DocumentNode,
    args: any = {},
    callback: Function
  ): SubscriptionHandler {
    const request = createRequest(query, args)

    return pipe(
      this.#client.executeQuery(request, {
        pollInterval: this.#pollInterval,
        requestPolicy: 'cache-and-network',
      }),
      subscribe((result: QueryResult) => {
        if (this.#verbose) {
          console.log(this.describeQueryResult(result))
        }

        if (result.error) {
          throw new Error(
            [
              'Error performing subscription.',
              `${result.error.name}: ${result.error.message}`,
              this.describeQueryResult(result),
            ].join('\n')
          )
        }

        callback(result)
      })
    )
  }

  subscribeToQueryWithParser<T>(
    query: DocumentNode,
    args: any = {},
    callback: Function,
    parser: ParseFunction
  ): SubscriptionHandler {
    return this.subscribeToQuery(query, args, async (result: QueryResult) => {
      callback(await this.parseQueryResult<T>(parser, result))
    })
  }

  async performQuery(
    query: DocumentNode,
    args: any = {}
  ): Promise<QueryResult> {
    const result = await this.#client.query(query, args).toPromise()

    if (this.#verbose) {
      console.log(this.describeQueryResult(result))
    }

    if (result.error) {
      throw new Error(
        this.describeQueryResultError(result) + this.describeQueryResult(result)
      )
    }

    return result
  }

  async performQueryWithParser<T>(
    query: DocumentNode,
    args: any = {},
    parser: ParseFunction
  ): Promise<T> {
    const result = await this.performQuery(query, args)
    return this.parseQueryResult<T>(parser, result)
  }

  async parseQueryResult<T>(
    parser: ParseFunction,
    result: QueryResult
  ): Promise<T> {
    try {
      return parser(result)
    } catch (error) {
      throw new Error(error.message + '\n\n' + this.describeQueryResult(result))
    }
  }

  private describeQueryResultError(result: QueryResult): string {
    if (!result.error) {
      return ''
    }
    return `${result.error.name}: ${result.error.message}\n\n`
  }

  private describeQueryResult(result: QueryResult): string {
    const queryStr = result.operation.query.loc?.source.body
    const dataStr = JSON.stringify(result.data, null, 2)
    const argsStr = JSON.stringify(result.operation.variables, null, 2)
    const subgraphUrl = result.operation.context.url

    return [
      `Subgraph: ${subgraphUrl}`,
      `Arguments: ${argsStr}`,
      `Query: ${queryStr}`,
      `Returned data: ${dataStr}`,
    ].join('\n\n')
  }
}
