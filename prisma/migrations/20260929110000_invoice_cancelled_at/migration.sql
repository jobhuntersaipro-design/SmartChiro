-- When an issued invoice was cancelled; the accounting journal reverses it on
-- this date. Existing cancelled invoices stay null (the journal export shipped
-- in the same release, so none of them were ever exported).
ALTER TABLE "Invoice" ADD COLUMN "cancelledAt" TIMESTAMP(3);
