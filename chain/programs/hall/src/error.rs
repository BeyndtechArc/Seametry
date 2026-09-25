use anchor_lang::prelude::*;

use crate::recipe::RecipeError;

#[error_code]
pub enum HallError {
    #[msg("The alloy has no constituent at this index.")]
    UnknownConstituent,
    #[msg("The token account is not the Hall's account for this constituent.")]
    WrongHallAccount,
    #[msg("A share count must be positive.")]
    ZeroShares,
    #[msg("The alloy has no shares outstanding, so a per-share amount is undefined.")]
    ZeroSupply,
    #[msg("More shares were requested than exist.")]
    SharesExceedSupply,
    #[msg("An amount overflowed 64 bits.")]
    Overflow,
    #[msg("A loss exceeds everything the Hall holds of this constituent.")]
    DeficitExceedsHoldings,
    #[msg("A leg costs more than the maximum the caller stated.")]
    ExceedsMaximum,
    #[msg("A withdrawal exceeds the units owed.")]
    ExceedsUnclaimed,
    #[msg("An alloy holds between one and twelve constituents.")]
    ConstituentCountOutOfRange,
    #[msg(
        "Each constituent needs exactly four accounts: mint, source, Hall account, token program."
    )]
    WrongAccountCount,
    #[msg("The genesis shares and every constituent deposit must be positive.")]
    ZeroDeposit,
    #[msg("The same mint appears twice in one alloy.")]
    DuplicateConstituent,
    #[msg("The account is not a mint of the token program named beside it.")]
    NotAMint,
    #[msg("The source is not a token account of this mint owned by the signer.")]
    WrongSourceAccount,
    #[msg("The token program must be the classic Token program or Token-2022.")]
    UnsupportedTokenProgram,
    #[msg("The issuer freezes new token accounts for this mint, so the Hall cannot hold it.")]
    HallAccountFrozen,
    #[msg("The Hall received a different amount than was sent. A transfer fee or hook changed the amount.")]
    DepositNotReceivedInFull,
    #[msg("The share mint is not the one this alloy issues.")]
    WrongShareMint,
    #[msg("Supply one maximum per constituent.")]
    WrongMaximumsCount,
    #[msg("A mint, Hall account or token program does not match the alloy's record for that constituent.")]
    WrongConstituentAccounts,
}

impl From<RecipeError> for HallError {
    fn from(error: RecipeError) -> Self {
        match error {
            RecipeError::ZeroSupply => Self::ZeroSupply,
            RecipeError::ZeroShares => Self::ZeroShares,
            RecipeError::SharesExceedSupply { .. } => Self::SharesExceedSupply,
            RecipeError::Overflow => Self::Overflow,
            RecipeError::DeficitExceedsHoldings { .. } => Self::DeficitExceedsHoldings,
            RecipeError::ExceedsMaximum { .. } => Self::ExceedsMaximum,
            RecipeError::ExceedsUnclaimed { .. } => Self::ExceedsUnclaimed,
        }
    }
}

impl From<RecipeError> for Error {
    fn from(error: RecipeError) -> Self {
        HallError::from(error).into()
    }
}
