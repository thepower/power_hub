import axios from 'axios';
import createHash from 'create-hash';
import { config as cfg, chainConfig } from '../config/chain.config';
import { ChainNode } from '../typings';
import { queueNodes, transformResponse } from '../helpers/network.helper';
import { ChainAction } from '../helpers/network.enum';
import Debug from 'debug';
const info = Debug('info');

export class NetworkApi {
  private currentChain: string = '';

  private currentNodes: ChainNode[] = [];

  private nodeIndex: number = 0;

  constructor(chain: number) {
    this.currentChain = chain.toString();
  }

  private setCurrentConfig = async (newNodes: ChainNode[]) => {
    this.currentNodes = await queueNodes(newNodes);
    this.nodeIndex = 0;
    // nodesCache[newChain] = nodes; // TODO: cache for what?
  };

  public async sendTxAndWaitForResponse(tx: any, timeout = 120) {
    // TODO: refactor this shit
    return new Promise((resolve, reject) => {
      this.sendPreparedTX(
        tx,
        (success: boolean, message: string) => success ?
          resolve(message)
          : reject(message), timeout);
    });
  }

  public async getFeeSettings() {
    const settings = await this.askBlockchainTo(ChainAction.GET_NODE_SETTINGS, {});
    return this.calculateFeeSettings(settings);
  }

  public getBlock = async (hash = 'last') => {
    return this.askBlockchainTo(
      ChainAction.GET_BLOCK,
      { chain: this.currentChain, hash })
    ;
  };

  public getWallet = async (address: string) => {
    return this.askBlockchainTo(
      ChainAction.GET_WALLET,
      { chain: this.currentChain, address },
    );
  };

  public loadScCode = async (address: string) => {
    return new Uint8Array(
      await this.askBlockchainTo(
        ChainAction.GET_SC_CODE,
        { chain: this.currentChain, address },
      ),
    );
  };

  public loadScState = async (address: string) => {
    return new Uint8Array(
      await this.askBlockchainTo(
        ChainAction.GET_SC_STATE,
        { chain: this.currentChain, address },
      ),
    );
  };

  private getChain() {
    return this.currentChain;
  }

  // Mock. Info about all chains will store in some system chain, have not implemented yet
  private async getChainInfo() {
    return Promise.resolve(chainConfig);
  }

  public bootstrap = async () => {
    const chainInfo = await this.getChainInfo();

    if (chainInfo[this.currentChain]) {

      const fullNodes = chainInfo[this.currentChain];

      if (!fullNodes.length) {
        throw new Error(`No nodes found for chain ${this.currentChain}`);
      }

      await this.setCurrentConfig(fullNodes);
      info(`Bootstrapped chain ${this.currentChain}`, this.currentNodes);
      return;
    }
    // } else {
    //   //?????????????? ?????????? ?????? ?? ?????????????????? ???????????????????? ?????? ???? ?????????????????? - ?????????? ?????? ??????????
    //   for (const key in defaultBootstrap) {
    //     const bootstrapNodes = await queueNodes(defaultBootstrap[key]);
    //
    //     const unsortedNodes = await this.askBlockchainTo(
    //       ChainAction.GET_CHAIN_NODES,
    //       { remoteChain: this.currentChain },
    //       bootstrapNodes,
    //     );
    //
    //     const tempNodes = await queueNodes(unsortedNodes);
    //
    //     if (tempNodes.length) {
    //       //???????? ????????????, ?????? ??????????
    //       const fullNodes = await this.askBlockchainTo(
    //         ChainAction.GET_CHAIN_NODES,
    //         { remoteChain: this.currentChain },
    //         tempNodes,
    //       );
    //
    //       if (fullNodes.length) {
    //         //??????????
    //         await this.setCurrentConfig(chain, fullNodes);
    //         console.log(`Bootstrapped chain ${chain}  via ${key}`, fullNodes);
    //         return;
    //       } else {
    //         //???? ???????? ???????? ???? ???????????????????? ???? ???????????? ???????????? ??????
    //         console.log(`No nodes found for chain ${chain} via ${key}`)
    //       }
    //     }
    //   }
    // }

    throw new Error(`Unknown chain ${this.currentChain}`);
  };



  private async loadRemoteSCInterface(interfaceData: any[]) {
    const [ hashData, urlData] = interfaceData;
    const [ hashAlg, hashValue ] = hashData.split(':');

    const baseURL = urlData.includes('ipfs') ?
      `https://ipfs.io/ipfs/${urlData.split('://')[1]}` // TODO: what url is it? move to const (config)
      : urlData + `?${+new Date()}`;

    const { data } = await axios.request({ baseURL, responseType: 'arraybuffer' });
    const binaryCode = new Uint8Array(data);
    const actualHash = createHash(hashAlg).update(binaryCode).digest().toString('hex');

    if (actualHash !== hashValue) {
      throw new Error('Hash mismatch');
    }

    return binaryCode;
  }

  public async sendPreparedTX(tx: any, callback: Function, timeout: number = 1000, vm: 'wasm' | 'evm' = 'evm' ) {
    // await this.setChain(chain);
    const response = await this.askBlockchainTo(ChainAction.CREATE_TRANSACTION, { data: { tx } });
    if (callback) {
      setTimeout(() => this.checkTransaction(response.txid, callback, timeout), cfg.callbackCallDelay);
    }
    return response;
  }

  private calculateFeeSettings(settings: any) {
    let result = settings.current;
    let feeCur;

    if (result.fee) {
      result = result.fee;
      if (result.SK) {
        feeCur = 'SK';
      } else if (result.FEE) {
        feeCur = 'FEE';
      } else {
        return {};
      }
    } else {
      return {};
    }

    return {
      feeCur,
      fee: result[feeCur].base,
      baseEx: result[feeCur].baseextra,
      kb: result[feeCur].kb,
    };
  }

  private checkTransaction = async (txId: string, callback: Function, timeout: number, count = 0) => {
    let status;
    let finalCount = count;

    try {
      status = await this.askBlockchainTo(ChainAction.GET_TRANSACTION_STATUS, { txId });
    } catch (e) {
      callback(false, 'Network error');
    }

    if (status) {
      callback(!status.error, `${txId}: ${status.res}`);
    } else if (count < timeout) {
      setTimeout(() => this.checkTransaction(txId, callback, timeout, ++finalCount), cfg.callbackCallDelay);
    } else {
      callback(false, `${txId}: Transaction status lost`);
    }
  };

  private incrementNodeIndex = async () => {
    this.nodeIndex++;
    if (this.nodeIndex >= this.currentNodes.length || this.currentNodes[this.nodeIndex].time === cfg.maxNodeResponseTime) {
      this.currentNodes = await queueNodes(this.currentNodes);
      this.nodeIndex = 0;

      if (this.nodeIndex >= this.currentNodes.length || this.currentNodes[this.nodeIndex].time === cfg.maxNodeResponseTime) {
        throw new Error('Chain unavailable.');
      }
    }
  };

  private httpRequest = async (actionUrl: string, parameters: any) => {
    const totalAttempts = cfg.requestTotalAttempts;
    let success = false;
    let result: any;
    let i = 0;

    if (!this.currentNodes.length) {
      throw new Error('No nodes to query, probably need to call bootstrap()');
    }

    while (!success) {
      i++;
      parameters.baseURL = `${this.currentNodes[this.nodeIndex].address}/api${actionUrl}`;
      try {
        result = await axios.request(parameters);
        success = true;
      } catch (e: any) {
        if (e.response === undefined) {
          // Server did not respond
          if (i < totalAttempts) {
            await this.incrementNodeIndex();
          } else {
            throw new Error('Too many attempts.');
          }
        } else {
          //Server responded with error
          throw new Error(e.response.data.msg);
        }
      }
    }

    return result.data;
  };

  private checkResponseValidity(data: any) {
    if (!(data instanceof ArrayBuffer) && !(data instanceof Buffer)) {
      if (!data.ok) {
        if (data.msg) {
          throw new Error(`(${data.code}) ${data.msg}`);
        } else {
          throw new Error(`Incorrect response (${data.code})`);
        }
      }
    }
  }

  public async getAddressChain(address : string) {
    return this.askBlockchainTo(ChainAction.GET_MY_CHAIN, { address });
  }

  private async askBlockchainTo(kind: ChainAction, parameters: any) {
    let actionUrl;

    let requestParams: any = {
      timeout: cfg.chainRequestTimeout,
      method: 'get',
    };

    switch (kind) {
      case ChainAction.GET_BLOCK:
        actionUrl = '/block';
        requestParams.url = parameters.hash;
        break;

      case ChainAction.GET_WALLET:
        actionUrl = '/address';
        requestParams.url = parameters.address;
        break;

      case ChainAction.CREATE_TRANSACTION:
        actionUrl = '/tx/new';
        requestParams.method = 'post';
        requestParams.data = parameters.data;
        break;

      case ChainAction.GET_TRANSACTION_STATUS:
        actionUrl = '/tx/status';
        requestParams.url = parameters.txId;
        break;

      case ChainAction.GET_MY_CHAIN:
        actionUrl = '/where';
        requestParams.url = parameters.address;
        break;

      case ChainAction.GET_CHAIN_NODES:
        actionUrl = '/nodes';
        requestParams.url = parameters.remoteChain.toString();
        break;

      case ChainAction.GET_NODE_SETTINGS:
        actionUrl = '/settings';
        break;

      case ChainAction.GET_SC_CODE:
        requestParams.responseType = 'arraybuffer';
        requestParams.url = parameters.address + '/code';
        actionUrl = '/address';
        break;

      case ChainAction.GET_SC_STATE:
        requestParams.responseType = 'arraybuffer';
        requestParams.url = parameters.address + '/state';
        actionUrl = '/address';
        break;

      default:
        throw new Error('Unknown action');
    }

    let response = await this.httpRequest(actionUrl, requestParams);
    this.checkResponseValidity(response);

    response = transformResponse(response, kind);

    return response;
  }
}

