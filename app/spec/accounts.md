Every piece of state on Solana is an **account** addressed by a 32-byte public key ([docs: accounts](https://solana.com/docs/core/accounts)). An account holds:

- `lamports` — balance in lamports (1 SOL = 1,000,000,000 lamports) ([docs](https://solana.com/docs/core/accounts)).
- `data` — a byte array.
- `owner` — the program id that may modify `data` and debit lamports.
- `executable` — whether the account is a program. Runtime checks of this flag that can throw errors were removed by **SIMD-0162**.
- `rent_epoch` — legacy field; the value serialized into the VM is a constant per **SIMD-0267**.

**Rent.** Rent collection is disabled (**SIMD-0084**) and partitioned rent updates removed (**SIMD-0175**); unchanged accounts are not rewritten (**SIMD-0183**). New accounts must hold the rent-exempt minimum balance. **SIMD-0194** renames `lamports_per_byte_year` to `lamports_per_byte`, sets its default to `6960` and the exemption threshold to `1.0` (deprecated). **SIMD-0392** relaxes the post-execution check to `min(pre_exec_balance, calculate_min_balance(size))` so rent can change without disruption. Current mainnet `lamports_per_byte` value: TODO: verify (SIMD-0436/0437 propose reductions; both are Idea).

**State hash.** The cluster commits to total account state with the homomorphic **Accounts Lattice Hash** (**SIMD-0215**), which is also the snapshot hash (**SIMD-0220**); the Accounts Delta Hash was removed (**SIMD-0223**).

**Reserved keys.** Write locks on builtin programs and sysvars are demoted using a dynamic set of reserved account keys updated at epoch boundaries via feature gates (**SIMD-0105**).
