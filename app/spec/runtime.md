Programs are compiled to **sBPF** and executed in the SVM ([docs: programs](https://solana.com/docs/core/programs)).

- **ISA.** sBPF changes: dynamic stack frames (**SIMD-0166**), instruction encoding (**SIMD-0173**), arithmetic (**SIMD-0174**), static syscalls (**SIMD-0178**), stricter ELF headers (**SIMD-0189**), eBPF ISA compatibility (**SIMD-0377**). Which sBPF versions may be deployed: TODO: verify (SIMD-0500, Idea, proposes disabling v0–v2 deployment).
- **Program input.** Register `r2` holds a pointer to instruction data at entrypoint (**SIMD-0321**). Syscall parameter address restrictions: **SIMD-0459**.
- **Syscalls.** Last restart slot (**SIMD-0047**), get-sysvar (**SIMD-0127**), get-epoch-stake (**SIMD-0133**), alt_bn128 (**SIMD-0129**, **SIMD-0222**, **SIMD-0284**, **SIMD-0302**, **SIMD-0334**), curve abort semantics (**SIMD-0137**), Poseidon input length (**SIMD-0359**), BLS12-381 (**SIMD-0388**).
- **CPI.** Cross-program invocation is described in [docs: CPI](https://solana.com/docs/core/cpi); limits in Compute Budget.
- **Rent.** See Accounts.
- **Loaders.** BPF Loader v2 deployment disabled (**SIMD-0093**). Loader v3 `ExtendProgram` minimum 10,240 bytes (**SIMD-0431**).
