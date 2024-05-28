import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, fromNano, toNano } from '@ton/core';
import { Wheel } from '../wrappers/Wheel';
import '@ton/test-utils';
import { compile, tonDeepLink } from '@ton/blueprint';
import { Errors } from '../wrappers/constants';
import { randomBytes } from 'crypto';

describe('Wheel', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Wheel');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let depositOwnerZeroBalance: SandboxContract<TreasuryContract>;
    let wheel: SandboxContract<Wheel>;
    let now: number;
    let players: SandboxContract<TreasuryContract>[];

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        // blockchain.verbosity = {
        //     print: true,
        //     blockchainLogs: false,
        //     vmLogs: "vm_logs",
        //     debugLogs: true
        // }

        wheel = blockchain.openContract(Wheel.createFromConfig({ deploySeed: 0 }, code));

        deployer = await blockchain.treasury('deployer');
        depositOwnerZeroBalance = await blockchain.treasury('depositOwner', { balance: 0n });
        players = new Array(30);
        for (let i = 0; i < 30; i++) {
            players[i] = await blockchain.treasury("player" + i, { balance: 0n });
        }

        const deployResult = await wheel.sendDeploy(deployer.getSender());

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
        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getDeposits();

        expect(startedAt).toBe(0n);
        expect(depositsCount).toBe(0n);
        expect(totalDepositedAmount).toBe(0n);

        expect(deposits.length).toBe(0);
    });

    it('should set correct storage on deposit', async () => {

        expect(toNano("0.02") - await wheel.getBalance()).toBeLessThanOrEqual(toNano("0.001"));

        let txs = await wheel.sendDeposit(deployer.getSender(), "0.1");
        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getDeposits();

        expect(await wheel.getBalance()).toBeGreaterThan(toNano("0.02"));

        expect(startedAt).toBe(BigInt(now));
        expect(depositsCount).toBe(1n);
        expect(totalDepositedAmount).toBe(toNano("0.1"));

        expect(deposits.length).toBe(1);
        expect(deposits[0].amount).toBe(toNano("0.1"));
        expect(deposits[0].depositor).toEqualAddress(deployer.address);
    });

    it('should throw when deposit too small amount', async () => {

        let txs = await wheel.sendDeposit(deployer.getSender(), "0.01");

        expect(txs.transactions).toHaveTransaction({
            from: deployer.address,
            to: wheel.address,
            aborted: true,
            exitCode: Errors.msg_value_too_small
        })
    });

    it('should choose random winner after round duration end', async () => {

        expect(await depositOwnerZeroBalance.getBalance()).toBe(0n);

        await wheel.sendDeposit(deployer.getSender(), "0.03", depositOwnerZeroBalance.address);
        blockchain.now = now + 61;
        let txs = await wheel.sendDeposit(deployer.getSender(), "0.03", depositOwnerZeroBalance.address);

        expect(await depositOwnerZeroBalance.getBalance()).toBeGreaterThan(0n);
        expect(await wheel.getBalance()).toBe(toNano("0.02"));
        expect(toNano("0.02") - await wheel.getBalance()).toBeLessThanOrEqual(toNano("0.001"));

        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getDeposits();

        expect(startedAt).toBe(0n);
        expect(depositsCount).toBe(0n);
        expect(totalDepositedAmount).toBe(0n);

        expect(deposits.length).toBe(0);
    });

    it('should choose random winner after max deposits reached', async () => {

        expect(await depositOwnerZeroBalance.getBalance()).toBe(0n);

        for (let i = 0; i < players.length; i++) {
            await wheel.sendDeposit(deployer.getSender(), "1.0", players[i].address);
        }

        expect(await wheel.getBalance()).toBe(toNano("0.02"));

        let balances = await Promise.all(players.map(p => (p.getBalance())));
        balances = balances.filter(b => b > 0n);

        // winner should get 30 TON minus fees
        expect(toNano("30") - balances[0]).toBeLessThan(toNano("0.2"));

        let { startedAt, depositsCount, totalDepositedAmount, deposits } = await wheel.getDeposits();

        expect(startedAt).toBe(0n);
        expect(depositsCount).toBe(0n);
        expect(totalDepositedAmount).toBe(0n);

        expect(deposits.length).toBe(0);
    });

    // TODO: test with random, here is helper function
    async function setRandomSeed() {

        const res = await blockchain.runGetMethod(wheel.address,
            'get_deposits',
            [],
            { randomSeed: randomBytes(32) } // randomSeed can be specified only if calling blockchain.runGetMethod or similar...
        );
        let wheel2 = blockchain.openContract(Wheel.createFromConfig({ deploySeed: 999 }, code));
        const deployResult = await wheel2.sendDeploy(deployer.getSender());

    }
});
