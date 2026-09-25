use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod recipe;
pub mod state;

pub use instructions::*;

declare_id!("4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx");

#[program]
pub mod hall {
    use super::*;

    pub fn initialize_alloy<'info>(
        ctx: Context<'info, InitializeAlloy<'info>>,
        args: InitializeAlloyArgs,
    ) -> Result<()> {
        instructions::initialize_alloy::handle_initialize_alloy(ctx, args)
    }

    pub fn create<'info>(
        ctx: Context<'info, Create<'info>>,
        shares: u64,
        maximums: Vec<u64>,
    ) -> Result<()> {
        instructions::create::handle_create(ctx, shares, maximums)
    }

    pub fn sync(ctx: Context<SyncLeg>, leg_index: u8) -> Result<()> {
        instructions::sync_leg::handle_sync(ctx, leg_index)
    }
}
