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
