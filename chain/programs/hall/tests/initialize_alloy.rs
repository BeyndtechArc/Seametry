mod common;

use {
    anchor_lang::{prelude::Pubkey, solana_program::system_program},
    anchor_spl::{
        token::spl_token,
        token_2022,
        token_interface::{
            spl_token_2022::{
                extension::{
                    metadata_pointer::MetadataPointer, BaseStateWithExtensions, ExtensionType,
                    StateWithExtensions,
                },
                state::Mint,
            },
            spl_token_metadata_interface::state::TokenMetadata,
        },
    },
    common::{alloy::*, World},
};

#[test]
fn a_new_alloy_holds_the_deposits_and_locks_the_genesis_shares() {
    let mut world = World::new();
    let classic = funded(&mut world, spl_token::ID, 5_000_000);
    let modern = funded(&mut world, token_2022::ID, 3_000_000);
    let deposits = [classic, modern];

    let outcome = initialize(&mut world, &deposits, amounts(&deposits));
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    let at = addresses(world.sponsor());
    let alloy = world.alloy(at.alloy);
    assert_eq!(alloy.sponsor, world.sponsor());
    assert_eq!(alloy.sponsor_mark, [9; 32]);
    assert_eq!(alloy.share_mint, at.share_mint);
    assert_eq!(
        (alloy.supply, alloy.locked_genesis, alloy.constituent_count),
        (GENESIS, GENESIS, 2)
    );

    for (index, deposit) in deposits.iter().enumerate() {
        let leg = alloy.legs[index];
        let held = hall_account(at.alloy, deposit);
        assert_eq!(
            (leg.mint, leg.hall_account, leg.token_program),
            (deposit.mint, held, deposit.program)
        );
        assert_eq!(
            (leg.ledger, leg.pending, leg.unclaimed),
            (deposit.amount, 0, 0)
        );
        assert_eq!(
            world.token_amount(held),
            deposit.amount,
            "Hall balance for leg {index}"
        );
        assert_eq!(
            world.token_amount(deposit.source),
            0,
            "sponsor source for leg {index}"
        );
    }
    assert_eq!(world.token_amount(at.locked), GENESIS);
}

#[test]
fn the_share_mint_carries_no_issuer_power() {
    let mut world = World::new();
    let deposits = [funded(&mut world, spl_token::ID, 5_000_000)];
    initialize(&mut world, &deposits, amounts(&deposits)).unwrap();

    let at = addresses(world.sponsor());
    let account = world.svm.get_account(&at.share_mint).unwrap();
    assert_eq!(account.owner, token_2022::ID);
    let mint = StateWithExtensions::<Mint>::unpack(&account.data).unwrap();

    assert_eq!(
        Option::<Pubkey>::from(mint.base.mint_authority),
        Some(at.alloy)
    );
    assert_eq!(
        Option::<Pubkey>::from(mint.base.freeze_authority),
        None,
        "freeze authority"
    );
    assert_eq!(mint.base.supply, GENESIS);

    let mut extensions = mint.get_extension_types().unwrap();
    extensions.sort_by_key(|e| *e as u16);
    assert_eq!(
        extensions,
        vec![ExtensionType::MetadataPointer, ExtensionType::TokenMetadata]
    );

    let pointer = mint.get_extension::<MetadataPointer>().unwrap();
    assert_eq!(
        Option::<Pubkey>::from(pointer.authority),
        None,
        "metadata pointer authority"
    );
    assert_eq!(
        Option::<Pubkey>::from(pointer.metadata_address),
        Some(at.share_mint)
    );

    let metadata = mint.get_variable_len_extension::<TokenMetadata>().unwrap();
    assert_eq!(
        Option::<Pubkey>::from(metadata.update_authority),
        None,
        "metadata update authority"
    );
    assert_eq!(
        (metadata.name.as_str(), metadata.symbol.as_str()),
        ("Alloy No. 1", "ALY1")
    );
}

#[test]
fn tokens_already_at_the_halls_address_vest_instead_of_blocking_the_alloy() {
    let mut world = World::new();
    let deposit = funded(&mut world, spl_token::ID, 5_000_000);
    let at = addresses(world.sponsor());
    world.put_token_account_at(
        hall_account(at.alloy, &deposit),
        spl_token::ID,
        deposit.mint,
        at.alloy,
        777,
    );
    let deposits = [deposit];

    let outcome = initialize(&mut world, &deposits, amounts(&deposits));
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    let leg = world.alloy(at.alloy).legs[0];
    assert_eq!((leg.ledger, leg.pending), (5_000_000, 777));
    assert_eq!(
        world.token_amount(hall_account(at.alloy, &deposits[0])),
        5_000_777
    );
}

#[test]
fn a_zero_deposit_is_refused() {
    let mut world = World::new();
    let deposits = [funded(&mut world, spl_token::ID, 5_000_000)];
    assert_refused(&initialize(&mut world, &deposits, vec![0]), "ZeroDeposit");
}

#[test]
fn the_same_mint_twice_is_refused() {
    let mut world = World::new();
    let first = funded(&mut world, spl_token::ID, 5_000_000);
    let sponsor = world.sponsor();
    let second_source = Pubkey::new_unique();
    world.put_token_account_at(second_source, spl_token::ID, first.mint, sponsor, 1_000_000);
    let second = Deposit {
        mint: first.mint,
        source: second_source,
        program: spl_token::ID,
        amount: 1_000_000,
    };
    let deposits = [first, second];
    assert_refused(
        &initialize(&mut world, &deposits, amounts(&deposits)),
        "DuplicateConstituent",
    );
}

#[test]
fn a_source_the_sponsor_does_not_own_is_refused() {
    let mut world = World::new();
    let mut deposit = funded(&mut world, spl_token::ID, 5_000_000);
    deposit.source = Pubkey::new_unique();
    world.put_token_account_at(
        deposit.source,
        spl_token::ID,
        deposit.mint,
        Pubkey::new_unique(),
        5_000_000,
    );
    let deposits = [deposit];
    assert_refused(
        &initialize(&mut world, &deposits, amounts(&deposits)),
        "WrongSourceAccount",
    );
}

#[test]
fn a_token_program_that_is_neither_token_nor_token_2022_is_refused() {
    let mut world = World::new();
    let mut deposit = funded(&mut world, spl_token::ID, 5_000_000);
    deposit.program = system_program::ID;
    let deposits = [deposit];
    assert_refused(
        &initialize(&mut world, &deposits, amounts(&deposits)),
        "UnsupportedTokenProgram",
    );
}

#[test]
fn the_number_of_deposits_must_match_the_accounts_supplied() {
    let mut world = World::new();
    let deposits = [funded(&mut world, spl_token::ID, 5_000_000)];
    assert_refused(
        &initialize(&mut world, &deposits, vec![5_000_000, 1]),
        "WrongAccountCount",
    );
}

/// The upper bound of twelve is not exercised here: a legacy transaction cannot
/// carry that many accounts, so it needs a v0 transaction and a lookup table.
#[test]
fn an_alloy_with_no_constituents_is_refused() {
    let mut world = World::new();
    assert_refused(
        &initialize(&mut world, &[], vec![]),
        "ConstituentCountOutOfRange",
    );
}
