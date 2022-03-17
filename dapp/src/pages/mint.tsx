import { Fragment, useRef, useState, useEffect } from 'react';
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ConfirmOptions,
  LAMPORTS_PER_SOL,
  SystemProgram,
  clusterApiUrl,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY
} from '@solana/web3.js'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,Token} from "@solana/spl-token";
import useNotify from './notify'
import * as bs58 from 'bs58'
import * as anchor from "@project-serum/anchor";
import { programs } from '@metaplex/js';
import axios from "axios"
import {WalletConnect, WalletDisconnect} from '../wallet'
import { Container, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { CircularProgress, Card, CardMedia, Grid, CardContent, Typography, BottomNavigation,
				Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper  } from '@mui/material'
import {createMint,createAssociatedTokenAccountInstruction,sendTransactionWithRetry} from './utility'

let wallet : any
let conn = new Connection(clusterApiUrl('devnet'))
let notify: any

const { metadata: { Metadata } } = programs
const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
const programId = new PublicKey('Ah2FHrgj7yNxvriY8CCXq7KYnKAHUHwHCzre2LzNTxzc')
const POOL = new PublicKey('5x8sonhCihHBKqT5p3mP2wJeXVTtYzLNLLMtvn613L4C')
const SYMBOL = "SPORE"
const idl = require('./solana_anchor.json')
const confirmOption : ConfirmOptions = {commitment : 'finalized',preflightCommitment : 'finalized',skipPreflight : false}

interface Schedule{
	time : string;
	amount : string;
}

let defaultSchedule = {
	time : '', amount : ''
}

interface AlertState {
  open: boolean;
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error' | undefined;
}

export default function Mint(){
	wallet = useWallet()
	notify = useNotify()

	const [pool, setPool] = useState<PublicKey>(POOL)
	const [alertState, setAlertState] = useState<AlertState>({open: false,message: '',severity: undefined})
  const [isProcessing, setIsProcessing] = useState(false)
  const [holdingNfts, setHoldingNfts] = useState<any[]>([])
	const [poolData, setPoolData] = useState<any>(null)

	useEffect(()=>{
		getPoolData()
	},[pool])

	useEffect(()=>{
		if(poolData != null && wallet.publicKey != null){
			getNftsForOwner(wallet.publicKey, SYMBOL)
		}
	},[wallet.publicKey,poolData])

	const getTokenWallet = async (owner: PublicKey,mint: PublicKey) => {
	  return (
	    await PublicKey.findProgramAddress(
	      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
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
	const getEdition = async (mint: PublicKey) => {
	  return (
	    await anchor.web3.PublicKey.findProgramAddress(
	      [
	        Buffer.from("metadata"),
	        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
	        mint.toBuffer(),
	        Buffer.from("edition")
	      ],
	      TOKEN_METADATA_PROGRAM_ID
	    )
	  )[0];
	}
	const getPoolData = async() => {
		try{
			const poolAddress = new PublicKey(pool)
			const randWallet = new anchor.Wallet(Keypair.generate())
    	const provider = new anchor.Provider(conn,randWallet,confirmOption)
    	const program = new anchor.Program(idl,programId,provider)
    	const pD = await program.account.pool.fetch(poolAddress)
    	setPoolData(pD)
		} catch(err){
			console.log(err)
			setPoolData(null)
		}
	}	
	async function getNftsForOwner(
	  owner : PublicKey,
	  symbol : string
	  ){
	  let allTokens: any[] = []
	  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(owner, {programId: TOKEN_PROGRAM_ID},"finalized");
  	const randWallet = new anchor.Wallet(Keypair.generate())
  	const provider = new anchor.Provider(conn,randWallet,confirmOption)
  	const program = new anchor.Program(idl,programId,provider)

	  for (let index = 0; index < tokenAccounts.value.length; index++) {
	    try{
	      const tokenAccount = tokenAccounts.value[index];
	      const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;

	      if (tokenAmount.amount == "1" && tokenAmount.decimals == "0") {
	        let nftMint = new PublicKey(tokenAccount.account.data.parsed.info.mint)
	        let pda = await getMetadata(nftMint)
	        const accountInfo: any = await conn.getParsedAccountInfo(pda);
	        let metadata : any = new Metadata(owner.toString(), accountInfo.value)
	        if (metadata.data.data.symbol == symbol) {
	        	let [metadataExtended, bump] = await PublicKey.findProgramAddress([nftMint.toBuffer(), pool.toBuffer()],programId)
	          if((await conn.getAccountInfo(metadataExtended)) == null) continue;
	          let extendedData = await program.account.metadataExtended.fetch(metadataExtended)
	          let [parentMetadataExtended, bump2] = await PublicKey.findProgramAddress([extendedData.parent.toBuffer(), pool.toBuffer()],programId)
	          let parentExtendedData = await program.account.metadataExtended.fetch(parentMetadataExtended)
	          
	          const { data }: any = await axios.get(metadata.data.data.uri)
	        	const entireData = { ...data, id: Number(data.name.replace( /^\D+/g, '').split(' - ')[0])}

	          allTokens.push({
	          	mint : nftMint, metadata : pda, tokenAccount :  tokenAccount.pubkey,
	          	metadataExtended : metadataExtended, extendedData : extendedData,
	          	data : metadata.data.data, offChainData : entireData, parentId : parentExtendedData.number})
	        }
	      }
	    } catch(err) {
	      continue;
	    }
	  }
	  allTokens.sort(function(a:any, b: any){
	  	if(a.extendedData.number < b.extendedData.number) {return -1;}
	  	if(a.extendedData.number > b.extendedData.number) {return 1;}
	  	return 0;
	  })
	  console.log(allTokens)
	  setHoldingNfts(allTokens)
	  return allTokens
	}

	const mint = async() =>{
		try{
			const provider = new anchor.Provider(conn, wallet as any, confirmOption)
			const program = new anchor.Program(idl,programId,provider)
			const poolData = await program.account.pool.fetch(pool)
			const configData = await program.account.config.fetch(poolData.config)

			let transaction = new Transaction()
			let instructions : TransactionInstruction[] = []
			let signers : Keypair[] = []
			const mintRent = await conn.getMinimumBalanceForRentExemption(MintLayout.span)
			const mintKey = createMint(instructions, wallet.publicKey,mintRent,0,wallet.publicKey,wallet.publicKey,signers)
			const recipientKey = await getTokenWallet(wallet.publicKey, mintKey)
			createAssociatedTokenAccountInstruction(instructions,recipientKey,wallet.publicKey,wallet.publicKey,mintKey)
			instructions.push(Token.createMintToInstruction(TOKEN_PROGRAM_ID,mintKey,recipientKey,wallet.publicKey,[],1))
			instructions.forEach(item=>transaction.add(item))
			// await sendTransaction(transaction,signers)
			// console.log("Mint creating success!")
			// notify('success', 'Success Mint Creating')
			const metadata = await getMetadata(mintKey)
			const masterEdition = await getEdition(mintKey)
			const [metadataExtended, bump] = await PublicKey.findProgramAddress([mintKey.toBuffer(),pool.toBuffer()], programId)
			// let tx = new Transaction()
			if(poolData.countMinting == 0){
				transaction.add(program.instruction.mintRoot(new anchor.BN(bump),{
					accounts : {
						owner : wallet.publicKey,
						pool : pool,
						config : poolData.config,
						nftMint : mintKey,
						nftAccount : recipientKey,
						metadata : metadata,
						masterEdition : masterEdition,
						metadataExtended : metadataExtended,
						poolWallet : poolData.poolWallet,
						tokenProgram : TOKEN_PROGRAM_ID,
						tokenMetadataProgram : TOKEN_METADATA_PROGRAM_ID,
						systemProgram : SystemProgram.programId,
						rent : SYSVAR_RENT_PUBKEY,
					}
				}))
			}else{
				let nfts = await getNftsForOwner(wallet.publicKey, SYMBOL)
				if(nfts.length==0) throw new Error("You do not have any parent NFT")
				let oldestNft = nfts[0]
				// const parentNftAccount = await getTokenWallet(wallet.publicKey, oldestNft.extendedData.parent)
				const resp = await conn.getTokenLargestAccounts(oldestNft.extendedData.parent, 'finalized')
				if(resp==null || resp.value==null || resp.value.length==0) throw new Error("Invalid parent")
				const parentNftAccount = resp.value[0].address
				const info = await conn.getAccountInfo(parentNftAccount, 'finalized')
				if(info == null) throw new Error('Parent NFT info failed');
				const accountInfo = AccountLayout.decode(info.data)
				if(Number(accountInfo.amount)==0) throw new Error("Invalid Parent info")
				const parentNftOwner = new PublicKey(accountInfo.owner)

				const creatorMint = poolData.rootSpore
				const resp2 = await conn.getTokenLargestAccounts(creatorMint,'finalized')
				if(resp2==null || resp2.value==null || resp2.value.length==0) throw new Error("Invalid creator")
				const creatorNftAccount = resp2.value[0].address
				const info2 = await conn.getAccountInfo(creatorNftAccount,'finalized')
				if(info2 == null) throw new Error('Creator NFT info failed')
				const accountInfo2 = AccountLayout.decode(info2.data)
				if(Number(accountInfo2.amount)==0) throw new Error("Invalid Creator Info")
				const creatorWallet = new PublicKey(accountInfo2.owner)

				transaction.add(program.instruction.mint(new anchor.BN(bump),{
					accounts : {
						owner : wallet.publicKey,
						pool : pool,
						config : poolData.config,
						nftMint : mintKey,
						nftAccount : recipientKey,
						metadata : metadata,
						masterEdition : masterEdition,
						metadataExtended : metadataExtended,
						oldestNftMint : oldestNft.mint,
						oldestNftAccount : oldestNft.tokenAccount,
						oldestMetadataExtended : oldestNft.metadataExtended,
						parentNftMint : oldestNft.extendedData.parent,
						parentNftAccount : parentNftAccount,
						parentNftOwner : parentNftOwner,
						poolWallet : poolData.poolWallet,
						creatorNftAccount : creatorNftAccount,
						creatorWallet : creatorWallet,
						tokenProgram : TOKEN_PROGRAM_ID,
						tokenMetadataProgram : TOKEN_METADATA_PROGRAM_ID,
						systemProgram : SystemProgram.programId,
						rent : SYSVAR_RENT_PUBKEY,					
					}
				}))
			}
			// await sendTransaction(tx,[])
			await sendTransaction(transaction,signers)
			setAlertState({open: true, message:"Congratulations! Succeeded!",severity:'success'})
			await getPoolData()
		}catch(err){
			console.log(err)
			setAlertState({open: true, message:"Failed! Please try again!",severity:'error'})
		}
	}

	async function sendTransaction(transaction : Transaction, signers : Keypair[]) {
		transaction.feePayer = wallet.publicKey
		transaction.recentBlockhash = (await conn.getRecentBlockhash('max')).blockhash;
		await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
		if(signers.length != 0) await transaction.partialSign(...signers)
		const signedTransaction = await wallet.signTransaction(transaction);
		let hash = await conn.sendRawTransaction(await signedTransaction.serialize());
		await conn.confirmTransaction(hash);
		return hash
	}

	return <>
		<main className='content'>
			<div className="card">
			{
				poolData != null && 
				<h6 className="card-title">{poolData.countMinting+ " SPORE Nfts were minted"}</h6>
			}
				<form className="form">
					{
						(wallet && wallet.connected) &&
						<button type="button" disabled={isProcessing==true} className="form-btn" style={{"justifyContent" : "center"}} onClick={async ()=>{
							setIsProcessing(true)
							setAlertState({open: true, message:"Processing transaction",severity: "warning"})
							await mint()
							setIsProcessing(false)
						}}>
							{ isProcessing==true ? "Processing..." :"Mint" }
						</button>
					}
					<WalletConnect/>
				</form>
			</div>
			<Grid container spacing={1}>
			{
				holdingNfts.map((item, idx)=>{
					return <Grid item xs={2}>
						<Card key={idx} sx={{minWidth : 300}}>
							<CardMedia component="img" height="200" image={item.offChainData.image} alt="green iguana"/>
							<CardContent>
								<Typography gutterBottom variant="h6" component="div">
				        {item.data.name}
				        </Typography>
				        <Typography variant="body2" color="text.secondary">
			        	{"Id : " + item.extendedData.number}
			        	</Typography>
				        <Typography variant="body2" color="text.secondary">
			        	{"Parent : " + (item.extendedData.number==0 ? "Ancestor" : item.parentId)}
			        	</Typography>
			        	<Typography variant="body2" color="text.secondary">
			        	{"Followers : " + item.extendedData.childrenCount}
			        	</Typography>
							</CardContent>
						</Card>
					</Grid>
				})
			}
			</Grid>
			<Snackbar
        open={alertState.open}
        autoHideDuration={alertState.severity != 'warning' ? 6000 : 1000000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
        	iconMapping={{warning : <CircularProgress size={24}/>}}
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
		</main>
	</>
}