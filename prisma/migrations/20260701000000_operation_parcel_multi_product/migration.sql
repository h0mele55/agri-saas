-- A field operation may apply more than one product to a parcel: a spray
-- job now records a soil-nurturing fertilizer line AND a treatment product
-- line per parcel. Relax the one-line-per-parcel uniqueness to include the
-- product, so both lines can coexist under the same task + parcel.
DROP INDEX "OperationParcel_taskId_parcelId_key";
CREATE UNIQUE INDEX "OperationParcel_taskId_parcelId_productItemId_key" ON "OperationParcel"("taskId", "parcelId", "productItemId");
