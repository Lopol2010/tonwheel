require("dotenv").config()
import {cleanEnv, str} from "envalid";

const env = cleanEnv(process.env, {
    WALLET_MNEMONIC: str(),
    WALLET_VERSION: str(),
});
export default env;