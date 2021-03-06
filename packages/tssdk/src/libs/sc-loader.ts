import { SmartContractWrapper } from './sc-interface';
import * as msgPack from '@thepowereco/msgpack';
import { NetworkApi } from '../libs';

export const instantiateSC = async (address: string, chain: number = 8) => {
  let loadedSC: any = {};
  const network = new NetworkApi(chain);
  await network.bootstrap();
  loadedSC[address] = loadedSC[address] || (await network.loadScCode(address));
  const state = await network.loadScState(address);
  return new SmartContractWrapper(loadedSC[address], state);
};

export const loadScLocal = (code: Uint8Array, state = {}, balance = {}) => (
  new SmartContractWrapper(code, msgPack.encode(state), balance)
);
