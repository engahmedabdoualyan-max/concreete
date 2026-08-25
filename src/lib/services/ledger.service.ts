/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Unified Ledger Service (bank accounts + ledger entries)
 * ============================================================
 *
 *  Ported from the RMC reference accounting model:
 *  • bank_accounts   — company bank accounts with running balances
 *  • ledger_entries  — every financial movement in one place
 *  • bank_transactions — deposit / withdrawal / transfer against an account
 *
 *  Balances are maintained here (single write path) so the account balance
 *  can never drift from the transaction history.
 * ============================================================
 */

import { db } from "@/db";
import { bankAccounts, ledgerEntries, bankTransactions } from "@/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const destinationAccount = alias(bankAccounts, "destination_account");

// ─── Types ────────────────────────────────────────────────────────────────────

export type LedgerEntryType =
  | "income"
  | "expense"
  | "transfer"
  | "purchase"
  | "sale"
  | "adjustment"
  | "operational";

export type BankTransactionType = "deposit" | "withdrawal" | "transfer";

export interface CreateLedgerEntryInput {
  date: Date;
  description: string;
  amountSar: number; // SAR cents
  transactionType: LedgerEntryType;
  referenceNumber?: string | null;
  bankAccountId?: string | null;
  counterpartyType?: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
}

export interface CreateBankAccountInput {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch?: string | null;
  initialBalanceSar?: number;
}

export interface BankTransactionInput {
  bankAccountId: string;
  transactionType: BankTransactionType;
  amountSar: number;
  date: Date;
  description: string;
  referenceNumber?: string | null;
  destinationAccountId?: string | null;
  createdById: string;
  /** Link back to the originating ledger entry */
  ledgerEntryId?: string | null;
}

/** Sign of a ledger type against the account balance: +1 credits, -1 debits. */
export function ledgerBalanceSign(type: LedgerEntryType): number {
  switch (type) {
    case "income":
    case "sale":
    case "adjustment":
      return +1;
    default:
      return -1; // expense, purchase, transfer, operational
  }
}

// ─── Bank Accounts ────────────────────────────────────────────────────────────

export async function listBankAccounts(tenantId: string) {
  return db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.tenantId, tenantId))
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.accountName));
}

export async function createBankAccount(
  tenantId: string,
  input: CreateBankAccountInput
) {
  const [account] = await db
    .insert(bankAccounts)
    .values({
      tenantId,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      bankName: input.bankName,
      branch: input.branch ?? null,
      initialBalanceSar: input.initialBalanceSar ?? 0,
      currentBalanceSar: input.initialBalanceSar ?? 0,
    })
    .returning();
  return account;
}

export async function getBankAccount(tenantId: string, accountId: string) {
  const rows = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Ledger entries ───────────────────────────────────────────────────────────

export async function listLedgerEntries(tenantId: string, limit = 100) {
  return db
    .select({
      id: ledgerEntries.id,
      date: ledgerEntries.date,
      description: ledgerEntries.description,
      amountSar: ledgerEntries.amountSar,
      transactionType: ledgerEntries.transactionType,
      referenceNumber: ledgerEntries.referenceNumber,
      bankAccountId: ledgerEntries.bankAccountId,
      counterpartyType: ledgerEntries.counterpartyType,
      counterpartyId: ledgerEntries.counterpartyId,
      counterpartyName: ledgerEntries.counterpartyName,
      createdById: ledgerEntries.createdById,
      createdAt: ledgerEntries.createdAt,
      bankAccountName: bankAccounts.accountName,
      bankName: bankAccounts.bankName,
    })
    .from(ledgerEntries)
    .leftJoin(bankAccounts, eq(ledgerEntries.bankAccountId, bankAccounts.id))
    .where(eq(ledgerEntries.tenantId, tenantId))
    .orderBy(desc(ledgerEntries.date), desc(ledgerEntries.createdAt))
    .limit(limit);
}

/**
 * Creates a ledger entry. If the entry references a bank account, the
 * account's running balance is updated atomically in the same operation.
 * Optionally also records a matching bank transaction.
 */
export async function createLedgerEntry(
  tenantId: string,
  createdById: string,
  input: CreateLedgerEntryInput,
  bankTx?: Omit<BankTransactionInput, "createdById">
): Promise<{ entry: any; transaction?: any }> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: input.date,
        description: input.description,
        amountSar: input.amountSar,
        transactionType: input.transactionType,
        referenceNumber: input.referenceNumber ?? null,
        bankAccountId: input.bankAccountId ?? null,
        counterpartyType: input.counterpartyType ?? null,
        counterpartyId: input.counterpartyId ?? null,
        counterpartyName: input.counterpartyName ?? null,
        createdById,
      })
      .returning();

    let transaction: any = undefined;

    if (input.bankAccountId) {
      const sign = ledgerBalanceSign(input.transactionType);
      await tx
        .update(bankAccounts)
        .set({
          currentBalanceSar: sql`current_balance_sar + ${sign * input.amountSar}`,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, input.bankAccountId));

      // A bank transfer credits the destination account too.
      if (bankTx?.transactionType === "transfer" && bankTx.destinationAccountId) {
        await tx
          .update(bankAccounts)
          .set({
            currentBalanceSar: sql`current_balance_sar + ${input.amountSar}`,
            updatedAt: new Date(),
          })
          .where(eq(bankAccounts.id, bankTx.destinationAccountId));
      }

      if (bankTx) {
        const [txRow] = await tx
          .insert(bankTransactions)
          .values({
            tenantId,
            bankAccountId: bankTx.bankAccountId,
            destinationAccountId: bankTx.destinationAccountId ?? null,
            transactionType: bankTx.transactionType,
            amountSar: bankTx.amountSar,
            date: bankTx.date,
            description: bankTx.description,
            referenceNumber: bankTx.referenceNumber ?? null,
            ledgerEntryId: entry.id,
            createdById,
          })
          .returning();
        transaction = txRow;
      }
    }

    return { entry, transaction };
  });
}

export async function listBankTransactions(
  tenantId: string,
  accountId?: string,
  limit = 100
) {
  const where = eq(bankTransactions.tenantId, tenantId);
  return db
    .select({
      id: bankTransactions.id,
      bankAccountId: bankTransactions.bankAccountId,
      destinationAccountId: bankTransactions.destinationAccountId,
      transactionType: bankTransactions.transactionType,
      amountSar: bankTransactions.amountSar,
      date: bankTransactions.date,
      description: bankTransactions.description,
      referenceNumber: bankTransactions.referenceNumber,
      ledgerEntryId: bankTransactions.ledgerEntryId,
      createdAt: bankTransactions.createdAt,
      bankAccountName: bankAccounts.accountName,
      bankName: bankAccounts.bankName,
      destinationAccountName: destinationAccount.accountName,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .leftJoin(
      destinationAccount,
      eq(bankTransactions.destinationAccountId, destinationAccount.id)
    )
    .where(accountId ? and(where, eq(bankTransactions.bankAccountId, accountId)) : where)
    .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt))
    .limit(limit);
}
