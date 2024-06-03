import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, fromNano, toNano } from '@ton/core';
import { Wheel } from '../wrappers/Wheel';
import '@ton/test-utils';
import { compile, tonDeepLink } from '@ton/blueprint';
import { Consts, Errors } from '../wrappers/constants';
import { randomBytes } from 'crypto';

describe('Wheel', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Wheel');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let comissionAccount: SandboxContract<TreasuryContract>;
    let beneficiaryAccount: SandboxContract<TreasuryContract>;
    let wheel: SandboxContract<Wheel>;
    let now: number;
    let players: SandboxContract<TreasuryContract>[];
    let startBalance = toNano("0.02");
    let maxDeposits = 20;
    let maxRoundDuration = 60;
    let comissionPercent = 0;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        // blockchain.verbosity = {
        //     print: true,
        //     blockchainLogs: false,
        //     vmLogs: "vm_logs",
        //     debugLogs: true
        // }

        comissionAccount = await blockchain.treasury('comissionAccount', { balance: 0n });
        wheel = blockchain.openContract(Wheel.createFromConfig({ deploySeed: 0, comissionAddress: comissionAccount.address, comissionPercent }, code));

        deployer = await blockchain.treasury('deployer');
        beneficiaryAccount = await blockchain.treasury('depositOwner', { balance: 0n });
        players = new Array(maxDeposits);
        for (let i = 0; i < maxDeposits; i++) {
            players[i] = await blockchain.treasury("player" + i, { balance: 0n });
        }

        const deployResult = await wheel.sendDeploy(deployer.getSender(), startBalance);

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: wheel.address,
            deploy: true,
            success: true,
        });

        now = Math.floor(Date.now() / 1000);
        blockchain.now = now;
    });

    it('should have empty storage before round begins', async () => {
        let { startedAt, depositsCount, totalDepositedAmount, comissionAddress, comissionPercent, deposits } = await wheel.getStorageData();

        expect(startedAt).toBe(0);
        expect(depositsCount).toBe(0);
        expect(totalDepositedAmount).toBe(0n);
        expect(comissionAddress.toString()).toBe(comissionAccount.address.toString());
        expect(comissionPercent).toBe(0);

        expect(deposits.length).toBe(0);
    });

    it('should set correct storage on deposit', async () => {

        let txs = await wheel.sendDeposit(deployer.getSender(), "10");
        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getStorageData();

        expect(await wheel.getBalance()).toBeGreaterThan(startBalance);

        expect(startedAt).toBe(now);
        expect(depositsCount).toBe(1);
        expect(totalDepositedAmount).toBe(toNano("10"));

        expect(deposits.length).toBe(1);
        expect(deposits[0].amount).toBe(toNano("10"));
        expect(deposits[0].depositor).toEqualAddress(deployer.address);
    });

    it('should throw when deposit too small amount', async () => {
        let txs = await wheel.sendDeposit(deployer.getSender(), "0.009");

        expect(txs.transactions).toHaveTransaction({
            from: deployer.address,
            to: wheel.address,
            aborted: true,
            exitCode: Errors.msg_value_too_small
        })
    });

    it('should set correct comission cfg', async () => {

        let new_comission_percent = 1000;
        let new_comission_address = comissionAccount.address;
        await wheel.sendSetComissionCfg(deployer.getSender(), new_comission_percent, new_comission_address);

        let { comissionAddress, comissionPercent } = await wheel.getStorageData();

        expect(comissionAddress.toString()).toBe(new_comission_address.toString());
        expect(comissionPercent).toBe(new_comission_percent);
    });


    it('should deduct comission from prize', async () => {

        let new_comission_percent = 1000;
        let new_comission_address = comissionAccount.address;
        await wheel.sendSetComissionCfg(deployer.getSender(), new_comission_percent, new_comission_address);

        await wheel.sendDeposit(deployer.getSender(), "1", beneficiaryAccount.address);
        blockchain.now = now + 61;
        let txs = await wheel.sendDeposit(deployer.getSender(), "1", beneficiaryAccount.address);

        let approximateTotalDeposited = toNano("2");
        let approximateComission = approximateTotalDeposited * BigInt(new_comission_percent) / BigInt(Consts.max_basis_points);
        let approximatePrize = approximateTotalDeposited - approximateComission;

        expect(approximatePrize - await beneficiaryAccount.getBalance()).toBeLessThanOrEqual(toNano("0.01"));
        expect(approximateComission - await comissionAccount.getBalance()).toBeLessThanOrEqual(toNano("0.01"));
        expect(await wheel.getBalance()).toBe(startBalance);

        let { startedAt, depositsCount, totalDepositedAmount, comissionAddress, comissionPercent, deposits } = await wheel.getStorageData();

        expect(comissionAddress.toString()).toBe(new_comission_address.toString());
        expect(comissionPercent).toBe(new_comission_percent);
        expect(startedAt).toBe(0);
        expect(depositsCount).toBe(0);
        expect(totalDepositedAmount).toBe(0n);


        expect(deposits.length).toBe(0);
    });

    it('should choose winner after round duration end', async () => {

        await wheel.sendDeposit(deployer.getSender(), "1", beneficiaryAccount.address);
        blockchain.now = now + 61;
        let txs = await wheel.sendDeposit(deployer.getSender(), "1", beneficiaryAccount.address);

        expect(await beneficiaryAccount.getBalance()).toBeGreaterThan(0);
        expect(await wheel.getBalance()).toBe(startBalance);

        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getStorageData();

        expect(startedAt).toBe(0);
        expect(depositsCount).toBe(0);
        expect(totalDepositedAmount).toBe(0n);

        expect(deposits.length).toBe(0);
    });

    it('should choose winner after max deposits reached', async () => {

        // trigger round_end with winner selection
        for (let i = 0; i < players.length; i++) {
            await wheel.sendDeposit(deployer.getSender(), "1.0", players[i].address);
        }

        expect(await wheel.getBalance()).toBe(startBalance);

        // get winner's balance
        let balances = await Promise.all(players.map(p => (p.getBalance())));
        balances = balances.filter(b => b > 0);

        // winner should get whole pool's TONs minus fees
        expect(toNano("1.0") * BigInt(maxDeposits) - balances[0]).toBeLessThan(toNano("10"));

        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getStorageData();

        expect(startedAt).toBe(0);
        expect(depositsCount).toBe(0);
        expect(totalDepositedAmount).toBe(0n);

        expect(deposits.length).toBe(0);
    });

    it('should choose winner from round end message', async () => {

        await wheel.sendDeposit(deployer.getSender(), "1", beneficiaryAccount.address);
        blockchain.now = now + 61;
        // let txs = await wheel.sendDeposit(deployer.getSender(), "1", beneficiaryAccount.address);
        let txs = await wheel.sendTryEndRound(deployer.getSender());

        expect(await beneficiaryAccount.getBalance()).toBeGreaterThan(0);
        expect(await wheel.getBalance()).toBe(startBalance);
        expect(startBalance - await wheel.getBalance()).toBeLessThanOrEqual(toNano("0.001"));

        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getStorageData();

        expect(startedAt).toBe(0);
        expect(depositsCount).toBe(0);
        expect(totalDepositedAmount).toBe(0n);

        expect(deposits.length).toBe(0);
    });


    async function setRandomSeed() {

        const res = await blockchain.runGetMethod(wheel.address,
            'get_deposits',
            [],
            { randomSeed: randomBytes(32) } // randomSeed can be specified only if calling blockchain.runGetMethod or similar...
        );
        let wheel2 = blockchain.openContract(Wheel.createFromConfig({ deploySeed: 999, comissionAddress: comissionAccount.address, comissionPercent }, code));
        const deployResult = await wheel2.sendDeploy(deployer.getSender(), startBalance);

    }
});
