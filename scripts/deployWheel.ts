import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import env from "./env";
import { Wheel } from '../wrappers/Wheel';

export async function run(provider: NetworkProvider) {
    // TODO: implement auto-seed generation: check each seed and see if address unitialized - then deploy
    const cfg = { 
        deploySeed: 0,
        comissionAddress: Address.parse("0QC_pxTeZV0YIxOhOWRyJpuni-ab-68Akldrl6pvhZ3Bcr72"),
        comissionPercent: 0
    };
    const wheel = provider.open(Wheel.createFromConfig(cfg, await compile('Wheel')));

    if(await provider.isContractDeployed(wheel.address)) {
        throw Error("contract is already deployed!");
    }

    await wheel.sendDeploy(provider.sender(), toNano("0.01"));

    console.log("waiting for deploy at: ", wheel.address);
    await provider.waitForDeploy(wheel.address, 10, 2000);

    // run methods on `wheel`
}
