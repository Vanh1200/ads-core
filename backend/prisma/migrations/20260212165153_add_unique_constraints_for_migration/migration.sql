/*
  Warnings:

  - A unique constraint covering the columns `[mcc_account_id]` on the table `account_batches` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[account_id,spending_date]` on the table `spending_records` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "account_batches_mcc_account_id_key" ON "account_batches"("mcc_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "spending_records_account_id_spending_date_key" ON "spending_records"("account_id", "spending_date");
