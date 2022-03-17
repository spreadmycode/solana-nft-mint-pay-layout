import {
  Connection,
  Keypair,
  Signer,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  ConfirmOptions,
  sendAndConfirmRawTransaction,
  sendAndConfirmTransaction,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  Commitment,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl
} from "@solana/web3.js"
import * as bs58 from 'bs58'
import fs from 'fs'
import * as anchor from '@project-serum/anchor'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,Token,ASSOCIATED_TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { program } from 'commander';
import log from 'loglevel';
import axios  from 'axios'
import { programs } from '@metaplex/js';

program.version('0.0.1');
log.setLevel('info');

// const axios = require('axios');
const { metadata: { Metadata } } = programs
var FormData = require('form-data');
const programId = new PublicKey('6xygZK6rUgtixEFf8CKRzVe2HWxeyWKxGvWBDERYo2Zp')
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
const idl = JSON.parse(fs.readFileSync('src/solana_anchor.json','utf8'))

// const key = 'a498033f45742991a161'
// const secret = '18f6582c5e2a5177785f8d6cdf3e3629f9a6cb57a27977d8725e2aa6ca3ebd7f'

const key = '2433a90cb72e6fe655e9'
const secret = '1cb4f26d23fe54d3598a19ed0c9d3b3667dafb6d4f582c05529597cf0236cc2e'

const CONFIG_DATA_SIZE = 4 + 10 + 32 + 2;
const CONFIG_SIZE = 8 + 32 + 4 + CONFIG_DATA_SIZE
const CONFIG_LINE_SIZE = 4 + 32 + 4 + 200

const confirmOption : ConfirmOptions = {
    commitment : 'finalized',
    preflightCommitment : 'finalized',
    skipPreflight : false
}

const sleep = (ms : number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function loadWalletKey(keypair : any): Keypair {
  if (!keypair || keypair == '') {
    throw new Error('Keypair is required!');
  }
  const loaded = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString())),
  );
  log.info(`wallet public key: ${loaded.publicKey}`);
  return loaded;
}

const getTokenWallet = async (
  wallet: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey
    ) => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
}

const getMetadata = async (mint: PublicKey) => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
}

const createAssociatedTokenAccountInstruction = (
  associatedTokenAddress: PublicKey,
  payer: PublicKey,
  walletAddress: PublicKey,
  splTokenMintAddress: PublicKey
    ) => {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: false, isWritable: false },
    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]),
  });
}

export const pinJSONToIPFS = async(JSONBody : any) : Promise<any> => {
    const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;
    return axios
        .post(url, JSONBody, {
            headers: {
                'pinata_api_key': key,
                'pinata_secret_api_key': secret,
            }
        })
        .then(function (response : any) {
           return {
               success: true,
               pinataUrl: response.data.IpfsHash
           };
        })
        .catch(function (error : any) {
            console.log(error)
            return {
                success: false,
                message: error.message,
            }
        });
};

export const pinFileToIPFS = async(filename : any) => {
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;

    let data = new FormData();
    data.append('file', fs.createReadStream(filename))
    const metadata = JSON.stringify({
        name: 'pic',
        keyvalues: {
            Key: 'Value'
        }
    });
    data.append('pinataMetadata', metadata);

    const pinataOptions = JSON.stringify({
        cidVersion: 0,
        customPinPolicy: {
            regions: [
                {
                    id: 'FRA1',
                    desiredReplicationCount: 1
                },
                {
                    id: 'NYC1',
                    desiredReplicationCount: 2
                }
            ]
        }
    });
    data.append('pinataOptions', pinataOptions);

    return axios
        .post(url, data, {
            maxBodyLength: -1,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
                'pinata_api_key': key,
                'pinata_secret_api_key': secret,
            }
        })
        .then(function (response : any) {
            return {
                success: true,
                pinataUrl: response.data.IpfsHash
            };
        })
        .catch(function (error : any) {
            console.log(error)
            return {
                success: false,
                message: error.message,
            }
        });
};

async function showConfigData(configAccount : PublicKey, conn : Connection){
  try {
    console.log("**    Config   **")
    const wallet = new anchor.Wallet(Keypair.generate())
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    const config = await program.account.config.fetch(configAccount)
    console.log("Authority : ", config.authority.toBase58())
    console.log("Config Line : ", config.maxNumberOfLines)
    console.log("Symbol : ", config.configData.symbol)
    console.log("Creator : ", config.configData.creator.toBase58())
    console.log("Seller Fee : ", config.configData.sellerFee)
  } catch(err) {
    console.log(err)
  }
}

async function showPoolData(poolAccount : PublicKey, conn : Connection){
  try{
    console.log("**   Pool   **")
    const wallet = new anchor.Wallet(Keypair.generate())
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    const pool = await program.account.pool.fetch(poolAccount)
    console.log("Owner : ", pool.owner.toBase58())
    console.log("Config : ", pool.config.toBase58())
    console.log("Minting Count : ", pool.countMinting)
    console.log("Minting Price : ", pool.mintingPrice / LAMPORTS_PER_SOL)
    console.log("Pool wallet1 : ", pool.poolWallet1.toBase58())
    console.log("Pool wallet2 : ", pool.poolWallet2.toBase58())
    console.log("Pool percent1 : ", pool.poolPercent1)
    console.log("Pool percent2 : ", pool.poolPercent2)
    console.log("Update authority : ", pool.updateAuthority.toBase58())
    console.log("")
  }catch(err){
    console.log(err)
  }
}

programCommand('init_config')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-i, --info <path>',
    'Information loacation'
  )
  .action(async (directory,cmd)=>{
    try{
      const {env, keypair, info} = cmd.opts()
      const conn = new Connection(clusterApiUrl(env))
      const owner = loadWalletKey(keypair)
      const infoJson = JSON.parse(fs.readFileSync(info).toString())
      const wallet = new anchor.Wallet(owner)
      const provider = new anchor.Provider(conn,wallet,confirmOption)
      const program = new anchor.Program(idl,programId,provider)
      let transaction = new Transaction()
      let space = CONFIG_SIZE + 4 + CONFIG_LINE_SIZE * infoJson.maxNumberOfLines
      let lamports = await conn.getMinimumBalanceForRentExemption(space)
      let configKeypair = Keypair.generate()
      transaction.add(SystemProgram.createAccount({
        fromPubkey : owner.publicKey,
        lamports : lamports,
        newAccountPubkey : configKeypair.publicKey,
        programId : programId,
        space : space
      }))
      transaction.add(program.instruction.initConfig(
          new anchor.BN(infoJson.maxNumberOfLines),
          {
            symbol : infoJson.symbol,
            creator : new PublicKey(infoJson.creator),
            sellerFee : infoJson.sellerFee
          },
          {
            accounts : {
              authority : owner.publicKey,
              config : configKeypair.publicKey,
            }
          }
        )
      )
      const tx = await sendAndConfirmTransaction(conn, transaction, [owner, configKeypair], confirmOption)
      console.log("config address : ", configKeypair.publicKey.toBase58())
      console.log("transaction : ",tx)
      await showConfigData(configKeypair.publicKey, conn)
    }catch(err){
      console.log(err)
    }
  })

programCommand('update_config')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-i, --info <path>',
    'Information loacation'
  )
  .requiredOption(
    '-c, --config <string>',
    'config account'
  )
  .action(async (directory,cmd)=>{
    try{
      const {env, keypair, info, config} = cmd.opts()
      const conn = new Connection(clusterApiUrl(env))
      const owner = loadWalletKey(keypair)
      const infoJson = JSON.parse(fs.readFileSync(info).toString())
      const configPublicKey = new PublicKey(config)
      const wallet = new anchor.Wallet(owner)
      const provider = new anchor.Provider(conn,wallet,confirmOption)
      const program = new anchor.Program(idl,programId,provider)
      let transaction = new Transaction()
      transaction.add(program.instruction.updateConfig({
          symbol : infoJson.symbol,
          creator : new PublicKey(infoJson.creator),
          sellerFee : infoJson.sellerFee
        },{
        accounts : {
          authority : owner.publicKey,
          config : configPublicKey
        }
        }
      ))
      const tx = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
      console.log("transaction : ",tx)
      await showConfigData(configPublicKey, conn)
    }catch(err){
      console.log(err)
    }
  })  

programCommand("get_config")
  .requiredOption(
    '-c, --config <string>',
    'config account'
  )
  .action(async (directory,cmd)=>{
    const {env, config} = cmd.opts()
    const conn = new Connection(clusterApiUrl(env))
    const configAccount = new PublicKey(config)
    await showConfigData(configAccount, conn)
  })

programCommand('add_config_lines')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-u, --url-asset <string>',
    'Information loacation'
  )
  .requiredOption(
    '-c, --config <string>',
    'Config account'
  )
  .option(
    '-fn, --from-number <number>',
    'art from_number'
  )
  .option(
    '-tn, --to-number <number>',
    'art to_number'
  )
  .action(async (directory,cmd)=>{
    try{
      const {env, keypair, urlAsset, config, fromNumber, toNumber} = cmd.opts()
      const conn = new Connection(clusterApiUrl(env))
      const owner = loadWalletKey(keypair)
      const configPublicKey = new PublicKey(config)
      const wallet = new anchor.Wallet(owner)
      const provider = new anchor.Provider(conn,wallet,confirmOption)
      const program = new anchor.Program(idl,programId,provider)

      for(let i=fromNumber; i<toNumber; i++){
        let imageUrl = urlAsset + '/' + i.toString() + '.png'
        let jsonUrl = urlAsset + "/" + i + ".json"
        let imageRes : any = await pinFileToIPFS(imageUrl)
        if(imageRes.success && imageRes.pinataUrl){
          let metadata = JSON.parse(fs.readFileSync(jsonUrl).toString())
          metadata.image = "https://ipfs.io/ipfs/"+imageRes.pinataUrl 
          let jsonRes = await pinJSONToIPFS(metadata)
          if(jsonRes.success && jsonRes.pinataUrl){
            let transaction = new Transaction()
            transaction.add(program.instruction.addConfigLines(
              [{
                name : metadata.name, uri : "https://ipfs.io/ipfs/"+jsonRes.pinataUrl
              }],{
              accounts:{
                authority : owner.publicKey,
                config : configPublicKey,
              }
            }))
            const tx = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
            await sleep(20000)
            console.log(" NUM ",i," Success : ", tx)
          }else{
            console.log(" NUM ",i," Failed in Json uploading")
            break
          }
        }else{
          console.log(" NUM ",i," Failed in Image uploading")
          break;
        }
      }

    }catch(err){
      console.log(err)
    }
  })

programCommand('update_config_lines')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-u, --url-asset <string>',
    'Information loacation'
  )
  .requiredOption(
    '-c, --config <string>',
    'Config account'
  )
  .option(
    '-fn, --from-number <number>',
    'art from_number'
  )
  .option(
    '-tn, --to-number <number>',
    'art to_number'
  )
  .action(async (directory,cmd)=>{
    try{
      const {env, keypair, urlAsset, config, fromNumber, toNumber} = cmd.opts()
      const conn = new Connection(clusterApiUrl(env))
      const owner = loadWalletKey(keypair)
      const configPublicKey = new PublicKey(config)
      const wallet = new anchor.Wallet(owner)
      const provider = new anchor.Provider(conn,wallet,confirmOption)
      const program = new anchor.Program(idl,programId,provider)

      for(let i=fromNumber; i<toNumber; i++){
        let imageUrl = urlAsset + '/' + i.toString() + '.png'
        let jsonUrl = urlAsset + "/" + i + ".json"
        let imageRes : any = await pinFileToIPFS(imageUrl)
        if(imageRes.success && imageRes.pinataUrl){
          let metadata = JSON.parse(fs.readFileSync(jsonUrl).toString())
          metadata.image = "https://ipfs.io/ipfs/"+imageRes.pinataUrl 
          let jsonRes = await pinJSONToIPFS(metadata)
          if(jsonRes.success && jsonRes.pinataUrl){
            let transaction = new Transaction()
            transaction.add(program.instruction.updateConfigLine(
              new anchor.BN(i),
              {
                name : metadata.name, uri : "https://ipfs.io/ipfs/"+jsonRes.pinataUrl
              },{
              accounts:{
                authority : owner.publicKey,
                config : configPublicKey,
              }
            }))
            const tx = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
            await sleep(20000)
            console.log(" NUM ",i," Success : ", tx)
          }else{
            console.log(" NUM ",i," Failed in Json uploading")
            break
          }
        }else{
          console.log(" NUM ",i," Failed in Image uploading")
          break;
        }
      }

    }catch(err){
      console.log(err)
    }
  })  

programCommand('init_pool')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-c, --config <string>',
    'Config account'
  )
  .requiredOption(
    '-i, --info <path>',
    'Information loacation'
  )
  .action(async (directory,cmd)=>{
    try{
      const {env, keypair, config, info} = cmd.opts()
      const conn = new Connection(clusterApiUrl(env))
      const owner = loadWalletKey(keypair)
      const configPublicKey = new PublicKey(config)
      const infoJson = JSON.parse(fs.readFileSync(info).toString())
      const wallet = new anchor.Wallet(owner)
      const provider = new anchor.Provider(conn,wallet,confirmOption)
      const program = new anchor.Program(idl,programId,provider)
      const rand = Keypair.generate().publicKey;
      const [pool, bump] = await PublicKey.findProgramAddress([rand.toBuffer()],programId)
      let transaction = new Transaction()
      transaction.add(program.instruction.initPool(
        new anchor.BN(bump),
        new PublicKey(infoJson.updateAuthority),
        new PublicKey(infoJson.poolWallet1),
        new PublicKey(infoJson.poolWallet2),
        new anchor.BN(infoJson.percent1),
        new anchor.BN(infoJson.percent2),
        new anchor.BN(infoJson.mintingPrice * LAMPORTS_PER_SOL),
        {
          accounts:{
            owner : owner.publicKey,
            pool : pool,
            rand : rand,
            config : configPublicKey,
            systemProgram : SystemProgram.programId,
          }
        }
      ))
      const tx = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
      console.log("pool address : ", pool.toBase58())
      console.log("transaction : ",tx)
      await showPoolData(pool, conn)
    }catch(err){
      console.log(err)
    }
  })

programCommand('update_pool')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-i, --info <path>',
    'Information loacation'
  )
  .requiredOption(
    '-p, --pool <string>',
    'pool account'
  )
  .action(async (directory,cmd)=>{
    try{
      const {env, keypair, pool, info} = cmd.opts()
      const conn = new Connection(clusterApiUrl(env))
      const owner = loadWalletKey(keypair)
      const poolPublicKey = new PublicKey(pool)
      const infoJson = JSON.parse(fs.readFileSync(info).toString())
      const wallet = new anchor.Wallet(owner)
      const provider = new anchor.Provider(conn,wallet,confirmOption)
      const program = new anchor.Program(idl,programId,provider)
      let transaction = new Transaction()
      transaction.add(program.instruction.updatePool(
          new PublicKey(infoJson.updateAuthority),
          new PublicKey(infoJson.poolWallet1),
          new PublicKey(infoJson.poolWallet2),
          new anchor.BN(infoJson.percent1),
          new anchor.BN(infoJson.percent2),
          new anchor.BN(infoJson.mintingPrice * LAMPORTS_PER_SOL),
          {
            accounts:{
              owner : owner.publicKey,
              pool : poolPublicKey,
            }
          }
        )
      )
      const tx = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
      console.log("transaction : ",tx)
      await showPoolData(poolPublicKey, conn)
    } catch(err) {
      console.log(err)
    }
  })


programCommand("get_pool")
  .requiredOption(
    '-p, --pool <string>',
    'pool account'
  )
  .action(async (directory,cmd)=>{
    const {env, pool} = cmd.opts()
    const conn = new Connection(clusterApiUrl(env))
    const poolAccount = new PublicKey(pool)
    await showPoolData(poolAccount, conn)
  })

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'mainnet-beta',
    )
    .option('-l, --log-level <string>', 'log level', setLogLevel);
}

function setLogLevel(value : any, prev : any) {
  if (value === undefined || value === null) {
    return;
  }
  console.log('setting the log value to: ' + value);
  log.setLevel(value);
}

program.parse(process.argv)