pub mod utils;
use borsh::{BorshDeserialize,BorshSerialize};
use arrayref::{array_ref};
use {
    anchor_lang::{
        prelude::*,
        AnchorDeserialize,
        AnchorSerialize,
        Key,
        Discriminator,
        solana_program::{
            program::{invoke,invoke_signed},
            program_pack::Pack,
            system_instruction,
            system_program
        }
    },
    metaplex_token_metadata::{
        instruction::{create_metadata_accounts,create_master_edition,update_metadata_accounts},
        state::{
            MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH, MAX_URI_LENGTH,
        },
    },
    spl_token::state,
    std::cell::Ref,
};
declare_id!("Ah2FHrgj7yNxvriY8CCXq7KYnKAHUHwHCzre2LzNTxzc");

#[program]
pub mod solana_anchor {
    use super::*;

    pub fn init_config(
        ctx : Context<InitConfig>,
        _max_number_of_lines : u32,
        _config_data : ConfigData,
        ) ->ProgramResult {
        msg!("+ init_config");
        let config_info = &mut ctx.accounts.config;
        let mut new_data = Config::discriminator().try_to_vec().unwrap();
        new_data.append(&mut (*ctx.accounts.authority.key).try_to_vec().unwrap());
        new_data.append(&mut (_max_number_of_lines).try_to_vec().unwrap());
        let mut config_data = _config_data;
        let mut array_of_zeroes = vec![];
        while array_of_zeroes.len() < MAX_SYMBOL_LENGTH - config_data.symbol.len() {
            array_of_zeroes.push(0u8);
        }
        let new_symbol = config_data.symbol.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
        config_data.symbol = new_symbol;
        new_data.append(&mut config_data.try_to_vec().unwrap());
        let mut data = config_info.data.borrow_mut();
        for i in 0..new_data.len(){
            data[i] = new_data[i];
        }
        let vec_start = 8 + CONFIG_SIZE;
        let as_bytes = (0 as u32).to_le_bytes();
        for i in 0..4 {
            data[vec_start+i] = as_bytes[i];
        }
        Ok(())
    }

    pub fn update_config(
        ctx : Context<UpdateConfig>,
        _config_data : ConfigData
        ) -> ProgramResult {
        msg!("+ update_config");
        let authority = get_authority(&ctx.accounts.config)?;
        if authority != *ctx.accounts.authority.key {
            return Err(PoolError::InvalidAuthority.into());
        }
        let config_info = &mut ctx.accounts.config;
        let mut data = config_info.data.borrow_mut();
        let mut config_data = _config_data;
        let mut array_of_zeroes = vec![];
        while array_of_zeroes.len() < MAX_SYMBOL_LENGTH - config_data.symbol.len() {
            array_of_zeroes.push(0u8);
        }
        let new_symbol = config_data.symbol.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
        config_data.symbol = new_symbol;
        
        data[44..44+CONFIG_DATA_SIZE].copy_from_slice(&mut config_data.try_to_vec().unwrap());
        Ok(())
    }

    pub fn add_config_lines(
        ctx : Context<AddConfigLines>,
        config_lines : Vec<ConfigLine>
        ) ->ProgramResult {
        msg!("+ add_config_lines");
        let authority = get_authority(&ctx.accounts.config)?;
        if authority != *ctx.accounts.authority.key {
            return Err(PoolError::InvalidAuthority.into());
        }        
        let current_count = get_config_count(&ctx.accounts.config.data.borrow())?;
        let mut data = ctx.accounts.config.data.borrow_mut();
        let mut fixed_config_lines = vec![];
        for line in &config_lines {
            let mut array_of_zeroes = vec![];
            let mut count_limit = MAX_NAME_LENGTH - line.name.len();
            while array_of_zeroes.len() < count_limit{
                array_of_zeroes.push(0u8);
            }
            let name = line.name.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();

            let mut array_of_zeroes = vec![];
            count_limit = MAX_URI_LENGTH - line.uri.len();
            while array_of_zeroes.len() < count_limit {
                array_of_zeroes.push(0u8);
            }
            let uri = line.uri.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
            fixed_config_lines.push(ConfigLine {name, uri})
        }
        let as_vec = fixed_config_lines.try_to_vec()?;
        let serialized : &[u8] = &as_vec.as_slice()[4..];
        let position = 8 + CONFIG_SIZE + 4 + current_count as usize * CONFIG_LINE_SIZE;
        let array_slice : &mut[u8] = &mut data[position..position+fixed_config_lines.len()*CONFIG_LINE_SIZE];
        array_slice.copy_from_slice(serialized);

        let new_count : u32 = current_count as u32 + fixed_config_lines.len() as u32;
        data[8+CONFIG_SIZE..8+CONFIG_SIZE+4].copy_from_slice(&(new_count as u32).to_le_bytes());

        Ok(())
    }

    pub fn update_config_line(
        ctx : Context<AddConfigLines>,
        _index : u32,
        _config_line : ConfigLine
        ) -> ProgramResult {
        msg!("+ update_config_line");
        let authority = get_authority(&ctx.accounts.config)?;
        if authority != *ctx.accounts.authority.key{
            return Err(PoolError::InvalidAuthority.into());
        } 
        let current_count = get_config_count(&ctx.accounts.config.data.borrow())?;
        if _index >= current_count as u32{
            return Err(PoolError::InvalidIndex.into());
        }
        let mut data = ctx.accounts.config.data.borrow_mut();
        let mut config_line = _config_line;
        let mut array_of_zeroes = vec![];
        while array_of_zeroes.len() < MAX_NAME_LENGTH - config_line.name.len(){
            array_of_zeroes.push(0u8);
        }
        let name = config_line.name.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
        config_line.name = name;
        let mut array_of_zeroes = vec![];
        while array_of_zeroes.len() < MAX_URI_LENGTH - config_line.uri.len(){
            array_of_zeroes.push(0u8);
        }
        let uri = config_line.uri.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
        config_line.uri = uri;
        let position = 8 + CONFIG_SIZE + 4 + _index as usize * CONFIG_LINE_SIZE;
        data[position..position+CONFIG_LINE_SIZE].copy_from_slice(&mut config_line.try_to_vec().unwrap());
        Ok(())
    }

    pub fn init_pool(
        ctx : Context<InitPool>,
        _bump : u8,
        _update_authority : Pubkey,
        _pool_wallet1 : Pubkey,
        _pool_wallet2 : Pubkey,
        _pool_percent1 : u8,
        _pool_percent2 : u8,
        _minting_price : u64
        ) ->ProgramResult {
        msg!("+ init_pool");
        let pool = &mut ctx.accounts.pool;
        pool.owner = *ctx.accounts.owner.key;
        pool.rand = *ctx.accounts.rand.key;
        pool.config = *ctx.accounts.config.key;
        pool.count_minting = 0;
        pool.minting_price = _minting_price;
        pool.update_authority = _update_authority;
        pool.pool_wallet1 = _pool_wallet1;
        pool.pool_wallet2 = _pool_wallet2;
        pool.pool_percent1 = _pool_percent1;
        pool.pool_percent2 = _pool_percent2;
        pool.bump = _bump;
        Ok(())
    }

    pub fn update_pool(
        ctx : Context<UpdatePool>,
        _update_authority : Pubkey,
        _pool_wallet1 : Pubkey,
        _pool_wallet2 : Pubkey,
        _pool_percent1 : u8,
        _pool_percent2 : u8,
        _minting_price : u64
        ) -> ProgramResult {
        msg!("+ update_pool");
        let pool = &mut ctx.accounts.pool;
        if pool.owner != *ctx.accounts.owner.key{
            msg!("Invalid pool owner");
            return Err(PoolError::InvalidOwner.into());
        }
        pool.update_authority = _update_authority;
        pool.minting_price = _minting_price;
        pool.pool_wallet1 = _pool_wallet1;
        pool.pool_wallet2 = _pool_wallet2;
        pool.pool_percent1 = _pool_percent1;
        pool.pool_percent2 = _pool_percent2;
        Ok(())
    }

    pub fn mint(
        ctx : Context<Mint>,
        ) ->ProgramResult {
        msg!("+ mint_root");
        let pool = &mut ctx.accounts.pool;

        let config_data = get_config_data(&ctx.accounts.config)?;

        let nft_mint : state::Mint = state::Mint::unpack_from_slice(&ctx.accounts.nft_mint.data.borrow())?;
        let nft_account : state::Account = state::Account::unpack_from_slice(&ctx.accounts.nft_account.data.borrow())?;
        if nft_mint.supply !=1 
            || nft_account.owner != *ctx.accounts.owner.key 
            || nft_account.amount != 1 
            || nft_account.mint != *ctx.accounts.nft_mint.key {
            return Err(PoolError::InvalidMintPrerequirement.into());
        }
        let config_line = get_config_line(&ctx.accounts.config, pool.count_minting as usize)?;
        if ctx.accounts.owner.lamports() < pool.minting_price {
            return Err(PoolError::NotEnoughSol.into());
        }
        if *ctx.accounts.owner.key != *ctx.accounts.pool_wallet1.key && *ctx.accounts.owner.key != *ctx.accounts.pool_wallet2.key {
            invoke(
                &system_instruction::transfer(
                    ctx.accounts.owner.key,
                    ctx.accounts.pool_wallet1.key,
                    pool.minting_price * pool.pool_percent1 as u64 / 100 as u64
                ),
                &[
                    ctx.accounts.owner.clone(),
                    ctx.accounts.pool_wallet1.clone(),
                    ctx.accounts.system_program.clone(),
                ]
            )?;
            invoke(
                &system_instruction::transfer(
                    ctx.accounts.owner.key,
                    ctx.accounts.pool_wallet2.key,
                    pool.minting_price * pool.pool_percent2 as u64 / 100 as u64
                ),
                &[
                    ctx.accounts.owner.clone(),
                    ctx.accounts.pool_wallet2.clone(),
                    ctx.accounts.system_program.clone(),
                ]
            )?;
        }
        let mut creators : Vec<metaplex_token_metadata::state::Creator> = 
            vec![metaplex_token_metadata::state::Creator{
                address : pool.key(),
                verified : true,
                share : 0,
            }];
        creators.push(metaplex_token_metadata::state::Creator{
            address : *ctx.accounts.pool_wallet1.key,
            verified : false,
            share : pool.pool_percent1,
        });
        creators.push(metaplex_token_metadata::state::Creator{
            address : *ctx.accounts.pool_wallet2.key,
            verified : false,
            share : pool.pool_percent2,
        });

        let pool_seeds = &[pool.rand.as_ref(),&[pool.bump]];  
        invoke_signed(
            &create_metadata_accounts(
                *ctx.accounts.token_metadata_program.key,
                *ctx.accounts.metadata.key,
                *ctx.accounts.nft_mint.key,
                *ctx.accounts.owner.key,
                *ctx.accounts.owner.key,
                pool.key(),
                config_line.name,
                config_data.symbol.clone(),
                config_line.uri,
                Some(creators),
                config_data.seller_fee,
                true,
                true,
            ),
            &[
                ctx.accounts.metadata.clone(),
                ctx.accounts.nft_mint.clone(),
                ctx.accounts.owner.clone(),
                ctx.accounts.token_metadata_program.clone(),
                ctx.accounts.token_program.clone(),
                ctx.accounts.system_program.clone(),
                ctx.accounts.rent.to_account_info().clone(),
                pool.to_account_info().clone(),
            ],
            &[pool_seeds],
        )?;
        invoke_signed(
            &create_master_edition(
                *ctx.accounts.token_metadata_program.key,
                *ctx.accounts.master_edition.key,
                *ctx.accounts.nft_mint.key,
                pool.key(),
                *ctx.accounts.owner.key,
                *ctx.accounts.metadata.key,
                *ctx.accounts.owner.key,
                None
            ),
            &[
                ctx.accounts.master_edition.clone(),
                ctx.accounts.nft_mint.clone(),
                ctx.accounts.owner.clone(),
                ctx.accounts.metadata.clone(),
                ctx.accounts.token_metadata_program.clone(),
                ctx.accounts.token_program.clone(),
                ctx.accounts.system_program.clone(),
                ctx.accounts.rent.to_account_info().clone(),
                pool.to_account_info().clone(),
            ],
            &[pool_seeds]
        )?;
        invoke_signed(
            &update_metadata_accounts(
                *ctx.accounts.token_metadata_program.key,
                *ctx.accounts.metadata.key,
                pool.key(),
                Some(pool.update_authority),
                None,
                Some(true),
            ),
            &[
                ctx.accounts.token_metadata_program.clone(),
                ctx.accounts.metadata.clone(),
                pool.to_account_info().clone(),
            ],
            &[pool_seeds]
        )?;
        pool.count_minting = pool.count_minting + 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdatePool<'info>{
    #[account(mut,signer)]
    owner : AccountInfo<'info>,

    #[account(mut, has_one=owner)]
    pool : ProgramAccount<'info,Pool>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info>{
    #[account(mut)]
    authority : AccountInfo<'info>,

    #[account(mut)]
    config : AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Mint<'info>{
    #[account(mut, signer)]
    owner : AccountInfo<'info>,

    #[account(mut)]
    pool : ProgramAccount<'info, Pool>,

    config : AccountInfo<'info>,

    #[account(mut)]
    nft_mint : AccountInfo<'info>,

    #[account(mut)]
    nft_account : AccountInfo<'info>,

    #[account(mut)]
    metadata : AccountInfo<'info>,

    #[account(mut)]
    master_edition : AccountInfo<'info>,

    #[account(mut)]
    pool_wallet1 : AccountInfo<'info>,

    #[account(mut)]
    pool_wallet2 : AccountInfo<'info>,

    #[account(address = spl_token::id())]
    token_program: AccountInfo<'info>,

    #[account(address = metaplex_token_metadata::id())]
    token_metadata_program: AccountInfo<'info>,

    // system_program : Program<'info,System>,  
    #[account(address = system_program::ID)]
    system_program : AccountInfo<'info>,

    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(_bump : u8)]
pub struct InitPool<'info>{
    #[account(mut, signer)]
    owner : AccountInfo<'info>,

    #[account(init, seeds=[(*rand.key).as_ref()], bump=_bump, payer=owner, space=8+POOL_SIZE)]
    pool : ProgramAccount<'info, Pool>,

    rand : AccountInfo<'info>,

    config : AccountInfo<'info>,

    system_program : Program<'info,System>,  
}

#[derive(Accounts)]
pub struct AddConfigLines<'info> {
    #[account(mut, signer)]
    authority : AccountInfo<'info>,

    // #[account(mut, has_one=authority)]
    // config : ProgramAccount<'info, Config>,
    #[account(mut)]
    config : AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(_max_number_of_lines : u32)]
pub struct InitConfig<'info>{
    #[account(mut, signer)]
    authority : AccountInfo<'info>,

    #[account(mut, constraint= config.to_account_info().owner==program_id && config.to_account_info().data_len() >= CONFIG_SIZE+(4+CONFIG_LINE_SIZE * _max_number_of_lines as usize))]
    config : AccountInfo<'info>,
}

pub const POOL_SIZE : usize = 32 + 32 + 32 + 4 + 8 + 32 + 32 + 32 + 1 + 1 + 1;
#[account]
#[derive(Default)]
pub struct Pool{
    pub owner : Pubkey,
    pub rand : Pubkey,
    pub config : Pubkey,
    pub count_minting : u32,
    pub minting_price : u64,
    pub update_authority : Pubkey,
    pub pool_wallet1 : Pubkey,
    pub pool_wallet2 : Pubkey,
    pub pool_percent1 : u8,
    pub pool_percent2 : u8,
    pub bump : u8
}

pub const CONFIG_SIZE : usize = 32 + 4 + CONFIG_DATA_SIZE; // + 4 + CONFIG_LINE_SIZE * max_number_of_lines
#[account]
#[derive(Default)]
pub struct Config{
    pub authority : Pubkey,
    pub max_number_of_lines : u32,
    pub config_data : ConfigData,
    pub config_lines : Vec<ConfigLine>
}

pub const CONFIG_DATA_SIZE : usize = 4 + MAX_SYMBOL_LENGTH + 32 + 2;
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ConfigData{
    pub symbol : String,
    pub creator : Pubkey,
    pub seller_fee : u16,
}

pub const CONFIG_LINE_SIZE : usize = 4 + MAX_NAME_LENGTH + 4 + MAX_URI_LENGTH;
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigLine{
    pub name : String,
    pub uri : String,
}

pub fn get_authority(
    a : &AccountInfo,
    ) -> core::result::Result<Pubkey,ProgramError> {
    let arr = a.data.borrow();
    let data_array = &arr[8..40];
    let authority : Pubkey = Pubkey::try_from_slice(data_array)?;
    Ok(authority)
}

pub fn get_config_data(
    a : &AccountInfo,
    ) -> core::result::Result<ConfigData,ProgramError> {
    let arr = a.data.borrow();
    let data_array = &arr[8+32+4..8+32+4+CONFIG_DATA_SIZE];
    let config_data : ConfigData = ConfigData::try_from_slice(data_array)?;
    Ok(config_data)
}

pub fn get_config_count(data : &Ref<&mut [u8]>) -> core::result::Result<usize, ProgramError>{
    return Ok(u32::from_le_bytes(*array_ref![data, 8+CONFIG_SIZE, 4]) as usize);
}

pub fn set_config_count(a : &mut AccountInfo, count : u32){
    let mut arr = a.data.borrow_mut();
    let data_array = count.try_to_vec().unwrap();
    let vec_start = 8 + CONFIG_SIZE;
    for i in 0..data_array.len() {
        arr[vec_start+i] = data_array[i];
    }
}

pub fn get_config_line(
    a : &AccountInfo,
    index : usize,
    ) -> core::result::Result<ConfigLine, ProgramError> {
    let arr = a.data.borrow();
    let total = get_config_count(&arr)?;
    if index > total {
        return Err(PoolError::IndexGreaterThanLength.into());
    }
    let data_array = &arr[8+CONFIG_SIZE + 4 + index * (CONFIG_LINE_SIZE)..8+CONFIG_SIZE + 4 + (index+1) * (CONFIG_LINE_SIZE)];
    let config_line : ConfigLine = ConfigLine::try_from_slice(data_array)?;
    Ok(config_line)
}

#[error]
pub enum PoolError {
    #[msg("Token mint to failed")]
    TokenMintToFailed,

    #[msg("Token set authority failed")]
    TokenSetAuthorityFailed,

    #[msg("Token transfer failed")]
    TokenTransferFailed,

    #[msg("Invalid mint account")]
    InvalidMintAccount,

    #[msg("Invalid token account")]
    InvalidTokenAccount,

    #[msg("Invalid pool account")]
    InvalidPoolAccount,

    #[msg("Mint amount is zero")]
    MintAmountIsZero,

    #[msg("Index greater than length")]
    IndexGreaterThanLength,

    #[msg("Not enough sol")]
    NotEnoughSol,

    #[msg("Invalid mint pre requirement")]
    InvalidMintPrerequirement,

    #[msg("Invalid oldest mint requirement")]
    InvalidOldestMintRequirement,

    #[msg("Invalid parent")]
    InvalidParent,

    #[msg("Invalid pool wallet")]
    InvalidPoolWallet,

    #[msg("Invalid creator wallet")]
    InvalidCreatorWallet,

    #[msg("Invalid creating root")]
    InvalidCreatingRoot,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Invalid owner")]
    InvalidOwner,

    #[msg("Invalid index")]
    InvalidIndex,
}