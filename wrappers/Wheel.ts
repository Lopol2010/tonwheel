import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { Consts, Op } from './constants';

export type WheelConfig = {
    deploySeed: number,
    comissionPercent: number,
    comissionAddress: Address,
};

export function WheelConfigToCell(config: WheelConfig): Cell {
    return beginCell()
        .storeUint(0, 32)
        .storeUint(0, 16)
        .storeCoins(0)
        .storeUint(config.comissionPercent, 16)
        .storeAddress(config.comissionAddress)
        .storeRef(beginCell().storeUint(config.deploySeed, 32).endCell())
        .endCell();
}

export class Wheel implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new Wheel(address);
    }

    static createFromConfig(config: WheelConfig, code: Cell, workchain = 0) {
        const data = WheelConfigToCell(config);
        const init = { code, data };
        return new Wheel(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            body: beginCell().endCell(),
        });
    }

    async sendSetComissionCfg(provider: ContractProvider, via: Sender, new_comission_percent: number, new_comission_address: Address) {

        if(new_comission_percent < 0 || new_comission_percent > Consts.max_basis_points) {
            throw new Error("Wrong comission percent");
        }

        const messageBody = beginCell()
            .storeUint(Op.set_comission_cfg, 32)
            .storeUint(new_comission_percent, 16)
            .storeAddress(new_comission_address)
            .endCell();

        await provider.internal(via, {
            value: toNano("0.01"), // TODO: provide more precise gas or introduce 'return excesses' mechanism in contract
            body: messageBody,
            sendMode: SendMode.PAY_GAS_SEPARATELY
        })
    }
    async sendTryEndRound(provider: ContractProvider, via: Sender) {

        const messageBody = beginCell()
            .storeUint(Op.try_end_round, 32)
            .endCell();

        await provider.internal(via, {
            value: toNano("0.01"),
            body: messageBody,
            sendMode: SendMode.PAY_GAS_SEPARATELY
        })
    }
    async sendDeposit(provider: ContractProvider, via: Sender, value: bigint | string, deposit_owner: Address | undefined = via.address) {

        if(!deposit_owner) {
            throw Error("deposit owner address is missing!");
        }

        const messageBody = beginCell()
            .storeUint(Op.deposit, 32)
            .storeAddress(deposit_owner)
            .endCell();

        await provider.internal(via, {
            value: typeof value === "string" ? toNano(value) : value,
            body: messageBody,
            sendMode: SendMode.PAY_GAS_SEPARATELY
        })
    }

    async getStorageData(provider: ContractProvider) {
        const { stack } = await provider.get("get_storage_data", []);

        // recursive transform 'deposits' into more readable array
        let convertDepositsToArray = (slice: any): any => {
            if (slice.remainingRefs == 0) return [];

            return [{
                amount: slice.loadCoins(),
                depositor: slice.loadAddress(), 
            }].concat(convertDepositsToArray(slice.loadRef().beginParse()));
        }

        return { 
            startedAt: stack.readNumber(),
            depositsCount: stack.readNumber(),
            totalDepositedAmount: stack.readBigNumber(), 
            comissionPercent: stack.readNumber(), 
            comissionAddress: stack.readAddress(),
            deposits: convertDepositsToArray(stack.readCell().beginParse()) 
        };
    }

    async getBalance(provider: ContractProvider) {
        return (await provider.getState()).balance
    }
}
