import { SubscriptionHandler } from '@aragon/connect-types'
import { GraphQLWrapper, QueryResult } from '@aragon/connect-thegraph'
import { IFinanceConnector } from '../types'
import Transaction from '../models/Transaction'
import TokenBalance from '../models/TokenBalance'
import * as queries from './queries'
import { parseTransactions, parseTokenBalance } from './parsers'

export function subgraphUrlFromChainId(chainId: number) {
  if (chainId === 1) {
    return 'https://api.thegraph.com/subgraphs/name/aragon/aragon-finance-mainnet'
  }
  if (chainId === 4) {
    return 'https://api.thegraph.com/subgraphs/name/aragon/aragon-finance-rinkeby'
  }
  if (chainId === 100) {
    return 'https://api.thegraph.com/subgraphs/name/aragon/aragon-finance-xdai'
  }
  return null
}

type FinanceConnectorTheGraphConfig = {
  pollInterval?: number
  subgraphUrl?: string
  verbose?: boolean
}

export default class FinanceConnectorTheGraph implements IFinanceConnector {
  #gql: GraphQLWrapper

  constructor(config: FinanceConnectorTheGraphConfig) {
    if (!config.subgraphUrl) {
      throw new Error(
        'FinanceConnectorTheGraph requires subgraphUrl to be passed.'
      )
    }
    this.#gql = new GraphQLWrapper(config.subgraphUrl, {
      pollInterval: config.pollInterval,
      verbose: config.verbose,
    })
  }

  async disconnect() {
    this.#gql.close()
  }

  async transactionsForApp(
    appAddress: string,
    first: number,
    skip: number
  ): Promise<Transaction[]> {
    return this.#gql.performQueryWithParser(
      queries.ALL_TRANSACTIONS('query'),
      { appAddress, first, skip },
      (result: QueryResult) => parseTransactions(result)
    )
  }

  onTransactionsForApp(
    appAddress: string,
    callback: Function,
    first: number,
    skip: number
  ): SubscriptionHandler {
    return this.#gql.subscribeToQueryWithParser(
      queries.ALL_TRANSACTIONS('subscription'),
      { appAddress, first, skip },
      callback,
      (result: QueryResult) => parseTransactions(result)
    )
  }

  async balanceForToken(
    appAddress: string,
    tokenAddress: string,
    first: number,
    skip: number
  ): Promise<TokenBalance> {
    return this.#gql.performQueryWithParser(
      queries.BALANCE_FOR_TOKEN('query'),
      { appAddress, tokenAddress, first, skip },
      (result: QueryResult) => parseTokenBalance(result)
    )
  }

  onBalanceForToken(
    appAddress: string,
    tokenAddress: string,
    callback: Function,
    first: number,
    skip: number
  ): SubscriptionHandler {
    return this.#gql.subscribeToQueryWithParser(
      queries.BALANCE_FOR_TOKEN('subscription'),
      { appAddress, tokenAddress, first, skip },
      callback,
      (result: QueryResult) => parseTransactions(result)
    )
  }
}
