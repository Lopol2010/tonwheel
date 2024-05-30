import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { Op } from './constants';

export type WheelConfig = {
    deploySeed: number
};

export function WheelConfigToCell(config: WheelConfig): Cell {
    return beginCell()
        // TODO: put seed here
        .storeUint(0, 64)
        .storeUint(0, 64)
        .storeCoins(0)
        .storeRef(beginCell().storeUint(config.deploySeed, 64).endCell())
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
            // bounce: true,
            sendMode: SendMode.PAY_GAS_SEPARATELY
        })
    }

    async getDeposits(provider: ContractProvider) {
        const { stack } = await provider.get("get_deposits", []);

        let recurse = (slice: any): any => {
            if (slice.remainingRefs == 0) return [];

            return [{
                amount: slice.loadCoins(),
                depositor: slice.loadAddress(), 
            }].concat(recurse(slice.loadRef().beginParse()));
        }

        return { 
            startedAt: stack.readBigNumber(),
            depositsCount: stack.readBigNumber(),
            totalDepositedAmount: stack.readBigNumber(), 
            deposits: recurse(stack.readCell().beginParse()) 
        };
    }

    async getBalance(provider: ContractProvider) {
        return (await provider.getState()).balance
    }
}
