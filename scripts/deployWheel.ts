import { toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import env from "./env";
import { Wheel } from '../wrappers/Wheel';

export async function run(provider: NetworkProvider) {
    const wheel = provider.open(Wheel.createFromConfig({ deploySeed: 3 }, await compile('Wheel')));

    if(await provider.isContractDeployed(wheel.address)) {
        throw Error("contract is already deployed!");
    }

    await wheel.sendDeploy(provider.sender(), toNano('0.01'));

    console.log("waiting for deploy at: ", wheel.address);
    await provider.waitForDeploy(wheel.address, 10, 2000);

    // run methods on `wheel`
}
