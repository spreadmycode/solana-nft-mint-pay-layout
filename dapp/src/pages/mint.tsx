import { Fragment, useRef, useState, useEffect } from "react";
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
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import {
  AccountLayout,
  MintLayout,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";
import useNotify from "./notify";
import * as bs58 from "bs58";
import * as anchor from "@project-serum/anchor";
import { programs } from "@metaplex/js";
import axios from "axios";
import { WalletConnect, WalletDisconnect } from "../wallet";
import { Container, Snackbar } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import {
  CircularProgress,
  Card,
  CardMedia,
  Grid,
  CardContent,
  Typography,
  BottomNavigation,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import {
  createMint,
  createAssociatedTokenAccountInstruction,
  sendTransactionWithRetry,
} from "./utility";

let wallet: any;
let conn = new Connection(clusterApiUrl("devnet"));
let notify: any;

const {
  metadata: { Metadata },
} = programs;
const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const programId = new PublicKey("J7NPSyNf61AFrgTktvt87LqJHqwes5axQEH1pwjRaVcP");
const POOL = new PublicKey("CfX1ejHk48ct6ch1bgVqTVaNo1bLCDN7dy3VjyDyyEXu");
const idl = require("./solana_anchor.json");
const confirmOption: ConfirmOptions = {
  commitment: "finalized",
  preflightCommitment: "finalized",
  skipPreflight: false,
};

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

export default function Mint() {
  wallet = useWallet();
  notify = useNotify();

  const [pool, setPool] = useState<PublicKey>(POOL);
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [poolData, setPoolData] = useState<any>(null);

  useEffect(() => {
    getPoolData();
  }, [pool]);

  const getTokenWallet = async (owner: PublicKey, mint: PublicKey) => {
    return (
      await PublicKey.findProgramAddress(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    )[0];
  };
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
  };
  const getEdition = async (mint: PublicKey) => {
    return (
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
          Buffer.from("edition"),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )
    )[0];
  };

  const getPoolData = async () => {
    try {
      const poolAddress = new PublicKey(pool);
      const randWallet = new anchor.Wallet(Keypair.generate());
      const provider = new anchor.Provider(conn, randWallet, confirmOption);
      const program = new anchor.Program(idl, programId, provider);
      const pD = await program.account.pool.fetch(poolAddress);
      setPoolData(pD);
    } catch (err) {
      console.log(err);
      setPoolData(null);
    }
  };

  const mint = async () => {
    try {
      const provider = new anchor.Provider(conn, wallet as any, confirmOption);
      const program = new anchor.Program(idl, programId, provider);
      const poolData = await program.account.pool.fetch(pool);
      console.log(poolData);

      let transaction = new Transaction();
      let instructions: TransactionInstruction[] = [];
      let signers: Keypair[] = [];
      const mintRent = await conn.getMinimumBalanceForRentExemption(
        MintLayout.span
      );
      const mintKey = createMint(
        instructions,
        wallet.publicKey,
        mintRent,
        0,
        wallet.publicKey,
        wallet.publicKey,
        signers
      );
      const recipientKey = await getTokenWallet(wallet.publicKey, mintKey);
      createAssociatedTokenAccountInstruction(
        instructions,
        recipientKey,
        wallet.publicKey,
        wallet.publicKey,
        mintKey
      );
      instructions.push(
        Token.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          mintKey,
          recipientKey,
          wallet.publicKey,
          [],
          1
        )
      );
      instructions.forEach((item) => transaction.add(item));
      const metadata = await getMetadata(mintKey);
      const masterEdition = await getEdition(mintKey);
      transaction.add(
        program.instruction.mint({
          accounts: {
            owner: wallet.publicKey,
            pool: pool,
            config: poolData.config,
            nftMint: mintKey,
            nftAccount: recipientKey,
            metadata: metadata,
            masterEdition: masterEdition,
            poolWallet1: poolData.poolWallet1,
            poolWallet2: poolData.poolWallet2,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          },
        })
      );
      await sendTransaction(transaction, signers);
      setAlertState({
        open: true,
        message: "Congratulations! Succeeded!",
        severity: "success",
      });
      await getPoolData();
    } catch (err) {
      console.log(err);
      setAlertState({
        open: true,
        message: "Failed! Please try again!",
        severity: "error",
      });
    }
  };

  async function sendTransaction(transaction: Transaction, signers: Keypair[]) {
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = (
      await conn.getRecentBlockhash("max")
    ).blockhash;
    await transaction.setSigners(
      wallet.publicKey,
      ...signers.map((s) => s.publicKey)
    );
    if (signers.length != 0) await transaction.partialSign(...signers);
    const signedTransaction = await wallet.signTransaction(transaction);
    let hash = await conn.sendRawTransaction(
      await signedTransaction.serialize()
    );
    await conn.confirmTransaction(hash);
    return hash;
  }

  return (
    <>
      <main className="content">
        <div className="card">
          {poolData != null && (
            <h6 className="card-title">
              {poolData.countMinting + " Nfts were minted"}
            </h6>
          )}
          <form className="form">
            {wallet && wallet.connected && (
              <button
                type="button"
                disabled={isProcessing == true}
                className="form-btn"
                style={{ justifyContent: "center" }}
                onClick={async () => {
                  setIsProcessing(true);
                  setAlertState({
                    open: true,
                    message: "Processing transaction",
                    severity: "warning",
                  });
                  await mint();
                  setIsProcessing(false);
                }}
              >
                {isProcessing == true ? "Processing..." : "Mint"}
              </button>
            )}
            <WalletConnect />
          </form>
        </div>
        <Snackbar
          open={alertState.open}
          autoHideDuration={alertState.severity != "warning" ? 6000 : 1000000}
          onClose={() => setAlertState({ ...alertState, open: false })}
        >
          <Alert
            iconMapping={{ warning: <CircularProgress size={24} /> }}
            onClose={() => setAlertState({ ...alertState, open: false })}
            severity={alertState.severity}
          >
            {alertState.message}
          </Alert>
        </Snackbar>
      </main>
    </>
  );
}
