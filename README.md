# TON Wheel

## How to use

### Deployment
Go to wheel contract, change constants on top of the file, according to your need, this could break the tests.  
In deployment script, change `deploySeed` to a unique number, change amount transferred via deploy message if needed.  

### Deploy or run another script

`npx blueprint run` 
or with filled `.env`  
`npx blueprint run scriptName --mnemonic` 

### Test

`npx blueprint test` or `yarn blueprint test`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
