# TON Wheel

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Deployment
In deployment script, change `deploySeed` to a unique number, otherwise you'll send deploy to the same address which is error.

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` 
or with filled `.env`  
`npx blueprint run scriptName --mnemonic` 


### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
